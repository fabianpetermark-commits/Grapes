// Test-only transport, not a replacement Home model, outbox or coordinator.
import {createHomeMobile} from '../../src/home/home-mobile.js'
import {createOneHomeTestSync} from '../../src/home/home-one-test-sync.js'
import {createEmptyFamilyHome,stageFamilyHomeCommand} from '../../src/home/home-family-data.js'
import {createHomeStore} from '../../src/home/home-store.js'
import {HOME_SUPABASE_TEST_REF} from '../../src/home/home-supabase-test-readonly.js'
export const A='00000000-0000-4000-8000-000000000001'
export const B='00000000-0000-4000-8000-000000000002'
export const H='00000000-0000-4000-8000-000000000009'
const clone=x=>structuredClone(x)
let data=JSON.parse(sessionStorage.getItem('qa-server')||'null')
if(!data){
  let remote=createEmptyFamilyHome(H,A)
  for(const [type,payload] of [
    ['ShoppingItemAdded',{name:'Közös tej',quantity:1,unit:'l'}],
    ['ShoppingItemAdded',{name:'Ismeretlen mennyiség'}],
    ['StockCountConfirmed',{name:'Közös liszt',quantity:2,unit:'kg',storageLocation:'pantry'}],
    ['StockCountConfirmed',{name:'Igazolt üres rizs',quantity:0,unit:'kg',storageLocation:'pantry'}],
  ]) remote=stageFamilyHomeCommand({state:remote,householdId:H,actorId:A,role:'owner',
    command:{type,eventId:crypto.randomUUID(),payload}}).candidate
  data={remote,attempts:{},calls:[],offline:false,actor:A,role:'owner',mode:'normal'}
  const store=createHomeStore(localStorage)
  store.dispatch({type:'ShoppingItemAdded',payload:{name:'Személyes cukor',quantity:1,unit:'db'}})
  store.dispatch({type:'ShoppingItemAdded',payload:{name:'Személyes só'}})
  for(const module of ['food','finance','health'])localStorage.setItem('qa-'+module,JSON.stringify({private:module}))
}
const save=()=>sessionStorage.setItem('qa-server',JSON.stringify(data))
save()
Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>!data.offline})
const barriers=new Map()
const blocked=new Set()
async function hold(name){
  if(!blocked.has(name))return
  await new Promise(resolve=>barriers.set(name,resolve))
  blocked.delete(name)
}
const client={
  supabaseUrl:`https://${HOME_SUPABASE_TEST_REF}.supabase.co`,
  auth:{async getUser(){
    data.calls.push({method:'auth.getUser',actor:data.actor});save()
    if(data.authFailure)return {data:{user:null},error:{message:'unverified'}}
    return {data:{user:{id:data.actor,is_anonymous:false}},error:null}
  }},
  schema(schema){
    if(schema!=='api')throw Error('Unexpected schema: '+schema)
    return {async rpc(method,args){
      if(data.offline)throw Error('Transport offline')
      const actor=data.actor
      data.calls.push({method,args:clone(args),actor});save()
      if(method==='home_m3b_read_household'){
        const response={householdId:H,role:data.role,revision:data.remote.revision,state:clone(data.remote)}
        await hold('read')
        return {data:response,error:null}
      }
      if(method==='home_m3b_compare_and_swap'){
        // Observe the real database at the transport boundary: local transaction must be complete.
        data.calls.at(-1).persistedJobs=await window.qa.disk();save()
        await hold('cas')
        if(data.role==='viewer')return {data:null,error:{message:'permission denied'}}
        // Simulate server CAS and idempotency; proposals always come from production staging.
        let attempt=data.attempts[args.p_operation_id]
        if(!attempt){
          const committed=args.p_expected_revision===data.remote.revision
          attempt={householdId:H,status:committed?'committed':'conflict',
            revision:committed?args.p_expected_revision+1:data.remote.revision,
            expectedRevision:args.p_expected_revision,candidate:clone(args.p_candidate)}
          data.attempts[args.p_operation_id]=attempt
          if(committed)data.remote=clone(args.p_candidate)
          save()
        }
        if(data.mode==='lost-response')throw Error('Response lost after server commit')
        return {data:{status:attempt.status,revision:attempt.revision},error:null}
      }
      if(method==='home_m3b_read_attempt'){
        await hold('proof')
        let proof=clone(data.attempts[args.p_operation_id]||null)
        if(data.mode==='missing-proof')proof=null
        if(data.mode==='incomplete-proof'&&proof)delete proof.expectedRevision
        if(data.mode==='forged-proof'&&proof)proof.candidate=clone(createEmptyFamilyHome(H,A))
        return {data:proof,error:null}
      }
      throw Error('Unexpected RPC: '+method)
    }}
  },
}
let ui,sync
function mount(owner=data.actor){
  ui?.invalidateFamilyPreview()
  const previous=document.querySelector('[data-household-root]')
  const root=document.createElement('main');root.setAttribute('data-household-root','');previous.replaceWith(root)
  sync=createOneHomeTestSync({client,expectedUserId:owner,getActiveOwner:async()=>data.actor,
    testGateEnabled:true,testCasWritesEnabled:true})
  ui=createHomeMobile(root,localStorage,{familySync:{enabled:true,writesEnabled:true,
    householdId:H,expectedUserId:owner,getActiveOwner:async()=>data.actor,sync}})
  ui.load()
}
window.qa={
  A,B,H,mount,
  get sync(){return sync},
  get data(){return clone(data)},
  set(patch){Object.assign(data,patch);save()},
  block(name){blocked.add(name)},
  release(name){barriers.get(name)?.();barriers.delete(name)},
  waiting(name){return barriers.has(name)},
  online(){data.offline=false;save();window.dispatchEvent(new Event('online'))},
  foreground(){Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'))},
  advance(){data.remote=stageFamilyHomeCommand({state:data.remote,householdId:H,actorId:B,role:'editor',
    command:{type:'ShoppingItemAdded',eventId:crypto.randomUUID(),payload:{name:'B párhuzamos vásárlása'}}}).candidate;save()},
  async jobs(){return sync.pending(H)},
  async disk(){return new Promise((resolve,reject)=>{
    const req=indexedDB.open('grapes-test-one-home-family-outbox-v2',1)
    req.onerror=()=>reject(req.error)
    req.onsuccess=()=>{const db=req.result;const tx=db.transaction('jobs');const get=tx.objectStore('jobs').getAll();
      get.onsuccess=()=>resolve(get.result);tx.oncomplete=()=>db.close()}
  })},
  storage(){return Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))},
}
window.qaReady=true
