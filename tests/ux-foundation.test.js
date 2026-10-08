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

test('responsive overflow keeps secondary actions in a keyboard-dismissible menu', async () => {
  const source = await read('src/ui/responsive-overflow.js')
  assert.match(source, /window\.matchMedia/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /marker\.parentNode\?\.insertBefore/)
})

test('finance and billing use responsive task-oriented layouts', async () => {
  const [financeSource, financeCss, billingSource, billingCss] = await Promise.all([
    read('src/finance-tracker.js'), read('src/styles/screens/finance-tracker.css'),
    read('src/billing-studio.js'), read('src/styles/screens/billing.css'),
  ])
  assert.match(financeSource, /cell\.dataset\.label/)
  assert.match(financeSource, /createResponsiveOverflow/)
  assert.match(financeCss, /content:\s*attr\(data-label\)/)
  assert.match(financeCss, /\.finance__tabs/)
  assert.match(financeSource, /setFinanceTab/)
  assert.match(billingSource, /<fieldset class="billing__section"><legend>Alapadatok/)
  assert.match(billingSource, /class="billing__document-footer"/)
  assert.match(billingCss, /\.billing__document-footer\s*\{[^}]*position:sticky/)
})

test('finance deletes all transactions only after creating a safety export', async () => {
  const [markup, source] = await Promise.all([read('index.html'), read('src/finance-tracker.js')])
  assert.match(markup, /id="finance-delete-all"[^>]*btn--danger[^>]*disabled/)
  assert.match(source, /#finance-delete-all[\s\S]*saveSafetySnapshot\(DELETE_BACKUP_ID[\s\S]*financeBackupToJson\(snapshot\)[\s\S]*window\.confirm[\s\S]*transactions = \[\]/)
  assert.match(source, /penzugyi-naplo-teljes-mentes-/)
  assert.match(markup, /id="finance-backup-input"/)
  assert.match(markup, /id="finance-restore-last"/)
})
