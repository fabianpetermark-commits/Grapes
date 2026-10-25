import { requestAndroidYazio } from '../android-bridge.js'
import { readYazioApiBundle, yazioDateRange } from './yazio-api-import.js'

/**
 * Fresh-owner TEST-only, *one-shot* YAZIO session.
 * Credentials are supplied for this import only; never use Android's global
 * remembered account/session, loginSaved, loginRemembered or background sync.
 * Always logout, even on Graph Auth switch, cancellation or API failures.
 */
export async function readFreshOwnerYazioDirect({
  session, email, password, from, to,
  request = requestAndroidYazio,
  checkCancelled = () => {},
  onProgress = () => {},
} = {}) {
  if (!session?.ownerId || typeof session.assertOwner !== 'function' ||
      typeof session.load !== 'function') {
    throw new Error('Nincs hitelesített saját Grapes Food-fiók.')
  }
  const user = await session.assertOwner()
  if (user !== session.ownerId ||
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== 'string' || password.length === 0) {
    throw new Error('A YAZIO egyszeri bejelentkezéséhez e-mail és jelszó szükséges.')
  }
  const days = yazioDateRange(from,to)
  if (days.at(-1) > new Date().toISOString().slice(0,10)) {
    throw new Error('Jövőbeli YAZIO-nap nem kérhető le.')
  }
  const ownerCheck = async () => {
    checkCancelled()
    if (await session.assertOwner() !== user) {
      throw new Error('A Grapes-fiók megváltozott, az import leállt.')
    }
    checkCancelled()
  }
  let yazioSession = ''
  try {
    await ownerCheck()
    const login = await request('login', email.trim(), password)
    yazioSession = String(login?.session || '')
    if (!yazioSession || yazioSession.length > 1024) {
      throw new Error('A YAZIO nem adott érvényes munkamenetet.')
    }
    await ownerCheck()
    const bundle = await readYazioApiBundle({
      from,to,checkCancelled,
      onProgress,
      request: async (method, value) => {
        await ownerCheck()
        const response = await request(method, yazioSession, value)
        await ownerCheck()
        return response
      },
    })
    await ownerCheck()
    return { ownerId:user, bundle }
  } finally {
    if (yazioSession) await request('logout', yazioSession).catch(() => {})
  }
}
