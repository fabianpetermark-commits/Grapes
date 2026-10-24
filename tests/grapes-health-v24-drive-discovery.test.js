import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverV24DriveFoodFiles } from '../src/sync/grapes-health-v24-drive-discovery.js'

const account = () => ({ id: 'synthetic-permission', email: 'synthetic@example.invalid' })
function fakeDrive(pages) {
  const calls = []
  const request = async (raw, options) => {
    const url = new URL(raw)
    const q = url.searchParams.get('q')
    const token = url.searchParams.get('pageToken') || ''
    calls.push({ url, options })
    return { ok: true, json: async () => pages.get(q + '|' + token) ?? { files: [] } }
  }
  return { request, calls }
}
const folder = (id, name) => ({ id, name, mimeType: 'application/vnd.google-apps.folder' })
const doc = (id, name = 'Health.grapes.json') =>
  ({ id, name, mimeType: 'application/json', version: '2', size: '100' })
const rootQ = "name = 'Grapes TEST' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
const childQ = (name, parent) =>
  `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parent}' in parents`
const filesQ = parent => `'${parent}' in parents and trashed = false`

test('discovers every TEST Health folder page using GET only and excludes E-book', async () => {
  const pages = new Map([
    [rootQ + '|', { files: [folder('root-1', 'Grapes TEST')], nextPageToken: 'next' }],
    [rootQ + '|next', { files: [folder('root-2', 'Grapes TEST')] }],
    [childQ('Projects', 'root-1') + '|', { files: [folder('projects-1', 'Projects')] }],
    [childQ('Projects', 'root-2') + '|', { files: [folder('projects-2', 'Projects')] }],
    [childQ('Ételnapló', 'projects-1') + '|', { files: [folder('food-1', 'Ételnapló')] }],
    [childQ('Ételnapló', 'projects-2') + '|', { files: [folder('food-2', 'Ételnapló')] }],
    [filesQ('food-1') + '|', { files: [doc('health-1'),
      doc('ebook-json', 'E-book.json'), folder('other', 'E-book')] }],
    [filesQ('food-2') + '|', { files: [doc('health-2')]}]
  ])
  const { request, calls } = fakeDrive(pages)
  const result = await discoverV24DriveFoodFiles({ request, getIdentity: account })
  assert.deepEqual(result.files.map(file => file.id), ['health-1', 'health-2'])
  assert.equal(result.rootFolders, 2)
  assert.equal(result.coverage, 'app-visible-only')
  assert.equal(result.contentVerified, false)
  assert.equal(result.originalSourcesUntouched, true)
  assert.ok(calls.every(call => call.options.method === 'GET'))
  assert.ok(calls.every(call => call.url.pathname === '/drive/v3/files'))
  assert.ok(calls.every(call => !call.url.searchParams.has('alt')))
})

test('missing TEST root returns empty without creating folders', async () => {
  const { request, calls } = fakeDrive(new Map())
  const result = await discoverV24DriveFoodFiles({ request, getIdentity: account })
  assert.deepEqual(result.files, [])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.method, 'GET')
})

test('Drive account switch aborts discovery before returning an inventory', async () => {
  let current = account()
  const request = async () => {
    current = { id: 'other', email: 'other@example.invalid' }
    return { ok: true, json: async () => ({ files: [] }) }
  }
  await assert.rejects(discoverV24DriveFoodFiles({
    request, getIdentity: () => current
  }), /changed/)
})

test('invalid or repeated pagination rejects without a partial success', async () => {
  const repeated = fakeDrive(new Map([
    [rootQ + '|', { files: [folder('r', 'Grapes TEST')], nextPageToken: 'again' }],
    [rootQ + '|again', { files: [], nextPageToken: 'again' }]
  ]))
  await assert.rejects(discoverV24DriveFoodFiles({
    request: repeated.request, getIdentity: account
  }), /pagination/)
  const invalid = fakeDrive(new Map([[rootQ + '|', { nextPageToken: '' }]]))
  await assert.rejects(discoverV24DriveFoodFiles({
    request: invalid.request, getIdentity: account
  }), /Invalid Drive/)
})
