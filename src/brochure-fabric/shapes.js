import { Rect, Circle, Line, Path, Textbox, FabricImage } from 'fabric'

const GRID_SIZE = 10

const DEFAULT_FILL = '#00e5ff'
const DEFAULT_STROKE = '#0891b2'
const DEFAULT_STROKE_WIDTH = 2

export function createRect() {
  return new Rect({
    left: 80,
    top: 80,
    width: 200,
    height: 120,
    fill: DEFAULT_FILL,
    stroke: DEFAULT_STROKE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
  })
}

export function createCircle() {
  return new Circle({
    left: 320,
    top: 80,
    radius: 60,
    fill: DEFAULT_FILL,
    stroke: DEFAULT_STROKE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
  })
}

export function createLine() {
  return new Line([0, 0, 200, 0], {
    left: 80,
    top: 220,
    stroke: DEFAULT_STROKE,
    strokeWidth: 4,
  })
}

export function createArrow() {
  // Jobbra mutató nyíl, ugyanaz a geometria mint a korábbi GrapesJS-es
  // SVG alakzatoknál (main.js), csak Fabric Path-ként.
  return new Path('M 0 15 L 60 15 L 60 0 L 90 25 L 60 50 L 60 35 L 0 35 Z', {
    left: 320,
    top: 220,
    fill: DEFAULT_FILL,
    stroke: DEFAULT_STROKE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
  })
}

export function createStar() {
  return new Path(
    'M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z',
    {
      left: 80,
      top: 340,
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      strokeWidth: DEFAULT_STROKE_WIDTH,
      scaleX: 0.9,
      scaleY: 0.9,
    },
  )
}

export function createText() {
  return new Textbox('Szöveg szerkesztése...', {
    left: 320,
    top: 340,
    width: 300,
    fontSize: 28,
    fill: '#1e293b',
  })
}

export function createImageFromDataUrl(dataUrl) {
  return FabricImage.fromURL(dataUrl).then((img) => {
    const maxSize = 300
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
    img.set({ left: 80, top: 80, scaleX: scale, scaleY: scale })
    return img
  })
}

export function snapValueToGrid(value) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

export { GRID_SIZE }
