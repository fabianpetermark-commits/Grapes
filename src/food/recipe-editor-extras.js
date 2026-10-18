import { parseRecipeImport } from './recipe-import.js'
import { readRecipeImportFile, readRecipeImportUrl } from './recipe-import-file.js'
import { resizeRecipeImage, normalizeRecipeImageUrl } from './recipe-image.js'

/** Tabbed editor UI and provisional sources. Nothing persists until Save. */
export function createRecipeEditorExtras({root, onApplyImport}) {
  const $ = selector => root.querySelector(selector)
  let imageUrl = ''
  let draft = null
  function setTab(name) {
    const available = ['basics','ingredient','list','image','import']
    const tab = available.includes(name) ? name : 'basics'
    root.querySelectorAll('[data-food-recipe-tab]').forEach(button => {
      const active = button.dataset.foodRecipeTab === tab
      button.setAttribute('aria-selected',String(active))
      button.tabIndex = active ? 0 : -1
    })
    root.querySelectorAll('[data-food-recipe-panel]').forEach(panel => {
      panel.hidden = panel.dataset.foodRecipePanel !== tab
    })
    $('[data-food-recipe-tab-body]').scrollTop = 0
  }
  function imagePreview() {
    const img = $('[data-food-recipe-image-preview]')
    img.hidden = !imageUrl
    if (imageUrl) img.src=imageUrl
    else img.removeAttribute('src')
    $('[data-food-recipe-image-remove]').hidden=!imageUrl
  }
  function open(sourceImageUrl='') {
    draft = null
    imageUrl = normalizeRecipeImageUrl(sourceImageUrl)
    $('[data-food-recipe-import-text]').value = ''
    $('[data-food-recipe-import-status]').textContent = ''
    $('[data-food-recipe-import-preview]').hidden = true
    $('[data-food-recipe-import-apply]').hidden = true
    $('[data-food-recipe-image-status]').textContent = ''
    imagePreview()
    setTab('basics')
  }
  function showDraft(value) {
    const ready=value.ingredients.filter(item=>item.amount>0&&item.unit)
    const pending=value.ingredients.filter(item=>!item.amount||!item.unit)
    const lines=[
      'Recept: '+value.name,
      'Felismerhető összetevők: '+ready.length,
      ...ready.slice(0,20).map(item=>item.amount+' '+item.unit+' '+item.name),
      ...(pending.length?['Kézzel pótolandó: '+pending.map(item=>item.original).join('; ')]:[]),
      ...value.warnings,
      'Az átvétel után ellenőrizd a hozzávalókat és a tápértékeket. A mentés külön történik.',
    ]
    const preview=$('[data-food-recipe-import-preview]')
    preview.textContent=lines.join('\n')
    preview.hidden=false
    $('[data-food-recipe-import-apply]').hidden=false
  }
  async function readSource(file=null) {
    draft=null
    $('[data-food-recipe-import-apply]').hidden=true
    $('[data-food-recipe-import-preview]').hidden=true
    const status=$('[data-food-recipe-import-status]')
    status.textContent='Recept beolvasása…'
    try {
      if(file)draft=await readRecipeImportFile(file,message=>status.textContent=message)
      else {
        const text=$('[data-food-recipe-import-text]').value.trim()
        draft=/^https?:\/\//i.test(text)?await readRecipeImportUrl(text):parseRecipeImport(text)
      }
      showDraft(draft)
      status.textContent='Piszkozat készült. Ellenőrizd a felismert adatokat, majd válaszd az Átvétel gombot.'
    }catch(error){status.textContent=error?.message||'A forrás nem olvasható.'}
  }
  function bind() {
    root.querySelectorAll('[data-food-recipe-tab]').forEach(button=>
      button.addEventListener('click',()=>setTab(button.dataset.foodRecipeTab)))
    $('[data-food-recipe-image-select]').addEventListener('click',()=>$('[data-food-recipe-image-file]').click())
    $('[data-food-recipe-image-file]').addEventListener('change',async event=>{
      const file=event.currentTarget.files?.[0]
      event.currentTarget.value=''
      if(!file)return
      const status=$('[data-food-recipe-image-status]')
      status.textContent='Kép tömörítése…'
      try {
        imageUrl=await resizeRecipeImage(file)
        imagePreview()
        status.textContent='A kép a Recept mentése gombbal kerül a receptbe.'
      }catch(error){status.textContent=error?.message||'A kép nem olvasható.'}
    })
    $('[data-food-recipe-image-remove]').addEventListener('click',()=>{
      if(!window.confirm('Eltávolítod a recept képét a következő mentéskor?'))return
      imageUrl=''
      imagePreview()
      $('[data-food-recipe-image-status]').textContent='A kép a következő mentéskor törlődik.'
    })
    $('[data-food-recipe-import-select]').addEventListener('click',()=>$('[data-food-recipe-import-file]').click())
    $('[data-food-recipe-import-file]').addEventListener('change',event=>{
      const file=event.currentTarget.files?.[0]
      event.currentTarget.value=''
      if(file)readSource(file)
    })
    $('[data-food-recipe-import-read]').addEventListener('click',()=>readSource())
    $('[data-food-recipe-import-apply]').addEventListener('click',()=>{
      if(!draft)return
      const applied=onApplyImport(draft)
      if(applied) {
        draft=null
        $('[data-food-recipe-import-apply]').hidden=true
        $('[data-food-recipe-import-status]').textContent='A piszkozat átvéve, még nincs elmentve.'
      }
    })
  }
  return {bind,open,setTab,getImageUrl:()=>imageUrl,setImageUrl(value){imageUrl=normalizeRecipeImageUrl(value);imagePreview()}}
}
