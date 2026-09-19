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
  let debounceTimer = null

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
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (isRestoring) return
    if (batchDepth > 0) {
      batchDirty = true
      return
    }
    pushSnapshot()
  }

  function recordDebounced(delay = 250) {
    if (isRestoring) return
    if (batchDepth > 0) {
      batchDirty = true
      return
    }
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      pushSnapshot()
    }, delay)
  }

  function finishBatch() {
    batchDepth -= 1
    if (batchDepth === 0 && batchDirty) {
      batchDirty = false
      pushSnapshot()
    }
  }

  function batch(fn) {
    if (isRestoring) return fn()

    batchDepth += 1

    let result
    try {
      result = fn()
    } catch (error) {
      finishBatch()
      throw error
    }

    // Import operations are async. Keep the batch open until their promise
    // settles, otherwise object:added events would create separate history
    // entries while the import is still running.
    if (result && typeof result.then === 'function') {
      return result.finally(finishBatch)
    }

    finishBatch()
    return result
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
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    stack.length = 0
    index = -1
    batchDepth = 0
    batchDirty = false
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

  return { undo, redo, record, recordDebounced, batch, reset }
}
