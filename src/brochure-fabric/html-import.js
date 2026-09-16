import html2canvas from 'html2canvas'
import { FabricImage, Textbox, Rect, Gradient } from 'fabric'

const SHEET_WIDTH = 1123
const SHEET_HEIGHT = 794

const INLINE_TAGS = new Set(['SPAN', 'A', 'B', 'I', 'EM', 'STRONG', 'BR', 'SMALL'])

function hasDirectOrOnlyInlineText(el) {
  if (el.querySelector('img')) return false
  if (!(el.textContent || '').trim()) return false
  return [...el.children].every((child) => INLINE_TAGS.has(child.tagName))
}

function isSolidColor(colorString) {
  return Boolean(colorString) && colorString !== 'transparent' && colorString !== 'rgba(0, 0, 0, 0)'
}

// A böngésző a kiszámított `background-image`-et normalizált
// `linear-gradient(<szög>deg, <szín> <offset>, ...)` alakban adja vissza —
// ezt fordítjuk le egy Fabric `Gradient`-re, hogy a korábban teljesen
// kimaradó CSS-gradiensek is átjöjjenek az importnál, ne csak az
// egyszínű hátterek.
function parseLinearGradient(backgroundImage, width, height) {
  const match = backgroundImage?.match(/^linear-gradient\(([^)]+)\)$/)
  if (!match) return null

  const parts = match[1].split(/,(?![^(]*\))/).map((part) => part.trim())
  let angleDeg = 180 // a CSS-ben az "irány nélküli" gradiens alapból felülről lefelé megy
  let colorParts = parts
  const angleMatch = parts[0].match(/^(-?[\d.]+)deg$/)
  if (angleMatch) {
    angleDeg = parseFloat(angleMatch[1])
    colorParts = parts.slice(1)
  }

  const colors = colorParts.map((part) => part.split(/\s+/)[0])
  if (colors.length < 2) return null

  // CSS gradiens-szög: 0deg felfelé mutat, óramutató járása szerint nő —
  // ezt irányvektorra váltjuk, majd a doboz közepéhez képest húzzuk ki a
  // gradiens-vonalat úgy, hogy lefedje a teljes dobozt.
  const rad = (angleDeg * Math.PI) / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  const halfLength = (Math.abs(dx * width) + Math.abs(dy * height)) / 2 || Math.max(width, height) / 2
  const centerX = width / 2
  const centerY = height / 2

  return new Gradient({
    type: 'linear',
    coords: {
      x1: centerX - dx * halfLength,
      y1: centerY - dy * halfLength,
      x2: centerX + dx * halfLength,
      y2: centerY + dy * halfLength,
    },
    colorStops: colors.map((color, index) => ({
      offset: colors.length > 1 ? index / (colors.length - 1) : 0,
      color,
    })),
  })
}

// Az importált HTML-t "okos" módon, elemenként szerkeszthető Fabric-
// objektumokra bontjuk (kép/szöveg/szín-doboz), a végleges renderelt
// geometriát (getBoundingClientRect) és kiszámított stílust
// (getComputedStyle) olvasva ki — NEM a live DOM/CSS-t tartjuk meg. Ez a
// lényeg: csak a végeredmény (hova kerül, mi a szöveg/szín/kép) kerül át,
// a forrás HTML/CSS-fa és a szerkesztő saját DOM-ja soha nem érintkezik,
// ezért nem térhet vissza az eredeti pozicionálási hibaosztály (a `body`
// szelektor ütközése stb.) — csak az elemek geometriáját "fényképezzük le".
//
// Korlátok: gradiens hátterek, komplex CSS-effektek (árnyék, transform)
// nem kerülnek át; ha egy elemnek nincs egyértelmű szöveg/kép/egyszínű
// háttere, kimarad. Ha egyáltalán nem sikerül elemeket azonosítani,
// visszaesünk a korábbi, teljes-lap rasterizálásra (html2canvas), hogy
// sose maradjon üres/hiányos az import.
function pickElements(root) {
  const picks = []

  function visit(el) {
    if (el.tagName === 'IMG') {
      picks.push({ type: 'image', el })
      return
    }

    const style = window.getComputedStyle(el)

    if (hasDirectOrOnlyInlineText(el)) {
      picks.push({ type: 'text', el, style })
      return
    }

    const hasGradient = style.backgroundImage?.startsWith('linear-gradient(')
    if (el.children.length === 0 && (isSolidColor(style.backgroundColor) || hasGradient)) {
      picks.push({ type: 'box', el, style })
      return
    }

    for (const child of el.children) {
      visit(child)
    }
  }

  for (const child of root.children) {
    visit(child)
  }

  return picks
}

async function buildFabricObjects(picks, originRect, scale) {
  const objects = []

  for (const pick of picks) {
    const rect = pick.el.getBoundingClientRect()
    const left = (rect.left - originRect.left) * scale
    const top = (rect.top - originRect.top) * scale
    const width = rect.width * scale
    const height = rect.height * scale
    if (width <= 0 || height <= 0) continue

    if (pick.type === 'image') {
      try {
        const img = await FabricImage.fromURL(pick.el.src, { crossOrigin: 'anonymous' })
        img.set({ left, top, scaleX: width / img.width, scaleY: height / img.height })
        objects.push(img)
      } catch (error) {
        console.warn('Kép importálása sikertelen, kihagyva:', pick.el.src, error)
      }
    } else if (pick.type === 'text') {
      const text = (pick.el.textContent || '').trim()
      if (!text) continue
      objects.push(
        new Textbox(text, {
          left,
          top,
          width,
          fontSize: (parseFloat(pick.style.fontSize) || 16) * scale,
          fontWeight: pick.style.fontWeight,
          fill: pick.style.color || '#000000',
          textAlign: pick.style.textAlign === 'start' ? 'left' : pick.style.textAlign,
        }),
      )
    } else if (pick.type === 'box') {
      const gradient = parseLinearGradient(pick.style.backgroundImage, width, height)
      objects.push(
        new Rect({
          left,
          top,
          width,
          height,
          fill: gradient || pick.style.backgroundColor,
        }),
      )
    }
  }

  return objects
}

async function rasterizeFallback(contentEl, contentWidth, contentHeight) {
  const canvasEl = await html2canvas(contentEl, {
    backgroundColor: '#ffffff',
    scale: 2,
    width: contentWidth,
    height: contentHeight,
  })
  const dataUrl = canvasEl.toDataURL('image/png')
  const img = await FabricImage.fromURL(dataUrl)
  const scale = Math.min(1, SHEET_WIDTH / img.width, SHEET_HEIGHT / img.height)
  img.set({ left: 0, top: 0, scaleX: scale, scaleY: scale })
  return [img]
}

export async function importHtmlFile(file, canvas) {
  const text = await file.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/html')
  const bodyMarkup = doc.body?.innerHTML.trim() || ''
  const styles = [...doc.querySelectorAll('style')].map((el) => el.textContent || '').join('\n')

  if (!bodyMarkup) {
    throw new Error('A HTML-fájl nem tartalmaz megjeleníthető body-tartalmat.')
  }

  // Az importált body gyerekei jellemzően mind absolute pozicionáltak (fix-
  // pixel grafikák, mint egy social media poszt), ezért a konténer saját
  // magától 0×0 méretűre esne össze (nincs normál-flow tartalom, ami
  // méretet adna neki) — a rendereléshez explicit méretet adunk neki, a
  // body-szabályból kiolvasott width/height alapján (vagy az A4 lap
  // méretét alapértékként, ha nincs ilyen szabály).
  const bodyRuleMatch = styles.match(/(^|\})\s*body\s*\{([^}]*)\}/)
  const widthMatch = bodyRuleMatch?.[2].match(/width\s*:\s*([\d.]+)px/)
  const heightMatch = bodyRuleMatch?.[2].match(/height\s*:\s*([\d.]+)px/)
  const contentWidth = widthMatch ? parseFloat(widthMatch[1]) : SHEET_WIDTH
  const contentHeight = heightMatch ? parseFloat(heightMatch[1]) : SHEET_HEIGHT

  const sandbox = document.createElement('div')
  sandbox.style.position = 'fixed'
  sandbox.style.top = '0'
  sandbox.style.left = '-100000px'
  sandbox.style.zIndex = '-1'

  const styleEl = document.createElement('style')
  styleEl.textContent = styles
  sandbox.append(styleEl)

  const contentEl = document.createElement('div')
  contentEl.style.position = 'relative'
  contentEl.style.width = `${contentWidth}px`
  contentEl.style.height = `${contentHeight}px`
  contentEl.innerHTML = bodyMarkup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  sandbox.append(contentEl)

  document.body.append(sandbox)

  try {
    const scale = Math.min(1, SHEET_WIDTH / contentWidth, SHEET_HEIGHT / contentHeight)
    const picks = pickElements(contentEl)

    const objects = picks.length
      ? await buildFabricObjects(picks, contentEl.getBoundingClientRect(), scale)
      : []

    const finalObjects = objects.length ? objects : await rasterizeFallback(contentEl, contentWidth, contentHeight)

    finalObjects.forEach((object) => canvas.add(object))
    canvas.setActiveObject(finalObjects[finalObjects.length - 1])
    canvas.requestRenderAll()
  } finally {
    sandbox.remove()
  }
}
