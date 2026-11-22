import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('mobile E-book prototype exposes only existing feature areas', async () => {
  const html = await readFile(new URL('../ebook-mobile-prototype.html', import.meta.url), 'utf8')
  for (const label of ['Könyvtár', 'Szerkesztő', 'Megosztás', 'Olvasó', 'Eszközök']) {
    assert.match(html, new RegExp(label))
  }
  for (const feature of ['Google Books', 'Open Library', 'QR-kód', '6 karakteres párosítási kód', 'Kétirányú szinkronizálás', 'Szerkezeti ellenőrzés és validálás']) {
    assert.ok(html.includes(feature), `Missing existing feature: ${feature}`)
  }
  for (const unimplemented of ['Kedvencek', 'Gyűjtemények', 'Olvasási statisztikák', 'Felfedezés']) {
    assert.ok(!html.includes(unimplemented), `Prototype must not invent: ${unimplemented}`)
  }
  assert.match(html, /Android WebView-ban nem érhető el/)
})

test('editor uses a cover mosaic and opens the selected book workspace', async () => {
  const html = await readFile(new URL('../ebook-mobile-prototype.html', import.meta.url), 'utf8')
  assert.match(html, /class="editor-picker" id="editor-picker"/)
  assert.match(html, /data-book-select="0"/)
  assert.match(html, /class="editor-workspace" id="editor-workspace" hidden/)
  assert.match(html, /id="editor-back"/)
  assert.match(html, /id="selected-book-title"/)
  assert.match(html, /picker\.hidden=true;workspace\.hidden=false/)
  assert.match(html, /workspace\.hidden=true;picker\.hidden=false/)
  assert.match(html, /Könyvborítók mozaikja/)
})
