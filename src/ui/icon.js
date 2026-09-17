// Ikonok. A gombok korábban emoji-feliratokkal dolgoztak (▭ ◯ ╱ ➤ ★ 💾 📂
// 🗑️ ⛓ …), amiket minden platform máshogy rajzol ki, méretük és
// vonalvastagságuk nem hangolható, és képernyőolvasónak szöveges tartalomként
// jelennek meg. A sprite az index.html-be van ágyazva, így nincs külön
// hálózati kérés és nem függ a Vite `base` beállításától sem.

/**
 * @param {string} name a sprite szimbólumának neve az `i-` előtag nélkül
 * @returns {SVGSVGElement}
 */
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'icon')
  svg.setAttribute('viewBox', '0 0 24 24')
  // Az ikon mindig dekoratív: a nevet a gomb aria-labelje adja.
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')

  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', `#i-${name}`)
  svg.append(use)
  return svg
}
