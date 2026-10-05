export function createResponsiveOverflow({ toolbar, items, label = 'További műveletek', breakpoint = 720 }) {
  if (!toolbar || !items?.length || toolbar.querySelector('[data-responsive-overflow]')) return null
  const details = document.createElement('details')
  details.className = 'responsive-overflow'
  details.dataset.responsiveOverflow = ''
  const summary = document.createElement('summary')
  summary.className = 'btn btn--ghost'
  summary.textContent = label
  summary.setAttribute('aria-label', label)
  const panel = document.createElement('div')
  panel.className = 'responsive-overflow__panel'
  details.append(summary, panel)
  const records = items.map((node) => {
    const marker = document.createComment('responsive-overflow-position')
    node.before(marker)
    return { node, marker }
  })
  toolbar.append(details)
  const media = window.matchMedia(`(max-width: ${breakpoint}px)`)
  const sync = () => {
    if (media.matches) records.forEach(({ node }) => panel.append(node))
    else {
      details.open = false
      records.forEach(({ node, marker }) => marker.parentNode?.insertBefore(node, marker.nextSibling))
    }
  }
  media.addEventListener?.('change', sync)
  sync()
  document.addEventListener('click', (event) => {
    if (details.open && !details.contains(event.target)) details.open = false
  })
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') details.open = false })
  return details
}
