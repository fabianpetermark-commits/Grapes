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
function app(fetch, { connected = true, session = new Map(), local = new Map() } = {}) {
  const nodes = new Map()
  const element = () => ({ dataset: {}, children: [], listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn }, removeAttribute(key) { delete this[key] }, replaceChildren() { this.children = [] }, append(row) { this.children.push(row) }, querySelectorAll: () => [] })
  const document = { querySelector(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id) }, createElement: element, head: { append() {} } }
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) })
  if (connected && !session.has('grapes-drive-session')) session.set('grapes-drive-session', JSON.stringify({ clientId: '123-client', accessToken: 'test-token', expiresAt: Date.now() + 3600000 }))
  const testSetTimeout = (callback, delay) => { const timer = setTimeout(callback, delay); timer.unref?.(); return timer }
  const context = vm.createContext({ document, fetch, Blob, URL, URLSearchParams, AbortController, crypto: webcrypto, QRCode: { async toCanvas(canvas, value) { canvas.qrValue = value } },
    env: { VITE_GOOGLE_CLIENT_ID: '123-client', VITE_EBOOK_TRANSFER_BROKER_URL: 'https://broker.example/exec' },
    window: { sessionStorage: storage(session), localStorage: storage(local), setTimeout: testSetTimeout, clearTimeout, location: { href: 'https://fabianpetermark-commits.github.io/Grapes/', origin: 'https://fabianpetermark-commits.github.io', search: '' } } })
  const driveContext = vm.createContext({ window: context.window, document, fetch, env: context.env, Blob, crypto: webcrypto })
  const api = vm.runInContext(driveSource + '\n({ connectGrapesDrive, disconnectGrapesDrive, getGrapesDriveAccessToken, grapesDriveHasFullReadAccess, grapesDriveRequest, isGrapesDriveConnected, onGrapesDriveChange })', driveContext)
  Object.assign(context, api)
  vm.runInContext(source + '\nonGrapesDriveChange(renderDriveConnection)', context)
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
  a.context.window.open = () => { throw new Error('must not open a new window') }
  await a.run('createReaderPairing()')
  const frame = a.nodes.get('#ebook-reader-pair-code')
  const url = new URL(frame.src)
  assert.equal(frame.hidden, false)
  assert.equal(url.searchParams.get('action'), 'create-reader-pairing')
  assert.equal(url.searchParams.get('embed'), '1')
  assert.equal(url.searchParams.get('markerId'), 'marker')
  assert.match(url.searchParams.get('nonce'), /^[a-f0-9]{48}$/)
  assert.equal(a.nodes.get('#ebook-reader-pair-btn').disabled, false)
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

test('metadata lookup falls back to a verified author and preserves a Hungarian title', async () => {
  const calls = []
  const a = app(async url => {
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
  const a = app(async () => json({ docs: [{ title: 'Dune', author_name: ['Frank Herbert'], first_publish_year: 1965 }] }))
  a.run('currentBooks = [{ id: "book", name: "Frank Herbert - Dune.epub" }]')
  a.run('$("#ebook-metadata-book"); $("#ebook-metadata-title"); $("#ebook-metadata-author")')
  a.nodes.get('#ebook-metadata-book').value = 'book'
  a.nodes.get('#ebook-metadata-title').value = 'Dune'
  a.nodes.get('#ebook-metadata-author').value = 'Frank Herbert'
  await a.run('lookupBookMetadata()')
  assert.equal(a.nodes.get('#ebook-metadata-suggestion').dataset.kind, 'success')
  assert.match(a.nodes.get('#ebook-metadata-suggestion').textContent, /Dune — Frank Herbert · 1965/)
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

test('automatic broker deployment stays aligned with every live client URL', () => {
  const deploymentId = (source) => source.match(/AKfyc[A-Za-z0-9_-]+/)?.[0]
  const expected = deploymentId(brokerWorkflowSource)
  assert.ok(expected)
  assert.equal(deploymentId(pagesWorkflowSource), expected)
  assert.equal(deploymentId(readerPageSource), expected)
  assert.match(brokerWorkflowSource, /clasp push --force/)
  assert.match(brokerWorkflowSource, /clasp deploy --deploymentId/)
  assert.match(brokerSource, /BROKER_API_VERSION = 3/)
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
