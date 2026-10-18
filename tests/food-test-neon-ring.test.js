import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../design/android-mobile-preview.html', import.meta.url), 'utf8')
const mobile = readFileSync(new URL('../src/food/food-mobile.js', import.meta.url), 'utf8')
const styles = html.slice(html.indexOf('    .energy-ring {'), html.indexOf('    .daily-copy h2'))

test('the brand ring uses independent SVG track and active strokes', () => {
  assert.match(html, /<svg class="energy-ring__svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">/)
  assert.match(html, /<circle class="energy-ring__track" cx="50" cy="50" r="43"\/>/)
  assert.match(html, /<circle class="energy-ring__progress" cx="50" cy="50" r="43" pathLength="100"\/>/)
  assert.match(styles, /\.energy-ring__track\s*\{\s*stroke:\s*var\(--line\);\s*\}/)
  assert.match(styles, /\.energy-ring__progress\s*\{[^}]*stroke:\s*var\(--accent\)/s)
  assert.match(styles, /stroke-dasharray:\s*var\(--energy-progress\) 100/)
  assert.match(styles, /stroke-linecap:\s*round/)
  assert.match(styles, /transform:\s*rotate\(-90deg\)/)
  assert.doesNotMatch(styles, /conic-gradient|blur\(9px\)|#91ffff|#a7ffff|#147e96/i)
  assert.doesNotMatch(styles, /\.energy-ring::(?:before|after)\s*\{/)
})

test('glow is subtle on active stroke only; zero percent draws no rounded dot', () => {
  assert.match(styles, /\.energy-ring__progress\s*\{[^}]*filter:\s*drop-shadow\(0 0 3px rgb\(59 220 242 \/ 20%\)\)/s)
  assert.match(styles, /\.energy-ring\[data-energy-visible="false"\]\s+\.energy-ring__progress\s*\{[^}]*opacity:\s*0;[^}]*filter:\s*none/s)
  assert.doesNotMatch(styles, /\.energy-ring__track\s*\{[^}]*filter:/s)
  assert.doesNotMatch(styles, /\.energy-ring\s*\{[^}]*box-shadow:/s)
  assert.doesNotMatch(styles, /\[data-energy-state="complete"\][^{]*\{[^}]*filter:/s)
  assert.match(html, /data-food-energy-ring data-energy-visible="false"/)
  assert.match(mobile, /energyRing\.dataset\.energyVisible = hasEnergyGoal && hasCompleteEnergy && energyPercent > 0 \? 'true' : 'false'/)
})

test('0, 50, 100 percent and unknown inputs cannot create fake progress', () => {
  const progress = (logged, goal, known) => known && goal != null && goal > 0 && Number.isFinite(logged)
    ? Math.max(0, Math.min(100, logged / goal * 100)) : 0
  assert.equal(progress(0, 1800, true), 0)
  assert.equal(progress(900, 1800, true), 50)
  assert.equal(progress(1800, 1800, true), 100)
  assert.equal(progress(2300, 1800, true), 100)
  assert.equal(progress(900, null, true), 0)
  assert.equal(progress(NaN, 1800, true), 0)
  assert.equal(progress(900, 1800, false), 0)
  assert.match(mobile, /targets\.energyKcal != null && Number\.isFinite\(energyGoal\) && energyGoal > 0/)
  assert.match(mobile, /hasEnergyGoal && hasCompleteEnergy && Number\.isFinite\(loggedEnergy\)/)
  assert.match(mobile, /Math\.max\(0, Math\.min\(100, loggedEnergy \/ energyGoal \* 100\)\)/)
  assert.ok(mobile.includes("energyRing.style.setProperty('--energy-progress', String(energyPercent))"))
  assert.match(mobile, /energyRing\.dataset\.energyState = !hasEnergyGoal \|\| !hasCompleteEnergy \? 'unset'/)
  assert.doesNotMatch(mobile, /energyRing\.style\.(?:background|backgroundImage)\s*=/)
})

test('accessible stats button reports real calories/goal and supports reduced motion', () => {
  assert.match(html, /data-food-energy-ring[^>]*aria-label="Ételnapló statisztika megnyitása"/)
  assert.match(html, /class="energy-ring__eyebrow">Elfogyasztva/)
  assert.match(html, /data-food-energy-target>Nincs cél<\/span>/)
  assert.match(mobile, /hasEnergyGoal \? \`\/ \$\{number\(energyGoal\)\} kcal\` : 'Nincs cél'/)
  assert.ok(mobile.includes("$('[data-food-energy-ring]').addEventListener('click', openStats)"))
  assert.match(styles, /font-size:\s*11px/)
  assert.match(styles, /prefers-reduced-motion:\s*reduce/)
  assert.match(styles, /:focus-visible\s*\{/)
})
