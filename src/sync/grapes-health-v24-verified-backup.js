// TEST-only local Health backup envelope. No app store or network access.
export const HEALTH_BACKUP_LIMIT_BYTES = 80 * 1024 * 1024
const marker = 'grapesHealthMigrationBackup'

async function hashText(value, subtle) {
  if (!subtle?.digest) throw new Error('SHA-256 is unavailable')
  const bytes = new TextEncoder().encode(value)
  const digest = await subtle.digest('SHA-256', bytes)
  return { bytes: bytes.length, sha256: [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0')).join('') }
}

function sourceVersions(capture) {
  if (!Array.isArray(capture?.inventories) ||
      !Array.isArray(capture?.snapshots) ||
      capture.inventories.length !== capture.snapshots.length) {
    throw new Error('Incomplete Health source capture')
  }
  const versions = []
  const seen = new Set()
  for (let index = 0; index < capture.snapshots.length; index++) {
    const source = capture.inventories[index]?.source
    const snapshot = capture.snapshots[index]
    if (!source || source.ownerId !== null ||
        !snapshot || source.provider !== snapshot.provider ||
        source.sourceId !== snapshot.sourceId ||
        source.version !== snapshot.version ||
        !/^sha256:[0-9a-f]{64}$/.test(snapshot.version)) {
      throw new Error('Health source snapshot mismatch')
    }
    const key = snapshot.provider + '/' + snapshot.sourceId
    if (seen.has(key)) throw new Error('Duplicate Health backup source')
    seen.add(key)
    versions.push({ provider: snapshot.provider, sourceId: snapshot.sourceId,
      version: snapshot.version })
  }
  return versions
}

export async function prepareV24HealthBackup(capture, {
  exportedAt = new Date().toISOString(), subtle = globalThis.crypto?.subtle
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(exportedAt)) throw new Error('Invalid backup time')
  const versions = sourceVersions(capture)
  if (!versions.length) throw new Error('No local Health source to back up')
  for (const snapshot of capture.snapshots) {
    const content = snapshot.provider === 'indexeddb'
      ? JSON.stringify(snapshot.document) : snapshot.raw
    if (typeof content !== 'string' ||
        'sha256:' + (await hashText(content, subtle)).sha256 !== snapshot.version) {
      throw new Error('Health source changed while preparing backup')
    }
  }
  const json = JSON.stringify({
    [marker]: true, version: 1, exportedAt, ownership: 'unclaimed',
    sources: capture.snapshots
  })
  const digest = await hashText(json, subtle)
  if (digest.bytes > HEALTH_BACKUP_LIMIT_BYTES) {
    throw new Error('Health backup exceeds safe Android export size')
  }
  return {
    filename: `grapes-health-attekintes-${exportedAt.slice(0, 10)}.json`,
    json, ...digest, sourceVersions: versions
  }
}

export function assertVerifiedV24HealthBackup(prepared, receipt, currentCapture) {
  if (!prepared || !/^[0-9a-f]{64}$/.test(prepared.sha256) ||
      receipt?.sha256 !== prepared.sha256 ||
      receipt?.bytes !== prepared.bytes) {
    throw new Error('Saved Health backup could not be verified')
  }
  const current = sourceVersions(currentCapture)
  if (JSON.stringify(current) !== JSON.stringify(prepared.sourceVersions)) {
    throw new Error('Local Health sources changed after backup')
  }
  return Object.freeze({ sha256: prepared.sha256, bytes: prepared.bytes,
    sources: current.length, verified: true })
}
