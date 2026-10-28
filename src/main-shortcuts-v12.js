import { mobileIconSvg } from './android-mobile-icons.js'

/**
 * Real Grapes module destinations only. This is a NAVIGATION preference, not
 * a user data store, a plant catalog, or a substitute for a real module.
 * All buttons delegate to the EXISTING app controller's routes.
 */
export const MAIN_SHORTCUTS = Object.freeze([
  { id:'outdoor', label:'Növényeim', icon:'outdoor', group:'Outdoor' },
  { id:'food', label:'Ételnapló', icon:'food', group:'Health' },
  { id:'water', label:'Víznapló', icon:'water', group:'Health' },
  { id:'recipes', label:'Receptek', icon:'recipe', group:'Health' },
  { id:'stats', label:'Statisztika', icon:'stats', group:'Health' },
  { id:'shopping', label:'Bevásárlás', icon:'shopping', group:'Home' },
  { id:'inventory', label:'Készlet', icon:'household', group:'Home' },
  { id:'finance', label:'Pénzügyi napló', icon:'finance', group:'Finance' },
  { id:'ebook', label:'E-book', icon:'ebook', group:'Tools' },
  { id:'qr', label:'QR-kód', icon:'qr', group:'Tools' },
  { id:'projects', label:'Projektek', icon:'projects', group:'Eszközök' },
  { id:'sync', label:'Szinkron', icon:'sync', group:'Adatkapcsolatok' },
])
const byId = new Map(MAIN_SHORTCUTS.map(entry => [entry.id, entry]))
const STORAGE_KEY = 'grapes-main-shortcuts-v12'
const DEFAULT_PINS = ['food','water','outdoor']
const MAX_PINS = 10

function parseSettings(raw) {
  let parsed = null
  try { parsed = JSON.parse(raw || 'null') } catch {}
  if (parsed?.version !== 1 || !Array.isArray(parsed.pinned) ||
      !parsed.usage || typeof parsed.usage !== 'object') {
    return { version:1, pinned:[...DEFAULT_PINS], usage:{} }
  }
  const pinned = [...new Set(parsed.pinned.filter(id => typeof id === 'string' && byId.has(id)))].slice(0,MAX_PINS)
  const usage = {}
  for (const id of byId.keys()) {
    const value = parsed.usage[id]
    if (Number.isSafeInteger(value) && value > 0)
      usage[id] = Math.min(value,1_000_000)
  }
  return {version:1,pinned,usage}
}

export function createMainShortcutStore(storage,{key=STORAGE_KEY}={}){
  if (!storage || typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function') throw Error('Missing local settings store')
  let state
  try { state = parseSettings(storage.getItem(key)) }
  catch { state = parseSettings(null) }
  function commit(next) {
    // Never drop the previous valid in-memory state if storage is unavailable.
    const candidate = parseSettings(JSON.stringify(next))
    try { storage.setItem(key,JSON.stringify(candidate)) }
    catch { /* Navigation may still work without persistent storage. */ }
    state=candidate
  }
  return Object.freeze({
    list() {
      const pinned = state.pinned.map(id=>byId.get(id))
      const trending = [...byId.keys()]
        .filter(id=>!state.pinned.includes(id) && (state.usage[id]||0)>0)
        .sort((a,b)=>state.usage[b]-state.usage[a]||a.localeCompare(b))
        .slice(0,3).map(id=>byId.get(id))
      return {pinned:[...pinned],recommended:[...trending]}
    },
    pin(id) {
      if(!byId.has(id)) throw Error('Ismeretlen Grapes modul.')
      if(state.pinned.includes(id))return false
      if(state.pinned.length>=MAX_PINS)throw Error('Legfeljebb 10 modul rögzíthető.')
      commit({...state,pinned:[...state.pinned,id]})
      return true
    },
    unpin(id) {
      if(!byId.has(id)||!state.pinned.includes(id))return false
      commit({...state,pinned:state.pinned.filter(x=>x!==id)})
      return true
    },
    visit(id) {
      if(!byId.has(id))return
      commit({...state,usage:{...state.usage,[id]:Math.min(1_000_000,(state.usage[id]||0)+1)}})
    },
    has(id){return byId.has(id)},
    get(id){return byId.get(id)||null},
    all:()=>[...MAIN_SHORTCUTS],
  })
}

/**
 * Real interactive startup favorites. Never inserts fake Food, Finance or
 * Plants figures; opening a shortcut routes through the existing app.
 */
export function mountMainShortcuts({root,storage,onOpen,onError=()=>{}}={}){
  if(!root || typeof onOpen !== 'function')throw Error('Missing Grapes main view')
  const store=createMainShortcutStore(storage)
  const list=root.querySelector('[data-main-shortcut-list]')
  const picker=root.querySelector('[data-main-shortcut-picker]')
  const select=root.querySelector('[data-main-shortcut-select]')
  if(!list||!picker||!select)throw Error('Incomplete Grapes shortcut navigation')
  for (const entry of store.all()) {
    const opt=new Option(entry.label+' · '+entry.group,entry.id)
    select.append(opt)
  }
  const makeButton=(entry,pinned)=>{
    const card=document.createElement('div')
    card.className='grapes-favorite-card'
    card.dataset.favoriteId=entry.id
    const open=document.createElement('button')
    open.type='button'
    open.className='grapes-favorite-open'
    open.dataset.mainShortcut=entry.id
    open.setAttribute('aria-label',entry.label+' megnyitása')
    open.innerHTML=mobileIconSvg(entry.icon,'grapes-favorite-icon')
    const name=document.createElement('span')
    name.textContent=entry.label
    open.append(name)
    const marker=document.createElement('small')
    marker.textContent=pinned?'Rögzített':'Gyakran használt'
    open.append(marker)
    card.append(open)
    if(pinned){
      const remove=document.createElement('button')
      remove.type='button'
      remove.className='grapes-favorite-unpin'
      remove.dataset.mainUnpin=entry.id
      remove.setAttribute('aria-label',entry.label+' eltávolítása a kedvencekből')
      remove.title='Rögzítés feloldása'
      remove.textContent='×'
      card.append(remove)
    }
    return card
  }
  function render(){
    const {pinned,recommended}=store.list()
    list.replaceChildren(...pinned.map(x=>makeButton(x,true)),
      ...recommended.map(x=>makeButton(x,false)))
    if(!list.childElementCount){
      const empty=document.createElement('p')
      empty.className='grapes-favorite-empty'
      empty.textContent='Nincs rögzített modul. A Hozzáadás gombbal választhatsz.'
      list.append(empty)
    }
  }
  const onClick=(event)=>{
    const add=event.target.closest('[data-main-shortcut-add]')
    if(add){picker.hidden=!picker.hidden; if(!picker.hidden)select.focus(); return}
    const done=event.target.closest('[data-main-shortcut-pin]')
    if(done){try{store.pin(select.value);picker.hidden=true;render()}catch(e){onError(e.message)};return}
    const unpin=event.target.closest('[data-main-unpin]')
    if(unpin){store.unpin(unpin.dataset.mainUnpin);render();return}
    const shortcut=event.target.closest('[data-main-shortcut]')
    if(shortcut){
      const id=shortcut.dataset.mainShortcut
      if(store.has(id)){store.visit(id);render();onOpen(id)}
    }
  }
  root.addEventListener('click',onClick)
  render()
  return Object.freeze({
    record(id){if(store.has(id)){store.visit(id);render()}},
    render,
    dispose(){root.removeEventListener('click',onClick)},
  })
}
