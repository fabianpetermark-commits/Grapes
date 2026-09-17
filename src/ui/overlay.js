// Közös viselkedés minden átfedő rétegnek (modal, mobil fiók): Escape-re
// zárás, fókuszcsapda, a megnyitó elem fókuszának visszaállítása, és a
// háttér görgetésének zárolása. Eddig ezek közül egyik sem létezett — a
// modalt csak az ✕ vagy a backdrop zárta, a Tab pedig kisétált mögé.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'details > summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

let openCount = 0

function focusableWithin(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(
    (node) => node.offsetParent !== null || node === document.activeElement,
  )
}

function lockScroll() {
  openCount += 1
  document.body.style.overflow = 'hidden'
}

function unlockScroll() {
  openCount = Math.max(0, openCount - 1)
  if (openCount === 0) {
    document.body.style.overflow = ''
  }
}

/**
 * Aktiválja a réteg viselkedését. A visszaadott függvény bontja le.
 *
 * @param {HTMLElement} container a fókuszcsapda határa
 * @param {{ onRequestClose: () => void, initialFocus?: HTMLElement }} options
 * @returns {() => void} lebontó
 */
export function trapFocus(container, { onRequestClose, initialFocus } = {}) {
  const previouslyFocused = document.activeElement

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onRequestClose?.()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = focusableWithin(container)
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable.at(-1)

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  document.addEventListener('keydown', onKeyDown, true)
  lockScroll()

  const target = initialFocus ?? focusableWithin(container)[0] ?? container
  // A container csak akkor fókuszálható, ha kap tabindexet — dialógusnál ez
  // a helyes viselkedés, ha nincs benne semmilyen vezérlő.
  if (target === container && !container.hasAttribute('tabindex')) {
    container.setAttribute('tabindex', '-1')
  }
  target.focus?.()

  return function release() {
    document.removeEventListener('keydown', onKeyDown, true)
    unlockScroll()
    if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
      previouslyFocused.focus()
    }
  }
}
