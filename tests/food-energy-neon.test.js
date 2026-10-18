import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../design/android-mobile-preview.html', import.meta.url), 'utf8')
const mobile = readFileSync(new URL('../src/food/food-mobile.js', import.meta.url), 'utf8')

test('Food ring keeps a visible cyan neon rim even for empty or unset daily goals', () => {
  assert.match(html, /\.energy-ring\s*\{[^}]*--energy-progress:\s*0%;/s)
  assert.match(html, /\.energy-ring\s*\{[^}]*conic-gradient\(from -90deg,/s)
  assert.match(html, /\.energy-ring\s*\{[^}]*box-shadow:/s)
  assert.match(html, /\.energy-ring::after\s*\{[^}]*radial-gradient\(/s)
  assert.match(html, /\.energy-ring__value\s*>\s*span\s*\{[^}]*font-size:/s)
  assert.match(html, /\.energy-ring:focus-visible\s*\{/)
  assert.match(html, /prefers-reduced-motion:\s*reduce/)
  assert.match(html, /data-food-energy-ring/)
})

test('Food progress updates its CSS variable, never wipes the neon gradient with an inline background', () => {
  assert.match(mobile, /energyRing\.style\.setProperty\('--energy-progress',\s*`\$\{energyPercent\}%`\)/)
  assert.match(mobile, /Math\.max\(0,\s*Math\.min\(100,\s*loggedEnergy\s*\/\s*energyGoal\s*\*\s*100\)\)/)
  assert.match(mobile, /energyRing\.dataset\.energyState/)
  assert.doesNotMatch(mobile, /\['data-food-energy-ring'\]\)\.style\.background\s*=/)
})
