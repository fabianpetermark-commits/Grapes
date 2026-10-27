import {readWaterStoreStrict} from './water-backup.js'
import {parseHealthBridgeExport} from '../food/food-health-import.js'
import {getAndroidSamsungWaterStatus,readAndroidSamsungHealthExport,readAndroidSamsungHealthExportSilent} from '../android-bridge.js'
export const WATER_KEY='grapes-water-v1'
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
export const validSamsungOwner = owner => typeof owner==='string'&&UUID.test(owner)
export function samsungConsentKey(owner){if(!validSamsungOwner(owner))throw Error('Ellenőrzött Grapes-fiók szükséges.');return 'grapes-samsung-auto-water-v1:'+owner.toLowerCase()}
export function waterForSamsungOwner(all,owner){
  const result={}
  for(const [day,value] of Object.entries(all)) result[day]={...value,entries:value.entries.filter(e=>!e.samsungOwnerId || (validSamsungOwner(owner)&&e.samsungOwnerId===owner))}
  return result
}
// Only Samsung imports are new owner-tagged records. Legacy manual/HC Water
// stays in the original store and is protected by the existing PROD owner gate.
export function mergeWaterForSamsungOwner(all,visible,owner){
  for(const value of Object.values(visible))for(const entry of value.entries){
    if(entry.samsungOwnerId && (!validSamsungOwner(owner)||entry.samsungOwnerId!==owner))throw Error('Más Grapes-fiók Samsung-vízadata nem állítható vissza.')
  }
  const result=structuredClone(visible)
  for(const [date,day] of Object.entries(all)){
    const hidden=day.entries.filter(e=>e.samsungOwnerId && e.samsungOwnerId!==owner)
    if(hidden.length){result[date] ||= {...day,entries:[]};result[date].entries.push(...structuredClone(hidden))}
  }
  return readWaterStoreStrict({getItem:()=>JSON.stringify(result)})
}
function localDate(iso){const d=new Date(iso);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export function prepareSamsungWater(source,all,owner,{requireOwner=true}={}){
  if(!validSamsungOwner(owner))throw Error('Ellenőrzött Grapes-fiók szükséges.')
  const payload=typeof source==='string'?JSON.parse(source):source
  if(requireOwner && payload?.ownerId!==owner)throw Error('A Samsung-válasz másik Grapes-fiókhoz tartozik.')
  const parsed=parseHealthBridgeExport(payload)
  const next=structuredClone(all)
  const keys=new Set(Object.values(all).flatMap(d=>d.entries).filter(e=>e.samsungOwnerId===owner || !e.samsungOwnerId).map(e=>e.externalKey))
  let imported=0,duplicates=0
  for(const record of parsed.records){
    const amount=Number(record?.volumeMilliliters),at=new Date(record?.startTime)
    if(record?.type!=='hydration'||!/^samsunghealth:[a-z0-9_.-]{1,120}:[^\r\n]{1,256}$/i.test(record.externalId||'') || !Number.isFinite(amount)||amount<=0||amount>100000||!Number.isFinite(at.getTime()) || at.getTime()>Date.now()+86400000)throw Error('Érvénytelen Samsung-vízrekord; semmit sem importáltunk.')
    if(keys.has(record.externalId)){duplicates++;continue}
    const date=localDate(at.toISOString());next[date] ||= {goal:2000,entries:[]}
    next[date].entries.push({id:crypto.randomUUID(),amount,at:at.toISOString(),externalKey:record.externalId,source:'Samsung Health',samsungOwnerId:owner})
    keys.add(record.externalId);imported++
  }
  return {data:next,imported,duplicates}
}
export function createSamsungWaterSync({storage=localStorage,getStatus=getAndroidSamsungWaterStatus,read=readAndroidSamsungHealthExport,readSilent=readAndroidSamsungHealthExportSilent,onOwner=()=>{},onChange=()=>{},now=()=>Date.now()}={}){
  let busy=false
  const lastAttempt=new Map()
  async function status(){const current=await getStatus();onOwner(validSamsungOwner(current.ownerId)?current.ownerId:null);return current}
  async function assertOwner(owner){const current=await status();if(current.ownerId!==owner||!validSamsungOwner(owner))throw Error('A Grapes-fiók megváltozott.');return current}
  function enabled(owner){return validSamsungOwner(owner)&&storage.getItem(samsungConsentKey(owner))==='1'}
  async function setEnabled(owner,value){
    const current=await assertOwner(owner)
    if(value && (!current.available||!current.permitted))throw Error('Előbb engedélyezd a Samsung Health vízadatainak olvasását.')
    const key=samsungConsentKey(owner)
    storage.setItem(key,value?'1':'0')
    if(storage.getItem(key)!==(value?'1':'0'))throw Error('Az automatikus frissítés beállítása nem menthető.')
    if(!value)lastAttempt.delete(owner)
  }
  async function importSource(owner,source,{requireOwner=true}={}){
    await assertOwner(owner)
    const before=storage.getItem(WATER_KEY)
    const all=readWaterStoreStrict(storage)
    const result=prepareSamsungWater(source,all,owner,{requireOwner})
    await assertOwner(owner)
    if(storage.getItem(WATER_KEY)!==before)throw Error('A Víznapló közben változott. Ismételd meg a beolvasást.')
    if(result.imported){
      const encoded=JSON.stringify(result.data)
      storage.setItem(WATER_KEY,encoded)
      if(storage.getItem(WATER_KEY)!==encoded)throw Error('A Víznapló tartós mentése nem ellenőrizhető.')
      onChange()
    }
    return {imported:result.imported,duplicates:result.duplicates}
  }
  async function refresh({manual=false,fromDate}={}){
    if(busy)return {skipped:'busy'}
    busy=true
    try{
      const current=await status(),owner=current.ownerId
      if(!validSamsungOwner(owner))throw Error('A közvetlen Samsung-vízolvasáshoz ellenőrzött natív Grapes-fiók szükséges.')
      if(!current.available)throw Error(current.reason||'A licencelt Samsung Health Data SDK hiányzik. Használd a CSV- vagy Health Connect alternatívát.')
      if(!manual){
        if(!enabled(owner))return {skipped:'disabled'}
        if(!current.permitted)throw Error('A Samsung Health vízadat-olvasási engedélyét visszavonták.')
        if(now()-(lastAttempt.get(owner)??-Infinity)<30*60*1000)return {skipped:'cooldown'}
        lastAttempt.set(owner,now())
      }
      if(!fromDate){const from=new Date(now());from.setDate(from.getDate()-90);fromDate=localDate(from.toISOString())}
      const source=await (manual?read:readSilent)(fromDate,owner)
      if(!manual&&!enabled(owner))return {skipped:'disabled'}
      return await importSource(owner,source)
    }finally{busy=false}
  }
  return {status,enabled,setEnabled,refresh,importSource,clearOwner(){onOwner(null)}}
}
