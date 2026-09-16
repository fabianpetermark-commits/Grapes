import { Canvas } from 'fabric'
import {
  createRect,
  createCircle,
  createLine,
  createArrow,
  createStar,
  createText,
  createImageFromDataUrl,
  snapValueToGrid,
} from './shapes.js'
import { initPropertiesPanel } from './panels/properties.js'
import { initLayersPanel } from './panels/layers.js'
import { openQrModal } from './qr.js'
import { openUnsplashModal } from './unsplash.js'
import { importHtmlFile } from './html-import.js'
import { initHistory } from './history.js'
import { saveProject, loadProject } from './project-io.js'
import { exportToPdf } from './pdf-export.js'
import { exportToHtml } from './html-export.js'
import { openCodeView } from './code-view.js'
import { groupSelection, ungroupSelection } from './group.js'
import { importSvgFile } from './svg-import.js'
import { snapToNearbyObjects } from './smart-guides.js'

// Fázis 2 / Lépés 1: alapvető szerkesztő-UX (alakzat-paletta, tulajdonságok
// panel, rétegek panel, snap-to-grid, igazítás, előre/hátra) a kísérleti
// Fabric.js-alapú "lap" fölé. Lásd a migrációs tervet: ez a GrapesJS-es
// szerkesztő MELLETT fut, attól teljesen elszigetelten (?engine=fabric).

const SHEET_WIDTH = 1123
const SHEET_HEIGHT = 794

const ZOOM_STEP = 10
const ZOOM_MIN = 20
const ZOOM_MAX = 200

let canvas = null

function setZoom(zoomLevelEl, value) {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value)))
  canvas.setZoom(clamped / 100)
  canvas.setDimensions({
    width: SHEET_WIDTH * (clamped / 100),
    height: SHEET_HEIGHT * (clamped / 100),
  })
  zoomLevelEl.textContent = `${clamped}%`
  return clamped
}

function setupZoom() {
  const zoomLevelEl = document.querySelector('#fabric-zoom-level')

  // Mobilon a fix A4-méretű canvas (1123px széles) messze nem férne el a
  // képernyőn — kezdéskor a rendelkezésre álló szélességhez illesztjük a
  // zoomot, hogy azonnal használható legyen, ne kelljen elsőre kézzel
  // kicsinyíteni/pöckölni.
  const wrapperWidth = document.querySelector('#fabric-canvas-wrapper').clientWidth
  const initialZoom =
    wrapperWidth > 0 && wrapperWidth < SHEET_WIDTH ? Math.floor((wrapperWidth / SHEET_WIDTH) * 100) - 2 : 100
  let zoomValue = setZoom(zoomLevelEl, initialZoom)

  document.querySelector('#fabric-zoom-in-btn').addEventListener('click', () => {
    zoomValue = setZoom(zoomLevelEl, zoomValue + ZOOM_STEP)
  })
  document.querySelector('#fabric-zoom-out-btn').addEventListener('click', () => {
    zoomValue = setZoom(zoomLevelEl, zoomValue - ZOOM_STEP)
  })
  document.querySelector('#fabric-zoom-reset-btn').addEventListener('click', () => {
    zoomValue = setZoom(zoomLevelEl, 100)
  })
}

function setupPalette() {
  const addAndSelect = (object) => {
    canvas.add(object)
    canvas.setActiveObject(object)
    canvas.requestRenderAll()
  }

  document.querySelector('#fabric-add-rect-btn').addEventListener('click', () => addAndSelect(createRect()))
  document.querySelector('#fabric-add-circle-btn').addEventListener('click', () => addAndSelect(createCircle()))
  document.querySelector('#fabric-add-line-btn').addEventListener('click', () => addAndSelect(createLine()))
  document.querySelector('#fabric-add-arrow-btn').addEventListener('click', () => addAndSelect(createArrow()))
  document.querySelector('#fabric-add-star-btn').addEventListener('click', () => addAndSelect(createStar()))
  document.querySelector('#fabric-add-text-btn').addEventListener('click', () => addAndSelect(createText()))

  const imageInput = document.querySelector('#fabric-image-input')
  document.querySelector('#fabric-add-image-btn').addEventListener('click', () => imageInput.click())
  imageInput.addEventListener('change', () => {
    const [file] = imageInput.files ?? []
    if (!file) return
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      createImageFromDataUrl(reader.result).then(addAndSelect)
    })
    reader.readAsDataURL(file)
    imageInput.value = ''
  })

  document.querySelector('#fabric-qr-btn').addEventListener('click', () => openQrModal(canvas))
  document.querySelector('#fabric-unsplash-btn').addEventListener('click', () => openUnsplashModal(canvas))

  const htmlInput = document.querySelector('#fabric-html-input')
  document.querySelector('#fabric-html-import-btn').addEventListener('click', () => htmlInput.click())
  htmlInput.addEventListener('change', () => {
    const [file] = htmlInput.files ?? []
    htmlInput.value = ''
    if (!file) return
    importHtmlFile(file, canvas).catch((error) => {
      console.error('HTML-import sikertelen:', error)
      window.alert(`A HTML-fájl importálása sikertelen: ${error.message}`)
    })
  })

  const svgInput = document.querySelector('#fabric-svg-input')
  document.querySelector('#fabric-svg-import-btn').addEventListener('click', () => svgInput.click())
  svgInput.addEventListener('change', () => {
    const [file] = svgInput.files ?? []
    svgInput.value = ''
    if (!file) return
    importSvgFile(file, canvas).catch((error) => {
      console.error('SVG-import sikertelen:', error)
      window.alert(`Az SVG-fájl importálása sikertelen: ${error.message}`)
    })
  })

  document.querySelector('#fabric-delete-btn').addEventListener('click', () => {
    const active = canvas.getActiveObject()
    if (!active) return
    canvas.remove(active)
    canvas.requestRenderAll()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    if (document.querySelector('#fabric-app').classList.contains('hidden')) return
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return
    const active = canvas.getActiveObject()
    if (!active || active.isEditing) return
    canvas.remove(active)
    canvas.requestRenderAll()
  })
}

function setupLayerOrderButtons() {
  document.querySelector('#fabric-bring-front-btn').addEventListener('click', () => {
    const active = canvas.getActiveObject()
    if (!active) return
    canvas.bringObjectToFront(active)
    canvas.requestRenderAll()
  })
  document.querySelector('#fabric-send-back-btn').addEventListener('click', () => {
    const active = canvas.getActiveObject()
    if (!active) return
    canvas.sendObjectToBack(active)
    canvas.requestRenderAll()
  })
  document.querySelector('#fabric-group-btn').addEventListener('click', () => groupSelection(canvas))
  document.querySelector('#fabric-ungroup-btn').addEventListener('click', () => ungroupSelection(canvas))
}

function setupAlignment() {
  const align = (fn) => {
    const active = canvas.getActiveObject()
    if (!active) return
    fn(active)
    active.setCoords()
    canvas.requestRenderAll()
  }

  document.querySelector('#fabric-align-left-btn').addEventListener('click', () =>
    align((object) => object.set('left', 0)),
  )
  document.querySelector('#fabric-align-center-btn').addEventListener('click', () =>
    align((object) => object.set('left', (SHEET_WIDTH - object.getScaledWidth()) / 2)),
  )
  document.querySelector('#fabric-align-right-btn').addEventListener('click', () =>
    align((object) => object.set('left', SHEET_WIDTH - object.getScaledWidth())),
  )
  document.querySelector('#fabric-align-top-btn').addEventListener('click', () =>
    align((object) => object.set('top', 0)),
  )
  document.querySelector('#fabric-align-middle-btn').addEventListener('click', () =>
    align((object) => object.set('top', (SHEET_HEIGHT - object.getScaledHeight()) / 2)),
  )
  document.querySelector('#fabric-align-bottom-btn').addEventListener('click', () =>
    align((object) => object.set('top', SHEET_HEIGHT - object.getScaledHeight())),
  )
}

function setupSnapToGrid() {
  canvas.on('object:moving', (event) => {
    const object = event.target
    // A más objektumokhoz igazodó "okos" snap élvez elsőbbséget a rácshoz
    // igazítással szemben — csak akkor esünk vissza a rácsra, ha nincs
    // közeli másik objektum-él/közép, amihez igazodhatna.
    const { left, top } = snapToNearbyObjects(canvas, object)
    object.set({
      left: left ?? snapValueToGrid(object.left),
      top: top ?? snapValueToGrid(object.top),
    })
  })
  canvas.on('object:scaling', (event) => {
    const object = event.target
    object.set({
      left: snapValueToGrid(object.left),
      top: snapValueToGrid(object.top),
    })
  })
}

function setupHistory() {
  const history = initHistory(canvas)
  document.querySelector('#fabric-undo-btn').addEventListener('click', () => history.undo())
  document.querySelector('#fabric-redo-btn').addEventListener('click', () => history.redo())
}

function setupProjectIO() {
  document.querySelector('#fabric-save-btn').addEventListener('click', () => saveProject(canvas))

  const projectInput = document.querySelector('#fabric-project-input')
  document.querySelector('#fabric-load-btn').addEventListener('click', () => projectInput.click())
  projectInput.addEventListener('change', () => {
    const [file] = projectInput.files ?? []
    projectInput.value = ''
    if (!file) return
    loadProject(file, canvas).catch((error) => {
      console.error('Projekt betöltése sikertelen:', error)
      window.alert(`A projekt betöltése sikertelen: ${error.message}`)
    })
  })

  document.querySelector('#fabric-pdf-btn').addEventListener('click', () => exportToPdf(canvas))
  document.querySelector('#fabric-html-export-btn').addEventListener('click', () => exportToHtml(canvas))
  document.querySelector('#fabric-code-view-btn').addEventListener('click', () => openCodeView(canvas))
}

// Mobilon az "Elemek" paletta és a "Tulajdonságok/Rétegek" panel csak
// igény szerint, teljes képernyős fiókként nyílik meg a canvas fölött
// (lásd a CSS media query-t) — asztali nézeten ezek a gombok/osztályok
// nem látszanak/hatnak, mert a `.fabric-mobile-only` alapból `display:none`.
function setupMobilePanels() {
  const paletteEl = document.querySelector('#fabric-palette')
  const sidePanelEl = document.querySelector('#fabric-side-panel')
  const backdropEl = document.querySelector('#fabric-mobile-backdrop')

  const openPanel = (panelEl, otherPanelEl) => {
    otherPanelEl.classList.remove('fabric-mobile-open')
    panelEl.classList.add('fabric-mobile-open')
    backdropEl.classList.add('fabric-mobile-open')
  }
  const closePanel = (panelEl) => {
    panelEl.classList.remove('fabric-mobile-open')
    backdropEl.classList.remove('fabric-mobile-open')
  }
  const closeAllPanels = () => {
    closePanel(paletteEl)
    closePanel(sidePanelEl)
  }

  document.querySelector('#fabric-mobile-palette-btn').addEventListener('click', () => openPanel(paletteEl, sidePanelEl))
  document.querySelector('#fabric-mobile-props-btn').addEventListener('click', () => openPanel(sidePanelEl, paletteEl))
  document.querySelector('#fabric-palette-close-btn').addEventListener('click', () => closePanel(paletteEl))
  document.querySelector('#fabric-side-panel-close-btn').addEventListener('click', () => closePanel(sidePanelEl))
  backdropEl.addEventListener('click', closeAllPanels)

  // Mobilon egy elem hozzáadása után rögtön a canvasra ugrunk, hogy
  // azonnal látszódjon az eredmény (asztali nézeten nincs hatása, mert
  // a fiók-osztály ott nem befolyásolja a layoutot).
  paletteEl.addEventListener('click', (event) => {
    if (event.target.closest('.tb-btn') && event.target.id !== 'fabric-palette-close-btn') {
      closePanel(paletteEl)
    }
  })
}

export function initBrochureFabric() {
  if (canvas) {
    return canvas
  }

  const canvasEl = document.querySelector('#fabric-canvas')
  canvas = new Canvas(canvasEl, {
    width: SHEET_WIDTH,
    height: SHEET_HEIGHT,
    backgroundColor: '#ffffff',
  })

  setupZoom()
  setupPalette()
  setupLayerOrderButtons()
  setupAlignment()
  setupSnapToGrid()
  setupHistory()
  setupProjectIO()
  setupMobilePanels()
  initPropertiesPanel(canvas)
  initLayersPanel(canvas)

  return canvas
}
