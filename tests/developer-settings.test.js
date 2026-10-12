import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  DEVELOPER_UNLOCK_KEY,
  MODULE_DEFINITIONS,
  enableAllModules,
  isDeveloperEmail,
  isDeveloperPin,
  isDeveloperSessionUnlocked,
  isModuleEnabled,
  lockDeveloperSession,
  setModuleEnabled,
  unlockDeveloperSession,
} from '../src/developer-settings.js'
import {
  ensureDeveloperOwner,
  removeRegisteredUser,
  upsertRegisteredUser,
} from '../src/developer-users.js'

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

test('a fejlesztői PIN pontosan négy számjegy és csak a munkamenetben old fel', () => {
  const storage = memoryStorage()
  assert.equal(isDeveloperPin('2026', '2026'), true)
  assert.equal(isDeveloperPin(' 2026 ', '2026'), true)
  assert.equal(isDeveloperPin('202', '2026'), false)
  assert.equal(isDeveloperPin('abcd', 'abcd'), false)
  assert.equal(isDeveloperSessionUnlocked('projectsoundmodel@gmail.com', storage), false)
  unlockDeveloperSession(' ProjectSoundModel@gmail.com ', storage)
  assert.equal(storage.getItem(DEVELOPER_UNLOCK_KEY), 'projectsoundmodel@gmail.com')
  assert.equal(isDeveloperSessionUnlocked('projectsoundmodel@gmail.com', storage), true)
  assert.equal(isDeveloperSessionUnlocked('other@example.com', storage), false)
  lockDeveloperSession(storage)
  assert.equal(isDeveloperSessionUnlocked('projectsoundmodel@gmail.com', storage), false)
})

test('a fejlesztői felhasználólista hozzáad, frissít és védi a tulajdonost', () => {
  const owner = 'projectsoundmodel@gmail.com'
  let users = ensureDeveloperOwner([], owner)
  assert.equal(users.length, 1)
  assert.equal(users[0].role, 'owner')
  users = upsertRegisteredUser(users, { name: 'Teszt Elek', email: 'TEST@example.com' }, owner)
  assert.equal(users.find(user => user.email === 'test@example.com').name, 'Teszt Elek')
  users = upsertRegisteredUser(users, { name: 'Friss Név', email: 'test@example.com' }, owner)
  assert.equal(users.length, 2)
  assert.equal(users.find(user => user.email === 'test@example.com').name, 'Friss Név')
  assert.throws(() => removeRegisteredUser(users, owner, owner), /nem távolítható el/)
  assert.equal(removeRegisteredUser(users, 'test@example.com', owner).length, 1)
})

test('a shell látható, de blokkolható modulokat és központi státuszt tartalmaz', async () => {
  const root = new URL('../', import.meta.url)
  const [html, screens, status, backlog] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('src/screens.js', root), 'utf8'),
    readFile(new URL('PROJECT_STATUS.md', root), 'utf8'),
    readFile(new URL('PROJECT_BACKLOG.md', root), 'utf8'),
  ])
  assert.match(html, /id="developer-menu-toggle"[^>]*hidden/)
  assert.match(html, /id="developer-panel"[^>]*hidden/)
  assert.match(html, /id="developer-pin-gate"[^>]*hidden/)
  assert.match(html, /id="developer-user-form"/)
  assert.match(html, /id="developer-backlog-content"/)
  assert.equal((html.match(/data-module-key=/g) || []).length, 9)
  assert.match(screens, /!isModuleEnabled\(name\)\) name = 'splash'/)
  for (const heading of ['Közös platform', '3D Nyomtatási Stúdió', 'E-book', 'Pénzügy', 'Food ételnapló']) {
    assert.match(status, new RegExp(heading))
  }
  for (const heading of ['kiadás és hozzáférés', '3D Nyomtatási Stúdió', 'E-book', 'Pénzügy', 'Food ételnapló']) {
    assert.match(backlog, new RegExp(heading, 'i'))
  }
})
