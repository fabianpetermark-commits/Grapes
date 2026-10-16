// Pure Hungarian-first food search. No network access, no UI coupling.
// The stable record identity (fdcId) is never inferred from translated names.
export const normalizeFoodSearchText = value => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('hu-HU').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')

const words = value => normalizeFoodSearchText(value).split(' ').filter(Boolean)
const matchesPrefix = (candidate, query) => words(query).every(term =>
  words(candidate).some(word => word.startsWith(term)))
const score = (value, query, alias = false) => {
  const name = normalizeFoodSearchText(value)
  const needle = normalizeFoodSearchText(query)
  if (!name || !needle) return -1
  if (name === needle) return alias ? 90 : 100
  if (name.startsWith(needle + ' ')) return alias ? 75 : 85
  if (matchesPrefix(value, query)) return alias ? 55 : 65
  return -1
}

export function searchHungarianFoods(query, foods, { limit = 20 } = {}) {
  const needle = normalizeFoodSearchText(query)
  if (needle.length < 2 || needle.length > 120) return []
  return foods.map((food, index) => {
    const names = [food.nameHu || food.name, ...(food.aliasesHu || food.aliases || [])]
    const relevance = Math.max(...names.map((name, i) => score(name, needle, i > 0)))
    return { food, relevance, index }
  }).filter(item => item.relevance >= 0)
    .sort((a, b) => b.relevance - a.relevance || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(item => item.food)
}

// Only curated mappings may translate queries into USDA API terms.
// No speculative translation or automatic substitution of preparation states.
export function resolveUsdaSearchTerm(query, dictionary) {
  const match = searchHungarianFoods(query, dictionary, { limit: 1 })[0]
  return match?.usdaQuery || null
}
