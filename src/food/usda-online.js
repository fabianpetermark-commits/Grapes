import { normalizeFoodSearchText } from './food-search-method.js'
import { isGrapesAndroidApp, requestAndroidFoodApi } from '../android-bridge.js'

// Translation extends the *search expression*, never guesses a USDA fdcId.
const translations = Object.freeze({
  alma: ['Apples, raw', 'Alma'], almat: ['Apples, raw', 'Alma'],
  banan: ['Bananas, raw', 'Banán'], korte: ['Pears, raw', 'Körte'],
  szilva: ['Plums, raw', 'Szilva'], oszibarack: ['Peaches, raw', 'Őszibarack'],
  sargabarack: ['Apricots, raw', 'Sárgabarack'], szolo: ['Grapes, raw', 'Szőlő'],
  eper: ['Strawberries, raw', 'Eper'], malna: ['Raspberries, raw', 'Málna'],
  afonya: ['Blueberries, raw', 'Áfonya'], narancs: ['Oranges, raw', 'Narancs'],
  mandarin: ['Tangerines, raw', 'Mandarin'], citrom: ['Lemons, raw', 'Citrom'],
  avokado: ['Avocados, raw', 'Avokádó'], ananasz: ['Pineapple, raw', 'Ananász'],
  dinnye: ['Watermelon, raw', 'Dinnye'], krumpli: ['Potatoes, raw', 'Burgonya'],
  burgonya: ['Potatoes, raw', 'Burgonya'], edesburgonya: ['Sweet potatoes, raw', 'Édesburgonya'],
  voroshagyma: ['Onions, raw', 'Vöröshagyma'], fokhagyma: ['Garlic, raw', 'Fokhagyma'],
  sargarepa: ['Carrots, raw', 'Sárgarépa'], paprika: ['Peppers, sweet, raw', 'Paprika'],
  paradicsom: ['Tomatoes, raw', 'Paradicsom'], uborka: ['Cucumber, with peel, raw', 'Uborka'],
  cukkini: ['Zucchini, raw', 'Cukkini'], brokkoli: ['Broccoli, raw', 'Brokkoli'],
  karfiol: ['Cauliflower, raw', 'Karfiol'], spenot: ['Spinach, raw', 'Spenót'],
  salata: ['Lettuce, raw', 'Saláta'], gomba: ['Mushrooms, raw', 'Gomba'],
  sutotok: ['Pumpkin, raw', 'Sütőtök'], kukorica: ['Corn, sweet, raw', 'Kukorica'],
  zoldborso: ['Peas, green, raw', 'Zöldborsó'], rizs: ['Rice, white, long-grain, raw', 'Rizs'],
  'fott rizs': ['Rice, white, long-grain, cooked', 'Főtt rizs'],
  'barna rizs': ['Rice, brown, raw', 'Barna rizs'],
  'fott barna rizs': ['Rice, brown, cooked', 'Főtt barna rizs'],
  teszta: ['Pasta, dry', 'Tészta'], liszt: ['Wheat flour, white, all-purpose', 'Liszt'],
  zabpehely: ['Oats, rolled', 'Zabpehely'], tej: ['Milk, whole', 'Tej'],
  'sovany tej': ['Milk, nonfat', 'Sovány tej'], joghurt: ['Yogurt, plain', 'Joghurt'],
  turo: ['Cottage cheese', 'Túró'], sajt: ['Cheese', 'Sajt'],
  vaj: ['Butter', 'Vaj'], tojas: ['Egg, whole, raw', 'Tojás'],
  csirkemell: ['Chicken breast', 'Csirkemell'], csirke: ['Chicken', 'Csirke'],
  marhahus: ['Beef', 'Marhahús'], serteshus: ['Pork', 'Sertéshús'],
  lazac: ['Salmon', 'Lazac'], tonhal: ['Tuna', 'Tonhal'],
  bab: ['Beans', 'Bab'], lencse: ['Lentils', 'Lencse'],
  csicseriborso: ['Chickpeas', 'Csicseriborsó'], mandula: ['Almonds', 'Mandula'],
  dio: ['Walnuts', 'Dió'], mogyoro: ['Peanuts', 'Mogyoró'],
  cukor: ['Sugars, granulated', 'Cukor'], mez: ['Honey', 'Méz'],
  napraforgoolaj: ['Oil, sunflower', 'Napraforgóolaj'], olivaolaj: ['Oil, olive', 'Olívaolaj'],
})

export function translateUsdaQuery(value) {
  const normalized = normalizeFoodSearchText(value)
  const mapped = translations[normalized]
  if (mapped) return { query: mapped[0], label: mapped[1] }
  const tokens = normalized.split(' ')
  const modifiers = new Set(['fott', 'fozott', 'nyers', 'szaraz', 'szaritott', 'elgozolt'])
  const baseKey = tokens.filter(token => !modifiers.has(token)).join(' ')
  const base = baseKey !== normalized ? translations[baseKey] : null
  if (base) {
    const state = tokens.some(token => ['fott', 'fozott'].includes(token)) ? 'cooked'
      : tokens.includes('nyers') ? 'raw'
        : tokens.some(token => ['szaraz', 'szaritott'].includes(token)) ? 'dried'
          : tokens.includes('elgozolt') ? 'parboiled' : ''
    const genericState = /^(raw|cooked|dry|dried|parboiled)$/i
    const query = [...base[0].split(',').map(part => part.trim()).filter(part => !genericState.test(part)), state]
      .filter(Boolean).join(', ')
    return { query, label: base[1] }
  }
  return { query: String(value || '').trim(), label: '' }
}

const nonNegative = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null

const descriptionTraits = Object.freeze([
  { id: 'cooked', group: 'preparation', pattern: /\b(cooked|boiled|steamed)\b/i, label: 'főtt' },
  { id: 'raw', group: 'preparation', pattern: /\braw\b/i, label: 'nyers' },
  { id: 'roasted', group: 'preparation', pattern: /\broasted\b/i, label: 'sült' },
  { id: 'fried', group: 'preparation', pattern: /\bfried\b/i, label: 'sütött' },
  { id: 'dry', group: 'preparation', pattern: /\bdry\b/i, label: 'száraz' },
  { id: 'dried', group: 'preparation', pattern: /\bdried\b/i, label: 'szárított' },
  { id: 'parboiled', group: 'processing', pattern: /\bparboiled\b/i, label: 'előgőzölt' },
  { id: 'with-skin', group: 'ediblePart', pattern: /\b(with|includes) (skin|peel)\b/i, label: 'héjjal' },
  { id: 'without-skin', group: 'ediblePart', pattern: /\b(without (skin|peel)|skinless)\b/i, label: 'bőr nélkül' },
  { id: 'meat-only', group: 'ediblePart', pattern: /\bmeat only\b/i, label: 'csak hús' },
  { id: 'peeled', group: 'ediblePart', pattern: /\bpeeled\b/i, label: 'hámozott' },
  { id: 'unpeeled', group: 'ediblePart', pattern: /\bunpeeled\b/i, label: 'hámozatlan' },
  { id: 'hulled', group: 'ediblePart', pattern: /\bhulled\b/i, label: 'hántolt' },
  { id: 'unhulled', group: 'ediblePart', pattern: /\bunhulled\b/i, label: 'hántolatlan' },
  { id: 'boneless', group: 'ediblePart', pattern: /\bboneless\b/i, label: 'csont nélkül' },
  { id: 'long-grain', group: 'shape', pattern: /\blong[- ]grain(ed)?\b/i, label: 'hosszúszemű' },
  { id: 'medium-grain', group: 'shape', pattern: /\bmedium[- ]grain(ed)?\b/i, label: 'közepes szemű' },
  { id: 'short-grain', group: 'shape', pattern: /\bshort[- ]grain(ed)?\b/i, label: 'rövidszemű' },
  { id: 'unenriched', group: 'processing', pattern: /\bunenriched\b/i, label: 'dúsítatlan' },
  { id: 'enriched', group: 'processing', pattern: /\benriched\b/i, label: 'dúsított' },
])

const foodNames = Object.freeze([
  [/\bchicken\b.*\bbreast\b|\bbreast\b.*\bchicken\b/i, 'Csirkemell'],
  [/\brice\b/i, 'Rizs'], [/\bapples?\b/i, 'Alma'], [/\bonions?\b/i, 'Vöröshagyma'],
  [/\bbananas?\b/i, 'Banán'], [/\bpears?\b/i, 'Körte'], [/\bpotatoes?\b/i, 'Burgonya'],
  [/\btomatoes?\b/i, 'Paradicsom'], [/\bcucumbers?\b/i, 'Uborka'], [/\bcarrots?\b/i, 'Sárgarépa'],
  [/\bbroccoli\b/i, 'Brokkoli'], [/\bcauliflower\b/i, 'Karfiol'], [/\bspinach\b/i, 'Spenót'],
  [/\bmushrooms?\b/i, 'Gomba'], [/\blentils?\b/i, 'Lencse'], [/\bchickpeas?\b/i, 'Csicseriborsó'],
])

function traitsFromDescription(description) {
  return descriptionTraits.filter(trait => trait.pattern.test(description))
}

function queryIntent(value) {
  const query = normalizeFoodSearchText(value)
  const has = pattern => pattern.test(query)
  return {
    preparation: has(/\b(fott|fozott|cooked|boiled|steamed)\b/) ? 'cooked'
      : has(/\b(nyers|raw)\b/) ? 'raw'
        : has(/\b(szaritott|szaraz|dry|dried)\b/) ? 'dried' : '',
    color: has(/\b(barna|brown)\b/) ? 'brown' : has(/\b(feher|white)\b/) ? 'white' : '',
    parboiled: has(/\b(elgozolt|parboiled)\b/),
    skin: has(/\b(hejjal|borrel|with skin|with peel)\b/) ? 'with-skin'
      : has(/\b(hej nelkul|bor nelkul|skinless|without skin|peeled)\b/) ? 'without-skin' : '',
  }
}

function localizedFoodName(description, fallbackLabel = '') {
  let base = foodNames.find(([pattern]) => pattern.test(description))?.[1] || ''
  if (base === 'Rizs') {
    if (/\bbrown\b/i.test(description)) base = 'Barna rizs'
    else if (/\bwhite\b/i.test(description)) base = 'Fehér rizs'
  }
  if (!base) return description
  const traits = traitsFromDescription(description)
    .filter(trait => !(base.endsWith('rizs') && ['brown', 'white'].includes(trait.id)))
  const labels = [...new Set(traits.map(trait => {
    if (trait.id === 'without-skin' && !/^Csirke/.test(base)) return 'héj nélkül'
    if (trait.id === 'with-skin' && /^Csirke/.test(base)) return 'bőrrel'
    if (trait.id === 'meat-only' && /^Csirke/.test(base)) return 'bőr nélkül'
    return trait.label
  }))]
  return labels.length ? `${base} – ${labels.join(', ')}` : (base || fallbackLabel || description)
}

export function localizeUsdaDescription(description, fallbackLabel = '') {
  const original = String(description || '').trim().slice(0, 135)
  return { name: localizedFoodName(original, fallbackLabel), original }
}

function scoreUsdaHit(hit, value, translatedQuery, index) {
  const description = String(hit.description || '')
  const normalized = description.toLocaleLowerCase('en-US')
  const intent = queryIntent(value)
  const traits = new Set(traitsFromDescription(description).map(trait => trait.id))
  const cooked = ['cooked', 'roasted', 'fried'].some(trait => traits.has(trait))
  const dried = ['dry', 'dried'].some(trait => traits.has(trait))
  let score = 0
  const meaningfulTerms = String(translatedQuery || '').toLocaleLowerCase('en-US').split(/[^a-z]+/)
    .filter(term => term.length > 2 && !['raw', 'cooked', 'white', 'brown', 'long', 'grain', 'with', 'without'].includes(term))
  score += meaningfulTerms.filter(term => normalized.includes(term)).length * 18
  if (intent.preparation === 'cooked') score += cooked ? 120 : traits.has('raw') || dried ? -100 : -25
  else if (intent.preparation === 'raw') score += traits.has('raw') ? 120 : cooked ? -100 : 0
  else if (intent.preparation === 'dried') score += dried ? 100 : cooked ? -65 : 0
  else score += traits.has('raw') ? 50 : dried ? 30 : cooked ? -45 : 0
  if (intent.color === 'brown') score += /\bbrown\b/i.test(description) ? 85 : /\bwhite\b/i.test(description) ? -55 : -15
  if (intent.color === 'white') score += /\bwhite\b/i.test(description) ? 85 : /\bbrown\b/i.test(description) ? -55 : -15
  if (intent.parboiled) score += traits.has('parboiled') ? 70 : -15
  else if (traits.has('parboiled')) score -= 20
  if (intent.skin) score += traits.has(intent.skin) ? 60 : traits.has(intent.skin === 'with-skin' ? 'without-skin' : 'with-skin') ? -45 : 0
  if (/\b(baby food|cereal|restaurant|fast food|frozen|canned|ready-to-eat|flavored)\b/i.test(description)) score -= 35
  if (hit.dataType === 'Foundation') score += 2
  return { hit, score, index }
}

export function rankUsdaSearchHits(hits, value, translatedQuery = value) {
  const seen = new Set()
  return (Array.isArray(hits) ? hits : [])
    .filter(hit => Number.isInteger(hit?.fdcId) && !seen.has(hit.fdcId) && seen.add(hit.fdcId))
    .map((hit, index) => scoreUsdaHit(hit, value, translatedQuery, index))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.hit)
}

export function foodFromUsdaSearchHit(hit, label = '') {
  if (!hit || !Number.isInteger(hit.fdcId) || !['Foundation', 'SR Legacy'].includes(hit.dataType)
    || typeof hit.description !== 'string' || !hit.description.trim() || !Array.isArray(hit.foodNutrients)) return null
  const nutrients = hit.foodNutrients
  const find = (ids, unit) => {
    for (const id of ids) {
      const found = nutrients.find(n => Number(n?.nutrientId) === id && String(n?.unitName || '').toLowerCase() === unit)
      if (found) return nonNegative(found.value)
    }
    return null
  }
  const energy = find([2047, 2048, 1008], 'kcal')
  const protein = find([1003], 'g')
  const carbohydrate = find([1005], 'g')
  const fat = find([1004], 'g')
  if ([energy, protein, carbohydrate, fat].some(value => value === null)) return null
  const sodium = find([1093], 'mg')
  const description = hit.description.trim().slice(0, 135)
  const localized = localizeUsdaDescription(description, label)
  const traits = traitsFromDescription(description)
  const preparationTraits = traits.filter(trait => trait.group === 'preparation').map(trait => trait.id)
  const preparation = preparationTraits.includes('raw') ? 'raw'
    : preparationTraits.some(trait => ['dry', 'dried'].includes(trait)) ? 'dried'
      : preparationTraits.some(trait => ['cooked', 'roasted', 'fried'].includes(trait)) ? 'cooked' : ''
  return {
    kind: 'generic', name: localized.name, usdaDescription: localized.original, preparation,
    category: 'USDA alapanyag · ' + hit.dataType, baseUnit: 'g', barcode: '',
    nutrients: {
      energyKcal: energy, protein, carbohydrate, fat,
      fiber: find([1079], 'g'), sugar: find([2000], 'g'),
      saturatedFat: find([1258], 'g'),
      salt: sodium === null ? null : Math.round(sodium * 25) / 10000,
    },
    verified: false,
    source: { type: 'usda', id: String(hit.fdcId), attribution: 'USDA FoodData Central · ' + hit.dataType },
  }
}

const cache = new Map()
export async function searchOnlineUsdaFoods(value, {
  fetchImpl = globalThis.fetch, androidSearch = requestAndroidFoodApi,
  android = isGrapesAndroidApp(), now = Date.now(),
} = {}) {
  const term = String(value || '').trim().replace(/\s+/g, ' ')
  if (term.length < 3 || term.length > 120 || /^\d{7,14}$/.test(term)) return { count: 0, products: [] }
  const { query, label } = translateUsdaQuery(term)
  const key = query.toLocaleLowerCase('en-US')
  const cached = cache.get(key)
  if (cached && now - cached.at < 300000) return cached.result
  let responseBody
  if (android) {
    responseBody = await androidSearch('usdaSearch', query)
  } else {
    if (typeof fetchImpl !== 'function') throw new Error('USDA online keresés nem érhető el.')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8500)
    try {
      const response = await fetchImpl('https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, dataType: ['Foundation', 'SR Legacy'], pageSize: 20, pageNumber: 1 }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('USDA online HTTP ' + response.status)
      responseBody = await response.json()
    } finally { clearTimeout(timer) }
  }
  if (!responseBody || !Array.isArray(responseBody.foods)) throw new Error('Érvénytelen USDA online válasz.')
  const products = rankUsdaSearchHits(responseBody.foods, term, query)
    .map(hit => foodFromUsdaSearchHit(hit, label)).filter(Boolean)
  const result = { count: products.length, products }
  cache.set(key, { at: now, result })
  if (cache.size > 30) cache.delete(cache.keys().next().value)
  return result
}
