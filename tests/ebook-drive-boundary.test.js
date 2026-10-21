import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('E-book retains its own Drive authorization, discovery, import and sync path', async () => {
  const [drive, library, reader] = await Promise.all([
    read('../src/storage/grapes-drive.js'), read('../src/ebook-library.js'), read('../src/ebook-reader-sync.js'),
  ])
  assert.match(drive, /GRAPES_DRIVE_SCOPE = 'https:\/\/www\.googleapis\.com\/auth\/drive\.file'/)
  assert.match(drive, /GRAPES_DRIVE_READ_SCOPE = 'https:\/\/www\.googleapis\.com\/auth\/drive\.readonly'/)
  assert.match(drive, /export async function connectGrapesDrive/)
  assert.match(drive, /export async function grapesDriveRequest/)
  assert.match(library, /connectGrapesDrive/)
  assert.match(library, /grapesDriveHasFullReadAccess/)
  assert.match(library, /getGrapesDriveAccessToken/)
  assert.match(library, /googleapis\.com\/drive\/v3\/files/)
  assert.match(reader, /isGrapesDriveConnected/)
  assert.match(reader, /listDriveBooks/)
  assert.match(reader, /alt=media/)
  assert.match(reader, /uploadType=multipart/)
  for (const source of [drive, library, reader]) assert.doesNotMatch(source, /supabase|compare_and_swap/i)
})
