import * as THREE from 'three'

export function extrudeElement(element, distance) {
  if (!element?.mesh || !Number.isFinite(distance) || distance === 0) {
    return { ok: false, message: 'Érvénytelen kihúzási érték.' }
  }

  if (!['box', 'cylinder'].includes(element.type)) {
    return {
      ok: false,
      message: 'A kihúzás jelenleg kockán és hengeren támogatott.',
    }
  }

  const current = element.dimensions
  const nextHeight = current.y + distance
  if (nextHeight <= 0.1) {
    return {
      ok: false,
      message: 'A kihúzás nem csökkentheti 0,1 mm alá a magasságot.',
    }
  }

  const nextDimensions = {
    x: current.x,
    y: nextHeight,
    z: current.z,
  }

  const geometry = element.type === 'cylinder'
    ? new THREE.CylinderGeometry(nextDimensions.x / 2, nextDimensions.x / 2, nextDimensions.y, 32)
    : new THREE.BoxGeometry(nextDimensions.x, nextDimensions.y, nextDimensions.z)

  const oldGeometry = element.mesh.geometry
  element.mesh.geometry = geometry
  oldGeometry.dispose()

  const localOffset = new THREE.Vector3(0, distance / 2, 0)
  localOffset.applyQuaternion(element.mesh.quaternion)
  element.mesh.position.add(localOffset)
  element.mesh.updateMatrixWorld(true)

  return {
    ok: true,
    baseDimensions: { ...nextDimensions },
    dimensions: { ...nextDimensions },
    message: `Kihúzás alkalmazva: ${distance > 0 ? '+' : ''}${distance.toFixed(1)} mm.`,
  }
}


export function cutTopElement(element, distance) {
  if (!element?.mesh || !Number.isFinite(distance) || distance <= 0) return { ok: false, message: 'Adj meg pozitív vágási magasságot.' }
  if (!['box', 'cylinder'].includes(element.type)) return { ok: false, message: 'A vágás jelenleg kockán és hengeren támogatott.' }
  const current = element.dimensions
  const nextHeight = current.y - distance
  if (nextHeight <= 0.1) return { ok: false, message: 'A vágás után legalább 0,1 mm magasságnak maradnia kell.' }
  const nextDimensions = { x: current.x, y: nextHeight, z: current.z }
  const geometry = element.type === 'cylinder' ? new THREE.CylinderGeometry(nextDimensions.x / 2, nextDimensions.x / 2, nextDimensions.y, 32) : new THREE.BoxGeometry(nextDimensions.x, nextDimensions.y, nextDimensions.z)
  const oldGeometry = element.mesh.geometry
  element.mesh.geometry = geometry
  oldGeometry.dispose()
  const localOffset = new THREE.Vector3(0, -distance / 2, 0)
  localOffset.applyQuaternion(element.mesh.quaternion)
  element.mesh.position.add(localOffset)
  element.mesh.updateMatrixWorld(true)
  return { ok: true, baseDimensions: { ...nextDimensions }, dimensions: { ...nextDimensions }, message: `Vágás alkalmazva: -${distance.toFixed(1)} mm.` }
}
