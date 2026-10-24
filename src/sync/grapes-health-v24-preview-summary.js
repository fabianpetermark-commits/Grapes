// Display-only TEST summary. Never return record payloads, IDs or source IDs.
const knownKinds = new Map([
  ['food_diary', 'Étkezési bejegyzés'],
  ['food_custom', 'Saját étel'],
  ['food_recipe', 'Recept'],
  ['food_recipe_ingredient', 'Recept-hozzávaló'],
  ['nutrient_goal', 'Tápanyagcél'],
  ['yazio_import', 'YAZIO-import'],
  ['water_entry', 'Vízbejegyzés']
])
const blockerNames = new Map([
  ['waterGoal', 'Víz napi cél'],
  ['profile', 'Profiladat'],
  ['recipeLibraries', 'Receptkönyvtár'],
  ['favorites', 'Kedvencek'],
  ['recentFoods', 'Legutóbbi ételek'],
  ['sharingContacts', 'Megosztási kapcsolatok'],
  ['processedShareIds', 'Feldolgozott megosztások'],
  ['settings', 'Ételnapló-beállítások'],
  ['importBatches', 'Importköteg'],
  ['localRecovery', 'Helyi Food-ütközés']
])

export function summarizeV24HealthInventory(capture) {
  if (!Array.isArray(capture?.inventories)) throw new Error('Invalid local inventory')
  const counts = new Map()
  const blockers = new Map()
  let records = 0
  for (const inventory of capture.inventories) {
    if (inventory?.source?.ownerId !== null ||
        !Array.isArray(inventory?.source?.records) ||
        !Array.isArray(inventory?.unmapped)) {
      throw new Error('Only unowned read-only inventories may be summarized')
    }
    for (const row of inventory.source.records) {
      if (!knownKinds.has(row?.kind)) throw new Error('Unknown Health record kind')
      counts.set(row.kind, (counts.get(row.kind) || 0) + 1)
      records += 1
    }
    for (const item of inventory.unmapped) {
      const label = blockerNames.get(item?.field) || 'Egyéb, még nem leképezett adat'
      blockers.set(label, (blockers.get(label) || 0) + 1)
    }
  }
  return {
    sources: capture.inventories.length,
    records,
    ownerClaimRequired: capture.inventories.length > 0,
    counts: [...counts].map(([kind, count]) => ({ label: knownKinds.get(kind), count })),
    blockers: [...blockers].map(([label, count]) => ({ label, count }))
  }
}
