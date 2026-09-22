// JSON projekt mentés/betöltés. FONTOS: ez a formátum NEM kompatibilis a
// régi GrapesJS `.json` projektfájlokkal (a felhasználóval megbeszélt,
// tudatosan vállalt töréses változás — lásd a migrációs tervet). Egy régi
// fájl betöltésekor egyértelmű hibaüzenetet adunk, konverter nélkül.

const FORMAT_VERSION = 1

export function serializeProject(canvas) {
  return {
    format: 'grapes-fabric',
    version: FORMAT_VERSION,
    canvas: canvas.toJSON(),
  }
}

export async function loadProjectData(project, canvas) {
  if (project.format !== 'grapes-fabric') throw new Error('Ez a projekt nem kompatibilis az új brossúra-szerkesztővel.')
  await canvas.loadFromJSON(project.canvas)
  canvas.requestRenderAll()
}

export function saveProject(canvas) {
  const project = serializeProject(canvas)
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'brossura-projekt.json'
  link.click()
  URL.revokeObjectURL(url)
}

export async function loadProject(file, canvas) {
  const text = await file.text()
  let project
  try {
    project = JSON.parse(text)
  } catch {
    throw new Error('A fájl nem érvényes JSON.')
  }

  if (project.format !== 'grapes-fabric') {
    throw new Error(
      'Ez egy régi formátumú projektfájl (a korábbi GrapesJS-alapú szerkesztőből), ami nem kompatibilis az új szerkesztővel. Nyisd meg a régi szerkesztőben (a "?engine=fabric" nélküli URL-en), és exportáld PDF-be, vagy építsd újra ebben a szerkesztőben.',
    )
  }

  await canvas.loadFromJSON(project.canvas)
  canvas.requestRenderAll()
}
