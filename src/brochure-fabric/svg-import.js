import { loadSVGFromString } from 'fabric'

// Natív SVG-import: a Fabric.js közvetlenül vektoros objektumokra parse-olja
// az SVG-t (útvonalak, alakzatok, szöveg), sokkal hűségesebben, mint a
// html2canvas-alapú rasterizálás — ez SVG-fájlokhoz az elsődlegesen
// ajánlott import-mód.
export async function importSvgFile(file, canvas) {
  const text = await file.text()
  const { objects } = await loadSVGFromString(text)
  const validObjects = objects.filter(Boolean)

  if (!validObjects.length) {
    throw new Error('Az SVG-fájlban nem található importálható elem.')
  }

  validObjects.forEach((object) => canvas.add(object))
  canvas.setActiveObject(validObjects[validObjects.length - 1])
  canvas.requestRenderAll()
}
