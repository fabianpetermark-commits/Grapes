import test from 'node:test'
import assert from 'node:assert/strict'
import { createHomeFamilyAutoSync } from '../src/home/home-family-auto-sync.js'
import { createEmptyFamilyHome, stageFamilyHomeCommand } from '../src/home/home-family-data.js'

const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const H='00000000-0000-4000-8000-000000000009'
const ONE='00000000-0000-4000-8000-000000000011'
const TWO='00000000-0000-4000-8000-000000000012'
const wait = async fn => {
  for (let i=0;i<80;i++) {
    if (fn()) return
    await new Promise(resolve=>setTimeout(resolve,10))
  }
  assert.fail('Home sync state not reached')
}
function emitter() {
  const events = new Map()
  return {
    visibilityState:'visible',
    addEventListener(name,fn){events.set(name,fn)},
    removeEventListener(name,fn){if(events.get(name)===fn)events.delete(name)},
    emit(name){events.get(name)?.()},
    size(){return events.size},
  }
}
function rig({offline=false,conflict=false,role='owner'}={}){
  let online=!offline, owner=A
  let remote=createEmptyFamilyHome(H,A)
  let cached={ownerId:A,householdId:H,role,revision:0,state:remote}
  let jobs=[]
  let writes=0, refreshes=0
  const sync={
    ownerId:A,
    async pending(){return structuredClone(jobs)},
    async cached(){return structuredClone(cached)},
    async refresh(){
      refreshes++
      cached={ownerId:A,householdId:H,role,revision:remote.revision,state:remote}
      return structuredClone(cached)
    },
    async queue(id,command){
      const stage=stageFamilyHomeCommand({householdId:id,actorId:A,role,
        state:cached.state,command})
      const job={ownerId:A,householdId:H,status:'pending',operationId:stage.operationId,
        candidate:stage.candidate,expectedRevision:stage.expectedRevision}
      if(jobs.some(x=>x.status!=='committed'))throw Error('One outstanding operation only')
      jobs.push(job)
      return structuredClone(job)
    },
    async retry(){
      writes++
      const pending=jobs.find(x=>x.status==='pending')
      if(!pending)return null
      if(conflict){
        pending.status='conflict'
        return {status:'conflict',serverRevision:remote.revision}
      }
      remote=structuredClone(pending.candidate)
      pending.status='committed'
      return {status:'committed',serverRevision:remote.revision}
    },
  }
  const net=emitter(),doc=emitter(),events=[]
  const controller=createHomeFamilyAutoSync({sync,householdId:H,
    expectedUserId:A,getActiveOwner:async()=>owner,
    eventTarget:net,documentTarget:doc,isOnline:()=>online,
    onChange:s=>events.push(s)})
  return {sync,controller,events,net,doc,
    state:()=>events.at(-1),setOnline:x=>{online=x},setOwner:x=>{owner=x},
    writes:()=>writes,refreshes:()=>refreshes}
}
test('verified cached Home stays usable offline, durable queue retries on reconnect with same operation',async()=>{
  const r=rig({offline:true})
  r.controller.start()
  await wait(()=>r.state()?.status==='offline')
  assert.equal(r.state().snapshot.inventory.length,0)
  await r.controller.queue({type:'ShoppingItemAdded',eventId:ONE,
    payload:{name:'Kenyér',quantity:1,unit:'db'}})
  assert.equal(r.state().status,'pending')
  assert.equal(r.state().snapshot.shopping.length,1)
  assert.equal(r.state().snapshot.inventory.length,0)
  assert.equal(r.writes(),0,'Offline must never send CAS')
  r.setOnline(true);r.net.emit('online')
  await wait(()=>r.state()?.status==='synced')
  assert.equal(r.writes(),1)
  assert.equal(r.state().snapshot.shopping[0].name,'Kenyér')
  r.net.emit('online')
  await wait(()=>r.refreshes()>=2)
  assert.equal(r.writes(),1,'Previously committed operation must never replay')
  r.controller.dispose()
  assert.equal(r.net.size(),0)
  assert.equal(r.doc.size(),0)
})
test('conflict is retained without silent overwrite or automatic repeated CAS',async()=>{
  const r=rig({offline:true,conflict:true})
  r.controller.start()
  await wait(()=>r.state()?.status==='offline')
  await r.controller.queue({type:'ShoppingItemAdded',eventId:TWO,
    payload:{name:'Tej',quantity:2,unit:'l'}})
  r.setOnline(true);r.net.emit('online')
  await wait(()=>r.state()?.status==='conflict')
  assert.equal(r.state().snapshot,null)
  assert.match(r.state().message,/egyeztetés/)
  assert.equal(r.writes(),1)
  r.net.emit('online');r.doc.emit('visibilitychange')
  await new Promise(resolve=>setTimeout(resolve,20))
  assert.equal(r.writes(),1,'Conflicts must not be retried or rebased')
  r.controller.dispose()
})
test('A to B switch hides family data and rejects stale requests',async()=>{
  const r=rig()
  r.controller.start()
  await wait(()=>r.state()?.status==='synced')
  r.setOwner(B)
  r.net.emit('online')
  await wait(()=>r.state()?.status==='unverified')
  assert.equal(r.state().snapshot,null)
  await assert.rejects(r.controller.queue({type:'ShoppingItemAdded',eventId:ONE}),/függő|Fiókváltás/)
  assert.equal(r.writes(),0)
  r.controller.dispose()
})
test('a viewer cannot queue shared Home mutations',async()=>{
  const r=rig({role:'viewer'})
  r.controller.start()
  await wait(()=>r.state()?.status==='synced')
  await assert.rejects(r.controller.queue({type:'ShoppingItemAdded',eventId:ONE}),/függő/)
  assert.equal(r.writes(),0)
  r.controller.dispose()
})
test('invalid owner pin, household id and missing CAS capability fail closed',()=>{
  const fake={ownerId:A,pending(){},cached(){},refresh(){},queue(){},retry(){}}
  assert.throws(()=>createHomeFamilyAutoSync({sync:fake,householdId:'not-uuid',expectedUserId:A,
    getActiveOwner:async()=>A,onChange:()=>{}}),/fiókhoz/)
  assert.throws(()=>createHomeFamilyAutoSync({sync:{...fake,ownerId:B},householdId:H,
    expectedUserId:A,getActiveOwner:async()=>A,onChange:()=>{}}),/fiókhoz/)
})
