// Water is stored in localStorage, NOT in Food projects or Food JSON backups.
// All days and historical imported hydration keys must survive a Food upgrade.
export const WATER_BACKUP_VERSION = 1

export function readWaterStoreStrict(storage) {
  const value = storage.getItem('grapes-water-v1')
  if (value === null) return {}
  if (value === '') throw new Error('A víznapló mentett adata üres. Nem írjuk felül.')
  let decoded
  try { decoded = JSON.parse(value) } catch {
    throw new Error('A víznapló mentett adata nem érvényes JSON. Nem írjuk felül.')
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new Error('A víznapló mentett adata nem napokra bontott objektum.')
  }
  for (const [date, day] of Object.entries(decoded)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || typeof day !== 'object' ||
        !Number.isFinite(Number(day.goal)) || Number(day.goal) <= 0 || !Array.isArray(day.entries)) {
      throw new Error('Hibás víznapló-adat: ' + date)
    }
    for (const entry of day.entries) {
      if (!entry || !String(entry.id || '').trim() || !Number.isFinite(Number(entry.amount)) ||
          Number(entry.amount) <= 0 || !Number.isFinite(Date.parse(entry.at))) {
        throw new Error('A víznapló egyik történeti bejegyzése érvénytelen: ' + date)
      }
    }
  }
  return decoded
}

// A storage write is only confirmed after a strict readback. The caller's
// original bytes also detect a stale sequential edit from another page.
export function writeWaterStoreVerified(storage, data, expectedRaw) {
  const currentRaw = storage.getItem('grapes-water-v1')
  readWaterStoreStrict({ getItem: () => currentRaw })
  if (currentRaw !== expectedRaw) {
    throw new Error('A víznapló időközben megváltozott. Frissítsd az oldalt; az új mentés nem írta felül.')
  }
  const serialized = JSON.stringify(data)
  readWaterStoreStrict({ getItem: () => serialized })
  storage.setItem('grapes-water-v1', serialized)
  if (storage.getItem('grapes-water-v1') !== serialized) {
    throw new Error('A víznapló helyi mentése nem igazolható.')
  }
  return serialized
}

export function restoreWaterBackupVerified(storage, restored, recoveryId = crypto.randomUUID()) {
  const serialized = JSON.stringify(restored)
  readWaterStoreStrict({ getItem: () => serialized })
  const original = storage.getItem('grapes-water-v1')
  const recoveryKey = `grapes-water-recovery-v1:${recoveryId}`
  if (storage.getItem(recoveryKey) !== null) throw new Error('A Víz helyreállító azonosítója már létezik.')
  // Keep the exact old bytes, even if they are damaged. Never overwrite an
  // earlier recovery snapshot. A failed checkpoint must stop the restore.
  storage.setItem(recoveryKey, original === null ? 'null' : original)
  if (storage.getItem(recoveryKey) !== (original === null ? 'null' : original)) {
    throw new Error('A régi víznapló biztonsági másolata nem ellenőrizhető.')
  }
  if (storage.getItem('grapes-water-v1') !== original) {
    throw new Error('A víznapló időközben megváltozott; a visszaállítás leállt.')
  }
  storage.setItem('grapes-water-v1', serialized)
  if (storage.getItem('grapes-water-v1') !== serialized) {
    throw new Error('A víznapló visszaállítása nem igazolható; a korábbi állapot külön megmaradt.')
  }
  return recoveryKey
}
export function waterBackupToJson(storage, exportedAt = new Date().toISOString()) {
  const data = readWaterStoreStrict(storage)
  return JSON.stringify({ grapesWaterBackup:true, version:WATER_BACKUP_VERSION, exportedAt, data }, null, 2)
}
export function waterBackupFromJson(text) {
  let backup
  try { backup = JSON.parse(text) } catch { throw new Error('Hibás Víz napló JSON-mentés.') }
  if (backup?.grapesWaterBackup !== true || backup.version !== WATER_BACKUP_VERSION) {
    throw new Error('Nem támogatott Víz napló mentés.')
  }
  const source = JSON.stringify(backup.data)
  return readWaterStoreStrict({ getItem: () => source })
}
export function waterBackupSummary(data) {
  return { days: Object.keys(data).length,
    entries: Object.values(data).reduce((n,day) => n + day.entries.length,0),
    linkedRecords: Object.values(data).flatMap(day => day.entries).filter(e => e.externalKey).length }
}
export function verifyWaterPreserved(before, after) {
  const old = readWaterStoreStrict({getItem:()=>JSON.stringify(before)})
  const current = readWaterStoreStrict({getItem:()=>JSON.stringify(after)})
  if (JSON.stringify(old) !== JSON.stringify(current)) {
    throw new Error('A Víz napló megváltozott az ételnapló-átállítás során. A művelet leállt.')
  }
  return true
}
