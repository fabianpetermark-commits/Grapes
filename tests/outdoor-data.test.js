import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyOutdoor,applyOutdoor,createOutdoorStore,addDays,validDay} from '../src/outdoor/outdoor-data.js'
import {searchPlantCatalog,searchCities,readOutdoorWeather,weatherSummary} from '../src/outdoor/outdoor-api.js'
const today='2026-10-27'
const add=(s,name='Paradicsom')=>applyOutdoor(s,{type:'savePlant',plant:{name,wateringDays:3}},today)
function memory(){const data=new Map();return{data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}}
test('identical species remain separate instances; edit/delete do not affect other plant',()=>{
  let s=add(add(emptyOutdoor()));const [a,b]=s.plants
  assert.notEqual(a.id,b.id);assert.equal(s.tasks.length,2)
  s=applyOutdoor(s,{type:'savePlant',id:a.id,plant:{...a,name:'Terasz',wateringDays:5}},today)
  assert.equal(s.plants[1].name,'Paradicsom')
  s=applyOutdoor(s,{type:'deletePlant',id:a.id},today)
  assert.deepEqual(s.plants.map(p=>p.id),[b.id]);assert.equal(s.tasks.length,1)
})
test('watering and wintering logs, recurrence, postponement and completion',()=>{
  let s=add(emptyOutdoor());const p=s.plants[0]
  s=applyOutdoor(s,{type:'log',plantId:p.id,kind:'watering',date:today,note:'Talaj ellenőrizve'},today)
  assert.equal(s.tasks[0].due,'2026-10-30')
  s=applyOutdoor(s,{type:'postponeTask',id:s.tasks[0].id,due:'2026-11-01'},today)
  assert.equal(s.tasks[0].due,'2026-11-01')
  s=applyOutdoor(s,{type:'completeTask',id:s.tasks[0].id},today)
  assert.equal(s.logs.length,2);assert.equal(s.tasks.filter(t=>t.status==='pending').length,1)
  assert.throws(()=>applyOutdoor(s,{type:'completeTask',id:s.tasks[0].id},today),/aktuális/)
  s=applyOutdoor(s,{type:'log',plantId:p.id,kind:'wintering',date:today,note:'Bevittem'},today)
  assert.equal(s.logs.at(-1).type,'wintering')
  assert.throws(()=>applyOutdoor(s,{type:'log',plantId:p.id,kind:'watering',date:'2026-10-28'},today),/jövőben/)
  assert.throws(()=>applyOutdoor(s,{type:'postponeTask',id:s.tasks.find(t=>t.status==='pending').id,due:today},today),/későbbi/)
})
test('offline store survives reload, isolates profiles and detects failed read-back',()=>{
  const storage=memory(),a=createOutdoorStore(storage,'A'),b=createOutdoorStore(storage,'B')
  a.dispatch({type:'savePlant',plant:{name:'A növénye'}},today)
  assert.equal(createOutdoorStore(storage,'A').read().plants[0].name,'A növénye')
  assert.equal(b.read().plants.length,0)
  const broken={getItem:()=>null,setItem:()=>{}}
  assert.throws(()=>createOutdoorStore(broken).dispatch({type:'savePlant',plant:{name:'Lost'}}),/tartós/)
  const quota={getItem:()=>null,setItem:()=>{throw Error('QuotaExceededError')}}
  assert.throws(()=>createOutdoorStore(quota).dispatch({type:'savePlant',plant:{name:'No quota'}}),/Quota/)
})
test('corrupt and unsupported stored data is never overwritten; strict calendar dates',()=>{
  const storage=memory(),store=createOutdoorStore(storage)
  storage.setItem(store.key,'{"version":99}')
  assert.throws(()=>store.dispatch({type:'savePlant',plant:{name:'Fail'}}),/sérült/)
  assert.equal(storage.getItem(store.key),'{"version":99}')
  assert.throws(()=>validDay('2026-02-30'),/dátum/)
  assert.equal(addDays('2026-12-31',1),'2027-01-01')
})
test('HU/EN open catalog filters non-plants, deduplicates, supports partial failure',async()=>{
  const urls=[]
  const result=await searchPlantCatalog('paradicsom',async url=>{urls.push(url);return{ok:true,json:async()=>({results:[{id:1,name:'Solanum lycopersicum',preferred_common_name:'Paradicsom',iconic_taxon_name:'Plantae'},{id:2,name:'Cat',iconic_taxon_name:'Mammalia'}]})}})
  assert.equal(result.length,1);assert.equal(result[0].name,'Paradicsom')
  assert.ok(urls.some(u=>u.includes('locale=hu')));assert.ok(urls.some(u=>u.includes('locale=en')))
  await assert.rejects(searchPlantCatalog('tomato',async()=>{throw Error('offline')}),/offline/)
})
test('real forecast data produces evidence-based warnings, missing/network data fails soft',async()=>{
  const fetcher=async()=>({ok:true,json:async()=>({current:{temperature_2m:8},daily:{time:['2026-10-27'],temperature_2m_min:[-1],temperature_2m_max:[11],precipitation_sum:[2]}})})
  const w=await readOutdoorWeather({latitude:47,longitude:19},fetcher)
  assert.match(weatherSummary(w,'2026-10-27'),/Fagy várható/);assert.match(weatherSummary(w,'2026-10-27'),/Csapadék/);assert.doesNotMatch(weatherSummary(w,'2026-10-27'),/Hőség/)
  assert.doesNotMatch(weatherSummary(null),/Fagy/)
  assert.doesNotMatch(weatherSummary(w,'2026-11-01'),/Fagy várható/)
  assert.match(weatherSummary(w,'2026-11-01'),/elavult/)
  await assert.rejects(readOutdoorWeather({latitude:0,longitude:0},async()=>({ok:true,json:async()=>({})})),/Hiányos/)
  assert.deepEqual(await searchCities('Budapest',async()=>({ok:true,json:async()=>({results:[]})})),[])
})
