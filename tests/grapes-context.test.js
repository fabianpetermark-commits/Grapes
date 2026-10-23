import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

test('Grapes project context is permanent, safe and readable offline', () => {
  const guide = readFileSync('AGENTS.md', 'utf8')
  const context = readFileSync('docs/GRAPES_PROJECT_CONTEXT.md', 'utf8')
  const newChat = readFileSync('docs/GRAPES_NEW_CHAT.md', 'utf8')
  assert.match(guide, /codex\/android-app/)
  assert.match(guide, /hu\.grapes\.healthconnect\.test/)
  assert.match(guide, /AGENTS\.md/)
  assert.match(context, /android-test-v9/)
  assert.match(context, /android-v26/)
  assert.match(context, /grapes-water-v1/)
  assert.match(newChat, /ChatGPT Project/)
  assert.match(newChat, /AGENTS\.md/)
  const help = execFileSync(process.execPath, ['scripts/grapes-context.mjs', '--help'], { encoding: 'utf8' })
  assert.match(help, /--offline/)
  const offline = execFileSync(process.execPath, ['scripts/grapes-context.mjs', '--offline'], { encoding: 'utf8' })
  assert.match(offline, /Grapes/)
  assert.match(offline, /codex\/android-app/)
})

test('Grapes context script is valid Node syntax and rejects unsupported flags', () => {
  execFileSync(process.execPath, ['--check', 'scripts/grapes-context.mjs'], { encoding: 'utf8' })
  assert.throws(
    () => execFileSync(process.execPath, ['scripts/grapes-context.mjs', '--unsafe'], { stdio: 'pipe' }),
    /Command failed/,
  )
})
