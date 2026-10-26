import { openHomeFamilyNativeGateway } from './home-family-native.js'
import { createHomeFamilyOutbox } from './home-family-outbox.js'
import { UNITS, displayQuantity } from './home-data.js'

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
const id = () => globalThis.crypto.randomUUID()

/**
 * Isolated shared Home UI. This is NOT the private owner's Home store.
 * Enabled exclusively by two separate TEST gates: Vite flag and Kotlin native RPC.
 * Never copies Food/Finance/private inventory to the household or vice versa.
 */
export function createHomeFamilyUI(root, {
  openNative = openHomeFamilyNativeGateway,
  makeOutbox = createHomeFamilyOutbox,
} = {}) {
  let native = null, outbox = null, household = null, households = []
  let epoch = 0, busy = false, status = '', statusError = false, inviteCode = ''
  root.innerHTML = '<div class="household-family-intro"><h2>Közös családi készlet</h2><p>A saját Home adatait nem osztjuk meg. Külön háztartási készlet és bevásárlólista, hitelesített családi jogosultságokkal.</p></div>' +
    '<div class="household-family-message" data-family-message role="status" aria-live="polite" hidden></div>' +
    '<div class="household-family-setup"><label>Háztartás<select data-family-select aria-label="Közös háztartás"></select></label>' +
    '<button type="button" data-family-reload>Frissítés</button></div>' +
    '<details class="household-family-invites"><summary>Családi háztartás létrehozása / csatlakozás</summary>' +
    '<form data-family-create><label>Háztartás neve<input name="name" maxlength="100" required placeholder="Pl. Otthon"></label><button type="submit">Új háztartás létrehozása</button></form>' +
    '<form data-family-join><label>Meghívókód<input name="code" pattern="[0-9a-fA-F]{64}" minlength="64" maxlength="64" required autocomplete="off" placeholder="64 karakteres kód"></label><button type="submit">Csatlakozás meghívóval</button></form></details>' +
    '<div data-family-content></div>'
  const $ = query => root.querySelector(query)
  const box = $('[data-family-content]')
  const show = (message, err = false) => {
    status = message
    statusError = err
    const el = $('[data-family-message]')
    el.textContent = message
    el.classList.toggle('is-error', err)
    el.hidden = !message
  }
  const valid = async (seq, local = native) => {
    if (!local || epoch !== seq || native !== local) return false
    try { await local.assertActiveOwner() }
    catch { if (epoch === seq) {epoch++;native=null;outbox=null;household=null;households=[];root.hidden=true;box.replaceChildren()} return false }
    return epoch === seq && native === local
  }
  function render() {
    if (!native) return
    const selector = $('[data-family-select]')
    const previous = selector.value
    selector.innerHTML = '<option value="">Válassz háztartást</option>' + households.map(row =>
      '<option value="' + escape(row.householdId) + '">' + escape(row.name || row.householdId) +
      ' · ' + escape(row.role) + '</option>').join('')
    selector.value = household?.householdId || previous || ''
    if (!household) {
      box.innerHTML = '<div class="household-empty">Válassz családi háztartást. Az egyéni készleted változatlan.</div>'
      return
    }
    const role = household.role
    const pending = household.jobs.filter(x => x.status === 'pending')
    const conflict = household.jobs.filter(x => x.status === 'conflict')
    const writable = role === 'owner' || role === 'editor'
    const enabled = writable && !busy && !pending.length && !conflict.length
    const stock = household.state.inventory
    const shopping = household.state.shopping
    const stockHtml = stock.length ? stock.map(item =>
      '<article class="household-card"><strong>' + escape(item.name) + '</strong><p>' +
      escape(displayQuantity(item)) + ' · közös készlet</p></article>').join('') :
      '<div class="household-empty">Még nincs közös készlet.</div>'
    const inviteOpen = Boolean(inviteCode) || Boolean(box.querySelector('[data-family-invite-details]')?.open)
    const invitation = role === 'owner' ? '<details class="household-family-invites" data-family-invite-details' + (inviteOpen ? ' open' : '') + '><summary>Családtag meghívása</summary><p class="household-family-note">48 óráig érvényes szerkesztői meghívókód. Csak annak add tovább, akivel a közös készletet meg szeretnéd osztani.</p><button type="button" data-family-invite>Meghívókód létrehozása</button>' + (inviteCode ? '<label>Egyszer megjelenített meghívókód<input data-family-invite-code readonly aria-label="Másolható családi meghívókód" value="' + escape(inviteCode) + '"></label>' : '') + '</details>' : ''
    const shoppingHtml = shopping.length ? shopping.map(item =>
      '<article class="household-card"><strong>' + escape(item.name) + '</strong><p>' +
      escape(displayQuantity(item)) + ' · ' +
      (item.status === 'checked' ? 'Megvettem' : 'Tervezett') + '</p>' +
      (enabled ? '<button type="button" data-family-check="' + escape(item.id) + '">' +
      (item.status === 'checked' ? 'Vissza a listára' : '✓ Megvettem') + '</button>' : '') +
      '</article>').join('') :
      '<div class="household-empty">Nincs közös bevásárlólistás tétel.</div>'
    box.innerHTML =
      '<div class="household-family-role"><span>Jogosultság: ' + escape(role) +
      '</span><span>Szinkronrev.: ' + escape(household.revision) + '</span></div>' +
      (pending.length ? '<div class="household-family-warning" role="status">Mentésre váró közös változtatás: előbb ellenőrizd és próbáld újra. Második módosítás most nem indítható.</div>' : '') +
      (conflict.length ? '<div class="household-family-warning" role="alert">Ütközés másik családtag változtatásával. A saját javaslat megőrizve; automatikus felülírás nincs. Kézi egyeztetés szükséges.</div>' : '') +
      (pending.length ? '<button type="button" data-family-retry>Függő művelet újrapróbálása</button>' : '') +
      (role === 'viewer' ? '<p class="household-family-note">Csak megtekintési jogosultság.</p>' : '') +
      invitation + '<h3>Közös bevásárlólista</h3>' +
      (enabled ? '<form data-family-shopping><label>Termék neve<input name="name" required maxlength="160"></label><div class="household-fields"><label>Mennyiség<input name="quantity" type="number" min="0.001" step="any" required></label><label>Egység<select name="unit">' + Object.keys(UNITS).map(v => '<option value="' + escape(v) + '">' + escape(v) + '</option>').join('') + '</select></label></div><button type="submit">+ Közös listaelem</button></form>' : '') +
      shoppingHtml + '<h3>Közös készlet</h3>' +
      (enabled ? '<form data-family-stock><label>Élelmiszer<input name="name" required maxlength="160"></label><div class="household-fields"><label>Mennyiség<input name="quantity" type="number" min="0.001" step="any" required></label><label>Egység<select name="unit">' + Object.keys(UNITS).map(v => '<option value="' + escape(v) + '">' + escape(v) + '</option>').join('') + '</select></label></div><button type="submit">+ Készlet rögzítése</button></form>' : '') + stockHtml
  }
  async function selectHousehold(householdId) {
    const seq = epoch, session = native
    if (!session || busy) return
    busy = true
    try {
      if (!householdId) { household = null; inviteCode = ''; render(); return }
      if (!households.some(x => x.householdId === householdId))
        throw new Error('Ez a háztartás nem szerepel a hitelesített listádban.')
      const current = await outbox.cached(householdId)
      if (!await valid(seq, session)) return
      let snapshot = current
      let networkError = null
      try { snapshot = await outbox.refresh(householdId) }
      catch (error) { networkError = error }
      if (!await valid(seq, session)) return
      if (!snapshot) throw networkError || Error('Nincs hitelesített családi pillanatkép.')
      const jobs = await outbox.list(householdId)
      if (!await valid(seq, session)) return
      if (household?.householdId !== householdId) inviteCode = ''
      household = { householdId, revision:snapshot.revision, role:snapshot.role, state:snapshot.state, jobs }
      show(networkError ? 'Csak a korábbi, fiókhoz kötött mentés látszik. ' + networkError.message : '')
      render()
    } catch(error) {
      if (await valid(seq,session)) show(error.message,true)
    } finally { if (epoch === seq) { busy=false; render() } }
  }
  async function refreshHouseholds() {
    const seq = epoch, session = native
    if (!session || busy) return
    busy = true
    try {
      const lists = await session.gateway.list()
      if (!await valid(seq,session)) return
      households=lists
      show('')
      render()
    } catch(error) {
      if (await valid(seq,session)) show('A családi szolgáltatás nem elérhető vagy még nincs telepítve: ' + error.message,true)
    } finally { if(epoch===seq)busy=false }
  }
  async function propose(type,payload) {
    if(!native || !household || busy) return
    const seq=epoch, session=native, target=household.householdId
    if (!['owner','editor'].includes(household.role)) { show('Nincs szerkesztési jogosultság.',true); return }
    busy=true
    try {
      await outbox.enqueue(target, {type,eventId:id(),payload})
      if (!await valid(seq,session)) return
      await settle(target, seq, session)
    } catch(error) {
      if (await valid(seq,session)) { show('A módosítás nem írható felül: ' + error.message,true); render() }
    } finally { if(epoch===seq) { busy=false; render() } }
  }
  async function settle(target,seq,session) {
    let problem=null, result=null
    try { result=await outbox.retry(target) }
    catch(error) { problem=error }
    if (!await valid(seq,session)) return
    const jobs=await outbox.list(target)
    if (!await valid(seq,session)) return
    if (!household || household.householdId !== target) return
    household.jobs=jobs
    if (result?.status === 'committed') {
      const refreshed=await outbox.refresh(target)
      if (!await valid(seq,session)) return
      household={householdId:target,role:refreshed.role,revision:refreshed.revision,state:refreshed.state,
        jobs:await outbox.list(target)}
      show('Közös változtatás mentve és visszaellenőrizve.')
    } else if (result?.status === 'conflict') show('Közös változtatási ütközés. Kézi egyeztetés kell, automatikus felülírás nélkül.',true)
    else show('A módosítás a fiókhoz kötött offline sorban megmaradt. Újrapróbálható. ' + (problem?.message || ''),true)
    if (await valid(seq,session)) render()
  }
  root.addEventListener('change',event=>{
    if(event.target.matches('[data-family-select]')) selectHousehold(event.target.value).catch(()=>{})
  })
  root.addEventListener('click', async event=>{
    const button=event.target.closest('button')
    if(!button || !root.contains(button)) return
    if(button.hasAttribute('data-family-reload')) {
      await refreshHouseholds()
      if(household) await selectHousehold(household.householdId)
    } else if(button.hasAttribute('data-family-retry') && household && !busy) {
      busy=true
      const seq=epoch, session=native
      try { await settle(household.householdId,seq,session) }
      catch(error) { if(await valid(seq,session))show(error.message,true) }
      finally { if(epoch===seq) { busy=false; render() } }
    } else if(button.hasAttribute('data-family-invite') && household?.role === 'owner' && !busy) {
      busy=true
      const seq=epoch, session=native
      try {
        const invite=await session.gateway.createInvite(household.householdId,'editor',48)
        if(!await valid(seq,session))return
        if(typeof invite.inviteCode !== 'string' || !/^[0-9a-f]{64}$/i.test(invite.inviteCode))
          throw Error('A meghívókód nem ellenőrizhető.')
        inviteCode=invite.inviteCode
        render()
        show('A meghívókód elkészült. Csak a kiválasztott családtagnak add át.')
      } catch(error) { if(await valid(seq,session))show(error.message,true) }
      finally {if(epoch===seq){busy=false;render()}}
    } else if(button.dataset.familyCheck && household) {
      const row=household.state.shopping.find(x=>x.id===button.dataset.familyCheck)
      if(row) await propose('ShoppingItemStatusChanged',{id:row.id,status:row.status==='checked'?'planned':'checked'})
    }
  })
  root.addEventListener('submit',async event=>{
    if(!event.target.matches('[data-family-create],[data-family-join],[data-family-shopping],[data-family-stock]'))return
    event.preventDefault()
    if(!native || busy)return
    const form=event.target, data=Object.fromEntries(new FormData(form))
    if(form.matches('[data-family-shopping]'))return propose('ShoppingItemAdded',data)
    if(form.matches('[data-family-stock]'))return propose('StockCountConfirmed',data)
    const seq=epoch, session=native
    busy=true
    try {
      const created=form.matches('[data-family-create]') ?
        await session.gateway.create(data.name) : await session.gateway.acceptInvite(data.code.trim().toLowerCase())
      if(!await valid(seq,session))return
      form.reset()
      households=await session.gateway.list()
      if(!await valid(seq,session))return
      busy=false
      await selectHousehold(created.householdId)
    } catch(error) { if(await valid(seq,session))show(error.message,true) }
    finally { if(epoch===seq)busy=false }
  })
  return Object.freeze({
    async load(expectedOwner) {
      const seq=++epoch
      native=null; outbox=null; household=null; households=[];inviteCode=''
      root.hidden=false
      box.innerHTML='<div class="household-empty">Családi Home-kapcsolat ellenőrzése…</div>'
      show('')
      try {
        const session=await openNative({enabled:true})
        if(seq!==epoch)return
        if(session.ownerId!==expectedOwner)throw Error('A saját és a családi Grapes-fiók eltér.')
        await session.assertActiveOwner()
        if(seq!==epoch)return
        native=session
        outbox=makeOutbox({ownerId:session.ownerId,getActiveOwner:session.assertActiveOwner,gateway:session.gateway})
        await refreshHouseholds()
        if(seq!==epoch)return
        render()
      } catch(error) {
        if(seq===epoch) {native=null;outbox=null;household=null;show(error.message,true);
          box.innerHTML='<div class="household-empty">A családi Home nem aktív. A saját Home tovább működik.</div>'}
      }
    },
    clear() {
      epoch++;native=null;outbox=null;household=null;households=[];inviteCode='';busy=false
      show('')
      box.replaceChildren()
      root.hidden=true
    },
  })
}
