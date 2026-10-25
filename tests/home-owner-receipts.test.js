import test from 'node:test'
import assert from 'node:assert/strict'
import { readOwnerFinanceReceipts, scanOwnerFinanceReceipt, receiptLineCandidates, receiptFromOwnerFinance } from '../src/home/home-owner-receipts.js'
const receipts={transactions:[
  {id:'total',type:'expense',amount:5990,date:'2026-10-25',category:'Élelmiszer',receipt:{name:'total.png',type:'image/png',size:1,data:'data:image/png;base64,YQ=='}},
  {id:'bread',type:'expense',amount:499,date:'2026-10-25',category:'Élelmiszer',receipt:{name:'bread.png',type:'image/png',size:1,data:'data:image/png;base64,Yg=='}},
  {id:'planned',type:'expense',planned:true,amount:999,date:'2026-10-25',receipt:{name:'planned.png',type:'image/png',size:1,data:'data:image/png;base64,Yw=='}},
]}
test('Owner Finance OCR only reads provided fiókos source and ignores planned expense',async()=>{
  const before=JSON.stringify(receipts)
  const list=await readOwnerFinanceReceipts(async()=>receipts)
  assert.equal(list.length,2)
  assert.ok(list.every(x=>x.imageAvailable))
  assert.equal((await receiptFromOwnerFinance(receipts,'planned')),null)
  assert.equal(JSON.stringify(receipts),before)
})
test('OCR amount-only cannot create a candidate; missing quantity never inferred',async()=>{
  const total=await scanOwnerFinanceReceipt('total',{readFinance:async()=>receipts,recognize:async()=> 'Végösszeg 5990 Ft\\nBankkártya 5990 Ft'})
  assert.deepEqual(total.candidates,[])
  const bread=await scanOwnerFinanceReceipt('bread',{readFinance:async()=>receipts,recognize:async()=> 'Kenyér 499 Ft\\nVégösszeg 499 Ft'})
  assert.equal(bread.candidates.length,1)
  assert.equal(bread.candidates[0].name,'Kenyér')
  assert.equal(bread.candidates[0].quantity,null)
  assert.equal(bread.candidates[0].unit,null)
  assert.match(bread.candidates[0].sourceId,/^bread:ocr-[0-9a-f]{16}-1$/)
  assert.deepEqual(receiptLineCandidates('5990 Ft\\n499 HUF','total'),[])
})
test('Finance read rejects missing or duplicate transaction IDs',async()=>{
  await assert.rejects(readOwnerFinanceReceipts(async()=>({transactions:[receipts.transactions[0],receipts.transactions[0]]})))
  await assert.rejects(scanOwnerFinanceReceipt('planned',{readFinance:async()=>receipts,recognize:async()=>''}),/nem található/)
})
