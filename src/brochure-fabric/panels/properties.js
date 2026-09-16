// Tulajdonságok panel: a kijelölt Fabric objektum stílus-property-jeit
// szerkeszti (fill/stroke/stroke-width/opacity/betűméret). Ez váltja a
// GrapesJS-es "shape-style" StyleManager sectort.

function toHex(value) {
  if (!value || typeof value !== 'string' || !value.startsWith('#')) {
    return '#000000'
  }
  return value.length === 7 ? value : '#000000'
}

export function initPropertiesPanel(canvas) {
  const emptyEl = document.querySelector('#fabric-properties-empty')
  const fieldsEl = document.querySelector('#fabric-properties-fields')
  const fillInput = document.querySelector('#fabric-prop-fill')
  const strokeInput = document.querySelector('#fabric-prop-stroke')
  const strokeWidthInput = document.querySelector('#fabric-prop-stroke-width')
  const opacityInput = document.querySelector('#fabric-prop-opacity')
  const fontGroup = document.querySelector('#fabric-prop-font-group')
  const fontSizeInput = document.querySelector('#fabric-prop-font-size')

  function refresh() {
    const active = canvas.getActiveObject()
    if (!active) {
      emptyEl.classList.remove('hidden')
      fieldsEl.classList.add('hidden')
      return
    }
    emptyEl.classList.add('hidden')
    fieldsEl.classList.remove('hidden')

    fillInput.value = toHex(active.fill)
    strokeInput.value = toHex(active.stroke)
    strokeWidthInput.value = active.strokeWidth ?? 0
    opacityInput.value = Math.round((active.opacity ?? 1) * 100)

    const isText = active.type === 'textbox'
    fontGroup.classList.toggle('hidden', !isText)
    if (isText) {
      fontSizeInput.value = active.fontSize ?? 28
    }
  }

  function applyAndRender(property, value) {
    const active = canvas.getActiveObject()
    if (!active) return
    active.set(property, value)
    canvas.requestRenderAll()
  }

  fillInput.addEventListener('input', () => applyAndRender('fill', fillInput.value))
  strokeInput.addEventListener('input', () => applyAndRender('stroke', strokeInput.value))
  strokeWidthInput.addEventListener('input', () =>
    applyAndRender('strokeWidth', Number(strokeWidthInput.value) || 0),
  )
  opacityInput.addEventListener('input', () => applyAndRender('opacity', Number(opacityInput.value) / 100))
  fontSizeInput.addEventListener('input', () => applyAndRender('fontSize', Number(fontSizeInput.value) || 1))

  canvas.on('selection:created', refresh)
  canvas.on('selection:updated', refresh)
  canvas.on('selection:cleared', refresh)
  canvas.on('object:modified', refresh)

  refresh()

  return { refresh }
}
