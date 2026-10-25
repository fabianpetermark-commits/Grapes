// Ephemeral localhost-only real Supabase Auth + PostgREST integration checks.
// Never connects to hosted TEST/PROD or real user accounts.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {resolve} from 'node:path'
import {createEmptyFamilyHome,stageFamilyHomeCommand} from '../../../src/home/home-family-data.js'

const cwd=process.env.GRAPES_SUPABASE_LOCAL_DIR
assert.ok(cwd,'Missing isolated Supabase local directory')
const workspace=resolve(import.meta.dirname,'../../..')
const status=execFileSync('supabase',['status','-o','env'],{cwd,encoding:'utf8'})
const settings=Object.fromEntries(status.split('\n').map(line=>{
  const m=line.match(/^([A-Z_]+)=(.*)$/)
  return m?[m[1],m[2].replace(/^['"]|['"]$/g,'')]:null
}).filter(Boolean))
const {API_URL:apiUrl,DB_URL:dbUrl,ANON_KEY:anon, SERVICE_ROLE_KEY:service}=settings
assert.ok([apiUrl,dbUrl,anon,service].every(Boolean))
for(const u of [apiUrl,dbUrl])assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(u).hostname),
  'Refusing nonlocal database or API')
const psql=(args)=>execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-d',dbUrl,...args],
  {encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()
async function call(path,key,token,body,schema){
  const r=await fetch(apiUrl+path,{method:'POST',headers:{
    apikey:key,Authorization:'Bearer '+(token||key),'Content-Type':'application/json',
    ...(schema?{'Content-Profile':schema,'Accept-Profile':schema}:{})
  },body:JSON.stringify(body)})
  const data=await r.json().catch(()=>null)
  return {status:r.status,data}
}
async function rpc(identity,name,args) {
  for(let i=0;i<40;i++) {
    const response=await call('/rest/v1/rpc/'+name,anon,identity?.token,args,'api')
    if(response.data?.code!=='PGRST202')return response
    // PostgREST schema cache may briefly lag SQL creation on a fresh stack.
    if(i===39)throw Error('PostgREST RPC missing: '+name)
    await new Promise(done=>setTimeout(done,150))
  }
}
async function who(name) {
  const email='grapes-m3b-'+name+'-'+randomUUID().slice(0,8)+'@example.invalid'
  const password='Synthetic-'+randomUUID()+'-A1!'
  const created=await call('/auth/v1/admin/users',service,service,
    {email,password,email_confirm:true})
  assert.ok([200,201].includes(created.status),JSON.stringify(created))
  const login=await call('/auth/v1/token?grant_type=password',anon,anon,{email,password})
  assert.equal(login.status,200,JSON.stringify(login))
  const identity=await fetch(apiUrl+'/auth/v1/user',{headers:{apikey:anon,
    Authorization:'Bearer '+login.data.access_token}})
  assert.equal(identity.status,200)
  assert.equal((await identity.json()).id,created.data.id)
  return {id:created.data.id,token:login.data.access_token}
}
const a=await who('a'),b=await who('b'),c=await who('c')
console.log('PASS: three real local Supabase Auth JWT users')
psql(['-f',resolve(workspace,'poc/home-m3b/schema-proposal.sql')])
psql(['-qAt','-c',"notify pgrst, 'reload schema'"])
for(let i=0;i<40;i++) {
  const probe=await rpc(a,'home_m3b_list_households',{})
  if(probe.data?.code!=='PGRST202')break
  if(i===39)throw Error('PostgREST schema cache did not expose M3B API')
  await new Promise(ok=>setTimeout(ok,150))
}
const made=await rpc(a,'home_m3b_create_household',{p_name:'Grapes CI család'})
assert.equal(made.status,200,JSON.stringify(made))
assert.equal(made.data.role,'owner')
assert.equal(made.data.revision,0)
const h=made.data.householdId
assert.match(h,/^[0-9a-f-]{36}$/)
const own=await rpc(a,'home_m3b_list_households',{})
assert.equal(own.status,200,JSON.stringify(own))
assert.equal(own.data.length,1)
assert.equal(own.data[0].householdId,h)
const foreign=await rpc(b,'home_m3b_read_household',{p_household_id:h})
assert.ok([401,403].includes(foreign.status),JSON.stringify(foreign))
const noInvite=await rpc(b,'home_m3b_create_invite',
  {p_household_id:h,p_role:'editor',p_hours:24})
assert.ok([401,403].includes(noInvite.status),JSON.stringify(noInvite))
console.log('PASS: unrelated account cannot read or invite to the household')

const viewerInvite=await rpc(a,'home_m3b_create_invite',
  {p_household_id:h,p_role:'viewer',p_hours:24})
assert.equal(viewerInvite.status,200,JSON.stringify(viewerInvite))
assert.match(viewerInvite.data.inviteCode,/^[0-9a-f]{64}$/)
const joining=await rpc(b,'home_m3b_accept_invite',{p_code:viewerInvite.data.inviteCode})
assert.equal(joining.status,200,JSON.stringify(joining))
assert.equal(joining.data.role,'viewer')
const reuse=await rpc(c,'home_m3b_accept_invite',{p_code:viewerInvite.data.inviteCode})
assert.ok([401,403].includes(reuse.status),JSON.stringify(reuse))
const viewerState=await rpc(b,'home_m3b_read_household',{p_household_id:h})
assert.equal(viewerState.status,200,JSON.stringify(viewerState))
assert.equal(viewerState.data.role,'viewer')

const editorInvite=await rpc(a,'home_m3b_create_invite',
  {p_household_id:h,p_role:'editor',p_hours:48})
assert.equal(editorInvite.status,200,JSON.stringify(editorInvite))
assert.equal((await rpc(c,'home_m3b_accept_invite',
  {p_code:editorInvite.data.inviteCode})).data.role,'editor')
const editorCannotInvite=await rpc(c,'home_m3b_create_invite',
  {p_household_id:h,p_role:'editor',p_hours:1})
assert.ok([401,403].includes(editorCannotInvite.status))
console.log('PASS: one-use cryptographic invites and owner/editor/viewer permissions')
const base=createEmptyFamilyHome(h,a.id)
const stage=(actor,state,operation,product)=>stageFamilyHomeCommand({
  state,householdId:h,actorId:actor.id,role:actor===a?'owner':'editor',
  command:{type:'ShoppingItemAdded',eventId:operation,payload:{name:product,quantity:1,unit:'db'}},
})
const aOp=randomUUID(), cOp=randomUUID()
const aWrite=stage(a,base,aOp,'Alma')
const cWrite=stage(c,base,cOp,'Kenyér')
const args=staged=>({p_household_id:h,p_operation_id:staged.operationId,
  p_expected_revision:staged.expectedRevision,p_candidate:staged.candidate})
const viewerDenied=await rpc(b,'home_m3b_compare_and_swap',args(aWrite))
assert.ok([401,403].includes(viewerDenied.status),JSON.stringify(viewerDenied))
const first=await rpc(a,'home_m3b_compare_and_swap',args(aWrite))
assert.equal(first.status,200,JSON.stringify(first))
assert.deepEqual(first.data,{status:'committed',revision:1})
const replay=await rpc(a,'home_m3b_compare_and_swap',args(aWrite))
assert.deepEqual(replay,first)
const conflict=await rpc(c,'home_m3b_compare_and_swap',args(cWrite))
assert.deepEqual(conflict.data,{status:'conflict',revision:1})
const conflictReplay=await rpc(c,'home_m3b_compare_and_swap',args(cWrite))
assert.deepEqual(conflictReplay,conflict)
const ownAttempt=await rpc(c,'home_m3b_read_attempt',{p_operation_id:cOp})
assert.equal(ownAttempt.status,200)
assert.deepEqual(ownAttempt.data.candidate,cWrite.candidate)
const foreignAttempt=await rpc(b,'home_m3b_read_attempt',{p_operation_id:cOp})
assert.equal(foreignAttempt.status,200)
assert.equal(foreignAttempt.data,null)
const mismatchedRetry=await rpc(c,'home_m3b_compare_and_swap',{...args(cWrite),
  p_expected_revision:1})
assert.ok([400,409].includes(mismatchedRetry.status),JSON.stringify(mismatchedRetry))
console.log('PASS: real two-client CAS, durable rejected candidate and idempotent lost-response retry')

const fresh=await rpc(c,'home_m3b_read_household',{p_household_id:h})
assert.equal(fresh.data.state.shopping.length,1)
assert.equal(fresh.data.state.shopping[0].name,'Alma')
const newOp=randomUUID()
const explicit=stage(c,fresh.data.state,newOp,'Kenyér')
const writeTwo=await rpc(c,'home_m3b_compare_and_swap',args(explicit))
assert.equal(writeTwo.data.status,'committed',JSON.stringify(writeTwo))
assert.equal(writeTwo.data.revision,2)
const after=await rpc(a,'home_m3b_read_household',{p_household_id:h})
assert.equal(after.data.state.shopping.length,2)
assert.equal(after.data.state.events.length,2)
assert.equal(after.data.state.events[1].actorId,c.id)
const tampered={...explicit.candidate,shopping:[]}
const forgery=await rpc(c,'home_m3b_compare_and_swap',{
  ...args(explicit),p_operation_id:randomUUID(),
  p_expected_revision:2,p_candidate:tampered})
assert.ok([400,409].includes(forgery.status),JSON.stringify(forgery))
console.log('PASS: explicit conflict review, append-only event history and snapshot replay')

const removed=await rpc(a,'home_m3b_remove_member',{p_household_id:h,p_user_id:c.id})
assert.equal(removed.status,200,JSON.stringify(removed))
assert.equal(removed.data,true)
const former=await rpc(c,'home_m3b_read_household',{p_household_id:h})
assert.ok([401,403].includes(former.status))
const afterRevoke=await rpc(c,'home_m3b_compare_and_swap',args(explicit))
assert.ok([401,403].includes(afterRevoke.status))
const ownerLeave=await rpc(a,'home_m3b_leave_household',{p_household_id:h})
assert.ok([401,403].includes(ownerLeave.status))
const memberLeave=await rpc(b,'home_m3b_leave_household',{p_household_id:h})
assert.equal(memberLeave.status,200)
assert.equal(memberLeave.data,true)
const afterLeave=await rpc(b,'home_m3b_read_household',{p_household_id:h})
assert.ok([401,403].includes(afterLeave.status))
const anonymous=await rpc(null,'home_m3b_list_households',{})
assert.ok([401,403].includes(anonymous.status))
console.log('PASS: membership revocation, leave, owner lockout protection and anon rejection')
