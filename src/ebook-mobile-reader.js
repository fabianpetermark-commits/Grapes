import { openEpubContent } from './ebook/epub-content.js'
import { downloadMobileEbook } from './ebook-mobile-library.js'

export const isMobileReadableEpub = (book) => /\.epub$/i.test(String(book?.name || ''))

export async function openMobileEpub(book) {
  if (!isMobileReadableEpub(book)) throw new Error('Az alkalmazáson belüli Olvasó jelenleg csak EPUB-könyvet támogat.')
  const blob = await downloadMobileEbook(book.id)
  const session = await openEpubContent(blob)
  return {
    book,
    title: session.title || book.title || book.name,
    chapters: session.chapters.map((chapter, index) => ({ id: chapter.id, title: chapter.title, index })),
    getChapter: (id) => session.getReadingChapter(id),
  }
}

export function normalizedReadingProgress({ chapterIndex = 0, chapterCount = 1, chapterProgress = 0 } = {}) {
  const count = Math.max(1, Number(chapterCount) || 1)
  const index = Math.min(count - 1, Math.max(0, Number(chapterIndex) || 0))
  const within = Math.min(1, Math.max(0, Number(chapterProgress) || 0))
  return Math.min(100, Math.max(0, ((index + within) / count) * 100))
}
