const ICON_PATHS = {
  outdoor: '<path d="M12 21V10M12 15C5 15 3 10 4 5c6-1 9 3 8 10zM12 12c0-6 4-9 9-9 1 6-2 10-9 9z"/>',
  start: '<path d="M3 11.5 12 4l9 7.5v9H3zM9 20.5v-7h6v7"/><path d="M12 7.3v3"/>',
  household: '<path d="M3 11.5 12 4l9 7.5v9H3zM9 20.5v-7h6v7"/>',
  utility: '<path d="M3.5 7h8v9h-8zM14 4h7v7h-7zM14 14h7v7h-7zM7.5 3v4M16 7h3M7.5 16v4"/>',
  sync: '<path d="M20 7a8 8 0 0 0-14-1L4 8M4 4v4h4M4 17a8 8 0 0 0 14 1l2-2M20 20v-4h-4"/>',
  projects: '<path d="M3 7h7l2 2h9v11H3zM3 7V5h7l2 2M7 13h10M7 16h7"/>',
  stats: '<path d="M4 20V4M4 20h16M8 16v-5M13 16V7M18 16v-9"/>',
  shopping: '<path d="M3 5h2l2 11h12l2-8H6M8 20h.01M18 20h.01M9 8h10"/>',
  food: '<path d="M5 3v6a3 3 0 0 0 6 0V3M8 3v18M17 3v18M17 3c2.2 1.2 3.5 3.7 3.5 7H17"/>',
  finance: '<path d="M4 6.5h13.5A2.5 2.5 0 0 1 20 9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5A2.5 2.5 0 0 1 5.5 4H17M15 12h5M16.5 12h.01"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM15 14h2v2h-2zM19 14h1v3h-3v3h-3v-2M19 19h1v1h-1z"/>',
  ebook: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 4H11v16H7.5A3.5 3.5 0 0 0 4 21.5zM20 5.5A3.5 3.5 0 0 0 16.5 4H13v16h3.5a3.5 3.5 0 0 1 3.5 1.5z"/>',
  billing: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
  brochure: '<path d="M4 4h16v16H4zM4 9h16M10 9v11M7 7h.01M13 13l2-2 3 4"/>',
  studio: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4.5 7.8 12 12l7.5-4.2M12 12v9"/>',
  email: '<path d="M3 5h18v14H3zM4 6l8 7 8-7"/>',
  water: '<path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11zM9 15.2a3.2 3.2 0 0 0 3 2"/>',
  breakfast: '<path d="M4 10h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6zM16 11h2a2 2 0 0 1 0 4h-2M7 3c-1 1-.2 2 0 3M11 3c-1 1-.2 2 0 3"/>',
  morningSnack: '<path d="M12 7c-1.8-2.2-5.5-1.7-7 1.1-2 3.9 1.1 10.9 4.4 11.5 1 .2 1.6-.5 2.6-.5s1.6.7 2.6.5C17.9 19 21 12 19 8.1 17.5 5.3 13.8 4.8 12 7zM12 7c0-2 1.1-3.5 3-4M12 5C10.5 3.7 9 3.5 7.5 4"/>',
  lunch: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  afternoonSnack: '<path d="M6 8h12l-1 11H7zM9 8c0-2 1.3-4 3-4s3 2 3 4M9 12h6"/>',
  dinner: '<path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5zM16.5 5.5h.01M19 9h.01"/>',
  recipe: '<path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h3"/>',
  drive: '<path d="M8.5 4h7l5 8.7-3.5 6.1H7l-3.5-6.1zM8.5 4l5 8.7M15.5 4l-5 8.7M3.5 12.7h10"/>',
  backup: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  health: '<path d="M20.8 9.2c0 5-8.8 10.3-8.8 10.3S3.2 14.2 3.2 9.2A4.7 4.7 0 0 1 12 6.8a4.7 4.7 0 0 1 8.8 2.4zM7.5 12h2l1.2-2.5 2.2 5 1.2-2.5h2.4"/>',
  samsung: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M9 6h6M10 15l1.4-3 1.8 4 1-2H16M11 18.5h2"/>',
  yazio: '<path d="M5 4h14v16H5zM8 8h8M8 12h5M12 16v-3M9.5 15.5 12 18l2.5-2.5"/>',
  google: '<circle cx="12" cy="12" r="9"/><path d="M20.5 12H12v3.5h4.8A6 6 0 1 1 17 8"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21v-2.5a7.5 7.5 0 0 1 15 0V21"/>',
  language: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  appearance: '<path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  default: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
}

export function mobileIconSvg(name, className = 'mobile-icon') {
  const paths = ICON_PATHS[name] || ICON_PATHS.default
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`
}

export function hydrateMobileIcons(root = document) {
  root.querySelectorAll('[data-module-icon], [data-mobile-icon]').forEach(node => {
    node.innerHTML = mobileIconSvg(node.dataset.moduleIcon || node.dataset.mobileIcon)
  })
}
