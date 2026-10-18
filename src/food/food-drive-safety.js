// Fail closed when a local Food diary is not explicitly linked to a Drive file.
// Never guess that an arbitrary first file belongs to a particular local diary.
export function foodProjectHasUserContent(project) {
  if (!project || typeof project !== 'object') return false
  const collections = ['customFoods', 'recipes', 'diaryEntries', 'favorites', 'recentFoods',
    'recipeLibraries', 'importBatches', 'sharingContacts', 'processedShareIds']
  if (collections.some(key => Array.isArray(project[key]) && project[key].length > 0)) return true
  if (project.settings && Object.keys(project.settings).length > 0) return true
  const targets = Array.isArray(project.targets) ? project.targets : []
  if (targets.length > 1) return true
  const values = targets[0]?.values
  if (!values) return false
  return Number(values.energyKcal ?? 2000) !== 2000 ||
    ['protein', 'carbohydrate', 'fat'].some(key => values[key] !== null && values[key] !== undefined)
}

export function chooseFoodDriveProject(files, { linkedFileId = '', localProject = null } = {}) {
  const candidates = Array.isArray(files)
    ? files.filter(file => file && typeof file.id === 'string' && file.id.trim())
    : []
  const linkedId = String(linkedFileId || '').trim()
  if (linkedId) {
    const candidate = candidates.find(file => file.id === linkedId)
    return candidate ? { candidate, conflict: '' } : {
      candidate: null, conflict: 'A korábban összekapcsolt Food Drive-fájl nem található. A helyi adatok megmaradnak, automatikus másik fájlválasztás nincs.',
    }
  }
  if (candidates.length > 0 && foodProjectHasUserContent(localProject)) {
    return { candidate: null, conflict: 'A helyi Food-napló nincs összekapcsolva a már létező Drive-naplóval. Az adatok felülírása helyett készíts mentést és ellenőrizd a két példányt.' }
  }
  if (candidates.length === 1) return { candidate: candidates[0], conflict: '' }
  if (candidates.length > 1) {
    return { candidate: null, conflict: 'Több Food Drive-napló található. Automatikusan egyiket sem választjuk ki.' }
  }
  return { candidate: null, conflict: '' }
}

export function assertFoodDriveCreateSafe(existingFiles) {
  if (Array.isArray(existingFiles) && existingFiles.some(file => file?.id)) {
    throw new Error('Már létezik Food-napló a Drive-on, de a helyi napló nincs hozzákapcsolva. Az automatikus új fájl készítése leállt az ütközés elkerülésére.')
  }
}
