import JSZip from 'jszip'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

const OPF = 'http://www.idpf.org/2007/opf'
const XHTML = 'http://www.w3.org/1999/xhtml'
const EPUB = 'http://www.idpf.org/2007/ops'
const MAX_SIZE = 100 * 1024 * 1024
const MAX_EXPANDED = 250 * 1024 * 1024
const serializer = new XMLSerializer()
const textNodes = (root) => {
  const found = []
  const visit = (node) => {
    if (node.nodeType === 3 && node.data.trim()) found.push(node)
    if (node.nodeType === 1 && ['script', 'style', 'svg', 'math'].includes(node.localName)) return
    for (const child of [...(node.childNodes || [])]) visit(child)
  }
  visit(root)
  return found
}
const elements = (root, name) => [...root.getElementsByTagName('*')].filter((node) => name === '*' || node.localName === name)

function parseXml(source, label) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error(`${label}: XML-entitások nem támogatottak.`)
  const errors = []
  const doc = new DOMParser({ onError: (level, message) => { if (level !== 'warning') errors.push(message) } }).parseFromString(source, 'application/xml')
  if (errors.length || !doc?.documentElement || doc.getElementsByTagName('parsererror').length) throw new Error(`${label}: hibás XML.`)
  return doc
}

function archivePath(from, href) {
  if (!href || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(href)) throw new Error('Érvénytelen EPUB-erőforrásútvonal.')
  let decoded
  try { decoded = decodeURIComponent(href.split(/[?#]/)[0]) } catch { throw new Error('Hibásan kódolt EPUB-útvonal.') }
  const parts = from.split('/').slice(0, -1)
  for (const part of decoded.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!parts.length) throw new Error('Az EPUB-útvonal kilép a csomagból.'); parts.pop() }
    else parts.push(part)
  }
  return parts.join('/')
}

function firstEditableText(element) {
  if (!element) return null
  const nodes = textNodes(element)
  return nodes.length === 1 ? nodes[0] : null
}

function findTocText(navDoc, navPath, chapterPath, epub3) {
  if (!navDoc) return null
  const entries = epub3
    ? elements(navDoc, 'nav').filter((node) => (node.getAttribute('epub:type') || '').split(/\s+/).includes('toc')).flatMap((node) => elements(node, 'a').map((link) => ({ href: link.getAttribute('href'), label: link })))
    : elements(navDoc, 'navPoint').map((point) => ({ href: elements(point, 'content')[0]?.getAttribute('src'), label: elements(point, 'navLabel')[0] && elements(elements(point, 'navLabel')[0], 'text')[0] }))
  const matches = entries.filter((entry) => {
    try { return archivePath(navPath, entry.href) === chapterPath } catch { return false }
  })
  const exact = matches.filter((entry) => !entry.href.includes('#'))
  const match = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null
  return firstEditableText(match?.label)
}

function safeText(value) {
  const text = String(value)
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) throw new Error('A szöveg nem tartalmazhat vezérlőkaraktereket.')
  return text
}

function suspiciousRepair(value) {
  if (!/(?:Ã.|Å.|Â.|â[€œ€™]|�)/u.test(value)) return null
  if (value.includes('�')) return { replacement: '', recoverable: false }
  const windows1252 = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f }
  let changed = false
  const replacement = value.replace(/(?:[ÃÅÂ][^\s]|â[^\s]{2})+/gu, (candidate) => {
    const bytes = []
    for (const char of candidate) {
      const code = char.codePointAt(0)
      const byte = windows1252[char] ?? (code <= 255 ? code : null)
      if (byte == null) return candidate
      bytes.push(byte)
    }
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
      if (decoded !== candidate && !/(?:Ã.|Å.|Â.|â[€œ€™])/u.test(decoded)) { changed = true; return decoded }
    } catch { /* A hibás bájtsorozatot nem lehet biztosan visszaállítani. */ }
    return candidate
  })
  return changed ? { replacement, recoverable: true } : null
}

function fontDeclarations(source) {
  const found = []
  const rule = /([^{}]+)\{([^{}]*)\}/g
  for (const match of source.matchAll(rule)) {
    if (match[1].trim().startsWith('@font-face')) continue
    const declaration = /font-family\s*:\s*([^;}]+)/gi
    for (const entry of match[2].matchAll(declaration)) {
      found.push({ value: entry[1].trim(), start: match.index + match[1].length + 1 + entry.index + entry[0].indexOf(entry[1]), end: match.index + match[1].length + 1 + entry.index + entry[0].indexOf(entry[1]) + entry[1].length })
    }
  }
  return found
}

function validNcName(value) {
  return /^[\p{L}_][\p{L}\p{N}\p{M}_.-]*$/u.test(value)
}

function repairedId(value, used) {
  let next = String(value).replace(/[^\p{L}\p{N}\p{M}_.-]+/gu, '-').replace(/^-+|-+$/g, '')
  if (!/^[\p{L}_]/u.test(next)) next = `id-${next}`
  if (!next) next = 'id'
  const base = next
  let suffix = 2
  while (used.has(next)) next = `${base}-${suffix++}`
  used.add(next)
  return next
}

export async function openEpubContent(blob) {
  if (blob.size > MAX_SIZE) throw new Error('A 100 MiB-nál nagyobb EPUB nem szerkeszthető.')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true })
  if (Object.keys(zip.files).some((path) => path.startsWith('/') || path.split('/').includes('..'))) throw new Error('Az EPUB veszélyes fájlútvonalat tartalmaz.')
  const expanded = Object.values(zip.files).reduce((sum, entry) => sum + (entry._data?.uncompressedSize || 0), 0)
  if (expanded > MAX_EXPANDED) throw new Error('A kibontott EPUB túl nagy a biztonságos szerkesztéshez.')
  if ((await zip.file('mimetype')?.async('string'))?.trim() !== 'application/epub+zip') throw new Error('Hiányzó vagy hibás EPUB mimetype.')
  if (zip.file('META-INF/encryption.xml') || zip.file('META-INF/signatures.xml')) throw new Error('Védett vagy aláírt EPUB nem írható át.')
  const container = zip.file('META-INF/container.xml')
  if (!container) throw new Error('Hiányzó EPUB container.xml.')
  const containerDoc = parseXml(await container.async('string'), 'container.xml')
  const opfPath = containerDoc.getElementsByTagName('rootfile')[0]?.getAttribute('full-path')
  if (!opfPath || opfPath.startsWith('/') || opfPath.split('/').includes('..') || !zip.file(opfPath)) throw new Error('Hiányzó vagy veszélyes EPUB-csomagfájl.')
  const opfDoc = parseXml(await zip.file(opfPath).async('string'), 'OPF')
  const pkg = opfDoc.documentElement
  const version = pkg.getAttribute('version') || ''
  const packageTitle = elements(pkg, 'title').find((node) => node.namespaceURI === 'http://purl.org/dc/elements/1.1/')?.textContent.trim() || ''
  if (pkg.namespaceURI !== OPF || !/^([23])\./.test(version)) throw new Error('Csak EPUB 2 és EPUB 3 szerkeszthető.')
  const manifest = elements(pkg, 'manifest')[0]
  const spine = elements(pkg, 'spine')[0]
  if (!manifest || !spine) throw new Error('Hiányzó EPUB manifest vagy spine.')
  const items = new Map(elements(manifest, 'item').map((item) => [item.getAttribute('id'), item]))
  if (elements(pkg, 'meta').some((node) => node.getAttribute('property') === 'rendition:layout' && node.textContent.trim() === 'pre-paginated')
    || elements(spine, 'itemref').some((node) => /layout-pre-paginated/.test(node.getAttribute('properties') || ''))
    || [...items.values()].some((node) => /(?:javascript|ecmascript|smil)/i.test(node.getAttribute('media-type') || '') || /\bscripted\b/.test(node.getAttribute('properties') || '') || node.hasAttribute('media-overlay'))) {
    throw new Error('A kötött elrendezésű, szkriptes vagy multimédiás EPUB csak adatlapon szerkeszthető.')
  }
  const epub3 = version.startsWith('3')
  const navItem = epub3 ? [...items.values()].find((item) => (item.getAttribute('properties') || '').split(/\s+/).includes('nav')) : items.get(spine.getAttribute('toc'))
  if (!navItem) throw new Error('Hiányzó vagy nem egyértelmű EPUB tartalomjegyzék.')
  const navPath = archivePath(opfPath, navItem.getAttribute('href'))
  if (!zip.file(navPath)) throw new Error('Hiányzó tartalomjegyzék-fájl.')
  const navDoc = parseXml(await zip.file(navPath).async('string'), 'Tartalomjegyzék')
  const docs = new Map([[navPath, navDoc]])
  const xhtmlPaths = new Set()
  for (const item of items.values()) {
    if (item.getAttribute('media-type') !== 'application/xhtml+xml') continue
    const path = archivePath(opfPath, item.getAttribute('href'))
    if (!zip.file(path)) throw new Error(`Hiányzó XHTML-fájl: ${path}`)
    xhtmlPaths.add(path)
    if (!docs.has(path)) docs.set(path, parseXml(await zip.file(path).async('string'), path))
  }
  const chapters = []
  for (const ref of elements(spine, 'itemref')) {
    const item = items.get(ref.getAttribute('idref'))
    if (!item || item.getAttribute('media-type') !== 'application/xhtml+xml') throw new Error('Nem XHTML-alapú fejezetet tartalmazó EPUB nem szerkeszthető.')
    const path = archivePath(opfPath, item.getAttribute('href'))
    if (!zip.file(path)) throw new Error(`Hiányzó fejezet: ${path}`)
    const doc = docs.get(path)
    if (elements(doc, 'script').length) throw new Error('Szkriptet tartalmazó EPUB csak adatlapon szerkeszthető.')
    const body = elements(doc.documentElement, 'body')[0]
    if (!body || body.namespaceURI !== XHTML) throw new Error(`Hibás XHTML-fejezet: ${path}`)
    const heading = elements(body, '*').find((node) => /^h[1-6]$/.test(node.localName))
    const headingNode = firstEditableText(heading)
    const tocNode = findTocText(navDoc, navPath, path, epub3)
    chapters.push({ id: ref.getAttribute('idref'), path, doc, headingNode, tocNode, segments: textNodes(body), title: tocNode?.data.trim() || heading?.textContent.trim() || path })
  }
  if (!chapters.length) throw new Error('Az EPUB nem tartalmaz szerkeszthető fejezetet.')
  const styles = new Map()
  for (const item of items.values()) {
    if (item.getAttribute('media-type') !== 'text/css') continue
    const path = archivePath(opfPath, item.getAttribute('href'))
    if (!zip.file(path)) throw new Error(`Hiányzó stíluslap: ${path}`)
    styles.set(path, await zip.file(path).async('string'))
  }
  const initialDocs = new Map([...docs].map(([path, doc]) => [path, serializer.serializeToString(doc)]))
  const initialStyles = new Map(styles)
  function validateReferences() {
    for (const [path, doc] of docs) for (const node of elements(doc, '*')) {
      for (const attribute of ['href', 'src']) {
        const value = node.getAttribute(attribute)
        if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) continue
        const target = value.startsWith('#') ? path : archivePath(path, value)
        if (!zip.file(target)) throw new Error(`Hiányzó belső hivatkozás: ${path} → ${value}`)
        let fragment = ''
        try { fragment = value.includes('#') ? decodeURIComponent(value.split('#')[1].split('?')[0]) : '' }
        catch { throw new Error(`Hibás belső hivatkozás: ${path} → ${value}`) }
        if (fragment && docs.has(target) && !elements(docs.get(target), '*').some((entry) => entry.getAttribute('id') === fragment)) throw new Error(`Hiányzó belső hivatkozási cél: ${path} → ${value}`)
      }
    }
  }
  const undoStack = []
  const chapter = (id) => { const found = chapters.find((entry) => entry.id === id); if (!found) throw new Error('Ismeretlen fejezet.'); return found }
  const saveUndo = (label, rollback) => undoStack.push({ label, rollback })
  function structuralSuggestions() {
    const found = []
    if (!epub3) {
      for (const path of xhtmlPaths) {
        const attributes = []
        for (const node of elements(docs.get(path), '*')) {
          for (let index = 0; index < (node.attributes?.length || 0); index++) {
            const attribute = node.attributes.item(index)
            if (attribute?.namespaceURI === EPUB && ['prefix', 'type'].includes(attribute.localName)) attributes.push({ node, name: attribute.name, namespace: attribute.namespaceURI, value: attribute.value })
          }
        }
        if (attributes.length) found.push({
          id: `legacy-attributes:${path}`,
          kind: 'legacy-attributes',
          path,
          count: attributes.length,
          title: 'EPUB 3-as attribútumok eltávolítása az EPUB 2-es fejezetből',
          detail: `${attributes.length} darab epub:prefix vagy epub:type attribútum · ${path}`,
          attributes,
        })
      }
    }
    for (const path of xhtmlPaths) {
      const doc = docs.get(path)
      const withIds = elements(doc, '*').filter((node) => node.hasAttribute('id'))
      const frequencies = new Map()
      for (const node of withIds) frequencies.set(node.getAttribute('id'), (frequencies.get(node.getAttribute('id')) || 0) + 1)
      const used = new Set(withIds.map((node) => node.getAttribute('id')))
      let index = 0
      for (const node of withIds) {
        const oldId = node.getAttribute('id')
        if (validNcName(oldId) || frequencies.get(oldId) !== 1) continue
        const nextId = repairedId(oldId, used)
        found.push({
          id: `invalid-id:${path}:${index++}`,
          kind: 'invalid-id',
          path,
          count: 1,
          title: 'Érvénytelen belső azonosító javítása',
          detail: `${oldId} → ${nextId} · a rá mutató belső hivatkozásokkal együtt · ${path}`,
          node,
          oldId,
          nextId,
        })
      }
    }
    return found
  }
  function rewriteFragmentReference(value, sourcePath, renames) {
    if (!value?.includes('#') || /^(?:https?:|mailto:|data:|javascript:|\/\/)/i.test(value)) return value
    const hash = value.indexOf('#')
    const before = value.slice(0, hash)
    let fragment
    try { fragment = decodeURIComponent(value.slice(hash + 1)) } catch { return value }
    let targetPath
    try { targetPath = before ? archivePath(sourcePath, before) : sourcePath } catch { return value }
    const rename = renames.find((entry) => entry.path === targetPath && entry.oldId === fragment)
    return rename ? `${before}#${encodeURIComponent(rename.nextId)}` : value
  }
  function applyStructuralSuggestions(ids) {
    const selected = new Set(ids)
    const suggestions = structuralSuggestions().filter((item) => selected.has(item.id))
    if (!suggestions.length) return 0
    const removedAttributes = []
    const renamedIds = []
    for (const suggestion of suggestions) {
      if (suggestion.kind === 'legacy-attributes') {
        for (const attribute of suggestion.attributes) {
          removedAttributes.push(attribute)
          attribute.node.removeAttribute(attribute.name)
        }
      } else if (suggestion.kind === 'invalid-id') {
        renamedIds.push(suggestion)
        suggestion.node.setAttribute('id', suggestion.nextId)
      }
    }
    const changedReferences = []
    if (renamedIds.length) for (const [path, doc] of docs) for (const node of elements(doc, '*')) {
      for (const name of ['href', 'src', 'xlink:href']) {
        const value = node.getAttribute(name)
        if (!value) continue
        const next = rewriteFragmentReference(value, path, renamedIds)
        if (next !== value) { changedReferences.push({ node, name, value }); node.setAttribute(name, next) }
      }
      for (const name of ['aria-labelledby', 'aria-describedby', 'headers']) {
        const value = node.getAttribute(name)
        if (!value) continue
        const local = renamedIds.filter((entry) => entry.path === path)
        const next = value.split(/\s+/).map((token) => local.find((entry) => entry.oldId === token)?.nextId || token).join(' ')
        if (next !== value) { changedReferences.push({ node, name, value }); node.setAttribute(name, next) }
      }
    }
    const count = removedAttributes.length + renamedIds.length
    saveUndo(`${count} szerkezeti javítás`, () => {
      for (const change of changedReferences.reverse()) change.node.setAttribute(change.name, change.value)
      for (const change of renamedIds.reverse()) change.node.setAttribute('id', change.oldId)
      for (const change of removedAttributes.reverse()) change.node.setAttributeNS(change.namespace, change.name, change.value)
    })
    return count
  }
  const api = {
    chapters,
    title: packageTitle,
    getSegments(id) { return chapter(id).segments.map((node, index) => ({ index, text: node.data })) },
    getChapter(id) { const item = chapter(id); return { id, title: item.title, heading: item.headingNode?.data.trim() || '', toc: item.tocNode?.data.trim() || '', headingEditable: Boolean(item.headingNode), tocEditable: Boolean(item.tocNode) } },
    getMatches(query, { caseSensitive = false, wholeWord = false } = {}) {
      if (!query || query.length > 200) return []
      const needle = caseSensitive ? query : query.toLocaleLowerCase()
      const matches = []
      for (const item of chapters) item.segments.forEach((node, segmentIndex) => {
        const text = node.data
        const haystack = caseSensitive ? text : text.toLocaleLowerCase()
        let from = 0; let start
        while ((start = haystack.indexOf(needle, from)) !== -1) {
          const end = start + needle.length
          const word = /[\p{L}\p{N}_]/u
          if (!wholeWord || (!word.test(text[start - 1] || '') && !word.test(text[end] || ''))) {
            matches.push({ chapterId: item.id, chapterTitle: item.title, segmentIndex, start, end, before: text.slice(Math.max(0, start - 45), start), found: text.slice(start, end), after: text.slice(end, end + 45) })
          }
          from = end || start + 1
        }
      })
      return matches
    },
    replaceMatches(matches, replacement) {
      const value = safeText(replacement)
      const groups = new Map()
      for (const match of matches) {
        const item = chapter(match.chapterId)
        const node = item.segments[match.segmentIndex]
        if (!node || node.data.slice(match.start, match.end) !== match.found) throw new Error('A találatok közben megváltoztak. Keress újra.')
        if (!groups.has(node)) groups.set(node, [])
        groups.get(node).push(match)
      }
      if (!groups.size) return 0
      const originals = [...groups].map(([node]) => [node, node.data])
      for (const [node, entries] of groups) {
        for (const match of entries.sort((a, b) => b.start - a.start)) node.data = node.data.slice(0, match.start) + value + node.data.slice(match.end)
      }
      saveUndo(`${matches.length} szövegcsere`, () => originals.forEach(([node, text]) => { node.data = text }))
      return matches.length
    },
    editSegment(id, index, value, expected = undefined) {
      const node = chapter(id).segments[index]
      if (!node) throw new Error('Ismeretlen szövegrész.')
      if (expected !== undefined && node.data !== expected) throw new Error('A szövegrész közben megváltozott. Vizsgáld meg újra a javaslatot.')
      const next = safeText(value)
      if (next === node.data) return false
      const old = node.data; node.data = next
      saveUndo('Szövegrész javítása', () => { node.data = old })
      return true
    },
    renameChapter(id, { heading, toc }) {
      const item = chapter(id)
      const changes = []
      for (const [node, value] of [[item.headingNode, heading], [item.tocNode, toc]]) {
        if (value === undefined) continue
        if (!node) throw new Error('Ez a fejezetcím nem szerkeszthető biztonságosan.')
        const next = safeText(value).trim()
        if (!next) throw new Error('A fejezetcím nem lehet üres.')
        if (node.data !== next) { changes.push([node, node.data]); node.data = next }
      }
      if (!changes.length) return false
      const oldTitle = item.title
      item.title = item.tocNode?.data.trim() || item.headingNode?.data.trim() || item.path
      saveUndo('Fejezetcím javítása', () => { changes.forEach(([node, text]) => { node.data = text }); item.title = oldTitle })
      return true
    },
    getFonts() {
      const counts = new Map()
      for (const source of styles.values()) for (const entry of fontDeclarations(source)) counts.set(entry.value, (counts.get(entry.value) || 0) + 1)
      for (const doc of docs.values()) for (const node of elements(doc, '*')) {
        const inline = node.getAttribute?.('style') || ''
        for (const entry of inline.matchAll(/font-family\s*:\s*([^;}]+)/gi)) counts.set(entry[1].trim(), (counts.get(entry[1].trim()) || 0) + 1)
      }
      return [...counts].map(([value, count]) => ({ value, count }))
    },
    replaceFontFamily(source, target) {
      if (!['serif', 'sans-serif'].includes(target)) throw new Error('Csak általános, olvasóbarát betűcsalád választható.')
      const oldStyles = new Map(styles)
      const oldInline = []
      let count = 0
      for (const [path, css] of styles) {
        const declarations = fontDeclarations(css).filter((entry) => entry.value === source).sort((a, b) => b.start - a.start)
        let updated = css
        for (const entry of declarations) { updated = updated.slice(0, entry.start) + target + updated.slice(entry.end); count++ }
        styles.set(path, updated)
      }
      for (const doc of docs.values()) for (const node of elements(doc, '*')) {
        const inline = node.getAttribute?.('style') || ''
        if (!inline) continue
        let changed = false
        const updated = inline.replace(/(font-family\s*:\s*)([^;}]+)/gi, (match, prefix, value) => {
          if (value.trim() !== source) return match
          changed = true; count++; return `${prefix}${target}`
        })
        if (changed) { oldInline.push([node, inline]); node.setAttribute('style', updated) }
      }
      if (count) saveUndo(`${count} betűtípus-javítás`, () => { styles.clear(); oldStyles.forEach((value, path) => styles.set(path, value)); oldInline.forEach(([node, style]) => node.setAttribute('style', style)) })
      return count
    },
    getStructuralSuggestions() {
      return structuralSuggestions().map(({ attributes, node, oldId, nextId, ...suggestion }) => suggestion)
    },
    applyStructuralSuggestions,
    getEncodingSuggestions() {
      const found = []
      for (const item of chapters) item.segments.forEach((node, index) => {
        const suggestion = suspiciousRepair(node.data)
        if (suggestion) found.push({ chapterId: item.id, chapterTitle: item.title, segmentIndex: index, original: node.data, ...suggestion })
      })
      return found
    },
    undo() { const action = undoStack.pop(); if (!action) return false; action.rollback(); return true },
    get hasChanges() { return undoStack.length > 0 },
    get changeSummary() { return undoStack.map((entry) => entry.label) },
    markSaved() { undoStack.length = 0 },
    async buildBlob() {
      if (!undoStack.length) return blob
      validateReferences()
      const output = new JSZip()
      output.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
      for (const [path, entry] of Object.entries(zip.files)) {
        if (path === 'mimetype') continue
        if (entry.dir) { output.folder(path); continue }
        let content = await entry.async('uint8array')
        if (path === opfPath && epub3) {
          const modified = elements(opfDoc, 'meta').find((node) => node.getAttribute('property') === 'dcterms:modified')
          if (modified) { modified.textContent = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); content = serializer.serializeToString(opfDoc) }
        } else if (docs.has(path)) {
          const serialized = serializer.serializeToString(docs.get(path))
          if (serialized !== initialDocs.get(path)) content = serialized
        } else if (styles.has(path) && styles.get(path) !== initialStyles.get(path)) content = styles.get(path)
        output.file(path, content, { compression: 'DEFLATE' })
      }
      const result = await output.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' })
      if (result.size > MAX_SIZE) throw new Error('A javított EPUB meghaladja a 100 MiB-os korlátot.')
      await openEpubContent(result)
      return result
    },
  }
  return api
}
