// Rétegek panel: a canvas objektumainak listája z-sorrend szerint (felül a
// legfelső), kattintásra kijelölés, törlés és fel/le mozgatás soronként.
// Ez váltja a GrapesJS-es Layer Managert.

function labelFor(object, index) {
  const typeLabels = {
    rect: 'Téglalap',
    circle: 'Kör',
    line: 'Vonal',
    path: 'Alakzat',
    textbox: 'Szöveg',
    image: 'Kép',
  }
  return `${typeLabels[object.type] || object.type} #${index + 1}`
}

export function initLayersPanel(canvas) {
  const listEl = document.querySelector('#fabric-layers-list')

  function render() {
    const objects = canvas.getObjects()
    listEl.innerHTML = ''

    // Felül a legfelső z-index-ű elem (a tömb végén van a canvas.getObjects()-ben).
    for (let i = objects.length - 1; i >= 0; i -= 1) {
      const object = objects[i]
      const row = document.createElement('div')
      row.className = 'fabric-layer-row'
      if (object === canvas.getActiveObject()) {
        row.classList.add('active')
      }

      const nameEl = document.createElement('span')
      nameEl.className = 'fabric-layer-name'
      nameEl.textContent = labelFor(object, i)
      row.append(nameEl)

      const upBtn = document.createElement('button')
      upBtn.type = 'button'
      upBtn.textContent = '↑'
      upBtn.title = 'Előrébb'
      upBtn.addEventListener('click', (event) => {
        event.stopPropagation()
        canvas.bringObjectForward(object)
        canvas.requestRenderAll()
        render()
      })
      row.append(upBtn)

      const downBtn = document.createElement('button')
      downBtn.type = 'button'
      downBtn.textContent = '↓'
      downBtn.title = 'Hátrébb'
      downBtn.addEventListener('click', (event) => {
        event.stopPropagation()
        canvas.sendObjectBackwards(object)
        canvas.requestRenderAll()
        render()
      })
      row.append(downBtn)

      const deleteBtn = document.createElement('button')
      deleteBtn.type = 'button'
      deleteBtn.textContent = '🗑️'
      deleteBtn.title = 'Törlés'
      deleteBtn.addEventListener('click', (event) => {
        event.stopPropagation()
        canvas.remove(object)
        canvas.requestRenderAll()
      })
      row.append(deleteBtn)

      row.addEventListener('click', () => {
        canvas.setActiveObject(object)
        canvas.requestRenderAll()
      })

      listEl.append(row)
    }
  }

  canvas.on('object:added', render)
  canvas.on('object:removed', render)
  canvas.on('selection:created', render)
  canvas.on('selection:updated', render)
  canvas.on('selection:cleared', render)

  render()

  return { render }
}
