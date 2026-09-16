import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { html } from '@codemirror/lang-html'
import { oneDark } from '@codemirror/theme-one-dark'
import { buildHtmlDocument, exportToHtml } from './html-export.js'
import { openModal, closeModal } from './modal.js'

// "Kódnézet": a canvas tartalmának megfelelő HTML/SVG-jelölés megtekintése
// CodeMirror-ral, szintaxis-kiemeléssel (a felhasználó az Adobe Brackets
// kódszerkesztőt említette ötletként — magát az archivált alkalmazást nem
// lehet beépíteni, de az általa is használt CodeMirror könyvtárat igen).
// Első körben csak megtekintésre/másolásra szolgál — a szerkesztett kód
// visszaimportálása a canvasra egy későbbi lépés.
let editorView = null

export function openCodeView(canvas) {
  const container = document.createElement('div')
  container.className = 'fabric-code-view'

  const toolbar = document.createElement('div')
  toolbar.className = 'fabric-code-view-toolbar'
  const downloadBtn = document.createElement('button')
  downloadBtn.type = 'button'
  downloadBtn.className = 'tb-btn success'
  downloadBtn.textContent = '💾 Letöltés'
  downloadBtn.addEventListener('click', () => exportToHtml(canvas))
  toolbar.append(downloadBtn)

  const editorHost = document.createElement('div')
  editorHost.className = 'fabric-code-view-editor'

  container.append(toolbar, editorHost)
  openModal('Kódnézet (HTML/SVG)', container)

  const htmlContent = buildHtmlDocument(canvas)

  if (editorView) {
    editorView.destroy()
    editorView = null
  }

  editorView = new EditorView({
    state: EditorState.create({
      doc: htmlContent,
      extensions: [basicSetup, html(), oneDark, EditorView.editable.of(true)],
    }),
    parent: editorHost,
  })
}

export function closeCodeView() {
  closeModal()
  if (editorView) {
    editorView.destroy()
    editorView = null
  }
}
