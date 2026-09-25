import grapesjs from 'grapesjs'
import 'grapesjs/dist/css/grapes.min.css'
import grapesJSMJML from 'grapesjs-mjml'
import '../styles/screens/email-studio.css'
import { el, els, create } from '../ui/dom.js'
import { notifyError, notifySuccess } from '../ui/toast.js'
import { loadLocalProject, saveLocalProject } from '../storage/local-project-store.js'
import { SOCIAL_NETWORKS } from './compiler.js'
import { analyzeEmailHtml } from './quality.js'
import {
  EMAIL_MJML_PROJECT_VERSION, applyMetadataToHtml, assertSafeMjml, createEmailMetadata, createTemplateMjml,
  formatMarkup, htmlToPlainText, legacyDocumentToMjml,
} from './mjml.js'

const STORAGE_ID = 'email-studio-current'
const BRAND_FIELDS = [
  ['primary', 'Fő szín'], ['secondary', 'Másodlagos'], ['accent', 'Kiemelés'],
  ['background', 'Háttér'], ['surface', 'Levélfelület'], ['text', 'Szöveg'],
  ['muted', 'Halvány szöveg'], ['link', 'Link'],
]
const BLOCK_LABELS = {
  'mj-1-column': '1 oszlop', 'mj-2-columns': '2 oszlop', 'mj-3-columns': '3 oszlop',
  'mj-section': 'Szekció', 'mj-column': 'Oszlop', 'mj-text': 'Szöveg',
  'mj-image': 'Kép', 'mj-button': 'Gomb', 'mj-divider': 'Elválasztó',
  'mj-spacer': 'Térköz', 'mj-social': 'Social ikonok', 'mj-hero': 'Kiemelt fejléc',
  'mj-navbar': 'Navigáció', 'mj-wrapper': 'Csoport', 'mj-raw': 'Egyedi HTML',
}

let editor = null
let metadata = createEmailMetadata()
let compiledHtml = ''
let compileErrors = []
let initialized = false
let controlsBound = false
let saveTimer = null
let updateTimer = null
let codeKind = 'mjml'
let imagesHidden = false

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

const getMjml = () => editor?.runCommand('mjml-code') || ''

function compileMjml(mjml = getMjml()) {
  const result = editor.runCommand('mjml-code-to-html', { mjml, validationLevel: 'soft' })
  return { html: applyMetadataToHtml(result?.html || '', metadata), errors: result?.errors || [] }
}

function qualityLabel(score) {
  if (score >= 90) return 'Kiváló'
  if (score >= 75) return 'Jó'
  if (score >= 55) return 'Javítandó'
  return 'Kockázatos'
}

function renderQuality() {
  const report = analyzeEmailHtml(compiledHtml, { plainText: htmlToPlainText(compiledHtml, metadata), brand: metadata.brand })
  const score = el('#email-quality-score')
  score.textContent = report.score
  score.dataset.level = report.score >= 90 ? 'good' : report.score >= 75 ? 'ok' : 'bad'
  el('#email-quality-label').textContent = qualityLabel(report.score)
  el('#email-quality-meta').textContent = `${report.blockers} hiba · ${report.warnings} figyelmeztetés · ${Math.ceil(report.bytes / 1024)} KB`
  const host = el('#email-quality-list')
  host.replaceChildren()
  const mjmlIssues = compileErrors.map((error) => ({
    severity: 'error', title: `MJML hiba${error.line ? ` a(z) ${error.line}. sorban` : ''}`,
    category: 'Szerkezet', detail: error.message || String(error),
  }))
  const issues = [...mjmlIssues, ...report.issues]
  if (!issues.length) host.append(create('p', { class: 'email-studio__quality-empty', textContent: 'Minden automatikus ellenőrzés rendben.' }))
  for (const item of issues) {
    host.append(create('article', { class: `email-studio__issue email-studio__issue--${item.severity}` }, [
      create('strong', { textContent: item.title }),
      create('span', { textContent: `${item.category} · ${item.detail}` }),
    ]))
  }
  const blockers = report.blockers + mjmlIssues.length
  el('#email-export-html').disabled = blockers > 0
  el('#email-export-html').title = blockers ? 'Az export előtt javítsd a piros hibákat.' : 'E-mail HTML letöltése'
  return { ...report, blockers }
}

function renderCode() {
  const textarea = el('#email-code-editor')
  if (codeKind === 'mjml') {
    textarea.readOnly = false
    textarea.value = formatMarkup(getMjml())
    el('#email-code-title').textContent = 'MJML forrás'
    el('#email-code-description').textContent = ' A módosítást az Alkalmazás gomb tölti vissza a vizuális szerkesztőbe.'
    el('#email-apply-code').disabled = false
  } else {
    textarea.readOnly = true
    textarea.value = compiledHtml
    el('#email-code-title').textContent = 'Kész e-mail HTML'
    el('#email-code-description').textContent = ' Ezt a kódot kapják meg a levelezőprogramok.'
    el('#email-apply-code').disabled = true
  }
  el('#email-show-mjml').classList.toggle('is-active', codeKind === 'mjml')
  el('#email-show-html').classList.toggle('is-active', codeKind === 'html')
  el('#email-code-errors').textContent = compileErrors.map((error) => error.message || String(error)).join(' · ')
}

function scheduleSave() {
  clearTimeout(saveTimer)
  el('#email-save-status').textContent = 'Mentés…'
  saveTimer = setTimeout(async () => {
    try {
      await saveLocalProject({
        id: STORAGE_ID, module: 'E-mail Stúdió', name: metadata.name,
        data: { engine: 'mjml', version: EMAIL_MJML_PROJECT_VERSION, ...metadata },
        projectData: editor.getProjectData(), mjml: getMjml(), sourceHtml: compiledHtml,
      })
      el('#email-save-status').textContent = 'Mentve'
    } catch (error) {
      console.error(error)
      el('#email-save-status').textContent = 'A mentés sikertelen'
    }
  }, 500)
}

function synchronize({ save = true, updateCode = true } = {}) {
  try {
    const result = compileMjml()
    compiledHtml = result.html
    compileErrors = result.errors
  } catch (error) {
    compileErrors = [{ message: error.message || 'Az MJML nem fordítható le.' }]
  }
  renderQuality()
  if (updateCode && !el('#email-code-panel').classList.contains('hidden')) renderCode()
  if (save) scheduleSave()
}

function scheduleSynchronize() {
  clearTimeout(updateTimer)
  updateTimer = setTimeout(() => synchronize(), 180)
}

function walkComponents(component, callback) {
  callback(component)
  component.components?.().each((child) => walkComponents(child, callback))
}

function hasAncestorClass(component, className) {
  let current = component
  while (current) {
    if (String(current.getAttributes?.()['css-class'] || '').split(/\s+/).includes(className)) return true
    current = current.parent?.()
  }
  return false
}

function applyBrand() {
  if (!editor) return
  editor.UndoManager.stop()
  walkComponents(editor.getWrapper(), (component) => {
    const type = component.get('type')
    if (type === 'mj-body') component.addAttributes({ 'background-color': metadata.brand.background, width: `${metadata.brand.width}px` })
    if (type === 'mj-text') component.addAttributes({
      'font-family': metadata.brand.font,
      color: hasAncestorClass(component, 'brand-footer') ? metadata.brand.muted : metadata.brand.text,
    })
    if (type === 'mj-button') component.addAttributes({ 'font-family': metadata.brand.font, 'background-color': metadata.brand.primary, color: '#ffffff' })
    if (type === 'mj-divider') component.addAttributes({ 'border-color': metadata.brand.background })
    if (type === 'mj-section') {
      const attrs = component.getAttributes()
      component.addAttributes({ 'background-color': String(attrs['css-class'] || '').includes('brand-footer') ? metadata.brand.background : metadata.brand.surface })
    }
  })
  editor.UndoManager.start()
  scheduleSynchronize()
}

function applySocialLinks() {
  if (!editor) return
  walkComponents(editor.getWrapper(), (component) => {
    if (component.get('type') !== 'mj-social-element') return
    const attrs = component.getAttributes()
    const name = attrs.name === 'twitter' ? 'x' : attrs.name === 'web' ? 'website' : attrs.name
    if (metadata.socials[name]) component.addAttributes({ href: metadata.socials[name] })
  })
  scheduleSynchronize()
}

function renderMetadata() {
  el('#email-name').value = metadata.name || ''
  el('#email-subject').value = metadata.subject || ''
  el('#email-preheader').value = metadata.preheader || ''
  el('#email-font').value = metadata.brand.font
  el('#email-width').value = metadata.brand.width
  el('#email-width-output').textContent = `${metadata.brand.width} px`
  for (const input of els('[data-brand-key]')) {
    input.value = metadata.brand[input.dataset.brandKey]
    input.parentElement.querySelector('output').textContent = input.value
  }
  for (const input of els('[data-social-key]')) input.value = metadata.socials[input.dataset.socialKey] || ''
}

function buildStaticFields() {
  const brandHost = el('#email-brand-fields')
  brandHost.replaceChildren()
  for (const [key, label] of BRAND_FIELDS) {
    const input = create('input', { type: 'color', dataset: { brandKey: key } })
    const output = create('output')
    input.addEventListener('input', () => { metadata.brand[key] = input.value; output.textContent = input.value; applyBrand() })
    brandHost.append(create('label', {}, [create('span', { textContent: label }), input, output]))
  }
  const socialHost = el('#email-social-fields')
  socialHost.replaceChildren()
  for (const network of SOCIAL_NETWORKS) {
    const input = create('input', { type: 'url', placeholder: 'https://…', dataset: { socialKey: network.id } })
    input.addEventListener('change', () => { metadata.socials[network.id] = input.value; applySocialLinks() })
    socialHost.append(create('label', {}, [network.label, input]))
  }
}

function setMode(code) {
  el('#email-code-panel').classList.toggle('hidden', !code)
  el('#email-preview-shell').classList.toggle('hidden', code)
  el('#email-code-mode').classList.toggle('is-active', code)
  el('#email-visual-mode').classList.toggle('is-active', !code)
  if (code) renderCode()
  else setTimeout(() => editor.refresh(), 0)
}

function setCodeKind(kind) { codeKind = kind; renderCode() }

function setDevice(mobile) {
  const devices = editor.Devices.getAll()
  const target = devices.find((device) => mobile
    ? /mobile|mobil/i.test(`${device.get('id')} ${device.get('name')}`)
    : /desktop|asztali/i.test(`${device.get('id')} ${device.get('name')}`)) || devices[mobile ? devices.length - 1 : 0]
  if (target) editor.setDevice(target.get('id'))
  el('#email-preview-shell').classList.toggle('is-mobile', mobile)
  el('#email-mobile-preview').classList.toggle('is-active', mobile)
  el('#email-desktop-preview').classList.toggle('is-active', !mobile)
}

function setImagesHidden(hidden) {
  imagesHidden = hidden
  const doc = editor.Canvas.getDocument()
  doc?.getElementById('grapes-email-image-preview')?.remove()
  if (hidden && doc?.head) {
    const style = doc.createElement('style')
    style.id = 'grapes-email-image-preview'
    style.textContent = 'img{visibility:hidden!important}'
    doc.head.append(style)
  }
  el('#email-images-toggle').classList.toggle('is-active', hidden)
  el('#email-images-toggle').textContent = hidden ? 'Képek be' : 'Képek ki'
}

function bindControls() {
  if (controlsBound) return
  controlsBound = true
  el('#email-visual-mode').addEventListener('click', () => setMode(false))
  el('#email-code-mode').addEventListener('click', () => setMode(true))
  el('#email-show-mjml').addEventListener('click', () => setCodeKind('mjml'))
  el('#email-show-html').addEventListener('click', () => setCodeKind('html'))
  el('#email-apply-code').addEventListener('click', () => {
    try {
      const mjml = assertSafeMjml(el('#email-code-editor').value)
      const result = compileMjml(mjml)
      if (result.errors.length) throw new Error(result.errors.map((error) => error.message).join(' · '))
      editor.setComponents(mjml)
      synchronize()
      notifySuccess('Az MJML forrást alkalmaztuk.')
    } catch (error) {
      el('#email-code-errors').textContent = error.message
      notifyError(error.message || 'Az MJML forrás nem alkalmazható.')
    }
  })
  el('#email-undo').addEventListener('click', () => editor.UndoManager.undo())
  el('#email-redo').addEventListener('click', () => editor.UndoManager.redo())
  el('#email-desktop-preview').addEventListener('click', () => setDevice(false))
  el('#email-mobile-preview').addEventListener('click', () => setDevice(true))
  el('#email-images-toggle').addEventListener('click', () => setImagesHidden(!imagesHidden))
  for (const button of els('[data-email-template]')) {
    button.addEventListener('click', () => {
      editor.setComponents(createTemplateMjml(button.dataset.emailTemplate, metadata))
      applyBrand()
      applySocialLinks()
      synchronize()
      notifySuccess('A sablont betöltöttük. A visszavonással visszatérhetsz az előző állapothoz.')
    })
  }
  for (const [id, key] of [['#email-name', 'name'], ['#email-subject', 'subject'], ['#email-preheader', 'preheader']]) {
    el(id).addEventListener('input', (event) => {
      metadata[key] = event.target.value
      if (key === 'name') scheduleSave()
      else synchronize()
    })
  }
  el('#email-font').addEventListener('change', (event) => { metadata.brand.font = event.target.value; applyBrand() })
  el('#email-width').addEventListener('input', (event) => {
    metadata.brand.width = Number(event.target.value)
    el('#email-width-output').textContent = `${event.target.value} px`
    applyBrand()
  })
  el('#email-export-html').addEventListener('click', () => {
    const report = renderQuality()
    if (report.blockers) return notifyError('Az export előtt javítsd a pirossal jelzett hibákat.')
    download(compiledHtml, 'text/html;charset=utf-8', cleanFilename(metadata.name, '.html'))
    notifySuccess('Az e-mail HTML elkészült.')
  })
  el('#email-export-text').addEventListener('click', () => download(htmlToPlainText(compiledHtml, metadata), 'text/plain;charset=utf-8', cleanFilename(metadata.name, '.txt')))
  el('#email-export-project').addEventListener('click', () => {
    download(JSON.stringify({
      version: EMAIL_MJML_PROJECT_VERSION, engine: 'mjml', metadata,
      projectData: editor.getProjectData(), mjml: getMjml(),
    }, null, 2), 'application/json', cleanFilename(metadata.name, '.email.grapes.json'))
  })
  el('#email-import-btn').addEventListener('click', () => el('#email-import-input').click())
  el('#email-import-input').addEventListener('change', async (event) => {
    try {
      const file = event.target.files?.[0]
      if (!file) return
      const project = JSON.parse(await file.text())
      if (project.engine === 'mjml' && (project.mjml || project.projectData)) {
        metadata = createEmailMetadata(project.metadata || project)
        if (project.projectData) editor.loadProjectData(project.projectData)
        else editor.setComponents(assertSafeMjml(project.mjml))
      } else if (project.document?.blocks) {
        metadata = createEmailMetadata(project.document)
        editor.setComponents(legacyDocumentToMjml(project.document))
      } else throw new Error('Ez nem támogatott E-mail Stúdió projekt.')
      renderMetadata()
      synchronize()
      notifySuccess('A projekt megnyílt.')
    } catch (error) {
      notifyError(error.message || 'A projektfájl nem nyitható meg.')
    } finally {
      event.target.value = ''
    }
  })
}

function localizeBlocks() {
  editor.Blocks.getAll().forEach((block) => {
    const current = String(block.get('label') || '')
    const label = BLOCK_LABELS[block.get('id')] || {
      'Group Social': 'Social ikonok', 'Social Element': 'Social link', 'Navbar Link': 'Navigációs link',
    }[current]
    if (label) block.set('label', label)
  })
}

function createEditor(initialMjml) {
  editor = grapesjs.init({
    container: '#email-mjml-editor', height: '100%', width: 'auto', fromElement: false,
    components: initialMjml, storageManager: false, panels: { defaults: [] },
    blockManager: { appendTo: '#email-mjml-blocks' },
    layerManager: { appendTo: '#email-mjml-layers' },
    traitManager: { appendTo: '#email-mjml-traits' },
    styleManager: { appendTo: '#email-mjml-styles' },
    assetManager: { assets: [], upload: false },
    plugins: [grapesJSMJML],
    pluginsOpts: { [grapesJSMJML]: {
      overwriteExport: false,
      imagePlaceholderSrc: 'https://placehold.co/1200x630/6d28d9/ffffff.png?text=Kampanykep',
      columnsPadding: '10px 4px',
    } },
  })
  localizeBlocks()
  editor.on('update', scheduleSynchronize)
  editor.on('load', () => { setImagesHidden(imagesHidden); editor.refresh() })
}

export async function initEmailStudio() {
  if (initialized) {
    editor?.refresh()
    synchronize({ save: false })
    return
  }
  initialized = true
  buildStaticFields()
  let initialMjml = createTemplateMjml('newsletter', metadata)
  let savedProjectData = null
  try {
    const saved = await loadLocalProject(STORAGE_ID)
    if (saved?.data?.engine === 'mjml') {
      metadata = createEmailMetadata(saved.data)
      initialMjml = saved.mjml || initialMjml
      savedProjectData = saved.projectData || null
    } else if (saved?.data?.blocks) {
      metadata = createEmailMetadata(saved.data)
      initialMjml = legacyDocumentToMjml(saved.data)
    }
  } catch (error) {
    console.warn('Az E-mail Stúdió mentése nem tölthető be:', error)
  }
  createEditor(initialMjml)
  if (savedProjectData) editor.loadProjectData(savedProjectData)
  bindControls()
  renderMetadata()
  applyBrand()
  applySocialLinks()
  synchronize({ save: false })
}
