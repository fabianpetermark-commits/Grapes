const MODULE = 'Ételnapló'
const PRIMARY_NAME = 'Ételnapló.grapes.json'

export function primaryFoodFiles(files) {
  return files.filter(file => file?.name === PRIMARY_NAME && !file.trashed)
}

export function assertFoodRemote(remote, profileId) {
  if (remote?.grapesProject !== true || remote.module !== MODULE || remote.data?.profile?.id !== profileId) {
    const error = new Error('A Drive-fájl nem ehhez a Food-profilhoz tartozik.')
    error.code = 'FOOD_DRIVE_CONFLICT'
    throw error
  }
  return remote
}

export function createFoodDriveGuard({ list, metadata, load, save, randomId = () => crypto.randomUUID() }) {
  async function recoveryCopy(profileId, data) {
    if (data?.profile?.id !== profileId) throw new Error('Másik profil Food-adata nem menthető.')
    return save({ module: MODULE, name: `Ételnapló-helyreállítás-${randomId()}`, data: structuredClone(data), writeId: randomId(), privateRecovery: true })
  }

  async function upload({ profileId, data, fileId = null, version = null, writeId: previousWriteId = null }) {
    if (data?.profile?.id !== profileId) throw new Error('Másik profil Food-adata nem tölthető fel.')
    const snapshot = structuredClone(data)
    const newWriteId = randomId()
    const conflict = async reason => {
      let recoveryId = null, recoveryError = null
      try { recoveryId = await recoveryCopy(profileId, snapshot) }
      catch (error) { recoveryError = error.message || String(error) }
      return { conflict: true, reason, recoveryId, recoveryError, fileId, version, writeId: previousWriteId }
    }
    if (!fileId) {
      const existing = primaryFoodFiles(await list())
      if (existing.length) return conflict('A Drive-on már van Food-projekt; a helyi naplót nem írtuk rá.')
      const createdId = await save({ module: MODULE, name: MODULE, data: snapshot, writeId: newWriteId })
      const files = primaryFoodFiles(await list())
      if (files.length !== 1 || files[0].id !== createdId) return conflict('Több Food-projekt jött létre egyszerre; mindkettő megmaradt.')
      const head = assertFoodRemote(await load(createdId), profileId)
      const headMeta = await metadata(createdId)
      if (head.writeId !== newWriteId) return conflict('A létrehozott Food-projekt ellenőrzése eltért.')
      return { conflict: false, fileId: createdId, version: String(headMeta.version), writeId: newWriteId }
    }
    const before = await metadata(fileId)
    if (!before?.version) return conflict('A Drive-fájl verziója nem olvasható; nincs biztonságos feltöltés.')
    if (before.name !== PRIMARY_NAME || before.trashed || before.mimeType !== 'application/json') {
      return conflict('A cél Drive-fájl nem az aktív Food-projekt.')
    }
    const current = assertFoodRemote(await load(fileId), profileId)
    if (!version || String(before.version) !== String(version) || current.writeId !== previousWriteId) {
      return conflict('A Drive-napló az utolsó ellenőrzés óta megváltozott.')
    }
    // Every writer creates an immutable copy of its own snapshot before PATCH.
    // Drive v3 documents no atomic conditional media PATCH for this endpoint.
    const recoveryId = await recoveryCopy(profileId, snapshot)
    const recheck = await metadata(fileId)
    if (String(recheck.version) !== String(version)) {
      return { conflict: true, reason: 'A Drive-napló feltöltés előtt megváltozott.', recoveryId, fileId, version, writeId: previousWriteId }
    }
    await save({ module: MODULE, name: MODULE, data: snapshot, fileId, writeId: newWriteId })
    const head = assertFoodRemote(await load(fileId), profileId)
    const headMeta = await metadata(fileId)
    if (head.writeId !== newWriteId) {
      return { conflict: true, reason: 'Egy másik eszköz felülírta a feltöltést; a helyreállító másolat megmaradt.', recoveryId, fileId, version, writeId: previousWriteId }
    }
    return { conflict: false, recoveryId, fileId, version: String(headMeta.version), writeId: newWriteId }
  }

  return { upload, recoveryCopy }
}
