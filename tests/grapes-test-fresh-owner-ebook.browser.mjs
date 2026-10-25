import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
assert.ok(executablePath, 'Chromium required for native-owner E-book IndexedDB A-B-A QA')
const port = 4233
const url = `http://127.0.0.1:${port}/Grapes/tests/fixtures/grapes-test-outbox.html`
const server = spawn(process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
let browser
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) break } catch {}
    if (server.exitCode !== null || attempt === 99) throw Error('E-book TEST fixture unavailable')
    await new Promise(done => setTimeout(done, 100))
  }
  browser = await chromium.launch({ executablePath, headless: true,
    args: ['--no-sandbox'] })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(url)
  const evidence = await page.evaluate(async () => {
    const { openGrapesTestFreshEbook } =
      await import('/Grapes/src/ebook/grapes-test-fresh-ebook.js')
    const A = '00000000-0000-4000-8000-000000000001'
    const B = '00000000-0000-4000-8000-000000000002'
    let active = A
    let auth = true
    const args = { enabled: true, isAndroid: () => true,
      authEnabled: async () => auth, getSubject: async () => active }
    const legacy = '{"books":{"old-drive-file":{"overallPercent":99}}}'
    localStorage.setItem('grapes-ebook-reading-progress-v1', legacy)
    localStorage.setItem('grapes-ebook-library-cache-v1', 'LEGACY-UNCLAIMED')

    const a = await openGrapesTestFreshEbook(args)
    const aEmpty = (await a.listBooks()).length === 0
    const aBook = await a.importLocalFile(new File(['A-ONLY-EPUB-BYTES'], 'A-konyv.epub',
      { type: 'application/epub+zip', lastModified: 1771761600000 }))
    const aProgress = await a.saveReadingProgress(aBook.id, {
      chapterId: 'A-fejezet', chapterIndex: 2,
      chapterProgress: .5, overallPercent: 70,
    })
    const aBlob = await a.readFile(aBook.id)
    const aActual = await a.listBooks()
    const aState = await a.status()

    active = B
    let staleSessionBlocked = false
    try { await a.readFile(aBook.id) } catch { staleSessionBlocked = true }
    const b = await openGrapesTestFreshEbook(args)
    const bEmpty = (await b.listBooks()).length === 0
    let foreignFileBlocked = false
    try { await b.readFile(aBook.id) } catch { foreignFileBlocked = true }
    let fakeDriveIdBlocked = false
    try { await b.readFile('old-drive-file') } catch { fakeDriveIdBlocked = true }
    const bBook = await b.importLocalFile(new File(['B-ONLY-TEXT'], 'B-konyv.txt',
      { type: 'text/plain' }))
    await b.saveReadingProgress(bBook.id, {
      chapterId: 'B-fejezet', chapterIndex: 0,
      chapterProgress: 1, overallPercent: 100,
    })
    const bBlob = await b.readFile(bBook.id)

    active = A
    const returning = await openGrapesTestFreshEbook(args)
    const aReturns = await returning.listBooks()
    const aFileReturns = await (await returning.readFile(aBook.id)).text()
    let bStaleBlocked = false
    try { await b.saveReadingProgress(bBook.id, { overallPercent: 20 }) }
    catch { bStaleBlocked = true }
    let foreignProgressBlocked = false
    try { await returning.saveReadingProgress(bBook.id, { overallPercent: 20 }) }
    catch { foreignProgressBlocked = true }
    // The foreign-ID attempt poisons that session; use two clean sessions
    // to prove real compare-and-swap conflict independently.
    const actor1 = await openGrapesTestFreshEbook(args)
    const actor2 = await openGrapesTestFreshEbook(args)
    await actor1.saveReadingProgress(aBook.id, { chapterIndex: 3,
      chapterProgress: .2, overallPercent: 80 })
    let conflictBlocked = false
    try { await actor2.saveReadingProgress(aBook.id, { overallPercent: 10 }) }
    catch (error) { conflictBlocked = /ütközés/.test(error.message) }
    let poisonedBlocked = false
    try { await actor2.saveReadingProgress(aBook.id, { overallPercent: 11 }) }
    catch { poisonedBlocked = true }

    let externalImportBlocked = false
    try { await actor1.importLocalFile({ id: aBook.id,
      name: 'drive-book.epub', ownerId: B }) }
    catch { externalImportBlocked = true }
    auth = false
    let logoutBlocked = false
    try { await actor1.readFile(aBook.id) } catch { logoutBlocked = true }
    let newSessionBlocked = false
    try { await openGrapesTestFreshEbook(args) } catch { newSessionBlocked = true }
    auth = true
    let disabledBlocked = false
    try { await openGrapesTestFreshEbook({ ...args, enabled: false }) }
    catch { disabledBlocked = true }
    let nonAndroidBlocked = false
    try { await openGrapesTestFreshEbook({ ...args, isAndroid: () => false }) }
    catch { nonAndroidBlocked = true }
    return {
      aEmpty, bEmpty, aName: aActual[0]?.name, aBytes: await aBlob.text(),
      aProgress: aProgress.overallPercent, aState, bBytes: await bBlob.text(),
      bOwner: bBook.ownerId, aReturnsName: aReturns[0]?.name,
      aReturnsProgress: aReturns[0]?.reading?.overallPercent,
      aFileReturns, staleSessionBlocked, foreignFileBlocked, fakeDriveIdBlocked,
      bStaleBlocked, foreignProgressBlocked, conflictBlocked, poisonedBlocked,
      externalImportBlocked, logoutBlocked, newSessionBlocked,
      disabledBlocked, nonAndroidBlocked,
      legacyUnchanged: localStorage.getItem('grapes-ebook-reading-progress-v1') === legacy,
      legacyCacheUntouched: localStorage.getItem('grapes-ebook-library-cache-v1') === 'LEGACY-UNCLAIMED',
    }
  })
  assert.deepEqual(evidence, {
    aEmpty: true, bEmpty: true, aName: 'A-konyv.epub',
    aBytes: 'A-ONLY-EPUB-BYTES', aProgress: 70,
    aState: { ownerId: '00000000-0000-4000-8000-000000000001',
      revision: 2, cloudSyncEnabled: false, legacyImportEnabled: false,
      driveAccessEnabled: false },
    bBytes: 'B-ONLY-TEXT', bOwner: '00000000-0000-4000-8000-000000000002',
    aReturnsName: 'A-konyv.epub', aReturnsProgress: 70,
    aFileReturns: 'A-ONLY-EPUB-BYTES',
    staleSessionBlocked: true, foreignFileBlocked: true, fakeDriveIdBlocked: true,
    bStaleBlocked: true, foreignProgressBlocked: true, conflictBlocked: true,
    poisonedBlocked: true, externalImportBlocked: true,
    logoutBlocked: true, newSessionBlocked: true,
    disabledBlocked: true, nonAndroidBlocked: true,
    legacyUnchanged: true, legacyCacheUntouched: true,
  })
  await ctx.close()
  console.log('PASS: real IndexedDB E-book local bytes + progress A→B→A isolation, no legacy claim.')
  console.log('PASS: stale owner, logout, foreign book, Drive ID, CAS collision denied.')
  console.log('NOTE: No mobile E-book screen, Drive access, sync, APK or release in this core PR.')
} finally {
  await browser?.close()
  server.kill()
}
