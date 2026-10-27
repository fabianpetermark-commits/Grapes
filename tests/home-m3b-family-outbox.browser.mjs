import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const chrome=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&existsSync(p))
if(!chrome)throw Error('Chromium required for M3B owner offline test')
const url='http://127.0.0.1:4198/Grapes/tests/fixtures/grapes-test-outbox.html'
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),
  '--host','127.0.0.1','--port','4198','--strictPort'],{cwd:root,stdio:'ignore'})
const A='00000000-0000-4000-8000-000000000001'
const B='00000000-0000-4000-8000-000000000002'
const H='00000000-0000-4000-8000-000000000009'
const ONE='00000000-0000-4000-8000-000000000011'
const TWO='00000000-0000-4000-8000-000000000012'
let browser
try {
  for(let i=0;i<100;i++){
    if(server.exitCode!==null)throw Error('Vite exited')
    try{if((await fetch(url)).ok)break}catch{}
    if(i===99)throw Error('Vite unavailable')
    await new Promise(done=>setTimeout(done,100))
  }
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
  const ctx=await browser.newContext()
  const tab=await ctx.newPage(),other=await ctx.newPage()
  await Promise.all([tab.goto(url),other.goto(url)])
  const init=await tab.evaluate(async ({A,H,ONE})=>{
    const {createEmptyFamilyHome}=await import('/Grapes/src/home/home-family-data.js')
    const {createHomeFamilyOutbox}=await import('/Grapes/src/home/home-family-outbox.js')
    const {stageFamilyHomeCommand}=await import('/Grapes/src/home/home-family-data.js')
    const base=createEmptyFamilyHome(H,A)
    const gateway={
      verify:async()=>A,
      read:async()=>({householdId:H,role:'owner',revision:0,state:base}),
      stage:({current,command})=>stageFamilyHomeCommand({
        state:current.state,householdId:H,actorId:A,role:current.role,command}),
      compareAndSwap:async()=>{throw Error('offline')},
      readAttempt:async()=>null,
    }
    const q=createHomeFamilyOutbox({ownerId:A,getActiveOwner:async()=>A,gateway})
    const saved=await q.refresh(H)
    const command={type:'ShoppingItemAdded',eventId:ONE,
      payload:{name:'Közös kenyér',quantity:1,unit:'db'}}
    const queued=await q.enqueue(H,command)
    let offline=true,secondDenied=false
    try{await q.retry(H)}catch{offline=true}
    try{await q.enqueue(H,{...command,eventId:'00000000-0000-4000-8000-000000000099'})}
    catch{secondDenied=true}
    return {baseRevision:saved.revision,job:queued.operationId,
      jobs:(await q.list(H)).map(x=>x.status),offline,secondDenied,
      cached:(await q.cached(H)).state.shopping.length}
  },{A,H,ONE})
  assert.deepEqual(init,{baseRevision:0,job:ONE,jobs:['pending'],
    offline:true,secondDenied:true,cached:0})
  console.log('PASS: own verified shared Home snapshot, durable offline proposal, no speculative second write')
  await tab.reload()
  const persisted=await tab.evaluate(async ({A,H,ONE})=>{
    const {createHomeFamilyOutbox}=await import('/Grapes/src/home/home-family-outbox.js')
    const {stageFamilyHomeCommand}=await import('/Grapes/src/home/home-family-data.js')
    const gateway={verify:async()=>A,
      read:async()=>{throw Error('offline')},
      stage:({current,command})=>stageFamilyHomeCommand({
        state:current.state,householdId:H,actorId:A,role:current.role,command}),
      compareAndSwap:async()=>({committed:true,revision:1}),
      readAttempt:async()=>({householdId:H,status:'committed',revision:1,
        expectedRevision:0,candidate:{stale:true}})}
    const q=createHomeFamilyOutbox({ownerId:A,getActiveOwner:async()=>A,gateway})
    const jobs=await q.list(H)
    let forgedProofDenied=false
    try{await q.retry(H)}catch{forgedProofDenied=true}
    return {operationId:jobs[0].operationId,status:(await q.list(H))[0].status,
      forgedProofDenied,localCached:(await q.cached(H)).revision}
  },{A,H,ONE})
  assert.deepEqual(persisted,{operationId:ONE,status:'pending',forgedProofDenied:true,localCached:0})
  const otherList=await other.evaluate(async ({B,H})=>{
    const {createHomeFamilyOutbox}=await import('/Grapes/src/home/home-family-outbox.js')
    const stub={verify:async()=>B,read:async()=>{},stage:()=>{},
      compareAndSwap:async()=>{},readAttempt:async()=>{}}
    const b=createHomeFamilyOutbox({ownerId:B,getActiveOwner:async()=>B,gateway:stub})
    return {list:await b.list(H),cache:await b.cached(H)}
  },{B,H})
  assert.deepEqual(otherList,{list:[],cache:null})
  const results=await tab.evaluate(async ({A,B,H,TWO})=>{
    const {createHomeFamilyOutbox}=await import('/Grapes/src/home/home-family-outbox.js')
    const {stageFamilyHomeCommand}=await import('/Grapes/src/home/home-family-data.js')
    let active=A,remote=null
    const gateway={
      verify:async()=>{if(active!==A)throw Error('account switched');return A},
      read:async()=>remote,
      stage:({current,command})=>stageFamilyHomeCommand({
        state:current.state,householdId:H,actorId:A,role:current.role,command}),
      compareAndSwap:async(s)=>{const status=s.operationId===TWO?'conflict':'committed'
        const revision=status==='conflict'?3:1
        gateway.attempt={householdId:H,status,revision,
          expectedRevision:s.expectedRevision,candidate:s.candidate}
        return {committed:status==='committed',revision}
      },
      readAttempt:async()=>gateway.attempt,
    }
    const q=createHomeFamilyOutbox({ownerId:A,getActiveOwner:async()=>active,gateway})
    const settled=await q.retry(H)
    const afterFirst=await q.list(H)
    const verified=afterFirst[0].candidate
    remote={householdId:H,revision:1,role:'owner',state:verified}
    await q.refresh(H)
    const next=await q.enqueue(H,{type:'ShoppingItemAdded',eventId:TWO,
      payload:{name:'Közös tojás',quantity:6,unit:'db'}})
    const conflict=await q.retry(H)
    const local=await q.list(H)
    active=B
    let switched=false
    try{await q.list(H)}catch{switched=true}
    try{await q.retry(H)}catch{switched=true}
    return {committed:settled.status,serverRevision:settled.serverRevision,
      conflict:conflict.status,secondRevision:next.expectedRevision,
      conflictRetained:local.some(x=>x.operationId===TWO&&x.status==='conflict'&&
        x.candidate.shopping.some(row=>row.name==='Közös tojás')),
      switched}
  },{A,B,H,TWO})
  assert.deepEqual(results,{committed:'committed',serverRevision:1,conflict:'conflict',
    secondRevision:1,conflictRetained:true,switched:true})
  console.log('PASS: offline survives reload, false server proof denied, immutable replay proven, conflict preserved and B isolation')
}finally{
  await browser?.close()
  server.kill('SIGTERM')
}
