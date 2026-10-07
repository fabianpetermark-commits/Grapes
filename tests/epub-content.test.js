import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { openEpubContent } from '../src/ebook/epub-content.js'

async function fixture(version = '3.0', { fixed = false, protectedFile = false, structural = false } = {}) {
  const epub3 = version.startsWith('3')
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>')
  if (protectedFile) zip.file('META-INF/encryption.xml', '<encryption/>')
  zip.file('OPS/package.opf', `<package xmlns="http://www.idpf.org/2007/opf" version="${version}" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:keep</dc:identifier><dc:title>Test book</dc:title><dc:language>hu</dc:language>${fixed ? '<meta property="rendition:layout">pre-paginated</meta>' : ''}</metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="css" href="book.css" media-type="text/css"/><item id="image" href="image.png" media-type="image/png"/><item id="nav" href="${epub3 ? 'nav.xhtml' : 'toc.ncx'}" media-type="${epub3 ? 'application/xhtml+xml' : 'application/x-dtbncx+xml'}"${epub3 ? ' properties="nav"' : ''}/></manifest><spine${epub3 ? '' : ' toc="nav"'}><itemref idref="one"/><itemref idref="two"/></spine></package>`)
  zip.file('OPS/one.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"${structural ? ' xmlns:epub="http://www.idpf.org/2007/ops" epub:prefix="z3998: http://www.daisy.org/z3998/2012/vocab/structure/#"' : ''}><head><title>One</title><link href="book.css" rel="stylesheet"/></head><body><h1>Első fejezet</h1><p${structural ? ' id="bad:id" epub:type="chapter"' : ''}>A hibÃ¡s szó és egy <a href="two.xhtml#end">link</a>.</p><p style="font-family: Broken Font">Rossz szó.</p><img src="image.png" alt="kép"/></body></html>`)
  zip.file('OPS/two.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Második fejezet</h1><p id="end">Rossz szó.</p><p><a href="one.xhtml${structural ? '#bad:id' : ''}">Vissza</a></p><aside epub:type="footnote" xmlns:epub="http://www.idpf.org/2007/ops"><p>Lábjegyzet.</p></aside></body></html>`)
  zip.file('OPS/book.css', '@font-face { font-family: Broken Font; src: url(font.woff); } body { font-family: Broken Font; } p { font-size: 1em; }')
  zip.file('OPS/image.png', new Uint8Array([137, 80, 78, 71, 1, 2, 3]))
  if (epub3) zip.file('OPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="one.xhtml">Első fejezet</a></li><li><a href="two.xhtml">Második fejezet</a></li></ol></nav></body></html>')
  else zip.file('OPS/toc.ncx', '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint><navLabel><text>Első fejezet</text></navLabel><content src="one.xhtml"/></navPoint><navPoint><navLabel><text>Második fejezet</text></navLabel><content src="two.xhtml"/></navPoint></navMap></ncx>')
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
}

for (const version of ['2.0.1', '3.0']) test(`EPUB ${version} edits chapters and TOC while preserving unrelated content`, async () => {
  const original = await fixture(version)
  const editor = await openEpubContent(original)
  assert.equal(editor.chapters.length, 2)
  const [one, two] = editor.chapters
  assert.equal(editor.getChapter(one.id).heading, 'Első fejezet')
  assert.equal(editor.getChapter(one.id).toc, 'Első fejezet')
  editor.renameChapter(one.id, { heading: 'Első javított', toc: 'Javított tartalomjegyzék' })
  assert.equal(editor.getChapter(one.id).heading, 'Első javított')
  const result = await JSZip.loadAsync(await (await editor.buildBlob()).arrayBuffer())
  assert.match(await result.file('OPS/one.xhtml').async('string'), /Első javított/)
  assert.match(await result.file(`OPS/${version.startsWith('3') ? 'nav.xhtml' : 'toc.ncx'}`).async('string'), /Javított tartalomjegyzék/)
  const source = await JSZip.loadAsync(await original.arrayBuffer())
  assert.equal(await result.file('OPS/two.xhtml').async('string'), await source.file('OPS/two.xhtml').async('string'))
  assert.deepEqual(await result.file('OPS/image.png').async('uint8array'), await source.file('OPS/image.png').async('uint8array'))
  assert.equal(editor.undo(), true)
  assert.equal(editor.getChapter(one.id).heading, 'Első fejezet')
  assert.equal(editor.hasChanges, false)
  assert.equal(two.path, 'OPS/two.xhtml')
})

test('literal replacements keep links and support per-action undo', async () => {
  const editor = await openEpubContent(await fixture())
  const matches = editor.getMatches('Rossz', { wholeWord: true })
  assert.equal(matches.length, 2)
  assert.equal(editor.replaceMatches(matches, 'Jó'), 2)
  const zip = await JSZip.loadAsync(await (await editor.buildBlob()).arrayBuffer())
  assert.match(await zip.file('OPS/one.xhtml').async('string'), /<a href="two.xhtml#end">link<\/a>/)
  assert.match(await zip.file('OPS/two.xhtml').async('string'), /Jó szó/)
  editor.undo()
  assert.equal(editor.getMatches('Rossz').length, 2)
  assert.equal(editor.hasChanges, false)
  const segment = editor.getSegments(editor.chapters[0].id).find((item) => item.text.includes('hibÃ¡s'))
  editor.editSegment(editor.chapters[0].id, segment.index, segment.text.replace('hibÃ¡s', 'hibás'))
  assert.equal(editor.getSegments(editor.chapters[0].id)[segment.index].text.includes('hibás'), true)
  editor.undo()
})

test('encoding suggestions require approval and font repair changes only chosen declarations', async () => {
  const editor = await openEpubContent(await fixture())
  const suggestion = editor.getEncodingSuggestions().find((item) => item.recoverable)
  assert.ok(suggestion)
  assert.match(suggestion.replacement, /hibás/)
  assert.match(editor.getSegments(suggestion.chapterId)[suggestion.segmentIndex].text, /hibÃ¡s/)
  editor.editSegment(suggestion.chapterId, suggestion.segmentIndex, suggestion.replacement)
  assert.equal(editor.getFonts().find((item) => item.value === 'Broken Font')?.count, 2)
  assert.equal(editor.replaceFontFamily('Broken Font', 'serif'), 2)
  const zip = await JSZip.loadAsync(await (await editor.buildBlob()).arrayBuffer())
  const css = await zip.file('OPS/book.css').async('string')
  assert.match(css, /@font-face \{ font-family: Broken Font/)
  assert.match(css, /body \{ font-family: serif/)
  assert.match(await zip.file('OPS/one.xhtml').async('string'), /font-family: serif/)
  editor.undo()
  assert.equal(editor.getFonts().find((item) => item.value === 'Broken Font')?.count, 2)
})

test('EPUB 2 structural repairs remove EPUB 3 attributes and update invalid id references', async () => {
  const editor = await openEpubContent(await fixture('2.0.1', { structural: true }))
  const suggestions = editor.getStructuralSuggestions()
  assert.ok(suggestions.some((item) => item.kind === 'legacy-attributes'))
  assert.ok(suggestions.some((item) => item.kind === 'invalid-id'))
  assert.ok(editor.applyStructuralSuggestions(suggestions.map((item) => item.id)) >= 3)
  assert.equal(editor.getStructuralSuggestions().length, 0)

  const zip = await JSZip.loadAsync(await (await editor.buildBlob()).arrayBuffer())
  const first = await zip.file('OPS/one.xhtml').async('string')
  const second = await zip.file('OPS/two.xhtml').async('string')
  assert.doesNotMatch(first, /\sepub:(?:prefix|type)=/)
  assert.match(first, /id="bad-id"/)
  assert.match(second, /href="one.xhtml#bad-id"/)

  assert.equal(editor.undo(), true)
  assert.ok(editor.getStructuralSuggestions().length >= 2)
})

test('protected and fixed-layout books are rejected before content editing', async () => {
  await assert.rejects(openEpubContent(await fixture('3.0', { protectedFile: true })), /Védett/)
  await assert.rejects(openEpubContent(await fixture('3.0', { fixed: true })), /kötött elrendezésű/)
  await assert.rejects(openEpubContent(new Blob(['not a zip'])), /Corrupted zip|end of central directory/i)
})
