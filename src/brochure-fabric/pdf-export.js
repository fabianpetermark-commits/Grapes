// PDF export/nyomtatás: a canvas-t nagyobb felbontású PNG-vé rendereljük
// (multiplier: 2), majd egy nyomtatható ablakba fecskendezzük @page A4
// fekvő CSS-sel — ugyanazt a print-window mintát követi, mint a GrapesJS-es
// #pdf-btn logika (main.js), csak editor.getHtml()/getCss() helyett képet
// rendereket.
export function exportToPdf(canvas) {
  const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 })

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    window.alert('A felugró ablakot a böngésző letiltotta. Engedélyezd a felugró ablakokat a PDF-exporthoz.')
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
  printWindow.addEventListener('load', () => {
    printWindow.print()
  })
}
