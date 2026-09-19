import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { html } from '@codemirror/lang-html'
import { oneDark } from '@codemirror/theme-one-dark'
import { buildHtmlDocument, exportToHtml } from './html-export.js'
import { importHtmlText } from './html-import.js'
import { notifyError } from '../ui/toast.js'
import { create } from '../ui/dom.js'
import { openModal } from '../ui/modal.js'

// "Kódnézet": a canvas tartalmának megfelelő HTML/SVG-jelölés megtekintése és
// visszaimportálása. A szerkesztett HTML újra felépíti a teljes vásznat, ezért
// egyetlen alkalmazás egyetlen undo-lépésként kezelhető.
//
// Korábban a modal bezárása nem pusztította el az EditorView-t (az ezt
// végző closeCodeView() exportált volt, de sehonnan nem hívta senki), így
// a CodeMirror-példány a következő megnyitásig életben maradt. A modal
// onClose hookja most garantálja a felszabadítást.

export function openCodeView(canvas, history) {
  const editorHost = create('div', { class: 'code-view__editor' })

  const applyBtn = create('button', {
    type: 'button',
    class: 'btn btn--primary',
    textContent: 'Kód alkalmazása',
    disabled: false,
  })

  const downloadBtn = create('button', {
    type: 'button',
    class: 'btn btn--primary',
    textContent: 'Letöltés HTML-ként',
  })
  applyBtn.addEventListener('click', async () => {
    if (!editorView) return
    applyBtn.disabled = true
    try {
      const htmlText = editorView.state.doc.toString()
      await history.batch(() => importHtmlText(htmlText, canvas, { replace: true }))
      closeModalAfterApply?.()
    } catch (error) {
      console.error('Kód alkalmazása sikertelen:', error)
      notifyError(`A kód alkalmazása sikertelen: ${error.message}`)
      applyBtn.disabled = false
    }
  })
  downloadBtn.addEventListener('click', () => exportToHtml(canvas))

  const content = create('div', { class: 'code-view' }, [
    create('div', { class: 'code-view__toolbar' }, [applyBtn, downloadBtn]),
    editorHost,
  ])

  let editorView = null
  let closeModalAfterApply = null

  openModal({
    title: 'Kódnézet (HTML/SVG)',
    content,
    size: 'lg',
    onClose: () => {
      editorView?.destroy()
      editorView = null
    },
  })
  closeModalAfterApply = () => {
    const closeButton = content.closest('.modal')?.querySelector('.modal__close')
    closeButton?.click()
  }

  editorView = new EditorView({
    state: EditorState.create({
      doc: buildHtmlDocument(canvas),
      extensions: [basicSetup, html(), oneDark, EditorView.editable.of(true)],
    }),
    parent: editorHost,
  })
}
