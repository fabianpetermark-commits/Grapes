import '../styles/screens/email-studio.css'
import { el, els, create } from '../ui/dom.js'
import { notifyError, notifySuccess } from '../ui/toast.js'
import { loadLocalProject, saveLocalProject } from '../storage/local-project-store.js'
import { SOCIAL_NETWORKS, compileEmail, createDefaultEmailDocument, createEmailBlock, emailToPlainText } from './compiler.js'
import { analyzeEmailHtml } from './quality.js'

const STORAGE_ID = 'email-studio-current'
const BLOCK_LABELS = {
  heading: 'Címsor', text: 'Szöveg', image: 'Kép', button: 'Gomb',
  divider: 'Elválasztó', social: 'Social ikonok', footer: 'Lábléc',
}
const BRAND_FIELDS = [
  ['primary', 'Fő szín'], ['secondary', 'Másodlagos'], ['accent', 'Kiemelés'],
  ['background', 'Háttér'], ['surface', 'Levélfelület'], ['text', 'Szöveg'],
  ['muted', 'Halvány szöveg'], ['link', 'Link'],
]

let documentState = createDefaultEmailDocument()
let selectedId = documentState.blocks[0].id
let sourceHtml = ''
let customCode = false
let initialized = false
let saveTimer = null

function selectedBlock() {
  return documentState.blocks.find((block) => block.id === selectedId) || null
}

function cleanFilename(value, extension) {
  const base = String(value || 'hirlevel').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'hirlevel'
  return base + extension
}

function download(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = create('a', { href: url, download: filename })
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function sanitizePreview(html) {
  const parsed = new DOMParser().parseFromString(String(html), 'text/html')
  parsed.querySelectorAll('script,iframe,object,embed,form,base').forEach((node) => node.remove())
  parsed.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name)
      if (['href', 'src'].includes(attribute.name.toLowerCase()) && /^\s*javascript:/i.test(attribute.value)) node.removeAttribute(attribute.name)
    }
  })
  return '<!doctype html>\n' + parsed.documentElement.outerHTML
}

function previewHtml() {
  let html = sanitizePreview(sourceHtml)
  if (el('#email-images-toggle').classList.contains('is-active')) {
    html = html.replace('</head>', '<style>img{visibility:hidden!important}</style></head>')
  }
  return html
}

function qualityLabel(score) {
  if (score >= 90) return 'Kiváló'
  if (score >= 75) return 'Jó'
  if (score >= 55) return 'Javítandó'
  return 'Kockázatos'
}

function renderQuality() {
  const report = analyzeEmailHtml(sourceHtml, { plainText: emailToPlainText(documentState), brand: documentState.brand })
  const score = el('#email-quality-score')
  score.textContent = report.score
  score.dataset.level = report.score >= 90 ? 'good' : report.score >= 75 ? 'ok' : 'bad'
  el('#email-quality-label').textContent = qualityLabel(report.score)
  el('#email-quality-meta').textContent = report.blockers + ' hiba · ' + report.warnings + ' figyelmeztetés · ' + Math.ceil(report.bytes / 1024) + ' KB'
  const host = el('#email-quality-list')
  host.replaceChildren()
  if (!report.issues.length) {
    host.append(create('p', { class: 'email-studio__quality-empty', textContent: 'Minden automatikus ellenőrzés rendben.' }))
  } else {
    for (const item of report.issues) {
      host.append(create('article', { class: 'email-studio__issue email-studio__issue--' + item.severity }, [
        create('strong', { textContent: item.title }),
        create('span', { textContent: item.category + ' · ' + item.detail }),
      ]))
    }
  }
  el('#email-export-html').disabled = report.blockers > 0
  el('#email-export-html').title = report.blockers ? 'A HTML export előtt javítsd a piros hibákat.' : 'E-mail HTML letöltése'
  return report
}

function renderPreview() {
  el('#email-preview-frame').srcdoc = previewHtml()
  renderQuality()
}

function scheduleSave() {
  clearTimeout(saveTimer)
  el('#email-save-status').textContent = 'Mentés…'
  saveTimer = setTimeout(async () => {
    try {
      await saveLocalProject({
        id: STORAGE_ID, module: 'E-mail Stúdió', name: documentState.name,
        data: documentState, sourceHtml, customCode,
      })
      el('#email-save-status').textContent = 'Mentve'
    } catch (error) {
      console.error(error)
      el('#email-save-status').textContent = 'A mentés sikertelen'
    }
  }, 450)
}

function updateFromVisual() {
  customCode = false
  sourceHtml = compileEmail(documentState)
  el('#email-code-editor').value = sourceHtml
  renderPreview()
  scheduleSave()
}

function field(label, key, value, { type = 'text', rows = 0, options = null } = {}) {
  const control = options ? create('select') : rows ? create('textarea', { rows }) : create('input', { type })
  if (options) for (const option of options) control.append(create('option', { value: option[0], textContent: option[1] }))
  control.value = value ?? ''
  control.addEventListener('input', () => {
    const block = selectedBlock()
    if (!block) return
    block[key] = key === 'level' ? Number(control.value) : control.value
    renderBlockList()
    updateFromVisual()
  })
  return create('label', {}, [label, control])
}

function renderBlockFields() {
  const host = el('#email-block-fields')
  host.replaceChildren()
  const block = selectedBlock()
  if (!block) {
    host.append(create('p', { textContent: 'Válassz egy elemet a bal oldali listából.' }))
    return
  }
  if (['heading', 'text'].includes(block.type)) host.append(field('Szöveg', 'text', block.text, { rows: 4 }))
  if (block.type === 'heading') host.append(field('Címsor szintje', 'level', block.level, { options: [['1', 'Főcím'], ['2', 'Alcím']] }))
  if (block.type === 'image') {
    host.append(field('Kép teljes HTTPS címe', 'src', block.src))
    host.append(field('Képleírás (alt)', 'alt', block.alt))
    host.append(field('Kattintási link', 'href', block.href))
  }
  if (block.type === 'button') {
    host.append(field('Gomb felirata', 'text', block.text))
    host.append(field('Céloldal teljes címe', 'href', block.href))
  }
  if (block.type === 'social') host.append(field('Bevezető felirat', 'title', block.title))
  if (block.type === 'footer') {
    host.append(field('Cégnév', 'company', block.company))
    host.append(field('Cím', 'address', block.address))
    host.append(field('Leiratkozási URL vagy változó', 'unsubscribe', block.unsubscribe))
  }
  if (['heading', 'text', 'button', 'social'].includes(block.type)) {
    host.append(field('Igazítás', 'align', block.align, { options: [['left', 'Balra'], ['center', 'Középre'], ['right', 'Jobbra']] }))
  }
}

function renderBlockList() {
  const host = el('#email-block-list')
  host.replaceChildren()
  documentState.blocks.forEach((block, index) => {
    const select = create('button', {
      type: 'button',
      class: 'email-studio__block-select' + (block.id === selectedId ? ' is-selected' : ''),
      textContent: (index + 1) + '. ' + (BLOCK_LABELS[block.type] || block.type),
    })
    select.addEventListener('click', () => {
      selectedId = block.id
      renderBlockList()
      renderBlockFields()
    })
    const up = create('button', { type: 'button', title: 'Feljebb', textContent: '↑', disabled: index === 0 })
    const down = create('button', { type: 'button', title: 'Lejjebb', textContent: '↓', disabled: index === documentState.blocks.length - 1 })
    const remove = create('button', { type: 'button', title: 'Törlés', textContent: '×' })
    up.addEventListener('click', () => moveBlock(index, -1))
    down.addEventListener('click', () => moveBlock(index, 1))
    remove.addEventListener('click', () => {
      documentState.blocks.splice(index, 1)
      selectedId = documentState.blocks[Math.min(index, documentState.blocks.length - 1)]?.id || null
      renderBlockList()
      renderBlockFields()
      updateFromVisual()
    })
    host.append(create('div', { class: 'email-studio__block-row' }, [select, up, down, remove]))
  })
}

function moveBlock(index, offset) {
  const target = index + offset
  if (target < 0 || target >= documentState.blocks.length) return
  const [block] = documentState.blocks.splice(index, 1)
  documentState.blocks.splice(target, 0, block)
  renderBlockList()
  updateFromVisual()
}

function renderDocumentFields() {
  el('#email-name').value = documentState.name || ''
  el('#email-subject').value = documentState.subject || ''
  el('#email-preheader').value = documentState.preheader || ''
  el('#email-font').value = documentState.brand.font
  el('#email-width').value = documentState.brand.width
  el('#email-width-output').textContent = documentState.brand.width + ' px'
  for (const input of els('[data-brand-key]')) {
    input.value = documentState.brand[input.dataset.brandKey]
    const text = input.parentElement.querySelector('output')
    if (text) text.textContent = input.value
  }
  for (const input of els('[data-social-key]')) input.value = documentState.socials[input.dataset.socialKey] || ''
}

function renderAll() {
  renderDocumentFields()
  renderBlockList()
  renderBlockFields()
  if (!customCode) sourceHtml = compileEmail(documentState)
  el('#email-code-editor').value = sourceHtml
  renderPreview()
}

function buildStaticFields() {
  const brandHost = el('#email-brand-fields')
  for (const [key, label] of BRAND_FIELDS) {
    const input = create('input', { type: 'color', dataset: { brandKey: key } })
    const output = create('output')
    input.addEventListener('input', () => {
      documentState.brand[key] = input.value
      output.textContent = input.value
      updateFromVisual()
    })
    brandHost.append(create('label', {}, [create('span', { textContent: label }), input, output]))
  }
  const socialHost = el('#email-social-fields')
  for (const network of SOCIAL_NETWORKS) {
    const input = create('input', { type: 'url', placeholder: 'https://…', dataset: { socialKey: network.id } })
    input.addEventListener('input', () => {
      documentState.socials[network.id] = input.value
      updateFromVisual()
    })
    socialHost.append(create('label', {}, [network.label, input]))
  }
}

function bindControls() {
  for (const button of els('[data-email-add]')) {
    button.addEventListener('click', () => {
      const block = createEmailBlock(button.dataset.emailAdd)
      const selectedIndex = documentState.blocks.findIndex((item) => item.id === selectedId)
      documentState.blocks.splice(selectedIndex < 0 ? documentState.blocks.length : selectedIndex + 1, 0, block)
      selectedId = block.id
      renderBlockList()
      renderBlockFields()
      updateFromVisual()
    })
  }
  for (const [id, key] of [['#email-name', 'name'], ['#email-subject', 'subject'], ['#email-preheader', 'preheader']]) {
    el(id).addEventListener('input', (event) => {
      documentState[key] = event.target.value
      updateFromVisual()
    })
  }
  el('#email-font').addEventListener('change', (event) => { documentState.brand.font = event.target.value; updateFromVisual() })
  el('#email-width').addEventListener('input', (event) => {
    documentState.brand.width = Number(event.target.value)
    el('#email-width-output').textContent = event.target.value + ' px'
    updateFromVisual()
  })

  const setMode = (code) => {
    el('#email-code-panel').classList.toggle('hidden', !code)
    el('#email-preview-shell').classList.toggle('hidden', code)
    el('#email-code-mode').classList.toggle('is-active', code)
    el('#email-visual-mode').classList.toggle('is-active', !code)
  }
  el('#email-code-mode').addEventListener('click', () => setMode(true))
  el('#email-visual-mode').addEventListener('click', () => setMode(false))
  el('#email-code-editor').addEventListener('input', (event) => {
    customCode = true
    sourceHtml = event.target.value
    renderPreview()
    scheduleSave()
  })
  el('#email-reset-code').addEventListener('click', () => {
    updateFromVisual()
    notifySuccess('A kódot újrageneráltuk a vizuális tartalomból.')
  })

  const setDevice = (mobile) => {
    el('#email-preview-shell').classList.toggle('is-mobile', mobile)
    el('#email-mobile-preview').classList.toggle('is-active', mobile)
    el('#email-desktop-preview').classList.toggle('is-active', !mobile)
  }
  el('#email-mobile-preview').addEventListener('click', () => setDevice(true))
  el('#email-desktop-preview').addEventListener('click', () => setDevice(false))
  el('#email-images-toggle').addEventListener('click', (event) => {
    event.currentTarget.classList.toggle('is-active')
    event.currentTarget.textContent = event.currentTarget.classList.contains('is-active') ? 'Képek be' : 'Képek ki'
    renderPreview()
  })

  el('#email-export-html').addEventListener('click', () => {
    const report = renderQuality()
    if (report.blockers) return notifyError('Az export előtt javítsd a pirossal jelzett hibákat.')
    download(sourceHtml, 'text/html;charset=utf-8', cleanFilename(documentState.name, '.html'))
    notifySuccess('Az e-mail HTML elkészült.')
  })
  el('#email-export-text').addEventListener('click', () => download(emailToPlainText(documentState), 'text/plain;charset=utf-8', cleanFilename(documentState.name, '.txt')))
  el('#email-export-project').addEventListener('click', () => {
    download(JSON.stringify({ version: 1, document: documentState, sourceHtml, customCode }, null, 2), 'application/json', cleanFilename(documentState.name, '.email.grapes.json'))
  })
  el('#email-import-btn').addEventListener('click', () => el('#email-import-input').click())
  el('#email-import-input').addEventListener('change', async (event) => {
    try {
      const file = event.target.files?.[0]
      if (!file) return
      const data = JSON.parse(await file.text())
      if (!data.document?.blocks || !data.document?.brand) throw new Error('Ez nem E-mail Stúdió projekt.')
      documentState = data.document
      selectedId = documentState.blocks[0]?.id || null
      customCode = Boolean(data.customCode)
      sourceHtml = data.sourceHtml || compileEmail(documentState)
      renderAll()
      scheduleSave()
      notifySuccess('A projekt megnyílt.')
    } catch (error) {
      notifyError(error.message || 'A projektfájl nem nyitható meg.')
    } finally {
      event.target.value = ''
    }
  })
}

export async function initEmailStudio() {
  if (initialized) {
    renderAll()
    return
  }
  initialized = true
  buildStaticFields()
  bindControls()
  try {
    const saved = await loadLocalProject(STORAGE_ID)
    if (saved?.data?.blocks && saved?.data?.brand) {
      documentState = saved.data
      sourceHtml = saved.sourceHtml || compileEmail(documentState)
      customCode = Boolean(saved.customCode)
      selectedId = documentState.blocks[0]?.id || null
    }
  } catch (error) {
    console.warn('Az E-mail Stúdió mentése nem tölthető be:', error)
  }
  renderAll()
}
