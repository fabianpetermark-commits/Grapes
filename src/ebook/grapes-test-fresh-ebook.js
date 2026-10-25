import {
  getAndroidTestAuthEnabled, getAndroidTestAuthSubject, isGrapesAndroidApp,
} from '../android-bridge.js'
import { createGrapesTestLocalOwnerStore } from '../storage/grapes-test-local-owner-store.js'

// Separate, TEST-only owner-bound local library. No legacy localStorage, Drive,
// cloud metadata, sharing, or unclaimed book import occurs here.
const OWNER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FILE_ID = /^ebook-file-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIBRARY_ID = 'ebook-library-current'
const MODULE = 'E-book'
const SCHEMA = 1
const MAX_FILE_BYTES = 80 * 1024 * 1024
const SUPPORTED_BOOK = /\\.(?:epub|pdf|txt|fb2|mobi|azw|azw3|cbz|cbr)$/i

function failure(message) { return new Error(message) }
function freshCatalog(ownerId) {
  return { schemaVersion: SCHEMA, ownerId, books: [] }
}
function validateCatalog(value, ownerId) {
  if (!value || value.schemaVersion !== SCHEMA || value.ownerId !== ownerId ||
      !Array.isArray(value.books) || value.books.length > 10000) {
    throw failure('Az E-book könyvtár tulajdonosa vagy formátuma nem ellenőrizhető.')
  }
  const seen = new Set()
  for (const book of value.books) {
    if (!book || book.ownerId !== ownerId || !FILE_ID.test(book.id) ||
        typeof book.name !== 'string' || !SUPPORTED_BOOK.test(book.name) ||
        !Number.isSafeInteger(book.size) || book.size < 0 ||
        book.size > MAX_FILE_BYTES || seen.has(book.id) ||
        !book.reading || typeof book.reading !== 'object' ||
        typeof book.title !== 'string' || typeof book.author !== 'string') {
      throw failure('Az E-book könyvtár idegen vagy sérült könyvrekordot tartalmaz.')
    }
    seen.add(book.id)
  }
  return structuredClone(value)
}
function safeProgress(value) {
  const chapterIndex = Number(value?.chapterIndex ?? 0)
  const chapterProgress = Number(value?.chapterProgress ?? 0)
  const overallPercent = Number(value?.overallPercent ?? 0)
  if (!Number.isSafeInteger(chapterIndex) || chapterIndex < 0 ||
      !Number.isFinite(chapterProgress) || chapterProgress < 0 || chapterProgress > 1 ||
      !Number.isFinite(overallPercent) || overallPercent < 0 || overallPercent > 100) {
    throw failure('Az olvasási pozíció érvénytelen.')
  }
  return {
    chapterId: String(value?.chapterId || '').slice(0, 512),
    chapterIndex, chapterProgress, overallPercent,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Fresh empty, LOCAL E-book storage for one verified Android TEST Auth account.
 * Only a future explicit mobile UI may call this adapter with enabled=true.
 * Book Blobs are stored as separate owner-partitioned IndexedDB records;
 * metadata and reading progress use a small catalog record with CAS revision.
 */
export async function openGrapesTestFreshEbook({
  enabled = false,
  isAndroid = isGrapesAndroidApp,
  authEnabled = getAndroidTestAuthEnabled,
  getSubject = getAndroidTestAuthSubject,
  indexedDb = globalThis.indexedDB,
} = {}) {
  if (!enabled || !isAndroid() || !(await authEnabled())) {
    throw failure('Az E-book új fióktárhelyének TEST-kapuja nem aktív.')
  }
  const subject = await getSubject()
  if (typeof subject !== 'string' || !OWNER.test(subject)) {
    throw failure('Az E-book Grapes TEST-fiók nem ellenőrizhető.')
  }
  const ownerId = subject.toLowerCase()
  let invalid = false
  let poisoned = null
  let pending = Promise.resolve()
  let revision = 0
  let catalog = freshCatalog(ownerId)

  async function verify() {
    if (invalid) throw failure('A korábbi E-book munkamenet lejárt.')
    try {
      if (!(await authEnabled()) || (await getSubject())?.toLowerCase() !== ownerId) {
        throw failure('A Grapes TEST-fiók megváltozott; az E-book művelet leállt.')
      }
    } catch (error) {
      invalid = true
      throw error
    }
    return ownerId
  }
  const store = createGrapesTestLocalOwnerStore({
    enabled: true, indexedDb, getVerifiedSubject: verify,
  })

  async function loadCatalog() {
    const row = await store.read(LIBRARY_ID)
    if (row && (row.data?.module !== MODULE || row.data?.ownerId !== ownerId)) {
      throw failure('Az E-book könyvtár fiókadata nem megfelelő.')
    }
    const data = row ? validateCatalog(row.data?.data, ownerId) : freshCatalog(ownerId)
    revision = row?.revision || 0
    catalog = data
    await verify()
  }
  await loadCatalog()

  function queue(work) {
    if (poisoned) return Promise.reject(poisoned)
    const job = pending.then(async () => {
      if (poisoned) throw poisoned
      try {
        await verify()
        return await work()
      } catch (error) {
        poisoned = error
        throw error
      }
    })
    pending = job
    return job
  }
  async function saveCatalog(next) {
    const candidate = validateCatalog(next, ownerId)
    const result = await store.save({
      id: LIBRARY_ID, expectedRevision: revision,
      data: { module: MODULE, name: 'E-book könyvtár', ownerId,
        updatedAt: new Date().toISOString(), data: candidate },
    })
    revision = result.revision
    catalog = candidate
    return result
  }

  return Object.freeze({
    ownerId,
    async listBooks() {
      if (poisoned) throw poisoned
      await pending
      await verify()
      await loadCatalog()
      return structuredClone(catalog.books)
    },
    async readFile(bookId) {
      if (poisoned) throw poisoned
      await pending
      await verify()
      const book = catalog.books.find(item => item.id === bookId)
      if (!book) throw failure('Ez a könyv nem tartozik az aktuális E-book könyvtárhoz.')
      const row = await store.read(bookId)
      if (!row || row.data?.module !== MODULE ||
          row.data?.ownerId !== ownerId || row.data?.fileId !== bookId ||
          !(row.data.blob instanceof Blob) || row.data.blob.size !== book.size) {
        throw failure('A könyvfájl hiányzik, vagy fiókadata nem ellenőrizhető.')
      }
      await verify()
      return row.data.blob
    },
    async importLocalFile(file) {
      // Never accept an existing fileId, Drive ID or imported owner metadata.
      // Only bytes explicitly supplied from a NEW local file are admissible.
      if (!(file instanceof Blob) || typeof file.name !== 'string' ||
          !SUPPORTED_BOOK.test(file.name) || !file.name.trim() ||
          !Number.isSafeInteger(file.size) || file.size < 1 ||
          file.size > MAX_FILE_BYTES) {
        throw failure('Csak új, legfeljebb 80 MB-os helyi könyvfájl vehető fel.')
      }
      const blob = new Blob([file], { type: file.type || 'application/octet-stream' })
      const name = file.name.trim()
      const id = 'ebook-file-' + crypto.randomUUID()
      const book = {
        id, ownerId, name, title: name.replace(/\\.[^.]+$/, ''),
        author: '', size: blob.size, modifiedTime: new Date(file.lastModified || Date.now()).toISOString(),
        createdAt: new Date().toISOString(), reading: {
          chapterId: '', chapterIndex: 0, chapterProgress: 0,
          overallPercent: 0, updatedAt: '',
        },
      }
      return queue(async () => {
        // File first: a catalog must never point to missing bytes.
        // A failed catalog CAS can leave an unreachable owner-only blob;
        // do not retry silently or present a falsely successful import.
        await store.save({ id, data: {
          module: MODULE, ownerId, fileId: id, blob,
        }, expectedRevision: 0 })
        await saveCatalog({ ...catalog, books: [...catalog.books, book] })
        return structuredClone(book)
      })
    },
    async saveReadingProgress(bookId, value) {
      if (!FILE_ID.test(String(bookId))) {
        return Promise.reject(failure('Érvénytelen könyvazonosító.'))
      }
      let reading
      try { reading = safeProgress(value) }
      catch (error) { return Promise.reject(error) }
      return queue(async () => {
        const index = catalog.books.findIndex(book => book.id === bookId)
        if (index < 0) throw failure('A könyv nem tartozik ehhez a Grapes-fiókhoz.')
        const books = structuredClone(catalog.books)
        books[index].reading = reading
        await saveCatalog({ ...catalog, books })
        return structuredClone(reading)
      })
    },
    async assertOwner() {
      if (poisoned) throw poisoned
      await pending
      await verify()
      await store.read(LIBRARY_ID)
      return ownerId
    },
    async status() {
      await this.assertOwner()
      return { ownerId, revision, cloudSyncEnabled: false,
        legacyImportEnabled: false, driveAccessEnabled: false }
    },
  })
}
