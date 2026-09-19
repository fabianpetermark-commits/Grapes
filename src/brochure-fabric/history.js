// Undo/redo history stack for the Fabric editor.
//
// A snapshot is recorded after direct Fabric modifications and explicitly
// from property-panel operations (Fabric's set() does not emit
// object:modified). Compound operations can be wrapped in batch(), so one
// user action creates one history entry instead of several intermediate ones.

const MAX_HISTORY = 50

export function initHistory(canvas) {
  const stack = []
  let index = -1
  let isRestoring = false
  let batchDepth = 0
  let batchDirty = false

  function snapshot() {
    return JSON.stringify(canvas.toJSON())
  }

  function pushSnapshot() {
    if (isRestoring) return
    const current = snapshot()
    if (stack[index] === current) return
    stack.splice(index + 1)
    stack.push(current)
    if (stack.length > MAX_HISTORY) stack.shift()
    index = stack.length - 1
  }

  function record() {
    if (isRestoring) return
    if (batchDepth > 0) {
      batchDirty = true
      return
    }
    pushSnapshot()
  }

  function batch(fn) {
    if (isRestoring) return fn()
    batchDepth += 1
    try {
      return fn()
    } finally {
      batchDepth -= 1
      if (batchDepth === 0 && batchDirty) {
        batchDirty = false
        pushSnapshot()
      }
    }
  }

  async function restore(snapshotText) {
    isRestoring = true
    try {
      await canvas.loadFromJSON(JSON.parse(snapshotText))
      canvas.requestRenderAll()
    } finally {
      isRestoring = false
    }
  }

  canvas.on('object:added', record)
  canvas.on('object:removed', record)
  canvas.on('object:modified', record)

  function reset() {
    stack.length = 0
    index = -1
    pushSnapshot()
  }

  // Kezdeti (üres lap) állapot mentése.
  reset()

  async function undo() {
    if (isRestoring || index <= 0) return
    index -= 1
    await restore(stack[index])
  }

  async function redo() {
    if (isRestoring || index >= stack.length - 1) return
    index += 1
    await restore(stack[index])
  }

  return { undo, redo, record, batch, reset }
}
