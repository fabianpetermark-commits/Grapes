import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeEmailHtml, contrastRatio } from '../src/email-studio/quality.js'
import { compileEmail, createDefaultEmailDocument, emailToPlainText } from '../src/email-studio/compiler.js'

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
