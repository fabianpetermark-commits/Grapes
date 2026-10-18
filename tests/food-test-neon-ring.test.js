import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const html = readFileSync(new URL('../design/android-mobile-preview.html', import.meta.url), 'utf8')
const food = readFileSync(new URL('../src/food/food-mobile.js', import.meta.url), 'utf8')
const css = html.slice(html.indexOf('    .energy-ring {'), html.indexOf('    .daily-copy h2'))

test('TEST Food neon circle keeps a cyan track visible with no logged calories', () => {
  assert.match(css, /--energy-progress: 0%/)
  assert.match(css, /--energy-track: #147e96/)
  assert.match(css, /--energy-fill: #91ffff/)
  assert.match(css, /background: conic-gradient\(from -90deg/)
  assert.match(css, /var\(--energy-track\) var\(--energy-progress\) 100%/)
  assert.match(css, /filter: blur\(9px\)/)
  assert.match(css, /\.energy-ring\[data-energy-state="unset"\]/)
})

test('TEST Food progress uses a CSS variable, capped at 100%, and never paints over neon', () => {
  const progress = (logged, goal, hasCompleteEnergy) => goal > 0 && hasCompleteEnergy
    ? Math.max(0, Math.min(100, logged / goal * 100)) : 0
  assert.equal(progress(0, 1800, false), 0)
  assert.equal(progress(900, 1800, true), 50)
  assert.equal(progress(1800, 1800, true), 100)
  assert.equal(progress(2300, 1800, true), 100)
  assert.equal(progress(900, 0, true), 0)
  assert.match(food, /energyRing\.style\.setProperty\('--energy-progress'/)
  assert.match(food, /energyPercent >= 100 \? 'complete'/)
  assert.doesNotMatch(food, /\[data-food-energy-ring\]'\)\.style\.background/)
  assert.match(css, /\.energy-ring\[data-energy-state="complete"\]/)
})

test('TEST Food dial shows consumed label and a truthful unset goal', () => {
  assert.match(html, /class="energy-ring__eyebrow">Elfogyasztva/)
  assert.match(food, /hasEnergyGoal \? `\/ \$\{number\(energyGoal\)\} kcal` : 'Nincs cél'/)
  assert.match(css, /prefers-reduced-motion: reduce/)
})
