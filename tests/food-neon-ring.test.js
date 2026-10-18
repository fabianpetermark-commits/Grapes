import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../design/android-mobile-preview.html', import.meta.url), 'utf8')
const mobile = readFileSync(new URL('../src/food/food-mobile.js', import.meta.url), 'utf8')
const styles = html.slice(html.indexOf('    .energy-ring {'), html.indexOf('    .daily-copy h2'))

test('bright cyan ring remains visibly colored even when progress is 0%', () => {
  assert.match(styles, /--energy-progress:\s*0%/)
  assert.match(styles, /--energy-track:\s*#147e96/)
  assert.match(styles, /--energy-fill:\s*#91ffff/)
  assert.match(styles, /conic-gradient\(from -90deg/)
  assert.match(styles, /var\(--energy-track\) var\(--energy-progress\) 100%/)
  assert.match(styles, /::before\s*\{[\s\S]*?filter:\s*blur\(9px\)/)
  assert.match(styles, /0 0 34px rgb\(23 192 237 \/ 42%\)/)
})

test('50% renders the genuine percentage and 100% adds stronger glow', () => {
  const progress = (calories, goal) => Number.isFinite(goal) && goal > 0
    ? Math.max(0, Math.min(100, calories / goal * 100)) : 0
  assert.equal(progress(0, 1800), 0)
  assert.equal(progress(900, 1800), 50)
  assert.equal(progress(1800, 1800), 100)
  assert.equal(progress(2300, 1800), 100)
  assert.equal(progress(900, 0), 0)
  assert.match(mobile, /energyRing\.style\.setProperty\('--energy-progress', `\$\{energyPercent\}%`\)/)
  assert.match(mobile, /energyPercent >= 100 \? 'complete'/)
  assert.match(styles, /\.energy-ring\[data-energy-state="complete"\][\s\S]*?--energy-fill:\s*#a7ffff/)
  assert.doesNotMatch(mobile, /energyRing\.style\.(?:background|backgroundImage)\s*=/)
})

test('ring reports consumed calories and never fabricates an unset goal', () => {
  assert.match(html, /class="energy-ring__eyebrow">Elfogyasztva</)
  assert.match(html, /data-food-energy-target/)
  assert.match(mobile, /hasEnergyGoal \? `\/ \$\{number\(energyGoal\)\} kcal` : 'Nincs cél'/)
  assert.match(styles, /prefers-reduced-motion: reduce/)
})
