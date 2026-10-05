import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright-core'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = 'http://127.0.0.1:4173'
const viewports = [360, 390, 768, 1024, 1440]
const modules = [
  ['splash', '#splash-screen'],
  ['ebook', '#ebook-app'],
  ['email', '#email-app'],
  ['brochure', '#fabric-app'],
  ['qr', '#qr-app'],
  ['studio', '#studio-app'],
  ['finance', '#finance-app'],
  ['billing', '#billing-app'],
]

const executableCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const executablePath = executableCandidates.find(existsSync)
if (!executablePath) {
  throw new Error('Nem található Chromium-alapú böngésző. Állítsd be a PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH változót.')
}

function startServer() {
  return spawn(process.execPath, [resolve(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
    cwd: projectRoot,
    env: { ...process.env, VITE_GOOGLE_CLIENT_ID: 'ux-test-client' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function waitForServer(server) {
  let output = ''
  server.stdout.on('data', chunk => { output += chunk })
  server.stderr.on('data', chunk => { output += chunk })
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`A Vite nem indult el.\n${output}`)
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {}
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  throw new Error(`A Vite nem lett elérhető időben.\n${output}`)
}

async function seedTestSession(context) {
  await context.addInitScript(() => {
    sessionStorage.setItem('grapes-drive-session', JSON.stringify({
      clientId: 'ux-test-client',
      accessToken: 'ux-test-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
      scopes: 'https://www.googleapis.com/auth/drive.file',
      account: { name: 'UX Test', email: 'ux@example.com', photo: '' },
    }))
  })
  await context.route('https://www.googleapis.com/**', async route => {
    const url = route.request().url()
    const payload = url.includes('/about')
      ? { user: { displayName: 'UX Test', emailAddress: 'ux@example.com' } }
      : { files: [] }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
  })
  await context.route('https://accounts.google.com/**', route => route.abort())
}

async function inspectLayout(page, moduleName, screenSelector, width) {
  await page.goto(`${baseUrl}/?module=${moduleName}`, { waitUntil: 'domcontentloaded' })
  await page.locator(screenSelector).waitFor({ state: 'visible', timeout: 15000 })
  // A nagyobb, dinamikusan importált szerkesztők a képernyő megjelenése után
  // töltik be a saját CSS-üket és inicializációjukat.
  await page.waitForTimeout(750)

  const result = await page.evaluate(({ screenSelector, mobile }) => {
    const screen = document.querySelector(screenSelector)
    const root = document.documentElement
    const visible = element => {
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && box.width > 0 && box.height > 0
    }
    const interactive = [...screen.querySelectorAll('button, [role="button"], input:not([type="hidden"]), select')]
      .filter(visible)
      .filter(element => !element.closest('[inert]'))
      .filter(element => !element.closest('.canvas-container, .gjs-cv-canvas'))
    const targets = mobile
      ? interactive.map(element => {
            const box = element.getBoundingClientRect()
            return {
              label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 50) || element.id,
              width: Math.round(box.width),
              height: Math.round(box.height),
            }
          })
      : []

    return {
      viewportWidth: window.innerWidth,
      rootScrollWidth: root.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      screenScrollWidth: screen.scrollWidth,
      screenClientWidth: screen.clientWidth,
      screenOverflowX: getComputedStyle(screen).overflowX,
      smallTargets: targets.filter(target => target.width < 44 || target.height < 44).slice(0, 12),
      clippedTargets: interactive.map(element => {
        const box = element.getBoundingClientRect()
        return {
          label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 50) || element.id,
          left: Math.round(box.left),
          right: Math.round(box.right),
        }
      }).filter(target => target.left < -1 || target.right > window.innerWidth + 1).slice(0, 12),
      visibleButtons: targets.length,
    }
  }, { screenSelector, mobile: width <= 768 })

  assert.ok(
    result.rootScrollWidth <= result.viewportWidth + 1 && result.bodyScrollWidth <= result.viewportWidth + 1,
    `${moduleName} ${width}px: vízszintes oldaltúlcsordulás (${JSON.stringify(result)})`,
  )
  if (['auto', 'scroll'].includes(result.screenOverflowX)) {
    assert.ok(
      result.screenScrollWidth <= result.screenClientWidth + 1,
      `${moduleName} ${width}px: a modul vízszintesen görgethető (${JSON.stringify(result)})`,
    )
  }
  assert.deepEqual(result.clippedTargets, [], `${moduleName} ${width}px: levágott elsődleges művelet`)
  if (width <= 768 && result.visibleButtons > 0) {
    assert.deepEqual(result.smallTargets, [], `${moduleName} ${width}px: 44px-nél kisebb érintési célok`)
  }
}

const server = startServer()
let browser
try {
  await waitForServer(server)
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--disable-gpu', '--no-sandbox'],
  })

  for (const width of viewports) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await seedTestSession(context)
    const page = await context.newPage()
    for (const [moduleName, selector] of modules) {
      await inspectLayout(page, moduleName, selector, width)
    }
    await context.close()
    console.log(`✓ ${width}px: ${modules.length} nézet`)
  }
} finally {
  await browser?.close().catch(() => {})
  server.kill()
}
