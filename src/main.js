import './styles/index.css'
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
  const account = getGrapesAccount() || (androidApp
    ? { name: 'Helyi Grapes', email: 'Android alkalmazás', photo: '' }
    : { name: 'Google', email: '', photo: '' })
  el('#grapes-account-name').textContent = account.name || 'Google'
  el('#grapes-account-email').textContent = account.email || ''
  el('#grapes-account-initial').textContent = (account.name || account.email || 'G').trim().charAt(0).toUpperCase()
  const photo = el('#grapes-account-photo')
  photo.hidden = !account.photo
  if (account.photo) photo.src = account.photo
  else photo.removeAttribute('src')
  photo.onerror = () => { photo.hidden = true }
  el('#grapes-drive-status').dataset.connected = isGrapesDriveConnected() ? 'true' : 'false'
  if (androidApp && !isGrapesDriveConnected()) el('#grapes-drive-status').textContent = 'Helyi mód'
  el('#grapes-sign-out').hidden = androidApp && !isGrapesDriveConnected()
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
  el('#recent-projects-source').textContent = t('recent.drive')
  list.innerHTML = `<p class="recent-projects__empty">${t('recent.loading')}</p>`
  if (!isGrapesDriveConnected()) {
    list.innerHTML = androidApp
      ? '<p class="recent-projects__empty">A helyi projektjeid az egyes modulokban érhetők el.</p>'
      : `<p class="recent-projects__empty">${t('recent.empty')}</p>`
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
    el('#login-status').textContent = ''
    showAuthenticatedStart()
  } catch (error) {
    showLogin(error.message || 'Google sign-in failed.')
  } finally {
    button.disabled = false
  }
})

el('#grapes-sign-out').addEventListener('click', async () => {
  const button = el('#grapes-sign-out')
  button.disabled = true
  try { await disconnectGrapesDrive({ forgetAccount: true }) } finally {
    button.disabled = false
    showLogin()
  }
})

for (const button of document.querySelectorAll('[data-language]')) {
  button.addEventListener('click', () => setLanguage(button.dataset.language))
}
applyTranslations()
onLanguageChange(() => {
  if (isGrapesDriveConnected()) renderRecentProjects()
})

onGrapesDriveChange((connected) => {
  if (connected) renderAccount()
  else if (!hasEbookPair && !androidApp) showLogin()
  else if (androidApp) showAuthenticatedStart()
})

for (const selector of [
  '#app-back-to-menu-btn', '#studio-back-to-menu-btn', '#fabric-back-to-menu-btn',
  '#qr-back-to-menu-btn', '#ebook-back-to-menu-btn', '#email-back-to-menu-btn', '#finance-back-to-menu-btn',
]) {
  el(selector).addEventListener('click', goToMainMenu)
}

function goToMainMenu() {
  if (isGrapesDriveConnected() || androidApp) {
    renderRecentProjects()
    showScreen('splash')
  } else showLogin()
}

document.addEventListener('grapes:open-main-menu', goToMainMenu)

if (hasEbookPair) showScreen('ebook')
else if (isGrapesDriveConnected()) showAuthenticatedStart()
else if (androidApp) showAuthenticatedStart()
else showLogin()
