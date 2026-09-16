import html2canvas from 'html2canvas'
import { FabricImage } from 'fabric'

const SHEET_WIDTH = 1123
const SHEET_HEIGHT = 794

// A GrapesJS-es importnál (main.js) a legfőbb, visszatérő hibaosztály az
// volt, hogy egy tetszőleges, fix-pixelméretű HTML/CSS-grafika élő DOM-ként
// a szerkesztő saját DOM-fájában/canvas-ában élt, és a `body{...}` stílus-
// szabály ütközött a szerkesztő valódi <body>-jával és az A4 "lap"
// koncepciójával. Itt ez a hibaosztály a gyökerénél szűnik meg: az
// importált HTML-t egy REJTETT, off-DOM konténerbe töltjük, html2canvas-szal
// egyetlen PNG-vé rendereljük, majd egyetlen mozgatható/átméretezhető Fabric
// Image objektumként szúrjuk be — nincs többé élő idegen DOM/CSS a
// szerkesztő fájában. Kompromisszum: az importált grafika elemei többé NEM
// szerkeszthetők egyenként, csak egészében mozgatható/átméretezhető/törölhető.
export async function importHtmlFile(file, canvas) {
  const text = await file.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/html')
  const bodyMarkup = doc.body?.innerHTML.trim() || ''
  const styles = [...doc.querySelectorAll('style')].map((el) => el.textContent || '').join('\n')

  if (!bodyMarkup) {
    throw new Error('A HTML-fájl nem tartalmaz megjeleníthető body-tartalmat.')
  }

  // Rejtett, off-DOM (de renderelhető) konténer: a viewport-on kívülre
  // pozicionálva, hogy html2canvas rendereljen, de a felhasználó ne lássa
  // és semmilyen módon ne ütközhessen a szerkesztő saját DOM-fájával/CSS-ével.
  // Az importált body gyerekei jellemzően mind absolute pozicionáltak
  // (fix-pixel grafikák, mint egy social media poszt), ezért a konténer
  // saját magától 0×0 méretűre esne össze (nincs normál-flow tartalom, ami
  // méretet adna neki) — a html2canvas így egy üres/érvénytelen képet
  // renderelne. Ezért, ha a body-szabály tartalmaz explicit width/height-ot,
  // ugyanazt a méretet adjuk a konténernek is; ha nem, az A4 lap méretét
  // használjuk alapértékként.
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
    canvas.add(img)
    canvas.setActiveObject(img)
    canvas.requestRenderAll()
  } finally {
    sandbox.remove()
  }
}
