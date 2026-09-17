import { notifyError } from '../ui/toast.js'

// PDF export/nyomtatás: a canvas-t nagyobb felbontású PNG-vé rendereljük
// (multiplier: 2), majd egy nyomtatható ablakba fecskendezzük @page A4
// fekvő CSS-sel — ugyanazt a print-window mintát követi, mint a GrapesJS-es
// #pdf-btn logika (main.js), csak editor.getHtml()/getCss() helyett képet
// rendereket.
// A nyomtatást csak akkor indítjuk, ha a beágyazott kép ténylegesen betöltött.
// A `load` eseményre feliratkozni a document.close() után késő: a legtöbb
// böngészőben ilyenkor már lefutott, és a print() sosem hívódott meg.
function printOnceReady(printWindow) {
  const start = () => {
    try {
      printWindow.print()
    } catch (error) {
      console.error('A nyomtatás indítása sikertelen:', error)
    }
  }

  const image = printWindow.document.querySelector('img')
  if (!image) {
    start()
    return
  }
  if (image.complete) {
    start()
    return
  }
  image.addEventListener('load', start, { once: true })
  image.addEventListener('error', start, { once: true })
}

export function exportToPdf(canvas) {
  let dataUrl
  try {
    dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 })
  } catch (error) {
    // Egyetlen CORS-hibás kép is "megmérgezi" a vásznat, és ilyenkor a
    // toDataURL SecurityError-t dob. Korábban ez lekezeletlen volt: a PDF
    // gomb egyszerűen nem csinált semmit.
    console.error('A vászon képpé alakítása sikertelen:', error)
    notifyError(
      'A lap nem exportálható, mert külső forrásból származó kép van rajta. Töltsd fel a képet fájlként, majd próbáld újra.',
    )
    return
  }

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    notifyError('A felugró ablakot a böngésző letiltotta. Engedélyezd a felugró ablakokat a PDF-exporthoz.')
    return
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="hu">
      <head>
        <meta charset="utf-8" />
        <title>Brossúra nyomtatás</title>
        <style>
          @page { size: A4 landscape; margin: 0; }
          html, body { margin: 0; padding: 0; }
          img { width: 100%; height: 100%; object-fit: contain; display: block; }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" alt="Brossúra lap" />
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  printOnceReady(printWindow)
}
