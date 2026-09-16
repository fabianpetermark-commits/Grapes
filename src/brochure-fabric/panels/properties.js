import { Gradient, Pattern, Shadow } from 'fabric'
import { populateFontSelect } from '../fonts.js'

const SWATCH_COLORS = [
  '#000000',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
  '#00e5ff',
]

// px <-> cm/inch átváltás 96 DPI-vel számolva (ez a szokásos böngésző
// CSS-pixel <-> fizikai méret megfeleltetés, ugyanez az alap, mint amivel
// az A4 "lap" mérete is 1123×794px-ben van megadva).
const UNIT_TO_PX = { px: 1, cm: 96 / 2.54, in: 96 }

// Tulajdonságok panel: a kijelölt Fabric objektum stílus-property-jeit
// szerkeszti (kitöltés — egyszínű/gradiens/mintás —, körvonal, átlátszóság,
// elforgatás, vetett árnyék, betűméret). Ez váltja a GrapesJS-es
// "shape-style" StyleManager sectort, most már a Fabric.js teljes
// kitöltés-/effekt-készletét kihasználva.

function toHex(value) {
  if (!value || typeof value !== 'string' || !value.startsWith('#')) {
    return '#000000'
  }
  return value.length === 7 ? value : '#000000'
}

function isGradient(fill) {
  return fill instanceof Gradient || fill?.type === 'linear' || fill?.type === 'radial'
}

function isPattern(fill) {
  return fill instanceof Pattern
}

function buildGradient(object, type, fromColor, toColor) {
  const width = object.width || 100
  const height = object.height || 100
  const coords =
    type === 'radial'
      ? { x1: width / 2, y1: height / 2, x2: width / 2, y2: height / 2, r1: 0, r2: Math.max(width, height) / 2 }
      : { x1: 0, y1: 0, x2: width, y2: height }

  return new Gradient({
    type,
    coords,
    colorStops: [
      { offset: 0, color: fromColor },
      { offset: 1, color: toColor },
    ],
  })
}

export function initPropertiesPanel(canvas) {
  const emptyEl = document.querySelector('#fabric-properties-empty')
  const fieldsEl = document.querySelector('#fabric-properties-fields')

  const fillModeSelect = document.querySelector('#fabric-prop-fill-mode')
  const solidGroup = document.querySelector('#fabric-prop-fill-solid-group')
  const gradientGroup = document.querySelector('#fabric-prop-fill-gradient-group')
  const patternGroup = document.querySelector('#fabric-prop-fill-pattern-group')

  const fillInput = document.querySelector('#fabric-prop-fill')
  const gradientTypeSelect = document.querySelector('#fabric-prop-gradient-type')
  const gradientFromInput = document.querySelector('#fabric-prop-gradient-from')
  const gradientToInput = document.querySelector('#fabric-prop-gradient-to')
  const patternInput = document.querySelector('#fabric-prop-pattern-input')

  const strokeInput = document.querySelector('#fabric-prop-stroke')
  const strokeWidthInput = document.querySelector('#fabric-prop-stroke-width')
  const opacityInput = document.querySelector('#fabric-prop-opacity')
  const angleInput = document.querySelector('#fabric-prop-angle')

  const shadowEnabledInput = document.querySelector('#fabric-prop-shadow-enabled')
  const shadowGroup = document.querySelector('#fabric-prop-shadow-group')
  const shadowColorInput = document.querySelector('#fabric-prop-shadow-color')
  const shadowBlurInput = document.querySelector('#fabric-prop-shadow-blur')
  const shadowOffsetXInput = document.querySelector('#fabric-prop-shadow-offset-x')
  const shadowOffsetYInput = document.querySelector('#fabric-prop-shadow-offset-y')

  const fontGroup = document.querySelector('#fabric-prop-font-group')
  const fontFamilySelect = document.querySelector('#fabric-prop-font-family')
  const fontSizeInput = document.querySelector('#fabric-prop-font-size')

  const widthInput = document.querySelector('#fabric-prop-width')
  const heightInput = document.querySelector('#fabric-prop-height')
  const sizeUnitSelect = document.querySelector('#fabric-prop-size-unit')

  const swatchRow = document.querySelector('#fabric-prop-fill-swatches')
  SWATCH_COLORS.forEach((color) => {
    const swatch = document.createElement('button')
    swatch.type = 'button'
    swatch.title = color
    swatch.style.background = color
    swatch.addEventListener('click', () => {
      fillInput.value = color
      applyAndRender('fill', color)
    })
    swatchRow.append(swatch)
  })

  populateFontSelect(fontFamilySelect)

  function refresh() {
    const active = canvas.getActiveObject()
    if (!active) {
      emptyEl.classList.remove('hidden')
      fieldsEl.classList.add('hidden')
      return
    }
    emptyEl.classList.add('hidden')
    fieldsEl.classList.remove('hidden')

    const fill = active.fill
    if (isGradient(fill)) {
      fillModeSelect.value = 'gradient'
      gradientTypeSelect.value = fill.type || 'linear'
      const stops = fill.colorStops || []
      gradientFromInput.value = toHex(stops[0]?.color)
      gradientToInput.value = toHex(stops[stops.length - 1]?.color)
    } else if (isPattern(fill)) {
      fillModeSelect.value = 'pattern'
    } else {
      fillModeSelect.value = 'solid'
      fillInput.value = toHex(fill)
    }
    solidGroup.classList.toggle('hidden', fillModeSelect.value !== 'solid')
    gradientGroup.classList.toggle('hidden', fillModeSelect.value !== 'gradient')
    patternGroup.classList.toggle('hidden', fillModeSelect.value !== 'pattern')

    strokeInput.value = toHex(active.stroke)
    strokeWidthInput.value = active.strokeWidth ?? 0
    opacityInput.value = Math.round((active.opacity ?? 1) * 100)
    angleInput.value = Math.round(active.angle ?? 0)

    const hasShadow = Boolean(active.shadow)
    shadowEnabledInput.checked = hasShadow
    shadowGroup.classList.toggle('hidden', !hasShadow)
    if (hasShadow) {
      shadowColorInput.value = toHex(active.shadow.color) || '#000000'
      shadowBlurInput.value = active.shadow.blur ?? 10
      shadowOffsetXInput.value = active.shadow.offsetX ?? 5
      shadowOffsetYInput.value = active.shadow.offsetY ?? 5
    }

    const isText = active.type === 'textbox'
    fontGroup.classList.toggle('hidden', !isText)
    if (isText) {
      fontSizeInput.value = active.fontSize ?? 28
      fontFamilySelect.value = active.fontFamily || 'Arial'
    }

    const unitToPx = UNIT_TO_PX[sizeUnitSelect.value]
    widthInput.value = (active.getScaledWidth() / unitToPx).toFixed(2)
    heightInput.value = (active.getScaledHeight() / unitToPx).toFixed(2)
  }

  function applyAndRender(property, value) {
    const active = canvas.getActiveObject()
    if (!active) return
    active.set(property, value)
    canvas.requestRenderAll()
  }

  fillModeSelect.addEventListener('change', () => {
    const active = canvas.getActiveObject()
    if (!active) return
    const mode = fillModeSelect.value
    solidGroup.classList.toggle('hidden', mode !== 'solid')
    gradientGroup.classList.toggle('hidden', mode !== 'gradient')
    patternGroup.classList.toggle('hidden', mode !== 'pattern')

    if (mode === 'solid') {
      applyAndRender('fill', fillInput.value)
    } else if (mode === 'gradient') {
      applyAndRender('fill', buildGradient(active, gradientTypeSelect.value, gradientFromInput.value, gradientToInput.value))
    }
    // A 'pattern' mód a fájl-feltöltésre vár, addig a korábbi fill marad.
  })

  fillInput.addEventListener('input', () => applyAndRender('fill', fillInput.value))

  function applyGradientFromInputs() {
    const active = canvas.getActiveObject()
    if (!active) return
    applyAndRender('fill', buildGradient(active, gradientTypeSelect.value, gradientFromInput.value, gradientToInput.value))
  }
  gradientTypeSelect.addEventListener('change', applyGradientFromInputs)
  gradientFromInput.addEventListener('input', applyGradientFromInputs)
  gradientToInput.addEventListener('input', applyGradientFromInputs)

  patternInput.addEventListener('change', () => {
    const [file] = patternInput.files ?? []
    if (!file) return
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const img = new window.Image()
      img.addEventListener('load', () => {
        applyAndRender('fill', new Pattern({ source: img, repeat: 'repeat' }))
      })
      img.src = reader.result
    })
    reader.readAsDataURL(file)
  })

  strokeInput.addEventListener('input', () => applyAndRender('stroke', strokeInput.value))
  strokeWidthInput.addEventListener('input', () =>
    applyAndRender('strokeWidth', Number(strokeWidthInput.value) || 0),
  )
  opacityInput.addEventListener('input', () => applyAndRender('opacity', Number(opacityInput.value) / 100))
  angleInput.addEventListener('input', () => {
    const active = canvas.getActiveObject()
    if (!active) return
    active.rotate(Number(angleInput.value) || 0)
    canvas.requestRenderAll()
  })
  fontSizeInput.addEventListener('input', () => applyAndRender('fontSize', Number(fontSizeInput.value) || 1))
  fontFamilySelect.addEventListener('change', () => applyAndRender('fontFamily', fontFamilySelect.value))

  function applySize() {
    const active = canvas.getActiveObject()
    if (!active) return
    const unitToPx = UNIT_TO_PX[sizeUnitSelect.value]
    const widthPx = Number(widthInput.value) * unitToPx
    const heightPx = Number(heightInput.value) * unitToPx
    if (widthPx > 0 && active.width) active.set('scaleX', widthPx / active.width)
    if (heightPx > 0 && active.height) active.set('scaleY', heightPx / active.height)
    active.setCoords()
    canvas.requestRenderAll()
  }
  widthInput.addEventListener('input', applySize)
  heightInput.addEventListener('input', applySize)
  sizeUnitSelect.addEventListener('change', refresh)

  function applyShadow() {
    const active = canvas.getActiveObject()
    if (!active) return
    if (!shadowEnabledInput.checked) {
      applyAndRender('shadow', null)
      return
    }
    applyAndRender(
      'shadow',
      new Shadow({
        color: shadowColorInput.value,
        blur: Number(shadowBlurInput.value) || 0,
        offsetX: Number(shadowOffsetXInput.value) || 0,
        offsetY: Number(shadowOffsetYInput.value) || 0,
      }),
    )
  }
  shadowEnabledInput.addEventListener('change', () => {
    shadowGroup.classList.toggle('hidden', !shadowEnabledInput.checked)
    applyShadow()
  })
  shadowColorInput.addEventListener('input', applyShadow)
  shadowBlurInput.addEventListener('input', applyShadow)
  shadowOffsetXInput.addEventListener('input', applyShadow)
  shadowOffsetYInput.addEventListener('input', applyShadow)

  canvas.on('selection:created', refresh)
  canvas.on('selection:updated', refresh)
  canvas.on('selection:cleared', refresh)
  canvas.on('object:modified', refresh)

  refresh()

  return { refresh }
}
