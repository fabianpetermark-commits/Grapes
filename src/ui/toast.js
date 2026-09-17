// Nem blokkoló visszajelzés. Eddig minden hiba `window.alert()`-tel jött —
// 17 híváshelyen —, ami megállítja a szerkesztést és a mobil böngészőkben
// különösen zavaró. A meglévő #toast elem csak egyetlen sikerüzenetre
// (STL-export) volt használva.

import { create } from './dom.js'

const DEFAULT_DURATION = 4500

let region = null

function ensureRegion() {
  if (region && document.contains(region)) return region
  region = create('div', {
    class: 'toast-region',
    id: 'toast-region',
    role: 'status',
    'aria-live': 'polite',
  })
  document.body.append(region)
  return region
}

/**
 * @param {string} message
 * @param {{ type?: 'info' | 'success' | 'error', duration?: number }} options
 */
export function notify(message, { type = 'info', duration } = {}) {
  const host = ensureRegion()
  // Hibánál azonnal olvassa fel a képernyőolvasó, ne várjon a szünetre.
  host.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite')

  const toast = create('div', { class: `toast toast--${type}` }, [
    create('span', { class: 'toast__message', textContent: message }),
  ])

  const dismiss = () => {
    toast.classList.add('is-leaving')
    toast.addEventListener('transitionend', () => toast.remove(), { once: true })
    // Ha a mozgás ki van kapcsolva, a transitionend sosem jön.
    setTimeout(() => toast.remove(), 400)
  }

  toast.addEventListener('click', dismiss)
  host.append(toast)

  // A hibaüzenet maradjon kint tovább — jellemzően el kell olvasni.
  setTimeout(dismiss, duration ?? (type === 'error' ? DEFAULT_DURATION * 2 : DEFAULT_DURATION))

  return dismiss
}

export const notifyError = (message) => notify(message, { type: 'error' })
export const notifySuccess = (message) => notify(message, { type: 'success' })
