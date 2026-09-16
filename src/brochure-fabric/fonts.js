// Betűtípus-választó: egy széles, kurátori Google Fonts-lista + a
// böngésző natív rendszer-betűtípusai, mindegyik élő mintavétellel (a
// <select> minden opciója a saját betűtípusában jeleníti meg a nevét,
// miután a megfelelő Google Fonts CSS betöltődött).
export const SYSTEM_FONTS = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana', 'Trebuchet MS']

export const GOOGLE_FONTS = [
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Oswald',
  'Source Sans Pro',
  'Raleway',
  'Poppins',
  'Nunito',
  'Merriweather',
  'Playfair Display',
  'PT Sans',
  'Ubuntu',
  'Rubik',
  'Inter',
  'Work Sans',
  'Noto Sans',
  'Mukta',
  'Karla',
  'Fira Sans',
  'Quicksand',
  'Nunito Sans',
  'Barlow',
  'Cabin',
  'Dancing Script',
  'Pacifico',
  'Lobster',
  'Bebas Neue',
  'Anton',
  'Abril Fatface',
  'Caveat',
  'Indie Flower',
  'Archivo',
  'DM Sans',
  'Space Grotesk',
  'Josefin Sans',
  'Comfortaa',
  'Crimson Text',
  'EB Garamond',
  'IBM Plex Sans',
]

let fontsLoaded = false

export function ensureGoogleFontsLoaded() {
  if (fontsLoaded) return
  fontsLoaded = true
  const families = GOOGLE_FONTS.map((name) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;700`).join(
    '&',
  )
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`
  document.head.append(link)
}

export function populateFontSelect(selectEl) {
  if (selectEl.dataset.populated) return
  selectEl.dataset.populated = 'true'
  ensureGoogleFontsLoaded()

  const addGroup = (label, fonts) => {
    const group = document.createElement('optgroup')
    group.label = label
    fonts.forEach((font) => {
      const option = document.createElement('option')
      option.value = font
      option.textContent = font
      option.style.fontFamily = `'${font}', sans-serif`
      group.append(option)
    })
    selectEl.append(group)
  }

  addGroup('Rendszer betűtípusok', SYSTEM_FONTS)
  addGroup('Google Fonts', GOOGLE_FONTS)
}
