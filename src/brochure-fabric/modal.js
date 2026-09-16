// Egyszerű, újrafelhasználható modális ablak a kísérleti Fabric-modulhoz
// (QR-kód, Unsplash stb.), a GrapesJS `editor.Modal` API-jának megfelelője.

let overlayEl = null

function ensureOverlay() {
  if (overlayEl) return overlayEl
  overlayEl = document.createElement('div')
  overlayEl.className = 'fabric-modal-overlay hidden'
  overlayEl.innerHTML = `
    <div class="fabric-modal">
      <div class="fabric-modal-header">
        <span class="fabric-modal-title"></span>
        <button type="button" class="fabric-modal-close">✕</button>
      </div>
      <div class="fabric-modal-body"></div>
    </div>
  `
  document.body.append(overlayEl)
  overlayEl.querySelector('.fabric-modal-close').addEventListener('click', closeModal)
  overlayEl.addEventListener('click', (event) => {
    if (event.target === overlayEl) closeModal()
  })
  return overlayEl
}

export function openModal(title, contentEl) {
  const overlay = ensureOverlay()
  overlay.querySelector('.fabric-modal-title').textContent = title
  const body = overlay.querySelector('.fabric-modal-body')
  body.innerHTML = ''
  body.append(contentEl)
  overlay.classList.remove('hidden')
}

export function closeModal() {
  if (overlayEl) overlayEl.classList.add('hidden')
}
