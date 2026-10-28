import './outdoor-mobile.css'
import { createOutdoorStore, localDay, addDays } from './outdoor-data.js'
import { searchPlantCatalog, searchCities, readOutdoorWeather, weatherSummary } from './outdoor-api.js'
import { mobileIconSvg } from '../android-mobile-icons.js'
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const kindName={watering:'Locsolás',wintering:'Teleltetés',note:'Megfigyelés',other:'Egyéb'}
const fields={name:'Példány neve',species:'Faj / fajta',light:'Fényigény',water:'Vízigény',soil:'Talajigény',wintering:'Teleltetés',ripening:'Érés / betakarítás (saját megfigyelés)',notes:'Megjegyzés'}
export function mountOutdoor(root,{storage=localStorage,getProfile=()=> 'local'}={}) {
  let store,profile,state,photo='',catalogId='',searchEpoch=0,weatherEpoch=0
  root.innerHTML=`<nav class="outdoor-rail" aria-label="Növények funkciói">
      <button type="button" data-outdoor-view="plants" aria-label="Növényeim" title="Növényeim" aria-current="page">${mobileIconSvg('outdoor')}</button>
      <button type="button" data-outdoor-view="catalog" data-outdoor-action="catalog" aria-label="Növénykatalógus" title="Növénykatalógus">${mobileIconSvg('recipe')}</button>
      <button type="button" data-outdoor-view="tasks" aria-label="Aktuális teendők" title="Aktuális teendők">${mobileIconSvg('shopping')}</button>
      <button type="button" data-outdoor-view="logs" aria-label="Napló" title="Napló">${mobileIconSvg('clock')}</button>
      <button type="button" data-outdoor-action="add" aria-label="Új növény" title="Új növény">${mobileIconSvg('outdoor')}</button>
      <button type="button" data-outdoor-view="settings" aria-label="Beállítások" title="Beállítások">${mobileIconSvg('settings')}</button>
    </nav>
    <header class="outdoor-head"><h1 data-outdoor-title>Növényeim</h1></header>
    <p data-outdoor-status role="status" aria-live="polite"></p>
    <section data-outdoor-editor hidden></section>
    <section data-outdoor-panel="plants"><div data-outdoor-plants></div></section>
    <section data-outdoor-panel="catalog" hidden>
      <section data-outdoor-catalog><h2>Növénykatalógus</h2><form data-outdoor-form="catalog"><label>Magyar vagy angol név<input name="query" required minlength="2" maxlength="100" placeholder="pl. paradicsom / tomato"></label><button>Keresés</button></form><p>Nyílt adatforrás: iNaturalist. A gondozási adatokat saját tapasztalatod alapján töltsd ki.</p><div data-outdoor-results></div></section>
    </section>
    <section data-outdoor-panel="tasks" hidden>
      <p class="outdoor-weather-summary"><strong>Helyi időjárás</strong><span data-outdoor-weather></span></p>
      <div data-outdoor-weather-tasks></div>
      <h2>Aktuális teendők</h2><div data-outdoor-tasks></div>
    </section>
    <section data-outdoor-panel="logs" hidden><h2>Napló</h2><div data-outdoor-logs></div></section>
    <section data-outdoor-panel="settings" hidden><h2>Beállítások</h2><p>Helyszín, időjárás és saját növénygondozási adatok.</p><button type="button" data-outdoor-action="location">Helyszín és időjárás beállítása</button><button type="button" data-outdoor-action="global-settings">Központi beállítások</button></section>`
  const $=selector=>root.querySelector(selector)
  const editor=$('[data-outdoor-editor]')
  let activeView='plants'
  const viewTitles={plants:'Növényeim',catalog:'Növénykatalógus',tasks:'Aktuális teendők',logs:'Napló',settings:'Beállítások'}
  function showView(view){
    if(!viewTitles[view])return false
    if(!editor.hidden && !confirm('Elveted a nem mentett növényűrlapot?'))return false
    editor.hidden=true;editor.replaceChildren()
    activeView=view
    $('[data-outdoor-title]').textContent=viewTitles[view]
    root.querySelectorAll('[data-outdoor-panel]').forEach(panel=>{panel.hidden=panel.dataset.outdoorPanel!==view})
    root.querySelectorAll('[data-outdoor-view]').forEach(button=>{
      if(button.dataset.outdoorView===view)button.setAttribute('aria-current','page')
      else button.removeAttribute('aria-current')
    })
    return true
  }
  showView('plants')
  function status(message,error=false){const node=$('[data-outdoor-status]');node.textContent=message;node.classList.toggle('is-error',error)}
  function checkProfile(){
    const current=String(getProfile()||'local')
    if(current!==profile){profile=current;store=createOutdoorStore(storage,profile);state=null;searchEpoch++;weatherEpoch++;editor.hidden=true;editor.replaceChildren();showView('plants')}
  }
  function save(command){
    if(String(getProfile()||'local')!==profile)throw Error('A Grapes-fiók megváltozott. Nyisd meg újra a Növényeim modult.')
    state=store.dispatch(command)
    render()
    status('Tartósan mentve ezen az eszközön, offline is elérhető.')
  }
  function weather(){
    const node=$('[data-outdoor-weather]')
    if(node)node.textContent=(state.location?state.location.name+' · ':'')+weatherSummary(state.weather)+(state.weather?' · Frissítve: '+new Date(state.weather.fetchedAt).toLocaleString('hu-HU'):'')
  }
  function renderWeatherTasks(){
    const host=$('[data-outdoor-weather-tasks]')
    if(!host)return
    const days=(state.weather?.days||[]).filter(day=>day.date>=localDay())
    const alerts=[]
    if(days.some(day=>day.min<=0))for(const plant of state.plants)alerts.push({plant,title:'Fagyveszély',detail:plant.wintering?('Teleltetés: '+plant.wintering):'Ellenőrizd ennek a növénynek a teleltetési igényét.'})
    if(days.some(day=>day.max>=32))for(const plant of state.plants)alerts.push({plant,title:'Hőség',detail:plant.water?('Vízigény: '+plant.water+' · Ellenőrizd a talajt.'):'Ellenőrizd a növény vízigényét és a talajt.'})
    if(days.some(day=>day.rain>0))for(const plant of state.plants)alerts.push({plant,title:'Várható csapadék',detail:'Locsolás előtt ellenőrizd a talajt; a rendszer nem locsol automatikusan.'})
    host.innerHTML=alerts.length?alerts.map(item=>'<article class="outdoor-weather-task"><strong>'+escape(item.plant.name)+' · '+escape(item.title)+'</strong><p>'+escape(item.detail)+'</p></article>').join(''):'<p class="outdoor-empty">Nincs aktuális időjárási figyelmeztetés, vagy még nincs ellenőrzött előrejelzés.</p>'
  }
  function render(){
    weather()
    $('[data-outdoor-plants]').innerHTML=state.plants.length ? state.plants.map(p=>`<article class="outdoor-card" data-plant-id="${escape(p.id)}">
      ${p.photo?`<img class="outdoor-photo" src="${p.photo}" alt="${escape(p.name)} saját fotója">`:'<span class="outdoor-leaf" aria-hidden="true">♧</span>'}
      <h3>${escape(p.name)}</h3><p>${escape(p.species||'Saját növény')}</p>
      <dl>${Object.entries(fields).filter(([k])=>!['name','species'].includes(k)&&p[k]).map(([k,label])=>`<dt>${label}</dt><dd>${escape(p[k])}</dd>`).join('')}${p.wateringDays?`<dt>Saját locsolási ütem</dt><dd>${p.wateringDays} naponta</dd>`:''}</dl>
      <div class="outdoor-actions"><button data-outdoor-action="edit" data-id="${p.id}">Szerkesztés</button><button data-outdoor-action="log" data-id="${p.id}">Naplózás</button><button data-outdoor-action="task" data-id="${p.id}">Új teendő</button><button data-outdoor-action="delete" data-id="${p.id}">Törlés</button></div>
      <details><summary>Napló (${state.logs.filter(l=>l.plantId===p.id).length})</summary>${state.logs.filter(l=>l.plantId===p.id).sort((a,b)=>b.date.localeCompare(a.date)).map(l=>`<p>${escape(l.date)} · ${kindName[l.type]} · ${escape(l.note)}</p>`).join('')||'<p>Még nincs bejegyzés.</p>'}</details></article>`).join('') : '<p class="outdoor-empty">Még nincs növényed. Adj hozzá saját példányt, akár internet nélkül.</p>'
    const pending=state.tasks.filter(t=>t.status==='pending').sort((a,b)=>a.due.localeCompare(b.due))
    $('[data-outdoor-tasks]').innerHTML=pending.length?pending.map(t=>`<article class="outdoor-card" data-task-id="${t.id}"><h3>${escape(state.plants.find(p=>p.id===t.plantId)?.name)} · ${escape(t.title)}</h3><p>${escape(t.due)}${t.due<localDay()?' · Elmaradt':t.due===localDay()?' · Ma esedékes':' · Következő'}</p><div class="outdoor-actions"><button data-outdoor-action="complete" data-id="${t.id}">Teljesítve</button><button data-outdoor-action="postpone" data-id="${t.id}">Halasztás</button></div></article>`).join(''):'<p class="outdoor-empty">Nincs függő teendő. Növényenként adhatsz hozzá saját feladatot.</p>'
    const logs=[...state.logs].sort((a,b)=>b.date.localeCompare(a.date))
    $('[data-outdoor-logs]').innerHTML=logs.length?logs.map(log=>'<article class="outdoor-card"><strong>'+escape(state.plants.find(p=>p.id===log.plantId)?.name||'Növény')+' · '+escape(kindName[log.type]||'Megfigyelés')+'</strong><p>'+escape(log.date)+' · '+escape(log.note||'Nincs megjegyzés')+'</p></article>').join(''):'<p class="outdoor-empty">Még nincs naplóbejegyzés. A növényeidnél a Naplózás művelettel rögzíthetsz eseményt.</p>'
    renderWeatherTasks()
  }
  function openForm(html){editor.innerHTML=html;editor.hidden=false;editor.scrollIntoView({block:'start'});editor.querySelector('input,select,button')?.focus()}
  const cancel='<button type="button" data-outdoor-action="cancel">Mégse</button>'
  function editPlant(p={}) {
    photo=p.photo||'';catalogId=p.catalogId||''
    openForm(`<form data-outdoor-form="plant" data-id="${escape(p.id||'')}"><h2>${p.id?'Növény szerkesztése':'Új növénypéldány'}</h2>${Object.entries(fields).map(([k,label])=>`<label>${label}<${k==='notes'?'textarea':'input'} name="${k}" ${k==='name'?'required maxlength="160"':'maxlength="500"'} ${k!=='notes'?`value="${escape(p[k]||'')}"`:''}>${k==='notes'?escape(p[k]||'')+'</textarea>':''}</label>`).join('')}<label>Locsolás hány naponta? (elhagyható)<input name="wateringDays" type="number" min="1" max="365" value="${p.wateringDays||''}"></label><label>Saját fotó (legfeljebb 10 MB)<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>${photo?'<label><input type="checkbox" name="removePhoto"> Fotó eltávolítása</label>':''}<p>A katalógus nem ad ellenőrzött gondozási ütemet. Csak a saját beállításod indít locsolási teendőt.</p><div class="outdoor-actions"><button type="submit">Mentés</button>${cancel}</div></form>`)
  }
  function logForm(id){openForm(`<form data-outdoor-form="log" data-id="${id}"><h2>Naplóbejegyzés</h2><label>Típus<select name="kind"><option value="watering">Locsolás</option><option value="wintering">Teleltetés</option><option value="note">Megfigyelés</option></select></label><label>Dátum<input name="date" type="date" required value="${localDay()}" max="${localDay()}"></label><label>Megjegyzés<textarea name="note" maxlength="500"></textarea></label><div class="outdoor-actions"><button>Mentés</button>${cancel}</div></form>`)}
  async function refreshWeather(){
    if(!state?.location)return
    const epoch=++weatherEpoch,pinned=profile,location=state.location
    try{
      const result=await readOutdoorWeather(location)
      if(epoch!==weatherEpoch||pinned!==String(getProfile()||'local'))return
      state=store.dispatch({type:'weather',location,weather:result});weather();renderWeatherTasks()
    }catch{
      if(epoch===weatherEpoch)status('Az időjárás most nem frissíthető. '+(state.weather?'A legutóbbi, dátummal jelzett előrejelzést látod.':'A növényeid offline is használhatók.'),true)
    }
  }
  async function locationSelected(location){save({type:'location',location});editor.hidden=true;await refreshWeather()}
  root.addEventListener('click',async event=>{
    const viewButton=event.target.closest('[data-outdoor-view]')
    if(viewButton){showView(viewButton.dataset.outdoorView);return}
    const button=event.target.closest('[data-outdoor-action]');if(!button)return
    const action=button.dataset.outdoorAction,id=button.dataset.id
    try {
      if(action==='add'){showView('plants');$('[data-outdoor-title]').textContent='Új növény';editPlant()}
      else if(action==='global-settings'){document.dispatchEvent(new CustomEvent('grapes:open-global-settings'))}
      else if(action==='catalog'){showView('catalog');$('[name=query]').focus()}
      else if(action==='edit')editPlant(state.plants.find(p=>p.id===id))
      else if(action==='cancel'){editor.hidden=true;editor.replaceChildren()}
      else if(action==='delete'){
        if(confirm('Törlöd ezt a növénypéldányt és a hozzá tartozó naplót, teendőket?'))save({type:'deletePlant',id})
      }else if(action==='log')logForm(id)
      else if(action==='complete')save({type:'completeTask',id})
      else if(action==='postpone'){
        const task=state.tasks.find(t=>t.id===id)
        openForm(`<form data-outdoor-form="postpone" data-id="${id}"><h2>Teendő halasztása</h2><label>Új dátum<input type="date" name="due" required min="${addDays(task.due>localDay()?task.due:localDay(),1)}" value="${addDays(task.due>localDay()?task.due:localDay(),1)}"></label><div class="outdoor-actions"><button>Halasztás mentése</button>${cancel}</div></form>`)
      }else if(action==='task')openForm(`<form data-outdoor-form="task" data-id="${id}"><h2>Új növényteendő</h2><label>Teendő<input name="title" required maxlength="160"></label><label>Típus<select name="kind"><option value="other">Egyéb</option><option value="watering">Locsolás</option><option value="wintering">Teleltetés</option></select></label><label>Esedékesség<input type="date" name="due" value="${localDay()}" required></label><div class="outdoor-actions"><button>Mentés</button>${cancel}</div></form>`)
      else if(action==='catalogAdd'){
        const taxon=button.catalogTaxon
        editPlant({name:taxon.name,species:taxon.scientificName,catalogId:taxon.id})
      }else if(action==='location'){showView('settings');openForm(`<form data-outdoor-form="city"><h2>Helyi időjárás</h2><label>Város<input name="city" required minlength="2"></label><button>Város keresése</button></form><div data-outdoor-cities></div><div class="outdoor-actions"><button type="button" data-outdoor-action="geolocate">Helymeghatározás egyszer</button>${cancel}</div><p>A helyadat csak ezen az eszközön marad; az előrejelzéshez az Open-Meteo kapja meg a koordinátákat.</p>`)}
      else if(action==='geolocate'){
        if(!navigator.geolocation)throw Error('A helymeghatározás nem támogatott. Válassz várost.')
        const pinned=profile
        navigator.geolocation.getCurrentPosition(position=>{
          if(String(getProfile()||'local')!==pinned)return
          locationSelected({name:'Saját helyszín',latitude:position.coords.latitude,longitude:position.coords.longitude}).catch(e=>status(e.message,true))
        },()=>status('A helymeghatározás nem engedélyezett vagy nem elérhető. Válassz várost.',true),{timeout:10000,maximumAge:300000})
      }
    }catch(error){status(error.message,true)}
  })
  root.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-outdoor-form]');if(!form)return
    event.preventDefault()
    const mode=form.dataset.outdoorForm,id=form.dataset.id,data=new FormData(form),pinned=profile
    const values=Object.fromEntries(data)
    const submit=form.querySelector('button[type=submit],button:not([type])');if(submit)submit.disabled=true
    try{
      if(mode==='catalog'){
        const epoch=++searchEpoch
        status('Növénykatalógus keresése…')
        $('[data-outdoor-results]').replaceChildren()
        const results=await searchPlantCatalog(values.query)
        if(epoch!==searchEpoch||pinned!==String(getProfile()||'local'))return
        const target=$('[data-outdoor-results]');target.replaceChildren()
        for(const taxon of results){
          const article=document.createElement('article');article.className='outdoor-card'
          const name=document.createElement('h3');name.textContent=taxon.name
          const species=document.createElement('p');species.textContent=taxon.scientificName
          const source=document.createElement('a');source.href=taxon.url;source.target='_blank';source.rel='noopener noreferrer';source.textContent='iNaturalist adatlap'
          const add=document.createElement('button');add.type='button';add.dataset.outdoorAction='catalogAdd';add.catalogTaxon=taxon;add.textContent='Saját példány hozzáadása'
          article.append(name,species,source,add);target.append(article)
        }
        status(results.length?`${results.length} találat. Minden hozzáadás külön növénypéldány.`:'Nincs találat. Próbáld az angol vagy tudományos nevet, vagy vegyél fel saját növényt.')
        return
      }
      if(mode==='city'){
        const cities=await searchCities(values.city)
        if(pinned!==String(getProfile()||'local')||!form.isConnected)return
        const target=$('[data-outdoor-cities]');target.replaceChildren()
        for(const city of cities){const button=document.createElement('button');button.type='button';button.textContent=city.name;button.addEventListener('click',()=>locationSelected(city).catch(e=>status(e.message,true)));target.append(button)}
        if(!cities.length)status('Nincs ilyen város. Próbálj másik nevet.',true)
        return
      }
      if(mode==='plant'){
        const file=data.get('photo')
        const selectedPhoto=values.removePhoto?'':file?.size ? await resizePhoto(file) : photo
        if(!form.isConnected||pinned!==String(getProfile()||'local'))throw Error('A növényűrlap vagy a fiók megváltozott.')
        save({type:'savePlant',id:id||undefined,plant:{...values,photo:selectedPhoto,catalogId}})
      }else if(mode==='log')save({type:'log',plantId:id,...values})
      else if(mode==='task')save({type:'addTask',plantId:id,...values})
      else if(mode==='postpone')save({type:'postponeTask',id,...values})
      editor.hidden=true;editor.replaceChildren()
    }catch(error){status(error.message,true)}finally{if(submit)submit.disabled=false}
  })
  return {load(){try{checkProfile();state=store.read();render();showView(activeView);refreshWeather()}catch(error){status(error.message,true);$('[data-outdoor-plants]').textContent='Az eredeti mentés megmaradt. A tárhelyhibát javítani kell a folytatáshoz.'}},handleBack(){if(!editor.hidden && !confirm('Bezárod a nem mentett űrlapot?'))return true;if(!editor.hidden){editor.hidden=true;editor.replaceChildren();return true}if(activeView!=='plants'){showView('plants');searchEpoch++;return true}return false}}
}
async function resizePhoto(file){
  if(file.size>10*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Legfeljebb 10 MB-os JPEG/PNG/WebP fotót válassz.')
  const bitmap=await createImageBitmap(file)
  try{
    const scale=Math.min(1,800/Math.max(bitmap.width,bitmap.height))
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale))
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height)
    const result=canvas.toDataURL('image/jpeg',.8)
    if(result.length>1500000)throw Error('A fotó túl nagy. Válassz kisebb képet.')
    return result
  }finally{bitmap.close()}
}
