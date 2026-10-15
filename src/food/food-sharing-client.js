import { createMealShare, createRecipeShare } from './food-sharing.js'
import { getGrapesDriveAccessToken, grapesDriveRequest, loadGrapesProject, saveGrapesProject, shareGrapesProject } from '../storage/grapes-drive.js'

const BROKER_URL = import.meta.env?.VITE_FOOD_BROKER_URL || import.meta.env?.VITE_EBOOK_TRANSFER_BROKER_URL || ''
const SHARE_MODULE = 'Ételnapló megosztások'

function nonce() {
  const bytes = new Uint8Array(24); crypto.getRandomValues(bytes)
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
}

export async function foodShareBroker(action, fields = {}, { brokerUrl = BROKER_URL, timeoutMs = 18000 } = {}) {
  if (typeof globalThis.__GRAPES_FOOD_SHARE_TEST__ === 'function') return globalThis.__GRAPES_FOOD_SHARE_TEST__(action, fields)
  const accessToken = getGrapesDriveAccessToken()
  if (!accessToken) throw new Error('A megosztáshoz csatlakoztasd a Google Drive-ot.')
  if (!brokerUrl) throw new Error('A Grapes megosztási postafiók nincs konfigurálva.')
  const requestNonce = nonce()
  const frame = document.createElement('iframe'); frame.hidden = true; frame.title = 'Grapes megosztási postafiók'
  const escaped = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
  const inputs = { action, nonce: requestNonce, accessToken, ...fields }
  frame.srcdoc = `<!doctype html><html><body><form method="post" action="${escaped(brokerUrl)}">${Object.entries(inputs).map(([name, value]) => `<input type="hidden" name="${escaped(name)}" value="${escaped(value)}">`).join('')}</form><script>document.forms[0].submit()<\/script></body></html>`
  return new Promise((resolve, reject) => {
    const cleanup = () => { window.removeEventListener('message', receive); frame.remove(); clearTimeout(timer) }
    const receive = event => {
      if (event.source !== frame.contentWindow || event.data?.type !== 'grapes-food-share-result' || event.data?.nonce !== requestNonce) return
      cleanup()
      if (event.data.status !== 'ok') reject(new Error(event.data.message || 'A megosztási művelet nem sikerült.'))
      else resolve(event.data)
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('A megosztási postafiók nem válaszolt időben.')) }, timeoutMs)
    window.addEventListener('message', receive); document.body.append(frame)
  })
}

export async function registerFoodSharing() {
  const result = await foodShareBroker('food-share-register')
  await cleanupProcessedFoodShares().catch(() => {})
  return result
}

export async function cleanupProcessedFoodShares() {
  const response = await foodShareBroker('food-share-outbox')
  for (const item of response.items || []) {
    try {
      await grapesDriveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.fileId)}`, { method: 'DELETE' })
      await foodShareBroker('food-share-clean', { shareId: item.id })
    } catch { /* A következő kapcsolódás ismét megpróbálja a takarítást. */ }
  }
}

export async function sendMealShare({ project, date, mealType, email }) {
  const recipientEmail = String(email || '').trim().toLocaleLowerCase('hu-HU')
  const recipient = await foodShareBroker('food-share-recipient', { email: recipientEmail })
  if (!recipient.registered) throw new Error('Ez az e-mail-cím még nincs regisztrálva a Grapes megosztási postafiókjába.')
  const share = createMealShare(project, { date, mealType })
  const fileId = await saveGrapesProject({ module: SHARE_MODULE, name: share.id, data: share })
  try {
    await shareGrapesProject(fileId, recipientEmail, 'reader')
    return await foodShareBroker('food-share-send', { recipientEmail, shareType: share.type, shareId: share.id, fileId })
  } catch (error) {
    throw new Error(`A megosztás nem készült el. ${error.message}`)
  }
}

export async function sendRecipeShare({ project, recipeId, email }) {
  const recipientEmail = String(email || '').trim().toLocaleLowerCase('hu-HU')
  const recipient = await foodShareBroker('food-share-recipient', { email: recipientEmail })
  if (!recipient.registered) throw new Error('Ez az e-mail-cím még nincs regisztrálva a Grapes megosztási postafiókjába.')
  const share = createRecipeShare(project, recipeId)
  const fileId = await saveGrapesProject({ module: SHARE_MODULE, name: share.id, data: share })
  await shareGrapesProject(fileId, recipientEmail, 'reader')
  return foodShareBroker('food-share-send', { recipientEmail, shareType: share.type, shareId: share.id, fileId })
}

export async function listFoodShares() {
  const response = await foodShareBroker('food-share-inbox')
  return response.items || []
}

export async function loadFoodShare(item) {
  const file = await loadGrapesProject(item.fileId)
  if (file.module !== SHARE_MODULE || file.data?.id !== item.id) throw new Error('A megosztott tartalom nem ellenőrizhető.')
  return file.data
}

export async function setFoodShareState(shareId, state) {
  return foodShareBroker('food-share-state', { shareId, state })
}
