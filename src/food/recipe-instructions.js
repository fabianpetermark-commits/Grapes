// Only a minimal, inert subset of rich-text markup is saved or rendered.
// Pasted HTML is untrusted: scripts, styles, URLs and element attributes never survive.
const BLOCKED = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'img', 'video', 'audio', 'form', 'input', 'template', 'noscript', 'link', 'meta'])
const TAGS = new Map([['b','strong'],['strong','strong'],['i','em'],['em','em'],['u','u'],['br','br'],['p','p'],['div','div'],['ol','ol'],['ul','ul'],['li','li']])
const BLOCKS = new Set(['p','div','ol','ul','li'])
const escapeText = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

export function normalizeInstructionText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n').trim().slice(0, 15000)
}

export function plainInstructionsToHtml(value) {
  const text = normalizeInstructionText(value)
  return text ? text.split('\n').map(line => '<div>'+(line ? escapeText(line) : '<br>')+'</div>').join('') : ''
}

// A detached template is inert. Construct entirely new nodes rather than
// copying attributes/styles/events from the source, then serialize those nodes.
export function sanitizeInstructionHtml(value, documentRef = globalThis.document) {
  if (!documentRef?.createElement) return ''
  const template = documentRef.createElement('template')
  template.innerHTML = String(value ?? '').slice(0, 100000)
  const clean = documentRef.createElement('div')
  let remaining = 15000
  function append(node, parent, depth = 0) {
    if (remaining <= 0 || depth > 50) return
    if (node.nodeType === 3) {
      const value = (node.nodeValue || '').slice(0, remaining)
      remaining -= value.length
      parent.appendChild(documentRef.createTextNode(value))
      return
    }
    if (node.nodeType !== 1) return
    const tag = node.localName?.toLowerCase()
    if (!tag || BLOCKED.has(tag)) return
    let safeTag = TAGS.get(tag)
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') safeTag = 'p'
    const style = tag === 'span' ? node.getAttribute('style') || '' : ''
    const bold = /font-weight\s*:\s*(?:bold|[6-9]00)\b/i.test(style)
    const italic = /font-style\s*:\s*italic\b/i.test(style)
    if (!safeTag && bold) safeTag = 'strong'
    else if (!safeTag && italic) safeTag = 'em'
    const target = safeTag ? documentRef.createElement(safeTag) : parent
    if (safeTag) parent.appendChild(target)
    if (safeTag === 'br') return
    for (const child of node.childNodes) append(child, target, depth + 1)
    if (safeTag && !target.hasChildNodes()) target.remove()
  }
  for (const child of template.content.childNodes) append(child, clean)
  return clean.innerHTML
}

export function instructionHtmlToPlain(value, documentRef = globalThis.document) {
  if (!documentRef?.createElement) return normalizeInstructionText(value)
  const template = documentRef.createElement('template')
  template.innerHTML = sanitizeInstructionHtml(value, documentRef)
  function text(node) {
    if (node.nodeType === 3) return node.nodeValue || ''
    if (node.nodeType !== 1) return ''
    const tag = node.localName?.toLowerCase()
    if (tag === 'br') return '\n'
    if (tag === 'ol' || tag === 'ul') {
      const items = [...node.children].filter(child => child.localName === 'li')
      return items.map((item,index)=>(tag === 'ol' ? (index+1)+'. ' : '• ')+[...item.childNodes].map(text).join('').trim()).join('\n')+'\n'
    }
    const body = [...node.childNodes].map(text).join('')
    return BLOCKS.has(tag) ? body+'\n' : body
  }
  return normalizeInstructionText([...template.content.childNodes].map(text).join(''))
}

export function getInstructionsFromEditor(editor) {
  const instructionsHtml = sanitizeInstructionHtml(editor.innerHTML, editor.ownerDocument)
  return { instructions: instructionHtmlToPlain(instructionsHtml, editor.ownerDocument), instructionsHtml }
}

export function setInstructionsEditor(editor, instructions = '', instructionsHtml = '') {
  const doc = editor.ownerDocument
  editor.innerHTML = instructionsHtml
    ? sanitizeInstructionHtml(instructionsHtml, doc)
    : plainInstructionsToHtml(instructions)
}

export function instructionsDisplayHtml(recipe, documentRef = globalThis.document) {
  if (recipe?.instructionsHtml) return sanitizeInstructionHtml(recipe.instructionsHtml, documentRef)
  return plainInstructionsToHtml(recipe?.instructions || '')
}

export function bindInstructionsEditor(editor, toolbar) {
  const doc = editor.ownerDocument
  editor.addEventListener('paste', event => {
    const clipboard = event.clipboardData
    if (!clipboard) return
    const html = clipboard.getData('text/html')
    const plain = clipboard.getData('text/plain')
    if (!html && !plain) return
    event.preventDefault()
    const safe = html ? sanitizeInstructionHtml(html, doc) : ''
    const insertion = safe || plainInstructionsToHtml(plain)
    if (!insertion) return
    editor.focus()
    if (doc.execCommand?.('insertHTML', false, insertion)) return
    // Browser fallback: insert only nodes reconstructed by the sanitizer.
    const selection = doc.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    const parsed = doc.createElement('template')
    parsed.innerHTML = insertion
    const fragment = doc.createDocumentFragment()
    let last
    while (parsed.content.firstChild) {
      last = parsed.content.firstChild
      fragment.appendChild(last)
    }
    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents()
      range.insertNode(fragment)
      range.setStartAfter(last)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    } else editor.appendChild(fragment)
    editor.dispatchEvent(new Event('input',{ bubbles:true }))
  })
  toolbar?.querySelectorAll('[data-food-instructions-command]').forEach(button => {
    button.addEventListener('pointerdown', event => event.preventDefault())
    button.addEventListener('click', () => {
      editor.focus()
      const command = button.dataset.foodInstructionsCommand
      if (command === 'bold' || command === 'insertOrderedList') doc.execCommand?.(command, false, null)
    })
  })
}
