import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'

// Exercise the browser module with isolated DOM/Google/HTTP boundaries.
const source = readFileSync(new URL('../src/ebook-library.js', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replaceAll('import.meta.env', 'env').replace('export function', 'function')
function app(fetch) {
  const nodes = new Map()
  const element = () => ({ dataset: {}, children: [], addEventListener() {}, replaceChildren() { this.children = [] }, append(row) { this.children.push(row) }, querySelectorAll: () => [] })
  const document = { querySelector(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id) }, createElement: element, head: { append() {} } }
  const context = vm.createContext({ document, fetch, Blob, URL, URLSearchParams, crypto: webcrypto, QRCode: { async toCanvas(canvas, value) { canvas.qrValue = value } },
    env: { VITE_GOOGLE_CLIENT_ID: '123-client', VITE_GOOGLE_API_KEY: 'test-key', VITE_EBOOK_TRANSFER_BROKER_URL: 'https://broker.example/exec' },
    window: { location: { href: 'https://fabianpetermark-commits.github.io/Grapes/', origin: 'https://fabianpetermark-commits.github.io', search: '' } } })
  vm.runInContext(source + '\naccessToken = "test-token"', context)
  return { context, nodes, run: (code) => vm.runInContext(code, context) }
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const folder = () => json({ files: [{ id: 'folder' }] })

test('Connect requests only drive.file and loads the library after consent', async () => {
  const a = app(async url => url.includes('orderBy=') ? json({ files: [] }) : folder())
  let config; let requested = false
  a.context.window.google = { accounts: { oauth2: { initTokenClient(options) { config = options; return { requestAccessToken() { requested = true } } } } } }
  await a.run('connectDrive()')
  assert.ok(requested)
  assert.equal(config.scope, 'https://www.googleapis.com/auth/drive.file')
  await config.callback({ access_token: 'new-token' })
  assert.equal(a.run('accessToken'), 'new-token')
  assert.equal(a.nodes.get('#ebook-drive-connect').disabled, true)
  assert.equal(a.nodes.get('#ebook-status').dataset.kind, 'success')
})

test('refresh includes subsequent Drive pages', async () => {
  const a = app(async url => {
    if (!url.includes('orderBy=')) return folder()
    return new URL(url).searchParams.get('pageToken') === 'next'
      ? json({ files: [{ id: '2', name: 'second.pdf' }] })
      : json({ files: [{ id: '1', name: 'first.epub' }], nextPageToken: 'next' })
  })
  await a.run('refreshLibrary()')
  assert.equal(a.nodes.get('#ebook-list').children.length, 2)
})

test('multipart upload has real CRLF, preserves binary bytes, and refreshes immediately', async () => {
  let uploaded = false
  const a = app(async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    if (url.includes('/upload/')) {
      const boundary = options.headers['Content-Type'].split('boundary=')[1]
      const bytes = Buffer.from(await options.body.arrayBuffer())
      assert.ok(bytes.includes(Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`)))
      assert.ok(bytes.includes(Buffer.from('"parents":["folder"]')))
      assert.ok(bytes.includes(Buffer.from([0, 255, 128, 13, 10])))
      assert.ok(bytes.subarray(-boundary.length - 8).equals(Buffer.from(`\r\n--${boundary}--\r\n`)))
      uploaded = true
      return json({ id: 'new' })
    }
    if (url.includes('orderBy=')) { assert.ok(uploaded); return json({ files: [{ id: 'new', name: 'book.epub', size: 5 }] }) }
    return folder()
  })
  a.context.file = new Blob([new Uint8Array([0, 255, 128, 13, 10])]); a.context.file.name = 'book.epub'
  await a.run('uploadBook(file)')
  assert.equal(a.nodes.get('#ebook-list').children.length, 1)
  assert.equal(a.nodes.get('#ebook-status').dataset.kind, 'success')
})

test('Picker import copies external books and does not copy an existing library book', async () => {
  for (const parents of [['elsewhere'], ['folder']]) {
    const mutations = []
    const a = app(async (url, options) => {
      if (options.method) { mutations.push({ url, options }); return json({ id: 'copy' }) }
      if (url.includes('/files/original?')) return json({ id: 'original', name: 'phone.pdf', parents })
      if (url.includes('orderBy=')) return json({ files: [{ id: 'copy', name: 'phone.pdf' }] })
      return folder()
    })
    await a.run('importDriveBook("original")')
    assert.equal(mutations.length, parents[0] === 'folder' ? 0 : 1)
    if (mutations.length) {
      assert.ok(mutations[0].url.includes('/original/copy?'))
      assert.equal(mutations[0].options.method, 'POST')
      assert.deepEqual(JSON.parse(mutations[0].options.body), { name: 'phone.pdf', parents: ['folder'] })
    }
  }
})

test('expired token enables reconnect and reports actionable error', async () => {
  const a = app(async () => json({ error: { message: 'Expired' } }, 401))
  await a.run('refreshLibrary()')
  assert.equal(a.run('accessToken'), null)
  assert.equal(a.nodes.get('#ebook-drive-connect').disabled, false)
  assert.match(a.nodes.get('#ebook-status').textContent, /Csatlakoztasd újra/)
})

test('failed refresh after import is not overwritten with success', async () => {
  const a = app(async (url) => {
    if (url.includes('/files/original?')) return json({ id: 'original', name: 'book.pdf', parents: ['folder'] })
    if (url.includes('orderBy=')) return json({ error: { message: 'quota exceeded' } }, 403)
    return folder()
  })
  await a.run('importDriveBook("original")')
  assert.equal(a.nodes.get('#ebook-status').dataset.kind, 'error')
  assert.match(a.nodes.get('#ebook-status').textContent, /quota exceeded/)
})

test('failed Picker load can be retried', async () => {
  const a = app()
  let loads = 0
  a.context.window.gapi = { load(module, options) { assert.equal(module, 'picker'); ++loads === 1 ? options.onerror() : options.callback() } }
  await assert.rejects(a.run('loadGooglePicker()'))
  await a.run('loadGooglePicker()')
  assert.equal(loads, 2)
})

test('Picker receives token, developer key, project number, origin and reports dialog errors', async () => {
  const a = app()
  const settings = {}
  class Builder {
    setOAuthToken(v) { settings.token = v; return this }
    setDeveloperKey(v) { settings.key = v; return this }
    setAppId(v) { settings.app = v; return this }
    setOrigin(v) { settings.origin = v; return this }
    addView() { return this }
    setCallback(v) { settings.callback = v; return this }
    build() { return this }
    setVisible(v) { settings.visible = v }
  }
  a.context.window.google = { picker: { PickerBuilder: Builder, DocsView: class { setIncludeFolders() { return this } setSelectFolderEnabled() { return this } }, ViewId: { DOCS: 'docs' }, Response: { ACTION: 'action' }, Action: { ERROR: 'error', PICKED: 'picked' } } }
  await a.run('openDrivePicker()')
  assert.equal(settings.token, 'test-token'); assert.equal(settings.key, 'test-key'); assert.equal(settings.app, '123')
  assert.equal(settings.origin, 'https://fabianpetermark-commits.github.io'); assert.equal(settings.visible, true)
  await settings.callback({ action: 'error' })
  assert.equal(a.nodes.get('#ebook-status').dataset.kind, 'error')
})

test('transfer renders a download QR and offers a code plus a stable reader address', async () => {
  const calls = []
  const a = app(async (url, options) => { calls.push({ url, options }); return json(url.includes('permissions') ? {} : { name: 'book.pdf' }) })
  await a.run('sendBook("book")')
  assert.deepEqual(JSON.parse(calls[1].options.body), { type: 'anyone', role: 'reader', allowFileDiscovery: false })
  const broker = new URL(a.nodes.get('#ebook-transfer-pair').href)
  assert.equal(broker.searchParams.get('fileId'), 'book')
  assert.equal(broker.searchParams.get('returnUrl'), 'https://fabianpetermark-commits.github.io/Grapes/')
  assert.equal(a.nodes.get('#ebook-reader-url').value, 'https://fabianpetermark-commits.github.io/Grapes/?ebook-reader=1')
  assert.equal(a.nodes.get('#ebook-transfer-qr').qrValue, a.nodes.get('#ebook-transfer-url').value)
  assert.equal(a.nodes.get('#ebook-transfer-qr').hidden, false)
})

test('stable receiver opens without a book code and prefills incoming pair links', () => {
  const a = app()
  a.context.window.location.search = '?ebook-reader=1'
  a.run('handleTransferLink()')
  assert.equal(a.nodes.get('#ebook-receiver-panel').hidden, false)
  assert.equal(a.nodes.get('#ebook-receiver-download').hidden, true)
  a.context.window.location.search = '?ebook-pair=ABC234'
  a.run('handleTransferLink()')
  assert.equal(a.nodes.get('#ebook-receiver-input').value, 'ABC234')
  assert.equal(a.nodes.get('#ebook-receiver-download').hidden, false)
})

test('QR generation failure keeps link and pairing alternatives available', async () => {
  const a = app(async () => json({ name: 'book.pdf' }))
  a.context.QRCode.toCanvas = async () => { throw new Error('canvas unavailable') }
  await a.run('sendBook("book")')
  assert.equal(a.nodes.get('#ebook-transfer-panel').hidden, false)
  assert.equal(a.nodes.get('#ebook-transfer-qr').hidden, true)
  assert.match(a.nodes.get('#ebook-qr-status').textContent, /QR-kód nem készült el/)
  assert.ok(a.nodes.get('#ebook-transfer-pair').href)
})

const brokerSource = readFileSync(new URL('../apps-script/ebook-transfer/Code.gs', import.meta.url), 'utf8')
test('broker rejects private files and foreign return URLs, expires codes and rechecks sharing', () => {
  const records = new Map()
  let sharing = 'private'; let locked = false
  const props = { getProperty: k => records.get(k), setProperty(k, v) { assert.ok(locked); records.set(k, v) }, getProperties: () => Object.fromEntries(records), deleteProperty: k => records.delete(k) }
  const c = vm.createContext({
    HtmlService: { createHtmlOutput: s => s }, PropertiesService: { getScriptProperties: () => props },
    LockService: { getScriptLock: () => ({ waitLock() { locked = true }, releaseLock() { locked = false } }) },
    DriveApp: { Access: { ANYONE_WITH_LINK: 'public' }, getFileById: () => ({ getSharingAccess: () => sharing, getName: () => '<book>.pdf' }) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://broker.example/exec' }) },
  })
  vm.runInContext(brokerSource, c)
  assert.equal(vm.runInContext('typeof URL', c), 'undefined')
  const create = () => c.createTransferPage({ fileId: 'book', returnUrl: 'https://fabianpetermark-commits.github.io/Grapes/' })
  assert.match(create(), /nincs megosztva/); assert.equal(records.size, 0)
  sharing = 'public'
  assert.match(c.createTransferPage({ fileId: 'book', returnUrl: 'https://evil.example/Grapes/' }), /Érvénytelen/)
  for (const returnUrl of ['https://fabianpetermark-commits.github.io/Grapes/../other/', 'https://fabianpetermark-commits.github.io.evil.example/Grapes/', 'https://fabianpetermark-commits.github.io/Grapes/#fragment']) {
    assert.match(c.createTransferPage({ fileId: 'book', returnUrl }), /Érvénytelen/)
  }
  records.set('ebook_transfer_OLDOLD', JSON.stringify({ expiresAt: 0 }))
  assert.match(create(), /&lt;book&gt;/); assert.equal(records.size, 1); assert.equal(locked, false)
  const [key, raw] = [...records][0]; const code = key.slice('ebook_transfer_'.length); const record = JSON.parse(raw)
  assert.match(code, /^[A-Z0-9]{6}$/)
  assert.ok(Math.abs(record.expiresAt - Date.now() - 20 * 60 * 1000) < 1000)
  assert.match(c.resolveTransfer({ code }), /drive.usercontent.google.com/)
  sharing = 'private'; assert.doesNotMatch(c.resolveTransfer({ code }), /drive.usercontent.google.com/)
  records.set(key, JSON.stringify({ ...record, expiresAt: 0 }))
  assert.match(c.resolveTransfer({ code }), /Lejárt/); assert.equal(records.size, 0)
})


test('standalone e-reader page stays non-module and broker exposes persistent reader actions', () => {
  const reader = readFileSync(new URL('../public/ebook-reader.html', import.meta.url), 'utf8')
  assert.doesNotMatch(reader, /type=["']module["']/)
  assert.match(reader, /name="action" value="pair-reader"/)
  assert.match(reader, /grapes-ebook-reader-token/)
  assert.match(brokerSource, /create-reader-pairing/)
  assert.match(brokerSource, /pair-reader/)
  assert.match(brokerSource, /revoke-reader/)
  assert.match(brokerSource, /READER_TOKEN_TTL_MS/)
})
