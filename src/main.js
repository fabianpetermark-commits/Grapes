import grapesjs from 'grapesjs'
import 'grapesjs/dist/css/grapes.min.css'
import gjsBlocksBasic from 'grapesjs-blocks-basic'
import gjsCustomCode from 'grapesjs-custom-code'
import gjsNavbar from 'grapesjs-navbar'
import gjsForms from 'grapesjs-plugin-forms'
import gjsPresetWebpage from 'grapesjs-preset-webpage'
import gjsStyleBg from 'grapesjs-style-bg'
import gjsTabs from 'grapesjs-tabs'
import gjsTooltip from 'grapesjs-tooltip'
import QRCode from 'qrcode'
import './tailwind.css'
import './styles/index.css'
import './style.css'

const GRID_SIZE = 10
const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY || ''

// --- Modulválasztó (nyitó képernyő) ---
// A "?engine=fabric" URL-paraméter a kísérleti, Fabric.js-alapú brossúra-
// motort aktiválja a jelenlegi GrapesJS-es szerkesztő helyett (lásd a
// migrációs tervet) — a régi motor ettől függetlenül teljesen érintetlen
// marad, amíg ez a zászló nincs bekapcsolva.
const useFabricEngine = new URLSearchParams(window.location.search).get('engine') === 'fabric'

function showBrochureApp() {
  document.querySelector('#splash-screen').classList.add('hidden')
  document.querySelector('#studio-app').classList.add('hidden')
  if (useFabricEngine) {
    document.querySelector('#app').classList.add('hidden')
    document.querySelector('#fabric-app').classList.remove('hidden')
    import('./brochure-fabric/editor.js').then(({ initBrochureFabric }) => initBrochureFabric())
    return
  }
  document.querySelector('#fabric-app').classList.add('hidden')
  document.querySelector('#app').classList.remove('hidden')
  editor.refresh()
}

function showStudioApp() {
  document.querySelector('#splash-screen').classList.add('hidden')
  document.querySelector('#app').classList.add('hidden')
  document.querySelector('#fabric-app').classList.add('hidden')
  document.querySelector('#studio-app').classList.remove('hidden')
  document.querySelector('#gjs').classList.remove('mobile-panel-open')
  import('./studio.js').then(({ initStudio }) => initStudio())
}

function showModulePicker() {
  document.querySelector('#app').classList.add('hidden')
  document.querySelector('#fabric-app').classList.add('hidden')
  document.querySelector('#studio-app').classList.add('hidden')
  document.querySelector('#splash-screen').classList.remove('hidden')
  document.querySelector('#gjs').classList.remove('mobile-panel-open')
}

document.querySelector('#pick-brochure').addEventListener('click', showBrochureApp)
document.querySelector('#pick-studio').addEventListener('click', showStudioApp)
document.querySelector('#app-back-to-menu-btn').addEventListener('click', showModulePicker)
document.querySelector('#studio-back-to-menu-btn').addEventListener('click', showModulePicker)
document.querySelector('#fabric-back-to-menu-btn').addEventListener('click', showModulePicker)

// --- Főmenü ---
const mainMenu = document.querySelector('#main-menu')
const mainMenuBtn = document.querySelector('#main-menu-btn')

mainMenuBtn.addEventListener('click', (event) => {
  event.stopPropagation()
  mainMenu.classList.toggle('hidden')
})

mainMenu.addEventListener('click', (event) => {
  if (event.target.tagName === 'BUTTON') {
    mainMenu.classList.add('hidden')
  }
})

document.addEventListener('click', (event) => {
  if (!mainMenu.classList.contains('hidden') && !mainMenu.contains(event.target) && event.target !== mainMenuBtn) {
    mainMenu.classList.add('hidden')
  }
})

// A toolbar mobilon több sorra törhet (a tartalmától függően), ezért a
// tényleges magasságát mérjük és --toolbar-h CSS változóként tesszük
// elérhetővé mindennek, ami ehhez képest pozícionál (canvas magassága,
// mobil panel-fiók stb.) — így nem kell beégetett px-értékekkel
// próbálkozni a lehetséges 1-3 soros elrendezéshez.
const toolbarEl = document.querySelector('#toolbar')
function updateToolbarHeight() {
  document.documentElement.style.setProperty('--toolbar-h', `${toolbarEl.offsetHeight}px`)
}
updateToolbarHeight()
window.addEventListener('resize', updateToolbarHeight)
new ResizeObserver(updateToolbarHeight).observe(toolbarEl)

const editor = grapesjs.init({
  container: '#gjs',
  height: '100%',
  width: 'auto',
  storageManager: {
    type: 'local',
    autosave: true,
  },
  plugins: [
    gjsBlocksBasic,
    gjsPresetWebpage,
    gjsForms,
    gjsNavbar,
    gjsCustomCode,
    gjsStyleBg,
    gjsTabs,
    gjsTooltip,
  ],
  pluginsOpts: {
    [gjsBlocksBasic]: {},
    [gjsPresetWebpage]: {
      blocksBasicOpts: {
        blocks: ['column1', 'column2', 'column3'],
      },
    },
    [gjsForms]: {},
    [gjsNavbar]: {},
    [gjsCustomCode]: {},
    [gjsStyleBg]: {},
    [gjsTabs]: {},
    [gjsTooltip]: {},
  },
  pageManager: {
    pages: [
      {
        id: 'page-outer',
        name: 'Külső oldal (Címlap/Hátlap)',
        component: `
          <div class="sheet">
            <div class="sheet-panel">Címlap</div>
            <div class="sheet-panel">Hátlap</div>
            <div class="sheet-panel">Hajtási panel</div>
          </div>
        `,
      },
      {
        id: 'page-inner',
        name: 'Belső oldal (Spread)',
        component: `
          <div class="sheet">
            <div class="sheet-panel">Belső 1</div>
            <div class="sheet-panel">Belső 2</div>
            <div class="sheet-panel">Belső 3</div>
          </div>
        `,
      },
    ],
  },
  assetManager: {
    uploadText: 'Húzd ide a fájlokat vagy kattints a tallózáshoz',
    assets: [],
  },
  deviceManager: {
    devices: [
      { name: 'A4 Landscape', width: '1123px', height: '794px' },
      { name: 'Web / Responsive', width: '100%' },
    ],
  },
  blockManager: {
    blocks: [
      {
        id: 'brochure-sheet',
        label: 'A4 Lap (3 oszlopos brossúra)',
        category: 'Brossúra Sablonok',
        content: `
          <div class="sheet">
            <div class="sheet-panel"><h3>Panel 1</h3></div>
            <div class="sheet-panel"><h3>Panel 2</h3></div>
            <div class="sheet-panel"><h3>Panel 3</h3></div>
          </div>
        `,
      },
      {
        id: 'shape-rectangle',
        label: 'Téglalap',
        category: 'Alakzatok',
        media: '<svg viewBox="0 0 24 24" width="28" height="28"><rect x="2" y="5" width="20" height="14" fill="#3b82f6"/></svg>',
        content: {
          type: 'svg',
          tagName: 'svg',
          attributes: { viewBox: '0 0 200 120', 'data-shape': 'rectangle' },
          style: {
            width: '200px',
            height: '120px',
            position: 'absolute',
            top: '20px',
            left: '20px',
            fill: '#3b82f6',
          },
          components: [{ tagName: 'rect', type: 'svg-in', attributes: { x: 0, y: 0, width: 200, height: 120 } }],
        },
      },
      {
        id: 'shape-circle',
        label: 'Kör',
        category: 'Alakzatok',
        media: '<svg viewBox="0 0 24 24" width="28" height="28"><circle cx="12" cy="12" r="9" fill="#10b981"/></svg>',
        content: {
          type: 'svg',
          tagName: 'svg',
          attributes: { viewBox: '0 0 160 160', 'data-shape': 'circle' },
          style: {
            width: '160px',
            height: '160px',
            position: 'absolute',
            top: '20px',
            left: '20px',
            fill: '#10b981',
          },
          components: [{ tagName: 'circle', type: 'svg-in', attributes: { cx: 80, cy: 80, r: 78 } }],
        },
      },
      {
        id: 'shape-line',
        label: 'Vonal',
        category: 'Alakzatok',
        media: '<svg viewBox="0 0 24 24" width="28" height="28"><line x1="2" y1="12" x2="22" y2="12" stroke="#374151" stroke-width="2"/></svg>',
        content: {
          type: 'svg',
          tagName: 'svg',
          attributes: { viewBox: '0 0 200 20', 'data-shape': 'line' },
          style: {
            width: '200px',
            height: '20px',
            position: 'absolute',
            top: '20px',
            left: '20px',
            stroke: '#374151',
            'stroke-width': '4px',
          },
          components: [{ tagName: 'line', type: 'svg-in', attributes: { x1: 0, y1: 10, x2: 200, y2: 10 } }],
        },
      },
      {
        id: 'shape-arrow',
        label: 'Nyíl',
        category: 'Alakzatok',
        media: '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M2 12h16m0 0-5-5m5 5-5 5" fill="none" stroke="#f59e0b" stroke-width="2"/></svg>',
        content: {
          type: 'svg',
          tagName: 'svg',
          attributes: { viewBox: '0 0 200 60', 'data-shape': 'arrow' },
          style: {
            width: '200px',
            height: '60px',
            position: 'absolute',
            top: '20px',
            left: '20px',
            stroke: '#f59e0b',
            'stroke-width': '8px',
          },
          components: [
            {
              tagName: 'path',
              type: 'svg-in',
              attributes: {
                d: 'M10 30h160m0 0-30-25m30 25-30 25',
                fill: 'none',
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
              },
            },
          ],
        },
      },
      {
        id: 'shape-star',
        label: 'Csillag',
        category: 'Alakzatok',
        media: '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 16.9 5.8 20.3l1.6-6.8L2.2 8.9l6.9-.6z" fill="#ef4444"/></svg>',
        content: {
          type: 'svg',
          tagName: 'svg',
          attributes: { viewBox: '0 0 120 120', 'data-shape': 'star' },
          style: {
            width: '120px',
            height: '120px',
            position: 'absolute',
            top: '20px',
            left: '20px',
            fill: '#ef4444',
          },
          components: [
            {
              tagName: 'path',
              type: 'svg-in',
              attributes: { d: 'M60 8 76 45 116 50 87 76 95 116 60 95 25 116 33 76 4 50 44 45z' },
            },
          ],
        },
      },
      {
        id: 'qr-code',
        label: 'QR-kód',
        category: 'Alakzatok',
        media: '<svg viewBox="0 0 24 24" width="28" height="28"><rect x="3" y="3" width="7" height="7" fill="#1e293b"/><rect x="14" y="3" width="7" height="7" fill="#1e293b"/><rect x="3" y="14" width="7" height="7" fill="#1e293b"/><rect x="14" y="14" width="3" height="3" fill="#1e293b"/><rect x="18" y="18" width="3" height="3" fill="#1e293b"/></svg>',
        content: { type: 'qr-placeholder' },
      },
    ],
  },
})

editor.Css.addRules(`
  html, body {
    height: auto !important;
    min-height: 100%;
    overflow-y: auto !important;
  }

  .sheet {
    display: flex;
    flex-direction: row;
    width: 1123px;
    height: 794px;
    box-sizing: border-box;
    overflow: hidden;
    background: #fff;
  }

  .sheet-panel {
    position: relative;
    flex: 1;
    width: 33.333%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    padding: 40px;
    border-right: 1px dashed #ccc;
  }

  .sheet-panel:last-child {
    border-right: 0;
  }
`)

// --- Alakzatok: szabadon pozicionálható, átméretezhető SVG komponensek ---
editor.DomComponents.addType('svg', {
  model: {
    defaults: {
      draggable: true,
      resizable: true,
      removable: true,
      copyable: true,
      dragMode: 'absolute',
      toolbar: [
        { attributes: { class: 'fa fa-level-up', title: 'Előre hozás' }, command: 'shape:bring-front' },
        { attributes: { class: 'fa fa-level-down', title: 'Hátra küldés' }, command: 'shape:send-back' },
        { attributes: { class: 'fa fa-arrows', title: 'Mozgatás' }, command: 'tlb-move' },
        { attributes: { class: 'fa fa-clone', title: 'Másolás' }, command: 'tlb-clone' },
        { attributes: { class: 'fa fa-trash-o', title: 'Törlés' }, command: 'tlb-delete' },
      ],
    },
  },
})

editor.DomComponents.addType('qr-placeholder', {
  model: {
    defaults: {
      tagName: 'div',
      draggable: true,
      droppable: false,
      dragMode: 'absolute',
      style: {
        position: 'absolute',
        top: '20px',
        left: '20px',
        width: '160px',
        height: '160px',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        background: '#f3f4f6',
        border: '1px dashed #9ca3af',
        color: '#6b7280',
        'font-size': '12px',
        'text-align': 'center',
        padding: '8px',
        'box-sizing': 'border-box',
      },
      components: 'QR-kód\n(kattints a beállításhoz)',
      toolbar: [
        { attributes: { class: 'fa fa-qrcode', title: 'QR-kód beállítása' }, command: 'qr:configure' },
        { attributes: { class: 'fa fa-arrows', title: 'Mozgatás' }, command: 'tlb-move' },
        { attributes: { class: 'fa fa-clone', title: 'Másolás' }, command: 'tlb-clone' },
        { attributes: { class: 'fa fa-trash-o', title: 'Törlés' }, command: 'tlb-delete' },
      ],
    },
  },
})

// Réteg-sorrend (z-index) kezelése: a szülőn belüli DOM-sorrend mozgatásával
editor.Commands.add('shape:bring-front', {
  run(ed) {
    const selected = ed.getSelected()
    const parent = selected?.parent()
    if (!selected || !parent) return
    parent.append(selected, { at: parent.components().length - 1 })
  },
})

editor.Commands.add('shape:send-back', {
  run(ed) {
    const selected = ed.getSelected()
    const parent = selected?.parent()
    if (!selected || !parent) return
    parent.append(selected, { at: 0 })
  },
})

// Rács (snap-to-grid) igazítás mozgatás/méretezés végén
editor.on('component:drag:end', ({ target }) => {
  const style = target.getStyle()
  if (style.position !== 'absolute') return
  const snap = (value) => `${Math.round(parseFloat(value || 0) / GRID_SIZE) * GRID_SIZE}px`
  target.addStyle({ top: snap(style.top), left: snap(style.left) })
})

editor.on('component:resize', ({ target }) => {
  const style = target.getStyle()
  if (style.position !== 'absolute') return
  const snap = (value) => `${Math.round(parseFloat(value || 0) / GRID_SIZE) * GRID_SIZE}px`
  target.addStyle({ width: snap(style.width), height: snap(style.height) })
})

// Igazítás/elrendezés: a kijelölt elem igazítása a szülőjéhez képest
function alignSelected(direction) {
  const selected = editor.getSelected()
  const parent = selected?.parent()
  if (!selected || !parent) return
  const parentEl = parent.getEl()
  const selectedEl = selected.getEl()
  if (!parentEl || !selectedEl) return

  const parentRect = parentEl.getBoundingClientRect()
  const elRect = selectedEl.getBoundingClientRect()
  const parentWidth = parentRect.width
  const parentHeight = parentRect.height
  const elWidth = elRect.width
  const elHeight = elRect.height

  const styleUpdates = {}
  if (direction === 'left') styleUpdates.left = '0px'
  if (direction === 'center') styleUpdates.left = `${Math.round((parentWidth - elWidth) / 2)}px`
  if (direction === 'right') styleUpdates.left = `${Math.round(parentWidth - elWidth)}px`
  if (direction === 'top') styleUpdates.top = '0px'
  if (direction === 'middle') styleUpdates.top = `${Math.round((parentHeight - elHeight) / 2)}px`
  if (direction === 'bottom') styleUpdates.top = `${Math.round(parentHeight - elHeight)}px`

  selected.addStyle(styleUpdates)
}

editor.Commands.add('align:left', { run: () => alignSelected('left') })
editor.Commands.add('align:center', { run: () => alignSelected('center') })
editor.Commands.add('align:right', { run: () => alignSelected('right') })
editor.Commands.add('align:top', { run: () => alignSelected('top') })
editor.Commands.add('align:middle', { run: () => alignSelected('middle') })
editor.Commands.add('align:bottom', { run: () => alignSelected('bottom') })

editor.Panels.addPanel({
  id: 'align-panel',
  visible: true,
  buttons: [
    { id: 'align-left', className: 'fa fa-align-left', command: 'align:left', attributes: { title: 'Balra igazítás' } },
    { id: 'align-center', className: 'fa fa-align-center', command: 'align:center', attributes: { title: 'Vízszintes középre' } },
    { id: 'align-right', className: 'fa fa-align-right', command: 'align:right', attributes: { title: 'Jobbra igazítás' } },
    { id: 'align-top', className: 'fa fa-long-arrow-up', command: 'align:top', attributes: { title: 'Felülre igazítás' } },
    { id: 'align-middle', className: 'fa fa-arrows-v', command: 'align:middle', attributes: { title: 'Függőleges középre' } },
    { id: 'align-bottom', className: 'fa fa-long-arrow-down', command: 'align:bottom', attributes: { title: 'Alulra igazítás' } },
  ],
})

// Alakzat szín / körvonal beállítás a Style Manager-ben
editor.StyleManager.addSector(
  'shape-style',
  {
    name: 'Alakzat',
    open: true,
    properties: [
      { property: 'fill', type: 'color', defaults: '#3b82f6', label: 'Kitöltés' },
      { property: 'stroke', type: 'color', defaults: 'transparent', label: 'Körvonal' },
      { property: 'stroke-width', type: 'number', defaults: 0, label: 'Körvonal vastagsága', units: ['px'] },
    ],
  },
  { at: 0 },
)

const htmlFileInput = document.querySelector('#html-file-input')
const jsonFileInput = document.querySelector('#json-file-input')

document.querySelector('#load-file-btn').addEventListener('click', () => {
  htmlFileInput.click()
})

htmlFileInput.addEventListener('change', () => {
  const [file] = htmlFileInput.files ?? []
  if (!file) {
    return
  }

  const reader = new FileReader()
  reader.addEventListener('load', () => {
    if (typeof reader.result !== 'string') {
      window.alert('A kiválasztott HTML fájl nem olvasható szövegként.')
      htmlFileInput.value = ''
      return
    }

    try {
      const documentParser = new DOMParser()
      const importedDocument = documentParser.parseFromString(reader.result, 'text/html')
      const importedBody = importedDocument.body
      const bodyMarkup = importedBody?.innerHTML.trim() || ''
      const importedStyles = [...importedDocument.querySelectorAll('style')]
        .map((styleElement) => styleElement.textContent || '')
        .join('\n')

      if (!bodyMarkup) {
        throw new Error('A HTML-fájl nem tartalmaz megjeleníthető body-tartalmat.')
      }

      const componentMarkup = bodyMarkup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')

      // Ha az importált CSS önálló `body{...}` szabályt tartalmaz (pl. egy
      // fix méretű, saját body-ra tervezett grafika), az szó szerint a
      // canvas iframe VALÓDI <body>-jára vonatkozna, nem a beillesztett
      // tartalomra — ez elcsúsztatja a right/bottom alapú abszolút
      // pozicionált elemeket a látható lapon kívülre. Ezért a tartalmat egy
      // saját konténerbe csomagoljuk, és a `body` szelektort erre a
      // konténerre írjuk át, hogy a pozicionálási referencia-keret a
      // beillesztett tartalomé legyen, ne a valódi canvas body-é.
      const hasBodyRule = /(^|\})\s*body\s*(,|\{)/.test(importedStyles)
      let importMarkup = componentMarkup
      let importStyles = importedStyles

      if (hasBodyRule) {
        importMarkup = `<div class="imported-page">${componentMarkup}</div>`
        importStyles = importedStyles.replace(/(^|\})([^{}]+)\{/g, (match, brace, selectorList) => {
          const rewrittenSelectors = selectorList
            .split(',')
            .map((selector) => (selector.trim() === 'body' ? '.imported-page' : selector))
            .join(',')
          return `${brace}${rewrittenSelectors}{`
        })

        const bodyRuleMatch = importedStyles.match(/(^|\})\s*body\s*\{([^}]*)\}/)
        const widthMatch = bodyRuleMatch?.[2].match(/width\s*:\s*([\d.]+)px/)
        const heightMatch = bodyRuleMatch?.[2].match(/height\s*:\s*([\d.]+)px/)
        if (widthMatch && heightMatch) {
          const SHEET_WIDTH = 1123
          const SHEET_HEIGHT = 794
          const importedWidth = parseFloat(widthMatch[1])
          const importedHeight = parseFloat(heightMatch[1])
          const scale = Math.min(1, SHEET_WIDTH / importedWidth, SHEET_HEIGHT / importedHeight)
          if (scale < 1) {
            importStyles += `\n.imported-page { transform: scale(${scale}); transform-origin: top left; }`
          }
        }
      }

      editor.setComponents(importMarkup)
      if (importStyles.trim()) {
        editor.Css.addRules(importStyles)
      }

      const bodyAttributes = [...(importedBody?.attributes || [])].reduce((attributes, attribute) => {
        attributes[attribute.name] = attribute.value
        return attributes
      }, {})
      if (Object.keys(bodyAttributes).length) {
        editor.getWrapper().setAttributes(bodyAttributes)
      }

      editor.refresh()
      if (!editor.getHtml().trim()) {
        throw new Error('A HTML-fájl tartalma nem hozott létre megjeleníthető komponenst.')
      }
    } catch (error) {
      console.error('HTML-import sikertelen:', error)
      window.alert(`A HTML-fájl betöltése sikertelen: ${error.message}`)
    } finally {
      htmlFileInput.value = ''
    }
  })
  reader.addEventListener('error', () => {
    window.alert(`A(z) "${file.name}" HTML-fájl beolvasása sikertelen.`)
    htmlFileInput.value = ''
  })
  reader.readAsText(file)
})

document.querySelector('#load-project-btn').addEventListener('click', () => {
  jsonFileInput.click()
})

jsonFileInput.addEventListener('change', () => {
  const [file] = jsonFileInput.files ?? []
  if (!file) {
    return
  }

  const reader = new FileReader()
  reader.addEventListener('load', () => {
    try {
      if (typeof reader.result !== 'string') {
        throw new Error('A projektfájl nem olvasható szövegként.')
      }

      const projectData = JSON.parse(reader.result)
      if (!projectData || typeof projectData !== 'object' || Array.isArray(projectData)) {
        throw new Error('A projektfájl nem objektum formátumú.')
      }

      editor.loadProjectData(projectData)
    } catch (error) {
      console.error('Projekt betöltése sikertelen:', error)
      window.alert(
        'Ez nem egy érvényes GrapesJS projektfájl (.json)! PDF-fájlokat közvetlenül nem lehet szerkeszteni, csak menteni.',
      )
    } finally {
      jsonFileInput.value = ''
    }
  })
  reader.addEventListener('error', () => {
    window.alert(`A(z) "${file.name}" projektfájl beolvasása sikertelen.`)
    jsonFileInput.value = ''
  })
  reader.readAsText(file)
})

document.querySelector('#save-project-btn').addEventListener('click', () => {
  const projectData = editor.getProjectData()
  const projectBlob = new Blob([JSON.stringify(projectData, null, 2)], {
    type: 'application/json',
  })
  const downloadUrl = URL.createObjectURL(projectBlob)
  const downloadLink = document.createElement('a')

  downloadLink.href = downloadUrl
  downloadLink.download = 'brossura-projekt.json'
  downloadLink.click()
  URL.revokeObjectURL(downloadUrl)
})

document.querySelector('#undo-btn').addEventListener('click', () => {
  editor.UndoManager.undo()
})

document.querySelector('#redo-btn').addEventListener('click', () => {
  editor.UndoManager.redo()
})

document.querySelector('#code-btn').addEventListener('click', () => {
  const htmlCode = editor.CodeManager.getCode(editor.getWrapper(), 'html')
  const cssCode = editor.CodeManager.getCode(editor.getWrapper(), 'css')
  const container = document.createElement('div')
  const htmlHeading = document.createElement('h3')
  const htmlTextarea = document.createElement('textarea')
  const cssHeading = document.createElement('h3')
  const cssTextarea = document.createElement('textarea')

  htmlHeading.textContent = 'HTML Kód'
  cssHeading.textContent = 'CSS Kód'
  htmlTextarea.value = htmlCode
  cssTextarea.value = cssCode
  htmlTextarea.className = 'gjs-code-viewer'
  cssTextarea.className = 'gjs-code-viewer'
  container.append(htmlHeading, htmlTextarea, cssHeading, cssTextarea)

  editor.Modal.setTitle('Projekt Forráskódja')
  editor.Modal.setContent(container)
  editor.Modal.open()
})

let isPreview = false
const previewBtnEl = document.querySelector('#preview-btn')

function setPreviewMode(active) {
  if (active === isPreview) return
  isPreview = active
  editor.runCommand(isPreview ? 'preview' : 'stop-preview')
  previewBtnEl.textContent = isPreview ? '✏️ Szerkesztés' : '👁️ Előnézet'
}

previewBtnEl.addEventListener('click', () => {
  setPreviewMode(!isPreview)
})

document.querySelector('#pdf-btn').addEventListener('click', () => {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    window.alert('A nyomtatási ablak megnyitását a böngésző blokkolta.')
    return
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="hu">
      <head>
        <meta charset="UTF-8">
        <title>Brossúra PDF</title>
        <style>
          ${editor.getCss()}
          @page { size: A4 portrait; margin: 0; }
          body { margin: 0; background: #fff; }
        </style>
      </head>
      <body>${editor.getHtml()}</body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  // A document.close() után a `load` már lefuthatott, ezért nem arra várunk.
  if (printWindow.document.readyState === 'complete') {
    printWindow.print()
  } else {
    printWindow.addEventListener('load', () => printWindow.print(), { once: true })
  }
})

editor.Panels.addButton('options', {
  id: 'import-file',
  className: 'fa fa-folder-open',
  command: 'open-assets',
  attributes: { title: 'Asset Manager megnyitása' },
})

// --- Nagyítás / kicsinyítés ---
const ZOOM_STEP = 10
const ZOOM_MIN = 20
const ZOOM_MAX = 200
const zoomLevelEl = document.querySelector('#zoom-level')

function setZoom(value) {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value)))
  editor.Canvas.setZoom(clamped)
  zoomLevelEl.textContent = `${clamped}%`
}

document.querySelector('#zoom-in-btn').addEventListener('click', () => {
  setZoom(editor.Canvas.getZoom() + ZOOM_STEP)
})

document.querySelector('#zoom-out-btn').addEventListener('click', () => {
  setZoom(editor.Canvas.getZoom() - ZOOM_STEP)
})

document.querySelector('#zoom-reset-btn').addEventListener('click', () => {
  setZoom(100)
})

document.querySelector('#zoom-fit-btn').addEventListener('click', () => {
  const viewportWidth = document.querySelector('#gjs').clientWidth
  const canvasPanelWidth = window.matchMedia('(max-width: 768px)').matches
    ? viewportWidth
    : viewportWidth - 240
  const sheetWidth = 1123
  const fitZoom = (canvasPanelWidth / sheetWidth) * 100 - 4
  setZoom(fitZoom)
})

editor.on('canvas:zoom', () => {
  zoomLevelEl.textContent = `${Math.round(editor.Canvas.getZoom())}%`
})

// --- Tartalom nézet-zoom: a lap mérete fixen marad, csak a rajta lévő
// tartalom (szöveg, alakzatok) nő/zsugorodik rá-nézésre. Mivel ez a
// GrapesJS saját kattintás/húzás-koordinátáival ütközne, csak nézetként
// működik: nem 100%-on a szerkesztés zárolva van (előnézet-mód). ---
const CONTENT_ZOOM_STEP = 10
const CONTENT_ZOOM_MIN = 50
const CONTENT_ZOOM_MAX = 200
const contentZoomLevelEl = document.querySelector('#content-zoom-level')
let contentZoomValue = 100
let contentZoomLockedPreview = false

function applyContentZoomStyle() {
  const doc = editor.Canvas.getDocument()
  if (!doc) return
  let styleEl = doc.querySelector('#content-zoom-style')
  if (!styleEl) {
    styleEl = doc.createElement('style')
    styleEl.id = 'content-zoom-style'
    doc.head.append(styleEl)
  }
  const scale = contentZoomValue / 100
  styleEl.textContent =
    contentZoomValue === 100
      ? ''
      : `.sheet-panel, [data-gjs-type="wrapper"] > *:not(.sheet) {
          transform: scale(${scale});
          transform-origin: top left;
        }`
}

function setContentZoom(value) {
  contentZoomValue = Math.min(CONTENT_ZOOM_MAX, Math.max(CONTENT_ZOOM_MIN, Math.round(value)))
  contentZoomLevelEl.textContent = `${contentZoomValue}%`
  applyContentZoomStyle()

  const shouldLock = contentZoomValue !== 100
  if (shouldLock && !isPreview) {
    contentZoomLockedPreview = true
    setPreviewMode(true)
  } else if (!shouldLock && contentZoomLockedPreview) {
    contentZoomLockedPreview = false
    setPreviewMode(false)
  }
}

document.querySelector('#content-zoom-in-btn').addEventListener('click', () => {
  setContentZoom(contentZoomValue + CONTENT_ZOOM_STEP)
})

document.querySelector('#content-zoom-out-btn').addEventListener('click', () => {
  setContentZoom(contentZoomValue - CONTENT_ZOOM_STEP)
})

document.querySelector('#content-zoom-reset-btn').addEventListener('click', () => {
  setContentZoom(100)
})

// A canvas iframe újratöltődhet (pl. oldalváltáskor), ilyenkor a
// befecskendezett stílust újra kell alkalmazni, különben elveszne.
editor.on('canvas:frame:load', () => applyContentZoomStyle())

// --- QR-kód generátor ---
editor.Commands.add('qr:configure', {
  run(ed) {
    const component = ed.getSelected()
    if (!component) return

    const container = document.createElement('div')
    const label = document.createElement('label')
    const textInput = document.createElement('textarea')
    const generateBtn = document.createElement('button')
    const preview = document.createElement('div')

    label.textContent = 'QR-kód tartalma (URL vagy szöveg):'
    label.className = 'gjs-qr-label'
    textInput.className = 'gjs-code-viewer'
    textInput.style.height = '80px'
    textInput.value = component.get('qrText') || ''
    generateBtn.type = 'button'
    generateBtn.className = 'tb-btn primary'
    generateBtn.textContent = 'QR-kód generálása és beillesztése'
    preview.className = 'gjs-qr-preview'

    container.append(label, textInput, generateBtn, preview)
    ed.Modal.setTitle('QR-kód beállítása')
    ed.Modal.setContent(container)
    ed.Modal.open()

    generateBtn.addEventListener('click', async () => {
      const text = textInput.value.trim()
      if (!text) {
        window.alert('Adj meg egy szöveget vagy URL-t a QR-kódhoz.')
        return
      }

      try {
        const dataUrl = await QRCode.toDataURL(text, { margin: 1, width: 320 })
        component.set('qrText', text)
        component.components().reset([])
        component.addStyle({ background: `url("${dataUrl}") center / contain no-repeat`, color: 'transparent' })
        preview.innerHTML = `<img src="${dataUrl}" alt="QR-kód előnézet" style="width:120px;height:120px;" />`
        ed.Modal.close()
      } catch (error) {
        console.error('QR-kód generálása sikertelen:', error)
        window.alert(`A QR-kód generálása sikertelen: ${error.message}`)
      }
    })
  },
})

// --- Unsplash képtár tallózás ---
editor.Panels.addButton('options', {
  id: 'unsplash-search',
  className: 'fa fa-picture-o',
  command: 'unsplash:open',
  attributes: { title: 'Ingyenes képtár (Unsplash) tallózása' },
})

editor.Commands.add('unsplash:open', {
  run(ed) {
    if (!UNSPLASH_ACCESS_KEY) {
      window.alert(
        'Az Unsplash képtár használatához adj meg egy API-kulcsot a VITE_UNSPLASH_ACCESS_KEY környezeti változóban (.env fájl), majd indítsd újra a szervert.\n\nIngyenes kulcs igényelhető: https://unsplash.com/developers',
      )
      return
    }

    const container = document.createElement('div')
    const searchRow = document.createElement('div')
    const searchInput = document.createElement('input')
    const searchBtn = document.createElement('button')
    const resultsGrid = document.createElement('div')

    searchRow.className = 'gjs-unsplash-search-row'
    searchInput.type = 'text'
    searchInput.placeholder = 'Keresés az Unsplash képtárban…'
    searchInput.className = 'gjs-unsplash-input'
    searchBtn.type = 'button'
    searchBtn.className = 'tb-btn primary'
    searchBtn.textContent = 'Keresés'
    resultsGrid.className = 'gjs-unsplash-grid'

    searchRow.append(searchInput, searchBtn)
    container.append(searchRow, resultsGrid)
    ed.Modal.setTitle('Ingyenes képtár (Unsplash)')
    ed.Modal.setContent(container)
    ed.Modal.open()

    const runSearch = async () => {
      const query = searchInput.value.trim()
      if (!query) return
      resultsGrid.innerHTML = 'Keresés folyamatban…'

      try {
        const response = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=20`,
          { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } },
        )
        if (!response.ok) {
          throw new Error(`Unsplash API hiba (${response.status})`)
        }
        const data = await response.json()
        resultsGrid.innerHTML = ''

        if (!data.results?.length) {
          resultsGrid.textContent = 'Nincs találat.'
          return
        }

        data.results.forEach((photo) => {
          const thumb = document.createElement('img')
          thumb.src = photo.urls.thumb
          thumb.title = photo.alt_description || 'Unsplash kép'
          thumb.className = 'gjs-unsplash-thumb'
          thumb.addEventListener('click', () => {
            const fullUrl = photo.urls.regular
            editor.AssetManager.add({ src: fullUrl, name: photo.alt_description || 'unsplash-kep' })

            const selected = editor.getSelected()
            if (selected && selected.get('type') === 'image') {
              selected.set('src', fullUrl)
            } else {
              editor.getWrapper().append({
                type: 'image',
                src: fullUrl,
                dragMode: 'absolute',
                style: { position: 'absolute', top: '20px', left: '20px', width: '240px' },
              })
            }
            ed.Modal.close()
          })
          resultsGrid.append(thumb)
        })
      } catch (error) {
        console.error('Unsplash keresés sikertelen:', error)
        resultsGrid.textContent = `Hiba történt a keresés közben: ${error.message}`
      }
    }

    searchBtn.addEventListener('click', runSearch)
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') runSearch()
    })
  },
})

// --- Mobil nézet: a jobb oldali panel (blokkok/stílus/rétegek) egy
// teljes szélességű "fiókként" jelenik meg, amit be lehet zárni, hogy a
// canvas is látszódjon egy keskeny telefonképernyőn ---
const mobileMediaQuery = window.matchMedia('(max-width: 768px)')
const panelToggleCommands = ['open-blocks', 'open-sm', 'open-layers', 'open-tm']

function isMobileView() {
  return mobileMediaQuery.matches
}

function setPanelDrawerOpen(isOpen) {
  document.querySelector('#gjs').classList.toggle('mobile-panel-open', isOpen)
}

panelToggleCommands.forEach((commandId) => {
  editor.on(`command:run:${commandId}`, () => {
    if (isMobileView()) setPanelDrawerOpen(true)
  })
  editor.on(`command:stop:${commandId}`, () => {
    if (isMobileView() && !panelToggleCommands.some((id) => editor.Commands.isActive(id))) {
      setPanelDrawerOpen(false)
    }
  })
})

// A grapesjs-preset-webpage plugin automatikusan aktiválja a "Blokkok"
// panelt betöltéskor ('load' esemény), ami a fenti figyelők miatt
// tévesen nyitva tartaná a mobil fiókot már az első megnyitáskor is,
// pedig a felhasználó még nem kattintott semmire. Ezért induláskor
// (a 'load' után, hogy az alapértelmezett aktiválás már megtörténjen)
// erőltetve zárjuk a fiókot mobilon.
editor.on('load', () => {
  setTimeout(() => {
    if (!isMobileView()) return
    panelToggleCommands.forEach((commandId) => {
      if (editor.Commands.isActive(commandId)) editor.stopCommand(commandId)
    })
    setPanelDrawerOpen(false)
  }, 0)
})

const panelCloseBtn = document.createElement('button')
panelCloseBtn.id = 'mobile-panel-close-btn'
panelCloseBtn.type = 'button'
panelCloseBtn.textContent = '✕ Bezárás'
panelCloseBtn.addEventListener('click', () => {
  panelToggleCommands.forEach((commandId) => {
    if (editor.Commands.isActive(commandId)) editor.stopCommand(commandId)
  })
  setPanelDrawerOpen(false)
})
// A GrapesJS újrarajzolja a panel tartalmát (pl. panelváltáskor), ami
// törölné a beágyazott gombot, ezért ezt önálló, rögzített elemként
// adjuk a body-hoz, nem a panel konténer belsejébe.
document.body.append(panelCloseBtn)
