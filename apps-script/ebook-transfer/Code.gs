const CODE_LENGTH = 6;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TTL_MS = 20 * 60 * 1000;
const STORE_PREFIX = 'ebook_transfer_';

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || '').toLowerCase();
  if (action === 'create') return createTransferPage(e.parameter);
  if (action === 'download') return resolveTransfer(e.parameter);
  return HtmlService.createHtmlOutput('<h2>Grapes E-book Transfer</h2><p>Missing action.</p>');
}

function createTransferPage(p) {
  const fileId = String(p.fileId || '').trim();
  const returnUrl = String(p.returnUrl || '').trim();
  if (!fileId || !returnUrl) return HtmlService.createHtmlOutput('<h2>Hiányzó adatok</h2><p>A fileId és returnUrl kötelező.</p>');

  let file;
  try { file = DriveApp.getFileById(fileId); }
  catch (err) { return HtmlService.createHtmlOutput('<h2>Nem sikerült elérni a fájlt.</h2><p>Drive hozzáférési hiba.</p>'); }

  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (err) { return HtmlService.createHtmlOutput('<h2>Megosztási hiba</h2><p>A fájl nem tehető linkkel elérhetővé.</p>'); }

  const code = createUniqueCode();
  const expiresAt = Date.now() + TTL_MS;
  PropertiesService.getScriptProperties().setProperty(STORE_PREFIX + code, JSON.stringify({
    fileId: fileId,
    name: file.getName(),
    returnUrl: returnUrl,
    expiresAt: expiresAt
  }));

  const base = ScriptApp.getService().getUrl();
  const pairUrl = returnUrl + (returnUrl.indexOf('?') >= 0 ? '&' : '?') + 'ebook-pair=' + encodeURIComponent(code);
  const downloadUrl = base + '?action=download&code=' + encodeURIComponent(code);

  const qrUrl = 'https://quickchart.io/qr?text=' + encodeURIComponent(pairUrl) + '&size=280';
  const safeName = escapeHtml(file.getName());
  const safePair = escapeHtml(pairUrl);
  const safeDownload = escapeHtml(downloadUrl);

  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grapes E-book Transfer</title>' +
    '<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:0 auto;padding:32px;text-align:center}img{max-width:280px;width:100%;border:1px solid #ddd;border-radius:12px}.code{font-size:42px;letter-spacing:.18em;font-weight:800;margin:20px 0}.muted{color:#666}a{word-break:break-all}</style></head><body>' +
    '<h1>Grapes E-book Transfer</h1><p>' + safeName + '</p><img src="' + qrUrl + '" alt="QR-kód"><div class="code">' + code + '</div><p>A kód 20 percig érvényes.</p><p class="muted">QR-kódos párosítás:</p><p><a href="' + safePair + '">' + safePair + '</a></p><p><a href="' + safeDownload + '">Közvetlen letöltés</a></p></body></html>'
  );
}

function resolveTransfer(p) {
  const code = String(p.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return HtmlService.createHtmlOutput('<h2>Érvénytelen kód</h2><p>A párosítási kód 6 karakteres.</p>');

  const key = STORE_PREFIX + code;
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return HtmlService.createHtmlOutput('<h2>A kód nem található</h2><p>Lehet, hogy lejárt vagy már felhasználták.</p>');

  const record = JSON.parse(raw);
  if (Date.now() > Number(record.expiresAt)) {
    PropertiesService.getScriptProperties().deleteProperty(key);
    return HtmlService.createHtmlOutput('<h2>Lejárt kód</h2><p>Kérj új párosítási kódot.</p>');
  }

  const downloadUrl = 'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(record.fileId) + '&export=download&confirm=t';
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Letöltés</title><style>body{font-family:system-ui,sans-serif;max-width:620px;margin:0 auto;padding:32px;text-align:center}a{display:inline-block;padding:14px 20px;border-radius:10px;background:#111;color:#fff;text-decoration:none}</style></head><body><h1>Grapes E-book Transfer</h1><p>' + escapeHtml(record.name) + '</p><p><a href="' + escapeHtml(downloadUrl) + '">E-book letöltése</a></p><p><a href="' + escapeHtml(record.returnUrl) + '">Vissza a Grapeshez</a></p></body></html>');
}

function createUniqueCode() {
  const props = PropertiesService.getScriptProperties();
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    if (!props.getProperty(STORE_PREFIX + code)) return code;
  }
  throw new Error('Nem sikerült egyedi kódot generálni.');
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}