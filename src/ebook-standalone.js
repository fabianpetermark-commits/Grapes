import './styles/index.css'
import './ebook/standalone-config.js'

const [{ EBOOK_CONFIG }, { configureEbookPlatform }, { createStandaloneEbookPlatform }] = await Promise.all([
  import('./ebook/config.js'),
  import('./ebook/platform.js'),
  import('./ebook/standalone-platform.js'),
])

configureEbookPlatform(createStandaloneEbookPlatform(EBOOK_CONFIG))

const { initEbookLibrary } = await import('./ebook-library.js')
initEbookLibrary()
