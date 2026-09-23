function issue(severity, category, title, detail) {
  return { severity, category, title, detail }
}

export function contrastRatio(first, second) {
  const luminance = (hex) => {
    const rgb = String(hex).replace('#', '').match(/.{2}/g)?.map((part) => parseInt(part, 16) / 255) || [0, 0, 0]
    const channels = rgb.map((value) => value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4))
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  }
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export function analyzeEmailHtml(html, { plainText = '', brand = null } = {}) {
  const source = String(html || '')
  const issues = []
  const add = (severity, category, title, detail) => issues.push(issue(severity, category, title, detail))

  if (!/<!doctype html>/i.test(source)) add('warning', 'Szerkezet', 'Hiányzó doctype', 'Néhány kliens furcsamódot választhat nélküle.')
  if (!/<meta[^>]+name=["']viewport["']/i.test(source)) add('error', 'Mobil', 'Nincs mobil viewport', 'Mobilon hibás szélességet okozhat.')
  if (!/@media/i.test(source)) add('warning', 'Mobil', 'Nincs mobil szabály', 'A kisebb kijelzőkhöz érdemes médiafeltételt használni.')
  if (!/role=["']presentation["']/i.test(source)) add('warning', 'Szerkezet', 'A táblázatok szerepe hiányzik', 'A képernyőolvasók tartalmi táblázatként értelmezhetik őket.')
  if (!/display\s*:\s*none[^>]+max-height\s*:\s*0/i.test(source)) add('warning', 'Tartalom', 'Nincs rejtett előnézeti sor', 'A postaláda lista nézetében nem lesz irányított előnézet.')

  if (/<(?:script|iframe|object|embed|form)\b/i.test(source)) add('error', 'Biztonság', 'Tiltott HTML-elem', 'A script, iframe, object, embed és form elemeket a levelezők blokkolják.')
  if (/\son[a-z]+\s*=/i.test(source)) add('error', 'Biztonság', 'Eseménykezelő található a kódban', 'Az onclick és hasonló attribútumok nem használhatók e-mailben.')
  if (/(?:href|src)\s*=\s*["']\s*javascript:/i.test(source)) add('error', 'Biztonság', 'Veszélyes hivatkozás', 'A javascript: URL eltávolítandó.')
  if (/\b(display\s*:\s*(?:grid|flex)|position\s*:\s*(?:fixed|sticky))/i.test(source)) add('warning', 'Kompatibilitás', 'Korlátozott CSS', 'A grid, flex vagy rögzített pozíció több levelezőben nem megbízható.')
  if (/<link\b[^>]+rel=["']stylesheet/i.test(source)) add('warning', 'Kompatibilitás', 'Külső stíluslap', 'Sok kliens nem tölti be a külső CSS-t.')

  const images = [...source.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0])
  if (images.some((tag) => !/\balt\s*=/i.test(tag))) add('error', 'Akadálymentesség', 'Kép alternatív szöveg nélkül', 'Minden kép kapjon alt attribútumot.')
  if (images.some((tag) => !/\bwidth\s*=/i.test(tag))) add('warning', 'Kompatibilitás', 'Kép szélesség nélkül', 'A width attribútum stabilabb levelezős megjelenést ad.')
  if (images.some((tag) => /\bsrc=["']http:\/\//i.test(tag))) add('warning', 'Biztonság', 'Nem titkosított kép', 'A képeket HTTPS-ről töltsd be.')

  const relativeLinks = [...source.matchAll(/\b(?:href|src)=["']([^"'#{}][^"']*)["']/gi)]
    .filter((match) => !/^(?:https?:\/\/|mailto:|tel:|data:)/i.test(match[1]))
  if (relativeLinks.length) add('error', 'Hivatkozások', 'Relatív URL található', 'Az e-mailben minden cím legyen teljes HTTPS URL.')
  if (!plainText.trim()) add('warning', 'Tartalom', 'Hiányzik a szöveges változat', 'A kiküldőrendszerbe a TXT változatot is add át.')

  if (brand) {
    if (contrastRatio(brand.text, brand.surface) < 4.5) add('error', 'Akadálymentesség', 'Gyenge szövegkontraszt', 'A normál szöveghez legalább 4,5:1 kontraszt ajánlott.')
    if (contrastRatio('#ffffff', brand.primary) < 4.5) add('warning', 'Akadálymentesség', 'Gyenge gombkontraszt', 'A fehér gombfelirat és a fő brand szín kontrasztja legyen legalább 4,5:1.')
  }

  const bytes = typeof TextEncoder === 'undefined' ? source.length : new TextEncoder().encode(source).length
  if (bytes > 102 * 1024) add('error', 'Méret', 'A Gmail levághatja a levelet', 'A HTML mérete meghaladja a 102 KB-ot.')
  else if (bytes > 80 * 1024) add('warning', 'Méret', 'A HTML közelít a Gmail határához', 'Tartsd 102 KB alatt, lehetőleg 80 KB közelében.')

  const penalties = { error: 18, warning: 6, info: 2 }
  const score = Math.max(0, 100 - issues.reduce((sum, item) => sum + penalties[item.severity], 0))
  const categoryScores = {}
  for (const item of issues) categoryScores[item.category] = Math.max(0, (categoryScores[item.category] ?? 100) - penalties[item.severity])
  return {
    score, issues, categoryScores, bytes,
    blockers: issues.filter((item) => item.severity === 'error').length,
    warnings: issues.filter((item) => item.severity === 'warning').length,
  }
}
