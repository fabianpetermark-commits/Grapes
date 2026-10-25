import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const browserBinary = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
assert.ok(browserBinary, 'Chromium required for owner-scoped Food')
const port = 4228
const url = `http://127.0.0.1:${port}/Grapes/tests/fixtures/grapes-test-outbox.html`
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (server.exitCode !== null || i === 99) throw Error('Food fixture unavailable')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath: browserBinary, headless: true,
    args: ['--no-sandbox'] })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(url)
  const result = await page.evaluate(async () => {
    const { openGrapesTestFreshFood } =
      await import('/Grapes/src/food/grapes-test-fresh-food.js')
    const { saveLocalProject, loadLocalProject } =
      await import('/Grapes/src/storage/local-project-store.js')
    const A = '00000000-0000-4000-8000-000000000001'
    const B = '00000000-0000-4000-8000-000000000002'
    let account = A, loggedIn = true
    const args = { enabled: true, isAndroid: () => true,
      authEnabled: async () => loggedIn,
      getSubject: async () => account }
    await saveLocalProject({ id: 'food-tracker-' + A, module: 'Ételnapló',
      data: { marker: 'GLOBAL-UNCLAIMED-MUST-NOT-COPY', profile: { id: A } } })

    const a = await openGrapesTestFreshFood(args)
    const first = await a.load()
    const initialEmpty = first.diaryEntries.length === 0 &&
      first.customFoods.length === 0 && first.profile.id === A

    first.customFoods.push({
      id: 'food-qa', kind: 'manual', name: 'Teszt zabpehely',
      nutrients: { energyKcal: 380, protein: 12, carbohydrate: 68, fat: 7 },
    })
    first.recipes.push({
      id: 'recipe-qa', ownerProfileId: A, foodId: 'food-recipe-qa',
      name: 'Zabpelyhes próba', ingredients: [{
        id: 'ingredient-qa', foodId: 'food-qa', amount: 100, unit: 'g',
      }],
      instructions: 'Teszt recept',
    })
    first.diaryEntries.push({
      id: 'entry-qa', profileId: A, mealType: 'breakfast',
      occurredAt: '2026-10-25T08:00:00.000Z', amount: 100, unit: 'g',
      snapshot: { foodId: 'food-qa', name: 'Teszt zabpehely', baseAmount: 100,
        baseUnit: 'g', nutrients: { energyKcal: 380, protein: 12,
          carbohydrate: 68, fat: 7 } },
    })
    const p1 = a.save(first)
    const second = structuredClone(first)
    second.diaryEntries[0].note = 'A üresből módosítás'
    const p2 = a.save(second)
    const [s1, s2] = await Promise.all([p1,p2])
    const aPersisted = await a.load()

    account = B
    let aStaleDenied = false
    try { await a.save(second) } catch { aStaleDenied = true }
    const b = await openGrapesTestFreshFood(args)
    const bFirst = await b.load()
    const bBlank = !bFirst.diaryEntries.length && !bFirst.recipes.length &&
      bFirst.profile.id === B
    bFirst.customFoods.push({ id: 'food-b', kind: 'manual',
      name: 'Teszt körte', nutrients: { energyKcal: 60 } })
    await b.save(bFirst)
    const bPersisted = await b.load()
    let foreignDiaryDenied = false
    try {
      const bad = structuredClone(bPersisted)
      bad.diaryEntries.push(structuredClone(first.diaryEntries[0]))
      await b.save(bad)
    } catch { foreignDiaryDenied = true }
    let foreignRecipeDenied = false
    try {
      const bad = structuredClone(bPersisted)
      bad.customFoods.push({ ...first.customFoods[0] })
      bad.recipes.push({ ...first.recipes[0] })
      await b.save(bad)
    } catch { foreignRecipeDenied = true }
    let importDenied = false
    try {
      const bad = structuredClone(bPersisted)
      bad.importBatches = [{ id: 'import-qa', source: 'yazio' }]
      await b.save(bad)
    } catch { importDenied = true }
    account = A
    const aReturning = await (await openGrapesTestFreshFood(args)).load()
    const bRefStillBlocked = await b.save(bPersisted).then(() => false, () => true)

    const actor1 = await openGrapesTestFreshFood(args)
    const actor2 = await openGrapesTestFreshFood(args)
    const oneBefore = await actor1.load()
    const twoBefore = await actor2.load()
    await actor1.save({ ...oneBefore, settings: { source: 'first' } })
    let conflictDenied = false
    try { await actor2.save({ ...twoBefore, settings: { source: 'stale' } }) }
    catch { conflictDenied = true }
    let poisonedDenied = false
    try { await actor2.save(twoBefore) } catch { poisonedDenied = true }
    loggedIn = false
    let logoutDenied = false
    try { await actor1.load() } catch { logoutDenied = true }
    let newOpenDenied = false
    try { await openGrapesTestFreshFood(args) } catch { newOpenDenied = true }
    const legacyStillThere = (await loadLocalProject('food-tracker-' + A))
      ?.data?.marker === 'GLOBAL-UNCLAIMED-MUST-NOT-COPY'
    return {
      initialEmpty, sequentialRevision: s2.revision === s1.revision + 1,
      aPersistedNote: aPersisted.diaryEntries[0].note,
      aRecipeCount: aPersisted.recipes.length,
      bBlank, bFoodName: bPersisted.customFoods[0].name,
      aStaleDenied, bRefStillBlocked, foreignDiaryDenied, foreignRecipeDenied,
      importDenied, aReturningNote: aReturning.diaryEntries[0].note,
      aReturningRecipe: aReturning.recipes[0].name,
      conflictDenied, poisonedDenied, logoutDenied, newOpenDenied,
      legacyStillThere,
    }
  })
  assert.deepEqual(result, {
    initialEmpty: true, sequentialRevision: true,
    aPersistedNote: 'A üresből módosítás', aRecipeCount: 1,
    bBlank: true, bFoodName: 'Teszt körte', aStaleDenied: true,
    bRefStillBlocked: true, foreignDiaryDenied: true, foreignRecipeDenied: true,
    importDenied: true, aReturningNote: 'A üresből módosítás',
    aReturningRecipe: 'Zabpelyhes próba',
    conflictDenied: true, poisonedDenied: true, logoutDenied: true,
    newOpenDenied: true, legacyStillThere: true,
  })
  await ctx.close()
  console.log('PASS: fresh Food A-B-A stores diary, custom food and recipes, never imports legacy.')
  console.log('PASS: reject cross-account entries/recipes, YAZIO import, CAS collision and stale owner.')
} finally {
  await browser?.close()
  server.kill()
}
