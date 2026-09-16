import { Canvas, Rect, Circle, Textbox } from 'fabric'

// Fázis 1: minimális, kísérleti Fabric.js-alapú "lap", ami a jelenlegi
// GrapesJS-es brossúra-szerkesztő MELLETT fut, attól teljesen elszigetelten
// (?engine=fabric aktiválja, lásd main.js). A cél itt csak annak igazolása,
// hogy egy szabad-pozicionálású canvas-objektum modell (nincs CSS-kaszkád,
// nincs DOM-ütközés) valóban megszünteti a GrapesJS-nél tapasztalt
// pozicionálási hibaosztályt — a teljes funkcióparitás (rétegek, stílus
// panel, QR, Unsplash, HTML-import stb.) egy későbbi fázis feladata.

const SHEET_WIDTH = 1123
const SHEET_HEIGHT = 794

const ZOOM_STEP = 10
const ZOOM_MIN = 20
const ZOOM_MAX = 200

let canvas = null

function setZoom(canvasEl, zoomLevelEl, value) {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value)))
  canvas.setZoom(clamped / 100)
  canvas.setDimensions({
    width: SHEET_WIDTH * (clamped / 100),
    height: SHEET_HEIGHT * (clamped / 100),
  })
  zoomLevelEl.textContent = `${clamped}%`
  return clamped
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

  let zoomValue = 100
  const zoomLevelEl = document.querySelector('#fabric-zoom-level')

  document.querySelector('#fabric-zoom-in-btn').addEventListener('click', () => {
    zoomValue = setZoom(canvasEl, zoomLevelEl, zoomValue + ZOOM_STEP)
  })
  document.querySelector('#fabric-zoom-out-btn').addEventListener('click', () => {
    zoomValue = setZoom(canvasEl, zoomLevelEl, zoomValue - ZOOM_STEP)
  })
  document.querySelector('#fabric-zoom-reset-btn').addEventListener('click', () => {
    zoomValue = setZoom(canvasEl, zoomLevelEl, 100)
  })

  document.querySelector('#fabric-add-rect-btn').addEventListener('click', () => {
    canvas.add(
      new Rect({
        left: 80,
        top: 80,
        width: 200,
        height: 120,
        fill: '#00e5ff',
        stroke: '#0891b2',
        strokeWidth: 2,
      }),
    )
  })

  document.querySelector('#fabric-add-circle-btn').addEventListener('click', () => {
    canvas.add(
      new Circle({
        left: 320,
        top: 80,
        radius: 60,
        fill: '#00e5ff',
        stroke: '#0891b2',
        strokeWidth: 2,
      }),
    )
  })

  document.querySelector('#fabric-add-text-btn').addEventListener('click', () => {
    canvas.add(
      new Textbox('Szöveg szerkesztése...', {
        left: 80,
        top: 260,
        width: 300,
        fontSize: 28,
        fill: '#1e293b',
      }),
    )
  })

  return canvas
}
