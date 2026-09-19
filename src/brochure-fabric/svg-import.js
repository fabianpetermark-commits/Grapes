import { loadSVGFromString, ActiveSelection } from 'fabric'

const SHEET_WIDTH = 1123
const SHEET_HEIGHT = 794
const MAX_IMPORT_SIZE = 720
const MIN_IMPORT_SIZE = 24

function getSvgSize(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const svg = doc.documentElement
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') {
    throw new Error('Az SVG-fájl gyökéreleme nem érvényes <svg>.')
  }

  const viewBox = (svg.getAttribute('viewBox') || '')
    .trim()
    .split(/[\\s,]+/)
    .map(Number)

  const viewBoxValid = viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0
  const width = parseFloat(svg.getAttribute('width'))
  const height = parseFloat(svg.getAttribute('height'))

  if (viewBoxValid) {
    return { width: viewBox[2], height: viewBox[3] }
  }

  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return { width, height }
  }

  return null
}

function fitImportedObjects(objects, sourceSize) {
  const bounds = objects.reduce(
    (acc, object) => {
      const rect = object.getBoundingRect()
      acc.left = Math.min(acc.left, rect.left)
      acc.top = Math.min(acc.top, rect.top)
      acc.right = Math.max(acc.right, rect.left + rect.width)
      acc.bottom = Math.max(acc.bottom, rect.top + rect.height)
      return acc
    },
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
  )

  const boundsWidth = bounds.right - bounds.left
  const boundsHeight = bounds.bottom - bounds.top
  if (!(boundsWidth > 0 && boundsHeight > 0)) return

  const sourceWidth = sourceSize?.width || boundsWidth
  const sourceHeight = sourceSize?.height || boundsHeight
  const sourceScale = Math.min(sourceWidth / boundsWidth, sourceHeight / boundsHeight)
  const targetScale = Math.min(1, MAX_IMPORT_SIZE / Math.max(boundsWidth, boundsHeight))
  let scale = targetScale

  if (Math.max(boundsWidth, boundsHeight) * scale < MIN_IMPORT_SIZE) {
    scale = MIN_IMPORT_SIZE / Math.max(boundsWidth, boundsHeight)
  }

  // A Fabric által már alkalmazott SVG-transzformációkat megtartjuk; csak
  // az importált teljes rajz méretét normalizáljuk és a lap közepére tesszük.
  if (Number.isFinite(sourceScale) && sourceScale > 0 && sourceScale < 0.01) {
    scale *= sourceScale
  }

  objects.forEach((object) => {
    object.scaleX *= scale
    object.scaleY *= scale
    object.left = (object.left - bounds.left) * scale
    object.top = (object.top - bounds.top) * scale
    object.setCoords()
  })

  const finalWidth = boundsWidth * scale
  const finalHeight = boundsHeight * scale
  const offsetX = (SHEET_WIDTH - finalWidth) / 2
  const offsetY = (SHEET_HEIGHT - finalHeight) / 2

  objects.forEach((object) => {
    object.left += offsetX
    object.top += offsetY
    object.setCoords()
  })
}

export async function importSvgFile(file, canvas) {
  const text = await file.text()
  const sourceSize = getSvgSize(text)
  const { objects } = await loadSVGFromString(text)
  const validObjects = objects.filter(Boolean)

  if (!validObjects.length) {
    throw new Error('Az SVG-fájlban nem található importálható elem.')
  }

  fitImportedObjects(validObjects, sourceSize)

  validObjects.forEach((object) => canvas.add(object))

  const selection = new ActiveSelection(validObjects, { canvas })
  canvas.setActiveObject(selection)
  canvas.requestRenderAll()
}
