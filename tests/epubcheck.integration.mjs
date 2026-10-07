import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { rewriteEpubMetadata } from '../src/ebook/epub-metadata.js'
import { openEpubContent } from '../src/ebook/epub-content.js'

const jar = process.env.EPUBCHECK_JAR
if (!jar) throw new Error('EPUBCHECK_JAR is required for the EPUB conformance test.')

const zip = new JSZip()
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
zip.file('OPS/package.opf', '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:7bc9166e-9d86-4b3c-923b-30758dcc5e17</dc:identifier><dc:title>Sample title</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-10-05T12:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>')
zip.file('OPS/nav.xhtml', '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol><li><a href="chapter.xhtml">Chapter</a></li></ol></nav></body></html>')
zip.file('OPS/chapter.xhtml', '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body><h1>Chapter</h1><p>Unchanged content.</p></body></html>')

const cover = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/cKsAAAAASUVORK5CYII=', 'base64')
const original = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
const edited = await rewriteEpubMetadata(original, {
  title: 'Valid edited EPUB', author: 'Test Author', language: 'en', description: 'A test publication.',
  publisher: 'Grapes', publishedDate: '2026', isbn: '', subjects: ['Testing'], series: 'Test series', seriesIndex: '1',
}, { bytes: cover, mimeType: 'image/png' })

const zip2 = new JSZip()
zip2.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
zip2.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
zip2.file('OPS/package.opf', '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:7bc9166e-9d86-4b3c-923b-30758dcc5e17</dc:identifier><dc:title>Sample title</dc:title><dc:language>en</dc:language></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="chapter"/></spine></package>')
zip2.file('OPS/toc.ncx', '<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:7bc9166e-9d86-4b3c-923b-30758dcc5e17"/></head><docTitle><text>Sample title</text></docTitle><navMap><navPoint id="chapter" playOrder="1"><navLabel><text>Chapter</text></navLabel><content src="chapter.xhtml"/></navPoint></navMap></ncx>')
zip2.file('OPS/chapter.xhtml', '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body><h1>Chapter</h1><p>Unchanged content.</p></body></html>')
const edited2 = await rewriteEpubMetadata(await zip2.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' }), {
  title: 'Valid edited EPUB 2', author: 'Test Author', language: 'en', description: 'A test publication.',
  publisher: 'Grapes', publishedDate: '2026', isbn: '', subjects: ['Testing'], series: 'Test series', seriesIndex: '1',
}, { bytes: cover, mimeType: 'image/png' })

async function repairContent(source) {
  const book = await openEpubContent(source)
  const chapter = book.chapters[0]
  book.renameChapter(chapter.id, { heading: 'Repaired chapter', toc: 'Repaired chapter' })
  const match = book.getMatches('Unchanged content.')
  book.replaceMatches(match, 'Repaired content.')
  return book.buildBlob()
}
const repaired3 = await repairContent(edited)
const repaired2 = await repairContent(edited2)

const directory = await mkdtemp(join(tmpdir(), 'grapes-epubcheck-'))
const target = join(directory, 'edited.epub')
try {
  await writeFile(target, Buffer.from(await edited.arrayBuffer()))
  execFileSync('java', ['-jar', jar, target], { stdio: 'inherit', timeout: 120000 })
  const target2 = join(directory, 'edited-epub2.epub')
  await writeFile(target2, Buffer.from(await edited2.arrayBuffer()))
  execFileSync('java', ['-jar', jar, target2], { stdio: 'inherit', timeout: 120000 })
  for (const [name, file] of [['repaired-epub3.epub', repaired3], ['repaired-epub2.epub', repaired2]]) {
    const destination = join(directory, name)
    await writeFile(destination, Buffer.from(await file.arrayBuffer()))
    execFileSync('java', ['-jar', jar, destination], { stdio: 'inherit', timeout: 120000 })
  }
} finally {
  await rm(directory, { recursive: true, force: true })
}
