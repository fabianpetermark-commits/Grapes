import { parseRecipeImport } from './recipe-import.js'

const MAX_BYTES = 12 * 1024 * 1024
export async function readRecipeImportFile(file, onProgress=()=>{}) {
  if(!file)throw Error('Válassz receptfájlt.')
  if(file.size>MAX_BYTES)throw Error('Legfeljebb 12 MB-os receptfájl tölthető be.')
  const ext=String(file.name||'').split('.').pop().toLocaleLowerCase('hu-HU')
  let text
  if(['txt','md','html','htm','json','csv'].includes(ext))text=await file.text()
  else if(['xlsx','xlsm','xls'].includes(ext)) {
    const XLSX=await import('xlsx')
    const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',sheetRows:110})
    const first=workbook.Sheets[workbook.SheetNames[0]]
    if(!first)throw Error('A táblázat üres.')
    text=XLSX.utils.sheet_to_csv(first,{FS:';',RS:'\n'})
  }else if(ext==='docx') {
    const {default:JSZip}=await import('jszip')
    const zip=await JSZip.loadAsync(await file.arrayBuffer())
    const doc=zip.file('word/document.xml')
    if(!doc)throw Error('A Word-fájl nem tartalmaz olvasható dokumentumot.')
    const xml=await doc.async('string')
    // Text is read locally. XML tags never execute as HTML.
    const parsed=new DOMParser().parseFromString(xml,'application/xml')
    if(parsed.querySelector('parsererror'))throw Error('A Word dokumentuma hibás.')
    text=[...parsed.getElementsByTagName('w:p')].map(paragraph=>paragraph.textContent.trim()).filter(Boolean).join('\n')
    if(!text) {
      // Android WebView can preserve namespace prefixes differently.
      text=xml.replace(/<\/w:p>/g,'\n').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&')
    }
  }else if(['jpg','jpeg','png','webp'].includes(ext)) {
    const {recognizeReceiptImage}=await import('../receipt-ocr.js')
    onProgress('Szövegfelismerés a készüléken…')
    text=await recognizeReceiptImage(file, progress=>onProgress('Szövegfelismerés: '+Math.round(progress*100)+'%'))
    onProgress('A felismert szöveg ellenőrzése szükséges.')
  }else if(ext==='pdf') {
    throw Error('PDF-ből ebben a TEST-verzióban még nincs megbízható szövegkinyerés. Másold be a recept szövegét vagy válassz DOCX/kép fájlt.')
  }else throw Error('Nem támogatott fájl. Használj TXT, MD, HTML, JSON, CSV, XLSX, DOCX vagy képfájlt.')
  if(!text?.trim())throw Error('A fájlból nem sikerült receptszöveget kiolvasni.')
  return parseRecipeImport(text,{fileName:ext==='xlsx'||ext==='xls'||ext==='xlsm'?file.name+'.csv':file.name})
}
export async function readRecipeImportUrl(value) {
  let url
  try{url=new URL(value)}catch{throw Error('A receptlink nem érvényes.')}
  if(url.protocol!=='https:')throw Error('Biztonsági okból csak HTTPS receptlink nyitható meg.')
  if(!url.hostname||url.username||url.password)throw Error('Nem támogatott receptlink.')
  const controller=new AbortController()
  const timeout=setTimeout(()=>controller.abort(),12000)
  try {
    const response=await fetch(url.href,{credentials:'omit',mode:'cors',redirect:'follow',signal:controller.signal,headers:{Accept:'text/html,application/ld+json,application/json,text/plain'}})
    if(!response.ok)throw Error('A receptoldal HTTP '+response.status+' hibát adott.')
    if(Number(response.headers.get('content-length')||0)>512000)throw Error('A receptoldal túl nagy az egyszerű importáláshoz.')
    const text=(await response.text()).slice(0,120000)
    return parseRecipeImport(text)
  }catch(error){
    if(error?.name==='AbortError')throw Error('A receptoldal betöltése túllépte az időkorlátot.')
    if(error instanceof TypeError)throw Error('A weboldal nem engedi a közvetlen receptolvasást (CORS). Másold be a recept szövegét, vagy mentsd fájlba.')
    throw error
  }finally{clearTimeout(timeout)}
}
