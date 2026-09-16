import { FabricImage } from 'fabric'
import { openModal, closeModal } from './modal.js'

const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY || ''

export function openUnsplashModal(canvas) {
  if (!UNSPLASH_ACCESS_KEY) {
    window.alert(
      'Az Unsplash képtár használatához adj meg egy API-kulcsot a VITE_UNSPLASH_ACCESS_KEY környezeti változóban (.env fájl), majd indítsd újra a szervert.\n\nIngyenes kulcs igényelhető: https://unsplash.com/developers',
    )
    return
  }

  const container = document.createElement('div')
  const searchRow = document.createElement('div')
  const searchInput = document.createElement('input')
  const searchBtn = document.createElement('button')
  const resultsGrid = document.createElement('div')

  searchRow.className = 'gjs-unsplash-search-row'
  searchInput.type = 'text'
  searchInput.placeholder = 'Keresés az Unsplash képtárban…'
  searchInput.className = 'gjs-unsplash-input'
  searchBtn.type = 'button'
  searchBtn.className = 'tb-btn primary'
  searchBtn.textContent = 'Keresés'
  resultsGrid.className = 'gjs-unsplash-grid'

  searchRow.append(searchInput, searchBtn)
  container.append(searchRow, resultsGrid)
  openModal('Ingyenes képtár (Unsplash)', container)

  const runSearch = async () => {
    const query = searchInput.value.trim()
    if (!query) return
    resultsGrid.innerHTML = 'Keresés folyamatban…'

    try {
      const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=20`,
        { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } },
      )
      if (!response.ok) {
        throw new Error(`Unsplash API hiba (${response.status})`)
      }
      const data = await response.json()
      resultsGrid.innerHTML = ''

      if (!data.results?.length) {
        resultsGrid.textContent = 'Nincs találat.'
        return
      }

      data.results.forEach((photo) => {
        const thumb = document.createElement('img')
        thumb.src = photo.urls.thumb
        thumb.title = photo.alt_description || 'Unsplash kép'
        thumb.className = 'gjs-unsplash-thumb'
        thumb.addEventListener('click', async () => {
          const img = await FabricImage.fromURL(photo.urls.regular, { crossOrigin: 'anonymous' })
          const maxSize = 400
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
          img.set({ left: 80, top: 80, scaleX: scale, scaleY: scale })
          canvas.add(img)
          canvas.setActiveObject(img)
          canvas.requestRenderAll()
          closeModal()
        })
        resultsGrid.append(thumb)
      })
    } catch (error) {
      console.error('Unsplash keresés sikertelen:', error)
      resultsGrid.textContent = `Hiba történt: ${error.message}`
    }
  }

  searchBtn.addEventListener('click', runSearch)
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runSearch()
  })
}
