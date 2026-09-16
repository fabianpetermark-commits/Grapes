// Valódi HTML export: a Fabric canvas natív `toSVG()` metódusát használjuk,
// ami a natívan létrehozott elemeket (szöveg, alakzatok, feltöltött/Unsplash/
// QR képek) valódi, szerkeszthető SVG-jelölésként exportálja — a szöveg
// továbbra is kijelölhető/kereshető <text> elem, nem rasterizált kép.
//
// FONTOS: a html2canvas-szal importált HTML-fájlok (html-import.js) a
// canvason egyetlen rasterizált Fabric Image objektumként élnek — ez
// szándékos, mert pont ez szünteti meg az eredeti pozicionálási
// hibaosztályt. Emiatt egy importált grafika az exportált HTML-ben is egy
// <image> marad, nem bomlik vissza elemenként szerkeszthető jelöléssé.
// A tényleges HTML-dokumentum felépítése külön függvényben, hogy a
// code-view.js (Kódnézet) is újrahasználhassa ugyanazt a tartalmat, amit
// ez a export letölt — nincs duplikált canvas.toSVG()+wrapper logika.
export function buildHtmlDocument(canvas) {
  const svgMarkup = canvas.toSVG()
  return `<!doctype html>
<html lang="hu">
  <head>
    <meta charset="utf-8" />
    <title>Brossúra export</title>
    <style>
      html, body { margin: 0; padding: 0; }
      svg { display: block; }
    </style>
  </head>
  <body>
${svgMarkup}
  </body>
</html>
`
}

export function exportToHtml(canvas) {
  const html = buildHtmlDocument(canvas)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'brossura.html'
  link.click()
  URL.revokeObjectURL(url)
}
