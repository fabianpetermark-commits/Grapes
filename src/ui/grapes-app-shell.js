import { create } from './dom.js'
import './grapes-app-shell.css'

const DEFAULT_NAV = [
  { id: 'library', label: 'Könyvtár', icon: '▤' },
  { id: 'share', label: 'Megosztás', icon: '↗' },
  { id: 'reader', label: 'Olvasó', icon: '▣' },
  { id: 'tools', label: 'Eszközök', icon: '⚙' },
]

/**
 * Mounts the shared Grapes application frame.
 * Nested routes must carry their parent mainRoute so the bottom navigation
 * remains active while a detail/editor subpage is displayed.
 */
export function createGrapesAppShell({
  appName,
  logoUrl = './grapes-logo.svg',
  navItems = DEFAULT_NAV,
  initialRoute = { mainRoute: navItems[0]?.id || 'home', page: 'root' },
  onLogin = () => {},
  onNavigate = () => {},
  mount = document.body,
  manageHistory = true,
} = {}) {
  if (!appName?.trim()) throw new TypeError('A Grapes app shell requires an appName.')
  if (!Array.isArray(navItems) || navItems.length !== 4) {
    throw new TypeError('The Grapes mobile shell requires exactly four main navigation items.')
  }

  const header = create('header', { class: 'grapes-app-header' })
  const brand = create('div', { class: 'grapes-brand' }, [
    create('img', { class: 'grapes-brand__logo', src: logoUrl, alt: '' }),
    create('span', { class: 'grapes-brand__names' }, [
      create('span', { class: 'grapes-brand__wordmark', textContent: 'Grapes' }),
      create('span', { class: 'grapes-brand__app-name', textContent: appName }),
    ]),
  ])
  const login = create('button', {
    class: 'grapes-login',
    type: 'button',
    textContent: 'Bejelentkezés',
    dataset: { action: 'login' },
  })
  login.addEventListener('click', onLogin)
  header.append(brand, login)

  const nav = create('nav', { class: 'grapes-bottom-nav', ariaLabel: 'Fő navigáció' })
  const buttons = new Map()
  for (const item of navItems) {
    const button = create('button', {
      type: 'button',
      dataset: { route: item.id },
      ariaLabel: item.label,
    }, [
      create('span', { class: 'grapes-bottom-nav__icon', ariaHidden: 'true', textContent: item.icon || item.glyph || '•' }),
      create('span', { class: 'grapes-bottom-nav__label', textContent: item.label }),
    ])
    button.addEventListener('click', () => navigate({ mainRoute: item.id, page: 'root' }))
    nav.append(button)
    buttons.set(item.id, button)
  }

  const frame = create('div', { class: 'grapes-app-shell' }, [header, nav])
  mount.append(frame)

  let currentRoute = { ...initialRoute }
  const renderRoute = (route) => {
    currentRoute = route
    for (const [id, button] of buttons) {
      if (id === route.mainRoute) button.setAttribute('aria-current', 'page')
      else button.removeAttribute('aria-current')
    }
    onNavigate(route)
  }
  const navigate = (route) => {
    const next = { ...route }
    if (manageHistory) window.history.pushState({ ...(window.history.state || {}), grapesAppRoute: next }, '')
    renderRoute(next)
  }
  const handlePopState = (event) => {
    const route = event.state?.grapesAppRoute || { mainRoute: navItems[0].id, page: 'root' }
    renderRoute(route)
  }

  if (manageHistory) {
    if (!window.history.state?.grapesAppRoute) {
      window.history.replaceState({ ...(window.history.state || {}), grapesAppRoute: currentRoute }, '')
    }
    window.addEventListener('popstate', handlePopState)
  }
  renderRoute(currentRoute)

  return {
    element: frame,
    navigate,
    getRoute: () => ({ ...currentRoute }),
    setLoginState({ signedIn = false, label } = {}) {
      login.textContent = label || (signedIn ? 'Bejelentkezve' : 'Bejelentkezés')
      login.disabled = signedIn
    },
    destroy() {
      if (manageHistory) window.removeEventListener('popstate', handlePopState)
      frame.remove()
    },
  }
}
