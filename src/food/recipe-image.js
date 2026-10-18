const SAFE_DATA_IMAGE=/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/
const MAX_DATA_URL=180_000
export function normalizeRecipeImageUrl(value) {
  const text=String(value||'')
  if(/^https:\/\//.test(text)&&text.length<=2048)return text
  if(text.length<=MAX_DATA_URL&&SAFE_DATA_IMAGE.test(text))return text
  return ''
}
export async function resizeRecipeImage(file) {
  if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('JPG, PNG vagy WebP képet válassz.')
  if(file.size>10*1024*1024)throw Error('A receptkép legfeljebb 10 MB lehet.')
  const source=await createImageBitmap(file)
  try {
    const ratio=Math.min(1,900/Math.max(source.width,source.height))
    for(const size of [ratio,ratio*.8,ratio*.65,ratio*.5]) {
      const canvas=document.createElement('canvas')
      canvas.width=Math.max(1,Math.round(source.width*size))
      canvas.height=Math.max(1,Math.round(source.height*size))
      const ctx=canvas.getContext('2d',{alpha:false})
      if(!ctx)throw Error('Nem sikerült megnyitni a képfeldolgozót.')
      ctx.drawImage(source,0,0,canvas.width,canvas.height)
      const data=canvas.toDataURL('image/jpeg',.68)
      if(normalizeRecipeImageUrl(data))return data
    }
    throw Error('A kép tömörítés után is túl nagy a recepthez.')
  }finally{source.close?.()}
}
