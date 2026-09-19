import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { export3MF, import3MF } from './studio-3mf.js'
import './styles/screens/studio.css'
import { create, el } from './ui/dom.js'
import { notify, notifyError, notifySuccess } from './ui/toast.js'

let scene, camera, renderer, controls, transformControls
let elements = []
let selectedId = null
let selectedIds = new Set()
let isWireframe = false
let initialized = false
let animationHandle = null
let history = []
let historyIndex = -1
let historyBusy = false
let transformHistorySnapshot = null
let transformPivot = null
let snapEnabled = true
let snapSize = 5
let buildPlate = null
let buildPlateGrid = null
let buildPlateSize = 220
const BUILD_PLATE_SIZES = [180, 220, 256, 300, 320, 400]

const SHAPE_DEFAULTS = {
  box: { label: 'Kocka', icon: 'cube', color: '#7c9cbf' },
  cylinder: { label: 'Henger', icon: 'rect', color: '#6b8fb5' },
  sphere: { label: 'Gömb', icon: 'circle', color: '#8fa9c7' },
  cone: { label: 'Kúp', icon: 'triangle', color: '#8da7c5' },
  pyramid: { label: 'Gúla', icon: 'triangle', color: '#a08fbe' },
}

function createGeometry(type, dimensions) {
  const { x, y, z } = dimensions
  if (type === 'cylinder') return new THREE.CylinderGeometry(x / 2, x / 2, y, 32)
  if (type === 'sphere') return new THREE.SphereGeometry(x / 2, 32, 24)
  if (type === 'cone') return new THREE.ConeGeometry(x / 2, y, 32)
  if (type === 'pyramid') return new THREE.ConeGeometry(x / 2, y, 4)
  return new THREE.BoxGeometry(x, y, z)
}

function dimensionsFromSize(type, size) {
  return { x: size, y: size, z: size }
}

function setInputValue(selector, value) {
  const input = document.querySelector(selector)
  if (input) input.value = String(value)
}

function refreshTransformInputs(element) {
  if (selectedId !== element.id) return

  setInputValue('#studio-pos-x', element.position.x.toFixed(1))
  setInputValue('#studio-pos-y', element.position.y.toFixed(1))
  setInputValue('#studio-pos-z', element.position.z.toFixed(1))
  setInputValue('#studio-rot-x', THREE.MathUtils.radToDeg(element.rotation.x).toFixed(1))
  setInputValue('#studio-rot-y', THREE.MathUtils.radToDeg(element.rotation.y).toFixed(1))
  setInputValue('#studio-rot-z', THREE.MathUtils.radToDeg(element.rotation.z).toFixed(1))
  setInputValue('#studio-dim-x', element.dimensions.x.toFixed(1))
  setInputValue('#studio-dim-y', element.dimensions.y.toFixed(1))
  setInputValue('#studio-dim-z', element.dimensions.z.toFixed(1))
}

function syncElementState(element) {
  const { mesh } = element
  element.position = mesh.position.clone()
  element.rotation = mesh.rotation.clone()
  element.scale = mesh.scale.clone()
  element.dimensions = {
    x: element.baseDimensions.x * mesh.scale.x,
    y: element.baseDimensions.y * mesh.scale.y,
    z: element.baseDimensions.z * mesh.scale.z,
  }
  refreshTransformInputs(element)
  renderSelectedModelInfo()
}

function captureSceneState() {
  return elements.map((element) => ({
    id: element.id,
    groupId: element.groupId ?? null,
    type: element.type,
    size: element.size,
    color: element.color,
    baseDimensions: { ...element.baseDimensions },
    position: {
      x: element.mesh.position.x,
      y: element.mesh.position.y,
      z: element.mesh.position.z,
    },
    rotation: {
      x: element.mesh.rotation.x,
      y: element.mesh.rotation.y,
      z: element.mesh.rotation.z,
    },
    scale: {
      x: element.mesh.scale.x,
      y: element.mesh.scale.y,
      z: element.mesh.scale.z,
    },
    ...(element.type === 'stl'
      ? { geometry: Array.from(element.mesh.geometry.attributes.position.array) }
      : {}),
  }))
}

function renderSelectedModelInfo() {
  const info = el('#studio-model-info')
  const status = el('#studio-model-status')
  if (!info || !status) return

  if (!selectedIds.size) {
    info.textContent = 'Nincs kijelölt modell.'
    status.textContent = '—'
    status.removeAttribute('data-state')
    return
  }

  const selected = elements.filter((element) => selectedIds.has(element.id))
  const bounds = getSelectedBounds()
  const plateHalf = buildPlateSize / 2
  const epsilon = 0.1
  const triangleCount = selected.reduce((sum, element) => {
    if (element.type !== 'stl') return sum
    const position = element.mesh.geometry.attributes.position
    return sum + (position ? Math.floor(position.count / 3) : 0)
  }, 0)

  const dimensions = bounds.getSize(new THREE.Vector3())
  const dimensionText = dimensions.x.toFixed(1) + ' × ' + dimensions.y.toFixed(1) + ' × ' + dimensions.z.toFixed(1) + ' mm'
  const infoParts = ['Befoglaló méret: ' + dimensionText]
  if (selected.length === 1 && selected[0].type === 'stl') {
    infoParts.push('Fájl: ' + selected[0].name)
    infoParts.push('Háromszögek: ' + triangleCount.toLocaleString('hu-HU'))
    infoParts.push('STL-egység: mm')
  }
  if (selected.length > 1) infoParts.push('Kijelölve: ' + selected.length + ' elem')
  info.textContent = infoParts.join(' · ')

  const overX = bounds.min.x < -plateHalf - epsilon || bounds.max.x > plateHalf + epsilon
  const overZ = bounds.min.z < -plateHalf - epsilon || bounds.max.z > plateHalf + epsilon
  const belowPlate = bounds.min.y < -epsilon
  const abovePlate = bounds.min.y > epsilon

  if (overX || overZ) {
    status.textContent = 'Lelóg az asztalról'
    status.dataset.state = 'warning'
  } else if (belowPlate) {
    status.textContent = 'Beleér az asztalba'
    status.dataset.state = 'warning'
  } else if (abovePlate) {
    status.textContent = 'Lebeg az asztal felett'
    status.dataset.state = 'warning'
  } else {
    status.textContent = 'Nyomtatható pozíció'
    status.dataset.state = 'ok'
  }
}

function updateHistoryUI() {
  const undoButton = document.querySelector('#studio-undo')
  const redoButton = document.querySelector('#studio-redo')
  if (undoButton) undoButton.disabled = historyIndex <= 0
  if (redoButton) redoButton.disabled = historyIndex >= history.length - 1
}

function recordHistory() {
  if (historyBusy) return
  const snapshot = captureSceneState()
  const serialized = JSON.stringify(snapshot)
  if (historyIndex >= 0 && JSON.stringify(history[historyIndex]) === serialized) return
  history = history.slice(0, historyIndex + 1)
  history.push(snapshot)
  if (history.length > 50) history.shift()
  historyIndex = history.length - 1
  updateHistoryUI()
}

function createElementFromState(state) {
  let geometry = createGeometry(state.type, state.baseDimensions)
  if (state.type === 'stl' && state.geometry?.length) {
    geometry.dispose()
    geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(state.geometry, 3))
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
  }
  const material = new THREE.MeshStandardMaterial({
    color: state.color,
    roughness: 0.35,
    metalness: 0.4,
    wireframe: isWireframe,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.elementId = state.id
  mesh.position.set(state.position.x, state.position.y, state.position.z)
  mesh.rotation.set(state.rotation.x, state.rotation.y, state.rotation.z)
  mesh.scale.set(state.scale.x, state.scale.y, state.scale.z)
  scene.add(mesh)
  return {
    ...state,
    groupId: state.groupId ?? null,
    baseDimensions: { ...state.baseDimensions },
    position: mesh.position.clone(),
    rotation: mesh.rotation.clone(),
    scale: mesh.scale.clone(),
    dimensions: {
      x: state.baseDimensions.x * state.scale.x,
      y: state.baseDimensions.y * state.scale.y,
      z: state.baseDimensions.z * state.scale.z,
    },
    mesh,
  }
}

function disposeElementMesh(element) {
  scene.remove(element.mesh)
  element.mesh.geometry.dispose()
  element.mesh.material.dispose()
}

function restoreHistory(index) {
  if (index < 0 || index >= history.length) return
  historyBusy = true
  detachTransformTarget()
  transformControls.detach()
  elements.forEach(disposeElementMesh)
  elements = history[index].map(createElementFromState)
  historyIndex = index
  selectedId = elements[0]?.id ?? null
  selectedIds = selectedId ? new Set(getGroupMemberIds(selectedId)) : new Set()
  if (selectedId) {
    const selected = elements.find((element) => element.id === selectedId)
    attachTransformTarget()
    syncElementState(selected)
    el('#studio-selected-props').classList.remove('hidden')
    el('#studio-param-size').value = selected.size
    el('#studio-val-size').textContent = `${selected.size} mm`
    el('#studio-param-color').value = selected.color
  } else {
    el('#studio-selected-props').classList.add('hidden')
  }
  renderElementList()
  updateHistoryUI()
  historyBusy = false
}

function undoStudio() {
  if (historyIndex <= 0) return
  restoreHistory(historyIndex - 1)
}

function redoStudio() {
  if (historyIndex >= history.length - 1) return
  restoreHistory(historyIndex + 1)
}

function applyNumericTransform(axis, value) {
  const element = elements.find((item) => item.id === selectedId)
  if (!element || !Number.isFinite(value)) return

  if (axis.startsWith('pos-')) {
    element.mesh.position[axis.slice(4)] = value
  } else if (axis.startsWith('rot-')) {
    element.mesh.rotation[axis.slice(4)] = THREE.MathUtils.degToRad(value)
  } else if (axis.startsWith('dim-')) {
    const dimensionAxis = axis.slice(4)
    const base = element.baseDimensions[dimensionAxis]
    if (!Number.isFinite(base) || base <= 0 || value <= 0) return
    element.mesh.scale[dimensionAxis] = value / base
  }

  element.mesh.updateMatrixWorld(true)
  syncElementState(element)
  recordHistory()
}

// A korábbi, csak ezen a képernyőn létező #toast elem helyett a közös
// értesítő réteget használjuk (aria-live régióval).
const showToast = (message) => notify(message)

function addImportedMesh(geometry, name = 'STL modell') {
  if (!geometry?.attributes?.position) {
    notifyError('Az STL fájl nem tartalmaz érvényes geometriát.')
    return
  }

  geometry.computeVertexNormals()
  geometry.computeBoundingBox()

  const box = geometry.boundingBox
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDimension = Math.max(size.x, size.y, size.z)

  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    geometry.dispose()
    notifyError('Az STL geometria mérete nem értelmezhető.')
    return
  }

  const material = new THREE.MeshStandardMaterial({
    color: '#7c9cbf',
    roughness: 0.35,
    metalness: 0.4,
    wireframe: isWireframe,
  })
  const mesh = new THREE.Mesh(geometry, material)

  // Az STL koordinátáit középre tesszük, majd a modell alját a build plate fölé helyezzük.
  mesh.geometry.translate(-center.x, -center.y, -center.z)
  mesh.position.set(0, size.y / 2, 0)
  mesh.userData.elementId = createElementId()

  const id = mesh.userData.elementId
  const baseDimensions = { x: size.x, y: size.y, z: size.z }

  scene.add(mesh)
  elements.push({
    id,
    groupId: null,
    type: 'stl',
    name,
    size: maxDimension,
    color: '#7c9cbf',
    baseDimensions,
    position: mesh.position.clone(),
    rotation: mesh.rotation.clone(),
    scale: mesh.scale.clone(),
    dimensions: { ...baseDimensions },
    mesh,
  })

  renderElementList()
  selectElement(id)
  recordHistory()
  notifySuccess(`STL betöltve: ${name}`)
}

async function importSTLFile(file) {
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.stl')) {
    notifyError('Csak .stl fájl importálható.')
    return
  }

  try {
    const buffer = await file.arrayBuffer()
    const loader = new STLLoader()
    const geometry = loader.parse(buffer)
    addImportedMesh(geometry, file.name)
  } catch (error) {
    console.error('STL import failed', error)
    notifyError('Az STL fájl beolvasása nem sikerült.')
  }
}

function ensurePrimitivePalette() {
  const palette = document.querySelector('#studio-add-box')?.parentElement
  if (!palette) return

  for (const type of ['cone', 'pyramid']) {
    if (document.querySelector(`#studio-add-${type}`)) continue

    const defaults = SHAPE_DEFAULTS[type]
    const button = create('button', {
      id: `studio-add-${type}`,
      class: 'palette__item',
      type: 'button',
      title: `${defaults.label} hozzáadása`,
    }, [defaults.label])

    palette.append(button)
  }
}

function addElement(type) {
  const defaults = SHAPE_DEFAULTS[type]
  const size = 60
  const id = `el-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const dimensions = dimensionsFromSize(type, size)
  const geometry = createGeometry(type, dimensions)
  const material = new THREE.MeshStandardMaterial({
    color: defaults.color,
    roughness: 0.35,
    metalness: 0.4,
    wireframe: isWireframe,
  })
  const mesh = new THREE.Mesh(geometry, material)
  const offset = elements.length * 20
  mesh.position.set(offset, size / 2, offset)
  mesh.userData.elementId = id
  scene.add(mesh)

  elements.push({
    id,
    groupId: null,
    type,
    size,
    color: defaults.color,
    baseDimensions: dimensions,
    position: mesh.position.clone(),
    rotation: mesh.rotation.clone(),
    scale: mesh.scale.clone(),
    dimensions: { ...dimensions },
    mesh,
  })
  renderElementList()
  selectElement(id)
  recordHistory()
}

function removeElement(id) {
  const index = elements.findIndex((element) => element.id === id)
  if (index === -1) return
  const [element] = elements.splice(index, 1)
  selectedIds.delete(id)
  if (selectedId === id) {
    selectedId = [...selectedIds][0] ?? null
    transformControls.detach()
    if (selectedId) selectElement(selectedId)
    else document.querySelector('#studio-selected-props').classList.add('hidden')
  }
  updateSelectionVisuals()
  scene.remove(element.mesh)
  element.mesh.geometry.dispose()
  element.mesh.material.dispose()
  renderElementList()
  recordHistory()
}

function updateSelectionVisuals() {
  for (const element of elements) {
    element.mesh.material.emissive.set(selectedIds.has(element.id) ? 0x335577 : 0x000000)
    element.mesh.material.emissiveIntensity = selectedIds.has(element.id) ? 0.45 : 0
  }
}

function getGroupMemberIds(id) {
  const element = elements.find((item) => item.id === id)
  if (!element?.groupId) return [id]
  return elements.filter((item) => item.groupId === element.groupId).map((item) => item.id)
}

function detachTransformTarget() {
  if (!transformPivot) return

  for (const element of elements) {
    if (transformPivot.children.includes(element.mesh)) {
      scene.attach(element.mesh)
      syncElementState(element)
    }
  }
  scene.remove(transformPivot)
  transformPivot = null
}

function attachTransformTarget() {
  detachTransformTarget()
  if (!selectedId) {
    transformControls.detach()
    return
  }

  if (selectedIds.size <= 1) {
    const primary = elements.find((item) => item.id === selectedId)
    if (primary) transformControls.attach(primary.mesh)
    return
  }

  const selected = elements.filter((element) => selectedIds.has(element.id))
  if (!selected.length) return

  const bounds = new THREE.Box3()
  selected.forEach((element) => bounds.expandByObject(element.mesh))
  const center = bounds.getCenter(new THREE.Vector3())

  transformPivot = new THREE.Group()
  transformPivot.position.copy(center)
  scene.add(transformPivot)

  selected.forEach((element) => transformPivot.attach(element.mesh))
  transformPivot.updateMatrixWorld(true)
  transformControls.attach(transformPivot)
}

function syncSelectedTransformInputs() {
  if (!selectedId) return
  const primary = elements.find((item) => item.id === selectedId)
  if (primary) syncElementState(primary)
}

function selectElement(id, { additive = false } = {}) {
  const element = elements.find((item) => item.id === id)
  if (!element) return

  const groupIds = new Set(getGroupMemberIds(id))

  if (additive) {
    const alreadySelected = groupIds.size > 0 && [...groupIds].every((memberId) => selectedIds.has(memberId))
    if (alreadySelected) {
      groupIds.forEach((memberId) => selectedIds.delete(memberId))
    } else {
      groupIds.forEach((memberId) => selectedIds.add(memberId))
      selectedId = id
    }
  } else {
    selectedIds = new Set(groupIds)
    selectedId = id
  }

  if (!selectedIds.size) {
    selectedId = null
    transformControls.detach()
  } else {
    if (!selectedIds.has(selectedId)) selectedId = [...selectedIds][0]
    attachTransformTarget()
    syncSelectedTransformInputs()
    el('#studio-selected-props').classList.remove('hidden')
    const primary = elements.find((item) => item.id === selectedId)
    if (primary) {
      el('#studio-param-size').value = primary.size
      el('#studio-val-size').textContent = `${primary.size} mm`
      el('#studio-param-color').value = primary.color
      refreshTransformInputs(primary)
    }
  }

  updateSelectionVisuals()
  renderElementList()
}

function selectElements(ids) {
  const validIds = ids.filter((id) => elements.some((element) => element.id === id))
  selectedIds = new Set(validIds)
  selectedId = validIds[0] ?? null
  if (selectedId) {
    attachTransformTarget()
    syncSelectedTransformInputs()
    el('#studio-selected-props').classList.remove('hidden')
    const primary = elements.find((item) => item.id === selectedId)
    if (primary) {
      el('#studio-param-size').value = primary.size
      el('#studio-val-size').textContent = `${primary.size} mm`
      el('#studio-param-color').value = primary.color
      refreshTransformInputs(primary)
    }
  } else {
    transformControls.detach()
    el('#studio-selected-props').classList.add('hidden')
  }
  updateSelectionVisuals()
  renderElementList()
}

function deselect() {
  if (selectedId === null && selectedIds.size === 0) return
  detachTransformTarget()
  transformControls.detach()
  selectedId = null
  selectedIds.clear()
  transformControls.detach()
  el('#studio-selected-props').classList.add('hidden')
  updateSelectionVisuals()
  renderElementList()
}

function createElementId() {
  return `el-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
}

function createGroupId() {
  return `group-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
}

function groupSelection() {
  if (selectedIds.size < 2) {
    notify('Jelölj ki legalább két elemet a csoportosításhoz.')
    return
  }

  const groupId = createGroupId()
  elements.forEach((element) => {
    if (selectedIds.has(element.id)) element.groupId = groupId
  })
  selectElements([...selectedIds])
  recordHistory()
  notifySuccess('Az elemek csoportba kerültek.')
}

function ungroupSelection() {
  const groupIds = new Set(
    elements
      .filter((element) => selectedIds.has(element.id) && element.groupId)
      .map((element) => element.groupId),
  )

  if (!groupIds.size) {
    notify('A kijelölt elemek nem tartoznak csoporthoz.')
    return
  }

  elements.forEach((element) => {
    if (element.groupId && groupIds.has(element.groupId)) element.groupId = null
  })
  selectElements([...selectedIds])
  recordHistory()
  notifySuccess('A csoport felbontva.')
}


function getSelectedTransformUnits() {
  const units = []
  const seenGroups = new Set()

  for (const element of elements) {
    if (!selectedIds.has(element.id)) continue

    if (element.groupId) {
      if (seenGroups.has(element.groupId)) continue
      seenGroups.add(element.groupId)
      units.push(elements.filter((item) => item.groupId === element.groupId && selectedIds.has(item.id)))
    } else {
      units.push([element])
    }
  }

  return units
}

function getUnitBounds(unit) {
  const bounds = new THREE.Box3()
  unit.forEach((element) => bounds.expandByObject(element.mesh))
  return bounds
}

function moveUnit(unit, delta) {
  unit.forEach((element) => {
    element.mesh.position.add(delta)
    element.mesh.updateMatrixWorld(true)
    syncElementState(element)
  })
}

function alignSelected(axis, edge) {
  const units = getSelectedTransformUnits()
  if (units.length < 2) {
    notify('Az igazításhoz jelölj ki legalább két külön elemet vagy csoportot.')
    return
  }

  detachTransformTarget()
  transformControls.detach()

  const reference = getUnitBounds(units[0])
  const referenceValue = edge === 'min'
    ? reference.min[axis]
    : edge === 'max'
      ? reference.max[axis]
      : reference.getCenter(new THREE.Vector3())[axis]

  for (const unit of units.slice(1)) {
    const bounds = getUnitBounds(unit)
    const currentValue = edge === 'min'
      ? bounds.min[axis]
      : edge === 'max'
        ? bounds.max[axis]
        : bounds.getCenter(new THREE.Vector3())[axis]

    const delta = new THREE.Vector3()
    delta[axis] = referenceValue - currentValue
    moveUnit(unit, delta)
  }

  attachTransformTarget()
  updateSelectionVisuals()
  recordHistory()
  notifySuccess('Az elemek igazítva.')
}

function setSnapEnabled(enabled) {
  snapEnabled = enabled
  transformControls.setTranslationSnap(snapEnabled ? snapSize : null)
  const button = el('#studio-snap-toggle')
  if (button) {
    button.setAttribute('aria-pressed', String(snapEnabled))
    button.textContent = snapEnabled ? `Snap: ${snapSize} mm` : 'Snap: ki'
  }
}

function setSnapSize(value) {
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0) return
  snapSize = next
  transformControls.setTranslationSnap(snapEnabled ? snapSize : null)
  const button = el('#studio-snap-toggle')
  if (button && snapEnabled) button.textContent = `Snap: ${snapSize} mm`
}

function duplicateSelected() {
  if (!selectedIds.size) return
  const selected = elements.filter((element) => selectedIds.has(element.id))
  const sourceGroups = new Map()
  for (const element of selected) {
    if (element.groupId && !sourceGroups.has(element.groupId)) {
      sourceGroups.set(element.groupId, createGroupId())
    }
  }

  const duplicates = selected.map((element, index) => {
    const state = {
      id: createElementId(),
      groupId: element.groupId ? sourceGroups.get(element.groupId) : null,
      type: element.type,
      size: element.size,
      color: element.color,
      baseDimensions: { ...element.baseDimensions },
      position: {
        x: element.mesh.position.x + 20,
        y: element.mesh.position.y,
        z: element.mesh.position.z + 20 + index * 4,
      },
      rotation: {
        x: element.mesh.rotation.x,
        y: element.mesh.rotation.y,
        z: element.mesh.rotation.z,
      },
      scale: {
        x: element.mesh.scale.x,
        y: element.mesh.scale.y,
        z: element.mesh.scale.z,
      },
    }
    return createElementFromState(state)
  })
  elements.push(...duplicates)
  selectElements(duplicates.map((element) => element.id))
  recordHistory()
}

function renderElementList() {
  const list = el('#studio-element-list')
  list.replaceChildren()

  if (elements.length === 0) {
    list.append(
      create('p', {
        class: 'empty-state empty-state--inline',
        textContent: 'Nincs még elem. Adj hozzá egyet fent.',
      }),
    )
  }

  for (const element of elements) {
    const isSelected = selectedIds.has(element.id)
    const row = create('button', {
      type: 'button',
      class: `layer${isSelected ? ' is-active' : ''}`,
      'aria-pressed': String(isSelected),
      title: `${element.type === 'stl' ? element.name : SHAPE_DEFAULTS[element.type].label}${element.groupId ? ' · Csoport' : ''}`,
    })
    row.append(create('span', { class: 'layer__name', textContent: element.type === 'stl' ? element.name : SHAPE_DEFAULTS[element.type].label }))
    if (element.groupId) row.append(create('span', { class: 'studio__layer-badge', textContent: 'Csoport' }))
    row.addEventListener('click', (event) => selectElement(element.id, { additive: event.ctrlKey || event.metaKey }))
    list.append(row)
  }

  el('#studio-element-count').textContent = String(elements.length)
  renderSelectedModelInfo()
  const selectionCount = selectedIds.size
  const selectionLabel = selectionCount === 1 ? '1 kijelölve' : `${selectionCount} kijelölve`
  const selectionSummary = el('#studio-selection-count')
  if (selectionSummary) selectionSummary.textContent = selectionLabel
  const selectedCount = el('#studio-selected-count')
  if (selectedCount) selectedCount.textContent = selectionCount === 1 ? '1 elem' : `${selectionCount} elem`
}


function closeStudioContextMenu() {
  const menu = el('#studio-context-menu')
  if (!menu) return
  menu.classList.add('hidden')
  menu.setAttribute('aria-hidden', 'true')
}

function openStudioContextMenu(event) {
  const menu = el('#studio-context-menu')
  if (!menu) return
  const rect = renderer.domElement.getBoundingClientRect()
  const x = Math.min(Math.max(event.clientX - rect.left, 8), Math.max(8, rect.width - 200))
  const y = Math.min(Math.max(event.clientY - rect.top, 8), Math.max(8, rect.height - 230))
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`
  menu.classList.remove('hidden')
  menu.setAttribute('aria-hidden', 'false')
  menu.querySelectorAll('[data-context-action]').forEach((button) => {
    button.disabled = selectedIds.size === 0
  })
}

function handleStudioContextAction(action) {
  closeStudioContextMenu()
  if (action === 'focus') focusSelected({ fit: false })
  if (action === 'fit') focusSelected({ fit: true })
  if (action === 'duplicate') duplicateSelected()
  if (action === 'group') groupSelection()
  if (action === 'ungroup') ungroupSelection()
  if (action === 'delete') deleteSelected()
}

function initThree() {
  const container = document.querySelector('#studio-viewport-container')
  const canvas = document.querySelector('#studio-three-canvas')

  scene = new THREE.Scene()
  // Ugyanaz a felület, mint a --color-bg-sunken token.
  scene.background = new THREE.Color(0x080a0d)

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 3000)
  camera.position.set(180, 160, 300)

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.target.set(0, 60, 0)

  transformControls = new TransformControls(camera, renderer.domElement)
  transformControls.setMode('translate')
  transformControls.setSize(0.85)
  transformControls.setTranslationSnap(snapSize)
  transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value

    if (event.value && selectedId) {
      transformHistorySnapshot = captureSceneState()
    }

    if (!event.value && selectedId) {
      if (transformPivot) {
        const pivot = transformPivot
        for (const element of elements) {
          if (pivot.children.includes(element.mesh)) {
            scene.attach(element.mesh)
          }
        }
        scene.remove(pivot)
        transformPivot = null
      }

      for (const id of selectedIds) {
        const element = elements.find((item) => item.id === id)
        if (element) syncElementState(element)
      }

      attachTransformTarget()

      if (transformHistorySnapshot) {
        const before = JSON.stringify(transformHistorySnapshot)
        const after = JSON.stringify(captureSceneState())
        if (before !== after) recordHistory()
        transformHistorySnapshot = null
      }
    }
  })

  transformControls.addEventListener('objectChange', () => {
    if (!selectedId || transformPivot) return
    const element = elements.find((item) => item.id === selectedId)
    if (element) syncElementState(element)
  })

  scene.add(transformControls)

  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const mainLight = new THREE.DirectionalLight(0xffffff, 0.95)
  mainLight.position.set(160, 280, 200)
  mainLight.castShadow = true
  scene.add(mainLight)

  createBuildPlate()

  // A tengelyvonal az akcentusszín, a rács a keret színe.
  buildPlateGrid = new THREE.GridHelper(buildPlateSize, Math.max(18, buildPlateSize / 10), 0x4c8dfd, 0x252d38)
  buildPlateGrid.position.y = 0.025
  scene.add(buildPlateGrid)

  // A korábbi resize-figyelő egyszerűen kilépett, ha a stúdió épp rejtve
  // volt, és megjelenítéskor semmi nem szinkronizálta újra — egy rejtett
  // állapotban történt átméretezés után a nézet torzan jött vissza. A
  // ResizeObserver a konténert figyeli, ami a megjelenítéskori
  // méretváltozásra is lefut.
  new ResizeObserver(syncViewportSize).observe(container)

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  renderer.domElement.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    openStudioContextMenu(event)
  })
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#studio-context-menu')) closeStudioContextMenu()
  })
  el('#studio-context-menu')?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-context-action]')?.dataset.contextAction
    if (action) handleStudioContextAction(action)
  })

  renderer.domElement.addEventListener('pointerdown', (event) => {
    // A gizmóval húzás közben ne jelöljünk ki mögötte lévő elemet.
    if (transformControls.dragging) return

    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const meshes = elements.map((element) => element.mesh)
    const hits = raycaster.intersectObjects(meshes, false)
    if (hits.length) {
      selectElement(hits[0].object.userData.elementId, { additive: event.ctrlKey || event.metaKey })
    } else {
      // Üres területre kattintva a kijelölés megszűnik. Korábban a
      // gizmó és a tulajdonságpanel ilyenkor is az előző elemen maradt.
      deselect()
    }
  })

  startRenderLoop()
}

function syncViewportSize() {
  const container = el('#studio-viewport-container')
  if (container.clientWidth === 0 || container.clientHeight === 0) return
  camera.aspect = container.clientWidth / container.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(container.clientWidth, container.clientHeight)
}

function animate() {
  animationHandle = requestAnimationFrame(animate)
  controls.update()
  renderer.render(scene, camera)
}

function startRenderLoop() {
  if (animationHandle === null) animate()
}

// A főmenübe visszalépve a WebGL-ciklus korábban tovább futott a rejtett
// jelenetre — feleslegesen fogyasztotta a CPU-t és az akkumulátort.
export function stopStudio() {
  if (animationHandle !== null) {
    cancelAnimationFrame(animationHandle)
    animationHandle = null
  }
}

function createBuildPlate(size = buildPlateSize) {
  buildPlateSize = size
  buildPlate = new THREE.Group()
  buildPlate.name = 'Build Plate'

  const surfaceGeometry = new THREE.BoxGeometry(buildPlateSize, 0.8, buildPlateSize)
  const surface = new THREE.Mesh(
    surfaceGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x171c24,
      roughness: 0.8,
      metalness: 0.1,
      transparent: true,
      opacity: 0.72,
    }),
  )
  surface.position.y = -0.4
  surface.receiveShadow = true
  surface.userData.isBuildPlate = true
  buildPlate.add(surface)

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(surfaceGeometry),
    new THREE.LineBasicMaterial({ color: 0x4c8dfd, transparent: true, opacity: 0.8 }),
  )
  edge.position.y = -0.4
  edge.userData.isBuildPlate = true
  buildPlate.add(edge)

  scene.add(buildPlate)
}

function updateBuildPlateSize(size) {
  const next = Number(size)
  if (!BUILD_PLATE_SIZES.includes(next) || next === buildPlateSize) return

  if (buildPlate) {
    buildPlate.traverse((object) => {
      if (object.geometry) object.geometry.dispose()
      if (object.material) object.material.dispose()
    })
    scene.remove(buildPlate)
  }

  if (buildPlateGrid) {
    scene.remove(buildPlateGrid)
    buildPlateGrid.geometry.dispose()
    buildPlateGrid.material.dispose()
    buildPlateGrid = null
  }

  createBuildPlate(next)
  buildPlateGrid = new THREE.GridHelper(buildPlateSize, Math.max(18, buildPlateSize / 10), 0x4c8dfd, 0x252d38)
  buildPlateGrid.position.y = 0.025
  scene.add(buildPlateGrid)

  const select = el('#studio-build-plate-size')
  if (select) select.value = String(buildPlateSize)
  notifySuccess(`Nyomtatóasztal: ${buildPlateSize} × ${buildPlateSize} mm.`)
  renderSelectedModelInfo()
}

function getSelectedBounds() {
  const bounds = new THREE.Box3()
  elements
    .filter((element) => selectedIds.has(element.id))
    .forEach((element) => bounds.expandByObject(element.mesh))
  return bounds
}

function moveSelectedBy(delta) {
  if (!selectedIds.size) return
  detachTransformTarget()
  transformControls.detach()
  elements
    .filter((element) => selectedIds.has(element.id))
    .forEach((element) => {
      element.mesh.position.add(delta)
      syncElementState(element)
    })
  attachTransformTarget()
  updateSelectionVisuals()
  recordHistory()
}

function placeSelectedOnBuildPlate() {
  const bounds = getSelectedBounds()
  if (bounds.isEmpty()) {
    notify('Jelölj ki legalább egy elemet.')
    return
  }
  const delta = new THREE.Vector3(0, -bounds.min.y, 0)
  moveSelectedBy(delta)
  notifySuccess('A kijelölt elem(ek) az asztalra kerültek.')
}

function centerSelectedOnBuildPlate() {
  const bounds = getSelectedBounds()
  if (bounds.isEmpty()) {
    notify('Jelölj ki legalább egy elemet.')
    return
  }
  const center = bounds.getCenter(new THREE.Vector3())
  moveSelectedBy(new THREE.Vector3(-center.x, 0, -center.z))
  notifySuccess('A kijelölt elem(ek) középre kerültek.')
}

function getSceneBounds() {
  const box = new THREE.Box3()
  for (const element of elements) box.expandByObject(element.mesh)
  return box
}

function getFocusTarget() {
  const selected = elements.filter((element) => selectedIds.has(element.id))
  if (selected.length) {
    const box = new THREE.Box3()
    selected.forEach((element) => box.expandByObject(element.mesh))
    return box.getCenter(new THREE.Vector3())
  }

  const sceneBox = getSceneBounds()
  if (!sceneBox.isEmpty()) return sceneBox.getCenter(new THREE.Vector3())
  return new THREE.Vector3(0, 0, 0)
}

function focusBox(box, { fit = false } = {}) {
  if (box.isEmpty() || !camera || !controls) return

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxSize = Math.max(size.x, size.y, size.z, 1)
  const distance = fit
    ? Math.max(
        maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.5,
        120,
      )
    : Math.max(maxSize * 2.2, 120)

  const direction = camera.position.clone().sub(controls.target)
  if (direction.lengthSq() < 0.01) direction.set(0.5, 0.45, 0.7)
  direction.normalize()

  controls.target.copy(center)
  camera.position.copy(center).add(direction.multiplyScalar(distance))
  camera.near = Math.max(0.1, distance / 1000)
  camera.far = Math.max(3000, distance * 20)
  camera.updateProjectionMatrix()
  controls.update()
}

function focusObject(object, { fit = false } = {}) {
  if (!object) return
  focusBox(new THREE.Box3().setFromObject(object), { fit })
}

function focusSelected({ fit = false } = {}) {
  if (!selectedIds.size) return
  const box = new THREE.Box3()
  elements
    .filter((element) => selectedIds.has(element.id))
    .forEach((element) => box.expandByObject(element.mesh))
  focusBox(box, { fit })
}

function focusAll() {
  const box = getSceneBounds()
  if (box.isEmpty()) return

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxSize = Math.max(size.x, size.y, size.z, 1)
  const distance = Math.max(
    maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.7,
    160,
  )
  const direction = camera.position.clone().sub(controls.target)
  if (direction.lengthSq() < 0.01) direction.set(0.5, 0.45, 0.7)
  direction.normalize()

  controls.target.copy(center)
  camera.position.copy(center).add(direction.multiplyScalar(distance))
  camera.near = Math.max(0.1, distance / 1000)
  camera.far = Math.max(3000, distance * 20)
  camera.updateProjectionMatrix()
  controls.update()
}

function setCameraView(view) {
  const target = getFocusTarget()
  const direction = view === 'front'
    ? new THREE.Vector3(0, 0.18, 1)
    : view === 'back'
      ? new THREE.Vector3(0, 0.18, -1)
      : new THREE.Vector3(0.7, 0.55, 0.7)

  const sceneBox = getSceneBounds()
  const size = sceneBox.isEmpty() ? 120 : sceneBox.getSize(new THREE.Vector3()).length()
  const distance = Math.max(size * 1.4, 260)

  direction.normalize()
  controls.target.copy(target)
  camera.position.copy(target).add(direction.multiplyScalar(distance))
  camera.near = Math.max(0.1, distance / 1000)
  camera.far = Math.max(3000, distance * 20)
  camera.updateProjectionMatrix()
  controls.update()
}

function setTransformMode(mode) {
  transformControls.setMode(mode)
  for (const [id, value] of [
    ['#studio-transform-move', mode === 'translate'],
    ['#studio-transform-rotate', mode === 'rotate'],
    ['#studio-transform-scale', mode === 'scale'],
  ]) {
    el(id).setAttribute('aria-pressed', String(value))
  }
}

function toggleWireframe() {
  isWireframe = !isWireframe
  elements.forEach((element) => {
    element.mesh.material.wireframe = isWireframe
  })
  el('#studio-toggle-wireframe').setAttribute('aria-pressed', String(isWireframe))
}

async function import3MFFile(file) {
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.3mf')) {
    notifyError('Csak .3mf fájl importálható.')
    return
  }
  try {
    const states = await import3MF(file)
    if (!states.length) throw new Error('A 3MF fájl nem tartalmaz importálható modellt.')
    const importedIds = []
    for (const state of states) {
      const mesh = new THREE.Mesh(state.geometry, new THREE.MeshStandardMaterial({
        color: '#7c9cbf', roughness: 0.35, metalness: 0.4, wireframe: isWireframe,
      }))
      const id = createElementId()
      mesh.position.set(state.position.x, state.position.y, state.position.z)
      mesh.userData.elementId = id
      scene.add(mesh)
      elements.push({
        id, groupId: null, type: 'stl', name: state.name,
        size: Math.max(state.baseDimensions.x, state.baseDimensions.y, state.baseDimensions.z),
        color: '#7c9cbf', baseDimensions: { ...state.baseDimensions },
        position: mesh.position.clone(), rotation: mesh.rotation.clone(), scale: mesh.scale.clone(),
        dimensions: { ...state.baseDimensions }, mesh,
      })
      importedIds.push(id)
    }
    selectElements(importedIds)
    recordHistory()
    notifySuccess(`3MF betöltve: ${file.name}`)
  } catch (error) {
    console.error('3MF import failed', error)
    notifyError(`A 3MF import sikertelen: ${error.message}`)
  }
}

function download3MF() {
  if (!elements.length) {
    notifyError('Adj hozzá legalább egy elemet a jelenethez az exportálás előtt.')
    return
  }
  try {
    const blob = export3MF(elements)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'studio-model.3mf'
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    notifySuccess('3MF sikeresen letöltve.')
  } catch (error) {
    console.error('A 3MF-export sikertelen:', error)
    notifyError(`A 3MF-export sikertelen: ${error.message}`)
  }
}

function downloadSTL() {
  if (!elements.length) {
    notifyError('Adj hozzá legalább egy elemet a jelenethez az exportálás előtt.')
    return
  }

  try {
    const group = new THREE.Group()
    elements.forEach((element) => group.add(element.mesh.clone()))

    const exporter = new STLExporter()
    const result = exporter.parse(group, { binary: true })
    const blob = new Blob([result], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'studio-model.stl'
    // A linket be kell fűzni a dokumentumba, és az objektum-URL-t csak a
    // kattintás után szabad felszabadítani — enélkül a letöltés
    // Firefoxban és Safariban esetlegesen elmarad.
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    notifySuccess('STL sikeresen letöltve.')
  } catch (error) {
    console.error('Az STL-export sikertelen:', error)
    notifyError(`Az STL-export sikertelen: ${error.message}`)
  }
}

function bindUI() {
  ensurePrimitivePalette()

  document.querySelector('#studio-add-box').addEventListener('click', () => addElement('box'))
  document.querySelector('#studio-add-cylinder').addEventListener('click', () => addElement('cylinder'))
  document.querySelector('#studio-add-sphere').addEventListener('click', () => addElement('sphere'))
  document.querySelector('#studio-add-cone').addEventListener('click', () => addElement('cone'))
  document.querySelector('#studio-add-pyramid').addEventListener('click', () => addElement('pyramid'))

  document.querySelector('#studio-delete-selected').addEventListener('click', () => {
    detachTransformTarget()
    if (selectedIds.size > 1) {
      const ids = [...selectedIds]
      ids.forEach(removeElement)
      selectedIds.clear()
      selectedId = null
      transformControls.detach()
      el('#studio-selected-props').classList.add('hidden')
      updateSelectionVisuals()
      renderElementList()
      recordHistory()
    } else if (selectedId) {
      removeElement(selectedId)
    }
  })
  el('#studio-undo').addEventListener('click', undoStudio)
  el('#studio-duplicate-selected').addEventListener('click', duplicateSelected)
  el('#studio-redo').addEventListener('click', redoStudio)

  el('#studio-param-size').addEventListener('input', (event) => {
    const element = elements.find((item) => item.id === selectedId)
    if (!element) return
    const size = parseInt(event.target.value, 10)
    element.size = size
    element.baseDimensions = dimensionsFromSize(element.type, size)
    el('#studio-val-size').textContent = `${size} mm`

    const position = element.mesh.position.clone()
    element.mesh.geometry.dispose()
    element.mesh.geometry = createGeometry(element.type, element.baseDimensions)
    element.mesh.position.copy(position)
    element.mesh.position.y = size / 2
    syncElementState(element)
    recordHistory()
  })

  el('#studio-param-color').addEventListener('input', (event) => {
    const element = elements.find((item) => item.id === selectedId)
    if (!element) return
    element.color = event.target.value
    element.mesh.material.color.set(event.target.value)
    recordHistory()
  })

  el('#studio-build-plate-size').addEventListener('change', (event) => {
    updateBuildPlateSize(event.target.value)
  })

  el('#studio-view-front').addEventListener('click', () => setCameraView('front'))
  el('#studio-view-back').addEventListener('click', () => setCameraView('back'))
  el('#studio-view-iso').addEventListener('click', () => setCameraView('iso'))
  el('#studio-focus-selected').addEventListener('click', () => focusSelected())
  el('#studio-fit-selected').addEventListener('click', () => focusSelected({ fit: true }))
  el('#studio-focus-all').addEventListener('click', focusAll)
  el('#studio-place-on-bed').addEventListener('click', placeSelectedOnBuildPlate)
  el('#studio-center-on-bed').addEventListener('click', centerSelectedOnBuildPlate)
  el('#studio-transform-move').addEventListener('click', () => setTransformMode('translate'))
  el('#studio-transform-rotate').addEventListener('click', () => setTransformMode('rotate'))
  el('#studio-transform-scale').addEventListener('click', () => setTransformMode('scale'))
  el('#studio-group-selected').addEventListener('click', groupSelection)
  el('#studio-ungroup-selected').addEventListener('click', ungroupSelection)
  el('#studio-toggle-wireframe').addEventListener('click', toggleWireframe)
  el('#studio-align-x-min').addEventListener('click', () => alignSelected('x', 'min'))
  el('#studio-align-x-center').addEventListener('click', () => alignSelected('x', 'center'))
  el('#studio-align-x-max').addEventListener('click', () => alignSelected('x', 'max'))
  el('#studio-align-y-min').addEventListener('click', () => alignSelected('y', 'min'))
  el('#studio-align-y-center').addEventListener('click', () => alignSelected('y', 'center'))
  el('#studio-align-y-max').addEventListener('click', () => alignSelected('y', 'max'))
  el('#studio-align-z-min').addEventListener('click', () => alignSelected('z', 'min'))
  el('#studio-align-z-center').addEventListener('click', () => alignSelected('z', 'center'))
  el('#studio-align-z-max').addEventListener('click', () => alignSelected('z', 'max'))
  el('#studio-snap-toggle').addEventListener('click', () => setSnapEnabled(!snapEnabled))
  el('#studio-snap-size').addEventListener('change', (event) => setSnapSize(event.target.value))

  for (const [selector, axis] of [
    ['#studio-pos-x', 'pos-x'], ['#studio-pos-y', 'pos-y'], ['#studio-pos-z', 'pos-z'],
    ['#studio-rot-x', 'rot-x'], ['#studio-rot-y', 'rot-y'], ['#studio-rot-z', 'rot-z'],
    ['#studio-dim-x', 'dim-x'], ['#studio-dim-y', 'dim-y'], ['#studio-dim-z', 'dim-z'],
  ]) {
    el(selector).addEventListener('change', (event) => {
      const value = Number(event.target.value)
      applyNumericTransform(axis, value)
    })
  }

  document.addEventListener('keydown', (event) => {
    if (event.target.closest('input, textarea, select, button')) return
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redoStudio()
        else undoStudio()
        return
      }
      if (event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redoStudio()
        return
      }
    }
    if (event.key.toLowerCase() === 'd' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      duplicateSelected()
      return
    }
    if (!selectedId) return
    if (event.key.toLowerCase() === 'w') setTransformMode('translate')
    if (event.key.toLowerCase() === 'e') setTransformMode('rotate')
    if (event.key.toLowerCase() === 'r') setTransformMode('scale')
    if (event.key.toLowerCase() === 'f') focusSelected({ fit: true })

    // Alap CAD-mozgatás billentyűzetről: nyilak X/Z tengelyen, PageUp/PageDown Y tengelyen.
    // Shift 5× nagyobb lépést használ; a lépés a kiválasztott Snap méretéhez igazodik.
    const step = snapSize * (event.shiftKey ? 5 : 1)
    const keyMoves = {
      ArrowLeft: new THREE.Vector3(-step, 0, 0),
      ArrowRight: new THREE.Vector3(step, 0, 0),
      ArrowUp: new THREE.Vector3(0, 0, -step),
      ArrowDown: new THREE.Vector3(0, 0, step),
      PageUp: new THREE.Vector3(0, step, 0),
      PageDown: new THREE.Vector3(0, -step, 0),
    }
    if (keyMoves[event.key]) {
      event.preventDefault()
      moveSelectedBy(keyMoves[event.key])
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      detachTransformTarget()
      const ids = [...selectedIds]
      ids.forEach(removeElement)
      selectedIds.clear()
      selectedId = null
      transformControls.detach()
      el('#studio-selected-props').classList.add('hidden')
      updateSelectionVisuals()
      renderElementList()
      recordHistory()
    }
  })
  el('#studio-download-stl-btn')?.addEventListener('click', downloadSTL)
  el('#studio-download-3mf-btn')?.addEventListener('click', download3MF)
  el('#studio-import-3mf')?.addEventListener('click', () => el('#studio-3mf-file')?.click())
  el('#studio-3mf-file')?.addEventListener('change', async (event) => {
    await import3MFFile(event.target.files?.[0])
    event.target.value = ''
  })
}

export function initStudio() {
  if (initialized) {
    // Visszatéréskor újraindítjuk a ciklust, és újraszinkronizáljuk a
    // méretet arra az esetre, ha rejtett állapotban változott az ablak.
    startRenderLoop()
    syncViewportSize()
    return
  }
  initialized = true
  bindUI()
  initThree()
  addElement('box')
  recordHistory()
}