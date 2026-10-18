import test from 'node:test'
import assert from 'node:assert/strict'
import { saveAndroidJsonBackup } from '../src/android-bridge.js'

function mockAndroidBridge() {
  const old = globalThis.window
  const ui = new EventTarget()
  ui.setTimeout = setTimeout
  ui.clearTimeout = clearTimeout
  const calls = []
  const parts = []
  let failAppend = false
  ui.GrapesAndroid = { postMessage(json) {
    const request = JSON.parse(json)
    calls.push(request)
    let payload = '{}'
    let error = ''
    switch (request.method) {
      case 'beginFoodBackupExport':
        payload = 'session-1'
        break
      case 'appendFoodBackupExport':
        if (failAppend) error = 'A fájlmentés sikertelen.'
        else parts.push(request.args[1])
        break
      case 'finishFoodBackupExport':
        if (request.args[1] !== new Blob([parts.join('')]).size) error = 'Eltér a méret.'
        break
      case 'cancelFoodBackupExport':
        break
      default: error = 'Ismeretlen művelet.'
    }
    ui.dispatchEvent(new CustomEvent('grapes:android-result', {
      detail: {requestId: request.requestId, ok: !error, payload, error},
    }))
  }}
  globalThis.window = ui
  return { calls, parts, failNextAppend() { failAppend = true }, dispose() { globalThis.window = old } }
}

test('Food JSON export uses real Android save selection, UTF-8 chunking and confirmed finish', async () => {
  const bridge = mockAndroidBridge()
  try {
    const backup = JSON.stringify({grapesFoodBackup:true, data:{notes:'Őrölt kömény 🍎'.repeat(20000)}})
    const filename = 'grapes-etelnaplo-2026-10-18.json'
    const result = await saveAndroidJsonBackup(filename, backup)
    assert.equal(result, filename)
    assert.ok(bridge.parts.length > 1, 'Large backups must not be one oversized native message.')
    assert.equal(bridge.parts.join(''), backup, 'Never corrupt Unicode at chunk boundaries.')
    assert.equal(bridge.calls[0].method,'beginFoodBackupExport')
    assert.equal(bridge.calls[0].args[0],filename)
    assert.equal(bridge.calls.at(-1).method,'finishFoodBackupExport')
    assert.equal(bridge.calls.at(-1).args[1],new Blob([backup]).size)
    assert.equal(bridge.calls.some(call => call.method === 'cancelFoodBackupExport'),false)
  } finally { bridge.dispose() }
})

test('Failed save never reports success and cancels pending chunk stream', async () => {
  const bridge=mockAndroidBridge()
  bridge.failNextAppend()
  try {
    const backup=JSON.stringify({grapesFoodBackup:true,data:{}})
    await assert.rejects(saveAndroidJsonBackup('grapes-etelnaplo-2026-10-18.json',backup),/sikertelen/)
    assert.equal(bridge.calls.at(-1).method,'cancelFoodBackupExport')
    assert.equal(bridge.calls.some(call=>call.method==='finishFoodBackupExport'),false)
  } finally {bridge.dispose()}
})

test('Rejects unrelated file names or non-backup content before opening picker', async () => {
  const bridge=mockAndroidBridge()
  try {
    await assert.rejects(saveAndroidJsonBackup('../bad.json','{}'),/fájlnév/)
    await assert.rejects(saveAndroidJsonBackup('grapes-etelnaplo-2026-10-18.json','{}'),/formátuma/)
    assert.equal(bridge.calls.length,0)
  } finally {bridge.dispose()}
})

test('separate named originals and Water backup share the verified Android file picker',async()=>{
  const bridge=mockAndroidBridge()
  try{
    const food=JSON.stringify({grapesFoodBackup:true,version:1,data:{profile:{id:'synthetic'}}})
    const first=await saveAndroidJsonBackup('grapes-etelnaplo-2026-10-18-helyi.json',food)
    assert.match(first,/-helyi\.json$/)
    assert.equal(bridge.calls.at(-1).method,'finishFoodBackupExport')
  }finally{bridge.dispose()}
  const waterBridge=mockAndroidBridge()
  try{
    const water=JSON.stringify({grapesWaterBackup:true,version:1,data:{
      '2026-10-18':{goal:2000,entries:[{id:'safe',amount:500,at:'2026-10-18T10:00:00Z'}]},
    }})
    const output=await saveAndroidJsonBackup('grapes-viznaplo-2026-10-18.json',water)
    assert.match(output,/viznaplo/)
    assert.equal(waterBridge.parts.join(''),water)
    assert.equal(waterBridge.calls.at(-1).method,'finishFoodBackupExport')
    await assert.rejects(saveAndroidJsonBackup('grapes-viznaplo-2026-10-18.json',
      JSON.stringify({grapesFoodBackup:true})),/formátuma/)
    await assert.rejects(saveAndroidJsonBackup('grapes-etelnaplo-2026-10-18-drive.json',water),/formátuma/)
  }finally{waterBridge.dispose()}
})
