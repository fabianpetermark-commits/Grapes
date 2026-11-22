import { createGrapesAppShell } from '../ui/grapes-app-shell.js'
import { isGrapesDriveConnected, onGrapesDriveChange } from './platform.js'

const NAV_ITEMS = [
  { id: 'library', label: 'Könyvtár', icon: '▤' },
  { id: 'share', label: 'Megosztás', icon: '↗' },
  { id: 'reader', label: 'Olvasó', icon: '▣' },
  { id: 'tools', label: 'Eszközök', icon: '⚙' },
]

/**
 * Adapts the existing standalone E-book DOM to the shared Grapes shell.
 * Feature nodes are moved, never cloned, so their IDs and event listeners stay intact.
 */
export function mountEbookStandaloneShell({ root = document.querySelector('#ebook-app'), navigateToLibrary = async () => false } = {}) {
  if (!root) throw new Error('Az E-book alkalmazás gyökéreleme nem található.')
  if (root.dataset.grapesShellMounted === 'true') return root._grapesEbookShell || null

  const manager = root.querySelector('#ebook-manager-view')
  const toolbar = root.querySelector('#ebook-toolbar')
  const hero = manager?.querySelector('.ebook-library__hero')
  const status = manager?.querySelector('#ebook-status')
  const quickAdd = manager?.querySelector('.ebook-library__quick-add')
  const grid = manager?.querySelector('.ebook-library__grid')
  const libraryPanel = grid?.querySelector(':scope > section[aria-labelledby="ebook-list-title"]')
  const readerPanel = manager?.querySelector('#ebook-reader-aside')
  const metadataPanel = manager?.querySelector('#ebook-metadata-panel')
  const receiverPanel = manager?.querySelector('#ebook-receiver-panel')
  const transferPanel = manager?.querySelector('#ebook-transfer-panel')

  if (!manager || !hero || !quickAdd || !libraryPanel || !readerPanel || !metadataPanel || !receiverPanel) {
    throw new Error('Az E-Library DOM-szerződése hiányos; a közös navigáció nem indítható el.')
  }

  toolbar?.setAttribute('hidden', '')
  toolbar?.setAttribute('aria-hidden', 'true')

  const viewHost = document.createElement('div')
  viewHost.className = 'ebook-shell-views'
  viewHost.dataset.ebookShellViews = ''
  const views = new Map()
  for (const item of NAV_ITEMS) {
    const view = document.createElement('section')
    view.className = 'ebook-shell-view'
    view.dataset.ebookRoute = item.id
    view.hidden = true
    view.setAttribute('aria-label', item.label)
    views.set(item.id, view)
    viewHost.append(view)
  }
  manager.prepend(viewHost)

  const headings = {
    library: ['Saját könyvtár', 'Könyvtár'],
    share: ['Könyvek megosztása', 'Válaszd ki a könyvet, amelyet QR-kóddal vagy átvételi kóddal szeretnél továbbítani.'],
    reader: ['Olvasó és átvétel', 'Könyvek átvétele párosítási kóddal, illetve támogatott asztali böngészőben USB-s szinkronizálás.'],
    tools: ['Eszközök', 'Feltöltés, Google Drive-kapcsolat és könyvtárkezelési műveletek.'],
  }
  const routeIntro = document.createElement('div')
  routeIntro.className = 'ebook-shell-route-intro'
  const routeTitle = document.createElement('h1')
  const routeDescription = document.createElement('p')
  routeIntro.append(routeTitle, routeDescription)

  const place = (node, route) => { if (node) views.get(route).append(node) }
  place(hero, 'tools')
  place(status, 'tools')
  place(quickAdd, 'tools')
  place(libraryPanel, 'library')
  place(metadataPanel, 'library')
  place(receiverPanel, 'reader')
  place(readerPanel, 'reader')

  const originalGrid = grid
  originalGrid?.remove()

  let shell
  let activeRoute = 'library'
  let routeRequest = 0

  const renderRoute = async (route) => {
    const request = ++routeRequest
    const nextRoute = NAV_ITEMS.some(item => item.id === route.mainRoute) ? route.mainRoute : 'library'
    const mode = manager.dataset.ebookMode
    if (mode === 'organizer' && nextRoute !== 'library') {
      const canLeave = await navigateToLibrary()
      if (request !== routeRequest) return
      if (!canLeave) {
        shell?.navigate({ mainRoute: 'library', page: 'root' })
        return
      }
    }

    activeRoute = nextRoute
    if (nextRoute === 'library') views.get('library').append(libraryPanel, metadataPanel)
    if (nextRoute === 'share') views.get('share').append(routeIntro, libraryPanel)
    for (const [id, view] of views) view.hidden = id !== nextRoute
    if (nextRoute === 'share') {
      const heading = headings.share
      routeTitle.textContent = heading[0]
      routeDescription.textContent = heading[1]
    }
    if (nextRoute === 'reader') {
      const isAndroid = root.classList.contains('ebook-library--android')
      const sync = readerPanel.querySelector('.ebook-library__reader-sync')
      if (sync) sync.hidden = isAndroid
      const support = readerPanel.querySelector('#ebook-reader-support')
      if (support && isAndroid) {
        support.hidden = false
        support.textContent = 'Az USB-s könyvtárszinkron Android WebView alatt nem támogatott. Használd a párosítási kódos átvételt.'
      }
    }
    if (nextRoute === 'library') {
      const editor = manager.dataset.ebookMode === 'organizer'
      if (!editor) views.get('library').prepend(libraryPanel)
    }
    if (nextRoute === 'tools') views.get('tools').prepend(hero, status, quickAdd)
  }

  shell = createGrapesAppShell({
    appName: 'E-Library',
    navItems: NAV_ITEMS,
    initialRoute: { mainRoute: 'library', page: 'root' },
    mount: root,
    manageHistory: false,
    onLogin: () => root.querySelector('#ebook-drive-connect')?.click(),
    onNavigate: renderRoute,
  })
  root.prepend(shell.element)
  root.dataset.grapesShellMounted = 'true'
  shell.setLoginState({ signedIn: isGrapesDriveConnected(), label: isGrapesDriveConnected() ? 'Drive csatlakoztatva' : 'Bejelentkezés' })
  const unsubscribe = onGrapesDriveChange((connected) => {
    shell.setLoginState({ signedIn: connected, label: connected ? 'Drive csatlakoztatva' : 'Bejelentkezés' })
  })

  const originalDestroy = shell.destroy.bind(shell)
  shell.destroy = () => {
    unsubscribe()
    delete root.dataset.grapesShellMounted
    delete root._grapesEbookShell
    originalDestroy()
  }
  root._grapesEbookShell = shell
  return shell
}
