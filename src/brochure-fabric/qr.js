import QRCode from 'qrcode'
import { FabricImage } from 'fabric'
import { create } from '../ui/dom.js'
import { openModal, closeModal } from '../ui/modal.js'
import { notifyError } from '../ui/toast.js'

// QR-kód generátor. Korábban az előnézet közvetlenül a modal bezárása előtt
// került a DOM-ba, így soha nem látszott; most a beírt szöveg alapján
// folyamatosan frissül, és a beillesztés külön lépés.

const PREVIEW_OPTIONS = { margin: 1, width: 320 }

export function openQrModal(canvas) {
  const textInput = create('textarea', {
    id: 'qr-text',
    class: 'input input--textarea',
    rows: 3,
    placeholder: 'https://pelda.hu',
  })

  const previewImage = create('img', {
    class: 'qr-preview__image',
    alt: 'A QR-kód előnézete',
    hidden: true,
  })

  const previewHint = create('p', {
    class: 'empty-state empty-state--inline',
    textContent: 'Írj be egy URL-t vagy szöveget, és itt megjelenik az előnézet.',
  })

  const insertBtn = create('button', {
    type: 'button',
    class: 'btn btn--primary',
    textContent: 'Beillesztés a lapra',
    disabled: true,
  })

  const content = create('div', { class: 'qr-form' }, [
    create('label', { class: 'field__label', htmlFor: 'qr-text', textContent: 'A QR-kód tartalma' }),
    textInput,
    create('div', { class: 'qr-preview' }, [previewHint, previewImage]),
    create('div', { class: 'modal__actions' }, [insertBtn]),
  ])

  openModal({ title: 'QR-kód', content })
  textInput.focus()

  let currentDataUrl = ''
  let renderToken = 0

  const refreshPreview = async () => {
    const text = textInput.value.trim()
    const token = (renderToken += 1)

    if (!text) {
      currentDataUrl = ''
      insertBtn.disabled = true
      previewImage.hidden = true
      previewHint.hidden = false
      return
    }

    try {
      const dataUrl = await QRCode.toDataURL(text, PREVIEW_OPTIONS)
      // Gyors gépelésnél a korábbi, lassabb generálás ne írja felül az újat.
      if (token !== renderToken) return
      currentDataUrl = dataUrl
      previewImage.src = dataUrl
      previewImage.hidden = false
      previewHint.hidden = true
      insertBtn.disabled = false
    } catch (error) {
      if (token !== renderToken) return
      console.error('QR-kód generálása sikertelen:', error)
      currentDataUrl = ''
      insertBtn.disabled = true
      previewImage.hidden = true
      previewHint.hidden = false
      previewHint.textContent = `A QR-kód nem generálható: ${error.message}`
    }
  }

  textInput.addEventListener('input', refreshPreview)

  insertBtn.addEventListener('click', async () => {
    if (!currentDataUrl) return
    try {
      const active = canvas.getActiveObject()
      if (active?.type === 'image') {
        await active.setSrc(currentDataUrl)
      } else {
        const image = await FabricImage.fromURL(currentDataUrl)
        image.set({ left: 80, top: 80 })
        canvas.add(image)
        canvas.setActiveObject(image)
      }
      canvas.requestRenderAll()
      closeModal()
    } catch (error) {
      console.error('A QR-kód beillesztése sikertelen:', error)
      notifyError(`A QR-kód beillesztése sikertelen: ${error.message}`)
    }
  })
}
