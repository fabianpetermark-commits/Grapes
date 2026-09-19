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
import { notifyError } from '../ui/toast.js'
import { el } from '../ui/dom.js'

// Fázis 2 / Lépés 1: alapvető szerkesztő-UX (alakzat-paletta, tulajdonságok
// panel, rétegek panel, snap-to-grid, igazítás, előre/hátra) a kísérleti
// Fabric.js-alapú "lap" fölé. Lásd a migrációs tervet: ez a GrapesJS-es
// szerkesztő MELLETT fut, attól teljesen elszigetelten (?engine=fabric).

const SHEET_WIDTH = 1123
const SHEET_HEIGHT = 794

const ZOOM_STEP = 10
const ZOOM_MIN = 20
const ZOOM_MAX = 400

// A vászon körüli levegő, hogy a lap ne érjen a panelek széléhez.
const VIEWPORT_PADDING = 48

let canvas = null
let zoomValue = 100
// Amíg a felhasználó nem állít kézzel a nagyításon, a lap a rendelkezésre
// álló területhez igazodik — így ablakátméretezés és eszközforgatás után is
// használható marad. Korábban ez egyetlen, indításkori számítás volt.
let isFitMode = true

function applyZoom(value) {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value)))
  zoomValue = clamped
  canvas.setZoom(clamped / 100)
  canvas.setDimensions({
    width: SHEET_WIDTH * (clamped / 100),
    height: SHEET_HEIGHT * (clamped / 100),
  })
  el('#fabric-zoom-level').textContent = `${clamped}%`
  return clamped
}

function computeFitZoom() {
  const viewport = el('.editor__viewport')
  const availableWidth = viewport.clientWidth - VIEWPORT_PADDING
  const availableHeight = viewport.clientHeight - VIEWPORT_PADDING
  if (availableWidth <= 0 || availableHeight <= 0) return zoomValue

  const scale = Math.min(availableWidth / SHEET_WIDTH, availableHeight / SHEET_HEIGHT)
  return Math.floor(scale * 100)
}

function fitToViewport() {
  isFitMode = true
  applyZoom(computeFitZoom())
}

function setupZoom() {
  const setManualZoom = (value) => {
    isFitMode = false
    applyZoom(value)
  }

  el('#fabric-zoom-in-btn').addEventListener('click', () => setManualZoom(zoomValue + ZOOM_STEP))
  el('#fabric-zoom-out-btn').addEventListener('click', () => setManualZoom(zoomValue - ZOOM_STEP))
  el('#fabric-zoom-reset-btn').addEventListener('click', () => setManualZoom(100))
  el('#fabric-zoom-fit-btn').addEventListener('click', fitToViewport)

  fitToViewport()

  // A ResizeObserver az ablakátméretezést, az eszközforgatást és a mobil
  // fiókok nyitását/zárását is lefedi — a korábbi kódban egyik sem volt
  // kezelve, a vászon a kezdeti méretben ragadt.
  const observer = new ResizeObserver(() => {
    if (isFitMode) applyZoom(computeFitZoom())
  })
  observer.observe(el('.editor__viewport'))
}

// A kijelöléshez kötött műveletek (igazítás, rétegsorrend, csoportosítás,
// törlés) saját sávot kaptak a vászon fölött. Korábban a felső toolbarban
// ültek, és keskeny nézeten display:none-nal tűntek el — vagyis mobilon
// egyáltalán nem voltak elérhetők.
function setupObjectBar() {
  const bar = el('#fabric-objectbar')
  const sync = () => {
    bar.hidden = !canvas.getActiveObject()
  }

  canvas.on('selection:created', sync)
  canvas.on('selection:updated', sync)
  canvas.on('selection:cleared', sync)
  sync()
}

// A ritkábban használt exportok külön menübe kerültek, hogy a toolbar
// olvasható maradjon.
function setupOverflowMenu() {
  const trigger = el('#fabric-overflow-btn')
  const panel = el('#fabric-overflow-menu')

  const close = () => {
    panel.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
  }
  const open = () => {
    panel.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    panel.querySelector('[role="menuitem"]')?.focus()
  }

  trigger.addEventListener('click', (event) => {
    event.stopPropagation()
    if (panel.hidden) open()
    else close()
  })

  panel.addEventListener('click', (event) => {
    if (event.target.closest('[role="menuitem"]')) close()
  })

  document.addEventListener('click', (event) => {
    if (panel.hidden) return
    if (!panel.contains(event.target) && event.target !== trigger) close()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      close()
      trigger.focus()
    }
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
    history.batch(() => importHtmlFile(file, canvas)).catch((error) => {
      console.error('HTML-import sikertelen:', error)
      notifyError(`A HTML-fájl importálása sikertelen: ${error.message}`)
    })
  })

  const svgInput = document.querySelector('#fabric-svg-input')
  document.querySelector('#fabric-svg-import-btn').addEventListener('click', () => svgInput.click())
  svgInput.addEventListener('change', () => {
    const [file] = svgInput.files ?? []
    svgInput.value = ''
    if (!file) return
    history.batch(() => importSvgFile(file, canvas)).catch((error) => {
      console.error('SVG-import sikertelen:', error)
      notifyError(`Az SVG-fájl importálása sikertelen: ${error.message}`)
    })
  })

  document.querySelector('#fabric-delete-btn').addEventListener('click', () => {
    const active = canvas.getActiveObject()
    if (!active) return
    history.batch(() => canvas.remove(active))
    canvas.requestRenderAll()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    if (document.querySelector('#fabric-app').classList.contains('hidden')) return
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return
    const active = canvas.getActiveObject()
    if (!active || active.isEditing) return
    history.batch(() => canvas.remove(active))
    canvas.requestRenderAll()
  })
}

function setupLayerOrderButtons(layersPanel, history) {
  // A z-sorrend változása nem vált ki Fabric-eseményt, amire a rétegpanel
  // magától feliratkozhatna, ezért itt kérjük az újrarajzolását.
  const reorder = (apply) => {
    const active = canvas.getActiveObject()
    if (!active) return
    history.batch(() => {
      apply(active)
      history.record()
    })
    canvas.requestRenderAll()
    layersPanel.render()
  }

  el('#fabric-bring-front-btn').addEventListener('click', () => reorder((o) => canvas.bringObjectToFront(o)))
  el('#fabric-send-back-btn').addEventListener('click', () => reorder((o) => canvas.sendObjectToBack(o)))
  el('#fabric-group-btn').addEventListener('click', () => history.batch(() => groupSelection(canvas)))
  el('#fabric-ungroup-btn').addEventListener('click', () => history.batch(() => ungroupSelection(canvas)))
}

function setupAlignment(history) {
  const align = (fn) => {
    const active = canvas.getActiveObject()
    if (!active) return
    history.batch(() => {
      fn(active)
      history.record()
    })
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

function setupHistory(history) {
  document.querySelector('#fabric-undo-btn').addEventListener('click', () => history.undo())
  document.querySelector('#fabric-redo-btn').addEventListener('click', () => history.redo())
}

function setupProjectIO(history) {
  document.querySelector('#fabric-save-btn').addEventListener('click', () => saveProject(canvas))

  const projectInput = document.querySelector('#fabric-project-input')
  document.querySelector('#fabric-load-btn').addEventListener('click', () => projectInput.click())
  projectInput.addEventListener('change', () => {
    const [file] = projectInput.files ?? []
    projectInput.value = ''
    if (!file) return
    loadProject(file, canvas).then(() => history.reset()).catch((error) => {
      console.error('Projekt betöltése sikertelen:', error)
      notifyError(`A projekt betöltése sikertelen: ${error.message}`)
    })
  })

  document.querySelector('#fabric-pdf-btn').addEventListener('click', () => exportToPdf(canvas))
  document.querySelector('#fabric-html-export-btn').addEventListener('click', () => exportToHtml(canvas))
  document.querySelector('#fabric-code-view-btn').addEventListener('click', () => openCodeView(canvas))
}

// Keskeny nézeten az "Elemek" paletta és a "Tulajdonságok/Rétegek" panel
// oldalról becsúszó fiókká válik a vászon fölött.
//
// A korábbi megoldás a zárt fiókot csak `translateX`-szel tolta ki a
// képből: a benne lévő gombok és űrlapmezők bent maradtak a tabsorrendben,
// láthatatlanul fókuszálhatóan, és Escape-re sem záródott semmi. Az `inert`
// és a fókuszkezelés ezt orvosolja.
function setupMobilePanels() {
  const paletteEl = el('#fabric-palette')
  const sidePanelEl = el('#fabric-side-panel')
  const backdropEl = el('#fabric-mobile-backdrop')
  const paletteTrigger = el('#fabric-mobile-palette-btn')
  const propsTrigger = el('#fabric-mobile-props-btn')

  const isDrawerLayout = () => window.matchMedia('(max-width: 768px)').matches

  const drawers = [
    { panel: paletteEl, trigger: paletteTrigger },
    { panel: sidePanelEl, trigger: propsTrigger },
  ]

  const syncInert = () => {
    for (const { panel, trigger } of drawers) {
      const open = panel.classList.contains('is-open')
      // Asztali nézeten a panel mindig látszik, ott soha nem inert.
      panel.inert = isDrawerLayout() && !open
      trigger.setAttribute('aria-expanded', String(open))
    }
  }

  const closeAll = ({ restoreFocus } = {}) => {
    for (const { panel } of drawers) panel.classList.remove('is-open')
    backdropEl.classList.remove('is-open')
    backdropEl.hidden = true
    syncInert()
    restoreFocus?.focus()
  }

  const open = (panel) => {
    for (const drawer of drawers) drawer.panel.classList.toggle('is-open', drawer.panel === panel)
    backdropEl.hidden = false
    // A hidden levétele után egy képkockával később kapcsoljuk be az
    // átmenetet, különben nincs mihez képest animálni.
    requestAnimationFrame(() => backdropEl.classList.add('is-open'))
    syncInert()
    panel.querySelector('button, input, select')?.focus()
  }

  paletteTrigger.addEventListener('click', () => open(paletteEl))
  propsTrigger.addEventListener('click', () => open(sidePanelEl))
  el('#fabric-palette-close-btn').addEventListener('click', () => closeAll({ restoreFocus: paletteTrigger }))
  el('#fabric-side-panel-close-btn').addEventListener('click', () => closeAll({ restoreFocus: propsTrigger }))
  backdropEl.addEventListener('click', () => closeAll())

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (drawers.some(({ panel }) => panel.classList.contains('is-open'))) {
      closeAll()
    }
  })

  // Elem hozzáadása után a fiók záródik, hogy rögtön látszódjon az eredmény.
  paletteEl.addEventListener('click', (event) => {
    if (!isDrawerLayout()) return
    const button = event.target.closest('button')
    if (!button || button.id === 'fabric-palette-close-btn') return
    closeAll()
  })

  // Az asztali és a fiókos elrendezés között váltva az inert állapotot
  // újra kell számolni, különben asztali nézetben is inert maradhat.
  window.matchMedia('(max-width: 768px)').addEventListener('change', () => closeAll())
  syncInert()
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

  const history = initHistory(canvas)
  const layersPanel = initLayersPanel(canvas, history)

  setupZoom()
  setupPalette()
  setupObjectBar()
  setupOverflowMenu()
  setupLayerOrderButtons(layersPanel, history)
  setupAlignment(history)
  setupSnapToGrid()
  setupHistory(history)
  setupProjectIO(history)
  setupMobilePanels()
  initPropertiesPanel(canvas, history)

  return canvas
}
