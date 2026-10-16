import test from 'node:test'
import assert from 'node:assert/strict'
import { searchUsdaCandidates, validateUsdaCandidate } from '../src/food/usda-client.js'

const candidate = {
  fdcId: 170000, description: 'Onions, raw', dataType: 'SR Legacy',
  foodCategory: 'Vegetables and Vegetable Products', score: 998.2, foodNutrients: [],
}
const response = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: name => headers[name.toLowerCase()] ?? null },
  json: async () => body,
})

test('a USDA-jelölt megőrzi a relevanciapontot és kategóriát', async () => {
  const results = await searchUsdaCandidates('Onions, raw', {
    apiKey: 'test', fetchImpl: async () => response({ foods: [candidate] }),
  })
  assert.deepEqual(results[0], {
    fdcId: candidate.fdcId, description: candidate.description, dataType: candidate.dataType,
    foodCategory: candidate.foodCategory, score: candidate.score, nutrients: [],
  })
})

test('hiányos JSON és hibás jelölt nem számít sikeres válasznak', async () => {
  await assert.rejects(searchUsdaCandidates('x', {
    apiKey: 'test', maxAttempts: 1, fetchImpl: async () => response({}),
  }), /foods tömbje/)
  await assert.rejects(searchUsdaCandidates('x', {
    apiKey: 'test', maxAttempts: 1, fetchImpl: async () => response({ foods: [{ ...candidate, score: undefined }] }),
  }), /Érvénytelen USDA-jelölt/)
})

test('az üres, de szabályos USDA-találati lista külön kezelhető', async () => {
  assert.deepEqual(await searchUsdaCandidates('x', {
    apiKey: 'test', fetchImpl: async () => response({ foods: [] }),
  }), [])
})

test('429 és 5xx válasz kontrolláltan újrapróbálkozik', async () => {
  const statuses = [429, 503, 200]
  const delays = []
  const results = await searchUsdaCandidates('x', {
    apiKey: 'test', maxAttempts: 3,
    fetchImpl: async () => {
      const status = statuses.shift()
      return response(status === 200 ? { foods: [candidate] } : {}, status, status === 429 ? { 'retry-after': '0' } : {})
    },
    sleepImpl: async delay => delays.push(delay),
  })
  assert.equal(results.length, 1)
  assert.equal(delays.length, 2)
})

test('nem újrapróbálható HTTP-hiba azonnal leáll', async () => {
  let calls = 0
  await assert.rejects(searchUsdaCandidates('x', {
    apiKey: 'test', fetchImpl: async () => { calls++; return response({}, 400) },
  }), /HTTP 400/)
  assert.equal(calls, 1)
})

test('timeout után újrapróbálkozik, majd hibát ad', async () => {
  let calls = 0
  const never = (_url, options) => new Promise((_resolve, reject) => {
    calls++
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
  })
  await assert.rejects(searchUsdaCandidates('x', {
    apiKey: 'test', fetchImpl: never, timeoutMs: 2, maxAttempts: 2, sleepImpl: async () => {},
  }), /aborted/)
  assert.equal(calls, 2)
})

test('a rögzített azonosító, leírás, típus, kategória és állapot együtt validálódik', () => {
  const catalogRecord = {
    fdcId: 170000, usdaDescription: 'Onions, raw', dataType: 'SR Legacy',
    validation: { required: ['onions', 'raw'], forbidden: ['cooked'] },
  }
  assert.deepEqual(validateUsdaCandidate(candidate, catalogRecord), { valid: true, errors: [] })
  const wrong = validateUsdaCandidate({ ...candidate, description: 'Onions, cooked' }, catalogRecord)
  assert.equal(wrong.valid, false)
  assert.ok(wrong.errors.includes('description-mismatch'))
  assert.ok(wrong.errors.includes('forbidden:cooked'))
})
