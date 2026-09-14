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
import './style.css'

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
  layerManager: {
    appendTo: '.layers-container',
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
  canvas: {
    styles: [
      `
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
      `,
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
    ],
  },
  panels: {
    defaults: [
      {
        id: 'panels',
        el: '.panel__top',
        command: 'sw-visibility',
      },
      {
        id: 'basic-actions',
        el: '.panel__basic-actions',
        buttons: [
          {
            id: 'visibility',
            active: true,
            className: 'btn-toggle-borders',
            command: 'sw-visibility',
          },
        ],
      },
      {
        id: 'views',
        el: '.panel__right',
        buttons: [
          {
            id: 'open-blocks',
            active: true,
            className: 'fa fa-th-large',
            command: 'open-blocks',
            togglable: false,
          },
          {
            id: 'open-sm',
            className: 'fa fa-paint-brush',
            command: 'open-sm',
            togglable: false,
          },
          {
            id: 'open-layers',
            className: 'fa fa-bars',
            command: 'open-layers',
            togglable: false,
          },
        ],
      },
    ],
  },
})

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
      const bodyMarkup = importedDocument.body?.innerHTML.trim() || ''
      const importedStyles = [...importedDocument.querySelectorAll('style')]
        .map((styleElement) => styleElement.textContent || '')
        .join('\n')

      if (!bodyMarkup) {
        throw new Error('A HTML-fájl nem tartalmaz megjeleníthető body-tartalmat.')
      }

      editor.setComponents(bodyMarkup)
      if (importedStyles.trim()) {
        editor.setStyle(importedStyles)
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
document.querySelector('#preview-btn').addEventListener('click', (event) => {
  isPreview = !isPreview
  editor.runCommand(isPreview ? 'preview' : 'stop-preview')
  event.currentTarget.textContent = isPreview ? '✏️ Szerkesztés' : '👁️ Előnézet'
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
  printWindow.addEventListener('load', () => {
    printWindow.focus()
    printWindow.print()
  })
})

editor.Panels.addButton('options', {
  id: 'import-file',
  className: 'fa fa-folder-open',
  command: 'open-assets',
  attributes: { title: 'Asset Manager megnyitása' },
})
