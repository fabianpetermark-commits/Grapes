// Ephemeral local Supabase only. Refuse hosted DB endpoints.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

const cwd=process.env.GRAPES_SUPABASE_LOCAL_DIR
assert.ok(cwd)
const lines=execFileSync('supabase',['status','-o','env'],{cwd,encoding:'utf8'})
const env=Object.fromEntries(lines.split('\n').flatMap(line=>{
  const found=line.match(/^([A-Z_]+)=(.*)$/)
  return found?[[found[1],found[2].replace(/^["']|["']$/g,'')]]:[]
}))
const {API_URL:api,DB_URL:db,ANON_KEY:anon,SERVICE_ROLE_KEY:service}=env
for(const u of [api,db])assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(u).hostname))
const psql=s=>execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-d',db,'-c',s],{encoding:'utf8'})
execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-d',db,'-f',
  resolve(import.meta.dirname,'../schema-proposal.sql')],{stdio:'inherit'})
psql("notify pgrst, 'reload schema'")
const apiCall=async(path,key,token,body={},family=false)=>{
  const response=await fetch(api+path,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+(token||key),
    'Content-Type':'application/json',...(family?{'Content-Profile':'api','Accept-Profile':'api'}:{})},
    body:JSON.stringify(body)})
  return {status:response.status,data:await response.json().catch(()=>({}))}
}
const password='Synthetic-Test-123!'+randomUUID().slice(0,8)
const suffix=randomUUID().slice(0,6)
async function person(letter){
  const email='grapes-home-m3b-'+letter+'-'+suffix+'@example.invalid'
  const created=await apiCall('/auth/v1/admin/users',service,service,{email,password,email_confirm:true})
  assert.ok([200,201].includes(created.status),JSON.stringify(created))
  const login=await apiCall('/auth/v1/token?grant_type=password',anon,anon,{email,password})
  assert.equal(login.status,200,JSON.stringify(login))
  return {id:created.data.id,token:login.data.access_token}
}
const A=await person('a'),B=await person('b'),C=await person('c')
const rpc=(person,name,args={})=>apiCall('/rest/v1/rpc/'+name,anon,person?.token,args,true)
for(let i=0;i<40;i++){
  const found=await rpc(A,'home_list_households')
  if(found.status===200)break
  if(i===39)throw Error('PostgREST local schema not ready: '+JSON.stringify(found))
  await new Promise(resolve=>setTimeout(resolve,150))
}
const created=await rpc(A,'home_create_household',{p_title:'Családi Home próba'})
assert.equal(created.status,200,JSON.stringify(created))
const house=created.data.householdId
assert.ok(house)
assert.equal((await rpc(A,'home_list_households')).data.length,1)
assert.equal((await rpc(B,'home_list_households')).data.length,0)
assert.ok([401,403].includes((await rpc(B,'home_read_household',{p_household:house})).status))
assert.ok([401,403].includes((await rpc(null,'home_list_households')).status))
console.log('PASS: owner creates separate family; B and anonymous cannot read')

const invite=await rpc(A,'home_invite_member',{p_household:house,p_invitee:B.id,p_role:'editor'})
assert.equal(invite.status,200,JSON.stringify(invite))
assert.equal((await rpc(B,'home_list_my_invites')).data.length,1)
assert.equal((await rpc(C,'home_list_my_invites')).data.length,0)
assert.ok([401,403].includes((await rpc(C,'home_respond_invite',{p_invite:invite.data,p_accept:true})).status))
assert.ok([401,403].includes((await rpc(B,'home_read_household',{p_household:house})).status))
const joined=await rpc(B,'home_respond_invite',{p_invite:invite.data,p_accept:true})
assert.equal(joined.status,200,JSON.stringify(joined))
assert.equal(joined.data.status,'accepted')
assert.equal((await rpc(B,'home_read_household',{p_household:house})).data.role,'editor')
assert.ok([401,403].includes((await rpc(B,'home_invite_member',
  {p_household:house,p_invitee:C.id,p_role:'editor'})).status))
assert.ok([401,403].includes((await rpc(B,'home_respond_invite',
  {p_invite:invite.data,p_accept:true})).status))
console.log('PASS: explicit recipient acceptance, no invite replay or editor invites')

const candidate=(revision,value)=>({householdId:house,revision,
  schemaVersion:2,inventory:[value],shopping:[],prepared:[],events:[]})
const op=(id,expected,value)=>({p_household:house,p_operation:id,p_expected:expected,
  p_candidate:candidate(expected+1,value)})
const bId=randomUUID(),aId=randomUUID()
const bSave=await rpc(B,'home_compare_and_swap',op(bId,0,{name:'B'}))
assert.equal(bSave.status,200,JSON.stringify(bSave))
assert.equal(bSave.data.status,'committed')
const aStale=await rpc(A,'home_compare_and_swap',op(aId,0,{name:'A old'}))
assert.equal(aStale.status,200,JSON.stringify(aStale))
assert.equal(aStale.data.status,'conflict')
assert.deepEqual(await rpc(B,'home_compare_and_swap',op(bId,0,{name:'B'})),bSave)
assert.ok((await rpc(B,'home_compare_and_swap',op(bId,0,{name:'changed'}))).status>=400)
const recovery=await rpc(A,'home_read_own_attempt',{p_household:house,p_operation:aId})
assert.equal(recovery.data.candidate.inventory[0].name,'A old')
assert.equal((await rpc(B,'home_read_own_attempt',
  {p_household:house,p_operation:aId})).data,null)
const head=await rpc(A,'home_read_household',{p_household:house})
assert.equal(head.data.revision,1)
assert.equal(head.data.snapshot.inventory[0].name,'B')
assert.ok((await rpc(A,'home_compare_and_swap',{
  p_household:house,p_operation:randomUUID(),p_expected:1,
  p_candidate:{householdId:A.id,revision:2,inventory:[],events:[]}})).status>=400)
console.log('PASS: A/B concurrent CAS, idempotent retry, conflict recovery and no personal data copying')

const inviteView=await rpc(A,'home_invite_member',{p_household:house,p_invitee:C.id,p_role:'viewer'})
assert.equal(inviteView.status,200)
assert.equal((await rpc(C,'home_respond_invite',{p_invite:inviteView.data,p_accept:true})).status,200)
assert.equal((await rpc(C,'home_read_household',{p_household:house})).data.role,'viewer')
assert.ok([401,403].includes((await rpc(C,'home_compare_and_swap',
  op(randomUUID(),1,{name:'viewer'}))).status))
assert.ok([401,403].includes((await rpc(B,'home_remove_member',
  {p_household:house,p_member:C.id})).status))
assert.equal((await rpc(A,'home_remove_member',{p_household:house,p_member:B.id})).status,200)
assert.ok([401,403].includes((await rpc(B,'home_read_household',{p_household:house})).status))
assert.ok([401,403].includes((await rpc(B,'home_compare_and_swap',op(bId,0,{name:'B'}))).status))
assert.ok([401,403].includes((await rpc(A,'home_remove_member',
  {p_household:house,p_member:A.id})).status))
console.log('PASS: viewer cannot write, owner can revoke, removed member cannot retry')

psql("do $$ begin if not (select bool_and(relrowsecurity) from pg_class where oid in ("+
  "'grapes_family_private.households'::regclass,'grapes_family_private.members'::regclass,"+
  "'grapes_family_private.invitations'::regclass,'grapes_family_private.attempts'::regclass,"+
  "'grapes_family_private.revisions'::regclass)) or "+
  "has_table_privilege('authenticated','grapes_family_private.households','SELECT') or "+
  "has_table_privilege('authenticated','grapes_family_private.members','SELECT') or "+
  "has_function_privilege('anon','api.home_compare_and_swap(uuid,uuid,bigint,jsonb)','EXECUTE') or "+
  "has_function_privilege('authenticated','grapes_family_private.role_for(uuid,uuid)','EXECUTE') "+
  "then raise exception 'Unsafe family grants'; end if; end $$;")
console.log('PASS: RLS on all private tables, only authenticated RPC grants')
