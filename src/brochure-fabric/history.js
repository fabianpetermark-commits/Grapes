// Undo/redo history stack. A Fabric-nak (ellentétben a GrapesJS
// UndoManager-rel) nincs beépített visszavonás/mégis — minden módosító
// esemény után pillanatképet (`canvas.toJSON()`) veszünk, és
// `canvas.loadFromJSON()`-nel ugrunk a megfelelő indexre. A
// `loadFromJSON` maga is triggereli a módosító eseményeket, ezért a
// history-push logikát ideiglenesen kikapcsoljuk betöltés alatt
// (`isRestoring`), különben végtelen ciklus/duplikált bejegyzés lenne.

const MAX_HISTORY = 50

export function initHistory(canvas) {
  const stack = []
  let index = -1
  let isRestoring = false

  function pushSnapshot() {
    if (isRestoring) return
    const snapshot = JSON.stringify(canvas.toJSON())
    stack.splice(index + 1)
    stack.push(snapshot)
    if (stack.length > MAX_HISTORY) {
      stack.shift()
    }
    index = stack.length - 1
  }

  function restore(snapshot) {
    isRestoring = true
    canvas.loadFromJSON(JSON.parse(snapshot)).then(() => {
      canvas.requestRenderAll()
      isRestoring = false
    })
  }

  canvas.on('object:added', pushSnapshot)
  canvas.on('object:removed', pushSnapshot)
  canvas.on('object:modified', pushSnapshot)

  // Kezdő (üres lap) állapot mentése.
  pushSnapshot()

  function undo() {
    if (index <= 0) return
    index -= 1
    restore(stack[index])
  }

  function redo() {
    if (index >= stack.length - 1) return
    index += 1
    restore(stack[index])
  }

  return { undo, redo }
}
