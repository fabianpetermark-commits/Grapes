import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const browserBinary = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(x => x && existsSync(x))
assert.ok(browserBinary, 'Chromium required for fresh Home owner A-B-A')
const port = 4235
const url = `http://127.0.0.1:${port}/Grapes/tests/fixtures/grapes-test-outbox.html`
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (server.exitCode !== null || attempt === 99) throw Error('Home fixture unavailable')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: browserBinary, headless: true,
    args: ['--no-sandbox'] })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(url)
  const evidence = await page.evaluate(async () => {
    const { openGrapesTestFreshHome } =
      await import('/Grapes/src/home/grapes-test-fresh-home.js')
    const { createGrapesTestLocalOwnerStore } =
      await import('/Grapes/src/storage/grapes-test-local-owner-store.js')
    const { createHomeState, applyHomeCommand } = await import('/Grapes/src/home/home-data.js')
    const A = '00000000-0000-4000-8000-000000000001'
    const B = '00000000-0000-4000-8000-000000000002'
    let current = A
    let authenticated = true
    const args = { enabled: true, isAndroid: () => true,
      authEnabled: async () => authenticated, getSubject: async () => current }
    localStorage.setItem('grapes-home-household-v1', '{"privateLegacy":"NEVER-COPY"}')
    localStorage.setItem('grapes-home-household-v1-previous', 'OLD-PREVIOUS-DO-NOT-TOUCH')
    const a = await openGrapesTestFreshHome(args)
    const aEmpty = a.getState()
    const stock = await a.dispatch({ type: 'StockCountConfirmed',
      eventId: 'a-stock', payload: {
        name: 'A tej', quantity: '1', unit: 'l',
        storageLocation: 'fridge',
      } })
    const shopping = await a.dispatch({ type: 'ShoppingItemAdded',
      eventId: 'a-plan', payload: { name: 'A kenyér' } })
    const checked = await a.dispatch({ type: 'ShoppingItemStatusChanged',
      eventId: 'a-check',
      payload: { id: shopping.state.shopping[0].id, status: 'checked' } })
    const duplicate = await a.dispatch({ type: 'ShoppingItemStatusChanged',
      eventId: 'a-check',
      payload: { id: shopping.state.shopping[0].id, status: 'checked' } })
    const aRecord = a.getState()
    const aPrevious = a.previousSnapshot()
    const aStatus = await a.status()

    current = B
    let staleA = false
    try { await a.dispatch({ type: 'ShoppingItemAdded',
      payload: { name: 'A attempt after B' } }) }
    catch { staleA = true }
    const b = await openGrapesTestFreshHome(args)
    const bInitial = b.getState()
    await b.dispatch({ type: 'ShoppingItemAdded',
      payload: { name: 'B sajt' } })
    await b.dispatch({ type: 'StockCountConfirmed',
      payload: { name: 'B tojás', quantity: '6', unit: 'db',
        storageLocation: 'pantry' } })
    let staleARead = false
    try { await a.load() } catch { staleARead = true }
    current = A
    const returning = await openGrapesTestFreshHome(args)
    const aReturned = returning.getState()
    let staleB = false
    try { await b.dispatch({ type: 'ShoppingItemAdded',
      payload: { name: 'Wrong owner' } }) } catch { staleB = true }

    const actor1 = await openGrapesTestFreshHome(args)
    const actor2 = await openGrapesTestFreshHome(args)
    await actor1.dispatch({ type: 'ShoppingItemAdded', payload: { name: 'A só' } })
    let casDenied = false
    try { await actor2.dispatch({ type: 'ShoppingItemAdded',
      payload: { name: 'Should not overwrite' } }) }
    catch (e) { casDenied = /ütközés|felül/.test(e.message) }
    let poisonedDenied = false
    try { await actor2.dispatch({ type: 'ShoppingItemAdded',
      payload: { name: 'Retry should fail' } }) } catch { poisonedDenied = true }

    // Existing owner-bound v1 snapshots upgrade with the next atomic CAS write.
    const D = '00000000-0000-4000-8000-000000000004'
    current = D
    const oldOwnerStore = createGrapesTestLocalOwnerStore({enabled:true,getVerifiedSubject:async()=>current})
    const previousV2 = applyHomeCommand(createHomeState({householdId:D,actorId:D}),{
      type:'StockCountConfirmed',eventId:'old-stock',payload:{name:'Régi tej',quantity:1,unit:'l',storageLocation:'fridge'}
    }).state
    const v1 = {...previousV2,schemaVersion:1}
    delete v1.prepared
    await oldOwnerStore.save({id:'home-current',data:{module:'Home',ownerId:D,schemaVersion:1,state:v1,previousState:v1}})
    const rawBefore = JSON.stringify((await oldOwnerStore.read('home-current')).data)
    const recovered = await openGrapesTestFreshHome(args)
    const recoveredState = recovered.getState()
    const preservedBeforeWrite = JSON.stringify((await oldOwnerStore.read('home-current')).data) === rawBefore
    await recovered.dispatch({type:'ShoppingItemAdded',eventId:'post-migration',payload:{name:'Régi lista'}})
    const upgraded = (await oldOwnerStore.read('home-current')).data
    const ownerV1Pass = preservedBeforeWrite && recoveredState.schemaVersion===2 &&
      recoveredState.revision===1 && recoveredState.prepared.length===0 &&
      recoveredState.inventory[0].quantityBase===1000 && upgraded.schemaVersion===2 &&
      upgraded.state.schemaVersion===2 && upgraded.previousState.schemaVersion===2 &&
      upgraded.state.revision===2 && upgraded.state.inventory[0].quantityBase===1000

    // Synthetically inject a FOREIGN household into a new owner-partitioned
    // Home document. The verifier must reject it without claiming/removing it.
    current = '00000000-0000-4000-8000-000000000003'
    const store = createGrapesTestLocalOwnerStore({
      enabled: true, getVerifiedSubject: async () => current })
    await store.save({ id: 'home-current', data: {
      module: 'Home', ownerId: current, schemaVersion: 1,
      state: createHomeState({ householdId: A, actorId: A }),
    } })
    let foreignHomeDenied = false
    try { await openGrapesTestFreshHome(args) } catch { foreignHomeDenied = true }

    current = A
    authenticated = false
    let logoutDenied = false
    try { await actor1.assertOwner() } catch { logoutDenied = true }
    let newOpenDenied = false
    try { await openGrapesTestFreshHome(args) } catch { newOpenDenied = true }
    authenticated = true
    let disabledDenied = false
    try { await openGrapesTestFreshHome({ ...args, enabled: false }) }
    catch { disabledDenied = true }
    return {
      aInitiallyEmpty: aEmpty.inventory.length === 0 && aEmpty.shopping.length === 0,
      aBound: aEmpty.householdId === A && aEmpty.actorId === A,
      stockedAmount: stock.state.inventory[0].quantityBase,
      shoppingOnly: shopping.state.inventory.length === 1,
      checkedNoStock: checked.state.inventory.length === 1,
      checkedStatus: checked.state.shopping[0].status,
      duplicate: duplicate.duplicate, aRevisions: [aRecord.revision, aStatus.revision],
      previousRevision: aPrevious?.revision, previousShoppingStatus: aPrevious?.shopping[0]?.status,
      bEmpty: bInitial.inventory.length === 0 && bInitial.shopping.length === 0,
      bOwner: bInitial.householdId, aReturnItems: aReturned.inventory.map(x=>x.name),
      aReturnShopping: aReturned.shopping.map(x=>x.name), staleA, staleB, staleARead,
      casDenied, poisonedDenied, foreignHomeDenied, logoutDenied, newOpenDenied, disabledDenied,
      ownerV1Pass,
      legacyRaw: localStorage.getItem('grapes-home-household-v1'),
      legacyPrevious: localStorage.getItem('grapes-home-household-v1-previous'),
    }
  })
  assert.deepEqual(evidence, {
    aInitiallyEmpty: true, aBound: true, stockedAmount: 1000,
    shoppingOnly: true, checkedNoStock: true, checkedStatus: 'checked',
    duplicate: true, aRevisions: [3,3], previousRevision: 2,
    previousShoppingStatus: 'planned',
    bEmpty: true, bOwner: '00000000-0000-4000-8000-000000000002',
    aReturnItems: ['A tej'], aReturnShopping: ['A kenyér'],
    staleA: true, staleB: true, staleARead: true,
    casDenied: true, poisonedDenied: true, foreignHomeDenied: true,
    ownerV1Pass: true,
    logoutDenied: true, newOpenDenied: true, disabledDenied: true,
    legacyRaw: '{"privateLegacy":"NEVER-COPY"}',
    legacyPrevious: 'OLD-PREVIOUS-DO-NOT-TOUCH',
  })
  await ctx.close()
  console.log('PASS: Home inventory, shopping, event history and atomic previous snapshot owner A→B→A.')
  console.log('PASS: cross-owner, stale session, logout, CAS and old legacy preservation.')
} finally {
  await browser?.close()
  server.kill()
}
