import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  MODULE_DEFINITIONS,
  enableAllModules,
  isDeveloperEmail,
  isModuleEnabled,
  setModuleEnabled,
} from '../src/developer-settings.js'

function memoryStorage() {
  const data = new Map()
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  }
}

test('a fejlesztői menü csak pontos, normalizált e-mail-egyezést fogad el', () => {
  assert.equal(isDeveloperEmail(' ProjectSoundModel@Example.com ', 'projectsoundmodel@example.com'), true)
  assert.equal(isDeveloperEmail('other@example.com', 'projectsoundmodel@example.com'), false)
  assert.equal(isDeveloperEmail('projectsoundmodel@example.com', ''), false)
})

test('minden modul alapból aktív, külön kikapcsolható és visszaállítható', () => {
  const storage = memoryStorage()
  assert.ok(MODULE_DEFINITIONS.length >= 8)
  for (const module of MODULE_DEFINITIONS) assert.equal(isModuleEnabled(module.key, storage), true)
  setModuleEnabled('food', false, storage)
  assert.equal(isModuleEnabled('food', storage), false)
  assert.equal(isModuleEnabled('finance', storage), true)
  enableAllModules(storage)
  assert.equal(isModuleEnabled('food', storage), true)
})

test('a shell látható, de blokkolható modulokat és központi státuszt tartalmaz', async () => {
  const root = new URL('../', import.meta.url)
  const [html, screens, status] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('src/screens.js', root), 'utf8'),
    readFile(new URL('PROJECT_STATUS.md', root), 'utf8'),
  ])
  assert.match(html, /id="developer-menu-toggle"[^>]*hidden/)
  assert.match(html, /id="developer-panel"[^>]*hidden/)
  assert.equal((html.match(/data-module-key=/g) || []).length, 9)
  assert.match(screens, /!isModuleEnabled\(name\)\) name = 'splash'/)
  for (const heading of ['Közös platform', '3D Nyomtatási Stúdió', 'E-book', 'Pénzügy', 'Food ételnapló']) {
    assert.match(status, new RegExp(heading))
  }
})
