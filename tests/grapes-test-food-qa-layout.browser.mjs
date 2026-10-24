import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

// Render the real, unchanged CSS and QA section from the shipping HTML,
// without booting the app, credentials, native bridge or Supabase.
const html = readFileSync(new URL('../design/android-mobile-preview.html', import.meta.url), 'utf8')
const styles = [...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/g)].map(match => match[0]).join('\n')
const section = html.match(/<section class="sync-status" data-grapes-test-food-qa hidden[\s\S]*?<\/section>/)?.[0]
assert.ok(styles && section, 'Shipping CSS and actual Food QA panel must exist')
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
assert.ok(executablePath, 'Chromium required to measure narrow-device Food QA layout')

const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
try {
  for (const width of [320, 360, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 1 })
    await page.setContent('<!doctype html><html lang="hu"><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
      styles + '</head><body><main class="content module-preview">' + section + '</main></body></html>')
    await page.locator('[data-grapes-test-food-qa]').evaluate(el => { el.hidden = false })
    const result = await page.evaluate(() => {
      const panel = document.querySelector('[data-grapes-test-food-qa]')
      const panelRect = panel.getBoundingClientRect()
      const buttons = [...panel.querySelectorAll('.grapes-test-food-action')].map(button => {
        const rect = button.getBoundingClientRect()
        const styles = getComputedStyle(button)
        return { width: rect.width, height: rect.height, display: styles.display,
          text: button.textContent.trim(), scrollWidth: button.scrollWidth,
          clientWidth: button.clientWidth }
      })
      return { width: panelRect.width, buttons }
    })
    assert.equal(result.buttons.length, 4, 'Three Food steps plus one read-only isolation button')
    assert.ok(result.width > 220, 'QA panel is visible at phone width')
    for (const button of result.buttons) {
      assert.equal(button.display, 'block', 'No 42px settings icon grid')
      assert.ok(button.width >= result.width - 45, 'Button must fill panel content width')
      assert.ok(button.height >= 52, 'Touch target must be at least 52px high')
      assert.ok(button.scrollWidth <= button.clientWidth + 1, 'No horizontally clipped text')
      assert.ok(button.text.length > 10)
    }
    await page.close()
  }
  console.log('PASS: real Food QA HTML/CSS displays full-width readable action buttons at 320–390px')
} finally {
  await browser.close()
}
