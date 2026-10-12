const SYNONYMS = new Map([
  ['csirkemell', ['csirke mellfile', 'csirke mell', 'mellfile']],
  ['burgonya', ['krumpli']],
  ['paradicsom', ['paradicsom']],
  ['kenyer', ['kenyerfele', 'pek aru', 'pekaru']],
  ['turo', ['tehenturo']],
  ['joghurt', ['joghurt', 'jogurt']],
])

export function normalizeSearchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('hu-HU').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function searchTokens(value) {
  const normalized = normalizeSearchText(value)
  if (!normalized) return []
  const tokens = new Set(normalized.split(/\s+/))
  for (const [canonical, synonyms] of SYNONYMS) {
    const all = [canonical, ...synonyms].map(normalizeSearchText)
    if (all.some(term => normalized.includes(term))) all.forEach(term => term.split(/\s+/).forEach(token => tokens.add(token)))
  }
  return [...tokens]
}

function searchTokenGroups(value) {
  return normalizeSearchText(value).split(/\s+/).filter(Boolean).map(token => {
    for (const [canonical, synonyms] of SYNONYMS) {
      const alternatives = [canonical, ...synonyms].flatMap(term => normalizeSearchText(term).split(/\s+/))
      if (alternatives.includes(token)) return [...new Set(alternatives)]
    }
    return [token]
  })
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length]
}

export function scoreFood(food, query, { favorite = false, usageCount = 0 } = {}) {
  const phrase = normalizeSearchText(query)
  if (!phrase) return favorite * 40 + Math.min(usageCount, 20)
  const haystack = normalizeSearchText(`${food.name} ${food.category} ${food.barcode || ''}`)
  if (haystack === phrase) return 1000
  let score = haystack.startsWith(phrase) ? 700 : haystack.includes(phrase) ? 500 : 0
  const words = haystack.split(' ')
  for (const alternatives of searchTokenGroups(query)) {
    if (alternatives.some(token => words.includes(token))) score += 100
    else if (alternatives.some(token => words.some(word => word.startsWith(token)))) score += 60
    else if (alternatives.some(token => token.length >= 4 && words.some(word => levenshtein(word, token) <= 1))) score += 35
    else return 0
  }
  return score + (favorite ? 25 : 0) + Math.min(usageCount, 20)
}

export function searchFoods(foods, query, { favorites = [], entries = [], category = '' } = {}) {
  const counts = new Map()
  for (const entry of entries) counts.set(entry.snapshot?.foodId, (counts.get(entry.snapshot?.foodId) || 0) + 1)
  return foods
    .filter(food => !category || food.category === category)
    .map(food => ({ food, score: scoreFood(food, query, { favorite: favorites.includes(food.id), usageCount: counts.get(food.id) || 0 }) }))
    .filter(item => item.score > 0 || !normalizeSearchText(query))
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name, 'hu-HU'))
    .map(item => item.food)
}
