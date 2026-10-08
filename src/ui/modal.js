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

function dialogMessage(message, icon) {
  return create('div', { class: 'grapes-dialog__message' }, [
    create('span', { class: 'grapes-dialog__icon', textContent: icon, 'aria-hidden': 'true' }),
    create('p', { textContent: message }),
  ])
}

function dialogButton(label, className = 'btn btn--ghost') {
  return create('button', { type: 'button', class: className, textContent: label })
}

/** Grapes-stílusú, nem blokkoló üzenetablak. */
export function showGrapesAlert({
  title = 'Hoppá, egy szőlőszem félrement…',
  message,
  confirmLabel = 'Értem, megnézem',
  icon = '🍇',
} = {}) {
  return new Promise((resolve) => {
    const okay = dialogButton(confirmLabel, 'btn btn--primary')
    const content = create('div', { class: 'grapes-dialog' }, [
      dialogMessage(message, icon),
      create('div', { class: 'modal__actions' }, [okay]),
    ])
    let settled = false
    let modal
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
      modal?.close()
    }
    okay.addEventListener('click', finish)
    modal = openModal({ title, content, onClose: finish })
  })
}

/** Grapes-stílusú igen/nem kérdés. Bezáráskor mindig false az eredmény. */
export function showGrapesConfirm({
  title = 'Most tényleg… komolyan?',
  message,
  confirmLabel = 'Igen, csináljuk',
  cancelLabel = 'Nem, inkább mégse',
  danger = false,
  icon = '🤨',
} = {}) {
  return new Promise((resolve) => {
    const cancel = dialogButton(cancelLabel)
    const confirm = dialogButton(confirmLabel, danger ? 'btn btn--danger' : 'btn btn--primary')
    const content = create('div', { class: 'grapes-dialog' }, [
      dialogMessage(message, icon),
      create('div', { class: 'modal__actions' }, [cancel, confirm]),
    ])
    let settled = false
    let modal
    const finish = (answer) => {
      if (settled) return
      settled = true
      resolve(answer)
      modal?.close()
    }
    cancel.addEventListener('click', () => finish(false))
    confirm.addEventListener('click', () => finish(true))
    modal = openModal({ title, content, onClose: () => finish(false) })
  })
}

/** Grapes-stílusú szövegbevitel. Bezáráskor null az eredmény. */
export function showGrapesPrompt({
  title = 'Na, minek nevezzük?',
  message,
  value = '',
  placeholder = '',
  inputLabel = 'Válasz',
  confirmLabel = 'Mehet',
  cancelLabel = 'Mégsem',
  icon = '✍️',
} = {}) {
  return new Promise((resolve) => {
    const input = create('input', {
      class: 'input grapes-dialog__input',
      type: 'text',
      value,
      placeholder,
      autocomplete: 'off',
    })
    const cancel = dialogButton(cancelLabel)
    const confirm = dialogButton(confirmLabel, 'btn btn--primary')
    const form = create('form', { class: 'grapes-dialog' }, [
      message ? dialogMessage(message, icon) : null,
      create('label', { class: 'field grapes-dialog__field' }, [
        create('span', { class: 'field__label', textContent: inputLabel }),
        input,
      ]),
      create('div', { class: 'modal__actions' }, [cancel, confirm]),
    ])
    let settled = false
    let modal
    const finish = (answer) => {
      if (settled) return
      settled = true
      resolve(answer)
      modal?.close()
    }
    cancel.addEventListener('click', () => finish(null))
    confirm.addEventListener('click', () => finish(input.value))
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      finish(input.value)
    })
    modal = openModal({ title, content: form, onClose: () => finish(null) })
    input.select()
  })
}
