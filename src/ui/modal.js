// Modális ablak. A korábbi brochure-fabric/modal.js egyetlen, újrahasznált
// overlayt tartott életben, és a bezárás csak elrejtette — a tartalom
// (köztük egy teljes CodeMirror-példány és 20 Unsplash-kép) a dokumentumban
// maradt. Itt a tartalom a záráskor elpusztul, és az onClose hook fut le,
// hogy a hívó fel tudja szabadítani az erőforrásait.

import { create } from './dom.js'
import { trapFocus } from './overlay.js'

let current = null

function destroyCurrent() {
  if (!current) return
  const { overlay, release, onClose } = current
  current = null
  release()
  overlay.remove()
  onClose?.()
}

export function closeModal() {
  destroyCurrent()
}

/**
 * @param {{
 *   title: string,
 *   content: HTMLElement,
 *   size?: 'md' | 'lg',
 *   onClose?: () => void,
 * }} options
 */
export function openModal({ title, content, size = 'md', onClose }) {
  // Egyszerre csak egy modal él; a korábbi rendesen lebomlik.
  destroyCurrent()

  const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`

  const closeBtn = create('button', {
    type: 'button',
    class: 'modal__close btn btn--icon btn--ghost',
    'aria-label': 'Bezárás',
    textContent: '✕',
  })

  const body = create('div', { class: 'modal__body' }, [content])

  const dialog = create(
    'div',
    {
      class: `modal modal--${size}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
    },
    [
      create('div', { class: 'modal__header' }, [
        create('h2', { class: 'modal__title', id: titleId, textContent: title }),
        closeBtn,
      ]),
      body,
    ],
  )

  const overlay = create('div', { class: 'overlay' }, [dialog])

  closeBtn.addEventListener('click', closeModal)
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) closeModal()
  })

  document.body.append(overlay)

  const release = trapFocus(dialog, { onRequestClose: closeModal })
  current = { overlay, release, onClose }

  return { close: closeModal, body }
}
