import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateDocument, convertDocument, prepareDocument, validDate } from '../src/billing-data.js'
const document = () => ({ type: 'quote', number: 'AJ-2026-0001', currency: 'HUF', date: '2026-10-05', dueDate: '2026-10-10', seller: {name:'Cég'}, customer:{name:'Ügyfél'}, lines:[{name:'Tervezés',quantity:2,price:10000,vat:27,discount:10}] })
test('document totals apply discount before VAT and round each line', () => {
  const totals = calculateDocument(document().lines)
  assert.equal(totals.net,18000); assert.equal(totals.tax,4860); assert.equal(totals.gross,22860)
  const rounded = calculateDocument([{name:'A',quantity:3,price:0.1,vat:27,discount:0}])
  assert.equal(rounded.net,0.3); assert.equal(rounded.tax,0.08); assert.equal(rounded.gross,0.38)
})
test('invalid quantities, discounts, prices and dates are rejected', () => {
  for (const [key,value] of [['quantity',0],['price',-1],['vat',101],['discount',101],['price',Infinity]]) assert.throws(() => calculateDocument([{...document().lines[0],[key]:value}]))
  assert.equal(validDate('2026-02-30'),false); assert.equal(validDate('2024-02-29'),true)
  assert.throws(() => prepareDocument({...document(),dueDate:'2026-10-01'}))
  assert.throws(() => prepareDocument({...document(),lines:[]}))
})
test('document numbers are unique while saved documents remain editable', () => {
  const saved = prepareDocument(document())
  assert.throws(() => prepareDocument(document(),[saved]), /foglalt/)
  assert.equal(prepareDocument(saved,[saved]).id,saved.id)
})
test('quote conversion preserves source and isolates customer and line snapshots', () => {
  const saved = prepareDocument(document())
  const converted = convertDocument(saved,'proforma')
  assert.equal(converted.sourceId,saved.id); assert.equal(converted.id,null)
  assert.equal(converted.type,'proforma'); assert.equal(converted.number,'')
  converted.lines[0].price=1; converted.customer.name='Más'
  assert.equal(saved.lines[0].price,10000); assert.equal(saved.customer.name,'Ügyfél')
})
