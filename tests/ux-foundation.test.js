import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('shared UX foundation provides touch targets and semantic async states', async () => {
  const [tokens, buttons, fields, status] = await Promise.all([
    read('src/styles/tokens.css'), read('src/styles/components/button.css'),
    read('src/styles/components/field.css'), read('src/ui/status.js'),
  ])
  assert.match(tokens, /--touch-target:\s*44px/)
  assert.match(buttons, /min-height:\s*var\(--touch-target\)/)
  assert.match(fields, /min-height:\s*var\(--touch-target\)/)
  for (const state of ['loading', 'saving', 'saved', 'success', 'error', 'empty', 'disabled']) assert.match(status, new RegExp(`'${state}'`))
})

test('mobile toolbars keep primary actions visible without horizontal scrolling', async () => {
  const toolbar = await read('src/styles/components/toolbar.css')
  assert.match(toolbar, /@media \(width <= 768px\)[\s\S]*\.toolbar\s*\{[\s\S]*overflow:\s*visible/)
  assert.doesNotMatch(toolbar, /@media \(width <= 768px\)[\s\S]*overflow-x:\s*auto/)
  assert.match(toolbar, /\[data-mobile-secondary\]/)
})
