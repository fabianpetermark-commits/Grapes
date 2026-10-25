/** Read-only eligibility checks for linking already-saved Food diary entries.
 * Source attribution, original recipe ID, owner and exact normalized units
 * are required; inferred gram-to-portion conversions are not permitted.
 */
export function reviewSavedFoodDiaryEntry(project, ownerId, prepared, entry) {
  if (!project || project.profile?.id !== ownerId || !prepared ||
      !entry || entry.profileId !== ownerId || entry.origin) return null
  const recipe = project.recipes?.find(row => row.id === prepared.recipeRef &&
    row.ownerProfileId === ownerId)
  if (!recipe || !prepared.recipeRef || prepared.portionsRemaining <= 0) return null
  if (entry.snapshot?.source?.type !== 'recipe' ||
      entry.snapshot.source.id !== recipe.id ||
      entry.snapshot.source.attribution !== ownerId ||
      entry.snapshot.foodId !== recipe.foodId) return null
  const unit = prepared.portionUnit || 'serving'
  if (recipe.yieldUnit !== unit || entry.unit !== unit) return null
  const portions = entry.amount
  if (!Number.isSafeInteger(portions) || portions <= 0 ||
      portions > prepared.portionsRemaining) return null
  return { preparedLotId: prepared.id, recipeRef: recipe.id,
    profileId: ownerId, foodEntryId: entry.id, portions, unit }
}

export function eligibleSavedFoodDiaryEntries(project, ownerId, prepared, homeEvents = []) {
  const linked = new Set(homeEvents.filter(event =>
    event.type === 'PreparedConsumptionLinked' && event.sourceType === 'food-diary')
    .map(event => event.sourceId))
  return (project.diaryEntries || []).flatMap(entry => {
    const payload = reviewSavedFoodDiaryEntry(project, ownerId, prepared, entry)
    return payload && !linked.has(`${ownerId}:${entry.id}`)
      ? [{ entryId: entry.id, occurredAt: entry.occurredAt, ...payload }]
      : []
  }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}
