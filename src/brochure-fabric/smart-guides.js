// "Okos" igazítási segédvonalak: húzás közben a mozgatott objektum szélei/
// közepe a canvason lévő MÁSIK objektumok széleihez/közepéhez igazodik, ha
// egy küszöbértéken belül van (mint a Figma/Canva "snap to object" funkciója)
// — ez a rács-igazítás (snap-to-grid) kiegészítése, nem lecserélése.
const SNAP_THRESHOLD = 6

function getEdges(object) {
  const left = object.left
  const top = object.top
  const width = object.getScaledWidth()
  const height = object.getScaledHeight()
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  }
}

export function snapToNearbyObjects(canvas, moving) {
  const movingEdges = getEdges(moving)
  let snappedLeft = null
  let snappedTop = null

  for (const other of canvas.getObjects()) {
    if (other === moving) continue
    const edges = getEdges(other)

    if (snappedLeft === null) {
      for (const [a, b] of [
        [movingEdges.left, edges.left],
        [movingEdges.left, edges.right],
        [movingEdges.right, edges.left],
        [movingEdges.right, edges.right],
        [movingEdges.centerX, edges.centerX],
      ]) {
        if (Math.abs(a - b) <= SNAP_THRESHOLD) {
          snappedLeft = moving.left + (b - a)
          break
        }
      }
    }

    if (snappedTop === null) {
      for (const [a, b] of [
        [movingEdges.top, edges.top],
        [movingEdges.top, edges.bottom],
        [movingEdges.bottom, edges.top],
        [movingEdges.bottom, edges.bottom],
        [movingEdges.centerY, edges.centerY],
      ]) {
        if (Math.abs(a - b) <= SNAP_THRESHOLD) {
          snappedTop = moving.top + (b - a)
          break
        }
      }
    }

    if (snappedLeft !== null && snappedTop !== null) break
  }

  return { left: snappedLeft, top: snappedTop }
}
