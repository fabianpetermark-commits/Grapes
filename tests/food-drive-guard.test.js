import test from 'node:test'
import assert from 'node:assert/strict'
import { createFoodDriveGuard, primaryFoodFiles, assertFoodRemote } from '../src/food/food-drive-guard.js'

const project = (id, meals = [], recipes = []) => ({ profile: { id }, diaryEntries: meals, recipes, targets: [{ id: 'goal', values: { energyKcal: 2100 } }], importBatches: [], syncState: { localDirty: true } })
function server() {
  const files = new Map(), calls = []
  let nextId = 0, beforePatch = null, onList = null
  const api = {
    files, calls,
    setBeforePatch: value => { beforePatch = value }, setOnList: value => { onList = value },
    list: async () => { if (onList) await onList(); return [...files].map(([id, value]) => ({ id, name: value.name, version: String(value.version), mimeType: 'application/json' })) },
    metadata: async id => { const f = files.get(id); if (!f) throw Error('404'); return { id, name: f.name, version: String(f.version), mimeType: 'application/json', trashed: false } },
    load: async id => { const f = files.get(id); if (!f) throw Error('404'); return structuredClone(f.content) },
    save: async ({ module, name, data, fileId, writeId, privateRecovery }) => {
      calls.push({ fileId, name, privateRecovery, data: structuredClone(data) })
      if (fileId) {
        if (beforePatch) await beforePatch()
        const f = files.get(fileId); if (!f) throw Error('404')
        f.content = { grapesProject: true, module, name, data: structuredClone(data), writeId }
        f.version += 1
        return fileId
      }
      const id = `file-${++nextId}`
      files.set(id, { name: `${name}.grapes.json`, version: 1, content: { grapesProject: true, module, name, data: structuredClone(data), writeId } })
      return id
    },
    seed(id, data, writeId = 'baseline') { files.set(id, { name: 'Ételnapló.grapes.json', version: 1, content: { grapesProject: true, module: 'Ételnapló', name: 'Ételnapló', data, writeId } }) },
  }
  return api
}
const client = (api, prefix) => { let n = 0; return createFoodDriveGuard({ ...api, randomId: () => `${prefix}-${++n}` }) }

test('A offline, B online: régi kliens nem írhatja felül B új étkezését', async () => {
  const remote = server(); remote.seed('shared', project('same', [{ id: 'base' }]))
  const a = client(remote, 'A'), b = client(remote, 'B')
  const bResult = await b.upload({ profileId: 'same', data: project('same', [{ id: 'base' }, { id: 'B-meal' }]), fileId: 'shared', version: '1', writeId: 'baseline' })
  assert.equal(bResult.conflict, false)
  const aResult = await a.upload({ profileId: 'same', data: project('same', [{ id: 'base' }, { id: 'A-meal' }]), fileId: 'shared', version: '1', writeId: 'baseline' })
  assert.equal(aResult.conflict, true)
  assert.equal(aResult.recoveryId !== null, true)
  assert.equal(remote.calls.find(x => x.name?.startsWith('Ételnapló-helyreállítás') && x.data.diaryEntries.some(y => y.id === 'A-meal')).privateRecovery, true)
  assert.deepEqual((await remote.load('shared')).data.diaryEntries.map(x => x.id), ['base', 'B-meal'])
  assert.deepEqual((await remote.load(aResult.recoveryId)).data.diaryEntries.map(x => x.id), ['base', 'A-meal'])
})

test('két egyidejű PATCH esetén mindkét teljes napló visszaállítható', async () => {
  const remote = server(); remote.seed('shared', project('same'))
  let release, arrived = 0
  const gate = new Promise(resolve => { release = resolve })
  remote.setBeforePatch(async () => { arrived += 1; if (arrived === 2) release(); await gate })
  const a = client(remote, 'A'), b = client(remote, 'B')
  const writes = await Promise.all([
    a.upload({ profileId: 'same', data: project('same', [{ id: 'A-delete-result' }], [{ id: 'A-recipe' }]), fileId: 'shared', version: '1', writeId: 'baseline' }),
    b.upload({ profileId: 'same', data: project('same', [{ id: 'B-new-meal' }], [{ id: 'B-recipe' }]), fileId: 'shared', version: '1', writeId: 'baseline' }),
  ])
  assert.equal(writes.every(x => x.recoveryId), true)
  const copies = await Promise.all(writes.map(x => remote.load(x.recoveryId)))
  assert.deepEqual(copies.map(x => x.data.diaryEntries[0].id).sort(), ['A-delete-result', 'B-new-meal'])
  assert.deepEqual(copies.map(x => x.data.recipes[0].id).sort(), ['A-recipe', 'B-recipe'])
  assert.equal(writes.some(x => x.conflict), true)
})

test('késleltetett válasz és újraírás után a régi kliens nem kap hamis szinkronsikert', async () => {
  const remote = server(); remote.seed('shared', project('same'))
  const originalSave = remote.save
  let release, firstPatched
  const wait = new Promise(resolve => { release = resolve })
  const patched = new Promise(resolve => { firstPatched = resolve })
  remote.save = async args => {
    const id = await originalSave(args)
    if (args.fileId && args.writeId?.startsWith('A-')) { firstPatched(); await wait }
    return id
  }
  const a = client(remote, 'A'), b = client(remote, 'B')
  const aPending = a.upload({ profileId: 'same', data: project('same', [{ id: 'A' }]), fileId: 'shared', version: '1', writeId: 'baseline' })
  await patched
  const bResult = await b.upload({ profileId: 'same', data: project('same', [{ id: 'B' }]), fileId: 'shared', version: '2', writeId: 'A-1' })
  assert.equal(bResult.conflict, false)
  release()
  const aResult = await aPending
  assert.equal(aResult.conflict, true)
  assert.deepEqual((await remote.load(aResult.recoveryId)).data.diaryEntries.map(x => x.id), ['A'])
  assert.deepEqual((await remote.load('shared')).data.diaryEntries.map(x => x.id), ['B'])
})

test('403/429/503 és megszakadt backup nem okozhat főfájl-PATCH-et', async () => {
  for (const status of [403, 429, 503]) {
    const remote = server(); remote.seed('shared', project('same', [{ id: 'old' }]))
    const originalSave = remote.save
    remote.save = async args => { if (!args.fileId) throw Error(`HTTP ${status}`); return originalSave(args) }
    const a = client(remote, String(status))
    await assert.rejects(a.upload({ profileId: 'same', data: project('same', [{ id: 'new' }]), fileId: 'shared', version: '1', writeId: 'baseline' }), new RegExp(String(status)))
    assert.deepEqual((await remote.load('shared')).data.diaryEntries.map(x => x.id), ['old'])
    assert.equal(remote.calls.filter(x => x.fileId === 'shared').length, 0)
  }
})

test('sikeres PATCH utáni elveszett válasz retry-ja ütközést jelez, a mentés másolata megmarad', async () => {
  const remote = server(); remote.seed('shared', project('same', [{ id: 'base' }]))
  const originalSave = remote.save
  remote.save = async args => {
    const id = await originalSave(args)
    if (args.fileId) throw Error('HTTP 503 after commit')
    return id
  }
  const a = client(remote, 'A')
  const data = project('same', [{ id: 'base' }, { id: 'new' }])
  await assert.rejects(a.upload({ profileId: 'same', data, fileId: 'shared', version: '1', writeId: 'baseline' }), /503/)
  assert.equal(remote.calls.filter(x => x.privateRecovery).length, 1)
  const retry = await a.upload({ profileId: 'same', data, fileId: 'shared', version: '1', writeId: 'baseline' })
  assert.equal(retry.conflict, true)
  assert.deepEqual((await remote.load(retry.recoveryId)).data.diaryEntries.map(x => x.id), ['base', 'new'])
})

test('külön Google-profil, más modul és idegen fájl nem kerülhet Food-ba', async () => {
  const remote = server(); remote.seed('foreign', project('account-a'))
  const a = client(remote, 'A')
  await assert.rejects(a.upload({ profileId: 'account-b', data: project('account-a'), fileId: 'foreign', version: '1', writeId: 'baseline' }), /Másik profil/)
  assert.throws(() => assertFoodRemote(awaitable(project('account-a')), 'account-b'), /Food-profil/)
  assert.deepEqual(primaryFoodFiles([{ id: 'food', name: 'Ételnapló.grapes.json' }, { id: 'recipe', name: 'Recept.grapes.json' }, { id: 'recovery', name: 'Ételnapló-helyreállítás-1.grapes.json' }]).map(x => x.id), ['food'])
})
function awaitable(data) { return { grapesProject: true, module: 'Ételnapló', data } }

test('két külön Google-fiók saját Drive-fájllistája és adatai elkülönülnek', async () => {
  const accountA = server(), accountB = server()
  accountA.seed('a-file', project('account-a', [{ id: 'private-a' }]))
  assert.equal(primaryFoodFiles(await accountB.list()).length, 0)
  const b = client(accountB, 'B')
  const saved = await b.upload({ profileId: 'account-b', data: project('account-b', [{ id: 'private-b' }]) })
  assert.equal(saved.conflict, false)
  assert.deepEqual((await accountB.load(saved.fileId)).data.diaryEntries.map(x => x.id), ['private-b'])
  assert.deepEqual((await accountA.load('a-file')).data.diaryEntries.map(x => x.id), ['private-a'])
})

test('örökölt fájlverzió nélkül a kliens nem végez vak felülírást', async () => {
  const remote = server(); remote.seed('shared', project('same', [{ id: 'remote' }]))
  const a = client(remote, 'A')
  const result = await a.upload({ profileId: 'same', data: project('same', [{ id: 'local' }]), fileId: 'shared' })
  assert.equal(result.conflict, true)
  assert.deepEqual((await remote.load('shared')).data.diaryEntries.map(x => x.id), ['remote'])
  assert.deepEqual((await remote.load(result.recoveryId)).data.diaryEntries.map(x => x.id), ['local'])
})

test('egyidejű új projektek nem váltanak automatikusan egymás fájljára', async () => {
  const remote = server(); let arrived = 0, release
  const gate = new Promise(resolve => { release = resolve })
  remote.setOnList(async () => { arrived += 1; if (arrived === 2) release(); if (arrived <= 2) await gate })
  const a = client(remote, 'A'), b = client(remote, 'B')
  const results = await Promise.all([
    a.upload({ profileId: 'same', data: project('same', [{ id: 'A' }]) }),
    b.upload({ profileId: 'same', data: project('same', [{ id: 'B' }]) }),
  ])
  assert.equal(primaryFoodFiles(await remote.list()).length, 2)
  assert.equal(results.every(x => x.conflict), true)
  const names = [...remote.files.values()].filter(x => x.name === 'Ételnapló.grapes.json').map(x => x.content.data.diaryEntries[0].id).sort()
  assert.deepEqual(names, ['A', 'B'])
})
