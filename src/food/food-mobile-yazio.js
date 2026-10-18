import { createFoodId, foodBackupFromJson, foodBackupToJson } from './food-data.js'
import { applyYazioBatch, markYazioBatchComplete, prepareYazioImport, undoYazioBatch } from './food-yazio-import.js'
import { saveLocalProject } from '../storage/local-project-store.js'

// The host owns profile loading, persistence and the shared mobile sheet lifecycle.
export function createMobileYazio({ root, getProject, commit, openSheet, closeSheet, showToast }) {
  const sheet = document.createElement('section')
  sheet.className = 'bottom-sheet'
  sheet.dataset.foodYazioSheet = ''
  sheet.setAttribute('role', 'dialog')
  sheet.setAttribute('aria-modal', 'true')
  sheet.setAttribute('aria-label', 'YAZIO előzményimport')
  sheet.setAttribute('aria-hidden', 'true')
  sheet.inert = true
  sheet.innerHTML = `<div class="sheet-handle"></div><h2>YAZIO előzményimport</h2>
    <p data-yazio-summary></p><p>Legfeljebb 40 MB-os JSON. A hiányzó tápérték ismeretlen marad. A víz, testsúly és célok csak az archívumban maradnak; a forrásreceptek csak olvashatók. Az exportált történeti értékek eltérhetnek az eredeti naplótól.</p>
    <p>A teljes forrásarchívum a Food-projekt része lesz. Drive-mentéskor oda is feltöltődik.</p>
    <div class="sheet-form"><label>Szűrés<select class="search" data-yazio-filter><option value="all">Minden rekord</option><option value="ready">Új</option><option value="uncertain">Bizonytalan</option><option value="duplicate">Korábban importálva</option><option value="invalid">Hibás</option></select></label></div>
    <div class="sheet-results" data-yazio-records></div>
    <div class="sync-actions"><button type="button" data-yazio-prev>Előző</button><button type="button" data-yazio-next>Következő</button></div>
    <p data-yazio-page></p><p data-yazio-warnings></p><p role="status" aria-live="polite" data-yazio-progress></p>
    <button type="button" class="primary module-cta" data-yazio-confirm>Kijelöltek importálása</button>
    <button type="button" class="quick-action" data-yazio-cancel>Mégse</button>`
  root.querySelector('.phone').append(sheet)
  const $ = selector => sheet.querySelector(selector)
  let preview = null, selected = new Set(), page = 0, busy = false
  const labels = { ready: 'Új', uncertain: 'Bizonytalan – külön kijelölendő', duplicate: 'Már importálva', invalid: 'Hibás' }

  function render() {
    const records = preview.records.filter(item => $('[data-yazio-filter]').value === 'all' || item.status === $('[data-yazio-filter]').value)
    page = Math.max(0, Math.min(page, Math.ceil(records.length / 100) - 1))
    const container = $('[data-yazio-records]'); container.replaceChildren()
    for (const item of records.slice(page * 100, (page + 1) * 100)) {
      const row = document.createElement('label'); row.className = 'sheet-result'
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = selected.has(item.index)
      input.disabled = busy || !['ready', 'uncertain'].includes(item.status)
      input.addEventListener('change', () => { if (input.checked) selected.add(item.index); else selected.delete(item.index) })
      const content = document.createElement('span')
      content.textContent = `${item.record.date || ''} · ${item.entry?.snapshot.name || item.record.product || 'Ismeretlen étel'} · ${labels[item.status]}${item.error ? ' · ' + item.error : ''}`
      row.append(input, content); container.append(row)
    }
    $('[data-yazio-page]').textContent = `${records.length ? page + 1 : 0} / ${Math.ceil(records.length / 100)} oldal`
    $('[data-yazio-prev]').disabled = busy || page === 0
    $('[data-yazio-next]').disabled = busy || (page + 1) * 100 >= records.length
    $('[data-yazio-confirm]').disabled = busy
    $('[data-yazio-cancel]').disabled = busy
  }

  async function backup(project, id) {
    const serialized = foodBackupToJson(project)
    await saveLocalProject({ id: `food-tracker-${project.profile.id}:yazio-backup:${id}`, module: 'Ételnapló biztonsági mentés', name: 'YAZIO import előtti mentés', data: foodBackupFromJson(serialized, project.profile.id), driveFileId: null })
    const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `grapes-food-before-yazio-${id}.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  function prepare(source) {
    if (busy) throw new Error('Az előző import még folyamatban van.')
    const project = getProject()
    preview = prepareYazioImport(source, { profileId: project.profile.id, existingEntries: project.diaryEntries })
    selected = new Set(preview.records.filter(item => item.status === 'ready').map(item => item.index)); page = 0
    $('[data-yazio-filter]').value = 'all'
    $('[data-yazio-summary]').textContent = `${preview.from} – ${preview.to} · ${preview.days} nap · ${preview.counts.ready} új · ${preview.counts.duplicate} korábbi · ${preview.counts.uncertain} bizonytalan · ${preview.counts.invalid} hibás`
    const readableWarning = value => {
      if (typeof value !== 'string') return value?.message || JSON.stringify(value)
      try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed.message === 'string' ? parsed.message : value
      } catch { return value }
    }
    $('[data-yazio-warnings]').textContent = [...preview.warnings, ...preview.discrepancies].map(readableWarning).join('\n')
    $('[data-yazio-progress]').textContent = ''
    render(); openSheet(sheet)
    return { pending: true }
  }

  async function apply() {
    if (busy || !preview) return
    const originalProfile = preview.profileId
    if (getProject().profile.id !== originalProfile) { closeSheet(); return showToast('A profil megváltozott. Nyisd meg újra az importot.') }
    const indexes = [...selected]
    const resumable = getProject().importBatches.find(item => item.source === 'yazio' && item.status === 'in-progress' && item.exportFingerprint === preview.exportFingerprint)
    if (!indexes.length && !resumable) { $('[data-yazio-progress]').textContent = 'Nincs új, kijelölt rekord.'; return }
    busy = true; render()
    const batchId = resumable?.id || createFoodId('yazio-batch')
    try {
      await backup(getProject(), batchId)
      let imported = 0
      for (let offset = 0; offset < indexes.length; offset += 150) {
        if (getProject().profile.id !== originalProfile) throw new Error('A profil megváltozott; az import megállt.')
        const result = applyYazioBatch(getProject(), preview, indexes.slice(offset, offset + 150), batchId)
        await commit(result.project); imported += result.added
        $('[data-yazio-progress]').textContent = `${imported} rekord helyben mentve…`
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      if (getProject().importBatches.some(item => item.id === batchId)) await commit(markYazioBatchComplete(getProject(), batchId))
      closeSheet(); showToast(`${imported} YAZIO-bejegyzés importálva.`)
    } catch (error) {
      $('[data-yazio-progress]').textContent = `Az import megállt: ${error.message} A sikeresen mentett rész ugyanazzal a fájllal folytatható.`
      preview = prepareYazioImport(preview.sourceArchive ? { data: preview.sourceArchive, meta: preview.meta } : '', { profileId: originalProfile, existingEntries: getProject().diaryEntries })
      selected = new Set(preview.records.filter(item => item.status === 'ready').map(item => item.index))
    } finally { busy = false; render() }
  }

  async function undo() {
    if (busy) return
    const project = getProject()
    const batch = [...project.importBatches].reverse().find(item => item.source === 'yazio' && !['undone', 'partial-undo'].includes(item.status))
    if (!batch) return showToast('Nincs visszavonható YAZIO-import.')
    if (!window.confirm('Visszavonod az utolsó YAZIO-importot? Az utólag módosított bejegyzések megmaradnak.')) return
    busy = true
    try { await backup(project, batch.id + '-undo'); const result = undoYazioBatch(project, batch.id); await commit(result.project); showToast(`${result.removed} bejegyzés visszavonva, ${result.modified.length} módosított bejegyzés megőrizve.`) }
    catch (error) { showToast(error.message) }
    finally { busy = false }
  }

  $('[data-yazio-confirm]').addEventListener('click', apply)
  $('[data-yazio-cancel]').addEventListener('click', () => { if (!busy) closeSheet() })
  $('[data-yazio-filter]').addEventListener('change', () => { page = 0; render() })
  $('[data-yazio-prev]').addEventListener('click', () => { page--; render() })
  $('[data-yazio-next]').addEventListener('click', () => { page++; render() })
  root.addEventListener('click', event => {
    if (busy && !sheet.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation() }
  }, true)
  root.addEventListener('keydown', event => {
    if (busy && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation() }
  }, true)
  return { prepare, undo, isBusy: () => busy }
}
