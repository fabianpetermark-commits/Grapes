#!/usr/bin/env node
// Grapes: read-only, public GitHub project context (no tokens or writes).
// Usage: node scripts/grapes-context.mjs [--json] [--offline]
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'

const repo = 'fabianpetermark-commits/Grapes'
const api = 'https://api.github.com/repos/' + repo
const production = 'codex/android-app'
const test = 'integration/grapes-test-food-20261017'
const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log('node scripts/grapes-context.mjs [--json] [--offline]')
} else if (args.some(item => item !== '--json' && item !== '--offline')) {
  console.error('Ismeretlen argumentum: --json vagy --offline használható.')
  process.exitCode = 2
} else if (args.includes('--offline')) {
  console.log(await readFile('docs/GRAPES_PROJECT_CONTEXT.md', 'utf8'))
} else {
  async function github(path) {
    const response = await fetch(api + path, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'grapes-context-readonly' },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw Error('GitHub HTTP ' + response.status + ': ' + path)
    return response.json()
  }
  try {
    const [meta, prod, qa, releases, pulls, version] = await Promise.all([
      github(''),
      github('/branches/' + encodeURIComponent(production)),
      github('/branches/' + encodeURIComponent(test)),
      github('/releases?per_page=30'),
      github('/pulls?state=open&per_page=100'),
      github('/contents/android-health-connect-poc/test-release.json?ref=' + encodeURIComponent(test)),
    ])
    let testVersion = null
    try {
      const decoded = Buffer.from(String(version.content || '').replace(/\s/g, ''), 'base64').toString('utf8')
      const parsed = JSON.parse(decoded)
      testVersion = { versionCode: parsed.versionCode, versionName: parsed.versionName }
    } catch { /* GitHub response might change; do not guess */ }
    const stable = releases.find(x => !x.prerelease && /^android-v\d+$/.test(x.tag_name))
    const preview = releases.find(x => x.prerelease && /^android-test-v\d+$/.test(x.tag_name))
    const toRelease = item => item ? {
      tag: item.tag_name, url: item.html_url, publishedAt: item.published_at,
    } : null
    const current = {
      checkedAt: new Date().toISOString(),
      repository: repo,
      defaultBranch: meta.default_branch,
      production: { branch: production, head: prod.commit.sha, release: toRelease(stable) },
      test: { branch: test, head: qa.commit.sha, release: toRelease(preview), declaredVersion: testVersion },
      openPullRequests: pulls.map(x => ({
        number: x.number, title: x.title, base: x.base.ref, head: x.head.ref, url: x.html_url,
      })),
      note: 'A GitHub-kiadás NEM igazolja a telefonra való telepítést. TEST és éles adat elkülönítve.',
    }
    if (args.includes('--json')) {
      console.log(JSON.stringify(current, null, 2))
    } else {
      const lines = [
        '# Grapes: friss GitHub-státusz',
        'Ellenőrizve (UTC): ' + current.checkedAt,
        'Repo: https://github.com/' + repo,
        'Default GitHub ág: ' + meta.default_branch + ' (nem feltétlenül az éles Android!)',
        'Éles forrás: ' + production + ' / ' + prod.commit.sha.slice(0, 12),
        'Éles Android kiadás: ' + (stable ? stable.tag_name + ' — ' + stable.html_url : 'nem található'),
        'TEST forrás: ' + test + ' / ' + qa.commit.sha.slice(0, 12),
        'TEST kiadás: ' + (preview ? preview.tag_name + ' — ' + preview.html_url : 'nem található'),
        'TEST deklarált verzió: ' + (testVersion ? testVersion.versionName : 'ismeretlen'),
        '',
        '## Nyitott PR-ok',
        ...current.openPullRequests.map(x => '#'+x.number+' '+x.title+' ('+x.head+' → '+x.base+') '+x.url),
        '',
        'Ez nyilvános GitHub-státusz, nem a készülék telepített állapota.',
        'Olvasd el az AGENTS.md és docs/GRAPES_PROJECT_CONTEXT.md fájlokat.',
        'Merge/release és adatváltoztatás csak külön jóváhagyással.',
      ]
      console.log(lines.join('\n'))
    }
  } catch (error) {
    console.error('Nem sikerült lekérni a GitHub állapotát: ' + error.message)
    console.error('Offline állapot: node scripts/grapes-context.mjs --offline')
    process.exitCode = 1
  }
}
