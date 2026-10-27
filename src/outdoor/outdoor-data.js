const fail = message => { throw new Error(message) }
const uuid = () => crypto.randomUUID()
const isId = value => typeof value==='string' && /^[0-9a-f-]{36}$/i.test(value)
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max)
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
export function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(Date.parse(value+'T12:00:00Z')) || new Date(value+'T12:00:00Z').toISOString().slice(0,10) !== value) fail('Érvénytelen dátum.')
  return value
}
export function addDays(day, days) {
  validDay(day)
  const date = new Date(day+'T12:00:00Z'); date.setUTCDate(date.getUTCDate()+days)
  return date.toISOString().slice(0,10)
}
export function emptyOutdoor() { return {version:1,revision:0,plants:[],logs:[],tasks:[],location:null} }
export function validateOutdoor(state) {
  if (!state || state.version !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 || !['plants','logs','tasks'].every(k=>Array.isArray(state[k]))) fail('A Növényeim mentés sérült vagy nem támogatott. A korábbi adatokat nem írtuk felül.')
  for(const key of ['plants','logs','tasks']) if(new Set(state[key].map(x=>x.id)).size!==state[key].length) fail('Ismétlődő növényadat-azonosító.')
  for(const p of state.plants) {
    if(!isId(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length>160 || !['species','light','water','soil','wintering','ripening','notes'].every(k=>typeof p[k]==='string') || !(p.wateringDays===null || (Number.isInteger(p.wateringDays) && p.wateringDays>0 && p.wateringDays<=365))) fail('Sérült növényadat.')
    if(p.photo && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.photo)) fail('Érvénytelen saját fotó.')
    if((p.photo||'').length>1500000) fail('A fotó túl nagy.')
  }
  const ids=new Set(state.plants.map(p=>p.id))
  for(const log of state.logs) {
    if(!isId(log.id) || !ids.has(log.plantId) || !['watering','wintering','note'].includes(log.type) || typeof log.note!=='string') fail('Sérült növénynapló.')
    validDay(log.date)
  }
  for(const task of state.tasks) {
    if(!isId(task.id) || !ids.has(task.plantId) || !['watering','wintering','other'].includes(task.type) || !task.title || !['pending','done'].includes(task.status)) fail('Sérült növényteendő.')
    validDay(task.due)
  }
  if(state.location && (!Number.isFinite(state.location.latitude) || Math.abs(state.location.latitude)>90 || !Number.isFinite(state.location.longitude) || Math.abs(state.location.longitude)>180 || typeof state.location.name!=='string')) fail('Érvénytelen helyszín.')
  if(state.weather && (!Number.isFinite(state.weather.temperature) || !Array.isArray(state.weather.days) || !Number.isFinite(Date.parse(state.weather.fetchedAt)) || state.weather.days.some(d=>![d.min,d.max,d.rain].every(Number.isFinite))))fail('Sérült időjárás-gyorsítótár.')
  return state
}
export function normalizePlant(input, id = uuid()) {
  const name=text(input.name,160)
  if(!name) fail('Adj nevet a növénypéldánynak.')
  const wateringDays = input.wateringDays === '' || input.wateringDays == null ? null : Number(input.wateringDays)
  const plant={id,name,wateringDays,photo:input.photo||'',catalogId:text(input.catalogId,40)}
  for(const k of ['species','light','water','soil','wintering','ripening','notes']) plant[k]=text(input[k])
  validateOutdoor({...emptyOutdoor(),plants:[plant]})
  return plant
}
function plantIn(state,id) { return state.plants.find(p=>p.id===id) || fail('A növény már nem található.') }
function nextWaterTask(plant,date) {
  return {id:uuid(),plantId:plant.id,type:'watering',title:'Locsolás',due:date,status:'pending',recurring:true}
}
export function applyOutdoor(state, command, today = localDay()) {
  validateOutdoor(state); validDay(today)
  const next=structuredClone(state)
  if(command.type==='savePlant') {
    const previous=command.id ? plantIn(next,command.id) : null
    const plant=normalizePlant(command.plant,command.id || uuid())
    const index=next.plants.findIndex(p=>p.id===plant.id)
    if(index<0)next.plants.push(plant);else next.plants[index]=plant
    next.tasks=next.tasks.filter(t=>!(t.plantId===plant.id && t.recurring && t.status==='pending' && plant.wateringDays===null))
    if(previous && previous.wateringDays!==plant.wateringDays && plant.wateringDays) {
      const last=next.logs.filter(l=>l.plantId===plant.id&&l.type==='watering').map(l=>l.date).sort().at(-1)
      next.tasks=next.tasks.filter(t=>!(t.plantId===plant.id&&t.recurring&&t.status==='pending'))
      next.tasks.push(nextWaterTask(plant,last?addDays(last,plant.wateringDays):today))
    }
    if(plant.wateringDays && !next.tasks.some(t=>t.plantId===plant.id && t.recurring && t.status==='pending')) next.tasks.push(nextWaterTask(plant,today))
  } else if(command.type==='deletePlant') {
    plantIn(next,command.id)
    next.plants=next.plants.filter(p=>p.id!==command.id)
    next.tasks=next.tasks.filter(t=>t.plantId!==command.id)
    next.logs=next.logs.filter(t=>t.plantId!==command.id)
  } else if(command.type==='log') {
    const plant=plantIn(next,command.plantId)
    const date=validDay(command.date)
    if(date>today)fail('Naplóbejegyzés nem lehet a jövőben.')
    if(!['watering','wintering','note'].includes(command.kind))fail('Ismeretlen naplótípus.')
    next.logs.push({id:uuid(),plantId:plant.id,type:command.kind,date,note:text(command.note)})
    if(command.kind==='watering' && plant.wateringDays) {
      const latest=next.logs.filter(l=>l.plantId===plant.id&&l.type==='watering').map(l=>l.date).sort().at(-1)
      next.tasks=next.tasks.filter(t=>!(t.plantId===plant.id && t.recurring && t.status==='pending'))
      next.tasks.push(nextWaterTask(plant,addDays(latest,plant.wateringDays)))
    }
  } else if(command.type==='addTask') {
    plantIn(next,command.plantId)
    const title=text(command.title,160);if(!title)fail('Adj nevet a teendőnek.')
    next.tasks.push({id:uuid(),plantId:command.plantId,type:command.kind||'other',title,due:validDay(command.due),status:'pending'})
  } else if(command.type==='completeTask' || command.type==='postponeTask') {
    const task=next.tasks.find(t=>t.id===command.id && t.status==='pending')
    if(!task)fail('A teendő már nem aktuális.')
    if(command.type==='postponeTask') {
      const due=validDay(command.due)
      if(due<=task.due || due<today)fail('A halasztás későbbi dátumra történjen.')
      task.due=due
    } else {
      task.status='done';task.completedAt=today
      if(['watering','wintering'].includes(task.type))next.logs.push({id:uuid(),plantId:task.plantId,type:task.type,date:today,note:task.title})
      const plant=plantIn(next,task.plantId)
      if(task.recurring && plant.wateringDays) next.tasks.push(nextWaterTask(plant,addDays(today,plant.wateringDays)))
    }
  } else if(command.type==='location') { next.location=command.location; next.weather=null }
  else if(command.type==='weather') {
    if(!next.location || command.location.latitude!==next.location.latitude || command.location.longitude!==next.location.longitude)fail('A helyszín megváltozott.')
    next.weather=command.weather
  }
  else fail('Ismeretlen Outdoor-művelet.')
  next.revision++
  return validateOutdoor(next)
}

// A single local store, partitioned by the app's existing profile identity.
// Unknown/corrupt state is never replaced with an empty successful save.
export function createOutdoorStore(storage, profile='local') {
  const key='grapes-outdoor-v1:'+encodeURIComponent(profile)
  function read() {
    const raw=storage.getItem(key)
    return raw===null ? emptyOutdoor() : validateOutdoor(JSON.parse(raw))
  }
  return {key,read,dispatch(command,today) {
    const next=applyOutdoor(read(),command,today)
    const encoded=JSON.stringify(next)
    storage.setItem(key,encoded)
    if(storage.getItem(key)!==encoded)fail('A tartós mentés nem ellenőrizhető. Ne zárd be az alkalmazást; próbáld újra.')
    return next
  }}
}
