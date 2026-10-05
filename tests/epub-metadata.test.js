import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { rewriteEpubMetadata } from '../src/ebook/epub-metadata.js'

async function fixture(version = '3.0', { cover = false, protectedFile = false } = {}) {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
  zip.file('OEBPS/content.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="${version}" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:keep-this-id</dc:identifier><dc:title>Old title</dc:title><dc:language>en</dc:language>${cover && version.startsWith('2') ? '<meta name="cover" content="old-cover"/>' : ''}</metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>${cover ? `<item id="old-cover" href="old-cover.jpg" media-type="image/jpeg"${version.startsWith('3') ? ' properties="cover-image"' : ''}/>` : ''}</manifest><spine><itemref idref="chapter"/></spine></package>`)
  zip.file('OEBPS/chapter.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body>Untouched book text</body></html>')
  if (cover) zip.file('OEBPS/old-cover.jpg', new Uint8Array([255, 216, 255, 217]))
  if (protectedFile) zip.file('META-INF/encryption.xml', '<encryption/>')
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
}

const values = {
  title: 'Új cím', author: 'Író', isbn: '9780306406157', language: 'hu',
  publisher: 'Kiadó', publishedDate: '2026', description: 'Leírás',
  subjects: ['Regény', 'Fantasy'], series: 'Sorozat', seriesIndex: '2',
}

test('EPUB 3 metadata, series and cover are updated without changing book text', async () => {
  const source = await fixture('3.0', { cover: true })
  const cover = { mimeType: 'image/jpeg', bytes: new Uint8Array([255, 216, 255, 217]) }
  const result = await rewriteEpubMetadata(source, values, cover)
  const zip = await JSZip.loadAsync(await result.arrayBuffer())
  const opf = await zip.file('OEBPS/content.opf').async('string')
  const header = new DataView(await result.slice(0, 30).arrayBuffer())
  assert.equal(header.getUint16(8, true), 0)
  assert.match(opf, /<dc:title>Új cím<\/dc:title>/)
  assert.match(opf, /<dc:creator>Író<\/dc:creator>/)
  assert.match(opf, /<dc:identifier id="book-id">urn:uuid:keep-this-id<\/dc:identifier>/)
  assert.match(opf, /belongs-to-collection/)
  assert.match(opf, /properties="cover-image"/)
  assert.ok(zip.file('OEBPS/grapes-cover.jpg'))
  assert.equal(await zip.file('OEBPS/chapter.xhtml').async('string'), '<html xmlns="http://www.w3.org/1999/xhtml"><body>Untouched book text</body></html>')
})

test('EPUB 2 keeps series in the catalogue only and sets the legacy cover marker', async () => {
  const result = await rewriteEpubMetadata(await fixture('2.0.1'), values, { mimeType: 'image/png', bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]) })
  const zip = await JSZip.loadAsync(await result.arrayBuffer())
  const opf = await zip.file('OEBPS/content.opf').async('string')
  assert.doesNotMatch(opf, /belongs-to-collection/)
  assert.match(opf, /name="cover"/)
  assert.ok(zip.file('OEBPS/grapes-cover.png'))
})

test('protected, malformed, oversized and wrongly typed covers cannot be rewritten', async () => {
  await assert.rejects(rewriteEpubMetadata(await fixture('3.0', { protectedFile: true }), values), /védett/)
  await assert.rejects(rewriteEpubMetadata(new Blob(['not a zip']), values), /Corrupted zip|end of central directory/i)
  await assert.rejects(rewriteEpubMetadata({ size: 100 * 1024 * 1024 + 1 }, values), /100 MiB/)
  await assert.rejects(rewriteEpubMetadata(await fixture(), values, { mimeType: 'image/png', bytes: new Uint8Array([255, 216, 255]) }), /JPG vagy PNG/)
})
