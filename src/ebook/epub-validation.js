let worker
let requestId = 0
const pending = new Map()

const CATEGORY_LABELS = {
  ACC: 'Akadálymentesség',
  CSS: 'Stíluslap',
  HTM: 'XHTML-tartalom',
  MED: 'Médiafájl',
  NAV: 'Tartalomjegyzék',
  NCX: 'EPUB 2 tartalomjegyzék',
  OPF: 'Könyvadatok és fájllista',
  PKG: 'EPUB-csomag',
  RSC: 'Fájl vagy hivatkozás',
}

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./epubcheck.worker.js', import.meta.url), { type: 'module', name: 'grapes-epubcheck' })
  worker.addEventListener('message', (event) => {
    const task = pending.get(event.data?.id)
    if (!task) return
    pending.delete(event.data.id)
    if (event.data.error) task.reject(new Error(event.data.error))
    else task.resolve(event.data.result)
  })
  worker.addEventListener('error', (event) => {
    const error = new Error(event.message || 'Az EPUBCheck háttérfolyamata leállt.')
    for (const task of pending.values()) task.reject(error)
    pending.clear()
    worker?.terminate()
    worker = null
  })
  return worker
}

export function validateEpub(file, name) {
  const id = ++requestId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, file, name })
  })
}

export function validationSummary(result) {
  const counts = {
    fatals: Number(result?.summary?.fatals || 0),
    errors: Number(result?.summary?.errors || 0),
    warnings: Number(result?.summary?.warnings || 0),
    infos: Number(result?.summary?.infos || 0),
  }
  if (counts.fatals || counts.errors) return { kind: 'error', label: 'Az EPUB hibákat tartalmaz', counts }
  if (counts.warnings) return { kind: 'warning', label: 'Az EPUB használható, de figyelmeztetéseket tartalmaz', counts }
  return { kind: 'success', label: 'Érvényes EPUB', counts }
}

export function messageLabel(message) {
  const prefix = String(message?.code || '').split('-')[0]
  return CATEGORY_LABELS[prefix] || 'EPUB-ellenőrzés'
}
