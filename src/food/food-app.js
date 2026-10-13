import './food.css'
import {
  CORE_NUTRIENTS, MEAL_TYPES, calculateRecipeFood, createEmptyFoodProject, createFoodId, currentTargets,
  entriesForLocalDay, foodBackupFromJson, foodBackupToJson, macroEnergyWarning, normalizeDiaryEntry,
  normalizeFoodItem, normalizeFoodProject, normalizeRecipe, normalizeTargets, summarizeEntries,
} from './food-data.js'
import { searchFoods } from './food-search.js'
import { lookupFatSecretProduct, lookupOpenFoodFactsProduct, searchFatSecretProducts, searchOpenFoodFactsProducts } from './food-api.js'
import { healthImportEntries, prepareHealthBridgeImport } from './food-health-import.js'
import { nutritionSuggestionPer100, recognizeNutritionLabelImage } from './food-label-ocr.js'
import { FOOD_LIBRARY_MODULE, buildRecipeLibrary, copyLibraryRecipeToProject, libraryRole, normalizeRecipeLibrary, sharedFoodsFromLibraries } from './food-library.js'
import { aggregateNutritionSeries, buildDailyNutritionSeries, filterNutritionPeriod, macroEnergyDistribution, nutritionStatistics, targetAchievement } from './food-stats.js'
import { getGrapesAccount, isGrapesDriveConnected, listGrapesProjects, loadGrapesProject, revokeGrapesProjectPermission, saveGrapesProject, shareGrapesProject, updateGrapesProjectPermission } from '../storage/grapes-drive.js'
import { loadLocalProject, saveLocalProject } from '../storage/local-project-store.js'

const MODULE = 'Ételnapló'
const PROJECT_NAME = 'Ételnapló'
const MEAL_LABELS = { breakfast: 'Reggeli', lunch: 'Ebéd', dinner: 'Vacsora', snack: 'Kisétkezés' }
const NUTRIENT_LABELS = { energyKcal: 'Energia', protein: 'Fehérje', carbohydrate: 'Szénhidrát', fat: 'Zsír', fiber: 'Rost', sugar: 'Cukor', saturatedFat: 'Telített zsír', salt: 'Só' }
const NUTRIENT_UNITS = { energyKcal: 'kcal', protein: 'g', carbohydrate: 'g', fat: 'g', fiber: 'g', sugar: 'g', saturatedFat: 'g', salt: 'g' }
const AMOUNT_UNIT_LABELS = { g: 'g', ml: 'ml', serving: 'adag', piece: 'db', slice: 'szelet', package: 'csomag' }

let initialized = false
let root
let project
let profile
let driveFileId = null
let selectedDate = localDate()
let activeTab = 'diary'
let pendingProduct = null
let pendingLabelOcr = null
let recipeIngredients = []
let recipeVariantOf = ''
let saveTimer = null
let pendingHealthImport = null
let modalReturnFocus = null
let barcodeScanTarget = 'foods'
let openFoodFactsResults = []

const $ = selector => root.querySelector(selector)
function localDate(date = new Date()) { const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 10) }
const selectedIsoTime = (time = '12:00', date = selectedDate) => new Date(`${date}T${time || '12:00'}:00`).toISOString()
const formatNumber = (value, digits = 0) => value === null || value === undefined ? '—' : new Intl.NumberFormat('hu-HU', { maximumFractionDigits: digits }).format(value)

function accountProfile() {
  const account = getGrapesAccount() || {}
  return { id: String(account.id || account.email || 'local-food-profile').trim().toLocaleLowerCase('hu-HU'), name: account.name || account.email?.split('@')[0] || 'Google-felhasználó', email: account.email || '', photo: account.photo || '' }
}
const localProjectId = () => `food-tracker-${profile.id}`

function setStatus(message, state = '') { const target = $('#food-save-status'); target.textContent = message; target.dataset.state = state }
async function persistLocal() { await saveLocalProject({ id: localProjectId(), module: MODULE, name: PROJECT_NAME, data: project, driveFileId }); setStatus('Helyben mentve', 'saved') }
function scheduleSave() { project.syncState = { ...project.syncState, localDirty: true }; setStatus('Mentés…', 'saving'); clearTimeout(saveTimer); saveTimer = setTimeout(() => persistLocal().catch(error => setStatus(error.message, 'error')), 350) }
async function saveToDrive() {
  if (!isGrapesDriveConnected()) throw new Error('A Google Drive kapcsolat nem aktív.')
  setStatus('Drive-mentés…', 'saving'); project.syncState = { ...project.syncState, localDirty: false }
  try { driveFileId = await saveGrapesProject({ module: MODULE, name: PROJECT_NAME, data: project, fileId: driveFileId }); await persistLocal(); setStatus('Drive-ra mentve', 'saved') }
  catch (error) { project.syncState.localDirty = true; await persistLocal().catch(() => {}); throw error }
}

function refreshRecipeFoods({ strict = false } = {}) {
  const baseFoods = project.customFoods.filter(food => food.kind !== 'recipe')
  const generated = []
  for (const recipe of project.recipes || []) {
    try { generated.push(calculateRecipeFood(recipe, [...baseFoods, ...generated]).food) }
    catch (error) { if (strict) throw new Error(`${recipe.name}: ${error.message}`) }
  }
  project.customFoods = [...baseFoods, ...generated, ...sharedFoodsFromLibraries(project.recipeLibraries)]
}

async function loadProject() {
  profile = accountProfile()
  const local = await loadLocalProject(localProjectId()).catch(() => null)
  if (local?.data) { project = normalizeFoodProject(local.data, profile.id); driveFileId = local.driveFileId || null } else project = createEmptyFoodProject(profile)
  if (!isGrapesDriveConnected() || (local?.data && project.syncState?.localDirty)) { refreshRecipeFoods(); return }
  try {
    const request = JSON.parse(sessionStorage.getItem('grapes-open-project') || 'null')
    const requestedFileId = request?.module === MODULE ? request.id : null
    const files = requestedFileId ? [{ id: requestedFileId }] : await listGrapesProjects(MODULE)
    const candidate = files.find(file => file.id === driveFileId) || files[0]
    if (!candidate) { refreshRecipeFoods(); return }
    const remote = await loadGrapesProject(candidate.id)
    project = normalizeFoodProject(remote.data, profile.id); project.syncState = { ...project.syncState, localDirty: false }; driveFileId = candidate.id
    refreshRecipeFoods(); await persistLocal()
  } catch (error) { refreshRecipeFoods(); setStatus(`Helyi napló · ${error.message}`, 'error') }
}

function appMarkup() {
  return `
  <header class="food__header"><div class="food__brand"><img src="./grapes-logo.svg" alt=""><div><p>GRAPES · FOOD</p><h1>Ételnapló</h1></div></div><div class="food__header-actions"><span id="food-save-status" class="food__save-status" aria-live="polite">Betöltés…</span><button id="food-health-import" class="btn" type="button">Health import</button><button id="food-backup-export" class="btn" type="button">Mentés export</button><button id="food-backup-import" class="btn" type="button">Mentés visszaállítása</button><button id="food-drive-save" class="btn btn--primary" type="button">Mentés Drive-ra</button><button id="food-back-to-menu-btn" class="btn btn--ghost" type="button">Főmenü</button></div><input id="food-health-input" type="file" accept=".json,application/json" hidden><input id="food-backup-input" type="file" accept=".json,application/json" hidden></header>
  <main class="food__main"><nav class="food__tabs" role="tablist" aria-label="Food modul nézetei"><button id="food-tab-diary" type="button" role="tab" aria-controls="food-panel-diary" data-food-tab="diary" class="is-active">Napló</button><button id="food-tab-foods" type="button" role="tab" aria-controls="food-panel-foods" data-food-tab="foods">Ételek</button><button id="food-tab-recipes" type="button" role="tab" aria-controls="food-panel-recipes" data-food-tab="recipes">Receptek</button><button id="food-tab-libraries" type="button" role="tab" aria-controls="food-panel-libraries" data-food-tab="libraries">Családi könyvtár</button><button id="food-tab-stats" type="button" role="tab" aria-controls="food-panel-stats" data-food-tab="stats">Statisztika</button><button id="food-tab-targets" type="button" role="tab" aria-controls="food-panel-targets" data-food-tab="targets">Célok</button></nav>
  <section id="food-panel-diary" role="tabpanel" aria-labelledby="food-tab-diary" data-food-panel="diary"><div class="food__datebar"><button id="food-date-prev" class="btn" type="button" aria-label="Előző nap">←</button><label>Nap<input id="food-date" type="date"></label><button id="food-date-next" class="btn" type="button" aria-label="Következő nap">→</button><button id="food-date-today" class="btn" type="button">Ma</button></div><div id="food-summary" class="food__summary"></div>
  <form id="food-entry-form" class="food__form food__form--entry"><input id="food-entry-id" type="hidden"><label>Étkezés<select id="food-entry-meal">${MEAL_TYPES.map(type => `<option value="${type}">${MEAL_LABELS[type]}</option>`).join('')}</select></label><label>Étel<select id="food-entry-food" required></select></label><label>Mennyiség<input id="food-entry-amount" type="number" min="0.01" step="0.01" value="100" required></label><label>Egység<select id="food-entry-unit"></select></label><label>Idő<input id="food-entry-time" type="time" required></label><label>Megjegyzés<input id="food-entry-note" maxlength="240" placeholder="opcionális"></label><button class="btn btn--primary" type="submit">Hozzáadás</button><button id="food-entry-cancel" class="btn hidden" type="button">Mégse</button></form><div id="food-meals" class="food__meals"></div></section>
  <section data-food-panel="foods" class="hidden"><div class="food__search"><label>Keresés<input id="food-search" type="search" placeholder="pl. krumpli vagy csirkemel"></label><label>Kategória<select id="food-category-filter"><option value="">Minden kategória</option></select></label><button id="food-scan" class="btn" type="button">Vonalkód fotózása</button><button id="food-label-ocr" class="btn" type="button">Tápértékcímke OCR</button><input id="food-barcode-input" type="file" accept="image/*" capture="environment" hidden><input id="food-label-input" type="file" accept="image/png,image/jpeg,image/webp" capture="environment" hidden></div>
  <form id="food-item-form" class="food__form food__form--food"><input id="food-item-id" type="hidden"><label>Név<input id="food-item-name" required maxlength="180"></label><label>Kategória<input id="food-item-category" value="Egyéb"></label><label>Vonalkód<input id="food-item-barcode" inputmode="numeric" pattern="[0-9]{7,14}"></label><button id="food-lookup" class="btn" type="button">Keresés név vagy vonalkód alapján</button><label>Alapegység<select id="food-item-base-unit"><option value="g">100 g</option><option value="ml">100 ml</option></select></label>${CORE_NUTRIENTS.map(key => `<label>${NUTRIENT_LABELS[key]} / 100 <input id="food-item-${key}" type="number" min="0" step="0.01" placeholder="nincs adat"></label>`).join('')}<label>1 adag mérete<input id="food-item-serving" type="number" min="0.01" step="0.01" placeholder="opcionális"></label><button class="btn btn--primary" type="submit">Étel mentése</button><button id="food-item-cancel" class="btn hidden" type="button">Mégse</button><p id="food-api-status" class="food__form-status" role="status"></p></form><div id="food-items" class="food__items"></div></section>
  <section data-food-panel="recipes" class="hidden"><form id="food-recipe-form" class="food__recipe-form"><input id="food-recipe-id" type="hidden"><div class="food__recipe-basics"><label>Recept neve<input id="food-recipe-name" required maxlength="180"></label><label>Kategória<input id="food-recipe-category" value="Saját recept"></label><label>Kép URL<input id="food-recipe-image" type="url" placeholder="https://…"></label><label>Elkészítés<textarea id="food-recipe-instructions" rows="4"></textarea></label></div><div class="food__ingredient-builder"><h2>Hozzávalók</h2><div><label>Étel<select id="food-recipe-ingredient-food"></select></label><label>Mennyiség<input id="food-recipe-ingredient-amount" type="number" min="0.01" step="0.01" value="100"></label><label>Egység<select id="food-recipe-ingredient-unit"></select></label><button id="food-recipe-add-ingredient" class="btn" type="button">Hozzáadás</button></div><div id="food-recipe-ingredients" class="food__ingredient-list"></div></div><div class="food__recipe-yield"><label>Készétel lemért tömege (g)<input id="food-recipe-prepared-weight" type="number" min="0.01" step="0.01" placeholder="vízveszteség után"></label><label>Hozam<input id="food-recipe-yield-count" type="number" min="0.01" step="0.01" placeholder="pl. 12"></label><label>Hozam egysége<select id="food-recipe-yield-unit"><option value="serving">adag</option><option value="piece">darab</option><option value="slice">szelet</option></select></label><label>Átlagos egységtömeg (g)<input id="food-recipe-unit-weight" type="number" min="0.01" step="0.01" placeholder="opcionális"></label></div><div id="food-recipe-preview" class="food__recipe-preview">Adj hozzá legalább egy hozzávalót.</div><div class="food__recipe-actions"><button class="btn btn--primary" type="submit">Recept mentése</button><button id="food-recipe-cancel" class="btn hidden" type="button">Mégse</button></div></form><div id="food-recipes" class="food__recipes"></div></section>
  <section data-food-panel="stats" class="hidden"><div class="food__stats-controls"><label>Időtáv<select id="food-stats-period"><option value="all">Összes adat</option><option value="7">Utolsó 7 nap</option><option value="30">Utolsó 30 nap</option></select></label><label>Tápanyag<select id="food-stats-nutrient">${CORE_NUTRIENTS.map(key => `<option value="${key}">${NUTRIENT_LABELS[key]}</option>`).join('')}</select></label><label>Összehasonlítás<select id="food-stats-compare"><option value="">Nincs</option>${CORE_NUTRIENTS.map(key => `<option value="${key}">${NUTRIENT_LABELS[key]}</option>`).join('')}</select></label><label>Felbontás<select id="food-stats-granularity"><option value="day">Napi</option><option value="week">Heti</option><option value="month">Havi</option></select></label></div><div id="food-stats-summary" class="food__stats-summary"></div><div class="food__stats-grid"><article class="food__chart-card"><h2>Beviteli trend</h2><div id="food-stats-chart" class="food__chart"></div></article><article class="food__macro-card"><h2>Kalóriaeredet</h2><div id="food-macro-chart"></div></article></div><p id="food-stats-note" class="food__stats-note"></p></section>
  <section data-food-panel="libraries" class="hidden"><div class="food__library-intro"><div><p class="food__eyebrow">KÜLÖN DRIVE-DOKUMENTUM</p><h2>Családi receptkönyvtár</h2><p>Csak recepteket és hozzávalókat oszt meg. A naplód, céljaid és statisztikáid privátak maradnak.</p></div><form id="food-library-create" class="food__library-form"><label>Könyvtár neve<input id="food-library-name" value="Családi receptkönyvtár" maxlength="120" required></label><button class="btn btn--primary" type="submit">Könyvtár létrehozása</button></form><form id="food-library-connect" class="food__library-form"><label>Kapott Drive-fájlazonosító<input id="food-library-file-id" required></label><button class="btn" type="submit">Csatlakoztatás</button></form><div class="food__library-share"><label>Meghívott e-mail<input id="food-library-email" type="email" placeholder="csaladtag@example.com"></label><label>Jogosultság<select id="food-library-role"><option value="reader">Olvasó</option><option value="writer">Szerkesztő</option></select></label></div><p id="food-library-status" class="food__form-status" role="status"></p></div><div id="food-libraries" class="food__libraries"></div></section>
  <section data-food-panel="targets" class="hidden"><form id="food-target-form" class="food__target-card"><div><p class="food__eyebrow">NAPI CÉLÉRTÉKEK</p><h2>Személyes célok</h2><p>Az új értékek a kiválasztott naptól érvényesek; a korábbi napok célja változatlan marad.</p></div><label>Érvényes ettől<input id="food-target-date" type="date" required></label><label>Energia (kcal)<input id="food-target-energy" type="number" min="1" required></label><label>Fehérje (g)<input id="food-target-protein" type="number" min="1"></label><label>Szénhidrát (g)<input id="food-target-carbohydrate" type="number" min="1"></label><label>Zsír (g)<input id="food-target-fat" type="number" min="1"></label><button class="btn btn--primary" type="submit">Célok mentése</button><p id="food-target-warning" class="food__warning" role="status"></p></form></section></main>
  <div id="food-health-preview" class="food__health-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="food-health-title"><section class="food__health-dialog"><div class="food__health-heading"><div><p class="food__eyebrow">HEALTH CONNECT / SAMSUNG HEALTH</p><h2 id="food-health-title">Import előnézete</h2></div><button id="food-health-close" class="btn btn--ghost" type="button" aria-label="Bezárás">Bezárás</button></div><p id="food-health-summary" class="food__health-summary"></p><div id="food-health-records" class="food__health-records"></div><div class="food__health-actions"><button id="food-health-cancel" class="btn" type="button">Mégse</button><button id="food-health-confirm" class="btn btn--primary" type="button">Kijelöltek importálása</button></div></section></div>
  <div id="food-ocr-preview" class="food__health-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="food-ocr-title"><section class="food__health-dialog food__ocr-dialog"><div class="food__health-heading"><div><p class="food__eyebrow">HELYI KÉPFELISMERÉS</p><h2 id="food-ocr-title">Tápértékcímke ellenőrzése</h2></div><button id="food-ocr-close" class="btn btn--ghost" type="button">Bezárás</button></div><p id="food-ocr-warning" class="food__health-summary"></p><div class="food__ocr-grid"><label>Adatok alapja<select id="food-ocr-basis"><option value="per100">100 g / 100 ml</option><option value="serving">Egy adag</option></select></label><label>Alapegység<select id="food-ocr-unit"><option value="g">g</option><option value="ml">ml</option></select></label><label>Adag mérete<input id="food-ocr-serving" type="number" min="0.01" step="0.01" placeholder="csak adagonkénti címkénél"></label>${CORE_NUTRIENTS.map(key => `<label>${NUTRIENT_LABELS[key]} (${NUTRIENT_UNITS[key]})<input id="food-ocr-${key}" type="number" min="0" step="0.01"></label>`).join('')}</div><details><summary>Felismert nyers szöveg</summary><pre id="food-ocr-raw"></pre></details><div class="food__health-actions"><button id="food-ocr-cancel" class="btn" type="button">Mégse</button><button id="food-ocr-apply" class="btn btn--primary" type="button">Értékek átvétele ellenőrzésre</button></div></section></div>`
}

function addDiaryScannerButton() {
  const form = $('#food-entry-form')
  const submit = form.querySelector('button[type="submit"]')
  const button = document.createElement('button')
  button.id = 'food-entry-scan'
  button.className = 'btn'
  button.type = 'button'
  button.textContent = 'Vonalkód fotózása'
  button.setAttribute('aria-label', 'Vonalkód fotózása és kiválasztása naplózáshoz')
  form.insertBefore(button, submit)
}

function addOpenFoodFactsSearchUi() {
  const searchBar = $('.food__search')
  const button = document.createElement('button')
  button.id = 'food-off-search'
  button.className = 'btn'
  button.type = 'button'
  button.textContent = 'Keresés termékadatbázisokban'
  searchBar.insertBefore(button, $('#food-scan'))

  const results = document.createElement('section')
  results.id = 'food-off-results'
  results.className = 'food__off-results hidden'
  results.setAttribute('aria-live', 'polite')
  searchBar.after(results)
}

function renderSummary() {
  const totals = summarizeEntries(entriesForLocalDay(project.diaryEntries, selectedDate, profile.id)); const targets = currentTargets(project, selectedDate)
  $('#food-summary').innerHTML = ['energyKcal', 'protein', 'carbohydrate', 'fat'].map(key => { const value = totals[key]; const target = targets[key]; const ratio = value !== null && target ? Math.min(100, value / target * 100) : 0; return `<article class="food__metric"><span>${NUTRIENT_LABELS[key]}</span><strong>${formatNumber(value, 1)} <small>${NUTRIENT_UNITS[key]}</small></strong><p>${target ? `${formatNumber(target)} ${NUTRIENT_UNITS[key]} cél` : 'Nincs cél beállítva'}</p><i style="--food-progress:${ratio}%"></i></article>` }).join('')
}

function updateUnitSelect(select, food, preferred = '') {
  const previous = preferred || select.value; select.replaceChildren(); if (!food) return
  const units = [{ value: food.baseUnit, label: food.baseUnit }, ...food.servings.map(item => ({ value: item.unit, label: item.name }))]
  for (const unit of units) { const option = document.createElement('option'); option.value = unit.value; option.textContent = unit.label; select.append(option) }
  if (units.some(unit => unit.value === previous)) select.value = previous
}
function updateEntryUnits(preferred = '') { updateUnitSelect($('#food-entry-unit'), project.customFoods.find(food => food.id === $('#food-entry-food').value), preferred) }
function entryFoodOptions() { const select = $('#food-entry-food'); const selected = select.value; select.replaceChildren(); for (const food of searchFoods(project.customFoods, '', { favorites: project.favorites, entries: project.diaryEntries })) { const option = document.createElement('option'); option.value = food.id; option.textContent = food.name; select.append(option) } if ([...select.options].some(option => option.value === selected)) select.value = selected; updateEntryUnits() }

function renderMeals() {
  const container = $('#food-meals'); container.replaceChildren(); const daily = entriesForLocalDay(project.diaryEntries, selectedDate, profile.id)
  for (const type of MEAL_TYPES) {
    const section = document.createElement('section'); section.className = 'food__meal'; const heading = document.createElement('h2'); heading.textContent = MEAL_LABELS[type]; const entries = daily.filter(entry => entry.mealType === type); const badge = document.createElement('span'); badge.textContent = `${formatNumber(summarizeEntries(entries).energyKcal)} kcal`; heading.append(badge); section.append(heading)
    if (!entries.length) { const empty = document.createElement('p'); empty.className = 'food__empty'; empty.textContent = 'Még nincs rögzített étel.'; section.append(empty) }
    for (const entry of entries) { const row = document.createElement('article'); row.className = 'food__entry'; const info = document.createElement('div'); const name = document.createElement('strong'); name.textContent = entry.snapshot.name; const time = new Date(entry.occurredAt).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }); const meta = document.createElement('span'); meta.textContent = `${time} · ${formatNumber(entry.amount, 2)} ${AMOUNT_UNIT_LABELS[entry.unit] || entry.unit} · ${formatNumber(entry.snapshot.nutrients.energyKcal, 1)} kcal${entry.note ? ` · ${entry.note}` : ''}`; info.append(name, meta); const actions = document.createElement('div'); for (const [action, label] of [['edit', 'Szerkesztés'], ['repeat', 'Ismétlés'], ['delete', 'Törlés']]) { const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn--sm'; button.dataset.entryAction = action; button.dataset.entryId = entry.id; button.textContent = label; button.setAttribute('aria-label', `${entry.snapshot.name}: ${label.toLocaleLowerCase('hu-HU')}`); if (action === 'edit' && !project.customFoods.some(food => food.id === entry.snapshot.foodId)) { button.disabled = true; button.title = 'A forrásétel már nem érhető el; a pillanatkép változatlanul megmaradt.' } actions.append(button) } row.append(info, actions); section.append(row) }
    container.append(section)
  }
}

function renderFoodItems() {
  const container = $('#food-items'); container.replaceChildren(); const categorySelect = $('#food-category-filter'); const selectedCategory = categorySelect.value; const categories = [...new Set(project.customFoods.map(food => food.category))].sort((a, b) => a.localeCompare(b, 'hu-HU')); categorySelect.replaceChildren(new Option('Minden kategória', ''), ...categories.map(category => new Option(category, category))); categorySelect.value = categories.includes(selectedCategory) ? selectedCategory : ''
  const results = searchFoods(project.customFoods, $('#food-search').value, { favorites: project.favorites, entries: project.diaryEntries, category: categorySelect.value })
  if (!results.length) { const empty = document.createElement('p'); empty.className = 'food__empty'; empty.textContent = project.customFoods.length ? 'Nincs találat.' : 'Adj hozzá egy saját ételt vagy keress rá egy vonalkódra.'; container.append(empty); return }
  for (const food of results) {
    const row = document.createElement('article'); row.className = 'food__food-row'
    const favorite = document.createElement('button'); favorite.type = 'button'; favorite.className = 'food__favorite'; favorite.dataset.foodFavorite = food.id; favorite.setAttribute('aria-label', `${food.name}: kedvenc állapot váltása`); favorite.setAttribute('aria-pressed', String(project.favorites.includes(food.id))); favorite.textContent = project.favorites.includes(food.id) ? '★' : '☆'
    const info = document.createElement('div'); const name = document.createElement('strong'); name.textContent = food.name; const meta = document.createElement('span')
    meta.textContent = `${food.category} · ${formatNumber(food.nutrients.energyKcal, 1)} kcal / 100 ${food.baseUnit}${food.source.type === 'openfoodfacts' ? ' · Open Food Facts' : food.source.type === 'fatsecret' ? ' · FatSecret' : food.source.type === 'shared-recipe' ? ' · Megosztott recept' : food.kind === 'recipe' ? ' · Saját recept' : ''}`; info.append(name, meta)
    if (food.source.type === 'shared-recipe') {
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'btn btn--sm'; copy.textContent = 'Saját másolat'; copy.dataset.libraryCopyFood = food.id; row.append(favorite, info, copy)
    } else {
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn--sm'; edit.textContent = food.kind === 'recipe' ? 'Recept' : 'Szerkesztés'; if (food.kind === 'recipe') edit.dataset.recipeEdit = food.source.id; else edit.dataset.foodEdit = food.id
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn--sm'; remove.textContent = 'Törlés'; if (food.kind === 'recipe') remove.dataset.recipeDelete = food.source.id; else remove.dataset.foodDelete = food.id
      row.append(favorite, info, edit, remove)
    }
    container.append(row)
  }
}

function renderOpenFoodFactsResults(message = '') {
  const container = $('#food-off-results')
  container.replaceChildren()
  container.classList.remove('hidden')
  if (message) { const status = document.createElement('p'); status.className = 'food__form-status'; status.textContent = message; container.append(status) }
  if (!openFoodFactsResults.length) return
  for (const [index, food] of openFoodFactsResults.entries()) {
    const row = document.createElement('article'); row.className = 'food__off-result'
    if (food.imageUrl) { const image = document.createElement('img'); image.src = food.imageUrl; image.alt = ''; image.loading = 'lazy'; row.append(image) }
    const sourceLabel = food.source.type === 'fatsecret' ? 'FatSecret' : 'Open Food Facts'
    const info = document.createElement('div'); const name = document.createElement('strong'); name.textContent = food.name; const meta = document.createElement('span'); meta.textContent = `${food.category} · ${formatNumber(food.nutrients.energyKcal, 1)} kcal / 100 ${food.baseUnit}${food.barcode ? ` · ${food.barcode}` : ''} · ${sourceLabel}`; info.append(name, meta)
    const exists = project.customFoods.some(item => (food.barcode && item.barcode === food.barcode) || (item.source.type === food.source.type && item.source.id === food.source.id))
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn--sm'; button.dataset.offResult = String(index); button.textContent = exists ? 'Megnyitás' : 'Betöltés'
    row.append(info, button); container.append(row)
  }
}

async function searchOpenFoodFactsByName(queryOverride = '') {
  const button = $('#food-off-search'); const query = typeof queryOverride === 'string' && queryOverride ? queryOverride.trim() : $('#food-search').value.trim()
  button.disabled = true; button.textContent = 'Keresés…'; openFoodFactsResults = []; renderOpenFoodFactsResults('Keresés az Open Food Facts és FatSecret adatbázisban…')
  try {
    const searches = await Promise.allSettled([searchOpenFoodFactsProducts(query), searchFatSecretProducts(query)])
    const successful = searches.filter(result => result.status === 'fulfilled').map(result => result.value)
    if (!successful.length) throw new Error(searches.map(result => result.reason?.message).filter(Boolean).join(' '))
    const seen = new Set()
    openFoodFactsResults = successful.flatMap(result => result.products).filter(product => {
      const key = product.barcode ? `barcode:${product.barcode}` : `${product.source.type}:${product.source.id}`
      if (seen.has(key)) return false
      seen.add(key); return true
    })
    const total = successful.reduce((sum, result) => sum + result.count, 0)
    renderOpenFoodFactsResults(openFoodFactsResults.length ? `${total} találatból az első ${openFoodFactsResults.length}. Válassz egy terméket, majd ellenőrizd és mentsd.` : 'Nem található használható termék ezzel a névvel. Próbálj rövidebb vagy márkanevet is tartalmazó keresést.')
    return true
  } catch (error) { renderOpenFoodFactsResults(error.message); return false }
  finally { button.disabled = false; button.textContent = 'Keresés termékadatbázisokban' }
}

async function lookupProductFromForm() {
  if ($('#food-item-barcode').value.trim()) return lookupBarcode()
  const name = $('#food-item-name').value.trim()
  if (name.length < 2) { report('Adj meg legalább 2 karakteres terméknevet vagy egy 7–14 számjegyű vonalkódot.', 'error'); return }
  $('#food-search').value = name
  renderFoodItems()
  const searched = await searchOpenFoodFactsByName(name)
  if (searched) report('A név szerinti találatokból válaszd ki a megfelelő terméket.')
  $('#food-off-results').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function loadOpenFoodFactsResult(index) {
  const product = openFoodFactsResults[Number(index)]
  if (!product) return
  $('#food-off-results').classList.add('hidden')
  const existing = project.customFoods.find(food => (product.barcode && food.barcode === product.barcode) || (food.source.type === product.source.type && food.source.id === product.source.id))
  if (existing) { fillFoodForm(existing); $('#food-api-status').textContent = 'Ez a vonalkód már szerepel az Ételek között. A meglévő adatokat nyitottam meg.'; return }
  resetFoodForm(); pendingProduct = product
  $('#food-item-name').value = product.name; $('#food-item-category').value = product.category; $('#food-item-barcode').value = product.barcode; $('#food-item-base-unit').value = product.baseUnit
  for (const key of CORE_NUTRIENTS) $(`#food-item-${key}`).value = product.nutrients[key] ?? ''
  const sourceLabel = product.source.type === 'fatsecret' ? 'FatSecret' : 'Open Food Facts'
  $('#food-item-cancel').classList.remove('hidden'); $('#food-api-status').textContent = `${sourceLabel} találat betöltve. Ellenőrizd az adatokat, majd mentsd.`; $('#food-item-form').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function recipeIngredientFoodOptions() { const select = $('#food-recipe-ingredient-food'); const selected = select.value; select.replaceChildren(); for (const food of project.customFoods.filter(item => item.kind !== 'recipe')) { const option = document.createElement('option'); option.value = food.id; option.textContent = food.name; select.append(option) } if ([...select.options].some(option => option.value === selected)) select.value = selected; updateRecipeIngredientUnits() }
function updateRecipeIngredientUnits(preferred = '') { updateUnitSelect($('#food-recipe-ingredient-unit'), project.customFoods.find(food => food.id === $('#food-recipe-ingredient-food').value), preferred) }
function recipeDraft() { const existing = project.recipes.find(item => item.id === $('#food-recipe-id').value); const value = id => $(id).value === '' ? null : Number($(id).value); return { id: existing?.id || createFoodId('recipe'), foodId: existing?.foodId || createFoodId('food'), ownerProfileId: profile.id, variantOfRecipeId: existing?.variantOfRecipeId || recipeVariantOf, name: $('#food-recipe-name').value || 'Névtelen recept', category: $('#food-recipe-category').value, imageUrl: $('#food-recipe-image').value, instructions: $('#food-recipe-instructions').value, ingredients: recipeIngredients, preparedWeight: value('#food-recipe-prepared-weight'), yieldCount: value('#food-recipe-yield-count'), yieldUnit: $('#food-recipe-yield-unit').value, averageUnitWeight: value('#food-recipe-unit-weight'), revision: existing ? existing.revision + 1 : 1, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() } }
function renderRecipePreview() { const target = $('#food-recipe-preview'); if (!recipeIngredients.length) { target.textContent = 'Adj hozzá legalább egy hozzávalót.'; return } try { const result = calculateRecipeFood(recipeDraft(), project.customFoods.filter(item => item.kind !== 'recipe')); target.textContent = `Összesen ${formatNumber(result.totalNutrients.energyKcal, 1)} kcal · ${formatNumber(result.preparedWeight, 1)} g készétel · 100 g: ${formatNumber(result.food.nutrients.energyKcal, 1)} kcal${result.food.servings[0] ? ` · 1 ${result.food.servings[0].name.toLocaleLowerCase('hu-HU')}: ${formatNumber(result.food.servings[0].grams, 1)} g` : ''}`; target.dataset.state = 'valid' } catch (error) { target.textContent = error.message; target.dataset.state = 'error' } }
function renderRecipeIngredients() { const container = $('#food-recipe-ingredients'); container.replaceChildren(); if (!recipeIngredients.length) { const empty = document.createElement('p'); empty.className = 'food__empty'; empty.textContent = 'Még nincs hozzávaló.'; container.append(empty) } for (const ingredient of recipeIngredients) { const food = project.customFoods.find(item => item.id === ingredient.foodId); const row = document.createElement('div'); const text = document.createElement('span'); text.textContent = `${food?.name || 'Hiányzó étel'} · ${formatNumber(ingredient.amount, 2)} ${ingredient.unit}`; const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn--sm'; remove.dataset.recipeIngredientDelete = ingredient.id; remove.textContent = 'Eltávolítás'; row.append(text, remove); container.append(row) } renderRecipePreview() }
function renderRecipes() { recipeIngredientFoodOptions(); renderRecipeIngredients(); const container = $('#food-recipes'); container.replaceChildren(); if (!project.recipes.length) { const empty = document.createElement('p'); empty.className = 'food__empty'; empty.textContent = 'Még nincs saját recept.'; container.append(empty); return } for (const recipe of project.recipes) { const food = project.customFoods.find(item => item.id === recipe.foodId); const parent = project.recipes.find(item => item.id === recipe.variantOfRecipeId); const row = document.createElement('article'); row.className = 'food__recipe-row'; const info = document.createElement('div'); const name = document.createElement('strong'); name.textContent = recipe.name; const meta = document.createElement('span'); meta.textContent = `${recipe.category} · ${formatNumber(food?.nutrients.energyKcal, 1)} kcal / 100 g · ${recipe.ingredients.length} hozzávaló · v${recipe.revision}${parent ? ` · ${parent.name} variánsa` : ''}`; info.append(name, meta); const variant = document.createElement('button'); variant.type = 'button'; variant.className = 'btn btn--sm'; variant.dataset.recipeVariant = recipe.id; variant.textContent = 'Variáns'; const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn--sm'; edit.dataset.recipeEdit = recipe.id; edit.textContent = 'Szerkesztés'; const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn--sm'; remove.dataset.recipeDelete = recipe.id; remove.textContent = 'Törlés'; row.append(info, variant, edit, remove); container.append(row) } }

function libraryLink(id) { return project.recipeLibraries.find(item => item.data?.id === id) }
function setLibraryStatus(message, state = '') { const target = $('#food-library-status'); target.textContent = message; target.dataset.state = state }
function renderLibraries() {
  const container = $('#food-libraries'); container.replaceChildren()
  if (!project.recipeLibraries.length) { const empty = document.createElement('p'); empty.className = 'food__empty'; empty.textContent = 'Még nincs csatlakoztatott családi receptkönyvtár.'; container.append(empty); return }
  for (const link of project.recipeLibraries) {
    let library
    try { library = normalizeRecipeLibrary(link.data) } catch { continue }
    const role = libraryRole(library, profile.email)
    const card = document.createElement('article'); card.className = 'food__library-card'
    const heading = document.createElement('div'); const title = document.createElement('strong'); title.textContent = library.name; const meta = document.createElement('span'); meta.textContent = `${library.recipes.length} recept · ${role === 'owner' ? 'tulajdonos' : role === 'writer' ? 'szerkesztő' : 'olvasó'} · frissítve ${new Date(library.updatedAt).toLocaleString('hu-HU')}`; const code = document.createElement('code'); code.textContent = `Drive-azonosító: ${link.fileId}`; heading.append(title, meta, code)
    const members = document.createElement('div'); members.className = 'food__library-members'
    for (const member of library.members) { const badge = document.createElement('span'); badge.textContent = `${member.email} · ${member.role === 'writer' ? 'szerkesztő' : 'olvasó'}`; if (role === 'owner' && member.permissionId) { const revoke = document.createElement('button'); revoke.type = 'button'; revoke.className = 'btn btn--sm'; revoke.dataset.libraryRevoke = library.id; revoke.dataset.memberEmail = member.email; revoke.textContent = 'Hozzáférés visszavonása'; badge.append(revoke) } members.append(badge) }
    const actions = document.createElement('div')
    const sync = document.createElement('button'); sync.type = 'button'; sync.className = 'btn btn--sm'; sync.dataset.librarySync = library.id; sync.textContent = 'Frissítés Drive-ról'; actions.append(sync)
    if (role === 'owner' || role === 'writer') { const publish = document.createElement('button'); publish.type = 'button'; publish.className = 'btn btn--sm'; publish.dataset.libraryPublish = library.id; publish.textContent = 'Saját receptek publikálása'; actions.append(publish) }
    if (role === 'owner') { const share = document.createElement('button'); share.type = 'button'; share.className = 'btn btn--sm'; share.dataset.libraryShare = library.id; share.textContent = 'Meghívás'; actions.append(share) }
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn--sm'; remove.dataset.libraryRemove = library.id; remove.textContent = 'Leválasztás'; actions.append(remove)
    card.append(heading); if (library.members.length) card.append(members); card.append(actions); container.append(card)
  }
}

async function createFamilyLibrary(event) {
  event.preventDefault()
  if (!project.recipes.length) return setLibraryStatus('Előbb készíts legalább egy saját receptet.', 'error')
  if (!isGrapesDriveConnected()) return setLibraryStatus('A családi könyvtárhoz csatlakoztasd a Google Drive-ot.', 'error')
  try {
    const data = buildRecipeLibrary(project, { name: $('#food-library-name').value, ownerEmail: profile.email })
    const fileId = await saveGrapesProject({ module: FOOD_LIBRARY_MODULE, name: data.name, data })
    project.recipeLibraries.push({ fileId, data }); refreshRecipeFoods(); scheduleSave(); render(); setLibraryStatus(`Könyvtár létrehozva. Megosztási azonosító: ${fileId}`, 'saved')
  } catch (error) { setLibraryStatus(error.message, 'error') }
}

async function connectFamilyLibrary(event) {
  event.preventDefault(); const fileId = $('#food-library-file-id').value.trim()
  if (!isGrapesDriveConnected()) return setLibraryStatus('A könyvtár megnyitásához csatlakoztasd a Google Drive-ot.', 'error')
  try {
    const remote = await loadGrapesProject(fileId)
    if (remote.module !== FOOD_LIBRARY_MODULE) throw new Error('A megadott fájl nem Grapes családi receptkönyvtár.')
    const data = normalizeRecipeLibrary(remote.data); const role = libraryRole(data, profile.email)
    if (role === 'none') throw new Error('Ehhez az e-mail-címhez nincs könyvtári jogosultság.')
    project.recipeLibraries = [...project.recipeLibraries.filter(item => item.data?.id !== data.id), { fileId, data }]
    $('#food-library-file-id').value = ''; refreshRecipeFoods(); scheduleSave(); render(); setLibraryStatus(`${data.name} csatlakoztatva.`, 'saved')
  } catch (error) { setLibraryStatus(error.message, 'error') }
}

async function syncFamilyLibrary(id) {
  const link = libraryLink(id); if (!link) return
  try { const remote = await loadGrapesProject(link.fileId); if (remote.module !== FOOD_LIBRARY_MODULE) throw new Error('A Drive-fájl nem Grapes családi receptkönyvtár.'); const data = normalizeRecipeLibrary(remote.data); if (libraryRole(data, profile.email) === 'none') throw new Error('Ehhez az e-mail-címhez nincs könyvtári jogosultság.'); project.recipeLibraries = project.recipeLibraries.map(item => item === link ? { ...item, data } : item); refreshRecipeFoods(); scheduleSave(); render(); setLibraryStatus(`${data.name} frissítve.`, 'saved') } catch (error) { setLibraryStatus(error.message, 'error') }
}

async function publishFamilyLibrary(id) {
  const link = libraryLink(id); if (!link) return
  try {
    const previous = normalizeRecipeLibrary(link.data); const role = libraryRole(previous, profile.email)
    if (!['owner', 'writer'].includes(role)) throw new Error('Ehhez a könyvtárhoz nincs szerkesztési jogosultságod.')
    const data = buildRecipeLibrary(project, { id: previous.id, name: previous.name, ownerEmail: previous.ownerEmail, members: previous.members, createdAt: previous.createdAt })
    await saveGrapesProject({ module: FOOD_LIBRARY_MODULE, name: data.name, data, fileId: link.fileId })
    project.recipeLibraries = project.recipeLibraries.map(item => item === link ? { ...item, data } : item); refreshRecipeFoods(); scheduleSave(); render(); setLibraryStatus(`${data.name}: ${data.recipes.length} recept publikálva.`, 'saved')
  } catch (error) { setLibraryStatus(error.message, 'error') }
}

async function shareFamilyLibrary(id) {
  const link = libraryLink(id); if (!link) return
  const emailInput = $('#food-library-email'); const targetEmail = emailInput.value.trim().toLocaleLowerCase('hu-HU'); const role = $('#food-library-role').value
  if (!targetEmail || !emailInput.checkValidity()) { emailInput.focus(); return setLibraryStatus('Adj meg egy érvényes meghívotti e-mail-címet.', 'error') }
  if (targetEmail === profile.email.toLocaleLowerCase('hu-HU')) { emailInput.focus(); return setLibraryStatus('A saját tulajdonosi e-mail-címedet nem kell külön meghívni.', 'error') }
  let createdPermissionId = ''
  try {
    const previous = normalizeRecipeLibrary(link.data)
    if (libraryRole(previous, profile.email) !== 'owner') throw new Error('Csak a könyvtár tulajdonosa küldhet meghívást.')
    const current = previous.members.find(member => member.email === targetEmail)
    const permission = current?.permissionId
      ? await updateGrapesProjectPermission(link.fileId, current.permissionId, role)
      : await shareGrapesProject(link.fileId, targetEmail, role)
    if (!current?.permissionId) createdPermissionId = permission.id || ''
    const members = [...previous.members.filter(member => member.email !== targetEmail), { email: targetEmail, role, permissionId: permission.id || current?.permissionId }]
    const data = normalizeRecipeLibrary({ ...previous, members, updatedAt: new Date().toISOString() })
    await saveGrapesProject({ module: FOOD_LIBRARY_MODULE, name: data.name, data, fileId: link.fileId })
    project.recipeLibraries = project.recipeLibraries.map(item => item === link ? { ...item, data } : item); scheduleSave(); renderLibraries(); setLibraryStatus(`Meghívás elküldve: ${targetEmail} (${role === 'writer' ? 'szerkesztő' : 'olvasó'}).`, 'saved')
  } catch (error) { if (createdPermissionId) await revokeGrapesProjectPermission(link.fileId, createdPermissionId).catch(() => {}); setLibraryStatus(error.message, 'error') }
}

async function revokeFamilyMember(id, memberEmail) {
  const link = libraryLink(id); if (!link) return
  try {
    const previous = normalizeRecipeLibrary(link.data)
    if (libraryRole(previous, profile.email) !== 'owner') throw new Error('Csak a könyvtár tulajdonosa vonhat vissza hozzáférést.')
    const member = previous.members.find(item => item.email === memberEmail)
    if (!member?.permissionId) throw new Error('A Drive-jogosultság azonosítója nem érhető el.')
    await revokeGrapesProjectPermission(link.fileId, member.permissionId)
    const data = normalizeRecipeLibrary({ ...previous, members: previous.members.filter(item => item.email !== memberEmail), updatedAt: new Date().toISOString() })
    try { await saveGrapesProject({ module: FOOD_LIBRARY_MODULE, name: data.name, data, fileId: link.fileId }) }
    catch { project.recipeLibraries = project.recipeLibraries.map(item => item === link ? { ...item, data } : item); scheduleSave(); renderLibraries(); setLibraryStatus(`${memberEmail} Drive-hozzáférése visszavonva, de a könyvtári metaadat Drive-mentését újra kell próbálni.`, 'error'); return }
    project.recipeLibraries = project.recipeLibraries.map(item => item === link ? { ...item, data } : item); scheduleSave(); renderLibraries(); setLibraryStatus(`${memberEmail} hozzáférése visszavonva.`, 'saved')
  } catch (error) { setLibraryStatus(error.message, 'error') }
}

function detachFamilyLibrary(id) { const prefix = `shared:${id}:`; project.recipeLibraries = project.recipeLibraries.filter(item => item.data?.id !== id); project.favorites = project.favorites.filter(foodId => !foodId.startsWith(prefix)); refreshRecipeFoods(); scheduleSave(); render(); setLibraryStatus('A könyvtár leválasztva; a Drive-fájl és a családtagok hozzáférése nem változott.', 'saved') }
function copySharedRecipe(foodId) {
  const food = project.customFoods.find(item => item.id === foodId && item.source.type === 'shared-recipe'); if (!food) return
  const link = project.recipeLibraries.find(item => food.id.startsWith(`shared:${item.data?.id}:`)); if (!link) return
  try { const copied = copyLibraryRecipeToProject(link.data, food.source.id, profile.id); project.customFoods.push(...copied.foods); project.recipes.push(copied.recipe); refreshRecipeFoods(); scheduleSave(); render(); setStatus('A megosztott recept saját, szerkeszthető másolatként elkészült.', 'saved') } catch (error) { setStatus(error.message, 'error') }
}

function renderStats() {
  const nutrient = $('#food-stats-nutrient').value
  const compare = $('#food-stats-compare').value
  const series = filterNutritionPeriod(buildDailyNutritionSeries(project.diaryEntries, profile.id), $('#food-stats-period').value, localDate())
  const stats = nutritionStatistics(series, nutrient); const achievement = targetAchievement(series, project, nutrient)
  $('#food-stats-summary').innerHTML = [
    ['Napi átlag', stats.average, NUTRIENT_UNITS[nutrient]], ['Minimum', stats.min, NUTRIENT_UNITS[nutrient]], ['Maximum', stats.max, NUTRIENT_UNITS[nutrient]],
    ['Összes bevitel', stats.total, NUTRIENT_UNITS[nutrient]], ['Naplózott nap', stats.loggedDays, 'nap'], ['Célt teljesítő nap', achievement.percent, '%'],
  ].map(([label, value, unit]) => `<article><span>${label}</span><strong>${formatNumber(value, 1)} <small>${unit}</small></strong></article>`).join('')
  const primary = aggregateNutritionSeries(series, nutrient, $('#food-stats-granularity').value)
  const secondary = compare ? aggregateNutritionSeries(series, compare, $('#food-stats-granularity').value) : []
  const primaryMax = Math.max(1, ...primary.map(item => item.value || 0)); const secondaryMax = Math.max(1, ...secondary.map(item => item.value || 0))
  const chart = $('#food-stats-chart'); chart.replaceChildren()
  if (!primary.length) { const empty = document.createElement('p'); empty.className = 'food__empty'; empty.textContent = 'A kiválasztott időszakban nincs naplózott adat.'; chart.append(empty) }
  for (let index = 0; index < primary.length; index += 1) {
    const item = primary[index]; const column = document.createElement('div'); column.className = 'food__chart-column'; const bars = document.createElement('div'); bars.className = 'food__chart-bars'
    const bar = document.createElement('i'); bar.style.setProperty('--bar-height', `${item.value === null ? 0 : item.value / primaryMax * 100}%`); bar.title = `${NUTRIENT_LABELS[nutrient]}: ${formatNumber(item.value, 1)} ${NUTRIENT_UNITS[nutrient]}`; bars.append(bar)
    if (compare) { const compareBar = document.createElement('i'); compareBar.className = 'is-compare'; compareBar.style.setProperty('--bar-height', `${secondary[index]?.value === null ? 0 : (secondary[index]?.value || 0) / secondaryMax * 100}%`); compareBar.title = `${NUTRIENT_LABELS[compare]}: ${formatNumber(secondary[index]?.value, 1)} ${NUTRIENT_UNITS[compare]}`; bars.append(compareBar) }
    const label = document.createElement('span'); label.textContent = item.key; column.append(bars, label); chart.append(column)
  }
  const macro = macroEnergyDistribution(series); const proteinEnd = macro.percent.protein || 0; const carbEnd = proteinEnd + (macro.percent.carbohydrate || 0)
  $('#food-macro-chart').innerHTML = `<div class="food__donut" style="--protein:${proteinEnd}%;--carb:${carbEnd}%"><strong>${formatNumber(macro.totalKcal)}<small> kcal</small></strong></div><div class="food__macro-legend"><span><i></i>Fehérje ${formatNumber(macro.percent.protein, 1)}% · ${formatNumber(macro.kcal.protein)} kcal</span><span><i></i>Szénhidrát ${formatNumber(macro.percent.carbohydrate, 1)}% · ${formatNumber(macro.kcal.carbohydrate)} kcal</span><span><i></i>Zsír ${formatNumber(macro.percent.fat, 1)}% · ${formatNumber(macro.kcal.fat)} kcal</span></div>`
  const notes = []
  if (stats.incompleteDays) notes.push(`${stats.incompleteDays} napnál hiányzik a kiválasztott tápanyag; az átlag csak a rendelkezésre álló napokból készült.`)
  if (Object.values(macro.complete).some(value => !value)) notes.push('A makrómegoszlás hiányos tápértékű napokat is tartalmazhat, ezért óvatosan értelmezd.')
  $('#food-stats-note').textContent = notes.join(' ')
}

function targetFormValues() { const value = id => $(id).value === '' ? null : Number($(id).value); return { energyKcal: value('#food-target-energy'), protein: value('#food-target-protein'), carbohydrate: value('#food-target-carbohydrate'), fat: value('#food-target-fat') } }
function renderTargetWarning() { const warning = macroEnergyWarning(targetFormValues()); $('#food-target-warning').textContent = warning ? `A makrókból számolt ${formatNumber(warning.calculatedKcal)} kcal eltér az energiacéltól (${formatNumber(warning.differenceKcal)} kcal). Ettől még menthető.` : '' }
function renderTargets() { const targets = currentTargets(project, selectedDate); $('#food-target-date').value = selectedDate; for (const key of ['energyKcal', 'protein', 'carbohydrate', 'fat']) $(`#food-target-${key === 'energyKcal' ? 'energy' : key}`).value = targets[key] ?? ''; renderTargetWarning() }
function render() {
  $('#food-date').value = selectedDate
  for (const button of root.querySelectorAll('[data-food-tab]')) {
    const selected = button.dataset.foodTab === activeTab
    button.classList.toggle('is-active', selected)
    button.setAttribute('aria-selected', String(selected))
    button.tabIndex = selected ? 0 : -1
  }
  for (const panel of root.querySelectorAll('[data-food-panel]')) {
    const selected = panel.dataset.foodPanel === activeTab
    panel.id = `food-panel-${panel.dataset.foodPanel}`
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-labelledby', `food-tab-${panel.dataset.foodPanel}`)
    panel.classList.toggle('hidden', !selected)
  }
  entryFoodOptions(); renderSummary(); renderMeals(); renderFoodItems(); renderRecipes(); renderLibraries(); renderStats(); renderTargets()
}

function resetEntryForm() { $('#food-entry-form').reset(); $('#food-entry-id').value = ''; $('#food-entry-amount').value = 100; $('#food-entry-time').value = new Date().toTimeString().slice(0, 5); $('#food-entry-cancel').classList.add('hidden'); updateEntryUnits() }
function resetFoodForm() { $('#food-item-form').reset(); $('#food-item-id').value = ''; $('#food-item-category').value = 'Egyéb'; $('#food-item-base-unit').value = 'g'; $('#food-item-cancel').classList.add('hidden'); pendingProduct = null; $('#food-api-status').textContent = '' }
function resetRecipeForm() { $('#food-recipe-form').reset(); $('#food-recipe-id').value = ''; $('#food-recipe-category').value = 'Saját recept'; recipeIngredients = []; recipeVariantOf = ''; $('#food-recipe-cancel').classList.add('hidden'); renderRecipeIngredients() }
function shiftDate(days) { const date = new Date(`${selectedDate}T12:00:00`); date.setDate(date.getDate() + days); selectedDate = localDate(date); render() }

function saveEntry(event) { event.preventDefault(); const food = project.customFoods.find(item => item.id === $('#food-entry-food').value); if (!food) return setStatus('Előbb adj hozzá egy ételt.', 'error'); try { const existingId = $('#food-entry-id').value; const previous = project.diaryEntries.find(item => item.id === existingId); const entry = normalizeDiaryEntry({ id: existingId || createFoodId('entry'), profileId: profile.id, mealType: $('#food-entry-meal').value, amount: $('#food-entry-amount').value, unit: $('#food-entry-unit').value, servingId: food.servings.find(item => item.unit === $('#food-entry-unit').value)?.id || '', note: $('#food-entry-note').value, occurredAt: selectedIsoTime($('#food-entry-time').value), createdAt: previous?.createdAt || new Date().toISOString() }, food); project.diaryEntries = existingId ? project.diaryEntries.map(item => item.id === existingId ? entry : item) : [...project.diaryEntries, entry]; project.recentFoods = [food.id, ...project.recentFoods.filter(id => id !== food.id)].slice(0, 50); resetEntryForm(); scheduleSave(); render() } catch (error) { setStatus(error.message, 'error') } }
function handleEntryAction(action, id) { const entry = project.diaryEntries.find(item => item.id === id); if (!entry) return; if (action === 'delete') { if (confirm('Törlöd ezt a naplóbejegyzést?')) { project.diaryEntries = project.diaryEntries.filter(item => item.id !== id); scheduleSave(); render() }; return } if (action === 'repeat') { project.diaryEntries.push(normalizeDiaryEntry({ ...entry, id: createFoodId('entry'), occurredAt: selectedIsoTime(new Date().toTimeString().slice(0, 5)), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })); scheduleSave(); render(); return } if (action !== 'edit') return; const food = project.customFoods.find(item => item.id === entry.snapshot.foodId); if (!food) return setStatus('A bejegyzés forrásétele már nem érhető el, ezért nem szerkeszthető. Ismételni vagy törölni továbbra is lehet.', 'error'); $('#food-entry-id').value = entry.id; $('#food-entry-meal').value = entry.mealType; $('#food-entry-food').value = food.id; $('#food-entry-amount').value = entry.amount; updateEntryUnits(entry.unit); $('#food-entry-time').value = new Date(entry.occurredAt).toTimeString().slice(0, 5); $('#food-entry-note').value = entry.note; $('#food-entry-cancel').classList.remove('hidden'); $('#food-entry-form').scrollIntoView({ behavior: 'smooth', block: 'center' }) }

function saveFood(event) { event.preventDefault(); const previousFoods = project.customFoods; let recalculatingRecipes = false; try { const existingId = $('#food-item-id').value; const previous = project.customFoods.find(item => item.id === existingId); const servingSize = Number($('#food-item-serving').value); const baseUnit = $('#food-item-base-unit').value; const item = normalizeFoodItem({ ...pendingProduct, id: existingId || createFoodId('food'), kind: pendingProduct?.kind || previous?.kind || 'manual', name: $('#food-item-name').value, category: $('#food-item-category').value, barcode: $('#food-item-barcode').value, baseUnit, nutrients: Object.fromEntries(CORE_NUTRIENTS.map(key => [key, $(`#food-item-${key}`).value])), servings: servingSize > 0 ? [{ id: previous?.servings?.[0]?.id || createFoodId('serving'), name: 'Adag', unit: 'serving', ...(baseUnit === 'g' ? { grams: servingSize } : { milliliters: servingSize }) }] : [], source: pendingProduct?.source || previous?.source || { type: 'manual' }, createdAt: previous?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }); project.customFoods = existingId ? project.customFoods.map(food => food.id === existingId ? item : food) : [...project.customFoods, item]; recalculatingRecipes = true; refreshRecipeFoods({ strict: true }); resetFoodForm(); scheduleSave(); render() } catch (error) { project.customFoods = previousFoods; $('#food-api-status').textContent = recalculatingRecipes ? `Az étel nem menthető, mert egy recept érvénytelenné válna. ${error.message}` : error.message } }
function fillFoodForm(food) { if (!food) return; $('#food-item-id').value = food.id; $('#food-item-name').value = food.name; $('#food-item-category').value = food.category; $('#food-item-barcode').value = food.barcode; $('#food-item-base-unit').value = food.baseUnit; for (const key of CORE_NUTRIENTS) $(`#food-item-${key}`).value = food.nutrients[key] ?? ''; $('#food-item-serving').value = food.baseUnit === 'g' ? food.servings[0]?.grams || '' : food.servings[0]?.milliliters || ''; pendingProduct = { kind: food.kind, source: food.source }; $('#food-item-cancel').classList.remove('hidden'); $('#food-item-form').scrollIntoView({ behavior: 'smooth', block: 'start' }) }

function deleteFoodItem(id) {
  const food = project.customFoods.find(item => item.id === id && item.kind !== 'recipe')
  if (!food) return
  const usedBy = project.recipes.filter(recipe => recipe.ingredients.some(ingredient => ingredient.foodId === id))
  if (usedBy.length) {
    $('#food-api-status').textContent = `Nem törölhető: ${usedBy.map(recipe => recipe.name).join(', ')} recept használja. Előbb módosítsd vagy töröld ezeket a recepteket.`
    return
  }
  if (!confirm('Törlöd ezt a saját ételt? A korábbi naplóbejegyzések megmaradnak.')) return
  project.customFoods = project.customFoods.filter(item => item.id !== id)
  project.favorites = project.favorites.filter(foodId => foodId !== id)
  project.recentFoods = project.recentFoods.filter(foodId => foodId !== id)
  scheduleSave(); render()
}

function addRecipeIngredient() { const food = project.customFoods.find(item => item.id === $('#food-recipe-ingredient-food').value); const amount = Number($('#food-recipe-ingredient-amount').value); if (!food || !Number.isFinite(amount) || amount <= 0) { $('#food-recipe-preview').textContent = 'Válassz ételt és adj meg érvényes mennyiséget.'; return } const unit = $('#food-recipe-ingredient-unit').value; recipeIngredients.push({ id: createFoodId('ingredient'), foodId: food.id, amount, unit, servingId: food.servings.find(item => item.unit === unit)?.id || '' }); renderRecipeIngredients() }
function saveRecipe(event) { event.preventDefault(); try { const draft = { ...recipeDraft(), name: $('#food-recipe-name').value }; const recipe = normalizeRecipe(draft); const result = calculateRecipeFood(recipe, project.customFoods.filter(item => item.kind !== 'recipe')); const exists = project.recipes.some(item => item.id === recipe.id); project.recipes = exists ? project.recipes.map(item => item.id === recipe.id ? recipe : item) : [...project.recipes, recipe]; project.customFoods = [...project.customFoods.filter(item => item.id !== recipe.foodId), result.food]; resetRecipeForm(); scheduleSave(); render() } catch (error) { $('#food-recipe-preview').textContent = error.message; $('#food-recipe-preview').dataset.state = 'error' } }
function fillRecipeForm(recipe, { asVariant = false } = {}) { if (!recipe) return; activeTab = 'recipes'; render(); $('#food-recipe-id').value = asVariant ? '' : recipe.id; $('#food-recipe-name').value = asVariant ? `${recipe.name} – variáns` : recipe.name; $('#food-recipe-category').value = recipe.category; $('#food-recipe-image').value = recipe.imageUrl; $('#food-recipe-instructions').value = recipe.instructions; $('#food-recipe-prepared-weight').value = recipe.preparedWeight ?? ''; $('#food-recipe-yield-count').value = recipe.yieldCount ?? ''; $('#food-recipe-yield-unit').value = recipe.yieldUnit; $('#food-recipe-unit-weight').value = recipe.averageUnitWeight ?? ''; recipeVariantOf = asVariant ? recipe.id : recipe.variantOfRecipeId; recipeIngredients = recipe.ingredients.map(item => ({ ...item, id: asVariant ? createFoodId('ingredient') : item.id })); $('#food-recipe-cancel').classList.remove('hidden'); renderRecipeIngredients(); $('#food-recipe-form').scrollIntoView({ behavior: 'smooth', block: 'start' }) }
function editRecipe(id) { fillRecipeForm(project.recipes.find(item => item.id === id)) }
function createRecipeVariant(id) { fillRecipeForm(project.recipes.find(item => item.id === id), { asVariant: true }) }
function deleteRecipe(id) { const recipe = project.recipes.find(item => item.id === id); if (!recipe || !confirm('Törlöd ezt a receptet? A korábbi naplóbejegyzések megmaradnak.')) return; project.recipes = project.recipes.filter(item => item.id !== id).map(item => item.variantOfRecipeId === id ? { ...item, variantOfRecipeId: recipe.variantOfRecipeId || '' } : item); project.customFoods = project.customFoods.filter(item => item.id !== recipe.foodId); project.favorites = project.favorites.filter(item => item !== recipe.foodId); scheduleSave(); render() }

function selectFoodForDiary(food, saved) {
  activeTab = 'diary'; render()
  $('#food-entry-food').value = food.id
  $('#food-entry-amount').value = 100
  updateEntryUnits(food.baseUnit)
  $('#food-entry-amount').focus()
  $('#food-entry-form').scrollIntoView({ behavior: 'smooth', block: 'center' })
  setStatus(saved ? `${food.name} elmentve az Ételek közé · add meg a mennyiséget a naplózáshoz` : `${food.name} már szerepel az Ételek között · kiválasztva naplózáshoz`, 'saved')
}

function saveScannedProductForDiary(product) {
  const existing = project.customFoods.find(food => food.barcode && food.barcode === product.barcode)
  if (existing) { pendingProduct = null; selectFoodForDiary(existing, false); return }
  const now = new Date().toISOString()
  const food = normalizeFoodItem({ ...product, id: createFoodId('food'), servings: [], createdAt: now, updatedAt: now })
  project.customFoods = [...project.customFoods, food]
  refreshRecipeFoods({ strict: true })
  pendingProduct = null
  scheduleSave()
  selectFoodForDiary(food, true)
}

async function lookupBarcode({ forDiary = false } = {}) {
  const status = $('#food-api-status')
  const report = (message, state = '') => forDiary ? setStatus(message, state) : status.textContent = message
  report('Termék keresése…', 'saving')
  try {
    const barcode = $('#food-item-barcode').value
    try { pendingProduct = await lookupOpenFoodFactsProduct(barcode) }
    catch (openFoodFactsError) {
      try { pendingProduct = await lookupFatSecretProduct(barcode) }
      catch (fatSecretError) {
        if (/Nem található termék/.test(openFoodFactsError.message) && /nincs konfigurálva/.test(fatSecretError.message)) throw openFoodFactsError
        throw new Error(`A termék egyik adatbázisban sem található. ${fatSecretError.message}`)
      }
    }
    if (forDiary) { saveScannedProductForDiary(pendingProduct); return }
    const existing = project.customFoods.find(food => (pendingProduct.barcode && food.barcode === pendingProduct.barcode) || (food.source.type === pendingProduct.source.type && food.source.id === pendingProduct.source.id))
    if (existing) { pendingProduct = null; fillFoodForm(existing); report('Ez a vonalkód már szerepel az Ételek között. A meglévő adatokat nyitottam meg.'); return }
    $('#food-item-name').value = pendingProduct.name; $('#food-item-category').value = pendingProduct.category; $('#food-item-base-unit').value = pendingProduct.baseUnit
    for (const key of CORE_NUTRIENTS) $(`#food-item-${key}`).value = pendingProduct.nutrients[key] ?? ''
    report(`${pendingProduct.source.type === 'fatsecret' ? 'FatSecret' : 'Open Food Facts'} találat betöltve. Ellenőrizd, majd mentsd.`)
  } catch (error) {
    const message = /Nem található termék/.test(error.message) ? `${error.message} Keress rá név vagy márka alapján az Ételek fülön, vagy rögzítsd kézzel.` : error.message
    report(message, 'error')
  }
}
async function barcodeImageSource(file) {
  if ('createImageBitmap' in window) return { source: await createImageBitmap(file), release(source) { source.close?.() } }
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.src = url
  await image.decode()
  return { source: image, release() { URL.revokeObjectURL(url) } }
}

async function selectBarcodePhoto(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const forDiary = barcodeScanTarget === 'diary'
  const status = $('#food-api-status')
  const report = (message, state = '') => forDiary ? setStatus(message, state) : status.textContent = message
  if (!('BarcodeDetector' in window)) {
    report('A fotós vonalkódfelismerés ezen a böngészőn nem támogatott. Az Ételek fülön írd be kézzel a kódot.', 'error')
    if (!forDiary) $('#food-item-barcode').focus()
    return
  }
  if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024) {
    report('Legfeljebb 12 MB-os képet készíts vagy válassz.', 'error')
    return
  }
  report('Vonalkód keresése a fotón…', 'saving')
  let image
  try {
    image = await barcodeImageSource(file)
    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
    const codes = await detector.detect(image.source)
    const rawValue = String(codes[0]?.rawValue || '').replace(/\D/g, '')
    if (!/^\d{7,14}$/.test(rawValue)) throw new Error('A fotón nem található olvasható EAN/UPC vonalkód. Fotózd le közelebbről, jó fényben.')
    $('#food-item-barcode').value = rawValue
    report(`${rawValue} beolvasva · termék keresése…`, 'saving')
    await lookupBarcode({ forDiary })
  } catch (error) {
    report(error.message || 'A vonalkód felismerése nem sikerült.', 'error')
    if (!forDiary) $('#food-item-barcode').focus()
  } finally {
    image?.release(image.source)
    barcodeScanTarget = 'foods'
  }
}
function restoreModalFocus() { const target = modalReturnFocus; modalReturnFocus = null; target?.isConnected && target.focus() }
function closeLabelOcr() { pendingLabelOcr = null; $('#food-ocr-preview').classList.add('hidden'); restoreModalFocus() }
function renderLabelOcr() {
  if (!pendingLabelOcr) return
  $('#food-ocr-basis').value = pendingLabelOcr.basis.type
  $('#food-ocr-unit').value = pendingLabelOcr.basis.baseUnit
  $('#food-ocr-serving').value = pendingLabelOcr.basis.type === 'serving' ? pendingLabelOcr.basis.amount ?? '' : ''
  for (const key of CORE_NUTRIENTS) $(`#food-ocr-${key}`).value = pendingLabelOcr.nutrients[key] ?? ''
  $('#food-ocr-warning').textContent = pendingLabelOcr.warnings.length ? pendingLabelOcr.warnings.join(' ') : `${pendingLabelOcr.found} érték felismerve. Ellenőrizd őket a fotó alapján.`
  $('#food-ocr-raw').textContent = pendingLabelOcr.rawText
  $('#food-ocr-preview').classList.remove('hidden')
  $('#food-ocr-close').focus()
}
async function selectNutritionLabel(event) {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
  if (!/^image\/(?:png|jpeg|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) { setStatus('PNG, JPEG vagy WebP képet válassz, legfeljebb 8 MB méretben.', 'error'); restoreModalFocus(); return }
  const button = $('#food-label-ocr'); button.disabled = true; button.textContent = 'OCR előkészítése…'
  try {
    pendingLabelOcr = await recognizeNutritionLabelImage(file, progress => { button.textContent = `OCR ${Math.round(progress * 100)}%` })
    renderLabelOcr()
  } catch (error) { setStatus(`A címke felismerése nem sikerült: ${error.message}`, 'error'); restoreModalFocus() }
  finally { button.disabled = false; button.textContent = 'Tápértékcímke OCR' }
}
function applyLabelOcr() {
  if (!pendingLabelOcr) return
  try {
    const suggestion = { ...pendingLabelOcr, nutrients: Object.fromEntries(CORE_NUTRIENTS.map(key => [key, $(`#food-ocr-${key}`).value === '' ? null : Number($(`#food-ocr-${key}`).value)])) }
    const converted = nutritionSuggestionPer100(suggestion, { basisType: $('#food-ocr-basis').value, baseUnit: $('#food-ocr-unit').value, servingAmount: $('#food-ocr-serving').value })
    $('#food-item-base-unit').value = converted.baseUnit
    for (const key of CORE_NUTRIENTS) $(`#food-item-${key}`).value = converted.nutrients[key] ?? ''
    pendingProduct = { ...(pendingProduct || {}), kind: pendingProduct?.kind || 'manual', source: { type: 'manual', id: '', revision: '', attribution: 'Tápértékcímke OCR – felhasználó által ellenőrizendő' } }
    closeLabelOcr(); $('#food-api-status').textContent = 'Az OCR-javaslat betöltve. Ellenőrizd az értékeket, add meg a termék nevét, majd külön mentsd el.'; $('#food-item-form').scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (error) { $('#food-ocr-warning').textContent = error.message }
}
function saveTargets(event) { event.preventDefault(); try { const effectiveFrom = $('#food-target-date').value; const values = normalizeTargets(targetFormValues()); const existing = project.targets.find(item => item.effectiveFrom === effectiveFrom); const target = { id: existing?.id || createFoodId('target'), effectiveFrom, values }; project.targets = existing ? project.targets.map(item => item.id === existing.id ? target : item) : [...project.targets, target]; selectedDate = effectiveFrom; scheduleSave(); render() } catch (error) { $('#food-target-warning').textContent = error.message } }
function exportBackup() { const blob = new Blob([foodBackupToJson(project)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `grapes-food-${selectedDate}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0) }
async function importBackup(event) { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { const imported = foodBackupFromJson(await file.text(), profile.id); if (!confirm('Az import lecseréli a jelenlegi Food-adatokat. Folytatod?')) return; project = imported; project.syncState = { ...project.syncState, localDirty: true }; driveFileId = null; refreshRecipeFoods(); await persistLocal(); resetEntryForm(); resetFoodForm(); resetRecipeForm(); render(); setStatus('Importálva · Drive-mentés szükséges', 'saved') } catch (error) { setStatus(error.message, 'error') } }

function closeHealthPreview() {
  pendingHealthImport = null
  $('#food-health-preview').classList.add('hidden')
  $('#food-health-records').replaceChildren()
  restoreModalFocus()
}

function healthRecordLabel(item) {
  const record = item.record || {}
  if (item.status === 'invalid') return `Hibás rekord #${item.index + 1}`
  const date = new Date(item.entry.occurredAt).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })
  const amount = record.type === 'hydration' ? `${formatNumber(item.entry.amount)} ml` : `${formatNumber(item.entry.snapshot.nutrients.energyKcal, 1)} kcal`
  return `${item.entry.snapshot.name} · ${date} · ${amount}`
}

function renderHealthPreview() {
  if (!pendingHealthImport) return
  const { counts, generatedAt, records } = pendingHealthImport
  $('#food-health-summary').textContent = `Export: ${new Date(generatedAt).toLocaleString('hu-HU')} · ${counts.ready} új · ${counts.duplicate} már importálva · ${counts.invalid} hibás`
  const container = $('#food-health-records'); container.replaceChildren()
  if (!records.length) { const empty = document.createElement('p'); empty.className = 'food__empty'; empty.textContent = 'A fájl nem tartalmaz rekordot.'; container.append(empty) }
  for (const item of records) {
    const row = document.createElement('label'); row.className = `food__health-record is-${item.status}`
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = String(item.index); checkbox.checked = item.status === 'ready'; checkbox.disabled = item.status !== 'ready'; checkbox.dataset.healthRecord = ''
    const content = document.createElement('span'); const title = document.createElement('strong'); title.textContent = healthRecordLabel(item)
    const detail = document.createElement('small')
    detail.textContent = item.status === 'duplicate' ? 'Már szerepel a Food naplóban – kihagyva' : item.status === 'invalid' ? item.error : `${item.record.type === 'hydration' ? 'Folyadék' : MEAL_LABELS[item.entry.mealType]} · ${item.record.sourcePackage}`
    content.append(title, detail); row.append(checkbox, content); container.append(row)
  }
  $('#food-health-confirm').disabled = counts.ready === 0
  $('#food-health-preview').classList.remove('hidden')
  $('#food-health-close').focus()
}

async function selectHealthImport(event) {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
  try {
    pendingHealthImport = prepareHealthBridgeImport(await file.text(), { profileId: profile.id, existingEntries: project.diaryEntries })
    renderHealthPreview()
  } catch (error) { pendingHealthImport = null; setStatus(error.message, 'error'); restoreModalFocus() }
}

function applyHealthImport() {
  if (!pendingHealthImport) return
  const selected = [...root.querySelectorAll('[data-health-record]:checked')].map(input => Number(input.value))
  const existingKeys = new Set(project.diaryEntries.map(entry => entry.externalKey).filter(Boolean))
  const entries = healthImportEntries(pendingHealthImport, selected).filter(entry => !existingKeys.has(entry.externalKey))
  if (!entries.length) { setStatus('Nincs új, kijelölt Health-rekord.', 'error'); return }
  project.diaryEntries = [...project.diaryEntries, ...entries]
  selectedDate = localDate(new Date(entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0].occurredAt))
  closeHealthPreview(); scheduleSave(); render()
  setStatus(`${entries.length} Health-rekord importálva · Drive-mentés szükséges`, 'saved')
}

function bindEvents() {
  root.addEventListener('click', event => {
    const tab = event.target.closest('[data-food-tab]'); if (tab) { activeTab = tab.dataset.foodTab; render(); return }
    const entryAction = event.target.closest('[data-entry-action]'); if (entryAction) return handleEntryAction(entryAction.dataset.entryAction, entryAction.dataset.entryId)
    const favorite = event.target.closest('[data-food-favorite]'); if (favorite) { const id = favorite.dataset.foodFavorite; project.favorites = project.favorites.includes(id) ? project.favorites.filter(item => item !== id) : [...project.favorites, id]; scheduleSave(); renderFoodItems(); return }
    const sharedCopy = event.target.closest('[data-library-copy-food]'); if (sharedCopy) return copySharedRecipe(sharedCopy.dataset.libraryCopyFood)
    const offResult = event.target.closest('[data-off-result]'); if (offResult) return loadOpenFoodFactsResult(offResult.dataset.offResult)
    const editFood = event.target.closest('[data-food-edit]'); if (editFood) return fillFoodForm(project.customFoods.find(item => item.id === editFood.dataset.foodEdit))
    const deleteFood = event.target.closest('[data-food-delete]'); if (deleteFood) return deleteFoodItem(deleteFood.dataset.foodDelete)
    const removeIngredient = event.target.closest('[data-recipe-ingredient-delete]'); if (removeIngredient) { recipeIngredients = recipeIngredients.filter(item => item.id !== removeIngredient.dataset.recipeIngredientDelete); renderRecipeIngredients(); return }
    const variant = event.target.closest('[data-recipe-variant]'); if (variant) return createRecipeVariant(variant.dataset.recipeVariant)
    const edit = event.target.closest('[data-recipe-edit]'); if (edit) return editRecipe(edit.dataset.recipeEdit)
    const remove = event.target.closest('[data-recipe-delete]'); if (remove) return deleteRecipe(remove.dataset.recipeDelete)
    const sync = event.target.closest('[data-library-sync]'); if (sync) return syncFamilyLibrary(sync.dataset.librarySync)
    const publish = event.target.closest('[data-library-publish]'); if (publish) return publishFamilyLibrary(publish.dataset.libraryPublish)
    const share = event.target.closest('[data-library-share]'); if (share) return shareFamilyLibrary(share.dataset.libraryShare)
    const revoke = event.target.closest('[data-library-revoke]'); if (revoke && confirm(`Visszavonod ${revoke.dataset.memberEmail} hozzáférését?`)) return revokeFamilyMember(revoke.dataset.libraryRevoke, revoke.dataset.memberEmail)
    const detach = event.target.closest('[data-library-remove]'); if (detach && confirm('Leválasztod ezt a receptkönyvtárat erről a profilról?')) return detachFamilyLibrary(detach.dataset.libraryRemove)
  })
  $('.food__tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const tabs = [...root.querySelectorAll('[data-food-tab]')]
    const current = Math.max(0, tabs.indexOf(document.activeElement))
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    event.preventDefault(); activeTab = tabs[next].dataset.foodTab; render(); tabs[next].focus()
  })
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    if (!$('#food-ocr-preview').classList.contains('hidden')) closeLabelOcr()
    else if (!$('#food-health-preview').classList.contains('hidden')) closeHealthPreview()
  })
  $('#food-date').addEventListener('change', event => { selectedDate = event.target.value || localDate(); render() }); $('#food-date-prev').addEventListener('click', () => shiftDate(-1)); $('#food-date-next').addEventListener('click', () => shiftDate(1)); $('#food-date-today').addEventListener('click', () => { selectedDate = localDate(); render() })
  $('#food-search').addEventListener('input', renderFoodItems); $('#food-search').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); searchOpenFoodFactsByName() } }); $('#food-off-search').addEventListener('click', searchOpenFoodFactsByName); $('#food-category-filter').addEventListener('change', renderFoodItems); $('#food-entry-food').addEventListener('change', () => updateEntryUnits()); $('#food-entry-form').addEventListener('submit', saveEntry); $('#food-entry-cancel').addEventListener('click', resetEntryForm)
  $('#food-item-form').addEventListener('submit', saveFood); $('#food-item-cancel').addEventListener('click', resetFoodForm); $('#food-lookup').addEventListener('click', lookupProductFromForm); $('#food-entry-scan').addEventListener('click', () => { barcodeScanTarget = 'diary'; $('#food-barcode-input').click() }); $('#food-scan').addEventListener('click', () => { barcodeScanTarget = 'foods'; $('#food-barcode-input').click() }); $('#food-barcode-input').addEventListener('change', selectBarcodePhoto); $('#food-label-ocr').addEventListener('click', event => { modalReturnFocus = event.currentTarget; $('#food-label-input').click() }); $('#food-label-input').addEventListener('change', selectNutritionLabel); $('#food-ocr-apply').addEventListener('click', applyLabelOcr); $('#food-ocr-close').addEventListener('click', closeLabelOcr); $('#food-ocr-cancel').addEventListener('click', closeLabelOcr); $('#food-ocr-preview').addEventListener('click', event => { if (event.target.id === 'food-ocr-preview') closeLabelOcr() })
  $('#food-recipe-form').addEventListener('submit', saveRecipe); $('#food-recipe-cancel').addEventListener('click', resetRecipeForm); $('#food-recipe-add-ingredient').addEventListener('click', addRecipeIngredient); $('#food-recipe-ingredient-food').addEventListener('change', () => updateRecipeIngredientUnits()); for (const id of ['#food-recipe-name', '#food-recipe-prepared-weight', '#food-recipe-yield-count', '#food-recipe-yield-unit', '#food-recipe-unit-weight']) $(id).addEventListener('input', renderRecipePreview)
  $('#food-library-create').addEventListener('submit', createFamilyLibrary); $('#food-library-connect').addEventListener('submit', connectFamilyLibrary)
  for (const id of ['#food-stats-period', '#food-stats-nutrient', '#food-stats-compare', '#food-stats-granularity']) $(id).addEventListener('change', renderStats)
  $('#food-target-form').addEventListener('submit', saveTargets); for (const id of ['#food-target-energy', '#food-target-protein', '#food-target-carbohydrate', '#food-target-fat']) $(id).addEventListener('input', renderTargetWarning)
  $('#food-drive-save').addEventListener('click', () => saveToDrive().catch(error => setStatus(error.message, 'error'))); $('#food-back-to-menu-btn').addEventListener('click', () => document.dispatchEvent(new CustomEvent('grapes:open-main-menu'))); $('#food-backup-export').addEventListener('click', exportBackup); $('#food-backup-import').addEventListener('click', () => $('#food-backup-input').click()); $('#food-backup-input').addEventListener('change', importBackup)
  $('#food-health-import').addEventListener('click', event => { modalReturnFocus = event.currentTarget; $('#food-health-input').click() }); $('#food-health-input').addEventListener('change', selectHealthImport); $('#food-health-confirm').addEventListener('click', applyHealthImport); $('#food-health-close').addEventListener('click', closeHealthPreview); $('#food-health-cancel').addEventListener('click', closeHealthPreview); $('#food-health-preview').addEventListener('click', event => { if (event.target.id === 'food-health-preview') closeHealthPreview() })
}

export async function initFoodApp() { root = document.querySelector('#food-app'); if (!initialized) { root.innerHTML = appMarkup(); addDiaryScannerButton(); addOpenFoodFactsSearchUi(); bindEvents(); initialized = true } setStatus('Betöltés…'); await loadProject(); resetEntryForm(); resetRecipeForm(); render(); setStatus(driveFileId ? 'Drive-ról betöltve' : 'Helyi napló', 'saved') }
