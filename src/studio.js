import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
// Átmeneti: a stúdió markupja még Tailwind utility-osztályokkal van írva.
// A 10. lépésben ez a képernyő is a közös komponens-CSS-re költözik, és
// ez az import (a Tailwinddel együtt) megszűnik.
import './tailwind.css'

let scene, camera, renderer, controls, transformControls
let elements = []
let selectedId = null
let isWireframe = false
let toastTimer = null
let initialized = false

const SHAPE_DEFAULTS = {
  box: { label: 'Kocka', icon: '⬛', color: '#00b8d4' },
  cylinder: { label: 'Henger', icon: '🥫', color: '#0891b2' },
  sphere: { label: 'Gömb', icon: '⚪', color: '#00e5ff' },
}

function createGeometry(type, size) {
  if (type === 'cylinder') return new THREE.CylinderGeometry(size / 2, size / 2, size, 32)
  if (type === 'sphere') return new THREE.SphereGeometry(size / 2, 32, 24)
  return new THREE.BoxGeometry(size, size, size)
}

function showToast(msg) {
  const toast = document.querySelector('#toast')
  document.querySelector('#toast-msg').textContent = msg
  toast.classList.remove('translate-y-20', 'opacity-0')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 2500)
}

function addElement(type) {
  const defaults = SHAPE_DEFAULTS[type]
  const size = 60
  const id = `el-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const geometry = createGeometry(type, size)
  const material = new THREE.MeshStandardMaterial({
    color: defaults.color,
    roughness: 0.35,
    metalness: 0.4,
    wireframe: isWireframe,
  })
  const mesh = new THREE.Mesh(geometry, material)
  const offset = elements.length * 20
  mesh.position.set(offset - (elements.length ? 0 : 0), size / 2, offset)
  mesh.userData.elementId = id
  scene.add(mesh)

  elements.push({ id, type, size, color: defaults.color, mesh })
  renderElementList()
  selectElement(id)
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
}

function selectElement(id) {
  const element = elements.find((item) => item.id === id)
  if (!element) return
  selectedId = id
  transformControls.attach(element.mesh)

  const propsPanel = document.querySelector('#studio-selected-props')
  propsPanel.classList.remove('hidden')
  document.querySelector('#studio-param-size').value = element.size
  document.querySelector('#studio-val-size').textContent = `${element.size} mm`
  document.querySelector('#studio-param-color').value = element.color
  renderElementList()
}

function renderElementList() {
  const list = document.querySelector('#studio-element-list')
  list.innerHTML = ''

  if (!elements.length) {
    const empty = document.createElement('div')
    empty.className = 'text-zinc-500 italic py-2'
    empty.textContent = 'Nincs még elem. Adj hozzá egyet fent.'
    list.append(empty)
  }

  elements.forEach((element) => {
    const row = document.createElement('div')
    const isSelected = element.id === selectedId
    row.className = `flex items-center justify-between px-2 py-1.5 rounded-lg border cursor-pointer transition ${
      isSelected ? 'border-brand-500 bg-brand-500/10' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
    }`
    row.innerHTML = `<span>${SHAPE_DEFAULTS[element.type].icon} ${SHAPE_DEFAULTS[element.type].label}</span>`
    row.addEventListener('click', () => selectElement(element.id))
    list.append(row)
  })

  document.querySelector('#studio-element-count').textContent = String(elements.length)
}

function initThree() {
  const container = document.querySelector('#studio-viewport-container')
  const canvas = document.querySelector('#studio-three-canvas')

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0a0c)

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
  transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value
  })
  scene.add(transformControls)

  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const mainLight = new THREE.DirectionalLight(0xffffff, 0.95)
  mainLight.position.set(160, 280, 200)
  mainLight.castShadow = true
  scene.add(mainLight)

  const grid = new THREE.GridHelper(260, 26, 0x00b8d4, 0x27272a)
  grid.position.y = 0.02
  scene.add(grid)

  window.addEventListener('resize', () => {
    if (document.querySelector('#studio-app').classList.contains('hidden')) return
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  })

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  renderer.domElement.addEventListener('pointerdown', (event) => {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const meshes = elements.map((element) => element.mesh)
    const hits = raycaster.intersectObjects(meshes, false)
    if (hits.length) {
      selectElement(hits[0].object.userData.elementId)
    }
  })

  animate()
}

function animate() {
  requestAnimationFrame(animate)
  controls.update()
  renderer.render(scene, camera)
}

function setCameraView(view) {
  const dist = 340
  if (view === 'front') camera.position.set(0, 120, dist)
  else if (view === 'back') camera.position.set(0, 120, -dist)
  else if (view === 'iso') camera.position.set(dist * 0.7, 200, dist * 0.7)
  controls.update()
}

function toggleWireframe() {
  isWireframe = !isWireframe
  elements.forEach((element) => {
    element.mesh.material.wireframe = isWireframe
  })
}

function downloadSTL() {
  if (!elements.length) {
    window.alert('Adj hozzá legalább egy elemet a jelenethez az exportálás előtt.')
    return
  }
  const group = new THREE.Group()
  elements.forEach((element) => group.add(element.mesh.clone()))

  const exporter = new STLExporter()
  const result = exporter.parse(group, { binary: true })
  const blob = new Blob([result], { type: 'application/octet-stream' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'studio-model.stl'
  link.click()
  URL.revokeObjectURL(link.href)
  showToast('STL sikeresen letöltve!')
}

function bindUI() {
  document.querySelector('#studio-add-box').addEventListener('click', () => addElement('box'))
  document.querySelector('#studio-add-cylinder').addEventListener('click', () => addElement('cylinder'))
  document.querySelector('#studio-add-sphere').addEventListener('click', () => addElement('sphere'))

  document.querySelector('#studio-delete-selected').addEventListener('click', () => {
    if (selectedId) removeElement(selectedId)
  })

  document.querySelector('#studio-param-size').addEventListener('input', (event) => {
    const element = elements.find((item) => item.id === selectedId)
    if (!element) return
    const size = parseInt(event.target.value, 10)
    element.size = size
    document.querySelector('#studio-val-size').textContent = `${size} mm`
    const position = element.mesh.position.clone()
    element.mesh.geometry.dispose()
    element.mesh.geometry = createGeometry(element.type, size)
    element.mesh.position.copy(position)
  })

  document.querySelector('#studio-param-color').addEventListener('input', (event) => {
    const element = elements.find((item) => item.id === selectedId)
    if (!element) return
    element.color = event.target.value
    element.mesh.material.color.set(event.target.value)
  })

  document.querySelector('#studio-view-front').addEventListener('click', () => setCameraView('front'))
  document.querySelector('#studio-view-back').addEventListener('click', () => setCameraView('back'))
  document.querySelector('#studio-view-iso').addEventListener('click', () => setCameraView('iso'))
  document.querySelector('#studio-toggle-wireframe').addEventListener('click', toggleWireframe)
  document.querySelector('#studio-download-stl-btn').addEventListener('click', downloadSTL)
}

export function initStudio() {
  if (initialized) return
  initialized = true
  bindUI()
  initThree()
  addElement('box')
}
