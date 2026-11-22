import './styles/index.css'
import './ebook/standalone-config.js'

const [{ EBOOK_CONFIG }, { configureEbookPlatform }, { createStandaloneEbookPlatform }] = await Promise.all([
  import('./ebook/config.js'),
  import('./ebook/platform.js'),
  import('./ebook/standalone-platform.js'),
])

configureEbookPlatform(createStandaloneEbookPlatform(EBOOK_CONFIG))

if (typeof window.EbookAndroid?.postMessage === 'function') {
  document.querySelector('#ebook-app')?.classList.add('ebook-library--android')
}

const { initEbookLibrary } = await import('./ebook-library.js')
initEbookLibrary()
