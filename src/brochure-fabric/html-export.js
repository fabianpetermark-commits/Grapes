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
export function exportToHtml(canvas) {
  const svgMarkup = canvas.toSVG()
  const html = `<!doctype html>
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

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'brossura.html'
  link.click()
  URL.revokeObjectURL(url)
}
