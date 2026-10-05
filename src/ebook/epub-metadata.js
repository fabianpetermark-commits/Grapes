import JSZip from 'jszip'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

const DC = 'http://purl.org/dc/elements/1.1/'
const OPF = 'http://www.idpf.org/2007/opf'
const MAX_EPUB_SIZE = 100 * 1024 * 1024
const MAX_EXPANDED_SIZE = 250 * 1024 * 1024
const MAX_COVER_SIZE = 10 * 1024 * 1024

function parseXml(xml, label) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error(`${label}: a külső XML-entitások nem támogatottak.`)
  const errors = []
  const doc = new DOMParser({ onError: (level, message) => { if (level !== 'warning') errors.push(message) } }).parseFromString(xml, 'application/xml')
  if (errors.length || !doc?.documentElement || doc.getElementsByTagName('parsererror').length) throw new Error(`${label}: hibás XML.`)
  return doc
}

function child(parent, localName, namespace) {
  return [...parent.childNodes].find((node) => node.nodeType === 1 && node.localName === localName && (!namespace || node.namespaceURI === namespace)) || null
}

function children(parent, localName, namespace) {
  return [...parent.childNodes].filter((node) => node.nodeType === 1 && node.localName === localName && (!namespace || node.namespaceURI === namespace))
}

function setDc(doc, metadata, name, value, clear = false) {
  let node = child(metadata, name, DC)
  if (!value) {
    if (clear && node && !['title', 'language'].includes(name)) metadata.removeChild(node)
    return
  }
  if (!node) {
    node = doc.createElementNS(DC, `dc:${name}`)
    metadata.appendChild(node)
  }
  node.textContent = value
}

function setSubjects(doc, metadata, subjects, clear = false) {
  if (!subjects.length && !clear) return
  for (const node of children(metadata, 'subject', DC)) metadata.removeChild(node)
  for (const subject of subjects) {
    const node = doc.createElementNS(DC, 'dc:subject')
    node.textContent = subject
    metadata.appendChild(node)
  }
}

function setIsbn(doc, packageNode, metadata, isbn, clear = false) {
  if (!isbn && !clear) return
  const uniqueId = packageNode.getAttribute('unique-identifier')
  const prior = children(metadata, 'identifier', DC).find((node) => node.getAttribute('id') === 'grapes-isbn' || (node.getAttribute('id') !== uniqueId && /^(?:97[89])?\d{9}[\dX]$/i.test(node.textContent.replace(/[^\dX]/gi, ''))))
  if (!isbn) {
    if (prior?.getAttribute('id') === 'grapes-isbn') metadata.removeChild(prior)
    return
  }
  const node = prior || doc.createElementNS(DC, 'dc:identifier')
  if (!prior) { node.setAttribute('id', 'grapes-isbn'); metadata.appendChild(node) }
  node.textContent = isbn
}

function setSeries(doc, metadata, version, series, seriesIndex, clear = false) {
  if (!version.startsWith('3')) return
  if (!series && !clear) return
  for (const node of children(metadata, 'meta', OPF)) {
    if (node.getAttribute('id') === 'grapes-series' || node.getAttribute('refines') === '#grapes-series') metadata.removeChild(node)
  }
  if (!series) return
  const collection = doc.createElementNS(OPF, 'meta')
  collection.setAttribute('id', 'grapes-series')
  collection.setAttribute('property', 'belongs-to-collection')
  collection.textContent = series
  metadata.appendChild(collection)
  const type = doc.createElementNS(OPF, 'meta')
  type.setAttribute('refines', '#grapes-series')
  type.setAttribute('property', 'collection-type')
  type.textContent = 'series'
  metadata.appendChild(type)
  if (seriesIndex) {
    const position = doc.createElementNS(OPF, 'meta')
    position.setAttribute('refines', '#grapes-series')
    position.setAttribute('property', 'group-position')
    position.textContent = seriesIndex
    metadata.appendChild(position)
  }
}

function validateCover(cover) {
  if (!cover) return null
  if (cover.remove === true) return { remove: true }
  const bytes = cover.bytes instanceof Uint8Array ? cover.bytes : new Uint8Array(cover.bytes)
  if (bytes.length > MAX_COVER_SIZE) throw new Error('A borító legfeljebb 10 MiB lehet.')
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index])
  if ((cover.mimeType === 'image/jpeg' && jpeg) || (cover.mimeType === 'image/png' && png)) return { bytes, mimeType: cover.mimeType, extension: png ? 'png' : 'jpg' }
  throw new Error('Csak érvényes JPG vagy PNG borító használható.')
}

function setCover(doc, packageNode, metadata, zip, opfPath, cover) {
  if (!cover) return
  const manifest = child(packageNode, 'manifest', OPF)
  if (!manifest) throw new Error('Hiányzik az EPUB manifest.')
  const items = children(manifest, 'item', OPF)
  const epub2Meta = children(metadata, 'meta', OPF).find((node) => node.getAttribute('name') === 'cover')
  let item = items.find((node) => (node.getAttribute('properties') || '').split(/\s+/).includes('cover-image'))
    || items.find((node) => node.getAttribute('id') === epub2Meta?.getAttribute('content'))
  if (item) item.setAttribute('properties', (item.getAttribute('properties') || '').split(/\s+/).filter((value) => value && value !== 'cover-image').join(' '))
  if (cover.remove) {
    if (epub2Meta) metadata.removeChild(epub2Meta)
    return
  }
  const used = new Set(items.map((node) => node.getAttribute('id')))
  let id = 'grapes-cover-image'
  for (let suffix = 2; used.has(id) && item?.getAttribute('id') !== id; suffix++) id = `grapes-cover-image-${suffix}`
  if (!item) { item = doc.createElementNS(OPF, 'item'); item.setAttribute('id', id); manifest.appendChild(item) }
  const path = `grapes-cover.${cover.extension}`
  item.setAttribute('href', path)
  item.setAttribute('media-type', cover.mimeType)
  if ((packageNode.getAttribute('version') || '').startsWith('3')) item.setAttribute('properties', 'cover-image')
  else {
    const meta = epub2Meta || doc.createElementNS(OPF, 'meta')
    meta.setAttribute('name', 'cover')
    meta.setAttribute('content', item.getAttribute('id'))
    if (!epub2Meta) metadata.appendChild(meta)
  }
  const folder = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  zip.file(`${folder}${path}`, cover.bytes, { compression: 'DEFLATE' })
}

async function inspectEpub(blob) {
  if (blob.size > MAX_EPUB_SIZE) throw new Error('A 100 MiB-nál nagyobb EPUB csak könyvtári adatlapként menthető.')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true })
  const expanded = Object.values(zip.files).reduce((sum, entry) => sum + (entry._data?.uncompressedSize || 0), 0)
  if (expanded > MAX_EXPANDED_SIZE) throw new Error('A kibontott EPUB túl nagy a biztonságos szerkesztéshez.')
  const mimetype = zip.file('mimetype')
  if (!mimetype || (await mimetype.async('string')).trim() !== 'application/epub+zip') throw new Error('Nem érvényes EPUB: hiányzik a mimetype.')
  if (zip.file('META-INF/encryption.xml')) throw new Error('A védett vagy titkosított EPUB nem szerkeszthető.')
  const container = zip.file('META-INF/container.xml')
  if (!container) throw new Error('Nem érvényes EPUB: hiányzik a container.xml.')
  const containerDoc = parseXml(await container.async('string'), 'container.xml')
  const rootfile = containerDoc.getElementsByTagName('rootfile')[0]
  const opfPath = rootfile?.getAttribute('full-path') || ''
  if (!opfPath || opfPath.startsWith('/') || opfPath.split('/').includes('..')) throw new Error('Nem érvényes EPUB: hibás OPF-útvonal.')
  const opf = zip.file(opfPath)
  if (!opf) throw new Error('Nem érvényes EPUB: hiányzik az OPF.')
  const doc = parseXml(await opf.async('string'), 'OPF')
  const packageNode = doc.documentElement
  if (packageNode.localName !== 'package' || packageNode.namespaceURI !== OPF) throw new Error('Nem érvényes EPUB: hibás OPF-csomag.')
  const metadata = child(packageNode, 'metadata', OPF)
  if (!metadata || !child(packageNode, 'manifest', OPF) || !child(packageNode, 'spine', OPF)) throw new Error('Nem érvényes EPUB: hiányos csomag.')
  return { zip, opfPath, doc, packageNode, metadata }
}

export async function rewriteEpubMetadata(blob, values, cover = null, { clearFields = [] } = {}) {
  const parsed = await inspectEpub(blob)
  const image = validateCover(cover)
  const { zip, opfPath, doc, packageNode, metadata } = parsed
  for (const [name, key] of [['title', 'title'], ['creator', 'author'], ['description', 'description'], ['language', 'language'], ['publisher', 'publisher'], ['date', 'publishedDate']]) setDc(doc, metadata, name, values[key] || '', clearFields.includes(key))
  setSubjects(doc, metadata, values.subjects || [], clearFields.includes('subjects'))
  setIsbn(doc, packageNode, metadata, values.isbn || '', clearFields.includes('isbn'))
  setSeries(doc, metadata, packageNode.getAttribute('version') || '', values.series || '', values.seriesIndex || '', clearFields.includes('series'))
  setCover(doc, packageNode, metadata, zip, opfPath, image)
  zip.file(opfPath, new XMLSerializer().serializeToString(doc))

  const output = new JSZip()
  output.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  for (const [path, entry] of Object.entries(zip.files)) {
    if (path === 'mimetype') continue
    if (entry.dir) { output.folder(path); continue }
    output.file(path, await entry.async('uint8array'), { compression: 'DEFLATE' })
  }
  const result = await output.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' })
  if (result.size > MAX_EPUB_SIZE) throw new Error('A módosított EPUB meghaladja a 100 MiB-os korlátot.')
  const header = new DataView(await result.slice(0, 30).arrayBuffer())
  if (header.getUint32(0, true) !== 0x04034b50 || header.getUint16(8, true) !== 0 || header.getUint16(26, true) !== 8) throw new Error('A módosított EPUB ZIP-fejléce hibás.')
  await inspectEpub(result)
  return result
}
