// Only a design preview: no user data, persistence, network or care calculations.
const samplePlants = Object.freeze([
  Object.freeze({
    id: 'chili-a',
    name: 'Csili · 1. példány',
    species: 'Csilipaprika',
    latin: 'Capsicum spp. (bemutató)',
    place: 'Terasz (minta)',
    container: 'Cserép (minta)',
  }),
  Object.freeze({
    id: 'chili-b',
    name: 'Csili · 2. példány',
    species: 'Csilipaprika',
    latin: 'Capsicum spp. (bemutató)',
    place: 'Ablakpárkány (minta)',
    container: 'Cserép (minta)',
  }),
  Object.freeze({
    id: 'basil-a',
    name: 'Bazsalikom · 1. példány',
    species: 'Bazsalikom',
    latin: 'Ocimum basilicum (bemutató)',
    place: 'Konyhaablak (minta)',
    container: 'Cserép (minta)',
  }),
])

export function initOutdoorPlantPreview({ root = document, showPage }) {
  const list = root.querySelector('[data-outdoor-plants-list]')
  const detail = root.querySelector('[data-page="outdoor-detail"]')
  if (!list || !detail) return

  const label = name => detail.querySelector(`[data-outdoor-fact="${name}"]`)
  const selectTab = name => {
    const tabs = [...detail.querySelectorAll('[data-outdoor-tab]')]
    if (!tabs.some(tab => tab.dataset.outdoorTab === name)) return
    tabs.forEach(tab => {
      const active = tab.dataset.outdoorTab === name
      tab.setAttribute('aria-selected', String(active))
      tab.tabIndex = active ? 0 : -1
      tab.classList.toggle('is-active', active)
    })
    detail.querySelectorAll('[data-outdoor-panel]').forEach(panel => {
      panel.hidden = panel.dataset.outdoorPanel !== name
    })
  }

  const openPlant = id => {
    const plant = samplePlants.find(item => item.id === id)
    if (!plant) return
    label('name').textContent = plant.name
    label('species').textContent = plant.species
    label('latin').textContent = plant.latin
    label('place').textContent = plant.place
    label('container').textContent = plant.container
    selectTab('overview')
    showPage('outdoor-detail', { parent: 'outdoor-plants' })
  }

  list.addEventListener('click', event => {
    const card = event.target.closest('[data-outdoor-plant]')
    if (card && list.contains(card)) openPlant(card.dataset.outdoorPlant)
  })
  detail.querySelector('[data-outdoor-detail-back]').addEventListener('click', () => {
    showPage('outdoor-plants', { parent: 'hub-outdoor' })
  })
  detail.querySelectorAll('[data-outdoor-tab]').forEach(tab => {
    tab.addEventListener('click', () => selectTab(tab.dataset.outdoorTab))
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const tabs = [...detail.querySelectorAll('[data-outdoor-tab]')]
      const index = tabs.indexOf(tab)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
      selectTab(tabs[next].dataset.outdoorTab)
      tabs[next].focus()
    })
  })
  selectTab('overview')
}
