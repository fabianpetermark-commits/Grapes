import './styles/index.css'
import { mobileIconSvg } from './android-mobile-icons.js'
import './styles/components/mobile-module-nav.css'
import { el } from './ui/dom.js'
import { showScreen } from './screens.js'
import {
  connectGrapesDrive,
  disconnectGrapesDrive,
  getGrapesAccount,
  isGrapesDriveConnected,
  listGrapesProjects,
  onGrapesDriveChange,
} from './storage/grapes-drive.js'
import { applyTranslations, getLanguage, onLanguageChange, setLanguage, t } from './i18n.js'
import { applyModuleAvailability, initDeveloperMenu } from './developer-menu.js'
import { isModuleEnabled } from './developer-settings.js'
import { isGrapesAndroidApp } from './android-bridge.js'

const params = new URLSearchParams(window.location.search)
const hasEbookPair = params.has('ebook-pair') || params.has('ebook-reader')
const requestedModule = params.get('module')
const moduleScreens = ['brochure', 'studio', 'qr', 'ebook', 'email', 'finance', 'billing', 'food']
const requestedScreen = moduleScreens.includes(requestedModule) ? requestedModule : null
const androidApp = isGrapesAndroidApp()
const androidModuleShell = params.get('android-shell') === '1'
const LOCAL_MODE_KEY = 'grapes-local-mode'

if (androidModuleShell) {
  document.documentElement.classList.add('is-grapes-android-module')
  document.querySelectorAll('#ebook-app .toolbar__brand-mark, #finance-app .toolbar__brand-mark').forEach((mark) => {
    mark.src = './grapes-mark.svg'
  })
}

const mobilePreviewButton = el('#pick-mobile-preview')
mobilePreviewButton.hidden = !androidApp
mobilePreviewButton.addEventListener('click', () => {
  window.location.href = new URL('./design/android-mobile-preview.html', window.location.href).href
})

function isLocalMode() {
  try { return localStorage.getItem(LOCAL_MODE_KEY) === '1' } catch { return false }
}

function setLocalMode(enabled) {
  try {
    if (enabled) localStorage.setItem(LOCAL_MODE_KEY, '1')
    else localStorage.removeItem(LOCAL_MODE_KEY)
  } catch {}
}

const projectModules = [
  { drive: 'Számla és árajánlat', screen: 'billing' },
  { drive: '2D Studio', screen: 'brochure' },
  { drive: '3D Studio', screen: 'studio' },
  { drive: 'QR & Barcode', screen: 'qr' },
  { drive: 'E-mail Stúdió', screen: 'email' },
  { drive: 'Pénzügyi Napló', screen: 'finance' },
  { drive: 'Ételnapló', screen: 'food' },
]

for (const [selector, screen] of Object.entries({
  '#pick-brochure': 'brochure', '#pick-studio': 'studio', '#pick-qr': 'qr',
  '#pick-email': 'email', '#pick-finance': 'finance', '#pick-food': 'food',
  '#pick-billing': 'billing',
})) el(selector).addEventListener('click', () => showScreen(screen))

el('#pick-ebook').addEventListener('click', () => {
  sessionStorage.setItem('grapes-ebook-view', 'library')
  showScreen('ebook')
})
el('#pick-ebook-organizer').addEventListener('click', () => {
  sessionStorage.setItem('grapes-ebook-view', 'organizer')
  showScreen('ebook')
})

function renderAccount() {
  const connected = isGrapesDriveConnected()
  const local = !connected && isLocalMode()
  const account = connected
    ? (getGrapesAccount() || { name: 'Google', email: '', photo: '' })
    : { name: t('account.local'), email: '', photo: '' }
  el('#grapes-account-name').textContent = account.name || 'Google'
  el('#grapes-account-email').textContent = account.email || ''
  el('#grapes-account-initial').textContent = (account.name || account.email || 'G').trim().charAt(0).toUpperCase()
  const photo = el('#grapes-account-photo')
  photo.hidden = !account.photo
  if (account.photo) photo.src = account.photo
  else photo.removeAttribute('src')
  photo.onerror = () => { photo.hidden = true }
  el('#grapes-drive-status').dataset.connected = connected ? 'true' : 'false'
  el('#grapes-drive-status').textContent = connected ? t('drive.connected') : t('drive.local')
  el('#grapes-sign-out').hidden = !connected && !local
  el('#grapes-sign-out').textContent = connected ? t('account.logout') : t('account.connect')
  el('#dashboard-subtitle').textContent = local ? t('dashboard.subtitle.local') : t('dashboard.subtitle')
  initDeveloperMenu(account)
  applyModuleAvailability()
}

function openProject(project) {
  const target = projectModules.find(item => item.drive === project.module)?.screen
  if (!target || !isModuleEnabled(target)) return
  sessionStorage.setItem('grapes-open-project', JSON.stringify({ module: project.module, source: 'Drive', id: project.id }))
  showScreen(target)
}

async function renderRecentProjects() {
  const list = el('#recent-projects-list')
  el('#recent-projects-source').textContent = isGrapesDriveConnected() ? t('recent.drive') : t('recent.local')
  list.innerHTML = `<p class="recent-projects__empty">${t('recent.loading')}</p>`
  if (!isGrapesDriveConnected()) {
    list.innerHTML = `<p class="recent-projects__empty">${t('recent.empty')}</p>`
    return
  }
  try {
    // Sorosan kérjük le a modulmappákat: teljesen új fióknál így a közös
    // Grapes gyökérmappa biztosan csak egyszer jön létre.
    const groups = []
    for (const { drive } of projectModules) {
      const moduleProjects = await listGrapesProjects(drive).catch(() => [])
      groups.push(moduleProjects.map(project => ({ ...project, module: drive })))
    }
    const projects = groups.flat().sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime)).slice(0, 6)
    list.replaceChildren()
    if (!projects.length) {
      const empty = document.createElement('p')
      empty.className = 'recent-projects__empty'
      empty.textContent = t('recent.empty')
      list.append(empty)
      return
    }
    const locale = getLanguage() === 'en' ? 'en-US' : 'hu-HU'
    for (const project of projects) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'recent-project'
      const moduleKey = projectModules.find(item => item.drive === project.module)?.screen
      if (moduleKey) {
        button.dataset.moduleKey = moduleKey
        button.disabled = !isModuleEnabled(moduleKey)
      }
      const title = document.createElement('strong')
      title.textContent = project.name?.replace(/\.grapes\.json$/, '') || t('recent.untitled')
      const meta = document.createElement('span')
      const date = project.modifiedTime ? new Date(project.modifiedTime).toLocaleString(locale) : ''
      meta.textContent = `${project.module} · ${date} · Drive`
      button.append(title, meta)
      button.addEventListener('click', () => openProject(project))
      list.append(button)
    }
    applyModuleAvailability(list)
  } catch (error) {
    console.warn('A legutóbbi projektek nem tölthetők be:', error)
    list.innerHTML = `<p class="recent-projects__empty">${t('recent.empty')}</p>`
  }
}

function showAuthenticatedStart() {
  renderAccount()
  renderRecentProjects()
  showScreen(requestedScreen || 'splash')
}

function showLogin(message = '') {
  el('#login-status').textContent = message
  showScreen('login')
}

el('#google-sign-in').addEventListener('click', async () => {
  const button = el('#google-sign-in')
  button.disabled = true
  el('#login-status').textContent = t('login.connecting')
  try {
    await connectGrapesDrive()
    setLocalMode(false)
    el('#login-status').textContent = ''
    showAuthenticatedStart()
  } catch (error) {
    showLogin(error.message || 'Google sign-in failed.')
  } finally {
    button.disabled = false
  }
})

el('#continue-local').addEventListener('click', () => {
  setLocalMode(true)
  el('#login-status').textContent = ''
  showAuthenticatedStart()
})

el('#grapes-sign-out').addEventListener('click', async () => {
  const button = el('#grapes-sign-out')
  button.disabled = true
  try {
    if (isGrapesDriveConnected()) await disconnectGrapesDrive({ forgetAccount: true })
    setLocalMode(false)
  } finally {
    button.disabled = false
    showLogin()
  }
})

for (const button of document.querySelectorAll('[data-language]')) {
  button.addEventListener('click', () => setLanguage(button.dataset.language))
}
applyTranslations()
onLanguageChange(() => {
  if (isGrapesDriveConnected() || isLocalMode()) {
    renderAccount()
    renderRecentProjects()
  }
})

onGrapesDriveChange((connected) => {
  if (connected) {
    setLocalMode(false)
    renderAccount()
  } else if (!hasEbookPair && !isLocalMode()) showLogin()
})

for (const selector of [
  '#app-back-to-menu-btn', '#studio-back-to-menu-btn', '#fabric-back-to-menu-btn',
  '#qr-back-to-menu-btn', '#ebook-back-to-menu-btn', '#email-back-to-menu-btn', '#finance-back-to-menu-btn',
]) {
  el(selector).addEventListener('click', goToMainMenu)
}

async function goToMainMenu() {
  if (androidApp || androidModuleShell) {
    await navigateMobile(params.get('return-page') || 'hub-utility')
    return
  }
  if (isGrapesDriveConnected() || isLocalMode()) {
    renderRecentProjects()
    showScreen('splash')
  } else showLogin()
}


async function navigateMobile(page) {
  if (document.body.dataset.screen === 'qr') {
    try { await (await import('./qr-studio.js')).flushQrProject() }
    catch { alert('A QR-projekt helyi mentése nem sikerült. A kilépést megszakítottuk.'); return }
  }
  const target = new URL('./design/android-mobile-preview.html', location.href)
  try { sessionStorage.setItem('grapes-mobile-return-page', page) } catch {}
  location.href = target.href
}
if (androidModuleShell && ['qr','ebook'].includes(requestedScreen)) {
  const nav = document.createElement('nav')
  nav.className = 'mobile-module-nav'
  nav.setAttribute('aria-label','Grapes főmodulok')
  for (const [page,label,icon] of [
    ['home','Kezdő','start'],['household','Home','household'],
    ['hub-health','Health','health'],['hub-utility','Tools','utility'],
    ['hub-finance','Finance','finance'],['more','Beállítások','settings'],
  ]) {
    const button = document.createElement('button')
    button.type = 'button'; button.setAttribute('aria-label',label)
    button.innerHTML = mobileIconSvg(icon)
    if (page === 'hub-utility') button.setAttribute('aria-current','page')
    button.addEventListener('click', () => navigateMobile(page))
    nav.append(button)
  }
  document.querySelector('#'+requestedScreen+'-app .toolbar').after(nav)
}
if (androidModuleShell) {
  // Native Android Back returns to the previous Grapes shell for every
  // standalone module, not only E-book and QR.
  window.grapesHandleAndroidBack = () => { goToMainMenu(); return true }
}

document.addEventListener('grapes:open-main-menu', goToMainMenu)

if (hasEbookPair) showScreen('ebook')
else if (isGrapesDriveConnected() || isLocalMode()) showAuthenticatedStart()
else showLogin()

