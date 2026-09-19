import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import './styles/screens/studio.css'
import { create, el } from './ui/dom.js'
import { notify, notifyError, notifySuccess } from './ui/toast.js'

let scene, camera, renderer, controls, transformControls
let elements = []
let selectedId = null
let isWireframe = false
let initialized = false
let animationHandle = null
let history = []
let historyIndex = -1
let historyBusy = false
let transformHistorySnapshot = null

const SHAPE_DEFAULTS = {
  box: { label: 'Kocka', icon: 'cube', color: '#7c9cbf' },
  cylinder: { label: 'Henger', icon: 'rect', color: '#6b8fb5' },
  sphere: { label: 'Gömb', icon: 'circle', color: '#8fa9c7' },
}

function createGeometry(type, dimensions) {
  const { x, y, z } = dimensions
  if (type === 'cylinder') return new THREE.CylinderGeometry(x / 2, x / 2, y, 32)
  if (type === 'sphere') return new THREE.SphereGeometry(x / 2, 32, 24)
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
}

function captureSceneState() {
  return elements.map((element) => ({
    id: element.id,
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
  }))
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
  const geometry = createGeometry(state.type, state.baseDimensions)
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
  transformControls.detach()
  elements.forEach(disposeElementMesh)
  elements = history[index].map(createElementFromState)
  historyIndex = index
  selectedId = elements[0]?.id ?? null
  if (selectedId) {
    const selected = elements.find((element) => element.id === selectedId)
    transformControls.attach(selected.mesh)
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
  if (selectedId === id) {
    transformControls.detach()
    selectedId = null
    document.querySelector('#studio-selected-props').classList.add('hidden')
  }
  scene.remove(element.mesh)
  element.mesh.geometry.dispose()
  element.mesh.material.dispose()
  renderElementList()
  recordHistory()
}

function selectElement(id) {
  const element = elements.find((item) => item.id === id)
  if (!element) return
  selectedId = id
  transformControls.attach(element.mesh)
  syncElementState(element)

  el('#studio-selected-props').classList.remove('hidden')
  el('#studio-param-size').value = element.size
  el('#studio-val-size').textContent = `${element.size} mm`
  el('#studio-param-color').value = element.color
  refreshTransformInputs(element)
  renderElementList()
}

function deselect() {
  if (selectedId === null) return
  selectedId = null
  transformControls.detach()
  el('#studio-selected-props').classList.add('hidden')
  renderElementList()
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
    const row = create('button', {
      type: 'button',
      class: `layer${element.id === selectedId ? ' is-active' : ''}`,
    })
    row.append(create('span', { class: 'layer__name', textContent: SHAPE_DEFAULTS[element.type].label }))
    row.addEventListener('click', () => selectElement(element.id))
    list.append(row)
  }

  el('#studio-element-count').textContent = String(elements.length)
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
  transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value
    if (event.value && selectedId) {
      transformHistorySnapshot = captureSceneState()
    }
    if (!event.value && selectedId) {
      const element = elements.find((item) => item.id === selectedId)
      if (element) syncElementState(element)
      if (transformHistorySnapshot) {
        const before = JSON.stringify(transformHistorySnapshot)
        const after = JSON.stringify(captureSceneState())
        if (before !== after) recordHistory()
        transformHistorySnapshot = null
      }
    }
  })

  transformControls.addEventListener('objectChange', () => {
    if (!selectedId) return
    const element = elements.find((item) => item.id === selectedId)
    if (element) syncElementState(element)
  })
  scene.add(transformControls)

  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const mainLight = new THREE.DirectionalLight(0xffffff, 0.95)
  mainLight.position.set(160, 280, 200)
  mainLight.castShadow = true
  scene.add(mainLight)

  // A tengelyvonal az akcentszín (--color-accent), a rács a keret színe.
  const grid = new THREE.GridHelper(260, 26, 0x4c8dfd, 0x252d38)
  grid.position.y = 0.02
  scene.add(grid)

  // A korábbi resize-figyelő egyszerűen kilépett, ha a stúdió épp rejtve
  // volt, és megjelenítéskor semmi nem szinkronizálta újra — egy rejtett
  // állapotban történt átméretezés után a nézet torzan jött vissza. A
  // ResizeObserver a konténert figyeli, ami a megjelenítéskori
  // méretváltozásra is lefut.
  new ResizeObserver(syncViewportSize).observe(container)

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
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
      selectElement(hits[0].object.userData.elementId)
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

function setCameraView(view) {
  const dist = 340
  if (view === 'front') camera.position.set(0, 120, dist)
  else if (view === 'back') camera.position.set(0, 120, -dist)
  else if (view === 'iso') camera.position.set(dist * 0.7, 200, dist * 0.7)
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
  document.querySelector('#studio-add-box').addEventListener('click', () => addElement('box'))
  document.querySelector('#studio-add-cylinder').addEventListener('click', () => addElement('cylinder'))
  document.querySelector('#studio-add-sphere').addEventListener('click', () => addElement('sphere'))

  document.querySelector('#studio-delete-selected').addEventListener('click', () => {
    if (selectedId) removeElement(selectedId)
  })
  el('#studio-undo').addEventListener('click', undoStudio)
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

  el('#studio-view-front').addEventListener('click', () => setCameraView('front'))
  el('#studio-view-back').addEventListener('click', () => setCameraView('back'))
  el('#studio-view-iso').addEventListener('click', () => setCameraView('iso'))
  el('#studio-transform-move').addEventListener('click', () => setTransformMode('translate'))
  el('#studio-transform-rotate').addEventListener('click', () => setTransformMode('rotate'))
  el('#studio-transform-scale').addEventListener('click', () => setTransformMode('scale'))
  el('#studio-toggle-wireframe').addEventListener('click', toggleWireframe)

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
    if (!selectedId) return
    if (event.key.toLowerCase() === 'w') setTransformMode('translate')
    if (event.key.toLowerCase() === 'e') setTransformMode('rotate')
    if (event.key.toLowerCase() === 'r') setTransformMode('scale')
  })
  el('#studio-download-stl-btn').addEventListener('click', downloadSTL)
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
