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
  gorogdinnye: ['Watermelon, raw', 'Görögdinnye'], sargadinnye: ['Cantaloupe, raw', 'Sárgadinnye'], krumpli: ['Potatoes, raw', 'Burgonya'],
  burgonya: ['Potatoes, raw', 'Burgonya'], edesburgonya: ['Sweet potatoes, raw', 'Édesburgonya'],
  hagyma: ['Onions, raw', 'Hagyma'], voroshagyma: ['Onions, raw', 'Vöröshagyma'], fokhagyma: ['Garlic, raw', 'Fokhagyma'],
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
  dio: ['Walnuts', 'Dió'], mogyoro: ['Hazelnuts', 'Mogyoró'], foldimogyoro: ['Peanuts', 'Földimogyoró'],
  cukor: ['Sugars, granulated', 'Cukor'], mez: ['Honey', 'Méz'],
  napraforgoolaj: ['Oil, sunflower', 'Napraforgóolaj'], olivaolaj: ['Oil, olive', 'Olívaolaj'],
  // Carefully curated Hungarian search aliases: these alter the USDA query,
  // never its FDC identifier, nutrition facts, or raw English description.
  hagymat: ['Onions, raw', 'Hagyma'], lilahagyma: ['Onions, red, raw', 'Lilahagyma'],
  feherhagyma: ['Onions, white, raw', 'Fehérhagyma'],
  zoldhagyma: ['Onions, green, raw', 'Zöldhagyma'],
  ujhagyma: ['Onions, green, raw', 'Újhagyma'],
  porehagyma: ['Leeks, raw', 'Póréhagyma'],
  repa: ['Carrots, raw', 'Sárgarépa'],
  feherrepa: ['Parsley root, raw', 'Fehérrépa'],
  paszternak: ['Parsnips, raw', 'Paszternák'],
  petrezselyemgyoker: ['Parsley root, raw', 'Petrezselyemgyökér'],
  zeller: ['Celery', 'Zeller'], szarzeller: ['Celery, raw', 'Szárzeller'],
  zellergumo: ['Celeriac, raw', 'Zellergumó'],
  padlizsan: ['Eggplant, raw', 'Padlizsán'],
  karalabe: ['Kohlrabi, raw', 'Karalábé'],
  kaposzta: ['Cabbage, raw', 'Káposzta'],
  voroskaposzta: ['Cabbage, red, raw', 'Vöröskáposzta'],
  kelkaposzta: ['Savoy cabbage, raw', 'Kelkáposzta'],
  kelbimbo: ['Brussels sprouts, raw', 'Kelbimbó'],
  cekla: ['Beets, raw', 'Cékla'],
  retek: ['Radishes, raw', 'Retek'],
  zoldbab: ['Beans, snap, green, raw', 'Zöldbab'],
  jegsalata: ['Lettuce, iceberg, raw', 'Jégsaláta'],
  rukola: ['Arugula, raw', 'Rukkola'],
  rukkola: ['Arugula, raw', 'Rukkola'],
  soska: ['Sorrel, raw', 'Sóska'],
  petrezselyem: ['Parsley, fresh', 'Petrezselyem'],
  kapor: ['Dill weed, fresh', 'Kapor'],
  bazsalikom: ['Basil, fresh', 'Bazsalikom'],
  koriander: ['Coriander leaves, raw', 'Koriander'],
  kakukkfu: ['Thyme, fresh', 'Kakukkfű'],
  rozmaring: ['Rosemary, fresh', 'Rozmaring'],
  gyomber: ['Ginger root, raw', 'Gyömbér'],
  // Common unbranded staples are distinct from flavored OFF products.
  zab: ['Oats', 'Zab'],
  bulgur: ['Bulgur, dry', 'Bulgur'],
  kuszkusz: ['Couscous, dry', 'Kuszkusz'],
  quinoa: ['Quinoa, uncooked', 'Quinoa'],
  hajdina: ['Buckwheat groats, raw', 'Hajdina'],
  arpagyongy: ['Barley, pearled, raw', 'Árpagyöngy'],
  arpa: ['Barley, raw', 'Árpa'],
  rozs: ['Rye grain', 'Rozs'],
  'teljes kiorlesu liszt': ['Wheat flour, whole-grain', 'Teljes kiőrlésű liszt'],
  'buza finomliszt': ['Wheat flour, white, all-purpose', 'Búzafinomliszt'],
  'finomliszt': ['Wheat flour, white, all-purpose', 'Finomliszt'],
  'zab liszt': ['Oat flour', 'Zabliszt'],
  zabliszt: ['Oat flour', 'Zabliszt'],
  'gorog joghurt': ['Yogurt, Greek, plain', 'Görög joghurt'],
  kefir: ['Kefir, plain', 'Kefir'],
  tejfol: ['Sour cream', 'Tejföl'],
  tejszin: ['Cream, fluid', 'Tejszín'],
  tehenturo: ['Cottage cheese', 'Tehéntúró'],
  mozzarella: ['Mozzarella cheese', 'Mozzarella'],
  feta: ['Feta cheese', 'Feta'],
  // Specific seafood and meats are not guessed from a generic "meat" hit.
  pulyka: ['Turkey', 'Pulyka'],
  pulykamell: ['Turkey breast', 'Pulykamell'],
  csirkecomb: ['Chicken thigh', 'Csirkecomb'],
  kacsamell: ['Duck breast', 'Kacsamell'],
  tokehal: ['Cod', 'Tőkehal'],
  pisztrang: ['Trout', 'Pisztráng'],
  szardinia: ['Sardines', 'Szardínia'],
  garnela: ['Shrimp', 'Garnéla'],
  tojasfeherje: ['Egg, white, raw', 'Tojásfehérje'],
  tojassargaja: ['Egg, yolk, raw', 'Tojássárgája'],
  // Fruit aliases intentionally do not imply USDA data for commercial products.
  meggy: ['Cherries, sour, raw', 'Meggy'],
  cseresznye: ['Cherries, sweet, raw', 'Cseresznye'],
  ribizli: ['Currants, raw', 'Ribizli'],
  szeder: ['Blackberries, raw', 'Szeder'],
  kiwi: ['Kiwifruit, raw', 'Kivi'],
  kivi: ['Kiwifruit, raw', 'Kivi'],
  grapefruit: ['Grapefruit, raw', 'Grapefruit'],
  mango: ['Mangos, raw', 'Mangó'],
  datolya: ['Dates', 'Datolya'],
  fuge: ['Figs, raw', 'Füge'],
  birsalma: ['Quinces, raw', 'Birsalma'],
  diofele: ['Nuts', 'Diófélék'],
  torokmogyoro: ['Hazelnuts', 'Törökmogyoró'],
  kesudio: ['Cashew nuts', 'Kesudió'],
  pisztacia: ['Pistachio nuts', 'Pisztácia'],
  tokmag: ['Pumpkin seeds', 'Tökmag'],
  chia: ['Chia seeds', 'Chiamag'],
  lenmag: ['Flaxseed', 'Lenmag'],
  szezammag: ['Sesame seeds', 'Szezámmag'],
})

export function translateUsdaQuery(value) {
  const normalized = normalizeFoodSearchText(value)
  const mapped = translations[normalized]
  if (mapped) return { query: mapped[0], label: mapped[1] }
  const tokens = normalized.split(' ')
  // Preparation is a search modifier, never part of an ingredient identity.
  // Preserve the identity and original USDA description when displaying hits.
  const preparations = Object.freeze({
    fott: 'cooked', fozott: 'cooked', parolt: 'cooked',
    sult: 'roasted', sutott: 'roasted', grillezett: 'grilled',
    piritott: 'roasted',
    nyers: 'raw', szaraz: 'dried', szaritott: 'dried',
    elgozolt: 'parboiled',
  })
  const baseKey = tokens.filter(token => !Object.hasOwn(preparations, token)).join(' ')
  const base = baseKey !== normalized ? translations[baseKey] : null
  if (base) {
    const state = tokens.map(token => preparations[token]).find(Boolean) || ''
    const genericState = /^(raw|cooked|boiled|steamed|roasted|grilled|fried|dry|dried|parboiled)$/i
    const query = [...base[0].split(',').map(part => part.trim()).filter(part => !genericState.test(part)), state]
      .filter(Boolean).join(', ')
    return { query, label: base[1] }
  }
  return { query: String(value || '').trim(), label: '' }
}

const nonNegative = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null

const descriptionTraits = Object.freeze([
  { id: 'cooked', group: 'preparation', pattern: /\b(cooked|boiled|steamed|sauteed|sautéed)\b/i, label: 'főtt' },
  { id: 'raw', group: 'preparation', pattern: /\braw\b/i, label: 'nyers' },
  { id: 'roasted', group: 'preparation', pattern: /\b(roasted|baked|grilled)\b/i, label: 'sült' },
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

// Only explicit ingredient identities receive a Hungarian display name.
// Keep the USDA description immediately below it; unknown/mixed dishes remain
// English rather than masquerading as an ingredient or its measured nutrients.
const foodNames = Object.freeze([
  [/^chicken\b.*\bbreast\b|^breast,?\s+chicken\b/i, 'Csirkemell'],
  [/^chicken\b.*\bthigh\b/i, 'Csirkecomb'],
  [/^turkey\b.*\bbreast\b/i, 'Pulykamell'],
  [/^turkey\b/i, 'Pulyka'],
  [/^duck\b.*\bbreast\b/i, 'Kacsamell'],
  [/^rice,?\s*brown\b/i, 'Barna rizs'],
  [/^rice,?\s*white\b/i, 'Fehér rizs'],
  [/^rice\b/i, 'Rizs'],
  [/^sweet potatoes?\b/i, 'Édesburgonya'],
  [/^potatoes?\b/i, 'Burgonya'],
  [/^onions?,?\s*(green|spring)\b|^scallions?\b/i, 'Újhagyma'],
  [/^onions?,?\s*red\b/i, 'Lilahagyma'],
  [/^onions?,?\s*white\b/i, 'Fehérhagyma'],
  [/^onions?\b/i, 'Vöröshagyma'],
  [/^garlic\b/i, 'Fokhagyma'], [/^leeks?\b/i, 'Póréhagyma'],
  [/^carrots?\b/i, 'Sárgarépa'], [/^parsnips?\b/i, 'Paszternák'],
  [/^parsley root\b/i, 'Fehérrépa'],
  [/^peppers?,?\s*sweet\b/i, 'Paprika'],
  [/^peppers?,?\s*(hot|chili)\b/i, 'Csilipaprika'],
  [/^tomatoes?\b/i, 'Paradicsom'], [/^cucumbers?\b/i, 'Uborka'],
  [/^squash,?\s*summer,?\s*zucchini\b|^zucchini\b/i, 'Cukkini'],
  [/^broccoli\b/i, 'Brokkoli'], [/^cauliflower\b/i, 'Karfiol'],
  [/^spinach\b/i, 'Spenót'], [/^mushrooms?\b/i, 'Gomba'],
  [/^cabbage,?\s*red\b/i, 'Vöröskáposzta'],
  [/^cabbage\b/i, 'Káposzta'],
  [/^brussels sprouts?\b/i, 'Kelbimbó'], [/^eggplant\b/i, 'Padlizsán'],
  [/^beets?\b/i, 'Cékla'], [/^radishes?\b/i, 'Retek'],
  [/^apples?\b/i, 'Alma'], [/^bananas?\b/i, 'Banán'],
  [/^pears?\b/i, 'Körte'], [/^plums?\b/i, 'Szilva'],
  [/^strawberries\b/i, 'Eper'], [/^blueberries\b/i, 'Áfonya'],
  [/^raspberries\b/i, 'Málna'], [/^blackberries\b/i, 'Szeder'],
  [/^cherries,?\s*sour\b/i, 'Meggy'],
  [/^cherries\b/i, 'Cseresznye'],
  [/^oranges?\b/i, 'Narancs'], [/^lemons?\b/i, 'Citrom'],
  [/^kiwifruit\b/i, 'Kivi'], [/^mangos?\b/i, 'Mangó'],
  [/^pumpkin\b/i, 'Sütőtök'],
  [/^lentils?\b/i, 'Lencse'], [/^chickpeas?\b/i, 'Csicseriborsó'],
  [/^quinoa\b/i, 'Quinoa'], [/^oats?\b/i, 'Zab'],
  [/^couscous\b/i, 'Kuszkusz'], [/^bulgur\b/i, 'Bulgur'],
  [/^eggs?,?\s*white\b/i, 'Tojásfehérje'],
  [/^eggs?,?\s*yolk\b/i, 'Tojássárgája'],
  [/^eggs?\b/i, 'Tojás'],
  [/^milk\b/i, 'Tej'], [/^yogurt\b/i, 'Joghurt'],
  [/^salmon\b/i, 'Lazac'], [/^tuna\b/i, 'Tonhal'],
  [/^cod\b/i, 'Tőkehal'], [/^trout\b/i, 'Pisztráng'],
])

function traitsFromDescription(description) {
  return descriptionTraits.filter(trait => trait.pattern.test(description))
}

function queryIntent(value) {
  const query = normalizeFoodSearchText(value)
  const has = pattern => pattern.test(query)
  return {
    preparation: has(/\b(sult|sutott|grillezett|piritott|roasted|grilled|baked)\b/) ? 'roasted'
      : has(/\b(fott|fozott|parolt|cooked|boiled|steamed)\b/) ? 'cooked'
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
  if (intent.preparation === 'roasted') score += traits.has('roasted') || traits.has('fried') ? 145 : traits.has('cooked') ? 75 : traits.has('raw') || dried ? -110 : -25
  else if (intent.preparation === 'cooked') score += cooked ? 120 : traits.has('raw') || dried ? -100 : -25
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
      const found = nutrients.find(n =>
        Number(n?.nutrientId ?? n?.nutrient?.id) === id &&
        String(n?.unitName ?? n?.nutrient?.unitName ?? '').toLowerCase() === unit)
      if (found) return nonNegative(found.value ?? found.amount)
    }
    return null
  }
  const energy = find([2047, 2048, 1008], 'kcal')
  const protein = find([1003], 'g')
  const carbohydrate = find([1005], 'g')
  const fat = find([1004], 'g')
  // Missing measurements remain null; do not discard a real USDA identity
  // just because its source has not published every macro.
  if ([energy, protein, carbohydrate, fat].every(value => value === null)) return null
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
    nutritionIncomplete: [energy, protein, carbohydrate, fat].some(value => value === null),
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
