import { Group, ActiveSelection, Point, util } from 'fabric'

// Csoportosítás/szétválasztás. A Fabric v7-ben nincs többé
// `activeSelection.toGroup()`/`group.toActiveSelection()` kényelmi metódus
// (a korábbi Fabric-verziókkal ellentétben) — manuálisan kell a kijelölt
// objektumokat egy Group-ba tenni (és a Group `removeAll()`-ja állítja
// vissza a gyerekek abszolút koordinátáit szétválasztáskor).
export function groupSelection(canvas) {
  const active = canvas.getActiveObject()
  if (!active || active.type !== 'activeselection') return

  const objects = active.getObjects()
  canvas.remove(...objects)
  const group = new Group(objects)
  canvas.add(group)
  canvas.setActiveObject(group)
  canvas.requestRenderAll()
}

export function ungroupSelection(canvas) {
  const active = canvas.getActiveObject()
  if (!active || active.type !== 'group') return

  // A Group `removeAll()`-ja a csoport-BELSŐ (a csoport középpontjához
  // viszonyított) koordinátákkal adja vissza az elemeket, nem a canvas
  // abszolút koordinátáival — ezért előbb, még csoporttagként, a csoport
  // teljes transzformációs mátrixával (`calcTransformMatrix()`) átszámoljuk
  // mindegyik elem bal-felső sarkát abszolút canvas-koordinátára, és
  // szétválasztás után ezt állítjuk vissza, különben az elemek elugranának
  // a helyükről. (Egyszerűsítés: ha magát a csoportot elforgattuk/
  // átméreteztük szétválasztás előtt, az elemek saját szöge/mérete nem
  // frissül ehhez képest — ez a gyakori, nem elforgatott csoport esetét
  // fedi le helyesen.)
  const groupMatrix = active.calcTransformMatrix()
  const objects = active.getObjects()
  const absolutePositions = objects.map((object) => {
    const point = util.transformPoint(new Point(object.left, object.top), groupMatrix)
    return { left: point.x, top: point.y }
  })

  const items = active.removeAll()
  canvas.remove(active)
  items.forEach((object, index) => {
    object.set(absolutePositions[index])
    object.setCoords()
  })
  canvas.add(...items)
  canvas.setActiveObject(new ActiveSelection(items, { canvas }))
  canvas.requestRenderAll()
}
