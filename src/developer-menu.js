import projectStatus from '../PROJECT_STATUS.md?raw'
import projectBacklog from '../PROJECT_BACKLOG.md?raw'
import {
  MODULE_DEFINITIONS,
  configuredDeveloperPin,
  enableAllModules,
  isDeveloperEmail,
  isDeveloperPin,
  isDeveloperSessionUnlocked,
  isModuleEnabled,
  lockDeveloperSession,
  setModuleEnabled,
  unlockDeveloperSession,
} from './developer-settings.js'
import {
  loadRegisteredUsers,
  removeRegisteredUser,
  saveRegisteredUsers,
  upsertRegisteredUser,
} from './developer-users.js'

const disabledMessage = 'A modul jelenleg ki van kapcsolva.'
let registeredUsers = []
let registeredUsersFileId = null

export function applyModuleAvailability(root = document) {
  for (const button of root.querySelectorAll('[data-module-key]')) {
    const enabled = isModuleEnabled(button.dataset.moduleKey)
    button.disabled = !enabled
    button.classList.toggle('card--disabled', !enabled)
    button.setAttribute('aria-disabled', String(!enabled))
    button.title = enabled ? '' : disabledMessage
    const marker = button.querySelector('.card__open')
    if (marker) marker.textContent = enabled ? '→' : 'Szünetel'
  }
}

function renderModuleSwitches(container) {
  container.replaceChildren()
  for (const module of MODULE_DEFINITIONS) {
    const label = document.createElement('label')
    label.className = 'developer-module-toggle'
    const text = document.createElement('span')
    text.textContent = module.label
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = isModuleEnabled(module.key)
    input.dataset.developerModule = module.key
    input.addEventListener('change', () => {
      setModuleEnabled(module.key, input.checked)
      applyModuleAvailability()
    })
    label.append(text, input)
    container.append(label)
  }
}

function downloadBacklog() {
  const url = URL.createObjectURL(new Blob([projectBacklog], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'PROJECT_BACKLOG.md'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function renderRegisteredUsers(container, developerEmail) {
  container.replaceChildren()
  for (const user of registeredUsers) {
    const row = document.createElement('div')
    row.className = 'developer-user-row'
    const identity = document.createElement('div')
    identity.className = 'developer-user-row__identity'
    const name = document.createElement('strong')
    name.textContent = user.name
    const email = document.createElement('span')
    email.textContent = user.email
    identity.append(name, email)
    const role = document.createElement('span')
    role.className = 'developer-user-row__role'
    role.textContent = user.role === 'owner' ? 'Tulajdonos' : 'Felhasználó'
    const remove = document.createElement('button')
    remove.className = 'btn btn--ghost btn--sm'
    remove.type = 'button'
    remove.textContent = 'Eltávolítás'
    remove.disabled = user.email === developerEmail
    remove.title = remove.disabled ? 'A fejlesztői tulajdonos nem távolítható el.' : ''
    remove.onclick = async () => {
      if (!window.confirm(`Eltávolítod ezt a felhasználót?\n${user.email}`)) return
      registeredUsers = removeRegisteredUser(registeredUsers, user.email, developerEmail)
      renderRegisteredUsers(container, developerEmail)
      await persistRegisteredUsers()
    }
    row.append(identity, role, remove)
    container.append(row)
  }
}

function setUserStatus(message, state = '') {
  const status = document.querySelector('#developer-users-status')
  if (!status) return
  status.textContent = message
  status.dataset.state = state
}

async function persistRegisteredUsers() {
  setUserStatus('Felhasználólista mentése…')
  try {
    const result = await saveRegisteredUsers(registeredUsers, registeredUsersFileId)
    registeredUsers = result.users
    registeredUsersFileId = result.fileId
    setUserStatus(result.synced ? 'Szinkronizálva a Google Drive-val.' : 'Helyben mentve; a Drive nem érhető el.', result.synced ? 'success' : 'warning')
  } catch (error) {
    setUserStatus(`Helyben mentve, a Drive-szinkron sikertelen: ${error.message}`, 'error')
  }
}

async function initRegisteredUsers(developerEmail) {
  const container = document.querySelector('#developer-user-list')
  if (!container) return
  setUserStatus('Felhasználólista betöltése…')
  try {
    const result = await loadRegisteredUsers()
    registeredUsers = result.users
    registeredUsersFileId = result.fileId
    renderRegisteredUsers(container, developerEmail)
    const message = result.synced
      ? 'Betöltve a Google Drive-ról.'
      : result.connected
        ? 'Új nyilvántartás; az első módosítás a Google Drive-ra menti.'
        : 'Helyi nyilvántartás; a Drive nem érhető el.'
    setUserStatus(message, result.synced ? 'success' : 'warning')
  } catch (error) {
    setUserStatus(`A Drive-lista nem tölthető be: ${error.message}`, 'error')
  }
}

function setDeveloperModeActive(active) {
  const banner = document.querySelector('#developer-mode-banner')
  if (banner) banner.hidden = !active
  document.body.classList.toggle('developer-mode-active', active)
}

export function initDeveloperMenu(account) {
  const toggle = document.querySelector('#developer-menu-toggle')
  const panel = document.querySelector('#developer-panel')
  const gate = document.querySelector('#developer-pin-gate')
  const pinForm = document.querySelector('#developer-pin-form')
  const pinInput = document.querySelector('#developer-pin-input')
  const pinError = document.querySelector('#developer-pin-error')
  if (!toggle || !panel || !gate || !pinForm || !pinInput || !pinError) return

  const developerEmail = String(account?.email || '').trim().toLocaleLowerCase('en-US')
  const allowed = isDeveloperEmail(developerEmail)
  toggle.hidden = !allowed
  gate.hidden = true

  if (!allowed) {
    panel.hidden = true
    setDeveloperModeActive(false)
    lockDeveloperSession()
    return
  }

  document.querySelector('#developer-status-content').textContent = projectStatus
  document.querySelector('#developer-backlog-content').textContent = projectBacklog
  renderModuleSwitches(document.querySelector('#developer-module-list'))

  let active = isDeveloperSessionUnlocked(developerEmail)
  setDeveloperModeActive(active)

  const openPanel = () => {
    panel.hidden = false
    void initRegisteredUsers(developerEmail)
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const closeGate = () => {
    gate.hidden = true
    pinInput.value = ''
    pinError.textContent = ''
    toggle.focus()
  }
  const openGate = () => {
    gate.hidden = false
    pinInput.value = ''
    pinError.textContent = ''
    requestAnimationFrame(() => pinInput.focus())
  }

  toggle.onclick = () => {
    if (!active) return openGate()
    if (panel.hidden) openPanel()
    else panel.hidden = true
  }
  document.querySelector('#developer-pin-cancel').onclick = closeGate
  pinInput.oninput = () => { pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 4); pinError.textContent = '' }
  pinForm.onsubmit = (event) => {
    event.preventDefault()
    if (!isDeveloperPin(pinInput.value, configuredDeveloperPin())) {
      pinError.textContent = 'Hibás fejlesztői kód.'
      pinInput.select()
      return
    }
    unlockDeveloperSession(developerEmail)
    active = true
    gate.hidden = true
    setDeveloperModeActive(true)
    openPanel()
  }
  document.querySelector('#developer-panel-close').onclick = () => { panel.hidden = true }
  document.querySelector('#developer-mode-exit').onclick = () => {
    lockDeveloperSession()
    active = false
    panel.hidden = true
    setDeveloperModeActive(false)
  }
  document.querySelector('#developer-enable-all').onclick = () => {
    enableAllModules()
    renderModuleSwitches(document.querySelector('#developer-module-list'))
    applyModuleAvailability()
  }
  document.querySelector('#developer-backlog-download').onclick = downloadBacklog
  document.querySelector('#developer-user-form').onsubmit = async (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    try {
      registeredUsers = upsertRegisteredUser(registeredUsers, {
        name: data.get('name'), email: data.get('email'), role: data.get('role'),
      }, developerEmail)
      renderRegisteredUsers(document.querySelector('#developer-user-list'), developerEmail)
      event.currentTarget.reset()
      await persistRegisteredUsers()
    } catch (error) {
      setUserStatus(error.message, 'error')
    }
  }
}
