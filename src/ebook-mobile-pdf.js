import { downloadMobileEbook } from './ebook-mobile-library.js'

export const isMobileReadablePdf = book => book?.mimeType === 'application/pdf' || /\.pdf$/i.test(book?.name || '')

// Same Drive download and reading-position store as EPUB; no second library.
export async function openMobilePdf(book) {
  const [pdfjs, worker, blob] = await Promise.all([
    import('pdfjs-dist/build/pdf.mjs'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    downloadMobileEbook(book.id),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const loading = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false })
  loading.onPassword = () => loading.destroy()
  const pdf = await loading.promise
  return {
    chapters: Array.from({length: pdf.numPages}, (_, i) => ({id: 'pdf-page-'+(i+1), title: (i+1)+'. oldal'})),
    async renderChapter(container, index) {
      const page = await pdf.getPage(index+1)
      const unit = page.getViewport({scale:1})
      const width = Math.max(180, container.clientWidth-32)
      const scale = width / unit.width
      const viewport = page.getViewport({scale: scale * Math.min(devicePixelRatio || 1, 2)})
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
      canvas.style.width = '100%'; canvas.style.height = 'auto'
      canvas.setAttribute('aria-label', (index+1)+'. PDF-oldal')
      container.replaceChildren(canvas)
      await page.render({canvasContext:canvas.getContext('2d'), viewport}).promise
      const text = await page.getTextContent()
      const details = document.createElement('details')
      const summary = document.createElement('summary'); summary.textContent = 'Oldal szövege'
      const paragraph = document.createElement('p'); paragraph.textContent = text.items.map(x => x.str || '').join(' ')
      details.append(summary,paragraph); container.append(details)
    },
    destroy() { return pdf.destroy() },
  }
}
