import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { rewritePdfMetadata } from '../src/ebook/pdf-metadata.js'

async function samplePdf() {
  const document = await PDFDocument.create()
  document.addPage([300, 400])
  document.setTitle('Marketing management a Ãºj')
  document.setAuthor('Unknown Author')
  return new Blob([await document.save()], { type: 'application/pdf' })
}

test('rewrites Unicode PDF title and author without changing page count', async () => {
  const original = await samplePdf()
  const result = await rewritePdfMetadata(original, {
    title: 'Marketing management – A új világ',
    author: 'Kotler, Philip',
    description: 'Magyar kiadás',
    subjects: ['marketing', 'üzlet'],
  })
  const document = await PDFDocument.load(await result.blob.arrayBuffer(), { updateMetadata: false })
  assert.equal(document.getTitle(), 'Marketing management – A új világ')
  assert.equal(document.getAuthor(), 'Kotler, Philip')
  assert.equal(document.getSubject(), 'Magyar kiadás')
  assert.equal(document.getKeywords(), 'marketing üzlet')
  assert.equal(document.getPageCount(), 1)
  assert.equal(result.hasSignatures, false)
})

test('can explicitly clear embedded title and author', async () => {
  const result = await rewritePdfMetadata(await samplePdf(), {}, { clearFields: ['title', 'author'] })
  const document = await PDFDocument.load(await result.blob.arrayBuffer(), { updateMetadata: false })
  assert.equal(document.getTitle(), '')
  assert.equal(document.getAuthor(), '')
})

test('rejects a non-PDF without producing an output file', async () => {
  await assert.rejects(rewritePdfMetadata(new Blob(['not a pdf']), { title: 'X' }), /nem érvényes PDF/)
})
