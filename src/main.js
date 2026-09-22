// Belépőpont. Csak a stílusréteget tölti be és beköti a képernyőváltást —
// maga a két szerkesztőmotor és a 3D stúdió dinamikus importtal érkezik,
// amikor a felhasználó tényleg megnyitja őket.
//
// Korábban ez a fájl 1028 soros volt: a tetején statikusan importálta a
// GrapesJS-t és nyolc pluginját, és top-level hívta a grapesjs.init()-et,
// így minden oldalbetöltés megfizette a teljes szerkesztő indítását akkor
// is, ha a cél a 3D stúdió volt.

import './styles/index.css'
import { el } from './ui/dom.js'
import { showScreen, showModulePicker } from './screens.js'
import { connectGrapesDrive, isGrapesDriveConnected, listGrapesProjects } from './storage/grapes-drive.js'
import { listLocalProjects } from './storage/local-project-store.js'

el('#pick-brochure').addEventListener('click', () => showScreen('brochure'))
el('#pick-studio').addEventListener('click', () => showScreen('studio'))
el('#pick-qr').addEventListener('click', () => showScreen('qr'))
el('#pick-ebook').addEventListener('click', () => showScreen('ebook'))

async function renderRecentProjects() {
  const list = el('#recent-projects-list')
  const source = el('#recent-projects-source')
  try {
    let projects = []
    if (isGrapesDriveConnected()) {
      source.textContent = 'Google Drive'
      projects = (await listGrapesProjects('2D Studio')).slice(0, 5).map(project => ({
        ...project,
        module: '2D Studio',
        displayName: project.name.replace(/\\.grapes\\.json$/, ''),
        updatedAt: project.modifiedTime,
        source: 'Drive',
      }))
    } else {
      source.textContent = 'Helyi mentések'
      projects = (await listLocalProjects(5)).map(project => ({
        ...project,
        displayName: project.name || 'Névtelen projekt',
        source: 'Helyi',
      }))
    }
    list.replaceChildren()
    if (!projects.length) {
      const empty = document.createElement('p')
      empty.className = 'recent-projects__empty'
      empty.textContent = 'Még nincs legutóbbi projekt.'
      list.append(empty)
      return
    }
    for (const project of projects) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'recent-project'
      const title = document.createElement('strong')
      title.textContent = project.displayName
      const meta = document.createElement('span')
      const date = project.updatedAt ? new Date(project.updatedAt).toLocaleString('hu-HU') : ''
      meta.textContent = `${project.module || '2D Studio'} · ${date} · ${project.source}`
      button.append(title, meta)
      button.addEventListener('click', () => {
        sessionStorage.setItem('grapes-open-project', JSON.stringify({
          module: project.module || '2D Studio',
          source: project.source,
          id: project.id,
        }))
        showScreen('brochure')
      })
      list.append(button)
    }
  } catch (error) {
    console.warn('A legutóbbi projektek nem tölthetők be:', error)
  }
}

const driveButton = el('#grapes-drive-connect')
const driveStatus = el('#grapes-drive-status')
function renderDriveStatus() {
  const connected = isGrapesDriveConnected()
  driveButton.textContent = connected ? 'Google Drive csatlakoztatva' : 'Google Drive csatlakoztatása'
  driveButton.disabled = connected
  driveStatus.textContent = connected ? 'Közös Grapes Drive aktív' : 'Nincs csatlakoztatva'
  driveStatus.dataset.connected = connected ? 'true' : 'false'
}
driveButton.addEventListener('click', async () => {
  driveButton.disabled = true
  driveStatus.textContent = 'Csatlakozás…'
  try {
    await connectGrapesDrive()
    renderDriveStatus()
    renderRecentProjects()
  } catch (error) {
    driveButton.disabled = false
    driveStatus.textContent = error.message || 'A Drive csatlakoztatása nem sikerült.'
  }
})
renderDriveStatus()
renderRecentProjects()

for (const selector of ['#app-back-to-menu-btn', '#studio-back-to-menu-btn', '#fabric-back-to-menu-btn', '#qr-back-to-menu-btn', '#ebook-back-to-menu-btn']) {
  el(selector).addEventListener('click', showModulePicker)
}

const ebookParams = new URLSearchParams(window.location.search)
const hasEbookPair = ebookParams.has('ebook-pair') || ebookParams.has('ebook-reader')
if (hasEbookPair) showScreen('ebook')
else showModulePicker()
