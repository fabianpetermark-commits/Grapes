import { FabricImage } from 'fabric'
import { create } from '../ui/dom.js'
import { openModal, closeModal } from '../ui/modal.js'
import { notifyError } from '../ui/toast.js'

const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY || ''
const MAX_INSERT_SIZE = 400

// Kulcs hiányában korábban egy blokkoló alert jött, és a modal meg sem
// nyílt. Most a modal megnyílik, és benne magyarázza el, mi hiányzik —
// a szerkesztés közben nem áll meg semmi.
function openMissingKeyModal() {
  const content = create('div', { class: 'empty-state' }, [
    create('p', {
      class: 'empty-state__title',
      textContent: 'Az Unsplash képtárhoz API-kulcs kell',
    }),
    create('p', {
      textContent:
        'Hozz létre egy ingyenes kulcsot, másold a .env fájlba VITE_UNSPLASH_ACCESS_KEY néven, majd indítsd újra a fejlesztői szervert.',
    }),
    create('a', {
      href: 'https://unsplash.com/developers',
      target: '_blank',
      rel: 'noreferrer',
      textContent: 'unsplash.com/developers',
    }),
  ])
  openModal({ title: 'Ingyenes képtár (Unsplash)', content })
}

export function openUnsplashModal(canvas) {
  if (!UNSPLASH_ACCESS_KEY) {
    openMissingKeyModal()
    return
  }

  const searchInput = create('input', {
    type: 'search',
    id: 'unsplash-query',
    class: 'input',
    placeholder: 'Keresés az Unsplash képtárban…',
  })
  const searchBtn = create('button', { type: 'button', class: 'btn btn--primary', textContent: 'Keresés' })
  const results = create('div', { class: 'unsplash__results' })

  const content = create('div', { class: 'unsplash' }, [
    create('div', { class: 'unsplash__search' }, [searchInput, searchBtn]),
    results,
  ])

  openModal({ title: 'Ingyenes képtár (Unsplash)', content, size: 'lg' })
  searchInput.focus()

  const showMessage = (message) => {
    results.replaceChildren(create('p', { class: 'empty-state', textContent: message }))
  }

  showMessage('Írj be egy keresőkifejezést a kezdéshez.')

  const insert = async (photo) => {
    try {
      const image = await FabricImage.fromURL(photo.urls.regular, { crossOrigin: 'anonymous' })
      const scale = Math.min(1, MAX_INSERT_SIZE / Math.max(image.width, image.height))
      image.set({ left: 80, top: 80, scaleX: scale, scaleY: scale })
      canvas.add(image)
      canvas.setActiveObject(image)
      canvas.requestRenderAll()
      closeModal()
    } catch (error) {
      // Korábban ez egy lekezeletlen promise-elutasítás volt: a modal
      // csak állt, a felhasználó nem kapott semmilyen visszajelzést.
      console.error('A kép beillesztése sikertelen:', error)
      notifyError(`A kép beillesztése sikertelen: ${error.message}`)
    }
  }

  const runSearch = async () => {
    const query = searchInput.value.trim()
    if (!query) return

    searchBtn.disabled = true
    results.replaceChildren(
      create('div', { class: 'unsplash__grid unsplash__grid--loading' }, [
        ...Array.from({ length: 8 }, () => create('div', { class: 'skeleton' })),
      ]),
    )

    try {
      const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=20`,
        { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } },
      )
      if (!response.ok) {
        throw new Error(`Unsplash API hiba (${response.status})`)
      }
      const data = await response.json()

      if (!data.results?.length) {
        showMessage(`Nincs találat erre: „${query}”.`)
        return
      }

      const grid = create('div', { class: 'unsplash__grid' })
      for (const photo of data.results) {
        const description = photo.alt_description || 'Unsplash kép'
        const button = create(
          'button',
          { type: 'button', class: 'unsplash__item', 'aria-label': `Beillesztés: ${description}` },
          [create('img', { src: photo.urls.thumb, alt: description, loading: 'lazy' })],
        )
        button.addEventListener('click', () => insert(photo))
        grid.append(button)
      }
      results.replaceChildren(grid)
    } catch (error) {
      console.error('Unsplash keresés sikertelen:', error)
      showMessage(`A keresés sikertelen: ${error.message}`)
    } finally {
      searchBtn.disabled = false
    }
  }

  searchBtn.addEventListener('click', runSearch)
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runSearch()
  })
}
