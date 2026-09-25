import { SOCIAL_NETWORKS, createDefaultEmailDocument, escapeEmailHtml } from './compiler.js'

export const EMAIL_MJML_PROJECT_VERSION = 2

const safeHex = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback
const safeAlign = (value) => ['left', 'center', 'right'].includes(value) ? value : 'left'
const safeUrl = (value, fallback = '#') => {
  const url = String(value || '').trim()
  if (!url) return fallback
  return /^(\{\{[\w.-]+\}\}|https?:\/\/|mailto:|tel:)/i.test(url) ? escapeEmailHtml(url) : fallback
}
const textWithBreaks = (value) => escapeEmailHtml(value).replace(/\r?\n/g, '<br>')

export function createEmailMetadata(document = createDefaultEmailDocument()) {
  return {
    name: document.name || 'Új hírlevél',
    subject: document.subject || '',
    preheader: document.preheader || '',
    brand: { ...createDefaultEmailDocument().brand, ...(document.brand || {}) },
    socials: { ...createDefaultEmailDocument().socials, ...(document.socials || {}) },
  }
}

function normalizeMetadata(metadata = {}) {
  const result = createEmailMetadata(metadata)
  const defaults = createDefaultEmailDocument().brand
  for (const key of ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'muted', 'link']) {
    result.brand[key] = safeHex(result.brand[key], defaults[key])
  }
  result.brand.width = Math.min(720, Math.max(480, Number(result.brand.width) || 600))
  result.brand.font = String(result.brand.font || defaults.font).replace(/[<>"']/g, '')
  return result
}

function socialElements(metadata) {
  return SOCIAL_NETWORKS
    .filter((network) => metadata.socials?.[network.id])
    .map((network) => {
      const name = network.id === 'x' ? 'twitter' : network.id === 'website' ? 'web' : network.id
      return `<mj-social-element name="${name}" href="${safeUrl(metadata.socials[network.id])}" alt="${escapeEmailHtml(network.label)}">${escapeEmailHtml(network.label)}</mj-social-element>`
    }).join('\n')
}

function shell(metadata, content) {
  const { brand } = metadata
  return `<mjml>
  <mj-body background-color="${brand.background}" width="${brand.width}px">
    ${content.trim()}
  </mj-body>
</mjml>`
}

const footer = (metadata) => `<mj-section css-class="brand-footer" background-color="${metadata.brand.background}" padding="24px 12px">
  <mj-column>
    <mj-text align="center" color="${metadata.brand.muted}" font-size="12px">
      <strong style="color:${metadata.brand.text}">Márkanév</strong><br>Budapest, Magyarország<br>
      <a style="color:${metadata.brand.link}" href="{{unsubscribe_url}}">Leiratkozás</a>
    </mj-text>
  </mj-column>
</mj-section>`

export function createTemplateMjml(kind = 'newsletter', inputMetadata) {
  const metadata = normalizeMetadata(inputMetadata)
  const { brand } = metadata
  if (kind === 'promotion') {
    return shell(metadata, `<mj-section css-class="brand-card" background-color="${brand.surface}" padding="0">
      <mj-column>
        <mj-image src="https://placehold.co/1200x630/6d28d9/ffffff.png?text=Kiemelt+ajanlat" alt="A kiemelt ajánlat képe" padding="0"></mj-image>
        <mj-text align="center" font-size="32px" font-weight="700" padding-top="28px">Különleges ajánlat</mj-text>
        <mj-text align="center">Mutasd meg röviden, mitől értékes az ajánlat, és miért érdemes most cselekedni.</mj-text>
        <mj-button href="https://example.com" align="center">Megnézem az ajánlatot</mj-button>
        <mj-spacer height="16px"></mj-spacer>
      </mj-column>
    </mj-section>
    ${footer(metadata)}`)
  }
  if (kind === 'announcement') {
    return shell(metadata, `<mj-section css-class="brand-card" background-color="${brand.surface}" padding="40px 24px">
      <mj-column>
        <mj-text align="center" color="${brand.primary}" font-size="14px" font-weight="700" text-transform="uppercase">Fontos bejelentés</mj-text>
        <mj-text align="center" font-size="34px" font-weight="700">Valami új érkezik</mj-text>
        <mj-text align="center">Egyetlen világos üzenet, rövid magyarázat és egy jól látható következő lépés.</mj-text>
        <mj-button href="https://example.com" align="center">Részletek</mj-button>
      </mj-column>
    </mj-section>
    ${footer(metadata)}`)
  }
  return shell(metadata, `<mj-section css-class="brand-card" background-color="${brand.surface}" padding="32px 0 8px">
    <mj-column>
      <mj-text align="center" font-size="32px" font-weight="700">A hónap legfontosabb híre</mj-text>
      <mj-text align="center">Röviden és világosan írd le, mit kap az olvasó. A legfontosabb információ kerüljön előre.</mj-text>
      <mj-button href="https://example.com" align="center">Megnézem</mj-button>
    </mj-column>
  </mj-section>
  <mj-section css-class="brand-card" background-color="${brand.surface}" padding="8px 16px 24px">
    <mj-column width="50%"><mj-text font-size="22px" font-weight="700">Első téma</mj-text><mj-text>Rövid összefoglaló vagy hírblokk.</mj-text></mj-column>
    <mj-column width="50%"><mj-text font-size="22px" font-weight="700">Második téma</mj-text><mj-text>Egy másik fontos tartalmi blokk.</mj-text></mj-column>
  </mj-section>
  <mj-section css-class="brand-card" background-color="${brand.surface}" padding="12px 24px 28px">
    <mj-column>
      <mj-divider border-color="${brand.background}"></mj-divider>
      <mj-social align="center" icon-size="32px" mode="horizontal">${socialElements(metadata)}</mj-social>
    </mj-column>
  </mj-section>
  ${footer(metadata)}`)
}

function legacyBlockToMjml(block, metadata) {
  const align = safeAlign(block.align)
  if (block.type === 'heading') {
    const size = Number(block.level) === 1 ? 32 : 24
    return `<mj-section css-class="brand-card" background-color="${metadata.brand.surface}" padding="0"><mj-column><mj-text align="${align}" font-size="${size}px" font-weight="700">${textWithBreaks(block.text)}</mj-text></mj-column></mj-section>`
  }
  if (block.type === 'text') return `<mj-section css-class="brand-card" background-color="${metadata.brand.surface}" padding="0"><mj-column><mj-text align="${align}">${textWithBreaks(block.text)}</mj-text></mj-column></mj-section>`
  if (block.type === 'image') return `<mj-section css-class="brand-card" background-color="${metadata.brand.surface}" padding="0"><mj-column><mj-image src="${safeUrl(block.src, '')}" alt="${escapeEmailHtml(block.alt || '')}" href="${safeUrl(block.href, '')}" padding="16px 0"></mj-image></mj-column></mj-section>`
  if (block.type === 'button') return `<mj-section css-class="brand-card" background-color="${metadata.brand.surface}" padding="0"><mj-column><mj-button href="${safeUrl(block.href)}" align="${align}">${escapeEmailHtml(block.text)}</mj-button></mj-column></mj-section>`
  if (block.type === 'divider') return `<mj-section css-class="brand-card" background-color="${metadata.brand.surface}" padding="0"><mj-column><mj-divider border-color="${metadata.brand.background}"></mj-divider></mj-column></mj-section>`
  if (block.type === 'social') return `<mj-section css-class="brand-card" background-color="${metadata.brand.surface}" padding="8px"><mj-column><mj-text align="${align}" color="${metadata.brand.muted}" font-size="13px">${escapeEmailHtml(block.title || '')}</mj-text><mj-social align="${align}" icon-size="32px">${socialElements(metadata)}</mj-social></mj-column></mj-section>`
  if (block.type === 'footer') return `<mj-section css-class="brand-footer" background-color="${metadata.brand.background}" padding="24px 12px"><mj-column><mj-text align="center" color="${metadata.brand.muted}" font-size="12px"><strong style="color:${metadata.brand.text}">${escapeEmailHtml(block.company || '')}</strong><br>${textWithBreaks(block.address || '')}<br><a style="color:${metadata.brand.link}" href="${safeUrl(block.unsubscribe)}">Leiratkozás</a></mj-text></mj-column></mj-section>`
  return ''
}

export function legacyDocumentToMjml(document) {
  const metadata = normalizeMetadata(document)
  return shell(metadata, (document.blocks || []).map((block) => legacyBlockToMjml(block, metadata)).join('\n'))
}

export function assertSafeMjml(value) {
  const source = String(value || '')
  if (!/<mjml[\s>]/i.test(source) || !/<mj-body[\s>]/i.test(source)) throw new Error('A forrásból hiányzik az mjml vagy az mj-body elem.')
  if (/<\/?(?:script|iframe|object|embed|form|base)(?:\s|>)/i.test(source)) throw new Error('A forrás nem biztonságos HTML-elemet tartalmaz.')
  if (/javascript\s*:/i.test(source)) throw new Error('A forrás nem biztonságos hivatkozást tartalmaz.')
  return source
}

export function formatMarkup(value) {
  const lines = String(value || '').replace(/>\s*</g, '>\n<').split('\n')
  let depth = 0
  return lines.map((line) => {
    const trimmed = line.trim()
    if (/^<\//.test(trimmed)) depth = Math.max(0, depth - 1)
    const result = `${'  '.repeat(depth)}${trimmed}`
    const opens = /^<[^!?/][^>]*>$/.test(trimmed)
      && !/\/$/.test(trimmed.slice(0, -1))
      && !/^<(?:br|hr|img|meta|link|input)\b/i.test(trimmed)
      && !/<\/[^>]+>$/.test(trimmed)
    if (opens) depth += 1
    return result
  }).join('\n')
}

export function applyMetadataToHtml(html, metadata = {}) {
  const title = escapeEmailHtml(metadata.subject || metadata.name || 'Hírlevél')
  const preheader = escapeEmailHtml(metadata.preheader || '')
  let output = String(html || '')
  if (/<title>[\s\S]*?<\/title>/i.test(output)) output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
  else output = output.replace(/<\/head>/i, `<title>${title}</title></head>`)
  if (preheader) {
    const hidden = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}&#847;&zwnj;&nbsp;&#8199;&#65279;</div>`
    output = output.replace(/<body([^>]*)>/i, `<body$1>${hidden}`)
  }
  return output
}

export function htmlToPlainText(html, metadata = {}) {
  const body = String(html || '').replace(/<head[\s\S]*?<\/head>/gi, '')
  const withLinks = body.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
  const text = withLinks.replace(/<(?:br|\/p|\/div|\/h[1-6]|\/td|\/tr|\/li|\/section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return [metadata.subject, metadata.preheader, text].filter(Boolean).join('\n\n')
}
