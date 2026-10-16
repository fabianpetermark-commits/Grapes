import { mkdir, writeFile } from 'node:fs/promises'

const key = process.env.USDA_FDC_API_KEY
if (!key) throw new Error('USDA_FDC_API_KEY is missing.')
const foods = [
  { name: 'Vöröshagyma', query: 'Onions, raw' },
  { name: 'Fokhagyma', query: 'Garlic, raw' },
  { name: 'Búzafinomliszt', query: 'Wheat flour, white, all-purpose, unenriched' },
  { name: 'Sárgarépa', query: 'Carrots, raw' },
  { name: 'Sütőtök', query: 'Pumpkin, raw' },
  { name: 'Édesburgonya', query: 'Sweet potato, raw' },
  { name: 'Brokkoli', query: 'Broccoli, raw' },
  { name: 'Cukkini', query: 'Squash, summer, zucchini, raw' },
  { name: 'Paprika', query: 'Peppers, sweet, red, raw' },
  { name: 'Citrom', query: 'Lemons, raw' },
]
const results = []
for (const food of foods) {
  const response = await fetch('https://api.nal.usda.gov/fdc/v1/foods/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
    body: JSON.stringify({ query: food.query, dataType: ['Foundation', 'SR Legacy'], pageSize: 10 }),
  })
  if (!response.ok) throw new Error('USDA search failed for ' + food.name + ': HTTP ' + response.status)
  const payload = await response.json()
  results.push({
    nameHu: food.name,
    query: food.query,
    candidates: (payload.foods || []).map(item => ({
      fdcId: item.fdcId,
      description: item.description,
      dataType: item.dataType,
      nutrients: (item.foodNutrients || []).map(n => ({
        nutrientId: n.nutrientId,
        nutrientName: n.nutrientName,
        unitName: n.unitName,
        value: n.value,
      })),
    })),
  })
}
await mkdir('artifacts', { recursive: true })
await writeFile('artifacts/usda-candidates.json', JSON.stringify({
  source: 'USDA FoodData Central', retrievedAt: new Date().toISOString(), results,
}, null, 2) + '\n')
console.log('Retrieved candidates for ' + results.length + ' Hungarian ingredients; manual nutritional validation required.')
