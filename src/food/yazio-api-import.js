const dayPattern = /^\d{4}-\d{2}-\d{2}$/
export function yazioDateRange(from, to) {
  const parse = value => {
    if (!dayPattern.test(value)) throw new Error('Válassz érvényes időszakot.')
    const date = new Date(value + 'T12:00:00Z')
    if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) throw new Error('Érvénytelen dátum.')
    return date
  }
  const start = parse(from), end = parse(to)
  const length = Math.round((end - start) / 86400000) + 1
  if (length < 1 || length > 366) throw new Error('Egyszerre legfeljebb 366 nap kérhető le.')
  return Array.from({ length }, (_, index) => new Date(+start + index * 86400000).toISOString().slice(0, 10))
}

/** Convert documented per-base-unit API nutrient values into consumed totals. */
export async function readYazioApiBundle({ from, to, request, checkCancelled = () => {}, onProgress = () => {} }) {
  const dates = yazioDateRange(from, to)
  const products = new Map(), rows = [], warnings = [], rawDays = []
  for (const [index, date] of dates.entries()) {
    checkCancelled(); onProgress(`${index + 1}/${dates.length}. nap beolvasása… (${Math.ceil((index + 1) / 31)}/${Math.ceil(dates.length / 31)}. időszak)`)
    const day = await request('day', date)
    checkCancelled()
    if (!Array.isArray(day.products)) throw new Error('A YAZIO naplóformátuma megváltozott; nem történt import.')
    rawDays.push({ date, consumed: day })
    for (const entry of day.products) {
      checkCancelled()
      if (!entry?.id || !entry.product_id || !Number.isFinite(Number(entry.amount)) || Number(entry.amount) <= 0) {
        throw new Error(`${date}: hiányos YAZIO-ételbejegyzés. Nem történt import.`)
      }
      if (!products.has(entry.product_id)) {
        if (products.size >= 2000) throw new Error('Túl sok különböző étel; válassz rövidebb időszakot.')
        products.set(entry.product_id, await request('product', entry.product_id))
      }
      const product = products.get(entry.product_id)
      if (!product?.name || !['g', 'ml'].includes(product.base_unit) || !product.nutrients) {
        throw new Error(`${date}: nem támogatott termékadat vagy mértékegység. Nem történt import.`)
      }
      const row = { date, logged_at: entry.date, meal: entry.daytime, type: 'product',
        entry_id: String(entry.id), source_id: String(entry.product_id), product: product.name, amount: Number(entry.amount) }
      for (const [api, column] of [['energy.energy', 'energy_kcal'], ['nutrient.protein', 'protein_g'], ['nutrient.carb', 'carbs_g'], ['nutrient.fat', 'fat_g'], ['nutrient.fiber', 'fiber_g'], ['nutrient.sugar', 'sugar_g']]) {
        const value = product.nutrients[api]
        if (value != null && (!Number.isFinite(Number(value)) || Number(value) < 0)) throw new Error('Érvénytelen YAZIO-tápérték; nem történt import.')
        row[column] = value == null ? null : Number(value) * row.amount
      }
      rows.push(row)
    }
    // These types have a different nutritional contract. Keep original payloads,
    // explicitly report omissions instead of guessing amounts or silently losing meals.
    for (const [kind, values] of Object.entries(day)) {
      if (kind !== 'products' && Array.isArray(values) && values.length) {
        warnings.push({ message: `${date}: ${values.length} ${kind} bejegyzés nem importálható ebben a verzióban; az eredeti adat megmarad az archívumban.` })
      }
    }
  }
  checkCancelled()
  return { meta: [{ tool_version: '1.0.0', from, to, source: 'grapes-yazio-api' }],
    tables: [{ name: 'nutrition_log' }], nutrition_log: rows, daily_summary: [],
    products: [...products].map(([product_id, value]) => ({ ...value, product_id })),
    raw_days: rawDays, warnings }
}
