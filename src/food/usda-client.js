const retryableStatus = status => status === 429 || status >= 500

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.('retry-after'))
  return Number.isFinite(retryAfter) && retryAfter >= 0
    ? retryAfter * 1000
    : Math.min(250 * 2 ** (attempt - 1), 2000)
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.foods))
    throw new TypeError('A USDA-válasz foods tömbje hiányzik vagy érvénytelen.')
  return payload.foods.map((item, index) => {
    if (!Number.isInteger(item?.fdcId) || typeof item.description !== 'string'
      || typeof item.dataType !== 'string' || !Number.isFinite(item.score)
      || typeof item.foodCategory !== 'string')
      throw new TypeError(`Érvénytelen USDA-jelölt a(z) ${index}. pozíción.`)
    return {
      fdcId: item.fdcId,
      description: item.description,
      dataType: item.dataType,
      foodCategory: item.foodCategory,
      score: item.score,
      nutrients: Array.isArray(item.foodNutrients) ? item.foodNutrients.map(nutrient => ({
        nutrientId: nutrient.nutrientId,
        nutrientName: nutrient.nutrientName,
        unitName: nutrient.unitName,
        value: nutrient.value,
      })) : [],
    }
  })
}

export async function searchUsdaCandidates(query, {
  apiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
  maxAttempts = 3,
  sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  if (!apiKey) throw new Error('USDA_FDC_API_KEY is missing.')
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch megvalósítás hiányzik.')
  let lastError
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl('https://api.nal.usda.gov/fdc/v1/foods/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify({ query, dataType: ['Foundation', 'SR Legacy'], pageSize: 25 }),
        signal: controller.signal,
      })
      if (!response?.ok) {
        const error = new Error(`USDA search failed: HTTP ${response?.status ?? 'unknown'}`)
        error.status = response?.status
        if (!retryableStatus(response?.status) || attempt === maxAttempts) throw error
        await sleepImpl(retryDelay(response, attempt))
        continue
      }
      return validatePayload(await response.json())
    } catch (error) {
      lastError = error
      const retryable = error?.name === 'AbortError' || error?.status == null
      if (!retryable || attempt === maxAttempts) throw error
      await sleepImpl(Math.min(250 * 2 ** (attempt - 1), 2000))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

const normalizedDescription = value => String(value || '').trim().toLocaleLowerCase('en-US')

export function validateUsdaCandidate(candidate, catalogRecord) {
  const errors = []
  if (candidate?.fdcId !== catalogRecord.fdcId) errors.push('fdcId-mismatch')
  if (normalizedDescription(candidate?.description) !== normalizedDescription(catalogRecord.usdaDescription))
    errors.push('description-mismatch')
  if (candidate?.dataType !== catalogRecord.dataType) errors.push('data-type-mismatch')
  if (!Number.isFinite(candidate?.score)) errors.push('missing-score')
  if (!candidate?.foodCategory) errors.push('missing-food-category')
  const description = normalizedDescription(candidate?.description)
  for (const term of catalogRecord.validation?.required || []) {
    if (!description.includes(normalizedDescription(term))) errors.push(`missing:${term}`)
  }
  for (const term of catalogRecord.validation?.forbidden || []) {
    if (description.includes(normalizedDescription(term))) errors.push(`forbidden:${term}`)
  }
  return { valid: errors.length === 0, errors }
}
