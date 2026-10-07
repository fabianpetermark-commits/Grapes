import { PDFDocument } from 'pdf-lib'

const MAX_PDF_BYTES = 100 * 1024 * 1024

function containsSignature(bytes) {
  const source = new TextDecoder('latin1').decode(bytes)
  return /\/FT\s*\/Sig\b/.test(source) || /\/Type\s*\/Sig\b/.test(source)
}

function text(value) { return String(value || '').trim() }

export async function rewritePdfMetadata(blob, values, { clearFields = [] } = {}) {
  if (!(blob instanceof Blob)) throw new Error('A PDF-fájl nem olvasható.')
  if (blob.size > MAX_PDF_BYTES) throw new Error('A 100 MiB-nál nagyobb PDF-et a Grapes nem írja át.')

  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes.length < 5 || new TextDecoder('latin1').decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('A fájl nem érvényes PDF.')

  let document
  try {
    document = await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (error) {
    const reason = /encrypted/i.test(String(error?.message || error)) ? 'A jelszóval védett PDF nem írható át.' : 'A PDF szerkezete nem olvasható.'
    throw new Error(reason)
  }

  let hasSignatures = containsSignature(bytes)
  try {
    hasSignatures ||= document.getForm().getFields().some((field) => /signature/i.test(field?.constructor?.name || ''))
  } catch { /* A PDF-nek nincs használható űrlapja. */ }

  const clear = new Set(clearFields)
  if (values.title || clear.has('title')) document.setTitle(text(values.title))
  if (values.author || clear.has('author')) document.setAuthor(text(values.author))
  if (values.description || clear.has('description')) document.setSubject(text(values.description))
  if ((values.subjects || []).length || clear.has('subjects')) document.setKeywords((values.subjects || []).map(text).filter(Boolean))

  let updatedBytes
  try {
    updatedBytes = await document.save({ useObjectStreams: false, addDefaultPage: false })
    await PDFDocument.load(updatedBytes, { updateMetadata: false })
  } catch {
    throw new Error('A módosított PDF ellenőrzése nem sikerült; az eredeti fájl változatlan maradt.')
  }

  return {
    blob: new Blob([updatedBytes], { type: 'application/pdf' }),
    hasSignatures,
  }
}
