import { UNITS, validateHomeState } from './home-data.js'

export const REPLENISHMENT_ARCHIVE_DAYS = 30
export const DEFAULT_SHOPPING_LIST_ID = 'main'
const DAY_MS = 86_400_000
const normalize = value => String(value ?? '').normalize('NFKC').trim()
  .replace(/\s+/g, ' ').toLocaleLowerCase('hu-HU')

export function replenishKey(name, dimension) {
  return JSON.stringify([normalize(name), dimension])
}

/** This list is suggestions, never a shopping cart. No purchase history
 * averages, invented replenishment targets or inferred negative balances.
 * Only an audited >0 to 0 transition can prove exhaustion. */
export function deriveHomeReplenishment(home, preferences = {}, now = new Date()) {
  const state = validateHomeState(structuredClone(home))
  const nowMs = new Date(now).getTime()
  if (!Number.isFinite(nowMs)) throw new Error('Érvénytelen aktuális dátum.')
  const byKey = new Map()
  for (const lot of state.inventory) {
    const key = replenishKey(lot.name, lot.dimension)
    const entries = byKey.get(key) || []
    entries.push(lot)
    byKey.set(key, entries)
  }
  const dismissed = Array.isArray(preferences.dismissed) ? preferences.dismissed : []
  const result = []
  for (const [key, lots] of byKey) {
    // Any stock remaining means the product is not *confirmed* depleted.
    if (lots.some(lot => !Number.isSafeInteger(lot.quantityBase) || lot.quantityBase > 0)) continue
    const depleted = []
    for (const lot of lots) {
      if (lot.quantityBase !== 0) continue
      let previous = null
      let event = null
      for (const evt of state.events) {
        for (const delta of evt.changes) {
          if (delta.collection !== 'inventory' || delta.id !== lot.id) continue
          if (delta.before?.quantityBase > 0 && delta.after?.quantityBase === 0 &&
              (evt.type === 'CookingConfirmed' || evt.type === 'LotEdited')) {
            previous = delta.before
            event = evt
          } else if (delta.after?.quantityBase > 0 || delta.after == null) {
            previous = null
            event = null
          }
        }
      }
      if (event && previous) {
        // Audited last-acquired confirmed amount, not a learned repeat basket.
        const creation = state.events.flatMap(evt => evt.changes)
          .find(delta => delta.collection === 'inventory' && delta.id === lot.id && delta.before == null)
        const reference = creation?.after?.quantityBase
        if (!Number.isSafeInteger(reference) || reference <= 0) continue
        depleted.push({ lot, event, amount: reference })
      }
    }
    if (!depleted.length || depleted.length !== lots.length) continue
    const latest = depleted.reduce((a, b) =>
      Date.parse(a.event.timestamp) >= Date.parse(b.event.timestamp) ? a : b)
    const cycleId = depleted.map(entry => entry.event.eventId).sort().join('|')
    const stamp = Date.parse(latest.event.timestamp)
    if (!Number.isFinite(stamp)) continue
    const ageDays = Math.max(0, (nowMs - stamp) / DAY_MS)
    const manual = dismissed.some(row => row.key === key && row.cycleId === cycleId)
    const existing = state.shopping.some(row => row.status !== 'checked' &&
      replenishKey(row.name, row.dimension) === key)
    const first = depleted[0].lot
    const base = depleted.reduce((sum, entry) => sum + entry.amount, 0)
    const factor = UNITS[first.displayUnit]?.[1]
    if (!factor || !Number.isSafeInteger(base) || base <= 0) continue
    result.push({
      key, cycleId, name: first.name, dimension: first.dimension,
      quantityBase: base, unit: first.displayUnit, quantity: base / factor,
      date: latest.event.timestamp, archived: ageDays >= REPLENISHMENT_ARCHIVE_DAYS,
      dismissed: manual, alreadyOnList: existing,
      status: manual ? 'dismissed' : ageDays >= REPLENISHMENT_ARCHIVE_DAYS
        ? 'archived' : existing ? 'on-list' : 'active',
    })
  }
  return result.sort((a, b) => b.date.localeCompare(a.date))
}

export function canSuggestAgain(previous, next) {
  return previous.key === next.key && previous.cycleId !== next.cycleId
}
