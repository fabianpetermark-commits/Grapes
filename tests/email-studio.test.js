import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeEmailHtml, contrastRatio } from '../src/email-studio/quality.js'
import { compileEmail, createDefaultEmailDocument, emailToPlainText } from '../src/email-studio/compiler.js'
import {
  applyMetadataToHtml, assertSafeMjml, createTemplateMjml, formatMarkup, legacyDocumentToMjml,
} from '../src/email-studio/mjml.js'

test('the default project compiles to portable email HTML', () => {
  const document = createDefaultEmailDocument()
  const html = compileEmail(document)
  assert.match(html, /^<!doctype html>/i)
  assert.match(html, /role="presentation"/)
  assert.match(html, /max-width:600px/)
  assert.match(html, /mso-hide:all/)
  assert.match(html, /@media only screen/)
  assert.match(html, /email-icons\/facebook\.png/)
  assert.match(html, /width="32" height="32" alt="Facebook"/)
  const report = analyzeEmailHtml(html, { plainText: emailToPlainText(document), brand: document.brand })
  assert.equal(report.blockers, 0)
  assert.ok(report.score >= 90)
})

test('content and unsafe URLs cannot inject executable markup', () => {
  const document = createDefaultEmailDocument()
  document.blocks[0].text = '<script>alert(1)</script>'
  document.blocks.find((block) => block.type === 'button').href = 'javascript:alert(1)'
  const html = compileEmail(document)
  assert.doesNotMatch(html, /<script>alert/)
  assert.match(html, /&lt;script&gt;alert/)
  assert.doesNotMatch(html, /javascript:/)
})

test('quality checks block unsafe or incompatible custom code', () => {
  const report = analyzeEmailHtml('<html><body><script>x()</script><img src="http://example.com/a.png"><a href="/relative">x</a></body></html>')
  assert.ok(report.blockers >= 3)
  assert.ok(report.issues.some((item) => item.title === 'Tiltott HTML-elem'))
  assert.ok(report.issues.some((item) => item.title === 'Kép alternatív szöveg nélkül'))
  assert.ok(report.issues.some((item) => item.title === 'Relatív URL található'))
})

test('plain text export keeps essential content and unsubscribe route', () => {
  const document = createDefaultEmailDocument()
  const text = emailToPlainText(document)
  assert.match(text, /A hónap legfontosabb híre/)
  assert.match(text, /Megnézem: https:\/\/example\.com/)
  assert.match(text, /Leiratkozás: \{\{unsubscribe_url\}\}/)
})

test('contrast calculation follows accessibility thresholds', () => {
  assert.ok(contrastRatio('#000000', '#ffffff') > 20)
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1)
})

test('professional templates contain portable MJML sections and accessible social icons', () => {
  for (const kind of ['newsletter', 'promotion', 'announcement']) {
    const mjml = createTemplateMjml(kind)
    assert.match(mjml, /^<mjml>/)
    assert.match(mjml, /<mj-body[^>]+width="600px">/)
    assert.match(mjml, /<mj-section/)
    assert.doesNotMatch(mjml, /<script|javascript:/i)
  }
  const newsletter = createTemplateMjml('newsletter')
  assert.match(newsletter, /mj-social-element[^>]+alt="Facebook"/)
  assert.match(newsletter, /<mj-column width="50%">/)
})

test('legacy visual projects migrate to MJML without executable content', () => {
  const document = createDefaultEmailDocument()
  document.blocks[0].text = '<script>alert(1)</script>'
  document.blocks.find((block) => block.type === 'button').href = 'javascript:alert(1)'
  const mjml = legacyDocumentToMjml(document)
  assert.match(mjml, /&lt;script&gt;alert/)
  assert.doesNotMatch(mjml, /href="javascript:/)
  assert.match(mjml, /href="#"/)
})

test('MJML source validation rejects active content and metadata decorates the compiled HTML', () => {
  assert.throws(() => assertSafeMjml('<mjml><mj-body><mj-raw><script>x()</script></mj-raw></mj-body></mjml>'), /biztonságos/)
  const html = applyMetadataToHtml('<html><head></head><body><p>Tartalom</p></body></html>', {
    name: 'Projekt', subject: 'Teszt tárgy', preheader: 'Rövid előnézet',
  })
  assert.match(html, /<title>Teszt tárgy<\/title>/)
  assert.match(html, /display:none;max-height:0[^>]+>Rövid előnézet/)
})

test('MJML code view formats the serialized one-line source', () => {
  const formatted = formatMarkup('<mjml><mj-body><mj-section><mj-column><mj-text>Szöveg</mj-text></mj-column></mj-section></mj-body></mjml>')
  assert.match(formatted, /\n  <mj-body>/)
  assert.match(formatted, /\n        <mj-text>Szöveg<\/mj-text>/)
})
