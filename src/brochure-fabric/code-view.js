import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { html } from '@codemirror/lang-html'
import { oneDark } from '@codemirror/theme-one-dark'
import { buildHtmlDocument, exportToHtml } from './html-export.js'
import { create } from '../ui/dom.js'
import { openModal } from '../ui/modal.js'

// "Kódnézet": a canvas tartalmának megfelelő HTML/SVG-jelölés megtekintése
// CodeMirror-ral, szintaxis-kiemeléssel. Első körben csak megtekintésre és
// másolásra szolgál — a szerkesztett kód visszaimportálása későbbi lépés.
//
// Korábban a modal bezárása nem pusztította el az EditorView-t (az ezt
// végző closeCodeView() exportált volt, de sehonnan nem hívta senki), így
// a CodeMirror-példány a következő megnyitásig életben maradt. A modal
// onClose hookja most garantálja a felszabadítást.

export function openCodeView(canvas) {
  const editorHost = create('div', { class: 'code-view__editor' })

  const downloadBtn = create('button', {
    type: 'button',
    class: 'btn btn--primary',
    textContent: 'Letöltés HTML-ként',
  })
  downloadBtn.addEventListener('click', () => exportToHtml(canvas))

  const content = create('div', { class: 'code-view' }, [
    create('div', { class: 'code-view__toolbar' }, [downloadBtn]),
    editorHost,
  ])

  let editorView = null

  openModal({
    title: 'Kódnézet (HTML/SVG)',
    content,
    size: 'lg',
    onClose: () => {
      editorView?.destroy()
      editorView = null
    },
  })

  editorView = new EditorView({
    state: EditorState.create({
      doc: buildHtmlDocument(canvas),
      extensions: [basicSetup, html(), oneDark, EditorView.editable.of(true)],
    }),
    parent: editorHost,
  })
}
