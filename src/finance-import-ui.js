import { create, el } from './ui/dom.js'
import { notifyError, notifySuccess } from './ui/toast.js'
import {
  applyBlockRange, blockPreview, columnLabel, detectFinanceBlocks, markImportDuplicates,
  rangeLabel, readFinanceWorkbook, rowsFromBlock,
} from './finance-import.js'

const TARGETS = [
  ['auto', 'Bevétel/kiadás a Típus oszlopból'],
  ['expense', 'Kiadás'], ['income', 'Bevétel'],
  ['saving-deposit', 'Megtakarítás – félretétel'], ['saving-withdrawal', 'Megtakarítás – kivét'],
]

function option(value, label, selected = false) {
  return create('option', { value, textContent: label, selected })
}

function selectControl(values, selected, ariaLabel) {
  return create('select', { 'aria-label': ariaLabel }, values.map(([value, label]) => option(value, label, String(value) === String(selected))))
}

function field(label, control) {
  return create('label', { class: 'finance__import-field' }, [create('span', { textContent: label }), control])
}

function targetLabel(target) {
  return TARGETS.find(([value]) => value === target)?.[1] || target
}

export function initFinanceImport({
  getTransactions, getSavingsEntries, getPeople, getCategories, getCurrency, onCommit,
}) {
  let model = null
  let blocks = []
  let rows = []
  let stage = 'pick'

  const summary = el('#finance-import-summary')
  const blockHost = el('#finance-import-blocks')
  const previewHost = el('#finance-import-preview')
  const actions = el('#finance-import-actions')
  const reviewButton = el('#finance-import-review')
  const commitButton = el('#finance-import-commit')
  const backButton = el('#finance-import-back')

  function setStep(text) { el('#finance-import-step').textContent = text }

  function reset() {
    model = null; blocks = []; rows = []; stage = 'pick'
    el('#finance-workbook-input').value = ''
    summary.replaceChildren(); blockHost.replaceChildren(); previewHost.replaceChildren()
    actions.hidden = true; reviewButton.hidden = false; commitButton.hidden = true; backButton.hidden = true
    setStep('1. Fájl kiválasztása')
  }

  function peopleOptions(selected = '') {
    return [['', 'Nincs megadva'], ...getPeople().filter((person) => !person.archived).map((person) => [person.id, person.name])]
      .map(([value, label]) => option(value, label, value === selected))
  }

  function categoryOptions(type, selected) {
    const fallback = type === 'income' ? 'Egyéb bevétel' : 'Egyéb kiadás'
    const values = [...new Set([...getCategories(type), selected || fallback])]
    return values.map((value) => option(value, value, value === (selected || fallback)))
  }

  function renderMiniGrid(sheet, block) {
    const table = create('table', { class: 'finance__import-grid' })
    const head = create('tr', {}, [create('th', { textContent: '#' })])
    for (let col = block.startCol; col <= block.endCol; col += 1) {
      const role = col === block.mapping.amountColumn ? 'Összeg' : col === block.mapping.descriptionColumn ? 'Leírás' : col === block.mapping.dateColumn ? 'Dátum' : ''
      head.append(create('th', { textContent: `${columnLabel(col)}${role ? ` · ${role}` : ''}` }))
    }
    table.append(create('thead', {}, [head]))
    const body = create('tbody')
    for (const item of blockPreview(sheet, block, 9)) {
      const tr = create('tr', {}, [create('th', { textContent: String(item.row + 1) })])
      item.cells.forEach((cell, offset) => {
        const col = block.startCol + offset
        const value = cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : String(cell.text ?? cell.value ?? '')
        tr.append(create('td', {
          class: col === block.mapping.amountColumn ? 'is-amount' : col === block.mapping.descriptionColumn ? 'is-description' : col === block.mapping.dateColumn ? 'is-date' : '',
          textContent: value || ' ', title: cell.formula ? `Képlet: ${cell.formula}` : value,
        }))
      })
      body.append(tr)
    }
    table.append(body)
    return create('div', { class: 'finance__import-grid-wrap' }, [table])
  }

  function renderBlocks() {
    stage = 'blocks'; setStep('2. Blokkok és mezők ellenőrzése')
    previewHost.replaceChildren(); blockHost.replaceChildren()
    reviewButton.hidden = false; commitButton.hidden = true; backButton.hidden = true; actions.hidden = false
    summary.replaceChildren(create('strong', { textContent: model.filename }), create('span', {
      textContent: `${model.sheets.length} munkalap, ${blocks.length} felismert blokk. Az összegek ${getCurrency()} pénznemként kerülnek be; átváltás nem történik.`,
    }))
    if (!blocks.length) {
      blockHost.append(create('div', { class: 'finance__import-empty' }, [
        create('strong', { textContent: 'Nem találtam használható adatblokkot.' }),
        create('span', { textContent: 'A fájl lehet üres, vagy túl kevés összefüggő adatot tartalmaz.' }),
      ]))
      reviewButton.disabled = true
      return
    }
    reviewButton.disabled = false
    blocks.forEach((block, blockIndex) => {
      const sheet = model.sheets.find((item) => item.name === block.sheetName)
      const enabled = create('input', { type: 'checkbox', checked: block.enabled, 'aria-label': `${block.sheetName} ${rangeLabel(block)} használata` })
      const rangeInput = create('input', { type: 'text', value: rangeLabel(block), 'aria-label': 'Cellatartomány' })
      const target = selectControl(TARGETS, block.target, 'Importálás célja')
      const month = create('input', { type: 'month', value: block.month, 'aria-label': 'Alapértelmezett hónap' })
      const columns = Array.from({ length: block.endCol - block.startCol + 1 }, (_, index) => {
        const col = block.startCol + index
        return [col, columnLabel(col)]
      })
      const description = selectControl(columns, block.mapping.descriptionColumn, 'Leírás oszlopa')
      const amount = selectControl(columns, block.mapping.amountColumn, 'Összeg oszlopa')
      const date = selectControl([['', 'Nincs – a hónapot használja'], ...columns], block.mapping.dateColumn ?? '', 'Dátum oszlopa')
      const categoryColumn = selectControl([['', 'Nincs – a választott kategória'], ...columns], block.mapping.categoryColumn ?? '', 'Kategória oszlopa')
      const category = create('select', { 'aria-label': 'Alapértelmezett kategória' }, categoryOptions(block.target, block.category))
      const person = create('select', { 'aria-label': 'Alapértelmezett személy' }, peopleOptions(block.personId))
      const controls = create('div', { class: 'finance__import-controls' }, [
        field('Tartomány', rangeInput), field('Cél', target), field('Hónap, ha nincs dátum', month),
        field('Leírás', description), field('Összeg', amount), field('Dátum', date),
        field('Kategória oszlopa', categoryColumn), field('Alapértelmezett kategória', category), field('Személy', person),
      ])
      if (block.target.startsWith('saving-')) category.closest('label').hidden = true
      const card = create('article', { class: `finance__import-block${block.enabled ? '' : ' is-disabled'}` }, [
        create('div', { class: 'finance__import-block-head' }, [
          create('label', { class: 'finance__import-toggle' }, [enabled, create('span', { textContent: `${block.sheetName} · ${rangeLabel(block)}` })]),
          create('small', { textContent: block.month ? `${block.month} felismerve` : 'A hónap ellenőrzése szükséges' }),
        ]), controls, renderMiniGrid(sheet, block),
      ])
      enabled.addEventListener('change', () => { block.enabled = enabled.checked; card.classList.toggle('is-disabled', !block.enabled) })
      rangeInput.addEventListener('change', () => {
        try {
          const updated = applyBlockRange(sheet, block, rangeInput.value)
          Object.assign(updated, { enabled: block.enabled, target: block.target, month: block.month, category: block.category, personId: block.personId })
          blocks[blockIndex] = updated; renderBlocks()
        } catch (error) { rangeInput.value = rangeLabel(block); notifyError(error.message) }
      })
      target.addEventListener('change', () => { block.target = target.value; block.category = target.value === 'income' ? 'Egyéb bevétel' : 'Egyéb kiadás'; renderBlocks() })
      month.addEventListener('change', () => { block.month = month.value })
      description.addEventListener('change', () => { block.mapping.descriptionColumn = Number(description.value); renderBlocks() })
      amount.addEventListener('change', () => { block.mapping.amountColumn = Number(amount.value); renderBlocks() })
      date.addEventListener('change', () => { block.mapping.dateColumn = date.value === '' ? null : Number(date.value); renderBlocks() })
      categoryColumn.addEventListener('change', () => { block.mapping.categoryColumn = categoryColumn.value === '' ? null : Number(categoryColumn.value); renderBlocks() })
      category.addEventListener('change', () => { block.category = category.value })
      person.addEventListener('change', () => { block.personId = person.value })
      blockHost.append(card)
    })
  }

  function renderPreview() {
    stage = 'preview'; setStep('3. Tételek jóváhagyása')
    blockHost.replaceChildren(); previewHost.replaceChildren(); reviewButton.hidden = true; commitButton.hidden = false; backButton.hidden = false
    const selectedCount = rows.filter((row) => row.included && (!row.duplicate || row.duplicateDecision === 'import')).length
    const issueCount = rows.filter((row) => row.errors.length).length
    const duplicateCount = rows.filter((row) => row.duplicate).length
    summary.replaceChildren(create('strong', { textContent: `${rows.length} felismert sor` }), create('span', {
      textContent: `${selectedCount} importálható, ${issueCount} hibás vagy képletes, ${duplicateCount} lehetséges duplikáció.`,
    }))
    const table = create('table', { class: 'finance__import-review-table' })
    table.innerHTML = '<thead><tr><th>Be</th><th>Forrás</th><th>Cél</th><th>Dátum</th><th>Tétel</th><th>Kategória</th><th>Személy</th><th>Összeg</th><th>Állapot</th></tr></thead>'
    const body = create('tbody')
    rows.forEach((row) => {
      const include = create('input', { type: 'checkbox', checked: row.included, disabled: row.errors.length > 0, 'aria-label': `${row.description || 'Hibás sor'} importálása` })
      const category = create('select', { 'aria-label': 'Sor kategóriája' }, categoryOptions(row.target, row.category))
      const person = create('select', { 'aria-label': 'Sor személye' }, peopleOptions(row.personId))
      if (row.target.startsWith('saving-')) category.disabled = true
      let status
      if (row.errors.length) status = create('span', { class: 'finance__import-error', textContent: row.errors.join(', ') })
      else if (row.duplicate) {
        status = selectControl([['', 'Döntés szükséges'], ['import', 'Importálom'], ['skip', 'Kihagyom']], row.duplicateDecision, 'Duplikáció kezelése')
        status.classList.add('finance__import-duplicate')
        status.addEventListener('change', () => { row.duplicateDecision = status.value; row.included = status.value === 'import'; include.checked = row.included; renderPreview() })
      } else status = create('span', { class: 'finance__import-ok', textContent: row.estimatedDate ? 'Becsült dátum' : 'Rendben' })
      include.addEventListener('change', () => {
        row.included = include.checked
        if (row.duplicate) row.duplicateDecision = include.checked ? '' : 'skip'
        renderPreview()
      })
      category.addEventListener('change', () => { row.category = category.value })
      person.addEventListener('change', () => { row.personId = person.value })
      const tr = create('tr', { class: row.errors.length ? 'has-error' : row.duplicate ? 'has-duplicate' : '' })
      const values = [
        include, `${row.sheetName}!${row.sourceRow}`, targetLabel(row.target), row.date || '—', row.description || '—',
        category, person, new Intl.NumberFormat('hu-HU').format(row.amount || 0), status,
      ]
      values.forEach((value) => {
        const td = create('td')
        if (value instanceof Node) td.append(value); else td.textContent = value
        tr.append(td)
      })
      body.append(tr)
    })
    table.append(body)
    previewHost.append(create('div', { class: 'finance__import-review-wrap' }, [table]))
  }

  async function loadFile(file) {
    try {
      setStep('Feldolgozás…')
      model = await readFinanceWorkbook(file)
      blocks = detectFinanceBlocks(model).map((block) => ({
        ...block, category: block.target === 'income' ? 'Egyéb bevétel' : 'Egyéb kiadás', personId: '',
      }))
      renderBlocks()
    } catch (error) { reset(); notifyError(error.message || 'A munkafüzet nem olvasható.') }
  }

  el('#finance-import-pick').addEventListener('click', () => el('#finance-workbook-input').click())
  el('#finance-workbook-input').addEventListener('change', (event) => { const file = event.target.files?.[0]; if (file) loadFile(file) })
  el('#finance-import-reset').addEventListener('click', reset)
  backButton.addEventListener('click', renderBlocks)
  reviewButton.addEventListener('click', () => {
    const enabled = blocks.filter((block) => block.enabled)
    if (!enabled.length) return notifyError('Legalább egy adatblokkot kapcsolj be.')
    rows = markImportDuplicates(enabled.flatMap((block) => rowsFromBlock(model, block, block)), getTransactions(), getSavingsEntries())
    if (!rows.length) return notifyError('A kiválasztott blokkokban nincs importálható sor.')
    renderPreview()
  })
  commitButton.addEventListener('click', async () => {
    const unresolved = rows.filter((row) => row.duplicate && row.duplicateDecision === '')
    if (unresolved.length) return notifyError(`Még ${unresolved.length} lehetséges duplikációról döntened kell.`)
    const selected = rows.filter((row) => row.included && (!row.duplicate || row.duplicateDecision === 'import'))
    if (!selected.length) return notifyError('Nincs jóváhagyott importálandó tétel.')
    commitButton.disabled = true
    try {
      const result = await onCommit(selected)
      notifySuccess(`${result.transactions} tétel és ${result.savings} megtakarítási mozgás importálva.`)
      reset()
    } catch (error) { notifyError(error.message || 'Az importálás nem sikerült.') }
    finally { commitButton.disabled = false }
  })
  reset()
  return { reset, render: () => { if (stage === 'blocks') renderBlocks(); else if (stage === 'preview') renderPreview() } }
}
