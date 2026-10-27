import { localDay } from './outdoor-data.js'
async function json(url, fetcher=fetch) {
  const response=await fetcher(url,{signal:AbortSignal.timeout(12000)})
  if(!response.ok)throw Error('A nyílt adatszolgáltató most nem érhető el.')
  return response.json()
}
export async function searchPlantCatalog(query, fetcher=fetch) {
  const q=String(query||'').trim()
  if(q.length<2)throw Error('Írj be legalább két betűt magyarul vagy angolul.')
  const responses=await Promise.allSettled(['hu','en'].map(locale=>json('https://api.inaturalist.org/v1/taxa/autocomplete?'+new URLSearchParams({q,locale,taxon_id:'47126',is_active:'true',per_page:'15'}),fetcher)))
  if(responses.every(r=>r.status==='rejected'))throw Error('A növénykatalógus nem érhető el. Saját növényt offline is felvehetsz.')
  const seen=new Set(),results=[]
  for(const response of responses) {
    if(response.status!=='fulfilled')continue
    for(const taxon of response.value.results||[]) {
      if(!Number.isSafeInteger(taxon.id)||!taxon.name||seen.has(taxon.id)||!(taxon.iconic_taxon_name==='Plantae'||taxon.ancestor_ids?.includes(47126)))continue
      seen.add(taxon.id)
      results.push({id:String(taxon.id),name:String(taxon.preferred_common_name||taxon.name),scientificName:String(taxon.name),url:'https://www.inaturalist.org/taxa/'+taxon.id})
    }
  }
  return results
}
export async function searchCities(query, fetcher=fetch) {
  if(String(query).trim().length<2)throw Error('Adj meg egy városnevet.')
  const data=await json('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:query.trim(),count:'5',language:'hu',format:'json'}),fetcher)
  return (data.results||[]).filter(x=>Number.isFinite(x.latitude)&&Number.isFinite(x.longitude)).map(x=>({name:[x.name,x.admin1,x.country].filter(Boolean).join(', '),latitude:x.latitude,longitude:x.longitude}))
}
export async function readOutdoorWeather(location,fetcher=fetch) {
  const data=await json('https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({latitude:location.latitude,longitude:location.longitude,current:'temperature_2m,precipitation',daily:'temperature_2m_min,temperature_2m_max,precipitation_sum',forecast_days:'3',timezone:'auto'}),fetcher)
  const daily=data.daily
  if(!Number.isFinite(data.current?.temperature_2m)||!daily||!Array.isArray(daily.time)||!daily.time.length)throw Error('Hiányos időjárásadat érkezett.')
  const days=daily.time.map((date,i)=>({date,min:daily.temperature_2m_min?.[i],max:daily.temperature_2m_max?.[i],rain:daily.precipitation_sum?.[i]}))
  if(days.some(d=>![d.min,d.max,d.rain].every(Number.isFinite)))throw Error('Hiányos időjárásadat érkezett.')
  return {fetchedAt:new Date().toISOString(),temperature:data.current.temperature_2m,days}
}
export function weatherSummary(weather, today=localDay()) {
  if(!weather)return 'Az időjáráshoz válassz várost, vagy engedélyezd egyszer a helymeghatározást.'
  const days=weather.days.filter(d=>d.date>=today)
  if(!days.length)return `Korábbi mérés: ${weather.temperature} °C · Az előrejelzés elavult, frissítés szükséges.`
  const parts=[`${weather.temperature} °C`]
  if(days.some(d=>d.min<=0))parts.push('Fagy várható: ellenőrizd a fagyérzékeny növényeid teleltetési igényét.')
  if(days.some(d=>d.max>=32))parts.push('Hőség várható: ellenőrizd növényeid vízigényét.')
  if(days.some(d=>d.rain>0))parts.push('Csapadék várható; locsolás előtt ellenőrizd a talajt.')
  return parts.join(' · ')
}
