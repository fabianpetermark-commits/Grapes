import { CORE_NUTRIENTS, currentTargets, localDateKey, summarizeEntries } from './food-data.js'

const rounded = (value, digits = 2) => Number(Number(value).toFixed(digits))

function weekKey(dateKey) {
  const date = new Date(`${dateKey}T12:00:00Z`)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - day + 1)
  return date.toISOString().slice(0, 10)
}

export function buildDailyNutritionSeries(entries, profileId) {
  const groups = new Map()
  for (const entry of entries) {
    if (entry.profileId !== profileId || entry.snapshot?.category === 'Folyadék') continue
    const date = entry.origin?.sourceDate || localDateKey(entry.occurredAt)
    if (!groups.has(date)) groups.set(date, [])
    groups.get(date).push(entry)
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dayEntries]) => ({ date, entries: dayEntries.length, nutrients: summarizeEntries(dayEntries) }))
}

export function filterNutritionPeriod(series, period = 'all', today = new Date().toISOString().slice(0, 10)) {
  if (period === 'all') return [...series]
  const days = Number(period)
  if (!Number.isFinite(days) || days <= 0) return [...series]
  const start = new Date(`${today}T12:00:00Z`)
  start.setUTCDate(start.getUTCDate() - days + 1)
  const key = start.toISOString().slice(0, 10)
  return series.filter(item => item.date >= key && item.date <= today)
}

export function aggregateNutritionSeries(series, nutrient, granularity = 'day') {
  if (!CORE_NUTRIENTS.includes(nutrient) && !/^extra:[a-z0-9_]+$/.test(nutrient)) throw new Error('Ismeretlen statisztikai tápanyag.')
  const groups = new Map()
  for (const item of series) {
    const key = granularity === 'month' ? item.date.slice(0, 7) : granularity === 'week' ? weekKey(item.date) : item.date
    if (!groups.has(key)) groups.set(key, { key, value: 0, availableDays: 0, loggedDays: 0 })
    const group = groups.get(key); group.loggedDays += 1
    if (Number.isFinite(item.nutrients[nutrient])) { group.value += item.nutrients[nutrient]; group.availableDays += 1 }
  }
  return [...groups.values()].map(item => ({ ...item, value: item.availableDays ? rounded(item.value) : null }))
}

export function nutritionStatistics(series, nutrient) {
  const values = series.map(item => item.nutrients[nutrient]).filter(value => value !== null && Number.isFinite(Number(value))).map(Number)
  if (!values.length) return { total: null, average: null, min: null, max: null, loggedDays: series.length, availableDays: 0, incompleteDays: series.length }
  const total = values.reduce((sum, value) => sum + value, 0)
  return { total: rounded(total), average: rounded(total / values.length), min: Math.min(...values), max: Math.max(...values), loggedDays: series.length, availableDays: values.length, incompleteDays: series.length - values.length }
}

export function targetAchievement(series, project, nutrient) {
  let eligibleDays = 0
  let hitDays = 0
  for (const day of series) {
    const actual = day.nutrients[nutrient]
    const target = currentTargets(project, day.date)[nutrient]
    if (actual === null || !target) continue
    eligibleDays += 1
    const ratio = actual / target
    const hit = nutrient === 'energyKcal' ? ratio >= 0.9 && ratio <= 1.1 : ratio >= 0.9
    if (hit) hitDays += 1
  }
  return { eligibleDays, hitDays, percent: eligibleDays ? rounded(hitDays / eligibleDays * 100, 1) : null }
}

export function macroEnergyDistribution(series) {
  const grams = { protein: 0, carbohydrate: 0, fat: 0 }
  const complete = { protein: series.length > 0, carbohydrate: series.length > 0, fat: series.length > 0 }
  for (const day of series) for (const key of Object.keys(grams)) {
    const value = day.nutrients[key]
    if (value === null || value === undefined || !Number.isFinite(Number(value))) complete[key] = false
    else grams[key] += Number(value)
  }
  for (const key of Object.keys(grams)) if (!complete[key]) grams[key] = null
  const kcal = {
    protein: grams.protein === null ? null : rounded(grams.protein * 4),
    carbohydrate: grams.carbohydrate === null ? null : rounded(grams.carbohydrate * 4),
    fat: grams.fat === null ? null : rounded(grams.fat * 9),
  }
  const totalKcal = Object.values(kcal).some(value => value === null) ? null : rounded(kcal.protein + kcal.carbohydrate + kcal.fat)
  return {
    grams, kcal,
    percent: Object.fromEntries(Object.entries(kcal).map(([key, value]) => [key, totalKcal ? rounded(value / totalKcal * 100, 1) : null])),
    totalKcal, complete,
  }
}
