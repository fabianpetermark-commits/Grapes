export const EMAIL_PROJECT_VERSION = 1

export const SOCIAL_NETWORKS = [
  { id: 'facebook', label: 'Facebook' }, { id: 'instagram', label: 'Instagram' },
  { id: 'linkedin', label: 'LinkedIn' }, { id: 'youtube', label: 'YouTube' },
  { id: 'tiktok', label: 'TikTok' }, { id: 'x', label: 'X' },
  { id: 'pinterest', label: 'Pinterest' }, { id: 'website', label: 'Weboldal' },
]

const DEFAULT_BRAND = {
  primary: '#6d28d9', secondary: '#4c1d95', accent: '#f59e0b',
  background: '#f3f0ff', surface: '#ffffff', text: '#241b35',
  muted: '#6b6574', link: '#6d28d9',
  font: 'Arial, Helvetica, sans-serif', width: 600,
}

const BLOCK_DEFAULTS = {
  heading: { type: 'heading', text: 'Új fejezet címe', level: 2, align: 'left' },
  text: { type: 'text', text: 'Írd ide a levél következő bekezdését.', align: 'left' },
  image: { type: 'image', src: 'https://placehold.co/1200x630/6d28d9/ffffff.png?text=Kampanykep', alt: 'A kampány fő képe', href: '' },
  button: { type: 'button', text: 'Megnézem', href: 'https://example.com', align: 'center' },
  divider: { type: 'divider' },
  social: { type: 'social', title: 'Kövess minket', align: 'center' },
  footer: { type: 'footer', company: 'Márkanév', address: 'Budapest, Magyarország', unsubscribe: '{{unsubscribe_url}}' },
}

export function createEmailBlock(type) {
  const source = BLOCK_DEFAULTS[type] || BLOCK_DEFAULTS.text
  return { ...source, id: 'email-' + Math.random().toString(36).slice(2, 10) }
}

export function createDefaultEmailDocument() {
  return {
    version: EMAIL_PROJECT_VERSION,
    name: 'Őszi hírlevél',
    subject: 'Újdonságok, amelyeket neked válogattunk',
    preheader: 'Friss hírek, ötletek és egy különleges ajánlat egy helyen.',
    brand: { ...DEFAULT_BRAND },
    socials: {
      facebook: 'https://facebook.com/', instagram: 'https://instagram.com/',
      linkedin: 'https://linkedin.com/', youtube: '', tiktok: '', x: '',
      pinterest: '', website: 'https://example.com',
    },
    blocks: [
      { ...createEmailBlock('heading'), text: 'Szia, örülünk, hogy itt vagy!', level: 1, align: 'center' },
      { ...createEmailBlock('text'), text: 'Ezt a sablont biztonságos, egyszerű e-mail HTML-re építettük, hogy a lehető legtöbb levelezőben szépen jelenjen meg.', align: 'center' },
      createEmailBlock('image'),
      { ...createEmailBlock('heading'), text: 'A hónap legfontosabb híre', level: 2 },
      { ...createEmailBlock('text'), text: 'Röviden és világosan írd le, mit kap az olvasó. A legfontosabb információ kerüljön előre, a gomb szövege pedig mondja el, mi történik kattintás után.' },
      createEmailBlock('button'), createEmailBlock('divider'),
      createEmailBlock('social'), createEmailBlock('footer'),
    ],
  }
}

export function escapeEmailHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function safeHex(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback
}

function safeUrl(value, fallback = '#') {
  const url = String(value || '').trim()
  if (!url) return fallback
  if (/^(\{\{[\w.-]+\}\}|https?:\/\/|mailto:|tel:)/i.test(url)) return escapeEmailHtml(url)
  return fallback
}

function textWithBreaks(value) {
  return escapeEmailHtml(value).replace(/\r?\n/g, '<br>')
}

function blockHtml(block, document) {
  const brand = document.brand
  const align = ['left', 'center', 'right'].includes(block.align) ? block.align : 'left'
  if (block.type === 'heading') {
    const level = Number(block.level) === 1 ? 1 : 2
    const size = level === 1 ? 32 : 24
    return '<tr><td style="padding:12px 32px 8px;text-align:' + align + ';"><h' + level + ' style="margin:0;color:' + brand.text + ';font-family:' + brand.font + ';font-size:' + size + 'px;line-height:1.25;font-weight:700;">' + textWithBreaks(block.text) + '</h' + level + '></td></tr>'
  }
  if (block.type === 'text') return '<tr><td style="padding:8px 32px;text-align:' + align + ';color:' + brand.text + ';font-family:' + brand.font + ';font-size:16px;line-height:1.6;">' + textWithBreaks(block.text) + '</td></tr>'
  if (block.type === 'image') {
    const image = '<img src="' + safeUrl(block.src, '') + '" width="' + brand.width + '" alt="' + escapeEmailHtml(block.alt || '') + '" style="display:block;width:100%;max-width:' + brand.width + 'px;height:auto;border:0;outline:none;text-decoration:none;">'
    const linked = block.href ? '<a href="' + safeUrl(block.href) + '" target="_blank" style="text-decoration:none;">' + image + '</a>' : image
    return '<tr><td style="padding:16px 0;">' + linked + '</td></tr>'
  }
  if (block.type === 'button') return '<tr><td align="' + align + '" style="padding:16px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="' + brand.primary + '" style="border-radius:8px;"><a href="' + safeUrl(block.href) + '" target="_blank" style="display:inline-block;padding:14px 24px;color:#ffffff;font-family:' + brand.font + ';font-size:16px;font-weight:700;line-height:20px;text-decoration:none;border-radius:8px;">' + escapeEmailHtml(block.text) + '</a></td></tr></table></td></tr>'
  if (block.type === 'divider') return '<tr><td style="padding:20px 32px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="height:1px;background:' + brand.background + ';font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td></tr>'
  if (block.type === 'social') {
    const links = SOCIAL_NETWORKS.filter((network) => document.socials?.[network.id]).map((network) => '<td style="padding:0 5px;"><a href="' + safeUrl(document.socials[network.id]) + '" target="_blank"><img src="https://fabianpetermark-commits.github.io/Grapes/email-icons/' + network.id + '.png" width="32" height="32" alt="' + escapeEmailHtml(network.label) + '" style="display:block;border:0;width:32px;height:32px;"></a></td>').join('')
    if (!links) return ''
    return '<tr><td align="' + align + '" style="padding:20px 32px;"><p style="margin:0 0 12px;color:' + brand.muted + ';font-family:' + brand.font + ';font-size:13px;">' + escapeEmailHtml(block.title || '') + '</p><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>' + links + '</tr></table></td></tr>'
  }
  if (block.type === 'footer') return '<tr><td style="padding:24px 32px 32px;text-align:center;background:' + brand.background + ';color:' + brand.muted + ';font-family:' + brand.font + ';font-size:12px;line-height:1.6;"><strong style="color:' + brand.text + ';">' + escapeEmailHtml(block.company || '') + '</strong><br>' + escapeEmailHtml(block.address || '') + '<br><a href="' + safeUrl(block.unsubscribe) + '" style="color:' + brand.link + ';text-decoration:underline;">Leiratkozás</a></td></tr>'
  return ''
}

export function compileEmail(document) {
  const input = document || createDefaultEmailDocument()
  const brand = { ...DEFAULT_BRAND, ...(input.brand || {}) }
  for (const key of ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'muted', 'link']) brand[key] = safeHex(brand[key], DEFAULT_BRAND[key])
  brand.width = Math.min(720, Math.max(480, Number(brand.width) || 600))
  brand.font = String(brand.font || DEFAULT_BRAND.font).replace(/[<>"']/g, '')
  const normalized = { ...input, brand, socials: input.socials || {} }
  const content = (input.blocks || []).map((block) => blockHtml(block, normalized)).join('\n')
  return [
    '<!doctype html>', '<html lang="hu">', '<head>', '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="x-apple-disable-message-reformatting">',
    '<title>' + escapeEmailHtml(input.subject || input.name || 'Hírlevél') + '</title>',
    '<style>@media only screen and (max-width:620px){.email-shell{width:100%!important}.email-pad{padding-left:20px!important;padding-right:20px!important}}@media (prefers-color-scheme:dark){.email-bg{background:#19151f!important}}</style>',
    '</head>', '<body class="email-bg" style="margin:0;padding:0;background:' + brand.background + ';word-spacing:normal;">',
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">' + escapeEmailHtml(input.preheader || '') + '&#847;&zwnj;&nbsp;&#8199;&#65279;</div>',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:' + brand.background + ';"><tr><td align="center" style="padding:24px 12px;">',
    '<!--[if mso]><table role="presentation" width="' + brand.width + '" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->',
    '<table role="presentation" class="email-shell" width="' + brand.width + '" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:' + brand.width + 'px;background:' + brand.surface + ';border-radius:12px;overflow:hidden;">',
    content, '</table>', '<!--[if mso]></td></tr></table><![endif]-->',
    '</td></tr></table>', '</body>', '</html>',
  ].join('\n')
}

export function emailToPlainText(document) {
  const lines = []
  if (document.subject) lines.push(document.subject, '')
  if (document.preheader) lines.push(document.preheader, '')
  for (const block of document.blocks || []) {
    if (['heading', 'text'].includes(block.type)) lines.push(String(block.text || ''), '')
    if (block.type === 'image' && block.alt) lines.push('[Kép: ' + block.alt + ']', block.href || '', '')
    if (block.type === 'button') lines.push((block.text || 'Hivatkozás') + ': ' + (block.href || ''), '')
    if (block.type === 'social') {
      for (const network of SOCIAL_NETWORKS) if (document.socials?.[network.id]) lines.push(network.label + ': ' + document.socials[network.id])
      lines.push('')
    }
    if (block.type === 'footer') lines.push(block.company || '', block.address || '', 'Leiratkozás: ' + (block.unsubscribe || '{{unsubscribe_url}}'))
  }
  return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n').trim()
}
