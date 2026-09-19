import { Gradient, Pattern, Shadow } from 'fabric'
import { populateFontSelect } from '../fonts.js'

const SWATCH_COLORS = [
  { value: '#000000', name: 'Fekete' },
  { value: '#4b5563', name: 'Sötétszürke' },
  { value: '#9ca3af', name: 'Szürke' },
  { value: '#ffffff', name: 'Fehér' },
  { value: '#ef4444', name: 'Piros' },
  { value: '#f97316', name: 'Narancs' },
  { value: '#f59e0b', name: 'Borostyán' },
  { value: '#eab308', name: 'Sárga' },
  { value: '#84cc16', name: 'Lime' },
  { value: '#22c55e', name: 'Zöld' },
  { value: '#10b981', name: 'Smaragd' },
  { value: '#06b6d4', name: 'Türkiz' },
  { value: '#3b82f6', name: 'Kék' },
  { value: '#6366f1', name: 'Indigó' },
  { value: '#8b5cf6', name: 'Lila' },
  { value: '#ec4899', name: 'Rózsaszín' },
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

const TEXT_TYPES = new Set(['textbox', 'text', 'i-text'])

// A `<input type="color">` csak `#rrggbb`-t fogad el. A korábbi változat
// minden más formátumra feketét adott vissza, így az SVG- és HTML-importból
// érkező objektumok (ezek `rgb(...)` sztringet hordoznak) mindig feketének
// látszottak a panelen, függetlenül a tényleges színüktől.
function toHex(value) {
  if (typeof value !== 'string' || value.length === 0) return '#000000'

  const trimmed = value.trim()

  if (trimmed.startsWith('#')) {
    if (trimmed.length === 7) return trimmed.toLowerCase()
    // #rgb -> #rrggbb
    if (trimmed.length === 4) {
      const [, r, g, b] = trimmed
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
    }
    // #rrggbbaa -> az alfát a színmező nem tudja megjeleníteni
    if (trimmed.length === 9) return trimmed.slice(0, 7).toLowerCase()
    return '#000000'
  }

  const channels = trimmed.match(/^rgba?\(([^)]+)\)$/i)
  if (channels) {
    const parts = channels[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3)
    if (parts.length === 3) {
      const hex = parts
        .map((part) => {
          const numeric = part.endsWith('%')
            ? Math.round((Number.parseFloat(part) / 100) * 255)
            : Number.parseInt(part, 10)
          return Math.max(0, Math.min(255, numeric || 0))
            .toString(16)
            .padStart(2, '0')
        })
        .join('')
      return `#${hex}`
    }
  }

  // Elnevezett szín (pl. "red"): a böngészővel számoltatjuk ki.
  const probe = document.createElement('canvas').getContext('2d')
  probe.fillStyle = '#000000'
  probe.fillStyle = trimmed
  const resolved = probe.fillStyle
  return typeof resolved === 'string' && resolved.startsWith('#') ? resolved.toLowerCase() : '#000000'
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

export function initPropertiesPanel(canvas, history) {
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
  SWATCH_COLORS.forEach(({ value, name }) => {
    const swatch = document.createElement('button')
    swatch.type = 'button'
    swatch.className = 'swatch'
    // Korábban a gomb egyetlen "neve" a nyers hexkód volt a title-ben.
    swatch.setAttribute('aria-label', `Kitöltés: ${name}`)
    swatch.title = name
    swatch.style.background = value
    swatch.addEventListener('click', () => {
      fillInput.value = value
      applyAndRender('fill', value)
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

    // Az SVG-importból `text`/`i-text` típusú objektumok jönnek, nem
    // `textbox` — korábban ezeknél a betűtípus-vezérlők rejtve maradtak.
    const isText = TEXT_TYPES.has(active.type)
    fontGroup.classList.toggle('hidden', !isText)
    if (isText) {
      fontSizeInput.value = active.fontSize ?? 28
      fontFamilySelect.value = active.fontFamily || 'Arial'
    }

    const unitToPx = UNIT_TO_PX[sizeUnitSelect.value]
    widthInput.value = (active.getScaledWidth() / unitToPx).toFixed(2)
    heightInput.value = (active.getScaledHeight() / unitToPx).toFixed(2)
  }

  // Több elem kijelölésekor a Fabric egy ActiveSelection burkolót ad vissza.
  // A stílus-property-ket korábban erre a burkolóra írtuk, így a kitöltés,
  // a körvonal és az árnyék nem jutott el a tagokig.
  function targetsOf(active) {
    return active.type === 'activeselection' && typeof active.getObjects === 'function'
      ? active.getObjects()
      : [active]
  }

  function applyAndRender(property, value, { debounceHistory = false } = {}) {
    const active = canvas.getActiveObject()
    if (!active) return
    for (const target of targetsOf(active)) {
      target.set(property, value)
    }
    canvas.requestRenderAll()
    if (debounceHistory) history?.recordDebounced()
    else history?.record()
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
      applyAndRender('fill', buildGradient(active, gradientTypeSelect.value, gradientFromInput.value, gradientToInput.value), { debounceHistory })
    }
    // A 'pattern' mód a fájl-feltöltésre vár, addig a korábbi fill marad.
  })

  fillInput.addEventListener('input', () => applyAndRender('fill', fillInput.value, { debounceHistory: true }))

  function applyGradientFromInputs(debounceHistory = false) {
    const active = canvas.getActiveObject()
    if (!active) return
    applyAndRender('fill', buildGradient(active, gradientTypeSelect.value, gradientFromInput.value, gradientToInput.value))
  }
  gradientTypeSelect.addEventListener('change', applyGradientFromInputs)
  gradientFromInput.addEventListener('input', () => applyGradientFromInputs(true))
  gradientToInput.addEventListener('input', () => applyGradientFromInputs(true))

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

  strokeInput.addEventListener('input', () => applyAndRender('stroke', strokeInput.value, { debounceHistory: true }))
  // A számmezők `change`-re alkalmaznak, nem minden leütésre — gépelés
  // közben a részleges érték (pl. "4" a "40"-ből) nem ugrasztja az elemet.
  strokeWidthInput.addEventListener('change', () =>
    applyAndRender('strokeWidth', Number(strokeWidthInput.value) || 0),
  )
  opacityInput.addEventListener('input', () => applyAndRender('opacity', Number(opacityInput.value) / 100, { debounceHistory: true }))
  angleInput.addEventListener('change', () => {
    const active = canvas.getActiveObject()
    if (!active) return
    const angle = Number(angleInput.value)
    if (!Number.isFinite(angle)) return
    for (const target of targetsOf(active)) {
      target.set('angle', angle)
      target.setCoords()
    }
    canvas.requestRenderAll()
    history?.record()
  })
  fontSizeInput.addEventListener('change', () => applyAndRender('fontSize', Number(fontSizeInput.value) || 1))
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
    history?.record()
  }
  // A méretmezők korábban `input`-ra alkalmaztak: az "500" beírása 5px-re,
  // majd 50px-re, végül 500px-re méretezte az elemet, és egy mező közbeni
  // kiürítése is torzított. A `change` (fókuszvesztés / Enter) a helyes
  // pillanat, Enterre azonnali visszajelzéssel.
  for (const input of [widthInput, heightInput]) {
    input.addEventListener('change', applySize)
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') applySize()
    })
  }
  sizeUnitSelect.addEventListener('change', refresh)

  function applyShadow(debounceHistory = false) {
    const active = canvas.getActiveObject()
    if (!active) return
    if (!shadowEnabledInput.checked) {
      applyAndRender('shadow', null, { debounceHistory })
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
      { debounceHistory },
    )
  }
  shadowEnabledInput.addEventListener('change', () => {
    shadowGroup.classList.toggle('hidden', !shadowEnabledInput.checked)
    applyShadow()
  })
  shadowColorInput.addEventListener('input', () => applyShadow(true))
  shadowBlurInput.addEventListener('input', () => applyShadow(true))
  shadowOffsetXInput.addEventListener('input', () => applyShadow(true))
  shadowOffsetYInput.addEventListener('input', () => applyShadow(true))

  canvas.on('selection:created', refresh)
  canvas.on('selection:updated', refresh)
  canvas.on('selection:cleared', refresh)
  canvas.on('object:modified', refresh)

  refresh()

  return { refresh }
}
