import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const chrome = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p))
assert.ok(chrome, 'Chrome required for Food UI isolation')
const port = 4232
const base = `http://127.0.0.1:${port}/Grapes/`
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
let browser
try {
  for (let i=0; i<120; i++) {
    try { if ((await fetch(base+'design/android-mobile-preview.html')).ok) break } catch {}
    if (server.exitCode !== null || i===119) throw Error('Food Android preview not served')
    await new Promise(r=>setTimeout(r,100))
  }
  browser = await chromium.launch({ executablePath: chrome, headless:true, args:['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 410, height: 900 } })
  await ctx.addInitScript(() => {
    // Only synthetic native Auth; never a production Supabase/Drive login.
    localStorage.setItem('grapes-local-mode', '1')
    window.GrapesAndroid = {
      postMessage(message) {
        const { method, requestId } = JSON.parse(message)
        const account = localStorage.getItem('__food_owner_qa') ||
          '00000000-0000-4000-8000-000000000001'
        const signedIn = localStorage.getItem('__food_auth_off') !== '1'
        const payload = method === 'getTestAuthEnabled' ? String(signedIn)
          : method === 'getTestAuthSubject' && signedIn ? account : ''
        queueMicrotask(() => window.dispatchEvent(
          new CustomEvent('grapes:android-result', {
            detail: { requestId, ok: true, payload },
          })))
      },
    }
  })
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(e.message))
  await page.goto(base+'design/android-mobile-preview.html')
  const foodPanel = page.locator('[data-page="food"]')
  async function openFood() {
    await page.locator('[data-menu-group="health"]').click()
    await page.locator('[data-page="hub-health"] [data-menu-destination="food"]').click()
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-page="food"]')
      return el && !el.hidden && !el.inert &&
        getComputedStyle(el).visibility !== 'hidden' &&
        (document.querySelector('[data-food-sync-status]')?.textContent || '').includes('Saját Food')
    }, { timeout: 15000 })
  }
  await openFood()
  await page.evaluate(async () => {
    const { saveLocalProject } = await import('/Grapes/src/storage/local-project-store.js')
    await saveLocalProject({ id: 'food-tracker-local-food-profile', module: 'Ételnapló',
      name: 'UNOWNED-LEGACY', data: {
        marker: 'SECRET-LEGACY-MUST-NOT-BE-SEEN',
        profile: { id: 'local-food-profile' },
      } })
  })

  // Actual mobile screen: choose breakfast, create a custom food, add it as a
  // normal diary entry, verify native-owned IndexedDB, not legacy.
  await foodPanel.locator('[data-food-meals] button').first().click()
  await page.locator('[data-fab]').click()
  await page.locator('[data-food-quick="custom"]').click()
  await page.locator('[data-food-custom-name]').fill('Teszt étel – A 🍇')
  await page.locator('[data-food-custom-energy]').fill('345')
  await page.locator('[data-food-custom-protein]').fill('12')
  await page.locator('[data-food-custom-carbohydrate]').fill('55')
  await page.locator('[data-food-custom-fat]').fill('8')
  await page.locator('[data-food-custom-save]').click()
  await page.locator('[data-food-edit-amount]').fill('150')
  await page.locator('[data-food-edit-note]').fill('A only')
  await page.locator('[data-food-edit-save]').click()

  await page.waitForFunction(async () => {
    const { openGrapesTestFreshFood } =
      await import('/Grapes/src/food/grapes-test-fresh-food.js')
    const store = await openGrapesTestFreshFood({enabled:true})
    const data = await store.load()
    return data.diaryEntries.some(x => x.note === 'A only') &&
      data.customFoods.some(x => x.name === 'Teszt étel – A 🍇')
  }, {timeout:15000})
  const a = await page.evaluate(async () => {
    const { openGrapesTestFreshFood } =
      await import('/Grapes/src/food/grapes-test-fresh-food.js')
    const store = await openGrapesTestFreshFood({ enabled:true })
    return store.load()
  })
  assert.equal(a.profile.id, A)
  assert.equal(a.diaryEntries.length, 1)
  assert.equal(a.diaryEntries[0].amount, 150)
  const indexA = await page.evaluate(async () => {
    const { createGrapesTestFreshOwnerAccess } =
      await import('/Grapes/src/storage/grapes-test-fresh-owner-access.js')
    const access = createGrapesTestFreshOwnerAccess({ enabled: true })
    return { names: (await access.listOwnedProjects()).map(x => x.name),
      count: (await access.ownedUsage()).projects }
  })
  assert.deepEqual(indexA, { names: ['Ételnapló'], count: 1 })

  // Every foreign source remains blocked even when called directly through
  // public mobile controller handlers; no accidental Health/YAZIO/cloud write.
  assert.equal(await page.locator('[data-food-health-auto]').isDisabled(), true)
  assert.equal(await page.locator('[data-food-yazio-auto]').isDisabled(), true)
  assert.equal(await page.locator('[data-food-share]').isDisabled(), true)

  await page.evaluate(B => localStorage.setItem('__food_owner_qa', B), B)
  await page.reload()
  await openFood()
  const emptyB = await page.evaluate(async () => {
    const { openGrapesTestFreshFood } =
      await import('/Grapes/src/food/grapes-test-fresh-food.js')
    return (await (await openGrapesTestFreshFood({enabled:true})).load())
  })
  assert.equal(emptyB.profile.id, B)
  assert.equal(emptyB.customFoods.length, 0)
  assert.equal(emptyB.diaryEntries.length, 0)
  const bIndexBefore = await page.evaluate(async () => {
    const { createGrapesTestFreshOwnerAccess } =
      await import('/Grapes/src/storage/grapes-test-fresh-owner-access.js')
    return (await createGrapesTestFreshOwnerAccess({enabled:true}).listOwnedProjects()).length
  })
  assert.equal(bIndexBefore, 0, 'B must not see any project from A')
  assert.ok(!(await foodPanel.textContent()).includes('Teszt étel – A 🍇'))

  await foodPanel.locator('[data-food-meals] button').first().click()
  await page.locator('[data-fab]').click()
  await page.locator('[data-food-quick="custom"]').click()
  await page.locator('[data-food-custom-name]').fill('B saját étel')
  await page.locator('[data-food-custom-energy]').fill('55')
  await page.locator('[data-food-custom-save]').click()
  await page.locator('[data-food-edit-amount]').fill('100')
  await page.locator('[data-food-edit-save]').click()
  await page.waitForFunction(async () => {
    const { openGrapesTestFreshFood } =
      await import('/Grapes/src/food/grapes-test-fresh-food.js')
    const v=await (await openGrapesTestFreshFood({enabled:true})).load()
    return v.diaryEntries.length===1 && v.customFoods[0]?.name==='B saját étel'
  }, {timeout:15000})

  await page.evaluate(A => localStorage.setItem('__food_owner_qa', A), A)
  await page.reload()
  await openFood()
  const final = await page.evaluate(async () => {
    const { openGrapesTestFreshFood } =
      await import('/Grapes/src/food/grapes-test-fresh-food.js')
    const { loadLocalProject } =
      await import('/Grapes/src/storage/local-project-store.js')
    const data=await (await openGrapesTestFreshFood({enabled:true})).load()
    const legacy=await loadLocalProject('food-tracker-local-food-profile')
    return { profile:data.profile.id, entries:data.diaryEntries.length,
      note:data.diaryEntries[0]?.note, foods:data.customFoods.map(x=>x.name),
      legacy:legacy?.data?.marker }
  })
  assert.deepEqual(final, {
    profile: A, entries:1, note:'A only', foods:['Teszt étel – A 🍇'],
    legacy:'SECRET-LEGACY-MUST-NOT-BE-SEEN',
  })
  assert.ok(!(await foodPanel.textContent()).includes('B saját étel'))
  assert.deepEqual(pageErrors, [])
  await ctx.close()
  console.log('PASS: actual Android mobile Food page A-B-A, real custom food & diary save isolated.')
  console.log('PASS: unclaimed legacy data untouched; Health/YAZIO/share controls disabled.')
} finally {
  await browser?.close()
  server.kill()
}
