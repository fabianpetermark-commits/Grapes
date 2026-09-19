import { Group, ActiveSelection, util } from 'fabric'

// Csoportosítás/szétválasztás. A Fabric v7-ben nincs többé
// `activeSelection.toGroup()`/`group.toActiveSelection()` kényelmi metódus,
// ezért a műveleteket explicit módon végezzük.
export function groupSelection(canvas) {
  const active = canvas.getActiveObject()
  if (!active || active.type !== 'activeselection') return

  const objects = active.getObjects()
  const canvasObjects = canvas.getObjects()
  const selectedIndices = objects.map((object) => canvasObjects.indexOf(object)).filter((index) => index >= 0)
  const groupIndex = selectedIndices.length
    ? Math.min(...selectedIndices)
    : canvasObjects.length

  canvas.remove(...objects)
  const group = new Group(objects)
  canvas.insertAt(groupIndex, group)
  canvas.setActiveObject(group)
  canvas.requestRenderAll()
}

export function ungroupSelection(canvas) {
  const active = canvas.getActiveObject()
  if (!active || active.type !== 'group') return

  // Minden gyermek végső canvas-transzformációját még a csoportban
  // rögzítjük. Így a csoport saját elforgatása, méretezése vagy skew-ja
  // után is ugyanott és ugyanazzal a transzformációval maradnak az elemek.
  const transforms = active.getObjects().map((object) => ({
    object,
    matrix: object.calcTransformMatrix(),
  }))

  const groupIndex = canvas.getObjects().indexOf(active)
  const items = active.removeAll()
  canvas.remove(active)

  transforms.forEach(({ object, matrix }) => {
    const transform = util.qrDecompose(matrix)

    object.set({
      originX: 'center',
      originY: 'center',
      left: transform.translateX,
      top: transform.translateY,
      scaleX: transform.scaleX,
      scaleY: transform.scaleY,
      angle: transform.angle,
      skewX: transform.skewX,
      skewY: transform.skewY,
    })
    object.setCoords()
  })

  canvas.insertAt(Math.max(0, groupIndex), ...items)
  canvas.setActiveObject(new ActiveSelection(items, { canvas }))
  canvas.requestRenderAll()
}
