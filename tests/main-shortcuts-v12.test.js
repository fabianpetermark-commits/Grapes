import test from 'node:test'
import assert from 'node:assert/strict'
import { MAIN_SHORTCUTS,createMainShortcutStore } from '../src/main-shortcuts-v12.js'

function storage(){
  const data=new Map()
  return {getItem:key=>data.get(key)||null,setItem:(key,v)=>data.set(key,v),data}
}
test('Approved startup only routes to existing real Grapes module destinations',()=>{
  const expected=['outdoor','food','water','recipes','stats','shopping','inventory','finance','ebook','qr','projects','sync']
  assert.deepEqual(MAIN_SHORTCUTS.map(m=>m.id),expected)
  assert.ok(MAIN_SHORTCUTS.every(m=>typeof m.label==='string'&&m.label.length>0))
  assert.equal(MAIN_SHORTCUTS.some(m=>['plants','weather'].includes(m.id)),false,
    'Standalone placeholders must never appear as functioning shortcuts')
})
test('Default start page pins Food, Water and Outdoor; manual picks persist across reloads',()=>{
  const mem=storage()
  const a=createMainShortcutStore(mem)
  assert.deepEqual(a.list().pinned.map(m=>m.id),['food','water','outdoor'])
  assert.equal(a.pin('shopping'),true)
  assert.equal(a.pin('shopping'),false)
  assert.deepEqual(createMainShortcutStore(mem).list().pinned.map(m=>m.id),
    ['food','water','outdoor','shopping'])
  assert.equal(a.unpin('food'),true)
  assert.equal(a.unpin('food'),false)
  assert.deepEqual(createMainShortcutStore(mem).list().pinned.map(m=>m.id),
    ['water','outdoor','shopping'])
})
test('Actual opens (not synthetic samples) drive additional usage recommendation',()=>{
  const mem=storage(),a=createMainShortcutStore(mem)
  assert.deepEqual(a.list().recommended,[])
  a.visit('ebook');a.visit('ebook');a.visit('finance')
  assert.deepEqual(a.list().recommended.map(m=>m.id),['ebook','finance'])
  const resumed=createMainShortcutStore(mem)
  assert.deepEqual(resumed.list().recommended.map(m=>m.id),['ebook','finance'])
  assert.equal(resumed.has('plants'),false)
  assert.equal(resumed.get('unknown'),null)
  assert.throws(()=>resumed.pin('plants'),/Ismeretlen/)
})
test('Corrupt/untrusted preference and unsafe counts cannot introduce foreign module IDs',()=>{
  const mem=storage()
  mem.setItem('grapes-main-shortcuts-v12',JSON.stringify({version:1,
    pinned:['food','__proto__','food','qr',17],
    usage:{food:-3,qr:9,unknown:10000,water:'NaN',finance:1.5}}))
  const a=createMainShortcutStore(mem)
  assert.deepEqual(a.list().pinned.map(x=>x.id),['food','qr','outdoor'])
  assert.equal(a.list().recommended.length,0)
  a.visit('water')
  assert.deepEqual(a.list().recommended.map(x=>x.id),['water'])
})
test('Storage permission denial never crashes the navigation or silently loses in-memory pins',()=>{
  const denied={
    getItem(){throw Error('denied')},
    setItem(){throw Error('denied')},
  }
  const nav=createMainShortcutStore(denied)
  assert.equal(nav.pin('shopping'),true)
  assert.deepEqual(nav.list().pinned.map(m=>m.id),['food','water','outdoor','shopping'])
})

test('Navigating and pinning on approved main v1.2 cannot mutate existing Home/Food/Water records',()=>{
  const mem=storage()
  const untouched=[
    ['grapes-home-household-v1','{"events":[{"id":"local-home-unchanged"}]}'],
    ['grapes-water-v1','{"entries":[{"id":"water-unchanged"}]}'],
    ['grapes.food.diary.v1','{"entries":[{"id":"food-unchanged"}]}'],
  ]
  for(const [key,raw] of untouched) mem.setItem(key,raw)
  const before=[...untouched].map(([key])=>[key,mem.data.get(key)])
  const nav=createMainShortcutStore(mem)
  nav.pin('inventory')
  nav.visit('food')
  nav.visit('water')
  nav.unpin('inventory')
  assert.deepEqual(before.map(([key])=>[key,mem.data.get(key)]),before,
    'Navigation may only persist its own preference key, never rewrite existing module stores')
  assert.ok(mem.data.has('grapes-main-shortcuts-v12'))
})
