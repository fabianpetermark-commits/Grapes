import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'

// Exercise the browser module with isolated DOM/Google/HTTP boundaries.
const source = readFileSync(new URL('../src/ebook-library.js', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replaceAll('import.meta.env', 'env').replace('export function', 'function')
const driveSource = readFileSync(new URL('../src/storage/grapes-drive.js', import.meta.url), 'utf8')
  .replaceAll('export ', '').replaceAll('import.meta.env', 'env')
function app(fetch, { connected = true, session = new Map(), local = new Map(), epubWriter = async () => new Blob(['rewritten epub']), pickerKey = '', booksKey = '' } = {}) {
  const nodes = new Map()
  const element = () => ({ dataset: {}, children: [], listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn }, removeAttribute(key) { delete this[key] }, replaceChildren() { this.children = [] }, append(row) { this.children.push(row) }, querySelectorAll: () => [] })
  const document = { querySelector(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id) }, createElement: element, head: { append() {} } }
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) })
  if (connected && !session.has('grapes-drive-session')) session.set('grapes-drive-session', JSON.stringify({ clientId: '123-client', accessToken: 'test-token', expiresAt: Date.now() + 3600000 }))
  const testSetTimeout = (callback, delay) => { const timer = setTimeout(callback, delay); timer.unref?.(); return timer }
  const context = vm.createContext({ document, fetch, Blob, URL, URLSearchParams, AbortController, crypto: webcrypto, QRCode: { async toCanvas(canvas, value) { canvas.qrValue = value } },
    env: { VITE_GOOGLE_CLIENT_ID: '123-client', VITE_GOOGLE_PICKER_API_KEY: pickerKey, VITE_GOOGLE_BOOKS_API_KEY: booksKey, VITE_GOOGLE_APP_ID: '123', VITE_EBOOK_TRANSFER_BROKER_URL: 'https://broker.example/exec', VITE_EBOOK_EPUB_WRITE_ENABLED: 'true' }, rewriteEpubMetadata: epubWriter,
    window: { sessionStorage: storage(session), localStorage: storage(local), setTimeout: testSetTimeout, clearTimeout, location: { href: 'https://fabianpetermark-commits.github.io/Grapes/', origin: 'https://fabianpetermark-commits.github.io', search: '' } } })
  const driveContext = vm.createContext({ window: context.window, document, fetch, env: context.env, Blob, crypto: webcrypto })
  const api = vm.runInContext(driveSource + '\n({ connectGrapesDrive, disconnectGrapesDrive, getConnectedGrapesAccount, getGrapesDriveAccessToken, grapesDriveHasFullReadAccess, grapesDriveRequest, isGrapesDriveConnected, onGrapesDriveChange })', driveContext)
  Object.assign(context, api)
  vm.runInContext(source + '\nonGrapesDriveChange(renderDriveConnection)', context)
  vm.runInContext('loadEpubWriter = async () => rewriteEpubMetadata', context)
  return { context, nodes, session, local, run: (code) => vm.runInContext(code, context) }
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const folder = () => json({ files: [{ id: 'folder' }] })

test('Drive session survives refresh without another account prompt and ignores expired sessions', () => {
  const session = new Map()
  const first = app(undefined, { session })
  const refreshed = app(undefined, { session, connected: false })
  assert.equal(refreshed.run('getGrapesDriveAccessToken()'), first.run('getGrapesDriveAccessToken()'))
  session.set('grapes-drive-session', JSON.stringify({ clientId: '123-client', accessToken: 'old', expiresAt: Date.now() - 1 }))
  const expired = app(undefined, { session, connected: false })
  assert.equal(expired.run('isGrapesDriveConnected()'), false)
  assert.equal(session.has('grapes-drive-session'), false)
})

test('Drive reconnect resolves a fresh attempt after 401 and passes the remembered account', async () => {
  const local = new Map([['grapes-drive-account', 'reader@example.com']])
  const a = app(async url => url.includes('/about?') ? json({ user: { emailAddress: 'reader@example.com' } }) : json({}, 401), { connected: false, local })
  const configs = []
  a.context.window.google = { accounts: { oauth2: { initTokenClient(options) {
    configs.push(options)
    return { requestAccessToken(request) { assert.equal(request.prompt, ''); options.callback({ access_token: 'token-' + configs.length, expires_in: 3600 }) } }
  } } } }
  assert.equal(await a.run('connectGrapesDrive()'), 'token-1')
  await assert.rejects(a.run('grapesDriveRequest("https://www.googleapis.com/drive/v3/files")'), /Csatlakoztasd újra/)
  assert.equal(a.session.has('grapes-drive-session'), false)
  assert.equal(await a.run('connectGrapesDrive()'), 'token-2')
  assert.equal(configs.length, 2)
  assert.equal(configs[1].login_hint, 'reader@example.com')
})

test('closing the Google popup permits retry and simultaneous connects share one attempt', async () => {
  const a = app(async () => json({}), { connected: false })
  let config; let attempts = 0
  a.context.window.google = { accounts: { oauth2: { initTokenClient(options) {
    config = options; attempts++
    return { requestAccessToken() {} }
  } } } }
  const first = a.run('connectGrapesDrive()')
  const concurrent = a.run('connectGrapesDrive()')
  await Promise.resolve()
  config.error_callback({ type: 'popup_closed' })
  await Promise.all([assert.rejects(first, /popup_closed/), assert.rejects(concurrent, /popup_closed/)])
  assert.equal(attempts, 1)
  const retry = a.run('connectGrapesDrive()')
  await Promise.resolve()
  config.callback({ access_token: 'retry-token', expires_in: 3600 })
  assert.equal(await retry, 'retry-token')
})

test('token expiry updates the reconnect button even while the app is idle', async () => {
  const a = app(async () => json({ user: { emailAddress: 'reader@example.com' } }), { connected: false })
  let expire
  a.context.window.setTimeout = (callback, delay) => { assert.ok(delay > 3500000); expire = callback }
  a.context.window.google = { accounts: { oauth2: { initTokenClient: options => ({ requestAccessToken: () => options.callback({ access_token: 'token', expires_in: 3600 }) }) } } }
  await a.run('connectGrapesDrive()')
  await new Promise(setImmediate)
  assert.equal(a.local.get('grapes-drive-account'), 'reader@example.com')
  assert.equal(a.nodes.get('#ebook-drive-connect').disabled, true)
  expire()
  assert.equal(a.nodes.get('#ebook-drive-connect').disabled, false)
  assert.equal(a.run('getGrapesDriveAccessToken()'), null)
})

test('Connect requests only drive.file and loads the library after consent', async () => {
  const a = app(async url => url.includes('orderBy=') ? json({ files: [] }) : folder(), { connected: false })
  let config; let requested = false
  a.context.window.google = { accounts: { oauth2: { initTokenClient(options) { config = options; return { requestAccessToken() { requested = true; config.callback({ access_token: 'new-token', expires_in: 3600 }) } } } } } }
  await a.run('connectDrive()')
  assert.ok(requested)
  assert.equal(config.scope, 'https://www.googleapis.com/auth/drive.file')
  assert.equal(a.run('getGrapesDriveAccessToken()'), 'new-token')
  assert.equal(a.nodes.get('#ebook-drive-connect').disabled, true)
  assert.equal(a.nodes.get('#ebook-status').dataset.kind, 'success')
})

test('full Drive reading asks for both scopes and preserves the previous token if denied', async () => {
  const a = app(async () => json({ files: [] }))
  let config
  a.context.window.google = { accounts: { oauth2: { initTokenClient(options) {
    config = options
    return { requestAccessToken() { config.callback({ access_token: 'broad-token', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' }) } }
  } } } }
  await assert.rejects(a.run('connectGrapesDrive({ fullRead: true })'), /mindkét szükséges/)
  assert.equal(a.run('getGrapesDriveAccessToken()'), 'test-token')
  assert.equal(a.run('grapesDriveHasFullReadAccess()'), false)
  assert.equal(a.local.has('grapes-drive-full-read'), false)

  a.context.window.google.accounts.oauth2.initTokenClient = (options) => {
    config = options
    return { requestAccessToken() { config.callback({ access_token: 'broad-token', expires_in: 3600, scope: `${config.scope}` }) } }
  }
  await a.run('connectGrapesDrive({ fullRead: true })')
  assert.match(config.scope, /drive\.file/)
  assert.match(config.scope, /drive\.readonly/)
  assert.equal(a.run('grapesDriveHasFullReadAccess()'), true)
  assert.equal(a.local.get('grapes-drive-full-read'), '1')
  assert.equal(JSON.parse(a.session.get('grapes-drive-session')).scopes, config.scope)
})

test('previously granted full read is requested again on reconnect and cleared on disconnect', async () => {
  const local = new Map([['grapes-drive-full-read', '1']])
  const a = app(async () => json({}), { connected: false, local })
  let scope
  a.context.window.google = { accounts: { oauth2: {
    initTokenClient(options) { scope = options.scope; return { requestAccessToken() { options.callback({ access_token: 'full-token', expires_in: 3600, scope }) } } },
    revoke(_token, done) { done() },
  } } }
  await a.run('connectGrapesDrive()')
  assert.match(scope, /drive\.readonly/)
  assert.equal(a.run('grapesDriveHasFullReadAccess()'), true)
  await a.run('disconnectGrapesDrive()')
  assert.equal(local.has('grapes-drive-full-read'), false)
  assert.equal(a.run('grapesDriveHasFullReadAccess()'), false)
})

test('global Drive disconnect revokes the token and clears the visible library', async () => {
  const a = app(async () => json({}))
  let revoked
  a.context.window.google = { accounts: { oauth2: { revoke(token, callback) { revoked = token; callback() } } } }
  a.run('renderBooks([{ id: "book", name: "book.epub", size: 1 }])')
  await a.run('disconnectDrive()')
  assert.equal(revoked, 'test-token')
  assert.equal(a.run('isGrapesDriveConnected()'), false)
  assert.equal(a.nodes.get('#ebook-list').children.length, 0)
  assert.equal(a.nodes.get('#ebook-drive-disconnect').disabled, true)
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

test('refresh reads nested folders and shows unknown binary ebook formats', async () => {
  const a = app(async url => {
    if (!url.includes('orderBy=')) return folder()
    const query = new URL(url).searchParams.get('q')
    if (query.includes("'folder' in parents")) return json({ files: [
      { id: 'nested', name: 'Series', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'future', name: 'future.xyzbook', size: '10', mimeType: 'application/octet-stream' },
      { id: 'marker', name: '.grapes-reader-pairing-123.json', mimeType: 'application/json' },
    ] })
    return json({ files: [{ id: 'child', name: 'nested.fb2.zip', size: '20', mimeType: 'application/zip' }] })
  })
  await a.run('refreshLibrary()')
  assert.equal(a.nodes.get('#ebook-list').children.length, 2)
})

test('refresh merges every accessible Grapes library folder and removes duplicate file ids', async () => {
  const a = app(async url => {
    if (!url.includes('orderBy=')) return json({ files: [{ id: 'folder-a' }, { id: 'folder-b' }] })
    const query = new URL(url).searchParams.get('q')
    if (query.includes("'folder-a' in parents")) return json({ files: [
      { id: 'shared', name: 'shared.epub' },
      { id: 'a', name: 'first.mobi' },
    ] })
    return json({ files: [
      { id: 'shared', name: 'shared.epub' },
      { id: 'b', name: 'second.fb2' },
    ] })
  })
  await a.run('refreshLibrary()')
  assert.equal(a.nodes.get('#ebook-list').children.length, 3)
  assert.match(a.nodes.get('#ebook-status').textContent, /3 könyv/)
})

test('full read scans paginated Drive books without showing unrelated files or duplicate ids', async () => {
  const session = new Map([['grapes-drive-session', JSON.stringify({
    clientId: '123-client', accessToken: 'broad-token', expiresAt: Date.now() + 3600000,
    scopes: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
  })]])
  const a = app(async url => {
    const request = new URL(url)
    const query = request.searchParams.get('q') || ''
    if (query.includes("name = 'Grapes E-book Library'")) return folder()
    if (query.includes("'folder' in parents")) return json({ files: [{ id: 'in-library', name: 'first.epub', mimeType: 'application/epub+zip', isAppAuthorized: true }] })
    if (request.searchParams.get('pageToken') === 'next') return json({ files: [
      { id: 'outside-fb2', name: 'second.fb2.zip', mimeType: 'application/zip', isAppAuthorized: false },
      { id: 'unrelated', name: 'photo.jpg', mimeType: 'image/jpeg' },
    ] })
    return json({ nextPageToken: 'next', files: [
      { id: 'in-library', name: 'first.epub', mimeType: 'application/epub+zip', isAppAuthorized: true },
      { id: 'outside-pdf', name: 'third.pdf', mimeType: 'application/pdf', isAppAuthorized: false },
      { id: 'marker', name: '.grapes-reader-pairing.json', mimeType: 'application/json' },
    ] })
  }, { session })
  await a.run('refreshLibrary()')
  assert.equal(a.nodes.get('#ebook-list').children.length, 3)
  assert.match(a.nodes.get('#ebook-status').textContent, /teljes Google Drive/)
  const external = a.nodes.get('#ebook-list').children.find((row) => row.innerHTML.includes('second.fb2.zip'))
  assert.match(external.innerHTML, /Drive, csak olvasás/)
  assert.doesNotMatch(external.innerHTML, /data-send/)
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

test('expired token enables reconnect and reports actionable error', async () => {
  const a = app(async () => json({ error: { message: 'Expired' } }, 401))
  await a.run('refreshLibrary()')
  assert.equal(a.run('getGrapesDriveAccessToken()'), null)
  assert.equal(a.nodes.get('#ebook-drive-connect').disabled, false)
  assert.match(a.nodes.get('#ebook-status').textContent, /Csatlakoztasd újra/)
})

test('transfer renders a download QR and offers a code plus a stable reader address', async () => {
  const calls = []
  const a = app(async (url, options) => { calls.push({ url, options }); return json(url.includes('permissions') ? {} : { name: 'book.pdf' }) })
  a.context.window.location.href = 'https://fabianpetermark-commits.github.io/Grapes/ebook-pilot/?module=ebook'
  await a.run('sendBook("book")')
  assert.deepEqual(JSON.parse(calls[1].options.body), { type: 'anyone', role: 'reader', allowFileDiscovery: false })
  const broker = new URL(a.nodes.get('#ebook-transfer-pair').dataset.brokerUrl)
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
  assert.ok(a.nodes.get('#ebook-transfer-pair').dataset.brokerUrl)
})

test('single-book code appears in Grapes without opening a window and resets on close', async () => {
  const a = app(async url => url.includes('orderBy=') ? json({ files: [] }) : json({ name: 'book.pdf' }))
  a.context.window.open = () => { throw new Error('must not open a new window') }
  a.run('initEbookLibrary()')
  await a.run('sendBook("book")')
  a.nodes.get('#ebook-transfer-pair').listeners.click()
  const frame = a.nodes.get('#ebook-transfer-code')
  assert.equal(frame.hidden, false)
  assert.equal(new URL(frame.src).searchParams.get('embed'), '1')
  assert.equal(new URL(frame.src).searchParams.get('fileId'), 'book')
  a.run('closeTransfer()')
  assert.equal(frame.hidden, true)
  assert.equal(frame.src, undefined)
})

test('persistent reader pairing uses an inline frame with the verified marker', async () => {
  const a = app(async url => {
    if (url.includes('/upload/')) return json({ id: 'marker' })
    if (url.includes('orderBy=')) return json({ files: [] })
    return folder()
  })
  a.context.window.location.href = 'https://fabianpetermark-commits.github.io/Grapes/ebook-pilot/?module=ebook'
  a.context.window.open = () => { throw new Error('must not open a new window') }
  await a.run('createReaderPairing()')
  const frame = a.nodes.get('#ebook-reader-pair-code')
  const url = new URL(frame.src)
  assert.equal(frame.hidden, false)
  assert.equal(url.searchParams.get('action'), 'create-reader-pairing')
  assert.equal(url.searchParams.get('embed'), '1')
  assert.equal(url.searchParams.get('markerId'), 'marker')
  assert.match(url.searchParams.get('nonce'), /^[a-f0-9]{48}$/)
  assert.equal(url.searchParams.get('returnUrl'), 'https://fabianpetermark-commits.github.io/Grapes/ebook-reader.html')
  assert.equal(a.nodes.get('#ebook-reader-pair-btn').disabled, false)
})

test('library cache keeps edited titles with books and never displays another account cache', () => {
  const local = new Map([['grapes-ebook-library-cache-v1', JSON.stringify({ books: [{ id: 'legacy', name: 'old.epub' }] })]])
  const sessionFor = (email) => new Map([['grapes-drive-session', JSON.stringify({
    clientId: '123-client', accessToken: 'test-token', expiresAt: Date.now() + 3600000,
    account: { name: email, email, photo: '' },
  })]])
  const first = app(undefined, { session: sessionFor('reader@example.com'), local })
  first.run('ebookMetadata = { book: { title: "Mentett cím", author: "Mentett szerző", publisher: "Kiadó" } }; saveLibraryCache([{ id: "book", name: "regi-fajlnev.epub" }])')
  const cached = JSON.parse(local.get('grapes-ebook-library-cache-v2:reader%40example.com'))
  assert.equal(cached.metadata.book.title, 'Mentett cím')
  const sameAccount = app(undefined, { session: sessionFor('reader@example.com'), local })
  assert.equal(sameAccount.run('renderLibraryCache()'), true)
  assert.match(sameAccount.nodes.get('#ebook-list').children[0].innerHTML, /Mentett cím/)
  assert.match(sameAccount.nodes.get('#ebook-metadata-book').innerHTML, /Mentett cím/)
  assert.equal(local.has('grapes-ebook-library-cache-v1'), false)
  sameAccount.context.getConnectedGrapesAccount = () => ({ email: 'other@example.com' })
  sameAccount.run('renderDriveConnection()')
  assert.equal(sameAccount.nodes.get('#ebook-list').children.length, 0)
  const otherAccount = app(undefined, { session: sessionFor('other@example.com'), local })
  assert.equal(otherAccount.run('renderLibraryCache()'), false)
  assert.equal(otherAccount.nodes.get('#ebook-list'), undefined)
  const unidentified = app(undefined, { local: new Map([['grapes-drive-account', 'reader@example.com'], ...local]) })
  assert.equal(unidentified.run('renderLibraryCache()'), false)
})

test('reader pairing explains when a book transfer code was entered instead', () => {
  const values = new Map([['ebook_transfer_ABC234', JSON.stringify({ expiresAt: Date.now() + 60000 })]])
  const c = vm.createContext({
    HtmlService: { createHtmlOutput: html => html },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => values.get(key) }) },
  })
  vm.runInContext(brokerSource, c)
  assert.match(c.pairReader({ code: 'ABC234' }), /könyvküldési kód/)
  assert.match(c.pairReader({ code: 'DEF234' }), /A kód nem található/)
})

test('reader pairing code created by the broker is accepted once by the same broker', () => {
  const values = new Map()
  const nonce = 'a'.repeat(48)
  let trashed = false
  const folder = { getId: () => 'folder', getName: () => 'Grapes E-book Library' }
  const marker = {
    isTrashed: () => trashed,
    getBlob: () => ({ getDataAsString: () => JSON.stringify({ kind: 'grapes-reader-pairing', nonce, createdAt: Date.now(), folderId: 'folder' }) }),
    getParents: () => ({ hasNext: () => true, next: () => folder }),
    setTrashed: value => { trashed = value },
  }
  const props = { getProperty: key => values.get(key), setProperty: (key, value) => values.set(key, value), getProperties: () => Object.fromEntries(values), deleteProperty: key => values.delete(key) }
  const c = vm.createContext({
    HtmlService: { createHtmlOutput: html => ({ html }) },
    PropertiesService: { getScriptProperties: () => props },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: { getFileById: () => marker },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://broker.example/exec' }) },
  })
  vm.runInContext(brokerSource, c)
  c.getReaderLibraryFolders = () => [folder]
  c.scanReaderLibraryFolders = () => ({ books: [] })
  c.createUniqueCode = () => 'ABC234'
  c.createReaderToken = () => 'A'.repeat(64)
  const created = c.createReaderPairingPage({ markerId: 'marker', nonce, returnUrl: 'https://fabianpetermark-commits.github.io/Grapes/ebook-reader.html', embed: '1' })
  assert.match(created.html, /ABC234/)
  assert.equal(trashed, true)
  assert.ok(values.has('ebook_reader_pair_ABC234'))
  assert.match(c.pairReader({ code: 'ABC234' }).html, /Párosítás kész/)
  assert.equal(values.has('ebook_reader_pair_ABC234'), false)
  assert.match(c.pairReader({ code: 'ABC234' }).html, /A kód nem található/)
})

test('EPUB save path never requests the restricted full Drive write scope', () => {
  assert.doesNotMatch(source, /fullWrite|connectGrapesDrive\(\{\s*fullWrite/)
  assert.doesNotMatch(driveSource, /scope:\s*[^\n]*GRAPES_DRIVE_WRITE_SCOPE/)
})

test('metadata parser understands title-first library filenames and legacy author-first names', () => {
  const a = app(async () => json({}))
  assert.deepEqual(
    { ...a.run('parseFilenameMetadata("az elme trükkjei -- albert moukheiber -- budapest, 2020 -- európa könyvkiadó.epub")') },
    { title: 'az elme trükkjei', author: 'albert moukheiber' },
  )
  assert.deepEqual(
    { ...a.run('parseFilenameMetadata("The Things We Water -- Mariana Zapata - 1.epub")') },
    { title: 'The Things We Water', author: 'Mariana Zapata' },
  )
  assert.deepEqual(
    { ...a.run('parseFilenameMetadata("Torony-6-Susannah dala - King, Stephen1.prc")') },
    { title: 'Torony-6-Susannah dala', author: 'King, Stephen' },
  )
  assert.deepEqual(
    { ...a.run('parseFilenameMetadata("King, Stephen - It.epub")') },
    { title: 'It', author: 'King, Stephen' },
  )
  assert.equal(a.run('extractIsbn("book -- 978-963-566-128-4.epub")'), '9789635661284')
})

test('Drive metadata reloads across devices and repairs previously nested saves', async () => {
  const stored = {
    version: 1,
    updatedAt: '2026-10-05T12:00:00.000Z',
    books: {
      version: 1,
      updatedAt: '2026-10-05T11:00:00.000Z',
      books: { old: { title: 'Régi cím', author: 'Régi szerző' } },
      editedEarlier: { title: 'Korábbi javítás', author: 'Szerző A' },
    },
    editedLatest: { title: 'Legújabb javítás', author: 'Szerző B' },
  }
  const a = app(async url => {
    if (url.includes('alt=media')) return json(stored)
    return json({ files: [{ id: 'metadata-file' }] })
  })

  await a.run('loadEbookMetadata("folder")')
  assert.deepEqual(
    JSON.parse(a.run('JSON.stringify(ebookMetadata)')),
    {
      old: { title: 'Régi cím', author: 'Régi szerző' },
      editedEarlier: { title: 'Korábbi javítás', author: 'Szerző A' },
      editedLatest: { title: 'Legújabb javítás', author: 'Szerző B' },
    },
  )
  assert.equal(a.run('ebookMetadataFileId'), 'metadata-file')
})

test('legacy flat Drive metadata remains compatible', async () => {
  const a = app(async url => url.includes('alt=media')
    ? json({ book: { title: 'Dűne', author: 'Frank Herbert' } })
    : json({ files: [{ id: 'metadata-file' }] }))
  await a.run('loadEbookMetadata("folder")')
  assert.equal(a.run('ebookMetadata.book.title'), 'Dűne')
})

test('saved metadata is visible in a fresh device session', async () => {
  let stored = { version: 1, books: { first: { title: 'Első cím', author: 'Szerző A' } } }
  const drive = async (url, options = {}) => {
    if (options.method === 'PATCH') {
      stored = JSON.parse(options.body)
      return json({ id: 'metadata-file' })
    }
    if (url.includes('alt=media')) return json(stored)
    return json({ files: [{ id: 'metadata-file' }] })
  }
  const first = app(drive)
  await first.run('loadEbookMetadata("folder")')
  first.run('ebookMetadata.second = { title: "Második cím", author: "Szerző B" }')
  await first.run('saveEbookMetadata("folder")')

  const second = app(drive)
  await second.run('loadEbookMetadata("folder")')
  assert.equal(second.run('ebookMetadata.first.title'), 'Első cím')
  assert.equal(second.run('ebookMetadata.second.title'), 'Második cím')
  assert.equal(second.run('ebookMetadata.second.author'), 'Szerző B')
})

test('unreadable Drive metadata cannot be silently overwritten', async () => {
  const a = app(async url => url.includes('alt=media')
    ? new Response('invalid JSON', { status: 200 })
    : json({ files: [{ id: 'metadata-file' }] }))
  await assert.rejects(a.run('loadEbookMetadata("folder")'), (error) => error.name === 'SyntaxError')
})

test('metadata lookup falls back to a verified author and preserves a Hungarian title', async () => {
  const calls = []
  const a = app(async url => {
    if (!url.startsWith('https://openlibrary.org/')) return json({ items: [] })
    const search = new URL(url).searchParams; calls.push(search)
    if (search.has('author') && !search.has('title')) return json({ docs: [{ title: 'Your Brain Is Playing Tricks on You', author_name: ['Albert Moukheiber'], first_publish_year: 2019 }] })
    return json({ docs: [] })
  })
  a.run('currentBooks = [{ id: "book", name: "az elme trükkjei -- albert moukheiber -- budapest, 2020.epub" }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title"); $("#ebook-metadata-author")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'Az elme trükkjei'
  a.nodes.get('#ebook-metadata-author').value = 'Albert Moukheiber'
  await a.run('lookupBookMetadata()')
  assert.equal(calls.length, 3)
  assert.equal(a.nodes.get('#ebook-metadata-suggestion').dataset.kind, 'success')
  assert.match(a.nodes.get('#ebook-metadata-suggestion').textContent, /magyar címet megtartottam/)
  a.run('applyMetadataSuggestion()')
  assert.equal(a.nodes.get('#ebook-metadata-title').value, 'Az elme trükkjei')
  assert.equal(a.nodes.get('#ebook-metadata-author').value, 'Albert Moukheiber')
})

test('metadata lookup accepts a strong exact catalogue match', async () => {
  const a = app(async url => url.startsWith('https://openlibrary.org/')
    ? json({ docs: [{ title: 'Dune', author_name: ['Frank Herbert'], first_publish_year: 1965 }] })
    : json({ items: [] }))
  a.run('currentBooks = [{ id: "book", name: "Frank Herbert - Dune.epub" }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title"); $("#ebook-metadata-author")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'Dune'
  a.nodes.get('#ebook-metadata-author').value = 'Frank Herbert'
  await a.run('lookupBookMetadata()')
  assert.equal(a.nodes.get('#ebook-metadata-suggestion').dataset.kind, 'success')
  assert.match(a.nodes.get('#ebook-metadata-suggestion').textContent, /Dune — Frank Herbert/)
  assert.match(a.nodes.get('#ebook-metadata-evidence').children[0].textContent, /Nem azonosított kiadás/)
})

test('Google Books can supply a missing Open Library result using the current Google token', async () => {
  const a = app(async (url, options) => {
    if (url.startsWith('https://openlibrary.org/')) return json({ docs: [] })
    assert.match(url, /www\.googleapis\.com\/books\/v1\/volumes/)
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    return json({ items: [{ volumeInfo: { title: 'Dune', authors: ['Frank Herbert'], publishedDate: '1965-08-01' } }] })
  })
  a.run('currentBooks = [{ id: "book", name: "Dune -- Frank Herbert.epub" }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title"); $("#ebook-metadata-author")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'Dune'
  a.nodes.get('#ebook-metadata-author').value = 'Frank Herbert'
  await a.run('lookupBookMetadata()')
  assert.match(a.nodes.get('#ebook-metadata-suggestion').textContent, /Google Books/)
  a.run('applyMetadataSuggestion()')
  assert.equal(a.nodes.get('#ebook-metadata-author').value, 'Frank Herbert')
})

test('a configured Books-only key is used for public searches without sending the Drive token', async () => {
  const a = app(async (url, options = {}) => {
    if (url.startsWith('https://openlibrary.org/')) return json({ docs: [] })
    const parsed = new URL(url)
    assert.equal(parsed.searchParams.get('key'), 'books-test-key')
    assert.equal(parsed.searchParams.get('q'), 'intitle:Dune inauthor:Frank Herbert')
    assert.equal(options.headers.Authorization, undefined)
    return json({ items: [{ volumeInfo: { title: 'Dune', authors: ['Frank Herbert'] } }] })
  }, { connected: false, booksKey: 'books-test-key' })
  a.run('currentBooks = [{ id: "book", name: "Dune -- Frank Herbert.epub" }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title"); $("#ebook-metadata-author")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'Dune'
  a.nodes.get('#ebook-metadata-author').value = 'Frank Herbert'
  await a.run('lookupBookMetadata()')
  assert.match(a.nodes.get('#ebook-metadata-suggestion').textContent, /Google Books/)
})

test('conflicting catalogues stay separate and the selected result is applied', async () => {
  const a = app(async url => url.startsWith('https://openlibrary.org/')
    ? json({ docs: [{ title: 'Dune', author_name: ['Frank Herbert'], first_publish_year: 1965 }] })
    : json({ items: [{ volumeInfo: { title: 'Dune', authors: ['F. Herbert'], publishedDate: '2005' } }] }))
  a.run('currentBooks = [{ id: "book", name: "Dune -- Frank Herbert.epub" }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title"); $("#ebook-metadata-author")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'Dune'
  a.nodes.get('#ebook-metadata-author').value = 'Frank Herbert'
  await a.run('lookupBookMetadata()')
  assert.equal(a.nodes.get('#ebook-metadata-source-wrap').hidden, false)
  assert.equal(a.nodes.get('#ebook-metadata-source').children.length, 2)
  assert.doesNotMatch(a.nodes.get('#ebook-metadata-suggestion').textContent, /ISBNdb/)
  assert.match(a.nodes.get('#ebook-metadata-evidence').children.at(-1).textContent, /források eltérnek.*Szerző/i)
  a.nodes.get('#ebook-metadata-source').value = '1'
  a.run('selectMetadataSource(); metadataProposalControls.get("author").value = "1"; applyMetadataSuggestion()')
  assert.equal(a.nodes.get('#ebook-metadata-author').value, 'F. Herbert')
})

test('a failing Google Books lookup does not hide an Open Library match', async () => {
  const a = app(async url => url.startsWith('https://openlibrary.org/')
    ? json({ docs: [{ title: 'Dune', author_name: ['Frank Herbert'] }] })
    : json({ error: 'API unavailable' }, 403))
  a.run('currentBooks = [{ id: "book", name: "Dune -- Frank Herbert.epub" }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title"); $("#ebook-metadata-author")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'Dune'
  a.nodes.get('#ebook-metadata-author').value = 'Frank Herbert'
  await a.run('lookupBookMetadata()')
  assert.match(a.nodes.get('#ebook-metadata-suggestion').textContent, /Nem elérhető: Google Books/)
  assert.equal(a.nodes.get('#ebook-metadata-apply').disabled, false)
})

test('v2 catalogue keeps rich fields while v1 records remain readable', async () => {
  const a = app(async url => url.includes('alt=media')
    ? json({ version: 2, books: { old: { title: 'Régi', author: 'Szerző' }, new: { title: 'Új', author: 'Író', isbn: '9780306406157', subjects: ['Fantasy'], coverFileId: 'cover-id', description: 'Leírás' } } })
    : json({ files: [{ id: 'metadata-file' }] }))
  await a.run('loadEbookMetadata("folder")')
  assert.equal(a.run('ebookMetadata.new.isbn'), '9780306406157')
  assert.equal(a.run('ebookMetadata.new.coverFileId'), 'cover-id')
  assert.equal(a.run('ebookMetadata.old.title'), 'Régi')
})

test('work-level catalogue suggestions preserve manually entered values and do not infer an edition', async () => {
  const a = app(async url => url.startsWith('https://openlibrary.org/')
    ? json({ docs: [{ title: 'Dune', author_name: ['Frank Herbert'], publisher: ['Ace'], isbn: ['9780306406157'] }] })
    : json({ items: [] }))
  a.run('currentBooks = [{ id: "book", name: "Dune.epub" }]')
  a.nodes.get('#ebook-metadata-book') || a.run('$("#ebook-metadata-book")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.run('$("#ebook-metadata-title")')
  a.nodes.get('#ebook-metadata-title').value = 'Dűne'
  await a.run('lookupBookMetadata()')
  assert.equal(a.run('metadataProposalControls.get("title").value'), '')
  assert.equal(a.run('metadataProposalControls.has("publisher")'), false)
  assert.equal(a.run('metadataProposalControls.has("isbn")'), false)
  a.run('applyMetadataSuggestion()')
  assert.equal(a.nodes.get('#ebook-metadata-title').value, 'Dűne')
  assert.equal(a.run('$("#ebook-metadata-publisher").value'), undefined)
})

test('Open Library ISBN resolves the edition rather than work-level search data', async () => {
  const requests = []
  const a = app(async url => {
    requests.push(url)
    if (url.endsWith('/isbn/9780306406157.json')) return json({ title: 'Edition title', isbn_13: ['978-0-306-40615-7'], publishers: ['Edition publisher'], publish_date: '2004', authors: [{ key: '/authors/OL123A' }], works: [{ key: '/works/OL456W' }] })
    if (url.endsWith('/authors/OL123A.json')) return json({ name: 'Edition author' })
    if (url.endsWith('/works/OL456W.json')) return json({ description: 'Work description' })
    if (url.startsWith('https://www.googleapis.com/')) return json({ items: [] })
    throw new Error(`Unexpected URL: ${url}`)
  })
  a.run('currentBooks = [{ id: "book", name: "Edition title.epub" }]')
  a.nodes.get('#ebook-metadata-book') || a.run('$("#ebook-metadata-book")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.run('$("#ebook-metadata-title"); $("#ebook-metadata-author"); $("#ebook-metadata-isbn")')
  a.nodes.get('#ebook-metadata-title').value = 'Edition title'
  a.nodes.get('#ebook-metadata-author').value = 'Edition author'
  a.nodes.get('#ebook-metadata-isbn').value = '9780306406157'
  await a.run('lookupBookMetadata()')
  assert.equal(requests.some(url => url.includes('/search.json')), false)
  assert.equal(a.run('metadataSearchMatches[0].suggestion.isbn'), '9780306406157')
  assert.equal(a.run('metadataSearchMatches[0].suggestion.publisher'), 'Edition publisher')
  assert.match(a.nodes.get('#ebook-metadata-evidence').children[0].textContent, /Pontos ISBN/)
})

test('an ISBN match visibly warns about a conflicting title without changing the typed title', async () => {
  const a = app(async url => {
    if (url.includes('/isbn/')) return json({ title: 'Another book', isbn_13: ['9780306406157'] })
    return json({ items: [] })
  })
  a.run('currentBooks = [{ id: "book", name: "Dune.epub" }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title"); $("#ebook-metadata-isbn")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'Dune'
  a.nodes.get('#ebook-metadata-isbn').value = '9780306406157'
  await a.run('lookupBookMetadata()')
  assert.match(a.nodes.get('#ebook-metadata-evidence').children[0].textContent, /eltérő cím/)
  assert.equal(a.run('metadataProposalControls.get("title").value'), '')
  assert.equal(a.nodes.get('#ebook-metadata-title').value, 'Dune')
})

test('ISBN search fallback never suggests another edition details', async () => {
  const a = app(async url => {
    if (url.includes('/isbn/')) return json({}, 404)
    if (url.includes('/search.json')) return json({ docs: [{ title: 'Dune', author_name: ['Frank Herbert'], isbn: ['9781111111111'], publisher: ['Other edition'], first_publish_year: 1965 }] })
    return json({ items: [] })
  })
  const match = await a.run('findBookMetadata({ title: "Dune", author: "Frank Herbert", isbn: "9780306406157" })')
  assert.equal(match.evidence.isbn, undefined)
  assert.equal(match.suggestion.isbn, '')
  assert.equal(match.suggestion.publisher, '')
  assert.equal(match.suggestion.publishedDate, '')
  assert.equal(match.suggestion.coverUrl, '')
})

test('Google Books normalizes hyphenated ISBN identifiers and keeps the requested edition', async () => {
  const a = app(async url => {
    assert.match(url, /isbn%3A9780306406157/)
    return json({ items: [{ volumeInfo: { title: 'Dune', authors: ['Frank Herbert'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '978-0-306-40615-7' }], publisher: 'Ace' } }] })
  }, { booksKey: 'books-test-key' })
  const match = await a.run('findGoogleBooksMetadata({ title: "Dune", author: "Frank Herbert", isbn: "9780306406157" })')
  assert.equal(match.evidence.isbn, true)
  assert.equal(match.suggestion.isbn, '9780306406157')
  assert.equal(match.suggestion.publisher, 'Ace')
})

test('web search stops on a 12-digit ISBN and points out its possible missing check digit', async () => {
  let requests = 0
  const a = app(async () => { requests++; return json({ docs: [] }) })
  a.run('currentBooks = [{ id: "book", name: "A változó agy -- Norman Doidge.epub" }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title"); $("#ebook-metadata-author"); $("#ebook-metadata-isbn")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'A változó agy'
  a.nodes.get('#ebook-metadata-author').value = 'Norman Doidge'
  a.nodes.get('#ebook-metadata-isbn').value = '978963530883'
  await a.run('lookupBookMetadata()')
  assert.equal(requests, 0)
  assert.equal(a.nodes.get('#ebook-metadata-suggestion').dataset.kind, 'error')
  assert.match(a.nodes.get('#ebook-metadata-suggestion').textContent, /9789635308835/)
  assert.equal(a.nodes.get('#ebook-metadata-apply').disabled, true)
})

test('a valid but unconfirmed ISBN is not presented as an edition match', async () => {
  const a = app(async url => {
    if (url.includes('/isbn/')) return json({}, 404)
    if (url.includes('/search.json')) return json({ docs: [{ title: 'A változó agy', author_name: ['Norman Doidge'] }] })
    return json({ items: [] })
  })
  a.run('currentBooks = [{ id: "book", name: "A változó agy -- Norman Doidge.epub" }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title"); $("#ebook-metadata-author"); $("#ebook-metadata-isbn")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'A változó agy'
  a.nodes.get('#ebook-metadata-author').value = 'Norman Doidge'
  a.nodes.get('#ebook-metadata-isbn').value = '9789635308835'
  await a.run('lookupBookMetadata()')
  assert.match(a.nodes.get('#ebook-metadata-suggestion').textContent, /ISBN-t egyik elérhető katalógus sem erősítette meg/)
  assert.equal(a.run('metadataSearchMatches[0].suggestion.isbn'), '')
})

test('metadata validation rejects bad ISBN and impossible dates', () => {
  const a = app(async () => json({}))
  assert.equal(a.run('isbnIsValid("9780306406157")'), true)
  assert.equal(a.run('isbnIsValid("9780306406158")'), false)
  assert.throws(() => a.run('validateMetadataForm({ title: "Dune", isbn: "9780306406158", language: "en", publishedDate: "", seriesIndex: "", description: "" }, true)'), /ISBN/)
  assert.throws(() => a.run('validateMetadataForm({ title: "Dune", isbn: "", language: "en", publishedDate: "2026-02-31", seriesIndex: "", description: "" }, true)'), /dátum/)
})

test('app-authorized EPUB saves with drive.file and retries a partial sidecar failure without another upload', async () => {
  let uploads = 0; let catalogueWrites = 0; let grants = 0
  const a = app(async (url, options = {}) => {
    if (options.method === 'PATCH' && url.includes('uploadType=media')) { uploads++; return json({ id: 'book', modifiedTime: 'new', size: 13, headRevisionId: 'new-rev' }) }
    if (url.includes('alt=media')) return new Response(new Blob(['original epub']))
    return json({})
  })
  a.run('currentBooks = [{ id: "book", name: "Dune.epub", modifiedTime: "old", size: 13, isAppAuthorized: true }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title"); $("#ebook-metadata-author")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'Dune'
  a.nodes.get('#ebook-metadata-author').value = 'Frank Herbert'
  a.run('metadataLoadedSnapshot = "{}"; getReaderLibraryBooks = async () => ({ folderId: "folder" }); loadEbookMetadata = async () => {}; getBookDriveVersion = async () => ({ modifiedTime: currentBooks[0].modifiedTime, size: currentBooks[0].size, headRevisionId: currentBooks[0].headRevisionId, isAppAuthorized: true }); renderBooks = () => {}; openMetadataEditor = () => {};')
  a.context.connectGrapesDrive = async () => { grants++; throw new Error('Nem kérhető teljes Drive-jog') }
  a.context.catalogueWrite = async () => { catalogueWrites++; if (catalogueWrites === 1) throw new Error('temporary failure') }
  a.run('saveEbookMetadata = () => catalogueWrite()')
  await a.run('saveMetadataFromForm()')
  assert.equal(uploads, 1)
  assert.match(a.nodes.get('#ebook-status').textContent, /EPUB már mentve/)
  await a.run('saveMetadataFromForm()')
  assert.equal(uploads, 1)
  assert.equal(grants, 0)
  assert.equal(catalogueWrites, 2)
})

test('non-app-authorized EPUB saves only its catalogue entry without requesting broad Drive access', async () => {
  let uploads = 0; let grants = 0; let catalogueWrites = 0
  const a = app(async (url, options = {}) => { if (options.method === 'PATCH') uploads++; return json({}) })
  a.run('currentBooks = [{ id: "book", name: "Dune.epub", modifiedTime: "old", size: 13, isAppAuthorized: false }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'Dune'
  a.run('metadataLoadedSnapshot = "{}"; getReaderLibraryBooks = async () => ({ folderId: "folder" }); loadEbookMetadata = async () => {}; renderBooks = () => {}; openMetadataEditor = () => {};')
  a.context.connectGrapesDrive = async () => { grants++ }
  a.context.catalogueWrite = async () => { catalogueWrites++ }
  a.run('saveEbookMetadata = () => catalogueWrite()')
  await a.run('saveMetadataFromForm()')
  assert.equal(uploads, 0)
  assert.equal(grants, 0)
  assert.equal(catalogueWrites, 1)
  assert.equal(a.nodes.get('#ebook-metadata-title').value, 'Dune')
  assert.match(a.nodes.get('#ebook-status').textContent, /könyvfájl változatlan/)
})

test('changed Drive authorization blocks an EPUB overwrite even when the list was stale', async () => {
  let uploads = 0; let grants = 0
  const a = app(async (url, options = {}) => { if (options.method === 'PATCH') uploads++; return json({}) })
  a.run('currentBooks = [{ id: "book", name: "Dune.epub", modifiedTime: "old", size: 13, isAppAuthorized: true }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'Dune'
  a.run('metadataLoadedSnapshot = "{}"; getReaderLibraryBooks = async () => ({ folderId: "folder" }); loadEbookMetadata = async () => {}; getBookDriveVersion = async () => ({ modifiedTime: "old", size: 13, isAppAuthorized: false });')
  a.context.connectGrapesDrive = async () => { grants++ }
  await a.run('saveMetadataFromForm()')
  assert.equal(uploads, 0)
  assert.equal(grants, 0)
  assert.match(a.nodes.get('#ebook-status').textContent, /fájlonkénti Grapes-hozzáférés/)
})

test('editor offers EPUB writing only for a file opened by Grapes', () => {
  const a = app(async () => json({}))
  a.run('currentBooks = [{ id: "own", name: "own.epub", isAppAuthorized: true }, { id: "other", name: "other.epub", isAppAuthorized: false }]')
  a.run('$("#ebook-metadata-book")')
  a.nodes.get('#ebook-metadata-book').value = 'own'
  a.run('updateMetadataForm()')
  assert.equal(a.nodes.get('#ebook-metadata-save').textContent, 'Adatlap és EPUB mentése')
  a.nodes.get('#ebook-metadata-book').value = 'other'
  a.run('updateMetadataForm()')
  assert.equal(a.nodes.get('#ebook-metadata-save').textContent, 'Könyvtári adatlap mentése')
  assert.match(a.nodes.get('#ebook-metadata-suggestion').textContent, /fájlonkénti Grapes-hozzáférést/)
})

test('Picker stays unavailable without its restricted API key while catalogue saving remains available', () => {
  const a = app(async () => json({}))
  a.run('currentBooks = [{ id: "other", name: "other.epub", isAppAuthorized: false }]')
  a.run('$("#ebook-metadata-book")')
  a.nodes.get('#ebook-metadata-book').value = 'other'
  a.run('updateMetadataForm()')
  assert.equal(a.nodes.get('#ebook-metadata-access').hidden, false)
  assert.equal(a.nodes.get('#ebook-metadata-grant').disabled, true)
  assert.match(a.nodes.get('#ebook-metadata-access-status').textContent, /API-kulcs hiányzik/)
  assert.equal(a.nodes.get('#ebook-metadata-save').textContent, 'Könyvtári adatlap mentése')
})

test('Picker grants only the selected EPUB and keeps unsaved form values', async () => {
  const calls = []
  const a = app(async (url, options = {}) => {
    calls.push({ url: String(url), options })
    return json({ id: 'book', isAppAuthorized: true, capabilities: { canEdit: true } })
  }, { pickerKey: 'restricted-browser-key' })
  let callback
  const builder = {
    addView(view) { assert.equal(view.ids[0], 'book'); return this },
    setOAuthToken(token) { assert.equal(token, 'test-token'); return this },
    setDeveloperKey(key) { assert.equal(key, 'restricted-browser-key'); return this },
    setAppId(id) { assert.equal(id, '123'); return this },
    setCallback(fn) { callback = fn; return this },
    build() { return { setVisible(value) { assert.equal(value, true); callback({ action: 'picked', docs: [{ id: 'book' }] }) } } },
  }
  a.context.window.google = { picker: { PickerBuilder: function () { return builder }, DocsView: function () { return { setFileIds(ids) { this.ids = ids; return this } } }, ViewId: { DOCS: 'docs' }, Action: { PICKED: 'picked', CANCEL: 'cancel' } } }
  a.run('currentBooks = [{ id: "book", name: "Dune.epub", isAppAuthorized: false }]')
  a.run('$("#ebook-metadata-book")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.run('updateMetadataForm()')
  a.nodes.get('#ebook-metadata-title').value = 'Edited title'
  a.run('setMetadataDirty(true)')
  await a.run('grantSelectedEpubAccess()')
  assert.equal(a.nodes.get('#ebook-metadata-title').value, 'Edited title')
  assert.equal(a.run('metadataDirty'), true)
  assert.equal(a.run('currentBooks[0].isAppAuthorized'), true)
  assert.equal(a.nodes.get('#ebook-metadata-save').textContent, 'Adatlap és EPUB mentése')
  assert.equal(a.nodes.get('#ebook-metadata-access').hidden, true)
  assert.ok(calls.every(({ options }) => !options.method || options.method === 'GET'))
})

test('Picker cancellation and foreign file selection do not authorize an EPUB', async () => {
  for (const data of [{ action: 'cancel' }, { action: 'picked', docs: [{ id: 'wrong' }] }]) {
    const a = app(async () => json({ id: 'book', isAppAuthorized: true }), { pickerKey: 'restricted-browser-key' })
    const builder = { addView() { return this }, setOAuthToken() { return this }, setDeveloperKey() { return this }, setAppId() { return this }, setCallback(fn) { this.callback = fn; return this }, build() { return { setVisible: () => builder.callback(data) } } }
    a.context.window.google = { picker: { PickerBuilder: function () { return builder }, DocsView: function () { return { setFileIds() { return this } } }, ViewId: { DOCS: 'docs' }, Action: { PICKED: 'picked', CANCEL: 'cancel' } } }
    a.run('currentBooks = [{ id: "book", name: "Dune.epub", isAppAuthorized: false }]')
    a.run('$("#ebook-metadata-book")')
    a.nodes.get('#ebook-metadata-book').value = 'book'
    a.run('updateMetadataForm()')
    await a.run('grantSelectedEpubAccess()')
    assert.equal(a.run('currentBooks[0].isAppAuthorized'), false)
    assert.equal(a.nodes.get('#ebook-metadata-grant').disabled, false)
    assert.match(a.nodes.get('#ebook-metadata-access-status').textContent, data.action === 'cancel' ? /megszakítva/ : /nem egyezik/)
  }
})

test('cancelled EPUB confirmation does not touch Drive or edited form values', async () => {
  let requests = 0
  const a = app(async () => { requests++; return json({}) })
  a.run('currentBooks = [{ id: "book", name: "Dune.epub", isAppAuthorized: true }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'Edited title'
  a.context.window.confirm = () => false
  await a.run('saveMetadataFromForm()')
  assert.equal(requests, 0)
  assert.equal(a.nodes.get('#ebook-metadata-title').value, 'Edited title')
})

test('another device changing the EPUB prevents a binary overwrite', async () => {
  let uploads = 0; let grants = 0
  const a = app(async (url, options = {}) => { if (options.method === 'PATCH') uploads++; return json({}) })
  a.run('currentBooks = [{ id: "book", name: "Dune.epub", modifiedTime: "old", size: 13, isAppAuthorized: true }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'Dune'
  a.run('metadataLoadedSnapshot = "{}"; getReaderLibraryBooks = async () => ({ folderId: "folder" }); loadEbookMetadata = async () => {}; getBookDriveVersion = async () => ({ modifiedTime: "new", size: 13 });')
  a.context.connectGrapesDrive = async () => { grants++ }
  await a.run('saveMetadataFromForm()')
  assert.equal(uploads, 0)
  assert.equal(grants, 0)
  assert.match(a.nodes.get('#ebook-status').textContent, /közben módosult/)
})

test('PDF saves rich catalogue data and a cover without rewriting the file', async () => {
  let saved; let binaryUploads = 0
  const a = app(async (url, options = {}) => { if (options.method === 'PATCH' && url.includes('uploadType=media')) binaryUploads++; return json({}) })
  a.run('currentBooks = [{ id: "pdf-book", name: "Dune.pdf" }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title"); $("#ebook-metadata-author"); $("#ebook-metadata-publisher"); $("#ebook-metadata-description")')
  a.nodes.get('#ebook-metadata-book').value = 'pdf-book'
  a.nodes.get('#ebook-metadata-title').value = 'Dune'
  a.nodes.get('#ebook-metadata-author').value = 'Frank Herbert'
  a.nodes.get('#ebook-metadata-publisher').value = 'Ace'
  a.nodes.get('#ebook-metadata-description').value = 'Kézi leírás'
  a.run('metadataLoadedSnapshot = "{}"; pendingCoverBlob = new Blob([new Uint8Array([255,216,255,217])], { type: "image/jpeg" }); getReaderLibraryBooks = async () => ({ folderId: "folder" }); loadEbookMetadata = async () => {}; uploadCoverAsset = async () => "cover-id"; renderBooks = () => {}; openMetadataEditor = () => {};')
  a.context.captureCatalogue = () => { saved = JSON.parse(a.run('JSON.stringify(ebookMetadata["pdf-book"])')) }
  a.run('saveEbookMetadata = () => captureCatalogue()')
  await a.run('saveMetadata({ catalogOnly: true })')
  assert.equal(saved.coverFileId, 'cover-id')
  assert.equal(saved.publisher, 'Ace')
  assert.equal(saved.description, 'Kézi leírás')
  assert.equal(binaryUploads, 0)
})

test('an invalid EPUB offers catalogue-only save and leaves the original file unchanged', async () => {
  let binaryUploads = 0; let saved = false
  const a = app(async (url, options = {}) => {
    if (options.method === 'PATCH') binaryUploads++
    if (url.includes('alt=media')) return new Response(new Blob(['invalid epub']))
    return json({})
  }, { epubWriter: async () => { throw new Error('Nem érvényes EPUB') } })
  a.run('currentBooks = [{ id: "book", name: "Dune.epub", modifiedTime: "old", size: 13, isAppAuthorized: true }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'Dune'
  a.run('metadataLoadedSnapshot = "{}"; getReaderLibraryBooks = async () => ({ folderId: "folder" }); loadEbookMetadata = async () => {}; getBookDriveVersion = async () => ({ modifiedTime: "old", size: 13, isAppAuthorized: true }); renderBooks = () => {}; openMetadataEditor = () => {};')
  a.context.connectGrapesDrive = async () => { throw new Error('Nem kérhető teljes Drive-jog') }
  a.context.markSaved = () => { saved = true }
  a.run('saveEbookMetadata = () => markSaved()')
  await a.run('saveMetadataFromForm()')
  assert.equal(binaryUploads, 0)
  assert.equal(a.nodes.get('#ebook-metadata-save-catalog').hidden, false)
  await a.run('saveMetadata({ catalogOnly: true })')
  assert.equal(saved, true)
})

test('metadata editor exposes search, live preview and a protected dirty state', () => {
  const a = app(async () => json({}))
  for (const id of ['#ebook-metadata-book', '#ebook-metadata-title', '#ebook-metadata-author', '#ebook-metadata-preview', '#ebook-metadata-preview-title', '#ebook-metadata-preview-meta', '#ebook-metadata-dirty', '#ebook-metadata-save', '#ebook-metadata-apply', '#ebook-metadata-suggestion', '#ebook-metadata-filter']) a.run(`$("${id}")`)
  a.run('currentBooks = [{ id: "book", name: "Dune -- Frank Herbert.epub", size: 2048 }]')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.run('updateMetadataForm()')
  assert.equal(a.nodes.get('#ebook-metadata-preview-title').textContent, 'Dune -- Frank Herbert.epub')
  a.nodes.get('#ebook-metadata-title').value = 'Dűne'
  a.run('setMetadataDirty(true); updateMetadataPreview()')
  assert.equal(a.nodes.get('#ebook-metadata-dirty').dataset.dirty, 'true')
  assert.equal(a.nodes.get('#ebook-metadata-save').disabled, false)
  assert.equal(a.nodes.get('#ebook-metadata-preview-title').textContent, 'Dűne')
})

test('reader pairing code bridge accepts only the selected iframe and expires the code', () => {
  const a = app()
  const frame = a.run('$("#ebook-reader-pair-code")')
  frame.src = 'https://script.google.com/macros/s/test/exec'
  a.run('readerPairNonce = "1234567890abcdef1234567890abcdef1234567890abcdef"')
  let expire
  a.context.window.setTimeout = (callback, delay) => { if (delay === 120000) expire = callback; return 1 }
  a.context.window.clearTimeout = () => {}
  a.context.message = { origin: 'https://evil.example', data: { type: 'grapes-reader-pairing-code', code: 'BAD234', nonce: '1234567890abcdef1234567890abcdef1234567890abcdef', expiresInSeconds: 120 } }
  a.run('handleReaderPairingMessage(message)')
  assert.equal(a.nodes.has('#ebook-reader-pair-value'), false)

  a.context.message = { origin: 'https://script.googleusercontent.com', data: { type: 'grapes-reader-pairing-code', code: 'ABC234', nonce: '1234567890abcdef1234567890abcdef1234567890abcdef', expiresInSeconds: 120 } }
  a.run('handleReaderPairingMessage(message)')
  assert.equal(a.nodes.get('#ebook-reader-pair-value').value, 'ABC234')
  assert.match(a.nodes.get('#ebook-reader-pair-status').textContent, /2 percig/)
  assert.equal(frame.hidden, true)
  assert.equal(typeof expire, 'function')
  expire()
  assert.equal(a.nodes.get('#ebook-reader-pair-value').value, '')
  assert.match(a.nodes.get('#ebook-reader-pair-status').textContent, /lejárt/)
})

test('reader pairing cleans old internal markers before creating one stable marker', async () => {
  const patched = []
  let uploadedMetadata
  const a = app(async (url, options = {}) => {
    if (url.includes('/upload/')) {
      const text = await options.body.text()
      uploadedMetadata = text
      return json({ id: 'new-marker' })
    }
    if (options.method === 'PATCH') { patched.push(url); return json({ id: 'old-marker', trashed: true }) }
    return json({ files: [
      { id: 'old-marker', name: '.grapes-reader-pairing-1789994946554.json' },
      { id: 'book', name: 'book.epub' },
    ] })
  })
  const result = await a.run('createReaderMarker("folder")')
  assert.equal(result.markerId, 'new-marker')
  assert.equal(patched.length, 1)
  assert.match(patched[0], /old-marker/)
  assert.match(uploadedMetadata, /"name":"\.grapes-reader-pairing\.json"/)
})

const brokerSource = readFileSync(new URL('../apps-script/ebook-transfer/Code.gs', import.meta.url), 'utf8')
const brokerWorkflowSource = readFileSync(new URL('../.github/workflows/deploy-ebook-apps-script.yml', import.meta.url), 'utf8')
const pagesWorkflowSource = readFileSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8')
const readerPageSource = readFileSync(new URL('../public/ebook-reader.html', import.meta.url), 'utf8')

test('retired ISBNdb broker returns no books to older tabs without using a key or token', () => {
  const c = vm.createContext({
    HtmlService: { XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }, createHtmlOutput: html => ({ html, setXFrameOptionsMode() { return this } }) },
  })
  vm.runInContext(brokerSource, c)
  const p = { action: 'lookup-isbndb', accessToken: 'drive-token', isbn: '9780306406157', nonce: 'a'.repeat(48) }
  const result = c.doPost({ parameter: p })
  assert.match(result.html, /grapes-isbndb-result/)
  assert.match(result.html, /"books":\[\]/)
  assert.doesNotMatch(result.html, /drive-token|9780306406157/)
  assert.match(c.doPost({ parameter: { ...p, nonce: 'bad' } }).html, /Invalid request/)
  assert.match(c.doPost({ parameter: { action: 'other' } }).html, /Unsupported action/)
})

test('automatic broker deployment stays aligned with every live client URL', () => {
  const deploymentId = (source) => source.match(/AKfyc[A-Za-z0-9_-]+/)?.[0]
  const expected = deploymentId(brokerWorkflowSource)
  assert.ok(expected)
  assert.equal(deploymentId(pagesWorkflowSource), expected)
  assert.equal(deploymentId(readerPageSource), expected)
  assert.match(brokerWorkflowSource, /clasp push --force/)
  assert.match(brokerWorkflowSource, /clasp deploy --deploymentId/)
  assert.match(brokerSource, /BROKER_API_VERSION = 5/)
  assert.match(brokerSource, /action === 'health'/)
})

test('only explicit embedded creation pages allow framing, including readable errors', () => {
  const c = vm.createContext({ HtmlService: { XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }, createHtmlOutput: html => ({ html, setXFrameOptionsMode(mode) { this.frameMode = mode; return this } }) } })
  vm.runInContext(brokerSource, c)
  const embedded = c.doGet({ parameter: { action: 'create', embed: '1' } })
  assert.equal(embedded.frameMode, 'ALLOWALL')
  assert.match(embedded.html, /Hiányzó adatok/)
  assert.equal(c.doGet({ parameter: { action: 'create' } }).frameMode, undefined)
  assert.equal(c.doGet({ parameter: { action: 'reader', embed: '1' } }).frameMode, undefined)
  const compact = c.embeddedCodePage('ABC234', '<book>.pdf', false)
  assert.match(compact.html, /ABC234/)
  assert.match(compact.html, /&lt;book&gt;/)
  assert.doesNotMatch(compact.html, /quickchart|<iframe|<script/)
  const bridged = c.embeddedCodePage('ABC234', 'Olvasó', true, 'grapes-reader-pairing-code', '1234567890abcdef1234567890abcdef1234567890abcdef')
  assert.match(bridged.html, /window\.top\.postMessage/)
  assert.match(bridged.html, /grapes-reader-pairing-code/)
  assert.match(bridged.html, /1234567890abcdef1234567890abcdef1234567890abcdef/)
  assert.match(bridged.html, /fabianpetermark-commits\.github\.io/)
})
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
  const reader = readerPageSource
  assert.doesNotMatch(reader, /type=["']module["']/)
  assert.match(reader, /name="action" value="pair-reader"/)
  assert.match(reader, /grapes-ebook-reader-token/)
  assert.match(brokerSource, /create-reader-pairing/)
  assert.match(brokerSource, /pair-reader/)
  assert.match(brokerSource, /revoke-reader/)
  assert.match(brokerSource, /READER_TOKEN_TTL_MS/)
})


test('paired reader syncs manually added private books from the Grapes Drive folder', () => {
  const records = new Map()
  const token = 'A'.repeat(64)
  records.set('ebook_reader_token_' + token, JSON.stringify({
    folderId: 'folder',
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  }))
  let sharing = 'private'
  let shared = 0
  const file = {
    getName: () => 'manual.epub',
    getId: () => 'manual-book',
    getSize: () => 1234,
    getSharingAccess: () => sharing,
    setSharing(access, permission) {
      assert.equal(access, 'public')
      assert.equal(permission, 'view')
      sharing = access
      shared++
    },
  }
  const iterator = { used: false, hasNext() { return !this.used }, next() { this.used = true; return file } }
  const props = {
    getProperty: key => records.get(key),
    setProperty: (key, value) => records.set(key, value),
    getProperties: () => Object.fromEntries(records),
    deleteProperty: key => records.delete(key),
  }
  const c = vm.createContext({
    HtmlService: { createHtmlOutput: value => value },
    PropertiesService: { getScriptProperties: () => props },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'public' },
      Permission: { VIEW: 'view' },
      getFolderById: () => ({ getId: () => 'folder', getFiles: () => iterator }),
      getFoldersByName: () => ({ hasNext: () => false }),
    },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://broker.example/exec' }) },
  })
  vm.runInContext(brokerSource, c)
  const page = c.readerLibraryPage({ token })
  assert.equal(shared, 1)
  assert.match(page, /manual\.epub/)
  assert.match(page, /drive\.usercontent\.google\.com/)
})


test('paired reader merges duplicate Grapes library folders', () => {
  const records = new Map()
  const token = 'B'.repeat(64)
  records.set('ebook_reader_token_' + token, JSON.stringify({
    folderId: 'new-folder',
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  }))

  const makeFile = (id, name) => ({
    getName: () => name,
    getId: () => id,
    getSize: () => 2048,
    getSharingAccess: () => 'public',
  })
  const iterator = (items) => {
    let index = 0
    return { hasNext: () => index < items.length, next: () => items[index++] }
  }

  const newFolder = { getId: () => 'new-folder', getFiles: () => iterator([makeFile('new-book', 'new.epub')]) }
  const oldFolder = { getId: () => 'old-folder', getFiles: () => iterator([makeFile('old-book', 'old.pdf')]) }

  const props = {
    getProperty: key => records.get(key),
    setProperty: (key, value) => records.set(key, value),
    getProperties: () => Object.fromEntries(records),
    deleteProperty: key => records.delete(key),
  }

  const c = vm.createContext({
    HtmlService: { createHtmlOutput: value => value },
    PropertiesService: { getScriptProperties: () => props },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'public' },
      Permission: { VIEW: 'view' },
      getFolderById: () => newFolder,
      getFoldersByName: () => iterator([oldFolder, newFolder]),
    },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://broker.example/exec' }) },
  })
  vm.runInContext(brokerSource, c)
  const page = c.readerLibraryPage({ token })
  assert.match(page, /new\.epub/)
  assert.match(page, /old\.pdf/)
  assert.match(page, /2 könyv érhető el/)
})


test('paired reader includes supported books from nested subfolders', () => {
  const records = new Map()
  const token = 'C'.repeat(64)
  records.set('ebook_reader_token_' + token, JSON.stringify({
    folderId: 'root',
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  }))

  const iterator = (items) => {
    let index = 0
    return { hasNext: () => index < items.length, next: () => items[index++] }
  }
  const nestedFile = {
    getName: () => 'nested.epub',
    getId: () => 'nested-book',
    getSize: () => 4096,
    getSharingAccess: () => 'public',
  }
  const child = {
    getId: () => 'child',
    getFiles: () => iterator([nestedFile]),
    getFolders: () => iterator([]),
  }
  const root = {
    getId: () => 'root',
    getFiles: () => iterator([]),
    getFolders: () => iterator([child]),
  }
  const props = {
    getProperty: key => records.get(key),
    setProperty: (key, value) => records.set(key, value),
    getProperties: () => Object.fromEntries(records),
    deleteProperty: key => records.delete(key),
  }
  const c = vm.createContext({
    HtmlService: { createHtmlOutput: value => value },
    PropertiesService: { getScriptProperties: () => props },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'public' },
      Permission: { VIEW: 'view' },
      getFolderById: () => root,
      getFoldersByName: () => iterator([]),
    },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://broker.example/exec' }) },
  })
  vm.runInContext(brokerSource, c)
  const page = c.readerLibraryPage({ token })
  assert.match(page, /nested\.epub/)
  assert.match(page, /1 könyv érhető el/)
})
