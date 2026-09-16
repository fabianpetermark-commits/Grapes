import QRCode from 'qrcode'
import { FabricImage } from 'fabric'
import { openModal, closeModal } from './modal.js'

// QR-kód generátor: ugyanaz a `qrcode` csomag és generálási logika, mint a
// GrapesJS-es main.js-ben, csak a célobjektum egy Fabric Image, nem egy
// GrapesJS komponens háttérképe.

export function openQrModal(canvas) {
  const container = document.createElement('div')
  const label = document.createElement('label')
  const textInput = document.createElement('textarea')
  const generateBtn = document.createElement('button')
  const preview = document.createElement('div')

  label.textContent = 'QR-kód tartalma (URL vagy szöveg):'
  label.className = 'gjs-qr-label'
  textInput.className = 'gjs-code-viewer'
  textInput.style.height = '80px'
  generateBtn.type = 'button'
  generateBtn.className = 'tb-btn primary'
  generateBtn.textContent = 'QR-kód generálása és beillesztése'
  preview.className = 'gjs-qr-preview'

  container.append(label, textInput, generateBtn, preview)
  openModal('QR-kód beállítása', container)

  generateBtn.addEventListener('click', async () => {
    const text = textInput.value.trim()
    if (!text) {
      window.alert('Adj meg egy szöveget vagy URL-t a QR-kódhoz.')
      return
    }

    try {
      const dataUrl = await QRCode.toDataURL(text, { margin: 1, width: 320 })
      const active = canvas.getActiveObject()
      if (active?.type === 'image') {
        await active.setSrc(dataUrl)
        canvas.requestRenderAll()
      } else {
        const img = await FabricImage.fromURL(dataUrl)
        img.set({ left: 80, top: 80 })
        canvas.add(img)
        canvas.setActiveObject(img)
        canvas.requestRenderAll()
      }
      preview.innerHTML = `<img src="${dataUrl}" alt="QR-kód előnézet" style="width:120px;height:120px;" />`
      closeModal()
    } catch (error) {
      console.error('QR-kód generálása sikertelen:', error)
      window.alert(`A QR-kód generálása sikertelen: ${error.message}`)
    }
  })
}
