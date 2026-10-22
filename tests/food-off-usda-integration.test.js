
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { foodFromUsdaSearchHit } from '../src/food/usda-online.js'
import { normalizeFoodItem } from '../src/food/food-data.js'
const native = readFileSync(new URL('../android-health-connect-poc/app/src/main/java/hu/grapes/healthconnect/FoodApiBridge.kt', import.meta.url), 'utf8')

test('USDA adatok hiányzó makróval nem tűnnek el, értékek nem lesznek kitalált nullák', () => {
  const hit = { fdcId: 123456, description: 'Milk, whole', dataType: 'Foundation', foodNutrients: [
    { nutrientId: 1003, value: 3.2, unitName: 'G' },
    { nutrientId: 1004, value: 3.6, unitName: 'G' },
  ] }
  const food = foodFromUsdaSearchHit(hit)
  assert.equal(food.nutrients.protein, 3.2)
  assert.equal(food.nutrients.energyKcal, null)
  assert.equal(food.nutrients.carbohydrate, null)
  assert.equal(food.nutritionIncomplete, true)
  const nested = foodFromUsdaSearchHit({ fdcId: 123457, dataType: 'SR Legacy', description: 'Apples, raw',
    foodNutrients: [{ nutrient: { id: 2047, unitName: 'kcal' }, amount: 55 }] })
  assert.equal(nested.nutrients.energyKcal, 55)
  assert.equal(foodFromUsdaSearchHit({ ...hit, foodNutrients: [] }), null)
})

test('mentés: Open Food Facts márka és nyelvi állapot megmarad; meglévő rekordok olvashatók', () => {
  const saved = normalizeFoodItem({ name: 'Túró', barcode: '5999999999999', brand: 'Példa Márka',
    productLanguage: 'hu', hasHungarianName: true,
    nutrients: { energyKcal: 85, protein: null }, source: { type: 'openfoodfacts', id: '5999999999999' } })
  assert.equal(saved.brand, 'Példa Márka')
  assert.equal(saved.productLanguage, 'hu')
  assert.equal(saved.hasHungarianName, true)
  assert.equal(saved.nutrients.protein, null)
  assert.equal(normalizeFoodItem({ name: 'Régi étel', nutrients: {} }).brand, '')
})

test('Android OFF kérés: ország, országmező és márka nem veszhet el a natív API-hídon', () => {
  assert.match(native, /val region = args\.optString\(4, "hu"\)/)
  assert.match(native, /"offSearch".*offParameters\(query, page, pageSize, false, region\)/)
  assert.match(native, /countries_tags,brands,brands_tags/)
  assert.match(native, /countries_tags:/)
  assert.match(native, /tagtype_0/)
})

test('Android natív OFF 404 csak ismeretlen vonalkód; nem adatbázis-kiesés', () => {
  assert.match(native, /request\("https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/"[\s\S]*missingBarcode = query/)
  assert.match(native, /status == 404 && missingBarcode != null/)
  assert.match(native, /JSONObject\(\)\.put\("status", 0\)\.put\("code", missingBarcode\)/)
  assert.match(native, /429 -> "A szolgáltató keresési korlátja betelt\."/)
})
