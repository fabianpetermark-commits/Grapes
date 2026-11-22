// Standalone Google Drive host adapter. It intentionally owns a separate
// token/session namespace and never imports Grapes account or project storage.
// Android uses the native Google Authorization API; browser builds use GIS.
const ANDROID_RESULT_EVENT = 'ebook:android-result'

function isAndroidNative() {
  try { return typeof window.EbookAndroid?.postMessage === 'function' } catch { return false }
}

function androidRequest(method, ...args) {
  if (!isAndroidNative()) return Promise.reject(new Error('A natív Android-kapcsolat nem érhető el.'))
  const requestId = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const finish = callback => {
      window.clearTimeout(timeout)
      window.removeEventListener(ANDROID_RESULT_EVENT, listener)
      callback()
    }
    const listener = event => {
      if (event.detail?.requestId !== requestId) return
      finish(() => event.detail.ok
        ? resolve(event.detail.payload)
        : reject(new Error(event.detail.error || 'Az Android-művelet nem sikerült.')))
    }
    const timeout = window.setTimeout(
      () => finish(() => reject(new Error('Az Android-művelet túllépte az időkorlátot.'))),
      120000,
    )
    window.addEventListener(ANDROID_RESULT_EVENT, listener)
    try { window.EbookAndroid.postMessage(JSON.stringify({ method, args, requestId })) }
    catch (error) { finish(() => reject(error)) }
  })
}

export function createStandaloneEbookPlatform(config) {
  const scope = 'https://www.googleapis.com/auth/drive.file'
  const readScope = 'https://www.googleapis.com/auth/drive.readonly'
  const namespace = config.storageNamespace
  const sessionKey = `${namespace}:drive-session`
  const accountKey = `${namespace}:drive-account`
  const fullReadKey = `${namespace}:drive-full-read`
  const listeners = new Set()
  let accessToken = null
  let expiresAt = 0
  let grantedScopes = scope
  let accountProfile = null
  let connecting = null
  let identityPromise = null
  let expiryTimer = null

  function clearSession() {
    window.clearTimeout(expiryTimer)
    accessToken = null
    expiresAt = 0
    grantedScopes = scope
    accountProfile = null
    try { window.sessionStorage.removeItem(sessionKey) } catch {}
    for (const listener of listeners) listener(false)
  }

  function isDriveConnected() {
    if (accessToken && expiresAt <= Date.now() + 30000) clearSession()
    return Boolean(accessToken)
  }

  function restoreSession() {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(sessionKey))
      if (saved?.clientId === (config.clientId || '') && typeof saved.accessToken === 'string' && saved.expiresAt > Date.now() + 30000) {
        accessToken = saved.accessToken
        expiresAt = saved.expiresAt
        grantedScopes = saved.scopes || scope
        accountProfile = saved.account || null
        expiryTimer = window.setTimeout(clearSession, Math.max(0, expiresAt - Date.now() - 30000))
      } else window.sessionStorage.removeItem(sessionKey)
    } catch {}
  }

  function persistSession() {
    try {
      window.sessionStorage.setItem(sessionKey, JSON.stringify({
        clientId: config.clientId || '', accessToken, expiresAt, scopes: grantedScopes, account: accountProfile,
      }))
    } catch {}
  }

  async function loadGoogleIdentity() {
    if (window.google?.accounts?.oauth2) return
    if (identityPromise) return identityPromise
    identityPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = resolve
      script.onerror = () => reject(new Error('A Google Identity betöltése nem sikerült.'))
      document.head.append(script)
    })
    try { await identityPromise } catch (error) { identityPromise = null; throw error }
  }

  async function rememberAccount(token) {
    try {
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink,permissionId)', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) return
      const user = (await response.json()).user
      if (!user || accessToken !== token) return
      accountProfile = {
        id: user.permissionId || user.emailAddress || '',
        name: user.displayName || user.emailAddress?.split('@')[0] || 'Google',
        email: user.emailAddress || '',
        photo: user.photoLink || '',
      }
      if (accountProfile.email) window.localStorage.setItem(accountKey, accountProfile.email)
    } catch {}
  }

  function acceptAuthorization(result, requestedFullRead) {
    if (!result?.accessToken) throw new Error('A Google nem adott hozzáférési tokent.')
    const scopes = Array.isArray(result.grantedScopes) ? result.grantedScopes.join(' ') : String(result.grantedScopes || '')
    if (requestedFullRead && ![scope, readScope].every(item => scopes.split(/\s+/).includes(item))) {
      throw new Error('A Google nem adta meg mindkét szükséges Drive-engedélyt.')
    }
    accessToken = result.accessToken
    grantedScopes = scopes || scope
    expiresAt = Date.now() + (Number(result.expiresIn) || 3300) * 1000
    window.clearTimeout(expiryTimer)
    expiryTimer = window.setTimeout(clearSession, Math.max(0, expiresAt - Date.now() - 30000))
    if (requestedFullRead) try { window.localStorage.setItem(fullReadKey, '1') } catch {}
  }

  async function connectDrive({ fullRead = false } = {}) {
    const native = isAndroidNative()
    if (!native && !config.clientId) throw new Error('A Google Drive kliensazonosító nincs konfigurálva ehhez az önálló E-book alkalmazáshoz.')
    let preferredFullRead = false
    try { preferredFullRead = window.localStorage.getItem(fullReadKey) === '1' } catch {}
    const requestedFullRead = fullRead || preferredFullRead
    if (isDriveConnected() && (!requestedFullRead || hasFullReadAccess())) return accessToken
    if (connecting) {
      await connecting
      return requestedFullRead && !hasFullReadAccess() ? connectDrive({ fullRead: true }) : accessToken
    }

    if (native) {
      connecting = (async () => {
        const payload = await androidRequest('authorizeGoogleDrive', requestedFullRead)
        const result = typeof payload === 'string' ? JSON.parse(payload) : payload
        acceptAuthorization(result, requestedFullRead)
        await rememberAccount(accessToken)
        persistSession()
        for (const listener of listeners) listener(true)
        return accessToken
      })()
      try { return await connecting } finally { connecting = null }
    }

    await loadGoogleIdentity()
    let loginHint = ''
    try { loginHint = window.localStorage.getItem(accountKey) || '' } catch {}
    connecting = new Promise((resolve, reject) => {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: requestedFullRead ? `${scope} ${readScope}` : scope,
        ...(loginHint ? { login_hint: loginHint } : {}),
        error_callback: error => reject(new Error(error?.type || 'Google Drive bejelentkezési hiba.')),
        callback: async response => {
          if (response.error) return reject(new Error(response.error_description || response.error))
          if (!response.access_token) return reject(new Error('A Google nem adott hozzáférési tokent.'))
          try {
            acceptAuthorization({ accessToken: response.access_token, grantedScopes: response.scope, expiresIn: response.expires_in }, requestedFullRead)
            await rememberAccount(accessToken)
            persistSession()
            for (const listener of listeners) listener(true)
            resolve(accessToken)
          } catch (error) { reject(error) }
        },
      })
      tokenClient.requestAccessToken({ prompt: loginHint ? '' : 'select_account' })
    })
    try { return await connecting } finally { connecting = null }
  }

  async function disconnectDrive({ forgetAccount = false } = {}) {
    const token = accessToken
    if (token && isAndroidNative()) {
      await androidRequest('disconnectGoogleDrive', token).catch(() => {})
    } else if (token && window.google?.accounts?.oauth2?.revoke) {
      await new Promise(resolve => window.google.accounts.oauth2.revoke(token, resolve)).catch(() => {})
    }
    clearSession()
    try { window.localStorage.removeItem(fullReadKey) } catch {}
    if (forgetAccount) try { window.localStorage.removeItem(accountKey) } catch {}
  }

  function getAccessToken() { return isDriveConnected() ? accessToken : null }
  function getConnectedAccount() { return isDriveConnected() && accountProfile?.email ? { ...accountProfile } : null }
  function hasFullReadAccess() {
    return isDriveConnected() && grantedScopes.split(/\s+/).some(item => item === readScope || item === 'https://www.googleapis.com/auth/drive')
  }

  async function driveRequest(url, options = {}) {
    if (!isDriveConnected()) throw new Error('A Google Drive nincs csatlakoztatva. Csatlakoztasd újra.')
    const requestToken = accessToken
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` },
    })
    if (response.status === 401) {
      if (accessToken === requestToken) clearSession()
      throw new Error('A Google Drive kapcsolat lejárt. Csatlakoztasd újra.')
    }
    if (!response.ok) {
      const detail = await response.json().catch(() => null)
      throw new Error(detail?.error?.message || `Drive hiba: ${response.status}`)
    }
    return response
  }

  restoreSession()
  return Object.freeze({
    connectDrive,
    disconnectDrive,
    getConnectedAccount,
    getAccessToken,
    hasFullReadAccess,
    driveRequest,
    isDriveConnected,
    onDriveChange(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    confirm({ title = 'Megerősítés', message = '' } = {}) { return Promise.resolve(window.confirm(`${title}\n\n${message}`)) },
    isNative: isAndroidNative,
    navigate(target) {
      if (target !== 'ebook') return false
      const manager = document.querySelector('#ebook-manager-view')
      if (manager) {
        manager.dataset.ebookMode = 'library'
        manager.dataset.ebookTab = 'metadata'
        manager.scrollTop = 0
      }
      return true
    },
  })
}
