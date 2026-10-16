import { mkdir, rename, writeFile } from 'node:fs/promises'
import { HUNGARIAN_USDA_CATALOG } from '../src/food/hungarian-food-catalog.js'
import { searchUsdaCandidates, validateUsdaCandidate } from '../src/food/usda-client.js'

const key = process.env.USDA_FDC_API_KEY
if (!key) throw new Error('USDA_FDC_API_KEY is missing.')

const outputPath = 'artifacts/usda-candidates.json'
const temporaryPath = `${outputPath}.tmp`
const report = {
  source: 'USDA FoodData Central',
  catalogVersion: 'food-v23-curated-1',
  retrievedAt: new Date().toISOString(),
  results: [],
}

async function checkpoint() {
  await mkdir('artifacts', { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`)
  await rename(temporaryPath, outputPath)
}

let failures = 0
for (const food of HUNGARIAN_USDA_CATALOG) {
  try {
    const candidates = await searchUsdaCandidates(food.usdaQuery, { apiKey: key })
    const pinned = candidates.find(candidate => candidate.fdcId === food.fdcId)
    const validation = pinned
      ? validateUsdaCandidate(pinned, food)
      : { valid: false, errors: ['verified-fdcId-not-returned'] }
    if (!validation.valid) failures++
    report.results.push({
      catalogId: food.id,
      nameHu: food.nameHu,
      expected: {
        fdcId: food.fdcId,
        description: food.usdaDescription,
        dataType: food.dataType,
        preparation: food.preparation,
        ediblePart: food.ediblePart,
        processing: food.processing,
      },
      validation,
      candidates,
    })
  } catch (error) {
    failures++
    report.results.push({
      catalogId: food.id,
      nameHu: food.nameHu,
      expected: { fdcId: food.fdcId, description: food.usdaDescription, dataType: food.dataType },
      validation: { valid: false, errors: ['request-failed'] },
      error: error?.message || String(error),
      candidates: [],
    })
  }
  await checkpoint()
}

if (failures) throw new Error(`${failures} USDA catalog record(s) failed validation; partial report preserved.`)
console.log(`Validated ${report.results.length} curated Hungarian USDA identities.`)
