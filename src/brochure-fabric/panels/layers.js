// Rétegek panel: a canvas objektumainak listája z-sorrend szerint (felül a
// legfelső), kattintásra kijelölés, törlés és fel/le mozgatás soronként.
//
// Korábban a teljes lista minden canvas-eseményre újraépült (innerHTML = ''
// plusz három friss eseményfigyelő soronként) — a puszta kattintgatás a
// vásznon is újrarajzolta az egészet, elveszítve a görgetési pozíciót.
// Most a kijelölésváltás csak egy osztályt cserél.

import { create } from '../../ui/dom.js'

const TYPE_LABELS = {
  rect: 'Téglalap',
  circle: 'Kör',
  line: 'Vonal',
  path: 'Alakzat',
  polygon: 'Sokszög',
  group: 'Csoport',
  textbox: 'Szöveg',
  text: 'Szöveg',
  'i-text': 'Szöveg',
  image: 'Kép',
}

function labelFor(object, index) {
  return `${TYPE_LABELS[object.type] || object.type} #${index + 1}`
}

function iconButton(name, label, onClick) {
  const button = create('button', {
    type: 'button',
    class: 'btn btn--icon btn--ghost btn--sm',
    'aria-label': label,
    title: label,
  })
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'icon icon--sm')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', `#i-${name}`)
  svg.append(use)
  button.append(svg)
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    onClick()
  })
  return button
}

export function initLayersPanel(canvas, history) {
  const listEl = document.querySelector('#fabric-layers-list')
  // Objektum -> sor, hogy a kijelölés jelzéséhez ne kelljen újraépíteni.
  const rows = new Map()

  function syncActive() {
    const active = canvas.getActiveObject()
    for (const [object, row] of rows) {
      row.classList.toggle('is-active', object === active)
    }
  }

  function render() {
    const objects = canvas.getObjects()
    rows.clear()
    listEl.replaceChildren()

    if (objects.length === 0) {
      listEl.append(
        create('p', {
          class: 'empty-state empty-state--inline',
          textContent: 'Még nincs elem a lapon.',
        }),
      )
      return
    }

    // Felül a legfelső z-indexű elem (a tömb végén van a getObjects()-ben).
    for (let index = objects.length - 1; index >= 0; index -= 1) {
      const object = objects[index]
      const name = labelFor(object, index)

      const row = create('div', { class: 'layer' }, [
        create('span', { class: 'layer__name', textContent: name }),
        create('div', { class: 'layer__actions' }, [
          iconButton('layer-up', `${name} előrébb`, () => {
            canvas.bringObjectForward(object)
            canvas.requestRenderAll()
            history?.record()
            render()
          }),
          iconButton('layer-down', `${name} hátrébb`, () => {
            canvas.sendObjectBackwards(object)
            canvas.requestRenderAll()
            history?.record()
            render()
          }),
          iconButton('trash', `${name} törlése`, () => {
            canvas.remove(object)
            canvas.requestRenderAll()
          }),
        ]),
      ])

      row.addEventListener('click', () => {
        canvas.setActiveObject(object)
        canvas.requestRenderAll()
      })

      rows.set(object, row)
      listEl.append(row)
    }

    syncActive()
  }

  canvas.on('object:added', render)
  canvas.on('object:removed', render)
  // A kijelölés változása nem indokol újraépítést — elég az aktív sor jelzése.
  canvas.on('selection:created', syncActive)
  canvas.on('selection:updated', syncActive)
  canvas.on('selection:cleared', syncActive)

  render()

  return { render }
}
