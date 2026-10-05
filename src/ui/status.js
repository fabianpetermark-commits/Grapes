const UX_STATES = new Set(['loading', 'saving', 'saved', 'success', 'error', 'empty', 'disabled'])

export function setUxState(target, state, message = '') {
  const node = typeof target === 'string' ? document.querySelector(target) : target
  if (!node) return null
  const normalized = UX_STATES.has(state) ? state : 'empty'
  node.classList.add('ux-status')
  node.dataset.uxState = normalized
  node.textContent = message
  node.setAttribute('aria-live', normalized === 'error' ? 'assertive' : 'polite')
  node.toggleAttribute('aria-busy', normalized === 'loading' || normalized === 'saving')
  return node
}

export function clearUxState(target) {
  const node = typeof target === 'string' ? document.querySelector(target) : target
  if (!node) return
  node.classList.remove('ux-status')
  delete node.dataset.uxState
  node.removeAttribute('aria-busy')
}
