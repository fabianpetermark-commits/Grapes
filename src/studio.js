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

const SHAPE_DEFAULTS = {
  box: { label: 'Kocka', icon: 'cube', color: '#7c9cbf' },
  cylinder: { label: 'Henger', icon: 'rect', color: '#6b8fb5' },
  sphere: { label: 'Gömb', icon: 'circle', color: '#8fa9c7' },
}

function createGeometry(type, size) {
  if (type === 'cylinder') return new THREE.CylinderGeometry(size / 2, size / 2, size, 32)
  if (type === 'sphere') return new THREE.SphereGeometry(size / 2, 32, 24)
  return new THREE.BoxGeometry(size, size, size)
}

// A korábbi, csak ezen a képernyőn létező #toast elem helyett a közös
// értesítő réteget használjuk (aria-live régióval).
const showToast = (message) => notify(message)

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
  mesh.position.set(offset, size / 2, offset)
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

  el('#studio-selected-props').classList.remove('hidden')
  el('#studio-param-size').value = element.size
  el('#studio-val-size').textContent = `${element.size} mm`
  el('#studio-param-color').value = element.color
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
  transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value
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

  el('#studio-param-size').addEventListener('input', (event) => {
    const element = elements.find((item) => item.id === selectedId)
    if (!element) return
    const size = parseInt(event.target.value, 10)
    element.size = size
    el('#studio-val-size').textContent = `${size} mm`

    const position = element.mesh.position.clone()
    element.mesh.geometry.dispose()
    element.mesh.geometry = createGeometry(element.type, size)
    element.mesh.position.copy(position)
    // Az elem eredetileg y = size/2 magasságban áll a tárgyasztalon. A régi
    // kód a nyers korábbi pozíciót állította vissza, ezért egy megnövelt
    // elem félig besüllyedt a rácsba, egy lekicsinyített pedig lebegett.
    element.mesh.position.y = size / 2
  })

  el('#studio-param-color').addEventListener('input', (event) => {
    const element = elements.find((item) => item.id === selectedId)
    if (!element) return
    element.color = event.target.value
    element.mesh.material.color.set(event.target.value)
  })

  el('#studio-view-front').addEventListener('click', () => setCameraView('front'))
  el('#studio-view-back').addEventListener('click', () => setCameraView('back'))
  el('#studio-view-iso').addEventListener('click', () => setCameraView('iso'))
  el('#studio-toggle-wireframe').addEventListener('click', toggleWireframe)
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
}
