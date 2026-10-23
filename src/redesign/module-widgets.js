/**
 * Grapes TEST-only first implementation of the Brand Guide v1.1 Home/Tools/Finance dashboards.
 * Read-only previews of existing data; writes/navigation remain owned by established modules.
 * This intentionally does NOT modify Auth, Drive data, Finance storage or the global shell.
 */
import { createHomeStore } from '../home/home-store.js';
import { mobileIconSvg } from '../android-mobile-icons.js';

const TEST_ONLY = import.meta.env.VITE_GRAPES_TEST_CHANNEL === '1';
const icon = name => mobileIconSvg(name, 'grapes-widget-icon');
const widget = (name, glyph, body) =>
  `<section class="grapes-dash-widget"><div class="grapes-dash-widget__head"><strong>${icon(glyph)}${name}</strong></div>${body}</section>`;
const action = (type, title, glyph) =>
  `<button type="button" class="grapes-dash-action" data-widget-action="${type}">${icon(glyph)}<span>${title}</span></button>`;
const dock = actions =>
  `<div class="grapes-dash-dock" aria-label="Modul gyorsműveletek"><div class="grapes-dash-dock__pill">${actions.map(a=>action(...a)).join('')}</div></div>`;

const templates = {
  'hub-home': `
    ${widget('Bevásárlólista', 'shopping', `<p class="grapes-dash-muted">Aktuális, még el nem intézett tételek</p>
      <p class="grapes-dash-value" data-dash-shopping-count>—</p>
      <div class="grapes-dash-lines" data-dash-shopping-list><p class="grapes-dash-empty">Betöltés…</p></div>
      <button type="button" class="grapes-dash-link" data-widget-action="shopping">Teljes bevásárlólista →</button>`)}
    ${widget('Készletkezelő', 'household', `<p class="grapes-dash-muted">Csak megerősített, meglévő készlettételek</p>
      <p class="grapes-dash-value" data-dash-inventory-count>—</p>
      <p class="grapes-dash-muted" data-dash-inventory-sub>Betöltés…</p>
      <button type="button" class="grapes-dash-link" data-widget-action="inventory">Készlet megnyitása →</button>`)}
    ${widget('Növények', 'household', `<p class="grapes-dash-muted">Saját növények, gondozás, időjárási jelzések.</p>
      <p class="grapes-dash-empty">Ez a funkció külön Grapes TEST fejlesztésben készül. Itt még nincs valódi növényadat.</p>`)}
    ${dock([['add-shopping','Listaelem','shopping'],['add-inventory','Készlet','household']])}
  `,
  'hub-utility': `
    ${widget('E-book', 'ebook', `<p class="grapes-dash-muted">Folytatás a saját Drive-könyvtáradból</p>
      <p class="grapes-dash-value grapes-dash-value--compact" data-dash-book-title>—</p>
      <p class="grapes-dash-muted" data-dash-book-detail>Betöltés…</p>
      <button type="button" class="grapes-dash-link" data-widget-action="ebook">Könyvtár megnyitása →</button>`)}
    ${widget('QR Stúdió', 'qr', `<p class="grapes-dash-muted">Linkek, szövegek és egyéb adatok QR-kódja. A valódi szerkesztőt nyitja meg.</p>
      <button type="button" class="grapes-dash-primary" data-widget-action="qr">QR Stúdió megnyitása →</button>`)}
    ${dock([['ebook','Könyvek','ebook'],['import-book','Könyv hozzáadása','ebook'],['qr','QR','qr']])}
  `,
  'hub-finance': `
    ${widget('Havi áttekintés', 'finance', `<p class="grapes-dash-muted">Bevételek, kiadások és egyenleg</p>
      <p class="grapes-dash-empty">A meglévő Finance adatait még nem kapcsoltuk az új widgethez. Nem jelenítünk meg kitalált összegeket.</p>
      <button type="button" class="grapes-dash-link" data-widget-action="finance">Pénzügyi napló megnyitása →</button>`)}
    ${widget('Megtakarítások és kimutatások', 'stats', `<p class="grapes-dash-muted">Célok, kategóriák, előrejelzés és az importelőzmények.</p>
      <button type="button" class="grapes-dash-link" data-widget-action="finance">Részletek a Finance modulban →</button>`)}
    ${dock([['finance','Pénzügyi napló','finance']])}
  `
};

export function initGrapesWidgetHubs({
  openHousehold, openEbook, openQR, openFinance, importEbook,
  listBooks, isDriveConnected, storage = globalThis.localStorage
} = {}) {
  if (!TEST_ONLY) return { active: false, refresh() {} };
  const roots = {};
  for (const [page, markup] of Object.entries(templates)) {
    const root = document.querySelector(`[data-page="${page}"]`);
    if (!root) continue;
    root.classList.add('grapes-widget-redesign-on');
    const container = document.createElement('div');
    container.className = 'grapes-widget-redesign';
    container.innerHTML = markup;
    root.append(container);
    roots[page] = container;
    container.addEventListener('click', event => {
      const button = event.target.closest('[data-widget-action]');
      if (!button || !container.contains(button)) return;
      const commands = {
        shopping: () => openHousehold('shopping'),
        inventory: () => openHousehold('inventory'),
        'add-shopping': () => openHousehold('shopping', true),
        'add-inventory': () => openHousehold('inventory', true),
        ebook: openEbook,
        'import-book': importEbook,
        qr: openQR,
        finance: openFinance
      };
      commands[button.dataset.widgetAction]?.();
    });
  }

  function showHome() {
    const root = roots['hub-home'];
    if (!root) return;
    const set = (selector, value) => { const n=root.querySelector(selector); if (n) n.textContent=value; };
    const list = root.querySelector('[data-dash-shopping-list]');
    try {
      // createHomeStore reads and validates a clone; no dispatch or storage write.
      const state = createHomeStore(storage).getState();
      const pending = state.shopping.filter(x => x.status === 'planned');
      set('[data-dash-shopping-count]', `${pending.length} tétel`);
      set('[data-dash-inventory-count]', `${state.inventory.length} tétel`);
      set('[data-dash-inventory-sub]', state.inventory.length ? 'Megerősített készlet ebben az eszközben.' : 'A készleted még üres.');
      list.replaceChildren();
      if (!pending.length) {
        const p = document.createElement('p'); p.className = 'grapes-dash-empty'; p.textContent = 'Nincs nyitott bevásárlólista-tétel.'; list.append(p);
      } else {
        for (const item of pending.slice(0, 3)) {
          const p = document.createElement('p'); p.className='grapes-dash-line'; p.textContent=item.name; list.append(p);
        }
        if (pending.length > 3) {
          const p = document.createElement('p');p.className='grapes-dash-muted';p.textContent=`További ${pending.length - 3} tétel a listában`;list.append(p);
        }
      }
    } catch {
      set('[data-dash-shopping-count]', '—');
      set('[data-dash-inventory-count]', '—');
      set('[data-dash-inventory-sub]', 'A Home mentés nem olvasható biztonságosan. A meglévő adatokat nem módosítottuk.');
      list.replaceChildren();
      const p=document.createElement('p');p.className='grapes-dash-empty';p.textContent='Az összesítő nem elérhető. Ellenőrizd a Home adatait.';list.append(p);
    }
  }

  let requestId = 0;
  async function showTools() {
    const root = roots['hub-utility'];
    if (!root) return;
    const stamp = ++requestId;
    const title = root.querySelector('[data-dash-book-title]');
    const detail = root.querySelector('[data-dash-book-detail]');
    title.textContent = '—';
    if (!isDriveConnected()) {
      detail.textContent = 'A Drive nincs csatlakoztatva; az E-book könyvtár innen nem olvasható.';
      return;
    }
    detail.textContent = 'Könyvtár betöltése…';
    try {
      const books = await listBooks();
      if (stamp !== requestId || document.querySelector('[data-page="hub-utility"]')?.hidden) return;
      if (!books.length) { title.textContent='Nincs könyv';detail.textContent='Még nem töltöttél fel könyvet a Drive-könyvtárba.';return; }
      const readable = books.filter(book => book?.reading);
      const recent = [...readable].sort((a,b)=>(Date.parse(b.reading.updatedAt)||0)-(Date.parse(a.reading.updatedAt)||0))[0] || books[0];
      title.textContent = recent.title || recent.name || 'Könyv';
      detail.textContent = recent.reading
        ? `${Math.round(Math.max(0,Math.min(100,Number(recent.reading.overallPercent)||0)))}% elolvasva · saját könyvtár`
        : `${books.length} könyv a saját könyvtárban`;
    } catch {
      if (stamp !== requestId) return;
      title.textContent = '—';
      detail.textContent = 'A Drive-könyvtár nem tölthető be. A mentett könyvek változatlanok.';
    }
  }

  return {
    active: true,
    refresh(page) {
      if (page === 'hub-home') showHome();
      if (page === 'hub-utility') showTools();
      if (page === 'hub-finance') ++requestId;
    }
  };
}
