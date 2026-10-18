import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../design/android-mobile-preview.html', import.meta.url), 'utf8')
const mobile = readFileSync(new URL('../src/food/food-mobile.js', import.meta.url), 'utf8')
const css = html.slice(html.indexOf('    .energy-ring {'), html.indexOf('    .daily-copy h2'))

test('active dash length is a number on a pathLength=100 circle', () => {
  assert.match(html, /class="energy-ring__progress"[^>]*pathLength="100"/)
  assert.match(css, /--energy-progress:\s*0;/)
  assert.match(css, /stroke-dasharray:\s*var\(--energy-progress\) 100;/)
  assert.ok(mobile.includes("energyRing.style.setProperty('--energy-progress', String(energyPercent))"))
  assert.doesNotMatch(mobile, /energyRing\.style\.setProperty\('--energy-progress',\s*\`\$\{energyPercent\}%\`\)/)
})

test('no visible active stroke if there is no goal, incomplete nutrients, or zero consumption', () => {
  assert.match(mobile, /hasCompleteEnergy = entries\.length > 0 && totals\.energyKcal != null/)
  assert.match(mobile, /energyRing\.dataset\.energyVisible = hasEnergyGoal && hasCompleteEnergy && energyPercent > 0/)
  assert.match(css, /data-energy-visible="false"[^}]*opacity:\s*0/s)
  assert.doesNotMatch(css, /(?:#8effff|#29d2eb|#b1ffff|#a7ffff)/i)
})
