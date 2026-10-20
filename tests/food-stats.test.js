import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateNutritionSeries, buildDailyNutritionSeries, filterNutritionPeriod, macroEnergyDistribution, nutritionStatistics, targetAchievement } from '../src/food/food-stats.js'
import { createEmptyFoodProject } from '../src/food/food-data.js'

const profile = { id: 'stats-user', name: 'Stats', email: 'stats@example.com' }
const entry = (id, date, nutrients) => ({ id, profileId: profile.id, occurredAt: `${date}T12:00:00.000Z`, snapshot: { nutrients } })
const entries = [
  entry('a', '2026-09-30', { energyKcal: 1800, protein: 90, carbohydrate: 200, fat: 70 }),
  entry('b', '2026-10-01', { energyKcal: 2100, protein: 110, carbohydrate: 250, fat: 75 }),
  entry('c', '2026-10-08', { energyKcal: 2000, protein: null, carbohydrate: 220, fat: 80 }),
]

test('all-time napi sorozatot épít, a hiányos napot megjelölve', () => {
  const series = buildDailyNutritionSeries(entries, profile.id)
  assert.equal(series.length, 3)
  assert.equal(series[2].nutrients.protein, null)
  assert.deepEqual(nutritionStatistics(series, 'protein'), { total: 200, average: 100, min: 90, max: 110, loggedDays: 3, availableDays: 2, incompleteDays: 1 })
})

test('7/30 napos szűrést és heti/havi aggregálást készít', () => {
  const series = buildDailyNutritionSeries(entries, profile.id)
  assert.equal(filterNutritionPeriod(series, '7', '2026-10-08').length, 1)
  assert.equal(aggregateNutritionSeries(series, 'energyKcal', 'week').length, 2)
  assert.equal(aggregateNutritionSeries(series, 'energyKcal', 'month').length, 2)
})

test('célérték-teljesülést és 4/4/9 makróenergia-megoszlást számol', () => {
  const project = createEmptyFoodProject(profile)
  project.targets[0].effectiveFrom = '2026-01-01'
  project.targets[0].values = { energyKcal: 2000, protein: 100, carbohydrate: 250, fat: 70 }
  const series = buildDailyNutritionSeries(entries, profile.id)
  assert.deepEqual(targetAchievement(series, project, 'energyKcal'), { eligibleDays: 3, hitDays: 3, percent: 100 })
  const macro = macroEnergyDistribution(series)
  assert.equal(macro.kcal.protein, null)
  assert.equal(macro.kcal.fat, 2025)
  assert.equal(macro.totalKcal, null)
  assert.equal(macro.percent.protein, null)
  assert.equal(macro.complete.protein, false)
})

test('teljes makrók esetén 4/4/9 százalék számolható, üres sorozatnál ismeretlen', () => {
  const complete = macroEnergyDistribution(buildDailyNutritionSeries(entries.slice(0, 2), profile.id))
  assert.equal(complete.totalKcal, 800 + 1800 + 1305)
  assert.ok(complete.percent.protein > 0)
  assert.equal(macroEnergyDistribution([]).totalKcal, null)
})

test('a történeti folyadékrekord nem számít naplózott étkezési napnak', () => {
  const water = { profileId: profile.id, occurredAt: '2026-10-09T12:00:00.000Z',
    snapshot: { category: 'Folyadék', nutrients: {} } }
  const series = buildDailyNutritionSeries([...entries, water], profile.id)
  assert.equal(series.length, 3)
})
