import assert from 'node:assert/strict'
import test from 'node:test'

import { buildVCardData, buildWifiData, contrastRatio, normaliseHex, withUtm } from '../src/qr-data.js'

test('normalizes valid HEX colors and rejects invalid values', () => {
  assert.equal(normaliseHex(' AABBCC '), '#aabbcc')
  assert.equal(normaliseHex('#123456'), '#123456')
  assert.equal(normaliseHex('#fff'), null)
})

test('adds encoded UTM values without losing existing query parameters', () => {
  const result = withUtm('https://example.com/page?ref=old', {
    utm_source: 'hírlevél',
    utm_medium: 'email',
    utm_campaign: ''
  })
  const parsed = new URL(result)
  assert.equal(parsed.searchParams.get('ref'), 'old')
  assert.equal(parsed.searchParams.get('utm_source'), 'hírlevél')
  assert.equal(parsed.searchParams.get('utm_medium'), 'email')
  assert.equal(parsed.searchParams.has('utm_campaign'), false)
})

test('escapes reserved Wi-Fi payload characters', () => {
  assert.equal(
    buildWifiData({ type: 'WPA', ssid: 'Office;5G', password: 'a:b,c\\d"e' }),
    'WIFI:T:WPA;S:Office\\;5G;P:a\\:b\\,c\\\\d\\"e;;'
  )
  assert.equal(buildWifiData({ type: 'nopass', ssid: 'Guest' }), 'WIFI:T:nopass;S:Guest;;')
})

test('creates a vCard with real CRLF separators and escaped text', () => {
  const result = buildVCardData({
    name: 'Kovács, János; Senior',
    phone: '+36 30 123 4567\nINJECTED',
    email: 'janos@example.com'
  })
  assert.equal(result.includes('\\nVERSION'), false)
  assert.match(result, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/)
  assert.match(result, /FN:Kovács\\, János\\; Senior/)
  assert.match(result, /TEL:\+36 30 123 4567INJECTED/)
  assert.match(result, /\r\nEND:VCARD$/)
})

test('calculates known contrast ratios', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21)
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1)
})
