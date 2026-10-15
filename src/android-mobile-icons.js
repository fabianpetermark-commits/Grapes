const ICON_PATHS = {
  food: '<path d="M5 3v6a3 3 0 0 0 6 0V3M8 3v18M17 3v18M17 3c2.2 1.2 3.5 3.7 3.5 7H17"/>',
  finance: '<path d="M4 6.5h13.5A2.5 2.5 0 0 1 20 9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5A2.5 2.5 0 0 1 5.5 4H17M15 12h5M16.5 12h.01"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM15 14h2v2h-2zM19 14h1v3h-3v3h-3v-2M19 19h1v1h-1z"/>',
  ebook: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 4H11v16H7.5A3.5 3.5 0 0 0 4 21.5zM20 5.5A3.5 3.5 0 0 0 16.5 4H13v16h3.5a3.5 3.5 0 0 1 3.5 1.5z"/>',
  billing: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
  brochure: '<path d="M4 4h16v16H4zM4 9h16M10 9v11M7 7h.01M13 13l2-2 3 4"/>',
  studio: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4.5 7.8 12 12l7.5-4.2M12 12v9"/>',
  email: '<path d="M3 5h18v14H3zM4 6l8 7 8-7"/>',
  water: '<path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11zM9 15.2a3.2 3.2 0 0 0 3 2"/>',
  default: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
}

export function mobileIconSvg(name, className = 'mobile-icon') {
  const paths = ICON_PATHS[name] || ICON_PATHS.default
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`
}

export function hydrateMobileIcons(root = document) {
  root.querySelectorAll('[data-module-icon]').forEach(node => {
    node.innerHTML = mobileIconSvg(node.dataset.moduleIcon)
  })
}
