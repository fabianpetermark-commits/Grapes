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
  const mapped = translations[normalizeFoodSearchText(value)]
  return { query: mapped?.[0] || String(value || '').trim(), label: mapped?.[1] || '' }
}

const nonNegative = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null
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
  return {
    kind: 'generic', name: (label ? label + ' · ' : '') + description,
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
  const products = responseBody.foods.map(hit => foodFromUsdaSearchHit(hit, label)).filter(Boolean)
  const result = { count: products.length, products }
  cache.set(key, { at: now, result })
  if (cache.size > 30) cache.delete(cache.keys().next().value)
  return result
}
