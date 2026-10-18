// Untrusted sources only produce drafts; no unknown amounts or nutrients are fabricated.
const trim = s => String(s ?? '').trim().replace(/[ \t]+/g, ' ')
const numeric = raw => {
  const v = String(raw ?? '').replace(',', '.').trim()
  if (/^\d+\s*\/\s*\d+$/.test(v)) {
    const [a,b] = v.split('/').map(Number)
    return b > 0 ? a / b : null
  }
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}
const units = new Map([
  ['g','g'], ['gram','g'], ['gramm','g'], ['dkg','dkg'], ['kg','kg'],
  ['ml','ml'], ['dl','dl'], ['l','l'], ['liter','l'],
  ['teáskanál','tsp'], ['tk','tsp'], ['tsp','tsp'],
  ['evőkanál','tbsp'], ['ek','tbsp'], ['tbsp','tbsp'],
  ['csipet','pinch'], ['pinch','pinch'],
])
const unitPattern = [...units.keys()].sort((a,b)=>b.length-a.length).join('|')
const numberPattern = '\\d+(?:[.,]\\d+)?|\\d+\\s*/\\s*\\d+'
const start = new RegExp('^(' + numberPattern + ')\\s*(' + unitPattern + '|db|darab|cup|pohár|bögre)\\b\\.?\\s+(.+)$','i')
const end = new RegExp('^(.+?)\\s+(' + numberPattern + ')\\s*(' + unitPattern + '|db|darab|cup|pohár|bögre)\\b\\.?$','i')
export function parseRecipeIngredientLine(value) {
  const original = trim(String(value ?? '').replace(/^\s*[-*•]\s*/, '').replace(/^\s*\d+[.)]\s+/, ''))
  if (!original) return null
  let m = start.exec(original)
  let name, amount, unit
  if (m) { amount=numeric(m[1]); unit=m[2].toLowerCase(); name=m[3] }
  else {
    m=end.exec(original)
    if (m) { name=m[1]; amount=numeric(m[2]); unit=m[3].toLowerCase() }
  }
  if (!m || !amount || !name?.trim()) return {
    original, name: original, amount:null, unit:null, reason:'Nem ismert a pontos mennyiség és mértékegység.',
  }
  if (!units.has(unit)) return {
    original, name:trim(name), amount, unit:null, reason:'Az adag/darab/pohár átváltása alapanyagonként eltér.',
  }
  return { original, name:trim(name), amount, unit:units.get(unit) }
}
const asText = x => typeof x === 'string' ? x :
  Array.isArray(x) ? x.map(asText).filter(Boolean).join('\n') :
    x?.text ? asText(x.text) : ''
function pickRecipe(value) {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) return value.map(pickRecipe).find(Boolean) || null
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']]
  if (types.some(type => /(?:^|[:/])Recipe$/i.test(String(type)))) return value
  for (const key of ['@graph','recipe','item','itemListElement']) {
    const result = pickRecipe(value[key])
    if (result) return result
  }
  return value.name && (value.ingredients || value.recipeIngredient) ? value : null
}
function fromHtml(html) {
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/type\s*=\s*["']application\/ld\+json["']/i.test(script[1])) continue
    try { const recipe=pickRecipe(JSON.parse(script[2])); if (recipe) return recipe } catch {}
  }
  return null
}
function textFromHtml(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<\/(?:p|div|li|h\d|section)\s*>|<br\s*\/?>/gi,'\n')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
}
function csvRecipe(text) {
  const lines=text.split(/\r?\n/).map(trim).filter(Boolean)
  if(lines.length<2) return null
  const sep=lines[0].includes(';')?';':lines[0].includes('\t')?'\t':','
  const h=lines[0].split(sep).map(x=>x.toLocaleLowerCase('hu-HU'))
  const name=h.findIndex(x=>/^(hozzávaló|hozzavalo|ingredient|name|étel|etel)$/.test(x))
  const amount=h.findIndex(x=>/^(mennyiség|mennyiseg|quantity|amount|qty)$/.test(x))
  const unit=h.findIndex(x=>/^(egység|egyseg|unit)$/.test(x))
  if([name,amount,unit].some(n=>n<0)) return null
  return {name:'Importált recept',recipeIngredient:lines.slice(1,101).map(row=>{
    const v=row.split(sep).map(x=>x.trim().replace(/^"|"$/g,''))
    return [v[amount],v[unit],v[name]].filter(Boolean).join(' ')
  })}
}
function fromPlain(text) {
  const lines=text.split(/\r?\n/).map(trim).filter(Boolean)
  if(!lines.length) throw Error('Üres receptszöveg.')
  const title=lines[0].replace(/^#+\s*/, '').slice(0,180)
  let mode='',ingredients=[],instructions=[]
  for(const raw of lines.slice(1)) {
    const line=raw.replace(/^#+\s*/, '')
    if(/^(hozzávalók|hozzavalok|összetevők|osszetevok|ingredients)\s*:?$/i.test(line)){mode='ingredients';continue}
    if(/^(elkészítés|elkeszites|instructions|directions|method)\s*:?$/i.test(line)){mode='instructions';continue}
    if(mode==='ingredients'||(!mode&&(start.test(line)||end.test(line))))ingredients.push(line)
    else instructions.push(line)
  }
  if(!ingredients.length)throw Error('Nem található hozzávalólista. Használj „Hozzávalók:” címet.')
  return {name:title,recipeIngredient:ingredients,recipeInstructions:instructions.join('\n')}
}
export function parseRecipeImport(source,{fileName=''}={}) {
  if(typeof source!=='string'||!source.trim())throw Error('Adj meg receptszöveget vagy válassz fájlt.')
  if(source.length>120000)throw Error('Túl hosszú receptszöveg (legfeljebb 120 000 karakter).')
  const text=source.trim()
  let recipe
  if(/^[\[{]/.test(text)) {
    let parsed
    try{parsed=JSON.parse(text)}catch{throw Error('A recept JSON-formátuma hibás.')}
    recipe=pickRecipe(parsed)
    if(!recipe)throw Error('A JSON nem tartalmaz felismerhető receptet.')
  }else if(/<(html|script|div|h\d|p|li)\b/i.test(text))recipe=fromHtml(text)||fromPlain(textFromHtml(text))
  else if(/\.csv$/i.test(fileName))recipe=csvRecipe(text)||fromPlain(text)
  else recipe=fromPlain(text)
  const list=recipe.recipeIngredient||recipe.ingredients||[]
  const ingredients=(Array.isArray(list)?list:[list]).slice(0,100).map(item=>{
    if(item&&typeof item==='object') {
      const name=item.name||item.ingredient?.name||item.text||''
      return parseRecipeIngredientLine(item.amount!=null&&item.unit ? String(item.amount)+' '+item.unit+' '+name : String(name))
    }
    return parseRecipeIngredientLine(item)
  }).filter(Boolean)
  const warnings=[]
  if(!ingredients.length)warnings.push('Nincs felismerhető hozzávalólista.')
  const unresolved=ingredients.filter(x=>x.reason)
  if(unresolved.length)warnings.push(unresolved.length+' hozzávalónál ellenőrizd a mennyiséget.')
  if((Array.isArray(list)?list.length:1)>100)warnings.push('Csak az első 100 hozzávalót olvastuk be.')
  const rawYield=recipe.recipeYield??recipe.yieldCount??null
  const found=String(Array.isArray(rawYield)?rawYield[0]:rawYield??'').match(/\d+(?:[.,]\d+)?/)
  const rawImage=typeof recipe.image==='string'?recipe.image:
    Array.isArray(recipe.image)?recipe.image[0]:recipe.image?.url||recipe.imageUrl||''
  return {
    name:trim(recipe.name||recipe.title||'Importált recept').slice(0,180),
    category:trim(recipe.recipeCategory||recipe.category||'Saját recept').slice(0,120),
    instructions:asText(recipe.recipeInstructions??recipe.instructions??recipe.description).slice(0,15000),
    ingredients, yieldCount:found?numeric(found[0]):null,
    imageUrl:/^https:\/\//i.test(String(rawImage))?String(rawImage).slice(0,2000):'',
    warnings, format:recipe['@type']?'schema.org/Recipe':'receptszöveg',
  }
}
