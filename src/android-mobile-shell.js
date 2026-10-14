import {
  connectGrapesDrive,
  disconnectGrapesDrive,
  getGrapesAccount,
  isGrapesDriveConnected,
  listGrapesProjects,
  onGrapesDriveChange,
} from './storage/grapes-drive.js'
import { listLocalProjects } from './storage/local-project-store.js'

const $ = selector => document.querySelector(selector)
const $$ = selector => [...document.querySelectorAll(selector)]
const login = $('#login')
const app = $('#app')
const title = $('#app-title')
const subtitle = $('#app-subtitle')
const fab = $('[data-fab]')
const toast = $('.toast')
const sheet = $('.bottom-sheet')
const sheetBackdrop = $('.sheet-backdrop')
const LOCAL_MODE_KEY = 'grapes-local-mode'
const WATER_STORE_KEY = 'grapes-water-v1'
const SYNC_CHECK_KEY = 'grapes-sync-last-check-v1'
const moduleFolders = [
  ['Ételnapló', 'food', '◉'],
  ['Pénzügyi Napló', 'finance', '⌁'],
  ['QR & Barcode', 'qr', '▦'],
  ['Számla és árajánlat', 'billing', '▤'],
  ['2D Studio', 'brochure', '◆'],
  ['3D Studio', 'studio', '⬡'],
  ['E-mail Stúdió', 'email', '✉'],
]
const labels = {
  home: ['Grapes', 'Mobil munkaterület'], projects: ['Projektek', 'Helyi és Drive'],
  sync: ['Szinkron', 'Adatok és fiók'], more: ['Továbbiak', 'Beállítások'],
  food: ['Ételnapló', 'Mai áttekintés'], water: ['Víz', 'Napi folyadékbevitel'],
  ebook: ['E-book', 'Könyvtár'], reader: ['A csend térképe', 'Olvasó'],
  transfer: ['E-book átvitel', 'Olvasóeszköz'],
}

function localMode() {
  try { return localStorage.getItem(LOCAL_MODE_KEY) === '1' } catch { return false }
}

function setLocalMode(enabled) {
  try { enabled ? localStorage.setItem(LOCAL_MODE_KEY, '1') : localStorage.removeItem(LOCAL_MODE_KEY) } catch {}
}

function showToast(message) {
  toast.textContent = message
  toast.classList.add('is-visible')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2400)
}

function closeSheet() {
  sheet.classList.remove('is-open')
  sheetBackdrop.classList.remove('is-open')
}

function showPage(page) {
  toast.classList.remove('is-visible')
  $$('[data-page]').forEach(node => { node.hidden = node.dataset.page !== page })
  $$('[data-nav]').forEach(node => node.classList.toggle('is-active', node.dataset.nav === page))
  ;[title.textContent, subtitle.textContent] = labels[page] || labels.home
  fab.hidden = page !== 'food'
  closeSheet()
  if (page === 'projects') renderProjects()
  if (page === 'sync') renderSync()
  if (page === 'water') renderWater()
}

function openModule(module, project = null) {
  if (project) {
    try { sessionStorage.setItem('grapes-open-project', JSON.stringify({ module: project.folder, source: 'Drive', id: project.id })) } catch {}
  }
  const target = new URL('../index.html', window.location.href)
  target.searchParams.set('module', module)
  target.searchParams.set('android-shell', '1')
  window.location.href = target.href
}

function renderAccount() {
  const connected = isGrapesDriveConnected()
  const account = getGrapesAccount()
  $('[data-account-title]').textContent = connected ? (account?.name || 'Google Drive') : 'Helyi mód'
  $('[data-account-detail]').textContent = connected ? (account?.email || 'Drive csatlakoztatva') : 'A Drive később csatlakoztatható'
  $('[data-account-mode]').textContent = connected ? (account?.email || 'Drive csatlakoztatva') : 'Helyi mód'
  $('[data-sync-title]').textContent = connected ? 'Google Drive csatlakoztatva' : 'Jelenleg helyi mód'
  $('[data-sync-detail]').textContent = connected
    ? 'A projektjeid menthetők és megnyithatók a saját Google Drive-odból.'
    : 'Az app internet nélkül is használható. A Drive csatlakoztatása után választhatsz, mit töltesz fel.'
  $('[data-connect-drive]').textContent = connected ? 'Drive leválasztása' : 'Google Drive csatlakoztatása'
  $('[data-account-action]').textContent = connected ? 'Kijelentkezés a Google-fiókból' : 'Google-fiók csatlakoztatása'
  const badge = $('[data-sync-badge]')
  if (badge) {
    badge.textContent = connected ? 'Drive aktív' : 'Csak ezen az eszközön'
    badge.dataset.state = connected ? 'connected' : 'local'
  }
}

function showLogin(message = '') {
  app.hidden = true
  login.hidden = false
  const status = $('[data-login-status]')
  if (status) status.textContent = message
  closeSheet()
}

async function openAccountLogin() {
  if (!isGrapesDriveConnected()) {
    setLocalMode(false)
    showLogin()
    return
  }
  const button = $('[data-account-login]')
  button.disabled = true
  try {
    await disconnectGrapesDrive({ forgetAccount: true })
    setLocalMode(false)
    showLogin()
  } catch (error) {
    showToast(error?.message || 'A kijelentkezés nem sikerült.')
  } finally { button.disabled = false }
}

function formatStorage(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${new Intl.NumberFormat('hu-HU', { maximumFractionDigits: index > 1 ? 1 : 0 }).format(bytes / 1024 ** index)} ${units[index]}`
}

function formatSyncTime(value) {
  if (!value) return 'Még nem ellenőrizve'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Még nem ellenőrizve'
  return date.toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function driveProjectCount() {
  if (!isGrapesDriveConnected()) return 0
  const groups = await Promise.all(moduleFolders.map(([folder]) => listGrapesProjects(folder).catch(() => [])))
  return groups.reduce((sum, projects) => sum + projects.length, 0)
}

async function renderSync({ refreshed = false } = {}) {
  const status = $('[data-sync-status]')
  if (!status) return
  status.textContent = 'Állapot ellenőrzése…'
  status.dataset.state = 'working'
  try {
    const [projects, estimate, driveCount] = await Promise.all([
      listLocalProjects(1000).catch(() => []),
      navigator.storage?.estimate ? navigator.storage.estimate().catch(() => null) : Promise.resolve(null),
      driveProjectCount(),
    ])
    const dirtyCount = projects.filter(project => project?.data?.syncState?.localDirty).length
    const localBytes = estimate?.usage || new Blob(projects.map(project => JSON.stringify(project))).size
    const now = refreshed ? new Date().toISOString() : localStorage.getItem(SYNC_CHECK_KEY)
    if (refreshed) localStorage.setItem(SYNC_CHECK_KEY, now)
    $('[data-sync-local-count]').textContent = `${projects.length} projekt`
    $('[data-sync-local-size]').textContent = formatStorage(localBytes)
    $('[data-sync-drive-count]').textContent = isGrapesDriveConnected() ? `${driveCount} projekt` : 'Nincs csatlakoztatva'
    $('[data-sync-pending-count]').textContent = dirtyCount ? `${dirtyCount} mentés várakozik` : 'Minden helyi adat mentve'
    $('[data-sync-last-check]').textContent = formatSyncTime(now)
    status.textContent = isGrapesDriveConnected()
      ? (dirtyCount ? 'Van helyben módosított projekt.' : 'A Drive-kapcsolat elérhető.')
      : 'A helyi mentések internet nélkül is használhatók.'
    status.dataset.state = dirtyCount ? 'pending' : 'ready'
  } catch (error) {
    status.textContent = `Az állapot most nem ellenőrizhető. ${error?.message || ''}`
    status.dataset.state = 'error'
  }
}

function showApp() {
  login.hidden = true
  app.hidden = false
  renderAccount()
  showPage('home')
  renderProjects()
}

async function connectDrive() {
  const status = $('[data-login-status]')
  if (isGrapesDriveConnected()) {
    await disconnectGrapesDrive({ forgetAccount: false })
    setLocalMode(true)
    renderAccount()
    renderSync({ refreshed: true })
    showToast('A Drive leválasztva. A helyi adatok megmaradtak.')
    return
  }
  status.textContent = 'Google-fiók megnyitása…'
  try {
    await connectGrapesDrive()
    setLocalMode(false)
    status.textContent = ''
    showApp()
    showToast('Google Drive csatlakoztatva.')
    renderSync({ refreshed: true })
  } catch (error) {
    status.textContent = error?.message || 'A Google-bejelentkezés nem sikerült.'
    if (!login.hidden) return
    showToast(status.textContent)
  }
}

function projectRow(project) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'project-row project-row--button'
  button.dataset.projectName = `${project.name} ${project.folder}`.toLocaleLowerCase('hu-HU')
  const icon = document.createElement('span')
  icon.className = 'project-row__icon'
  icon.textContent = project.icon || '◆'
  const copy = document.createElement('span')
  const strong = document.createElement('strong')
  strong.textContent = String(project.name || 'Névtelen projekt').replace(/\.grapes\.json$/i, '')
  const meta = document.createElement('span')
  const when = project.modifiedTime ? new Date(project.modifiedTime).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'helyi'
  meta.textContent = `${project.folder} · ${when}`
  copy.append(strong, meta)
  const arrow = document.createElement('span')
  arrow.textContent = '›'
  button.append(icon, copy, arrow)
  button.addEventListener('click', () => openModule(project.module, project.id ? project : null))
  return button
}

async function collectProjects() {
  const local = [
    { name: 'Mai étkezések', folder: 'Ételnapló', module: 'food', icon: '◉' },
    { name: 'Víznapló', folder: 'Egészség', module: 'food', icon: '◇', water: true },
    { name: 'E-book könyvtár', folder: 'E-book', module: 'ebook', icon: '▤' },
  ]
  if (!isGrapesDriveConnected()) return local
  const groups = await Promise.all(moduleFolders.map(async ([folder, module, icon]) => {
    const projects = await listGrapesProjects(folder).catch(() => [])
    return projects.map(project => ({ ...project, folder, module, icon }))
  }))
  return [...groups.flat().sort((a, b) => new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0)), ...local]
}

async function renderProjects() {
  const list = $('[data-project-list]')
  const recent = $('[data-recent-projects]')
  if (!list || !recent) return
  list.innerHTML = '<div class="empty-state">Projektek betöltése…</div>'
  try {
    const projects = await collectProjects()
    list.replaceChildren(...projects.map(projectRow))
    recent.replaceChildren(...projects.slice(0, 2).map(project => {
      const button = document.createElement('button')
      button.type = 'button'; button.className = 'project-card'
      const icon = document.createElement('span'); icon.className = 'project-card__icon'; icon.textContent = project.icon
      const strong = document.createElement('strong'); strong.textContent = String(project.name).replace(/\.grapes\.json$/i, '')
      const meta = document.createElement('span'); meta.textContent = project.folder
      button.append(icon, strong, meta)
      button.addEventListener('click', () => project.water ? showPage('water') : openModule(project.module, project.id ? project : null))
      return button
    }))
  } catch (error) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = `A projektlista most nem tölthető be. ${error?.message || ''}`
    list.replaceChildren(empty)
  }
}

function dateKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function loadWaterStore() {
  try {
    const value = JSON.parse(localStorage.getItem(WATER_STORE_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch { return {} }
}

function currentWaterDay() {
  const store = loadWaterStore()
  const key = dateKey()
  const saved = store[key]
  return { store, key, day: { goal: Math.max(500, Number(saved?.goal) || 2000), entries: Array.isArray(saved?.entries) ? saved.entries : [] } }
}

function saveWaterDay(day) {
  const { store, key } = currentWaterDay()
  store[key] = day
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60)
  for (const savedKey of Object.keys(store)) if (savedKey < dateKey(cutoff)) delete store[savedKey]
  localStorage.setItem(WATER_STORE_KEY, JSON.stringify(store))
}

function formatWater(amount) {
  return `${new Intl.NumberFormat('hu-HU').format(amount)} ml`
}

function renderWater() {
  const { day } = currentWaterDay()
  const total = day.entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0)
  const percent = Math.min(100, total / day.goal * 100)
  $('[data-water-date]').textContent = `${new Date().toLocaleDateString('hu-HU', { month: 'long', day: 'numeric', weekday: 'long' })} · napi cél ${(day.goal / 1000).toLocaleString('hu-HU')} liter`
  $('[data-water-total]').textContent = formatWater(total)
  $('[data-water-goal-label]').textContent = `${formatWater(day.goal)} cél`
  $('[data-water-ring]').style.setProperty('--water-progress', `${percent}%`)
  $('[data-water-today-bar]').style.height = `${percent}%`
  $('[data-water-summary]').textContent = `${Math.round(total / 250)} pohár · ${(total / 1000).toLocaleString('hu-HU', { maximumFractionDigits: 2 })} l`
  const remaining = Math.max(0, day.goal - total)
  $('[data-water-message]').textContent = remaining ? (remaining <= 500 ? 'Már csak egy kicsi!' : 'Jó úton haladsz') : 'Megvan a napi cél!'
  $('[data-water-remaining]').textContent = remaining ? `Még ${formatWater(remaining)} hiányzik a napi célhoz.` : 'Szép munka — a mai cél teljesítve.'
  $('[data-action="water-goal"]').textContent = `Cél: ${(day.goal / 1000).toLocaleString('hu-HU')} l`
  const log = $('[data-water-log]')
  log.replaceChildren()
  if (!day.entries.length) {
    log.innerHTML = '<div class="empty-state">Ma még nincs bejegyzés. Adj hozzá egy pohár vizet!</div>'
    return
  }
  for (const entry of [...day.entries].reverse()) {
    const row = document.createElement('button')
    row.type = 'button'; row.className = 'water-log project-row--button'
    row.title = 'Koppints a bejegyzés törléséhez'
    row.innerHTML = `<span class="water-log__icon">◇</span><span><strong>Víz</strong><span>${new Date(entry.at).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })} · mentve</span></span><b>${formatWater(entry.amount)}</b>`
    row.addEventListener('click', () => {
      const next = currentWaterDay().day
      next.entries = next.entries.filter(item => item.id !== entry.id)
      saveWaterDay(next); renderWater(); showToast('A vízbejegyzés törölve.')
    })
    log.append(row)
  }
}

function addWater(amount) {
  const { day } = currentWaterDay()
  day.entries.push({ id: crypto.randomUUID(), amount, at: new Date().toISOString() })
  saveWaterDay(day)
  renderWater()
  showToast(`${formatWater(amount)} víz hozzáadva és mentve.`)
}

function changeWaterGoal() {
  const { day } = currentWaterDay()
  const entered = window.prompt('Napi vízcél milliliterben:', String(day.goal))
  if (entered === null) return
  const goal = Number(entered.replace(/\s/g, ''))
  if (!Number.isFinite(goal) || goal < 500 || goal > 10000) return showToast('A cél 500 és 10 000 ml között lehet.')
  day.goal = Math.round(goal / 50) * 50
  saveWaterDay(day); renderWater(); showToast('A napi vízcél mentve.')
}

$('[data-local]').addEventListener('click', () => { setLocalMode(true); showApp() })
$('[data-login]').addEventListener('click', connectDrive)
$('[data-connect-drive]').addEventListener('click', connectDrive)
$('[data-account-login]').addEventListener('click', openAccountLogin)
$('[data-sync-refresh]').addEventListener('click', () => renderSync({ refreshed: true }))
$('[data-sync-projects]').addEventListener('click', () => showPage('projects'))
$$('[data-nav]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.nav)))
$$('[data-module]').forEach(button => button.addEventListener('click', () => {
  const module = button.dataset.module
  if (module === 'food' || module === 'ebook') showPage(module)
  else openModule(module)
}))
$$('[data-open-module]').forEach(button => button.addEventListener('click', () => openModule(button.dataset.openModule)))
$$('[data-ebook-view]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.ebookView)))
$('[data-water-open]').addEventListener('click', event => { if (!event.target.closest('[data-water-add]')) showPage('water') })
$('[data-water-open]').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') showPage('water') })
$$('[data-water-add]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); addWater(Number(button.dataset.waterAdd)) }))
$('[data-action="water-goal"]').addEventListener('click', changeWaterGoal)
$('[data-samsung-connect]').addEventListener('click', event => {
  const card = $('[data-samsung-sync]')
  const connected = card.classList.toggle('is-connected')
  $('[data-samsung-status]').textContent = connected ? 'Bemutató mód · az SDK-kapcsolat még tesztelésre vár' : 'Nincs összekapcsolva'
  event.currentTarget.textContent = connected ? 'Leválasztás' : 'Kapcsolódás'
  showToast(connected ? 'A Samsung Health felület bemutató módba kapcsolt.' : 'Samsung Health leválasztva.')
})
$('[data-project-search]').addEventListener('input', event => {
  const query = event.currentTarget.value.trim().toLocaleLowerCase('hu-HU')
  $$('[data-project-name]').forEach(row => { row.hidden = query && !row.dataset.projectName.includes(query) })
})
$$('[data-action]').forEach(button => {
  if (button.dataset.action === 'water-goal' || button.matches('[data-sync-refresh], [data-sync-projects]')) return
  button.addEventListener('click', () => showToast('Ez a művelet a következő mobilos körben kap saját nézetet.'))
})
fab.addEventListener('click', () => { sheet.classList.add('is-open'); sheetBackdrop.classList.add('is-open') })
sheetBackdrop.addEventListener('click', closeSheet)
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSheet() })
onGrapesDriveChange(() => { renderAccount(); renderProjects(); renderSync() })

renderWater()
if (isGrapesDriveConnected() || localMode()) showApp()
