/**
 * Preview the same ratio that normalizeRecipe uses when the yield field is
 * missing. Keep unknown/partial inputs blank instead of guessing.
 */
export function suggestedRecipeYield(preparedWeight, averageUnitWeight) {
  if (preparedWeight === '' || preparedWeight === null || preparedWeight === undefined
    || averageUnitWeight === '' || averageUnitWeight === null || averageUnitWeight === undefined) return null
  const weight = Number(preparedWeight)
  const unitWeight = Number(averageUnitWeight)
  if (!Number.isFinite(weight) || !Number.isFinite(unitWeight) || weight <= 0 || unitWeight <= 0) return null
  const yieldCount = Number((weight / unitWeight).toFixed(2))
  return Number.isFinite(yieldCount) && yieldCount > 0 ? yieldCount : null
}
