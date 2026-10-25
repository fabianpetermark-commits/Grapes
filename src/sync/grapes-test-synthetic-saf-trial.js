import {
  getAndroidTestAuthEnabled, getAndroidTestAuthSubject,
  isGrapesAndroidApp, saveAndroidVerifiedUnclaimedBackup,
} from '../android-bridge.js'
import {
  prepareUnclaimedLegacyBackup, verifyUnclaimedLegacyBackup,
} from './grapes-test-legacy-unclaimed-backup.js'

// SAF REHEARSAL ONLY. Neither this module nor its dependencies query a user's
// legacy Food, Water, Finance, E-book, Health or cloud records. The saved file
// is synthetic and must NEVER be offered as a real recovery archive.
const QA = 'grapes-test-v28-synthetic-saf-only'

export function createSyntheticSafFixture() {
  return {
    ownership: 'unclaimed',
    sources: [
      {
        provider: 'indexeddb',
        sourceId: 'food-tracker-saf-qa',
        raw: JSON.stringify({
          id: 'food-tracker-saf-qa', module: 'Ételnapló',
          name: 'Csak mesterséges próba 🍇',
          data: { version: 2, fixture: QA, profile: { id: 'saf-qa' },
            diaryEntries: [{ id: 'synthetic-entry', note: 'Árvíztűrő tükörfúrógép ☘', kcal: 123 }] },
        }),
      },
      {
        provider: 'indexeddb',
        sourceId: 'finance-saf-qa',
        raw: JSON.stringify({
          id: 'finance-saf-qa', module: 'Pénzügyi Napló',
          data: { fixture: QA, transactions: [{
            id: 'synthetic-receipt', amount: 42, currency: 'HUF',
            receipt: { name: 'qa.png', data: 'data:image/png;base64,SGVsbG8=' },
          }] },
        }),
      },
      {
        provider: 'localStorage', sourceId: 'grapes-water-v1',
        raw: JSON.stringify({ '2026-10-25': { goal: 2000,
          entries: [{ id: 'synthetic-water', amount: 250,
            at: '2026-10-25T07:00:00.000Z' }] } }),
      },
      {
        provider: 'localStorage', sourceId: 'grapes-ebook-reading-progress-v1',
        raw: JSON.stringify({ version: 1, books: { 'synthetic-ebook': { percent: 42 } } }),
      },
    ],
  }
}

export function createGrapesTestSyntheticSafTrial({
  enabled = false,
  isAndroid = isGrapesAndroidApp,
  authEnabled = getAndroidTestAuthEnabled,
  getSubject = getAndroidTestAuthSubject,
  prepare = prepareUnclaimedLegacyBackup,
  save = saveAndroidVerifiedUnclaimedBackup,
  verify = verifyUnclaimedLegacyBackup,
  fixture = createSyntheticSafFixture,
  now = () => new Date().toISOString(),
} = {}) {
  return Object.freeze({
    async run() {
      if (enabled !== true || !isAndroid() || !(await authEnabled())) {
        throw new Error('A natív szintetikus SAF-próba nincs engedélyezve.')
      }
      const startUser = await getSubject()
      const capture = fixture()
      const prepared = await prepare(capture, { exportedAt: now() })
      // Never write to the same filename family as a REAL legacy-data backup.
      const filename = prepared.filename.replace('grapes-helyi-adatok-', 'grapes-helyi-teszt-')
      if (!/^grapes-helyi-teszt-\d{4}-\d{2}-\d{2}\.json$/.test(filename)) {
        throw new Error('A mesterséges mentés fájlneve nem megfelelő.')
      }
      const testPrepared = { ...prepared, filename }
      // The native SAF picker is invoked only after explicitly pressing QA.
      const receipt = await save(testPrepared)
      if ((await getSubject()) !== startUser || !(await authEnabled())) {
        throw new Error('A Grapes TEST-fiók megváltozott a fájlmentés alatt.')
      }
      const result = await verify(testPrepared, receipt, fixture())
      if (result.ownership !== 'unclaimed' || result.migrationAuthorized !== false ||
          result.sourceCount !== 4 || result.verified !== true) {
        throw new Error('A mesterséges helyi mentés bizonyítása sikertelen.')
      }
      return Object.freeze({
        status: 'PASS',
        sources: result.sourceCount,
        bytes: result.bytes,
        sha256: result.sha256,
        ownership: 'unclaimed',
        migrationAuthorized: false,
        syntheticOnly: true,
        filename,
      })
    },
  })
}
