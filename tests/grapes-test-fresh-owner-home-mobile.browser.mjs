import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const chrome = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
assert.ok(chrome, 'Chromium required for real mobile Home A-B-A')
const port = 4236
const url = `http://127.0.0.1:${port}/Grapes/design/android-mobile-preview.html`
const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (server.exitCode !== null || attempt === 119) throw Error('Home mobile UI unavailable')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: chrome, headless: true,
    args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 410, height: 900 } })
  await ctx.addInitScript(() => {
    localStorage.setItem('grapes-local-mode', '1')
    window.GrapesAndroid = {
      postMessage(message) {
        const { method, requestId } = JSON.parse(message)
        const subject = localStorage.getItem('__home_qa_subject') ||
          '00000000-0000-4000-8000-000000000001'
        const login = localStorage.getItem('__home_qa_auth_off') !== '1'
        const payload = method === 'getTestAuthEnabled' ? String(login)
          : method === 'getTestAuthSubject' && login ? subject : ''
        queueMicrotask(() => window.dispatchEvent(new CustomEvent(
          'grapes:android-result', { detail: { requestId, ok: true, payload } })))
      },
    }
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  const home = page.locator('[data-page="household"]')
  const rootNode = page.locator('[data-household-root]')
  async function openExtra(name) {
    const panel = rootNode.locator('[data-household-extra-nav]')
    if (!(await panel.evaluate(el => el.open))) await panel.locator('summary').click()
    await panel.locator('[data-household-tab="'+name+'"]').click()
  }
  async function openHome(tab = 'inventory') {
    await page.locator('[data-menu-group="home"]').click()
    await page.locator(`[data-page="hub-home"] [data-menu-destination="${tab}"]`).click()
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-household-root]')
      return node && !node.inert && getComputedStyle(node).visibility !== 'hidden'
        && !document.querySelector('[data-household-tabs]').hidden
    }, { timeout: 15000 })
  }
  await openHome()
  // These bytes must not be read or claimed, not even when syntactically invalid.
  await page.evaluate(() => {
    localStorage.setItem('grapes-home-household-v1',
      '{"legacy":"PRIVATE-UNOWNED"}')
    localStorage.setItem('grapes-home-household-v1-previous', 'previous-legacy')
  })
  assert.ok((await home.textContent()).includes('Itt még nincs ismert élelmiszer'))
  await home.locator('[data-household-add="inventory"]').click()
  const form = home.locator('[data-household-form]')
  await form.locator('[name="name"]').fill('A saját tej')
  await form.locator('[name="quantity"]').fill('1')
  await form.locator('[name="unit"]').selectOption('l')
  await form.locator('button[type="submit"]').click()
  await page.waitForFunction(() =>
    document.querySelector('[data-household-lots]')?.textContent.includes('A saját tej'),
    {timeout:15000})
  await home.locator('[data-household-tab="shopping"]').click()
  await home.locator('[data-household-add="shopping"]').click()
  await form.locator('[name="name"]').fill('A saját kenyér')
  await form.locator('button[type="submit"]').click()
  await page.waitForFunction(() =>
    document.querySelector('[data-household-items]')?.textContent.includes('A saját kenyér'),
    {timeout:15000})
  await home.locator('[data-household-check]').first().click()
  await page.waitForFunction(() =>
    document.querySelector('[data-household-items]')?.textContent.includes('Elintézve'),
    {timeout:15000})
  const aSnapshot = await page.evaluate(async () => {
    const { openGrapesTestFreshHome } =
      await import('/Grapes/src/home/grapes-test-fresh-home.js')
    const session = await openGrapesTestFreshHome({enabled:true})
    const s = session.getState()
    return {owner:s.householdId, actor:s.actorId,
      lot:s.inventory[0]?.name, amount:s.inventory[0]?.quantityBase,
      shopping:s.shopping[0]?.name, status:s.shopping[0]?.status}
  })
  assert.deepEqual(aSnapshot,{ owner:A,actor:A,
    lot:'A saját tej',amount:1000,shopping:'A saját kenyér',status:'checked' })

  // A's owner-verified Food recipe must be read-only visible only in A's Home.
  await page.evaluate(async () => {
    const { openGrapesTestFreshFood } = await import('/Grapes/src/food/grapes-test-fresh-food.js')
    const session = await openGrapesTestFreshFood({ enabled: true })
    const data = await session.load()
    data.customFoods.push({ id: 'f-home-m3a-milk', name: 'A saját tej', kind: 'manual', baseUnit: 'ml', nutrients: {} })
    data.recipes.push({ id: 'r-home-m3a-milk', foodId: 'f-home-m3a-recipe', ownerProfileId: data.profile.id,
      name: 'A saját tejitalom', ingredients: [{ id: 'i-milk', foodId: 'f-home-m3a-milk', amount: 200, unit: 'ml' }],
      yieldCount: 2, yieldUnit: 'serving' })
    await session.save(data)
    await session.assertOwner()
  })
  await page.reload()
  await openHome()
  await openExtra('advice')
  await home.locator('[data-household-recipe-hints]').getByText('A saját tejitalom', { exact: true }).waitFor()
  assert.match(await home.locator('[data-household-recipe-hints]').textContent(), /Ellenőrizendő/)
  assert.match(await home.locator('[data-household-recipe-hints]').textContent(), /1 lehetséges névegyezés/)
  const beforeAdvice = await page.evaluate(async () => {
    const { openGrapesTestFreshHome } = await import('/Grapes/src/home/grapes-test-fresh-home.js')
    return (await openGrapesTestFreshHome({ enabled: true })).getState().revision
  })
  await home.locator('[data-household-recipe-hints] details summary').click()
  assert.match(await home.locator('[data-household-recipe-hints] details').textContent(), /A saját tej/)
  const afterAdvice = await page.evaluate(async () => {
    const { openGrapesTestFreshHome } = await import('/Grapes/src/home/grapes-test-fresh-home.js')
    return (await openGrapesTestFreshHome({ enabled: true })).getState().revision
  })
  assert.equal(afterAdvice, beforeAdvice, 'Reading M3A advice never writes inventory.')
  // Confirmed cooking: manually choose the actual lot; do not write to Food.
  const foodBeforeCook = await page.evaluate(async () => {
    const { openGrapesTestFreshFood } = await import('/Grapes/src/food/grapes-test-fresh-food.js')
    return JSON.stringify(await (await openGrapesTestFreshFood({enabled:true})).load())
  })
  await home.locator('[data-household-cook="r-home-m3a-milk"]').click()
  const cookForm = home.locator('[data-household-cooking]')
  assert.equal(await cookForm.locator('[name="portions"]').inputValue(), '2')
  await cookForm.locator('.household-cooking-row [name="unit"]').selectOption('ml')
  await cookForm.locator('.household-cooking-row [name="quantity"]').fill('200')
  assert.match(await cookForm.locator('[data-household-cooking-preview]').textContent(), /1000 → 800 ml/)
  const homeBeforeCook = await page.evaluate(async () => {
    const { openGrapesTestFreshHome } = await import('/Grapes/src/home/grapes-test-fresh-home.js')
    return (await openGrapesTestFreshHome({enabled:true})).getState()
  })
  assert.equal(homeBeforeCook.inventory[0].quantityBase, 1000)
  assert.equal(homeBeforeCook.prepared.length, 0)
  await cookForm.locator('button[type="submit"]').click()
  try {
    await home.locator('[data-household-prepared]').getByText('A saját tejitalom', { exact: true }).waitFor({ timeout: 15000 })
  } catch (error) {
    throw new Error('A főzés nem került készletbe: ' +
      await home.locator('[data-household-alert]').textContent() +
      ' | előnézet: ' + await home.locator('[data-household-cooking-preview]').textContent() +
      ' | ' + error.message)
  }
  const cooked = await page.evaluate(async () => {
    const { openGrapesTestFreshHome } = await import('/Grapes/src/home/grapes-test-fresh-home.js')
    const session = await openGrapesTestFreshHome({enabled:true})
    const state = session.getState()
    const entry = state.events.find(event => event.type === 'CookingConfirmed')
    const repeated = await session.dispatch({type:'CookingConfirmed',eventId:entry.eventId,sourceType:entry.sourceType,sourceId:entry.sourceId,payload:{recipeRef:'r-home-m3a-milk'}})
    let financeBlocked = false, diaryBlocked = false, unknownRecipeBlocked = false
    try { await session.dispatch({type:'StockReceived',payload:{}}) } catch {financeBlocked=true}
    try { await session.dispatch({type:'PreparedConsumptionLinked',payload:{}}) } catch {diaryBlocked=true}
    try { await session.dispatch({type:'CookingConfirmed',eventId:'invented-cook',sourceType:'food-recipe',
      sourceId:state.householdId+':invented-recipe:invented-cook',payload:{recipeRef:'invented-recipe',name:'X',portions:1,storageLocation:'fridge',consumed:[{id:state.inventory[0].id,quantity:1,unit:'ml'}]}}) } catch {unknownRecipeBlocked=true}
    return {revision:state.revision,duplicate:repeated.duplicate,quantity:state.inventory[0].quantityBase,
      portions:state.prepared[0].portionsRemaining,source:entry.sourceType,financeBlocked,diaryBlocked,unknownRecipeBlocked}
  })
  assert.deepEqual(cooked,{revision:4,duplicate:true,quantity:800,portions:2,source:'food-recipe',financeBlocked:true,diaryBlocked:true,unknownRecipeBlocked:true})
  const foodAfterCook = await page.evaluate(async () => {
    const { openGrapesTestFreshFood } = await import('/Grapes/src/food/grapes-test-fresh-food.js')
    return JSON.stringify(await (await openGrapesTestFreshFood({enabled:true})).load())
  })
  assert.equal(foodAfterCook, foodBeforeCook, 'Cooking must not rewrite the personal Food project.')
  // Attach an already saved Food recipe diary entry; Home must never create it.
  await page.evaluate(async () => {
    const { openGrapesTestFreshFood } = await import('/Grapes/src/food/grapes-test-fresh-food.js')
    const { normalizeDiaryEntry } = await import('/Grapes/src/food/food-data.js')
    const food = await openGrapesTestFreshFood({enabled:true})
    const data = await food.load()
    data.diaryEntries.push(normalizeDiaryEntry({
      id:'home-linked-entry-1',profileId:data.profile.id,mealType:'lunch',
      amount:1,unit:'serving',occurredAt:'2026-10-25T12:00:00Z',
      snapshot:{foodId:'f-home-m3a-recipe',name:'A saját tejitalom',category:'Saját recept',
        source:{type:'recipe',id:'r-home-m3a-milk',revision:'1',attribution:data.profile.id},
        baseAmount:200,baseUnit:'g',nutrients:{}}
    }))
    await food.save(data)
    await food.assertOwner()
  })
  const beforeLinkFood = await page.evaluate(async () => {
    const { openGrapesTestFreshFood } = await import('/Grapes/src/food/grapes-test-fresh-food.js')
    return JSON.stringify(await (await openGrapesTestFreshFood({enabled:true})).load())
  })
  await home.locator('[data-household-link-prepared]').click()
  const linkForm = home.locator('[data-household-diary-link]')
  await linkForm.locator('[name="foodEntryId"]').waitFor()
  await linkForm.locator('[name="foodEntryId"]').selectOption('home-linked-entry-1')
  assert.match(await linkForm.locator('[data-household-diary-preview]').textContent(), /2 → 1 adag/)
  const beforeLink = await page.evaluate(async () => {
    const { openGrapesTestFreshHome } = await import('/Grapes/src/home/grapes-test-fresh-home.js')
    return (await openGrapesTestFreshHome({enabled:true})).getState()
  })
  assert.equal(beforeLink.prepared[0].portionsRemaining,2)
  await linkForm.locator('button[type="submit"]').click()
  await page.waitForFunction(async () => {
    const { openGrapesTestFreshHome } = await import('/Grapes/src/home/grapes-test-fresh-home.js')
    const state = (await openGrapesTestFreshHome({enabled:true})).getState()
    return state.prepared[0]?.portionsRemaining === 1
  })
  const linked = await page.evaluate(async () => {
    const { openGrapesTestFreshHome } = await import('/Grapes/src/home/grapes-test-fresh-home.js')
    const session = await openGrapesTestFreshHome({enabled:true})
    const state = session.getState()
    const event = state.events.find(event => event.type === 'PreparedConsumptionLinked')
    const duplicate = await session.dispatch({type:'PreparedConsumptionLinked',eventId:'another-link',
      sourceType:'food-diary',sourceId:event.sourceId,payload:{profileId:state.householdId,foodEntryId:'home-linked-entry-1'}})
    let wrongSourceBlocked=false, wrongAmountBlocked=false
    try { await session.dispatch({type:'PreparedConsumptionLinked',eventId:'foreign-link',sourceType:'food-diary',
      sourceId:'another-owner:home-linked-entry-1',payload:{profileId:state.householdId,foodEntryId:'home-linked-entry-1'}}) }
    catch { wrongSourceBlocked=true }
    try { await session.dispatch({type:'PreparedConsumptionLinked',eventId:'forged-link',sourceType:'food-diary',
      sourceId:state.householdId+':invented-entry',payload:{profileId:state.householdId,foodEntryId:'invented-entry',
        preparedLotId:state.prepared[0].id,recipeRef:'r-home-m3a-milk',unit:'serving',portions:1}}) }
    catch { wrongAmountBlocked=true }
    return {remaining:state.prepared[0].portionsRemaining,raw:state.inventory[0].quantityBase,
      duplicate:duplicate.duplicate,wrongSourceBlocked,wrongAmountBlocked}
  })
  assert.deepEqual(linked,{remaining:1,raw:800,duplicate:true,wrongSourceBlocked:true,wrongAmountBlocked:true})
  const afterLinkFood = await page.evaluate(async () => {
    const { openGrapesTestFreshFood } = await import('/Grapes/src/food/grapes-test-fresh-food.js')
    return JSON.stringify(await (await openGrapesTestFreshFood({enabled:true})).load())
  })
  assert.equal(afterLinkFood,beforeLinkFood,'The Food diary record is never rewritten by Home linking.')
  await home.locator('[data-household-link-prepared]').click()
  await page.waitForFunction(() => document.querySelector('[data-household-alert]')?.textContent?.includes('Nincs megfelelő'))
  assert.ok(!(await home.locator('[data-household-diary-link]').isVisible()))
  // Own Finance receipt bytes are read only after explicit Home scan; legacy untouched.
  await page.evaluate(async () => {
    const { openGrapesTestLiveFinance } = await import('/Grapes/src/storage/grapes-test-finance-live.js')
    const finance = await openGrapesTestLiveFinance({enabled:true})
    await finance.read()
    await finance.save({transactions:[
      {id:'owner-total-only',type:'expense',amount:5990,date:'2026-10-25',category:'Élelmiszer',
        receipt:{name:'osszeg.png',type:'image/png',size:1,data:'data:image/png;base64,YQ=='}},
      {id:'owner-bread',type:'expense',amount:499,date:'2026-10-25',category:'Élelmiszer',
        receipt:{name:'kenyer.png',type:'image/png',size:1,data:'data:image/png;base64,Yg=='}},
    ]})
    await finance.assertOwner()
    window.__GRAPES_RECEIPT_OCR_TEST__ = image =>
      image.includes('Yg==') ? 'Kenyér 499 Ft\nVégösszeg 499 Ft' : 'Végösszeg 5990 Ft'
  })
  await openExtra('receipts')
  await home.locator('[data-household-scan-receipt="owner-total-only"]').waitFor()
  const beforeReceipt = await page.evaluate(async () => {
    const { openGrapesTestFreshHome } = await import('/Grapes/src/home/grapes-test-fresh-home.js')
    return (await openGrapesTestFreshHome({enabled:true})).getState().inventory.length
  })
  await home.locator('[data-household-scan-receipt="owner-total-only"]').click()
  assert.equal(await home.locator('[data-household-receipt-candidates] [data-household-review-receipt]').count(),0)
  await home.locator('[data-household-scan-receipt="owner-bread"]').click()
  await home.locator('[data-household-receipt-candidates]').getByText('Kenyér',{exact:true}).waitFor()
  assert.equal(await page.evaluate(async () => {
    const { openGrapesTestFreshHome } = await import('/Grapes/src/home/grapes-test-fresh-home.js')
    return (await openGrapesTestFreshHome({enabled:true})).getState().inventory.length
  }),beforeReceipt)
  await home.locator('[data-household-review-receipt]').click()
  const ocrForm = home.locator('[data-household-receipt-form]')
  assert.equal(await ocrForm.locator('[name="quantity"]').inputValue(),'')
  assert.equal(await ocrForm.locator('[name="unit"]').inputValue(),'')
  assert.equal(await ocrForm.locator('[name="storageLocation"]').inputValue(),'untracked')
  assert.equal(await ocrForm.evaluate(form=>form.checkValidity()),false)
  await ocrForm.locator('[name="quantity"]').fill('1')
  await ocrForm.locator('[name="unit"]').selectOption('db')
  await ocrForm.locator('button[type="submit"]').click()
  try {
    await home.locator('[data-household-lots]').getByText('Kenyér',{exact:true}).waitFor({timeout:15000})
  } catch(error) {
    throw new Error('A blokk kézi megerősítése nem hozott készlettételt: ' +
      await home.locator('[data-household-alert]').textContent() + ' | ' + error.message)
  }
  const checkedOCR = await page.evaluate(async () => {
    const { openGrapesTestFreshHome } = await import('/Grapes/src/home/grapes-test-fresh-home.js')
    const session = await openGrapesTestFreshHome({enabled:true})
    const state = session.getState()
    const event = state.events.find(event=>event.type==='StockReceived')
    let forgedBlocked=false
    try { await session.dispatch({type:'StockReceived',eventId:'invented',sourceType:'finance-receipt',
      sourceId:'fake:ocr-0123456789abcdef-1',payload:{receiptId:'fake',lineId:'ocr-0123456789abcdef-1',
      name:'Hamis',quantity:1,unit:'db',storageLocation:'pantry'}}) } catch {forgedBlocked=true}
    return {count:state.inventory.length,raw:state.inventory.find(lot=>lot.name==='A saját tej').quantityBase,
      receiptCount:state.events.filter(event=>event.type==='StockReceived').length,forgedBlocked,source:event.sourceId}
  })
  assert.equal(checkedOCR.count,beforeReceipt+1)
  assert.equal(checkedOCR.raw,800)
  assert.equal(checkedOCR.receiptCount,1)
  assert.equal(checkedOCR.forgedBlocked,true)
  assert.match(checkedOCR.source,/^owner-bread:ocr-[0-9a-f]{16}-1$/)
  await openExtra('receipts')
  await home.locator('[data-household-scan-receipt="owner-bread"]').waitFor()
  await home.locator('[data-household-scan-receipt="owner-bread"]').click()
  await home.locator('[data-household-receipt-candidates] [data-household-review-receipt]').waitFor()
  assert.equal(await home.locator('[data-household-receipt-candidates] [data-household-review-receipt]').isDisabled(),true)
  await page.evaluate(B => localStorage.setItem('__home_qa_subject', B), B)
  await page.reload()
  await openHome('shopping')
  assert.ok(!(await rootNode.textContent()).includes('A saját tej'))
  assert.ok(!(await rootNode.textContent()).includes('A saját kenyér'))
  assert.ok((await rootNode.textContent()).includes('A bevásárlólista üres'))
  const bEmpty = await page.evaluate(async () => {
    const { openGrapesTestFreshHome } =
      await import('/Grapes/src/home/grapes-test-fresh-home.js')
    const v = (await openGrapesTestFreshHome({enabled:true})).getState()
    return {inventory:v.inventory.length,shopping:v.shopping.length,prepared:v.prepared.length,owner:v.householdId}
  })
  assert.deepEqual(bEmpty,{inventory:0,shopping:0,prepared:0,owner:B})
  await openExtra('receipts')
  await home.locator('[data-household-receipt-items]').getByText('Nincs saját mentett képes bizonylat. A végösszegből nem lesz készlet.').waitFor()
  assert.ok(!(await home.locator('[data-household-receipt-items]').textContent()).includes('kenyer.png'),
    'B cannot read A\'s owner-bound Finance receipt.')
  await home.locator('[data-household-tab="shopping"]').click()
  await openExtra('advice')
  await home.locator('[data-household-recipe-hints]').getByText('Nincs elérhető saját Food-recept ebben a fiókban.').waitFor()
  assert.ok(!(await rootNode.textContent()).includes('A saját tejitalom'))
  await home.locator('[data-household-tab="shopping"]').click()
  await home.locator('[data-household-add="shopping"]').click()
  await form.locator('[name="name"]').fill('B saját sajt')
  await form.locator('button[type="submit"]').click()
  await page.waitForFunction(() =>
    document.querySelector('[data-household-items]')?.textContent.includes('B saját sajt'),
    {timeout:15000})

  await page.evaluate(A => localStorage.setItem('__home_qa_subject', A), A)
  await page.reload()
  await openHome('shopping')
  assert.ok((await rootNode.textContent()).includes('A saját kenyér'))
  assert.ok(!(await rootNode.textContent()).includes('B saját sajt'))
  await home.locator('[data-household-tab="inventory"]').click()
  assert.ok((await rootNode.textContent()).includes('A saját tej'))
  await openExtra('advice')
  await home.locator('[data-household-recipe-hints]').getByText('A saját tejitalom', { exact: true }).waitFor()
  assert.ok((await rootNode.textContent()).includes('A saját tejitalom'))
  const aFinal = await page.evaluate(async () => {
    const { openGrapesTestFreshHome } =
      await import('/Grapes/src/home/grapes-test-fresh-home.js')
    const data = (await openGrapesTestFreshHome({enabled:true})).getState()
    return { inventory:data.inventory.length, shopping:data.shopping.length, prepared:data.prepared.length,
      events:data.events.length, legacy:localStorage.getItem('grapes-home-household-v1'),
      oldPrevious:localStorage.getItem('grapes-home-household-v1-previous') }
  })
  assert.deepEqual(aFinal,{ inventory:2, shopping:1, prepared:1, events:6,
    legacy:'{"legacy":"PRIVATE-UNOWNED"}',oldPrevious:'previous-legacy' })
  // Simulate a native account change in a foregrounded WebView. Previous
  // account data must disappear synchronously, before the new Auth read.
  await page.evaluate(B => {
    localStorage.setItem('__home_qa_subject', B)
    document.dispatchEvent(new Event('visibilitychange'))
  }, B)
  await page.waitForFunction(() =>
    document.querySelector('[data-household-root]')?.textContent?.includes('B saját sajt'),
    {timeout:15000})
  assert.ok(!(await rootNode.textContent()).includes('A saját tej'))
  await page.evaluate(() => {
    localStorage.setItem('__home_qa_auth_off', '1')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForFunction(() =>
    document.querySelector('[data-household-alert]')?.textContent?.includes('nem aktív') ||
    document.querySelector('[data-household-alert]')?.textContent?.includes('nem ellenőrizhető'),
    {timeout:15000})
  assert.ok(!(await rootNode.textContent()).includes('B saját sajt'))
  assert.deepEqual(errors,[])
  await ctx.close()
  console.log('PASS: actual Home buttons save inventory, shopping/status independently A→B→A.')
  console.log('PASS: owner-only read-only Home M3A Food recipe suggestions A→B→A, no stock writes.')
  console.log('PASS: owner-bound CookingConfirmed, prepared portions, durable idempotency, Finance ingress blocked.')
  console.log('PASS: verified saved own Food diary linked once to prepared portions, no Food or raw stock writes; A→B→A.')
  console.log('PASS: owner Finance receipt total ignored; priced line requires confirmation; duplicate and forged ingress blocked.')
  console.log('PASS: on foreground account switch/logout old DOM clears, old localStorage untouched.')
} finally {
  await browser?.close()
  server.kill()
}
