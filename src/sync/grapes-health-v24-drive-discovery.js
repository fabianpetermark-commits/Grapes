// TEST-only, metadata-only Drive discovery. No OAuth prompt or content download.
// The caller supplies an existing Drive session and request transport.
const API = 'https://www.googleapis.com/drive/v3/files'
const FOLDER = 'application/vnd.google-apps.folder'
const MAX_PAGES = 200
const MAX_FILES = 10000
const escaped = value => value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")

function identityKey(identity) {
  const id = String(identity?.id || '').trim()
  const email = String(identity?.email || '').trim().toLowerCase()
  if (!id || !email) throw new Error('A verified Drive account is required')
  return id + '/' + email
}

export async function discoverV24DriveFoodFiles({ request, getIdentity }) {
  if (typeof request !== 'function' || typeof getIdentity !== 'function') {
    throw new Error('Drive session and read transport are required')
  }
  const owner = identityKey(getIdentity())
  const assertAccount = () => {
    if (identityKey(getIdentity()) !== owner) {
      throw new Error('Drive account changed during Health discovery')
    }
  }
  let totalPages = 0
  let totalFiles = 0
  const list = async q => {
    let pageToken = ''
    const seenTokens = new Set()
    const files = []
    do {
      assertAccount()
      if (++totalPages > MAX_PAGES || seenTokens.has(pageToken)) {
        throw new Error('Drive discovery pagination could not be completed')
      }
      seenTokens.add(pageToken)
      const url = new URL(API)
      url.searchParams.set('q', q)
      url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,parents,version,size,modifiedTime,md5Checksum)')
      url.searchParams.set('pageSize', '100')
      url.searchParams.set('spaces', 'drive')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const response = await request(url.toString(), { method: 'GET' })
      assertAccount()
      if (!response?.ok) throw new Error('Drive discovery request failed')
      const page = await response.json()
      assertAccount()
      if (!page || !Array.isArray(page.files) ||
          (page.nextPageToken != null && typeof page.nextPageToken !== 'string')) {
        throw new Error('Invalid Drive discovery response')
      }
      totalFiles += page.files.length
      if (totalFiles > MAX_FILES) throw new Error('Drive discovery exceeds safe limit')
      for (const file of page.files) {
        if (!file || typeof file.id !== 'string' || !file.id ||
            typeof file.name !== 'string' || typeof file.mimeType !== 'string') {
          throw new Error('Invalid Drive file metadata')
        }
      }
      files.push(...page.files)
      pageToken = page.nextPageToken || ''
    } while (pageToken)
    return files
  }
  const folders = async (name, parentId) => {
    const clauses = [
      `name = '${escaped(name)}'`,
      `mimeType = '${FOLDER}'`,
      'trashed = false'
    ]
    if (parentId) clauses.push(`'${escaped(parentId)}' in parents`)
    return (await list(clauses.join(' and '))).filter(file =>
      file.name === name && file.mimeType === FOLDER)
  }
  const roots = await folders('Grapes TEST')
  const found = new Map()
  for (const root of roots) {
    assertAccount()
    for (const projectFolder of await folders('Projects', root.id)) {
      for (const foodFolder of await folders('Ételnapló', projectFolder.id)) {
        for (const file of await list(`'${escaped(foodFolder.id)}' in parents and trashed = false`)) {
          if (file.mimeType !== 'application/json' ||
              !file.name.endsWith('.grapes.json')) continue
          const previous = found.get(file.id)
          if (previous && JSON.stringify(previous) !== JSON.stringify(file)) {
            throw new Error('Conflicting Drive metadata for one file')
          }
          found.set(file.id, file)
        }
      }
    }
  }
  assertAccount()
  return Object.freeze({
    account: owner,
    files: [...found.values()].sort((a, b) => a.id.localeCompare(b.id)),
    rootFolders: roots.length,
    coverage: 'app-visible-only',
    contentVerified: false,
    originalSourcesUntouched: true
  })
}
