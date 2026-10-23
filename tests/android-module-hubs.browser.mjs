import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const url = 'http://127.0.0.1:4186/Grapes/design/android-mobile-preview.html'
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync)
if (!executablePath) throw new Error('Chromium szükséges a Grapes menünavigáció tesztjéhez.')

const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4186', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
let serverOutput = ''
server.stdout.on('data', chunk => { serverOutput += String(chunk).slice(-1000) })
server.stderr.on('data', chunk => { serverOutput += String(chunk).slice(-1000) })
let browser
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) { ready = true; break } } catch {}
    await new Promise(done => setTimeout(done, 100))
  }
  if (!ready) throw new Error('Nem indult a menünavigáció tesztszervere: ' + serverOutput.slice(-1300))
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => localStorage.setItem('grapes-local-mode', '1'))
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  const providerRequests = []
  page.on('request', request => { if (/api\\.weatherapi\\.com/.test(request.url())) providerRequests.push(request.url()) })
  await page.route('https://aighqtqjlzirlokxwupt.supabase.co/functions/v1/weather-forecast/cached-forecast', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      source: 'WeatherAPI.com',
      cachedAt: new Date().toISOString(),
      stale: false, demoOnly: true, staticTestLocation: true,
      location: { name: 'Szentendre', country: 'Hungary' },
      current: { temperatureC: 12.4, condition: 'Felhős' },
      forecast: [
        { date: '2026-10-22', minTemperatureC: -2, maxTemperatureC: 14, precipitationMm: 1 },
        { date: '2026-10-23', minTemperatureC: 4, maxTemperatureC: 35, precipitationMm: 6 },
        { date: '2026-10-24', minTemperatureC: 6, maxTemperatureC: 17, precipitationMm: 0 },
      ],
    }) })
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.locator('[data-page="home"]').waitFor({ state: 'visible' })
  assert.deepEqual(await page.locator('[data-menu-group]').evaluateAll(nodes => nodes.map(x => x.dataset.menuGroup)),
    ['home', 'health', 'utility', 'finance'])
  assert.equal(await page.locator('[data-page="home"] .hub-card__icon svg').count(), 4)
  assert.match(await page.locator('[data-menu-group="health"]').textContent(), /Food.*Receptek.*Statisztika/)

  for (const width of [320, 360, 390, 412]) {
    await page.setViewportSize({ width, height: 844 })
    const { viewport, documentWidth } = await page.evaluate(() => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth }))
    assert.ok(documentWidth <= viewport, `Kilóg a főmenü ${width}px szélességen.`)
  }
  await page.setViewportSize({ width: 390, height: 844 })

  await page.locator('[data-menu-group="home"]').click()
  assert.equal(await page.locator('[data-page="hub-home"]').isVisible(), true)
  await page.locator('[data-page="hub-home"] [data-menu-destination="shopping"]').click()
  await page.locator('[data-page="household"]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-household-shopping]').isVisible(), true, 'Home lista a meglévő Home tárolót használja.')
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-home"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="hub-home"] [data-menu-destination="inventory"]').click()
  await page.locator('[data-page="household"]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-household-inventory]').isVisible(), true)
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-home"] [data-menu-back]').click()
  await page.locator('[data-page="home"]').waitFor({ state: 'visible' })

  await page.locator('[data-menu-group="health"]').click()
  await page.locator('[data-page="hub-health"] [data-menu-destination="recipes"]').click()
  await page.locator('[data-page="food"] [data-food-recipes-view]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-page="food"] [data-food-overview]').isVisible(), false)
  await page.locator('[data-food-recipes-back]').click()
  await page.locator('[data-page="hub-health"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="hub-health"] [data-menu-destination="stats"]').click()
  await page.locator('[data-food-stats-sheet].is-open').waitFor({ state: 'visible' })
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-health"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="hub-health"] [data-menu-destination="food"]').click()
  await page.locator('[data-page="food"] [data-food-overview]').waitFor({ state: 'visible' })
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-health"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="hub-health"] [data-menu-back]').click()

  await page.locator('[data-menu-group="utility"]').click()
  await page.locator('[data-page="hub-utility"] [data-menu-destination="ebook"]').click()
  await page.locator('[data-page="ebook"]').waitFor({ state: 'visible' })
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-utility"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="hub-utility"] [data-menu-back]').click()
  await page.locator('[data-menu-group="finance"]').click()
  assert.equal(await page.locator('[data-page="hub-finance"] [data-menu-destination="finance"]').count(), 1)
  await page.locator('[data-page="hub-finance"] [data-menu-back]').click()

  await page.locator('[data-menu-group="home"]').click()
  await page.locator('[data-page="hub-home"] [data-menu-destination="garden"]').click()
  await page.locator('[data-page="hub-outdoor"]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-page="hub-outdoor"] h1').textContent(), 'Növények')
  assert.equal(await page.locator('[data-page="hub-outdoor"] .outdoor-weather').count(), 1, 'Időjárás a Növények fejlécében, nem külön almodulkártyán.')
  await page.locator('[data-plants-weather-temperature]').filter({ hasText: '12,4' }).waitFor()
  assert.match(await page.locator('[data-plants-weather-status]').textContent(), /frissítve/)
  assert.match(await page.locator('[data-plants-weather-frost]').textContent(), /Fagy előfordulhat/)
  assert.match(await page.locator('[data-plants-weather-heat]').textContent(), /Hőség előfordulhat/)
  assert.match(await page.locator('[data-plants-weather-rain]').textContent(), /7 mm/)
  assert.equal(providerRequests.length, 0, 'A WeatherAPI szolgáltatói URL-je és kulcsa nem kerül a klienshez.')
  assert.match(await page.locator('[data-page="hub-outdoor"] .outdoor-tasks').textContent(), /Még nincs megjeleníthető teendő/)
  assert.equal(await page.locator('[data-page="hub-outdoor"] [data-menu-destination]').count(), 2)
  await page.locator('[data-page="hub-outdoor"] [data-menu-destination="plants"]').click()
  await page.locator('[data-page="outdoor-plants"]').waitFor({ state: 'visible' })
  assert.match(await page.locator('[data-page="outdoor-plants"] .outdoor-preview-label').textContent(), /Bemutató mód/)
  assert.equal(await page.locator('[data-outdoor-plant]').count(), 3)
  assert.equal(await page.locator('[data-outdoor-plant="chili-a"] .outdoor-plant-card__species').textContent(),
    await page.locator('[data-outdoor-plant="chili-b"] .outdoor-plant-card__species').textContent(),
    'Azonos fajból lehet két külön példány.')
  await page.locator('[data-outdoor-plant="chili-a"]').click()
  await page.locator('[data-page="outdoor-detail"]').waitFor({ state: 'visible' })
  assert.match(await page.locator('[data-outdoor-fact="name"]').textContent(), /1\. példány/)
  assert.match(await page.locator('[data-outdoor-fact="place"]').textContent(), /Terasz/)
  assert.equal(await page.locator('[data-outdoor-panel="overview"]').isVisible(), true)
  await page.locator('[data-outdoor-tab="overview"]').focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.locator('[data-outdoor-panel="care"]').isVisible(), true, 'Billentyűzettel váltható a gondozás fül.')
  assert.match(await page.locator('[data-outdoor-panel="care"]').textContent(), /Még nincs/)
  await page.locator('[data-outdoor-tab="journal"]').click()
  assert.equal(await page.locator('[data-outdoor-panel="journal"]').isVisible(), true)
  await page.locator('[data-outdoor-tab="photos"]').click()
  assert.equal(await page.locator('[data-outdoor-panel="photos"]').isVisible(), true)
  assert.equal(await page.locator('[data-outdoor-tab]').count(), 4, 'A szaporítás későbbre halasztva; az eredeti négy fül marad.')
  assert.equal(await page.locator('[data-outdoor-tab="propagation"]').count(), 0)

  for (const width of [320, 360, 390, 412]) {
    await page.setViewportSize({ width, height: 844 })
    const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
    assert.ok(layout.document <= layout.viewport, `Az Outdoor adatlap kilóg ${width}px szélességen.`)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="outdoor-plants"]').waitFor({ state: 'visible' })
  await page.locator('[data-outdoor-plant="chili-b"]').click()
  assert.match(await page.locator('[data-outdoor-fact="name"]').textContent(), /2\. példány/)
  assert.match(await page.locator('[data-outdoor-fact="place"]').textContent(), /Ablakpárkány/)
  assert.equal(await page.locator('[data-outdoor-tab="overview"]').getAttribute('aria-selected'), 'true',
    'Új növény megnyitásakor az Áttekintés fület nyitjuk meg.')
  await page.locator('[data-outdoor-detail-back]').click()
  await page.locator('[data-page="outdoor-plants"]').waitFor({ state: 'visible' })
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('grapes-outdoor'))), false,
    'A bemutató felület nem írhat felhasználói növényadatot.')
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-outdoor"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="hub-outdoor"] [data-menu-destination="catalog"]').click()
  await page.locator('[data-page="outdoor-catalog"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="outdoor-catalog"] [data-outdoor-back]').click()
  await page.locator('[data-page="hub-outdoor"]').waitFor({ state: 'visible' })
  await page.evaluate(() => window.grapesHandleAndroidBack())
  await page.locator('[data-page="hub-home"]').waitFor({ state: 'visible' })
  await page.locator('[data-page="hub-home"] [data-menu-back]').click()
  await page.locator('[data-page="home"]').waitFor({ state: 'visible' })

  await page.locator('.bottom-nav [data-nav="projects"]').click()
  await page.locator('[data-page="projects"]').waitFor({ state: 'visible' })
  await page.locator('.bottom-nav [data-nav="home"]').click()
  assert.equal(await page.locator('[data-page="home"]').isVisible(), true)
  assert.deepEqual(pageErrors, [])
  console.log('Grapes Home/Növények: weather cache, 4 plant detail tabs, 2x2 main menu, navigation, 320–412 px, existing modules OK')
} finally {
  await browser?.close()
  server.kill()
}
