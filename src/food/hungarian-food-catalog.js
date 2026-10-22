// Curated identities only. Each fdcId was checked against the cited FoodData
// Central candidate artifact; search results must never add records here.
const checkedAt = '2026-10-16'
const source = 'USDA FoodData Central candidate artifact, workflow run 38952618590'
const verification = Object.freeze({ source, checkedAt })

const rawWhole = (food, extra = {}) => ({
  preparation: 'raw', ediblePart: 'whole', processing: 'unprocessed', ...food, ...extra,
  verified: true, verification,
})

// FDC identities and per-100g reference macros cross-checked against
// published USDA SR Legacy mirrors (2026-10-18). Unlike an API search hit,
// these entries are intentionally reviewed and safe to serve offline.
// Sugar: https://whatyoueat.io/foods/169655-granulated-sugar
// Table salt: https://whatyoueat.io/foods/173468-table-salt
// Plain drinking water: https://batchbase.com.au/usda-foods/173647
const stapleVerification = Object.freeze({
  source: 'USDA FoodData Central SR Legacy, independently cross-checked by WhatYouEat and Batchbase (links in source)',
  checkedAt: '2026-10-18',
})
const staple = (food) => ({
  preparation: 'not-applicable', ediblePart: 'whole', processing: 'refined',
  verified: true, verification: stapleVerification, ...food,
})

export const HUNGARIAN_USDA_CATALOG = Object.freeze([
  staple({ id: 'sugar-granulated', fdcId: 169655, nameHu: 'Kristálycukor, fehér', aliasesHu: ['cukor', 'kristálycukor', 'fehér cukor'], usdaQuery: 'Sugars, granulated', usdaDescription: 'Sugars, granulated', dataType: 'SR Legacy', validation: { required: ['sugars', 'granulated'], forbidden: ['brown', 'powdered', 'substitute'] } }),
  staple({ id: 'salt-table', fdcId: 173468, nameHu: 'Étkezési só', aliasesHu: ['só', 'asztali só', 'étkezési só'], usdaQuery: 'Salt, table', usdaDescription: 'Salt, table', dataType: 'SR Legacy', validation: { required: ['salt', 'table'], forbidden: ['seasoning', 'mixed'] } }),
  staple({ id: 'water-tap-drinking', fdcId: 173647, nameHu: 'Ivóvíz, csapvíz', aliasesHu: ['víz', 'ivóvíz', 'csapvíz'], processing: 'drinking', usdaQuery: 'Beverages, water, tap, drinking', usdaDescription: 'Beverages, water, tap, drinking', dataType: 'SR Legacy', validation: { required: ['water', 'tap', 'drinking'], forbidden: ['flavored', 'sugared', 'mineral'] } }),

  rawWhole({ id: 'onion-yellow-raw', fdcId: 170000, nameHu: 'Vöröshagyma, nyers', aliasesHu: ['vöröshagyma', 'hagyma', 'nyers hagyma'], usdaQuery: 'Onions, raw', usdaDescription: 'Onions, raw', dataType: 'SR Legacy', validation: { required: ['onions', 'raw'], forbidden: ['cooked', 'powder'] } }),
  rawWhole({ id: 'garlic-raw', fdcId: 1104647, nameHu: 'Fokhagyma, nyers', aliasesHu: ['fokhagyma'], usdaQuery: 'Garlic, raw', usdaDescription: 'Garlic, raw', dataType: 'Foundation', validation: { required: ['garlic', 'raw'], forbidden: ['powder', 'cooked'] } }),
  { id: 'wheat-flour-bl55', fdcId: 169761, nameHu: 'Búzafinomliszt BL55', aliasesHu: ['búzafinomliszt', 'finomliszt', 'bl55', 'bl 55', 'bl-55'], preparation: 'not-applicable', ediblePart: 'grain-endosperm', processing: 'milled-unenriched', usdaQuery: 'Wheat flour, white, all-purpose, unenriched', usdaDescription: 'Wheat flour, white, all-purpose, unenriched', dataType: 'SR Legacy', verified: true, verification, validation: { required: ['wheat', 'flour', 'unenriched'], forbidden: ['enriched', 'self-rising', 'whole'] } },
  rawWhole({ id: 'carrot-raw', fdcId: 170393, nameHu: 'Sárgarépa, nyers', aliasesHu: ['sárgarépa', 'répa'], usdaQuery: 'Carrots, raw', usdaDescription: 'Carrots, raw', dataType: 'SR Legacy', validation: { required: ['carrots', 'raw'], forbidden: ['dehydrated', 'cooked'] } }, { ediblePart: 'root' }),
  rawWhole({ id: 'pumpkin-raw', fdcId: 168448, nameHu: 'Sütőtök húsa, nyers', aliasesHu: ['sütőtök'], usdaQuery: 'Pumpkin, raw', usdaDescription: 'Pumpkin, raw', dataType: 'SR Legacy', validation: { required: ['pumpkin', 'raw'], forbidden: ['flowers', 'leaves', 'seeds'] } }, { ediblePart: 'flesh' }),
  rawWhole({ id: 'sweet-potato-raw', fdcId: 2346404, nameHu: 'Édesburgonya gumó, nyers, héj nélkül', aliasesHu: ['édesburgonya'], usdaQuery: 'Sweet potatoes, orange flesh, without skin, raw', usdaDescription: 'Sweet potatoes, orange flesh, without skin, raw', dataType: 'Foundation', validation: { required: ['sweet potatoes', 'without skin', 'raw'], forbidden: ['leaves', 'cooked'] } }, { ediblePart: 'tuber-without-skin' }),
  rawWhole({ id: 'broccoli-raw', fdcId: 747447, nameHu: 'Brokkoli, nyers', aliasesHu: ['brokkoli'], usdaQuery: 'Broccoli, raw', usdaDescription: 'Broccoli, raw', dataType: 'Foundation', validation: { required: ['broccoli', 'raw'], forbidden: ['cooked', 'leaves', 'stalks'] } }),
  rawWhole({ id: 'zucchini-raw', fdcId: 169291, nameHu: 'Cukkini héjával, nyers', aliasesHu: ['cukkini'], usdaQuery: 'Squash, summer, zucchini, includes skin, raw', usdaDescription: 'Squash, summer, zucchini, includes skin, raw', dataType: 'SR Legacy', validation: { required: ['zucchini', 'includes skin', 'raw'], forbidden: ['canned', 'frozen', 'cooked'] } }, { ediblePart: 'fruit-with-skin' }),
  rawWhole({ id: 'red-pepper-raw', fdcId: 170108, nameHu: 'Piros paprika, nyers', aliasesHu: ['piros paprika', 'kaliforniai paprika'], usdaQuery: 'Peppers, sweet, red, raw', usdaDescription: 'Peppers, sweet, red, raw', dataType: 'SR Legacy', validation: { required: ['peppers', 'sweet', 'red', 'raw'], forbidden: ['sauteed', 'canned', 'frozen', 'freeze-dried', 'hot chili'] } }, { ediblePart: 'fruit' }),
  rawWhole({ id: 'lemon-flesh-raw', fdcId: 167746, nameHu: 'Citrom, nyers, héj nélkül', aliasesHu: ['citrom'], usdaQuery: 'Lemons, raw, without peel', usdaDescription: 'Lemons, raw, without peel', dataType: 'SR Legacy', validation: { required: ['lemons', 'raw', 'without peel'], forbidden: ['juice', 'grass'] } }, { ediblePart: 'fruit-without-peel' }),
])
