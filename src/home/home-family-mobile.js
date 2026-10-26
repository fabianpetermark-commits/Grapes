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
  let activePane = 'shopping'
  root.innerHTML = '<div class="household-family-intro"><span class="household-family-eyebrow">HOME / CSALÁDI</span><h2>Közös háztartás</h2><p>A család közös bevásárlása és készlete. A saját Home-listáid külön maradnak.</p></div>' +
    '<div class="household-family-message" data-family-message role="status" aria-live="polite" hidden></div>' +
    '<div class="household-family-setup"><label>Háztartás<select data-family-select aria-label="Közös háztartás"></select></label>' +
    '<button type="button" data-family-reload>Frissítés</button></div>' +
    '<details class="household-family-invites" data-family-manage><summary>Háztartások kezelése · létrehozás / csatlakozás</summary>' +
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
      box.innerHTML = '<div class="household-empty">Válassz egy közös háztartást. Ha nincs még, nyisd meg a „Háztartások kezelése” részt. A saját Home-listáid változatlanok.</div>'
      return
    }
    const role = household.role
    const pending = household.jobs.filter(x => x.status === 'pending')
    const conflict = household.jobs.filter(x => x.status === 'conflict')
    const writable = role === 'owner' || role === 'editor'
    const enabled = writable && !busy && !pending.length && !conflict.length
    const stock = household.state.inventory
    const shopping = household.state.shopping
    const name = households.find(x => x.householdId === household.householdId)?.name || 'Közös háztartás'
    const roleLabel = { owner:'Tulajdonos', editor:'Szerkesztő', viewer:'Megtekintő' }[role] || role
    const householdEnding = household.householdId.slice(-8)
    const accountEnding = native.ownerId.slice(-8)
    // Keep the editing and history panels open when a remote proof causes a rerender.
    const shoppingEditorOpen = Boolean(box.querySelector('[data-family-shopping-editor]')?.open)
    const stockEditorOpen = Boolean(box.querySelector('[data-family-stock-editor]')?.open)
    const boughtOpen = Boolean(box.querySelector('[data-family-purchased]')?.open)
    const inviteOpen = Boolean(inviteCode) || Boolean(box.querySelector('[data-family-invite-details]')?.open)
    const invitation = role === 'owner'
      ? '<details class="household-family-invites" data-family-invite-details' + (inviteOpen ? ' open' : '') +
        '><summary>Családtag meghívása</summary><p class="household-family-note">48 órás, egyszer használható szerkesztői meghívókód.</p>' +
        '<button type="button" data-family-invite>Meghívókód létrehozása</button>' +
        (inviteCode ? '<label>Egyszer megjelenített kód<input data-family-invite-code readonly aria-label="Másolható családi meghívókód" value="' + escape(inviteCode) + '"></label>' : '') +
        '</details>' : ''
    const pendingShopping = shopping.filter(x => x.status !== 'checked')
    const purchased = shopping.filter(x => x.status === 'checked')
    const shoppingRow = item =>
      '<article class="household-family-product"><div class="household-family-product-copy"><strong>' +
      escape(item.name) + '</strong><small>' + escape(displayQuantity(item)) +
      (item.status === 'deferred' ? ' · Később' : '') + '</small></div>' +
      (enabled ? '<button type="button" class="household-family-check" data-family-check="' + escape(item.id) + '">' +
        (item.status === 'checked' ? 'Vissza' : '✓ Megvettem') + '</button>' : '') + '</article>'
    const stockHtml = stock.length ? stock.map(item =>
      '<article class="household-family-product"><div class="household-family-product-copy"><strong>' +
      escape(item.name) + '</strong><small>' + escape(displayQuantity(item)) + '</small></div></article>').join('') :
      '<div class="household-empty">A közös készlet még üres.</div>'
    const shoppingForm = enabled
      ? '<details class="household-family-editor" data-family-shopping-editor' + (shoppingEditorOpen ? ' open' : '') +
        '><summary>+ Termék felvétele</summary><form data-family-shopping><label>Termék neve<input name="name" required maxlength="160"></label>' +
        '<div class="household-fields"><label>Mennyiség<input name="quantity" type="number" min="0.001" step="any" required></label>' +
        '<label>Egység<select name="unit">' + Object.keys(UNITS).map(v => '<option value="' + escape(v) + '">' + escape(v) + '</option>').join('') +
        '</select></label></div><button type="submit">Hozzáadás a közös listához</button></form></details>' : ''
    const stockForm = enabled
      ? '<details class="household-family-editor" data-family-stock-editor' + (stockEditorOpen ? ' open' : '') +
        '><summary>+ Készlet rögzítése</summary><form data-family-stock><label>Élelmiszer neve<input name="name" required maxlength="160"></label>' +
        '<div class="household-fields"><label>Mennyiség<input name="quantity" type="number" min="0.001" step="any" required></label>' +
        '<label>Egység<select name="unit">' + Object.keys(UNITS).map(v => '<option value="' + escape(v) + '">' + escape(v) + '</option>').join('') +
        '</select></label></div><button type="submit">Rögzítés a közös készletben</button></form></details>' : ''
    box.innerHTML =
      '<header class="household-family-context"><span class="household-family-eyebrow">KIVÁLASZTOTT KÖZÖS HÁZTARTÁS</span>' +
      '<h3>' + escape(name) + '</h3><div class="household-family-meta"><span>' + escape(roleLabel) +
      '</span><span>Szinkronrev.: ' + escape(household.revision) + '</span></div>' +
      '<p>A háztartás azonosítója: <strong>…' + escape(householdEnding) + '</strong> · Bejelentkezett fiók: <strong>…' +
      escape(accountEnding) + '</strong></p><p>Az A és B fióknál a háztartás azonosítója legyen azonos. A személyes és a közös lista nem keveredik.</p></header>' +
      (pending.length ? '<div class="household-family-warning" role="status">Offline mentés várakozik: előbb ellenőrizd és próbáld újra.</div>' : '') +
      (conflict.length ? '<div class="household-family-warning" role="alert">Ütközés másik családtag változtatásával. A saját javaslat megőrizve; kézi egyeztetés szükséges.</div>' : '') +
      (pending.length ? '<button type="button" data-family-retry>Függő művelet újrapróbálása</button>' : '') +
      (role === 'viewer' ? '<p class="household-family-note">Csak megtekintési jogosultság.</p>' : '') +
      '<div class="household-family-panes" role="tablist" aria-label="Közös háztartás nézetei">' +
      '<button type="button" role="tab" data-family-pane="shopping" aria-selected="' + String(activePane === 'shopping') +
      '" class="' + (activePane === 'shopping' ? 'is-active' : '') + '">Bevásárlás (' + pendingShopping.length + ')</button>' +
      '<button type="button" role="tab" data-family-pane="stock" aria-selected="' + String(activePane === 'stock') +
      '" class="' + (activePane === 'stock' ? 'is-active' : '') + '">Készlet (' + stock.length + ')</button></div>' +
      '<section data-family-shopping-panel role="tabpanel"' + (activePane === 'shopping' ? '' : ' hidden') + '>' +
      '<p class="household-family-pane-hint">Csak ennek a háztartásnak a közös listája. A pipálás ismert mennyiségnél a közös készletet növeli.</p>' +
      shoppingForm +
      (pendingShopping.length ? pendingShopping.map(shoppingRow).join('') : '<div class="household-empty">Nincs hátralévő közös bevásárlás.</div>') +
      (purchased.length ? '<details class="household-family-purchased" data-family-purchased' + (boughtOpen ? ' open' : '') +
        '><summary>Megvett tételek (' + purchased.length + ')</summary>' +
        purchased.map(shoppingRow).join('') + '</details>' : '') + '</section>' +
      '<section data-family-stock-panel role="tabpanel"' + (activePane === 'stock' ? '' : ' hidden') + '>' +
      '<p class="household-family-pane-hint">A családi készlet, nem a saját Home készleted.</p>' +
      stockForm + stockHtml + '</section>' +
      (invitation ? '<details class="household-family-extra" data-family-settings><summary>Háztartás beállításai és meghívás</summary>' +
        invitation + '</details>' : '')
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
      if (household?.householdId !== householdId) { inviteCode = ''; activePane = 'shopping' }
      $('[data-family-manage]').open = false
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
    if(button.dataset.familyPane) {
      if (!['shopping','stock'].includes(button.dataset.familyPane)) return
      activePane=button.dataset.familyPane
      render()
    } else if(button.hasAttribute('data-family-reload')) {
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
      native=null; outbox=null; household=null; households=[];inviteCode='';activePane='shopping'
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
      epoch++;native=null;outbox=null;household=null;households=[];inviteCode='';activePane='shopping';busy=false
      show('')
      box.replaceChildren()
      root.hidden=true
    },
  })
}
