// Pure Hungarian-first food search. This module has no network or UI coupling.
// Only exact, unique catalog terms may resolve to a verified USDA identity.

export const normalizeFoodSearchText = value => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('hu-HU')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim().replace(/\s+/g, ' ')
  .replace(/\b([a-z]+)\s+(\d+)\b/g, '$1$2')

const HUNGARIAN_SUFFIXES = [
  'aitok', 'eitek', 'atok', 'etek', 'otok', 'otok', 'unk', 'unk',
  'abol', 'ebol', 'ban', 'ben', 'bol', 'bel', 'rol', 'rol', 'tol', 'tol',
  'nak', 'nek', 'val', 'vel', 'ert', 'kent', 'ba', 'be', 'ra', 're',
  'on', 'en', 'an', 'ig', 'at', 'et', 'ot', 't',
]

function tokenVariants(token) {
  const variants = new Set([token])
  for (const suffix of HUNGARIAN_SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 4)
      variants.add(token.slice(0, -suffix.length))
  }
  return variants
}

const words = value => normalizeFoodSearchText(value).split(' ').filter(Boolean)
const semanticKey = food => [food.preparation, food.ediblePart, food.processing].join('|')

function validateCatalogRecord(food) {
  if (!food || typeof food !== 'object') throw new TypeError('A katalógusrekord objektum kell legyen.')
  if (!food.id || !food.nameHu) throw new TypeError('Minden katalógusrekordhoz id és nameHu szükséges.')
  if (!Number.isInteger(food.fdcId) || food.fdcId <= 0)
    throw new TypeError(`${food.id}: csak ellenőrzött, pozitív egész fdcId használható.`)
  for (const field of ['preparation', 'ediblePart', 'processing']) {
    if (!food[field]) throw new TypeError(`${food.id}: hiányzó strukturált mező: ${field}.`)
  }
  if (food.verified !== true || !food.verification?.source || !food.verification?.checkedAt)
    throw new TypeError(`${food.id}: az fdcId ellenőrzési nyoma hiányzik.`)
}

function searchTerms(food) {
  return [...new Set([food.nameHu, ...(food.aliasesHu || [])]
    .map(normalizeFoodSearchText).filter(Boolean))]
}

export function createHungarianFoodIndex(foods = []) {
  const records = foods.map((food, position) => {
    validateCatalogRecord(food)
    const terms = searchTerms(food)
    return Object.freeze({ food, position, terms, tokenLists: terms.map(words) })
  })
  const exact = new Map()
  const prefixes = new Map()
  records.forEach((record, recordIndex) => {
    for (const term of record.terms) {
      if (!exact.has(term)) exact.set(term, new Set())
      exact.get(term).add(recordIndex)
    }
    const uniqueTokens = new Set(record.tokenLists.flat())
    for (const token of uniqueTokens) {
      for (let length = 2; length <= token.length; length++) {
        const prefix = token.slice(0, length)
        if (!prefixes.has(prefix)) prefixes.set(prefix, new Set())
        prefixes.get(prefix).add(recordIndex)
      }
    }
  })
  return Object.freeze({ records: Object.freeze(records), exact, prefixes })
}

function intersect(left, right) {
  if (!left) return new Set(right)
  return new Set([...left].filter(value => right.has(value)))
}

function candidatesForToken(index, token) {
  const result = new Set()
  for (const variant of tokenVariants(token)) {
    for (const id of index.prefixes.get(variant) || []) result.add(id)
  }
  return result
}

function distinctPrefixMatch(queryTokens, candidateTokens, queryIndex = 0, used = new Set()) {
  if (queryIndex === queryTokens.length) return true
  for (let i = 0; i < candidateTokens.length; i++) {
    if (used.has(i)) continue
    const matched = [...tokenVariants(queryTokens[queryIndex])]
      .some(variant => candidateTokens[i].startsWith(variant))
    if (!matched) continue
    used.add(i)
    if (distinctPrefixMatch(queryTokens, candidateTokens, queryIndex + 1, used)) return true
    used.delete(i)
  }
  return false
}

function rankRecord(record, needle, queryTokens) {
  let best = null
  record.terms.forEach((term, termIndex) => {
    const tokens = record.tokenLists[termIndex]
    let matchType = null
    let score = -1
    if (term === needle) {
      matchType = termIndex === 0 ? 'exact-name' : 'exact-alias'
      score = termIndex === 0 ? 100 : 95
    } else if (queryTokens.length === 1 && tokenVariants(queryTokens[0]).has(term)) {
      matchType = 'inflected-exact'
      score = termIndex === 0 ? 94 : 92
    } else if (term.startsWith(`${needle} `)) {
      matchType = 'phrase-prefix'
      score = termIndex === 0 ? 80 : 75
    } else if (distinctPrefixMatch(queryTokens, tokens)) {
      matchType = 'token-prefix'
      score = termIndex === 0 ? 65 : 60
    }
    if (score > (best?.score ?? -1)) best = { score, matchType, term }
  })
  return best
}

export function searchHungarianFoods(query, foodsOrIndex, { limit = 20 } = {}) {
  const needle = normalizeFoodSearchText(query)
  if (needle.length < 2 || needle.length > 120) return []
  const index = foodsOrIndex?.records ? foodsOrIndex : createHungarianFoodIndex(foodsOrIndex)
  const queryTokens = words(needle)
  let candidateIds = null
  for (const token of queryTokens) candidateIds = intersect(candidateIds, candidatesForToken(index, token))
  if (!candidateIds?.size) return []
  return [...candidateIds].map(id => {
    const record = index.records[id]
    return { record, rank: rankRecord(record, needle, queryTokens) }
  }).filter(item => item.rank)
    .sort((a, b) => b.rank.score - a.rank.score
      || a.record.food.nameHu.localeCompare(b.record.food.nameHu, 'hu')
      || String(a.record.food.id).localeCompare(String(b.record.food.id)))
    .slice(0, Math.max(0, limit))
    .map(item => item.record.food)
}

export function resolveHungarianFood(query, foodsOrIndex) {
  const needle = normalizeFoodSearchText(query)
  if (needle.length < 2 || needle.length > 120)
    return { status: 'invalid', query: needle, matches: [] }
  const index = foodsOrIndex?.records ? foodsOrIndex : createHungarianFoodIndex(foodsOrIndex)
  const exactIds = [...(index.exact.get(needle) || [])]
  if (!exactIds.length)
    return { status: 'no-match', query: needle, matches: searchHungarianFoods(needle, index) }
  const matches = exactIds.map(id => index.records[id].food)
    .sort((a, b) => a.nameHu.localeCompare(b.nameHu, 'hu') || String(a.id).localeCompare(String(b.id)))
  const semantics = new Set(matches.map(semanticKey))
  if (matches.length !== 1 || semantics.size !== 1)
    return { status: 'ambiguous', query: needle, matches }
  return { status: 'match', query: needle, match: matches[0], matches }
}

export function resolveUsdaSearchTerm(query, foodsOrIndex) {
  const result = resolveHungarianFood(query, foodsOrIndex)
  return result.status === 'match' ? result.match.usdaQuery || null : null
}

export function resolveVerifiedFdcId(query, foodsOrIndex) {
  const result = resolveHungarianFood(query, foodsOrIndex)
  return result.status === 'match' ? result.match.fdcId : null
}
