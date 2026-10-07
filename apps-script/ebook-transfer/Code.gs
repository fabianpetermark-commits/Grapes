const CODE_LENGTH = 6;
const BROKER_API_VERSION = 6;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TTL_MS = 20 * 60 * 1000;
const STORE_PREFIX = 'ebook_transfer_';
const READER_PAIR_PREFIX = 'ebook_reader_pair_';
const READER_TOKEN_PREFIX = 'ebook_reader_token_';
const READER_BOOKS_PREFIX = 'ebook_reader_books_';
const READER_BOOK_CHUNK_LENGTH = 1800;
const READER_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const READER_MARKER_TTL_MS = 10 * 60 * 1000;
const FOLDER_NAME = 'Grapes E-book Library';
const ALLOWED_RETURN_URL = 'https://fabianpetermark-commits.github.io/Grapes/';
const ALLOWED_PARENT_ORIGIN = 'https://fabianpetermark-commits.github.io';
const READER_RETURN_URL = 'https://fabianpetermark-commits.github.io/Grapes/ebook-reader.html';
const ALLOWED_BOOK_EXTENSIONS = ['epub', 'pdf', 'mobi', 'azw', 'azw3', 'prc', 'txt', 'cbz', 'cbr'];

// Compatibility for older open Grapes tabs. The retired provider is never called.
function doPost(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'create-reader-pairing') return pairingOutput(createReaderPairingManifestPage(p), p);
  if (p.action !== 'lookup-isbndb') return HtmlService.createHtmlOutput('Unsupported action');
  const nonce = String(p.nonce || '');
  if (!/^[a-f0-9]{48}$/.test(nonce)) return HtmlService.createHtmlOutput('Invalid request');
  const payload = JSON.stringify({ type: 'grapes-isbndb-result', nonce: nonce, status: 'ok', books: [] });
  return HtmlService.createHtmlOutput('<!doctype html><html><body><script>window.top.postMessage(' + payload + ',' + JSON.stringify(ALLOWED_PARENT_ORIGIN) + ')</script></body></html>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || '').toLowerCase();
  const p = (e && e.parameter) || {};
  if (action === 'health') {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, version: BROKER_API_VERSION }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (action === 'create') return pairingOutput(createTransferPage(p), p);
  if (action === 'download') return resolveTransfer(p);
  if (action === 'create-reader-pairing') return pairingOutput(createReaderPairingPage(p), p);
  if (action === 'pair-reader') return pairReader(p);
  if (action === 'reader') return readerLibraryPage(p);
  if (action === 'revoke-reader') return revokeReaderPage(p);
  return HtmlService.createHtmlOutput('<h2>Grapes E-book Transfer</h2><p>Missing action.</p>');
}

// Only code-creation pages can be embedded. Private reader pages retain the
// default frame protection; creation still verifies public sharing or a marker.
function pairingOutput(output, p) {
  if (p.embed === '1') output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return output;
}

function embeddedCodePage(code, label, singleUse, messageType, nonce) {
  const bridge = messageType
    ? '<script>(function(){var payload=' + JSON.stringify({ type: messageType, code: code, nonce: nonce, expiresInSeconds: Math.round(TTL_MS / 1000) }) + ';var target=' + JSON.stringify(ALLOWED_PARENT_ORIGIN) + ';function send(){window.top.postMessage(payload,target)}[0,250,750,1500,3000,6000].forEach(function(delay){setTimeout(send,delay)})})();</script>'
    : '';
  return HtmlService.createHtmlOutput('<!doctype html><html lang="hu"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Párosítási kód</title>' +
    '<style>body{margin:0;padding:24px 12px;background:#fff;color:#111;font:16px Arial,sans-serif;text-align:center;overflow-wrap:anywhere}.code{font-size:36px;font-weight:bold;letter-spacing:.12em;margin:24px 0}</style></head><body>' +
    '<p>' + escapeHtml(label) + '</p><div class="code">' + code + '</div><p>A kód 20 percig érvényes' + (singleUse ? ' és egyszer használható' : '') + '.</p>' + bridge + '</body></html>');
}

function readerPairingError(p, title, message) {
  const nonce = String((p && p.nonce) || '').trim().toLowerCase();
  if (p && p.embed === '1' && /^[a-f0-9]{48}$/.test(nonce)) {
    const payload = JSON.stringify({ type: 'grapes-reader-pairing-error', nonce: nonce, message: message });
    return HtmlService.createHtmlOutput('<!doctype html><html><body><p>' + escapeHtml(message) + '</p><script>(function(){var payload=' + payload + ';var target=' + JSON.stringify(ALLOWED_PARENT_ORIGIN) + ';function send(){window.top.postMessage(payload,target)}[0,300,1000].forEach(function(delay){setTimeout(send,delay)})})();<\/script></body></html>');
  }
  return readerMessagePage(title, message);
}

function normalizeReaderBookRows(raw) {
  let rows;
  try { rows = JSON.parse(String(raw || '[]')); }
  catch (err) { throw new Error('A könyvlista nem olvasható.'); }
  if (!Array.isArray(rows) || rows.length > 2000) throw new Error('A könyvlista mérete érvénytelen.');
  const result = [];
  const seen = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const id = String(row[0] || '').trim();
    const name = String(row[1] || '').trim().slice(0, 240);
    const size = Math.max(0, Number(row[2]) || 0);
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(id) || !isAllowedBook(name) || seen[id]) continue;
    seen[id] = true;
    result.push([id, name, size]);
  }
  return result;
}

function writeReaderBookChunks(props, ownerKey, books) {
  const raw = JSON.stringify(books);
  const count = Math.max(1, Math.ceil(raw.length / READER_BOOK_CHUNK_LENGTH));
  for (let i = 0; i < count; i++) props.setProperty(READER_BOOKS_PREFIX + ownerKey + '_' + i, raw.slice(i * READER_BOOK_CHUNK_LENGTH, (i + 1) * READER_BOOK_CHUNK_LENGTH));
  return count;
}

function readReaderBookChunks(props, ownerKey, count) {
  let raw = '';
  for (let i = 0; i < Number(count || 0); i++) raw += props.getProperty(READER_BOOKS_PREFIX + ownerKey + '_' + i) || '';
  return normalizeReaderBookRows(raw || '[]');
}

function deleteReaderBookChunks(props, ownerKey, count) {
  for (let i = 0; i < Number(count || 0); i++) props.deleteProperty(READER_BOOKS_PREFIX + ownerKey + '_' + i);
}

function createReaderPairingManifestPage(p) {
  const nonce = String(p.nonce || '').trim().toLowerCase();
  const returnUrl = String(p.returnUrl || '').trim();
  if (!/^[a-f0-9]{48}$/.test(nonce) || returnUrl !== READER_RETURN_URL) return readerPairingError(p, 'Érvénytelen párosítás', 'A párosítási kérés hibás vagy nem a hivatalos Grapes olvasóoldalról érkezett.');
  let books;
  try { books = normalizeReaderBookRows(p.books); }
  catch (err) { return readerPairingError(p, 'Érvénytelen könyvlista', err.message); }

  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  let code;
  try {
    cleanupExpiredRecords();
    code = createUniqueCode();
    const chunks = writeReaderBookChunks(props, code, books);
    props.setProperty(READER_PAIR_PREFIX + code, JSON.stringify({ returnUrl: READER_RETURN_URL, expiresAt: Date.now() + TTL_MS, bookChunks: chunks }));
  } catch (err) {
    return readerPairingError(p, 'A párosítás nem sikerült', 'A kód létrehozása közben hiba történt. Kérj új kódot.');
  } finally { lock.releaseLock(); }
  return embeddedCodePage(code, 'Írd be ezt a kódot az e-book olvasón:', true, 'grapes-reader-pairing-code', nonce);
}

function createTransferPage(p) {
  const fileId = String(p.fileId || '').trim();
  const returnUrl = String(p.returnUrl || '').trim();
  if (!fileId || !returnUrl) return HtmlService.createHtmlOutput('<h2>Hiányzó adatok</h2><p>A fileId és returnUrl kötelező.</p>');
  if (returnUrl !== ALLOWED_RETURN_URL) {
    return HtmlService.createHtmlOutput('<h2>Érvénytelen visszatérési cím</h2><p>Az átvitel csak a hivatalos Grapes oldalra térhet vissza.</p>');
  }

  let file;
  try { file = DriveApp.getFileById(fileId); }
  catch (err) { return HtmlService.createHtmlOutput('<h2>Nem sikerült elérni a fájlt.</h2><p>Drive hozzáférési hiba.</p>'); }

  try {
    if (file.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) {
      return HtmlService.createHtmlOutput('<h2>A fájl nincs megosztva</h2><p>A Grapes csak már nyilvános linkkel megosztott e-bookot tud átvinni.</p>');
    }
  } catch (err) {
    return HtmlService.createHtmlOutput('<h2>Megosztási állapot nem ellenőrizhető</h2><p>A fájl nem használható átvitelhez.</p>');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let code;
  try {
    cleanupExpiredRecords();
    code = createUniqueCode();
    PropertiesService.getScriptProperties().setProperty(STORE_PREFIX + code, JSON.stringify({
      fileId: fileId,
      name: file.getName(),
      returnUrl: returnUrl,
      expiresAt: Date.now() + TTL_MS
    }));
  } finally { lock.releaseLock(); }

  if (p.embed === '1') return embeddedCodePage(code, file.getName(), false);
  const base = ScriptApp.getService().getUrl();
  const pairUrl = returnUrl + '?ebook-pair=' + encodeURIComponent(code);
  const downloadUrl = base + '?action=download&code=' + encodeURIComponent(code);
  const qrUrl = 'https://quickchart.io/qr?text=' + encodeURIComponent(pairUrl) + '&size=280';

  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grapes E-book Transfer</title>' +
    '<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:0 auto;padding:32px;text-align:center}img{max-width:280px;width:100%;border:1px solid #ddd;border-radius:12px}.code{font-size:42px;letter-spacing:.18em;font-weight:800;margin:20px 0}.muted{color:#666}a{word-break:break-all}</style></head><body>' +
    '<h1>Grapes E-book Transfer</h1><p>' + escapeHtml(file.getName()) + '</p><img src="' + qrUrl + '" alt="QR-kód"><div class="code">' + code + '</div><p>A kód 20 percig érvényes.</p><p class="muted">QR-kódos párosítás:</p><p><a href="' + escapeHtml(pairUrl) + '">' + escapeHtml(pairUrl) + '</a></p><p><a href="' + escapeHtml(downloadUrl) + '">Közvetlen letöltés</a></p></body></html>'
  );
}

function resolveTransfer(p) {
  const code = String(p.code || '').trim().toUpperCase();
  if (!isPairCode(code)) return HtmlService.createHtmlOutput('<h2>Érvénytelen kód</h2><p>A párosítási kód 6 karakteres.</p>');

  const key = STORE_PREFIX + code;
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return HtmlService.createHtmlOutput('<h2>A kód nem található</h2><p>Lehet, hogy lejárt vagy már felhasználták.</p>');

  const record = JSON.parse(raw);
  if (Date.now() >= Number(record.expiresAt)) {
    PropertiesService.getScriptProperties().deleteProperty(key);
    return HtmlService.createHtmlOutput('<h2>Lejárt kód</h2><p>Kérj új párosítási kódot.</p>');
  }

  try {
    if (DriveApp.getFileById(record.fileId).getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) {
      return HtmlService.createHtmlOutput('<h2>A fájl már nincs megosztva.</h2>');
    }
  } catch (err) { return HtmlService.createHtmlOutput('<h2>A fájl nem érhető el.</h2>'); }

  const downloadUrl = 'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(record.fileId) + '&export=download&confirm=t';
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Letöltés</title><style>body{font-family:system-ui,sans-serif;max-width:620px;margin:0 auto;padding:32px;text-align:center}a{display:inline-block;padding:14px 20px;border-radius:10px;background:#111;color:#fff;text-decoration:none}</style></head><body><h1>Grapes E-book Transfer</h1><p>' + escapeHtml(record.name) + '</p><p><a href="' + escapeHtml(downloadUrl) + '">E-book letöltése</a></p><p><a href="' + escapeHtml(record.returnUrl) + '">Vissza a Grapeshez</a></p></body></html>');
}

function createReaderPairingPage(p) {
  const markerId = String(p.markerId || '').trim();
  const nonce = String(p.nonce || '').trim().toLowerCase();
  const returnUrl = String(p.returnUrl || '').trim();
  if (!markerId || !/^[a-f0-9]{48}$/.test(nonce) || returnUrl !== READER_RETURN_URL) {
    return readerMessagePage('Érvénytelen párosítás', 'A párosítási kérés hibás vagy nem a hivatalos Grapes olvasóoldalról érkezett.');
  }

  let marker;
  try { marker = DriveApp.getFileById(markerId); }
  catch (err) { return readerMessagePage('A párosítás nem indítható', 'A hitelesítő fájl nem érhető el.'); }

  try {
    if (marker.isTrashed()) return readerMessagePage('A párosítás már felhasznált', 'Kérj új párosítási kódot a Grapes könyvtárkezelőből.');
    const payload = JSON.parse(marker.getBlob().getDataAsString());
    const createdAt = Number(payload.createdAt);
    if (payload.kind !== 'grapes-reader-pairing' || String(payload.nonce || '').toLowerCase() !== nonce || !createdAt || Date.now() - createdAt > READER_MARKER_TTL_MS || createdAt - Date.now() > 60000) {
      return readerMessagePage('Lejárt vagy hibás párosítás', 'Kérj új párosítási kódot a Grapes könyvtárkezelőből.');
    }

    let verifiedFolder = null;
    const parents = marker.getParents();
    while (parents.hasNext()) {
      const folder = parents.next();
      if (folder.getId() === String(payload.folderId || '') && folder.getName() === FOLDER_NAME) {
        verifiedFolder = folder;
        break;
      }
    }
    if (!verifiedFolder) return readerMessagePage('Érvénytelen könyvtár', 'A párosítási fájl nem a Grapes E-book Library mappában található.');

    // A böngészős drive.file scope nem feltétlenül látja a korábban kézzel
    // létrehozott azonos nevű mappát. A broker ezért a hitelesített mappa mellett
    // az összes "Grapes E-book Library" mappát összefogja.
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    let code;
    try {
      cleanupExpiredRecords();
      code = createUniqueCode();
      PropertiesService.getScriptProperties().setProperty(READER_PAIR_PREFIX + code, JSON.stringify({
        folderId: verifiedFolder.getId(),
        returnUrl: READER_RETURN_URL,
        expiresAt: Date.now() + TTL_MS
      }));
      marker.setTrashed(true);
    } finally { lock.releaseLock(); }

    if (p.embed === '1') return embeddedCodePage(code, 'Írd be ezt a kódot az e-book olvasón:', true, 'grapes-reader-pairing-code', nonce);
    return HtmlService.createHtmlOutput(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>E-olvasó párosítás</title>' +
      '<style>body{font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:28px;text-align:center}.code{font-size:42px;font-weight:bold;letter-spacing:.18em;margin:24px 0}.box{border:1px solid #bbb;padding:22px;border-radius:8px}a{color:#111}</style></head><body>' +
      '<div class="box"><h1>E-olvasó párosítása</h1><p>Írd be ezt a kódot az e-book olvasón:</p><div class="code">' + code + '</div><p>A kód 20 percig érvényes és egyszer használható.</p><p><a href="' + escapeHtml(READER_RETURN_URL) + '">Könnyített e-olvasó oldal</a></p></div></body></html>'
    );
  } catch (err) {
    return readerMessagePage('A párosítás nem sikerült', 'A hitelesítő fájl ellenőrzése közben hiba történt.');
  }
}

function pairReader(p) {
  const code = String(p.code || '').trim().toUpperCase();
  if (!isPairCode(code)) return readerMessagePage('Érvénytelen kód', 'A párosítási kód 6 karakteres.');

  const props = PropertiesService.getScriptProperties();
  const key = READER_PAIR_PREFIX + code;
  const raw = props.getProperty(key);
  if (!raw) {
    if (props.getProperty(STORE_PREFIX + code)) return readerMessagePage('Ez könyvküldési kód', 'Az e-olvasó párosításához az Új könyv sáv E-olvasó párosítása gombjával kért kódot használd.');
    return readerMessagePage('A kód nem található', 'Kérj új kódot az E-olvasó párosítása gombbal. A kód 20 percig érvényes és egyszer használható.');
  }

  let record;
  try { record = JSON.parse(raw); }
  catch (err) { props.deleteProperty(key); return readerMessagePage('Hibás párosítás', 'Kérj új párosítási kódot.'); }
  if (Date.now() >= Number(record.expiresAt)) {
    props.deleteProperty(key);
    return readerMessagePage('Lejárt kód', 'Kérj új párosítási kódot a Grapes könyvtárkezelőből.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let token;
  try {
    const current = props.getProperty(key);
    if (!current) return readerMessagePage('A kód már felhasznált', 'Ez a párosítási kód csak egyszer használható.');
    const currentRecord = JSON.parse(current);
    if (/^[A-F0-9]{64}$/.test(String(currentRecord.pairedToken || ''))) {
      // Régi e-reader böngészők néha nem követik az első átirányítást. A kód
      // frissítése ezért ugyanahhoz a már létrehozott tokenhez tér vissza.
      token = currentRecord.pairedToken;
    } else {
      const books = currentRecord.bookChunks ? readReaderBookChunks(props, code, currentRecord.bookChunks) : [];
      token = createReaderToken();
      // A nulla könyves pillanatkép is valódi, új típusú párosítás. Ha ezt 0-val
      // jelölnénk, a readerLibraryPage régi Drive-mappás tokennek nézné, és egy
      // másik Google-fióknál elérhetetlen folderId-t próbálna megnyitni.
      const bookChunks = currentRecord.bookChunks ? writeReaderBookChunks(props, token, books) : 0;
      props.setProperty(READER_TOKEN_PREFIX + token, JSON.stringify({
        folderId: record.folderId,
        bookChunks: bookChunks,
        createdAt: Date.now(),
        lastSeenAt: Date.now()
      }));
      deleteReaderBookChunks(props, code, currentRecord.bookChunks);
      props.setProperty(key, JSON.stringify({ expiresAt: currentRecord.expiresAt, pairedToken: token }));
    }
  } finally { lock.releaseLock(); }

  return readerPairingCompletePage(token);
}

function readerPairingCompletePage(token) {
  const landing = READER_RETURN_URL + '?reader-token=' + encodeURIComponent(token);
  const direct = ScriptApp.getService().getUrl() + '?action=reader&token=' + encodeURIComponent(token);
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="refresh" content="3;url=' + escapeHtml(landing) + '"><title>Párosítás kész</title>' +
    '<style>body{font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:28px;text-align:center}a{display:block;margin:16px 0;padding:14px;border:1px solid #111;color:#111;font-weight:bold;text-decoration:none}</style></head><body>' +
    '<h1>Párosítás kész</h1><p>A könyvtár megnyílik. Ha az e-reader nem lép tovább, válaszd az egyik gombot.</p>' +
    '<p><a href="' + escapeHtml(landing) + '">Könyvtár megnyitása</a><a href="' + escapeHtml(direct) + '">Közvetlen megnyitás</a></p>' +
    '<script>setTimeout(function(){window.location.replace(' + JSON.stringify(landing) + ')},500);<\/script></body></html>'
  );
}

function readerLibraryPage(p) {
  const token = String(p.token || '').trim().toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(token)) return readerMessagePage('Érvénytelen olvasó', 'Párosítsd újra az e-book olvasót.');

  const props = PropertiesService.getScriptProperties();
  const key = READER_TOKEN_PREFIX + token;
  const raw = props.getProperty(key);
  if (!raw) return readerExpiredPage();

  let record;
  try { record = JSON.parse(raw); }
  catch (err) { props.deleteProperty(key); return readerExpiredPage(); }

  const lastSeenAt = Number(record.lastSeenAt || record.createdAt || 0);
  if (!lastSeenAt || Date.now() - lastSeenAt > READER_TOKEN_TTL_MS) {
    props.deleteProperty(key);
    return readerExpiredPage();
  }

  record.lastSeenAt = Date.now();
  props.setProperty(key, JSON.stringify(record));

  let scan = { books: [], skippedCount: 0, skippedNames: [] };
  if (record.bookChunks) {
    scan.books = readReaderBookChunks(props, token, record.bookChunks).map(function (row) { return { id: row[0], name: row[1], size: row[2] }; });
  } else {
    if (!record.folderId) {
      props.deleteProperty(key);
      return readerExpiredPage('A korábbi párosítás érvénytelen', 'Az elavult olvasóazonosítót töröltük. Párosítsd újra az e-book olvasót.');
    }
    let folder;
    try { folder = DriveApp.getFolderById(record.folderId); }
    catch (err) {
      props.deleteProperty(key);
      return readerExpiredPage('A könyvtár nem érhető el', 'A korábbi párosítást töröltük. Párosítsd újra az e-book olvasót.');
    }
    // Régi párosításoknál megmarad a dinamikus Drive-mappa beolvasása.
    const folders = getReaderLibraryFolders(folder);
    scan = scanReaderLibraryFolders(folders);
  }
  const books = scan.books;
  books.sort(function (a, b) { return a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });

  const base = ScriptApp.getService().getUrl();
  let items = '';
  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const downloadUrl = 'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(book.id) + '&export=download&confirm=t';
    items += '<li class="book" data-book-id="' + escapeHtml(book.id) + '"><div class="book__info"><strong>' + escapeHtml(book.name) + '</strong><span>' + escapeHtml(formatBytes(book.size)) + '</span><span class="download-state" aria-live="polite"></span></div><a class="download-button" data-download-id="' + escapeHtml(book.id) + '" href="' + escapeHtml(downloadUrl) + '">Letöltés</a></li>';
  }
  if (!items) items = '<li class="empty">Még nincs e-olvasóra megosztott könyv.</li>';

  const refreshUrl = base + '?action=reader&token=' + encodeURIComponent(token);
  const revokeUrl = base + '?action=revoke-reader&token=' + encodeURIComponent(token);
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grapes E-book Könyvtár</title>' +
    '<style>body{font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:18px;background:#fff;color:#111}h1{font-size:24px}ul{list-style:none;padding:0;margin:20px 0}.book{display:flex;align-items:center;gap:12px;border:1px solid #999;padding:14px;margin:0 0 10px;color:#111}.book__info{min-width:0;flex:1}.book strong{display:block;font-size:17px;word-break:break-word}.book span{display:block;margin-top:5px;font-size:12px;color:#555}.book .download-state{font-size:13px;font-weight:bold;color:#176b2c}.download-button{flex:0 0 auto;display:inline-block;padding:10px 14px;border:1px solid #111;background:#111;color:#fff;text-decoration:none;font-weight:bold}.book[data-downloaded="true"]{border-color:#6b8f72;background:#f6faf7}.book[data-downloaded="true"] .download-button{background:#fff;color:#111}.empty{padding:18px;border:1px solid #bbb}.nav a{display:inline-block;margin:4px 12px 4px 0;color:#111}@media(max-width:480px){.book{align-items:stretch;flex-direction:column}.download-button{text-align:center}}</style></head><body>' +
    '<h1>Grapes E-book Könyvtár</h1><p>' + books.length + ' könyv érhető el.' + (scan.skippedCount ? ' ' + scan.skippedCount + ' támogatott fájlt nem sikerült elérhetővé tenni.' : '') + '</p><div class="nav"><a href="' + escapeHtml(refreshUrl) + '">Frissítés</a><a href="' + escapeHtml(READER_RETURN_URL) + '">Olvasóoldal</a><a href="' + escapeHtml(revokeUrl) + '">Eszköz leválasztása</a></div><ul>' + items + '</ul>' + (scan.skippedNames.length ? '<p class="empty">Nem hozzáférhető: ' + escapeHtml(scan.skippedNames.join(', ')) + '</p>' : '') + '<script>(function(){var KEY="grapes-ebook-downloaded";var state={};try{state=JSON.parse(localStorage.getItem(KEY)||"{}")||{}}catch(e){}function paint(){var books=document.querySelectorAll("[data-book-id]");for(var i=0;i<books.length;i++){var id=books[i].getAttribute("data-book-id");var done=!!state[id];books[i].setAttribute("data-downloaded",done?"true":"false");var label=books[i].querySelector(".download-state");if(label)label.textContent=done?"✓ Letöltve":""}}var links=document.querySelectorAll("[data-download-id]");for(var i=0;i<links.length;i++){links[i].addEventListener("click",function(){var id=this.getAttribute("data-download-id");state[id]=Date.now();try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}paint()})}paint()}());<\/script></body></html>'
  );
}

function getReaderLibraryFolders(primaryFolder) {
  const folders = [];
  const seenIds = {};

  function add(folder) {
    if (!folder) return;
    const id = folder.getId();
    if (seenIds[id]) return;
    seenIds[id] = true;
    folders.push(folder);
  }

  add(primaryFolder);

  try {
    const matches = DriveApp.getFoldersByName(FOLDER_NAME);
    while (matches.hasNext()) add(matches.next());
  } catch (err) {
    // A hitelesített elsődleges mappával akkor is tovább tudunk menni.
  }

  return folders;
}

function scanReaderLibraryFolders(rootFolders) {
  const state = {
    books: [],
    seenFolderIds: {},
    seenFileIds: {},
    skippedCount: 0,
    skippedNames: []
  };

  for (let i = 0; i < rootFolders.length; i++) {
    scanReaderFolderRecursive(rootFolders[i], state);
  }
  return state;
}

function scanReaderFolderRecursive(folder, state) {
  let folderId;
  try { folderId = folder.getId(); }
  catch (err) { return; }
  if (state.seenFolderIds[folderId]) return;
  state.seenFolderIds[folderId] = true;

  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    if (!isAllowedBook(name)) continue;

    let fileId;
    try { fileId = file.getId(); }
    catch (err) { continue; }
    if (state.seenFileIds[fileId]) continue;
    state.seenFileIds[fileId] = true;

    try {
      if (file.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      }
      state.books.push({ id: fileId, name: name, size: file.getSize() });
    } catch (err) {
      state.skippedCount++;
      if (state.skippedNames.length < 8) state.skippedNames.push(name);
    }
  }

  // A könyvek lehetnek szerző/sorozat szerinti almappákban is.
  // Ezeket rekurzívan bejárjuk, nem csak a könyvtár gyökerét.
  try {
    const children = folder.getFolders();
    while (children.hasNext()) scanReaderFolderRecursive(children.next(), state);
  } catch (err) {
    // Egy problémás almappa ne akadályozza a többi könyv listázását.
  }
}

function syncReaderLibrarySharing(folder) {
  return scanReaderLibraryFolders([folder]).books;
}

function revokeReaderPage(p) {
  const token = String(p.token || '').trim().toUpperCase();
  if (/^[A-F0-9]{64}$/.test(token)) {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty(READER_TOKEN_PREFIX + token);
    if (raw) try { deleteReaderBookChunks(props, token, JSON.parse(raw).bookChunks); } catch (err) {}
    props.deleteProperty(READER_TOKEN_PREFIX + token);
  }
  const landing = READER_RETURN_URL + '?forget=1';
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta http-equiv="refresh" content="0;url=' + escapeHtml(landing) + '"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Leválasztva</title></head><body><p>Az e-olvasó leválasztva.</p><p><a href="' + escapeHtml(landing) + '">Vissza az olvasóoldalra</a></p></body></html>');
}

function readerExpiredPage(title, message) {
  const landing = READER_RETURN_URL + '?forget=1';
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta http-equiv="refresh" content="1;url=' + escapeHtml(landing) + '"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(title || 'A párosítás lejárt') + '</title><style>body{font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:28px;text-align:center}a{color:#111}</style></head><body><h1>' + escapeHtml(title || 'A párosítás lejárt') + '</h1><p>' + escapeHtml(message || 'Nyisd meg az e-olvasó oldalt és párosítsd újra az eszközt.') + '</p><p>Az újrapárosító oldal megnyílik…</p><p><a href="' + escapeHtml(landing) + '">Újrapárosítás most</a></p></body></html>');
}

function readerMessagePage(title, message, link) {
  const href = link || READER_RETURN_URL;
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(title) + '</title><style>body{font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:28px;text-align:center}a{color:#111}</style></head><body><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(message) + '</p><p><a href="' + escapeHtml(href) + '">E-olvasó oldal</a></p></body></html>');
}

function cleanupExpiredRecords() {
  const props = PropertiesService.getScriptProperties();
  const records = props.getProperties();
  const now = Date.now();
  Object.keys(records).forEach(function (key) {
    if (key.indexOf(STORE_PREFIX) !== 0 && key.indexOf(READER_PAIR_PREFIX) !== 0 && key.indexOf(READER_TOKEN_PREFIX) !== 0) return;
    try {
      const record = JSON.parse(records[key]);
      if ((record.expiresAt !== undefined && Number(record.expiresAt) <= now) ||
          (key.indexOf(READER_TOKEN_PREFIX) === 0 && now - Number(record.lastSeenAt || record.createdAt || 0) > READER_TOKEN_TTL_MS)) {
        const ownerKey = key.indexOf(READER_PAIR_PREFIX) === 0 ? key.slice(READER_PAIR_PREFIX.length) : key.indexOf(READER_TOKEN_PREFIX) === 0 ? key.slice(READER_TOKEN_PREFIX.length) : '';
        if (ownerKey) deleteReaderBookChunks(props, ownerKey, record.bookChunks);
        props.deleteProperty(key);
      }
    } catch (err) { props.deleteProperty(key); }
  });
}

function createUniqueCode() {
  const props = PropertiesService.getScriptProperties();
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    if (!props.getProperty(STORE_PREFIX + code) && !props.getProperty(READER_PAIR_PREFIX + code)) return code;
  }
  throw new Error('Nem sikerült egyedi kódot generálni.');
}

function createReaderToken() {
  const props = PropertiesService.getScriptProperties();
  for (let attempt = 0; attempt < 20; attempt++) {
    const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toUpperCase();
    if (!props.getProperty(READER_TOKEN_PREFIX + token)) return token;
  }
  throw new Error('Nem sikerült olvasóazonosítót generálni.');
}

function isPairCode(code) {
  if (code.length !== CODE_LENGTH) return false;
  for (let i = 0; i < code.length; i++) if (ALPHABET.indexOf(code.charAt(i)) < 0) return false;
  return true;
}

function isAllowedBook(name) {
  const match = String(name || '').toLowerCase().match(/\.([^.]+)$/);
  return !!match && ALLOWED_BOOK_EXTENSIONS.indexOf(match[1]) >= 0;
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!isFinite(value) || value <= 0) return '';
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
  return (value / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
