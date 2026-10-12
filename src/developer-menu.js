import projectStatus from '../PROJECT_STATUS.md?raw'
import {
  MODULE_DEFINITIONS,
  enableAllModules,
  isDeveloperEmail,
  isModuleEnabled,
  setModuleEnabled,
} from './developer-settings.js'

const disabledMessage = 'A modul jelenleg ki van kapcsolva.'

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

export function initDeveloperMenu(account) {
  const toggle = document.querySelector('#developer-menu-toggle')
  const panel = document.querySelector('#developer-panel')
  if (!toggle || !panel) return
  const allowed = isDeveloperEmail(account?.email)
  toggle.hidden = !allowed
  if (!allowed) {
    panel.hidden = true
    return
  }
  document.querySelector('#developer-status-content').textContent = projectStatus
  renderModuleSwitches(document.querySelector('#developer-module-list'))
  toggle.onclick = () => { panel.hidden = !panel.hidden }
  document.querySelector('#developer-panel-close').onclick = () => { panel.hidden = true }
  document.querySelector('#developer-enable-all').onclick = () => {
    enableAllModules()
    renderModuleSwitches(document.querySelector('#developer-module-list'))
    applyModuleAvailability()
  }
}
