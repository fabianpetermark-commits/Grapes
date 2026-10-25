import { validateHomeState } from './home-data.js'
import { replenishKey, REPLENISHMENT_ARCHIVE_DAYS } from './home-replenishment.js'

const DAY = 86400000
const validStamp = date => { const ms = Date.parse(date); return Number.isFinite(ms) ? ms : null }
const median = data => { const values = [...data].sort((a,b)=>a-b); return values[Math.floor(values.length/2)] }

/** Suggested lead times, in days, are editorial defaults, NOT a promise of
 * when a household will consume its remaining stock. */
export function purchaseForecastLeadDays(periodDays) {
  if (periodDays <= 4) return 1
  if (periodDays <= 10) return 2
  if (periodDays <= 20) return 3
  if (periodDays <= 45) return 7
  return Math.min(14, Math.max(7, Math.ceil(periodDays * .15)))
}

/** Only explicit 'Megvettem' shopping events count as observed purchases.
 * Checked->planned corrections and reversals cancel the associated purchase.
 * Repeated purchases are NOT evidence of depletion, and contain NO reliable
 * target buying quantity: any proposed quantity remains empty. */
export function derivePurchaseCadenceForecasts(home, preferences = {}, now = new Date()) {
  const state = validateHomeState(structuredClone(home))
  const nowMs = new Date(now).getTime()
  if (!Number.isFinite(nowMs)) throw new Error('Érvénytelen aktuális dátum.')
  const reversed = new Set(state.events.filter(e=>e.type==='Reversed').map(e=>e.reversalOf))
  const purchases = []
  const latestCheckoutByItem = new Map()
  for (const event of state.events) {
    if (event.type !== 'ShoppingItemStatusChanged' || reversed.has(event.eventId)) continue
    for (const delta of event.changes) {
      if (delta.collection !== 'shopping') continue
      const before = delta.before, after = delta.after
      if (before?.status !== 'checked' && after?.status === 'checked') {
        const stamp = validStamp(event.timestamp)
        if (stamp == null || stamp > nowMs || !after?.dimension || !after?.displayUnit) continue
        const checkout = { name: after.name, dimension: after.dimension, unit: after.displayUnit,
          eventId: event.eventId, shoppingId: delta.id, stamp, cancelled: false }
        purchases.push(checkout)
        latestCheckoutByItem.set(delta.id, checkout)
      } else if (before?.status === 'checked' && after?.status !== 'checked') {
        const old = latestCheckoutByItem.get(delta.id)
        if (old) { old.cancelled = true; latestCheckoutByItem.delete(delta.id) }
      }
    }
  }
  const consumedKeys = new Set()
  for (const event of state.events) {
    if (reversed.has(event.eventId)) continue
    if (event.type !== 'CookingConfirmed' && event.type !== 'LotEdited') continue
    for (const delta of event.changes) {
      if (delta.collection === 'inventory' && delta.before?.quantityBase > delta.after?.quantityBase)
        consumedKeys.add(replenishKey(delta.before.name, delta.before.dimension))
    }
  }
  const byKey = new Map()
  for (const checkout of purchases) {
    if (checkout.cancelled) continue
    const k = replenishKey(checkout.name, checkout.dimension)
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(checkout)
  }
  const dismissed = Array.isArray(preferences.dismissed) ? preferences.dismissed : []
  const forecasts = []
  for (const [baseKey, history] of byKey) {
    // If usage is known, the audited stock model takes priority.
    if (consumedKeys.has(baseKey)) continue
    // Same-name goods sold with incompatible units need manual identification.
    const name = history.at(-1).name
    const dimensions = new Set([...byKey.keys()].filter(k => JSON.parse(k)[0] === JSON.parse(baseKey)[0]))
    if (dimensions.size !== 1) continue
    // Multiple trips on one date are not independent consumption cycles.
    const dates = new Map()
    for (const purchase of history) {
      const day = new Date(purchase.stamp).toISOString().slice(0,10)
      dates.set(day, purchase)
    }
    const observations = [...dates.values()].sort((a,b)=>a.stamp-b.stamp)
    if (observations.length < 4) continue // At least three full observed intervals.
    const recent = observations.slice(-6)
    const intervals = recent.slice(1).map((p,i)=>(p.stamp-recent[i].stamp)/DAY)
    const typical = median(intervals)
    if (typical < 1 || typical > 180) continue
    // Suppress irregular/seasonal patterns rather than inventing confidence.
    if (intervals.some(n=> n < 1 || n > 365 || Math.abs(n-typical)>Math.max(2,typical*.4))) continue
    const last = recent.at(-1)
    const leadDays = purchaseForecastLeadDays(typical)
    const dueMs = last.stamp + typical*DAY
    const firstEligible = dueMs-leadDays*DAY
    if (nowMs < firstEligible) continue
    const archived = nowMs >= firstEligible + REPLENISHMENT_ARCHIVE_DAYS*DAY
    const key = 'forecast:' + baseKey
    const cycleId = 'purchase:' + last.eventId
    const excluded = dismissed.some(row=>row.key===key && row.cycleId===cycleId)
    const baseName = JSON.parse(baseKey)[0]
    // Transferred forecast entries can have an intentionally blank quantity/unit.
    const existing = state.shopping.some(item=> item.status !== 'checked' &&
      JSON.parse(replenishKey(item.name,item.dimension))[0] === baseName)
    forecasts.push({ kind:'forecast', key, cycleId, name, dimension:last.dimension,
      quantity:null, quantityBase:null, unit:last.unit, predictedAt:new Date(dueMs).toISOString(),
      advanceDays:leadDays, periodDays:Math.round(typical*10)/10, observations:observations.length,
      date:new Date(firstEligible).toISOString(), archived, dismissed:excluded, alreadyOnList:existing,
      status:excluded?'dismissed':archived?'archived':existing?'on-list':'active' })
  }
  return forecasts.sort((a,b)=>b.date.localeCompare(a.date))
}
