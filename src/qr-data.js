export function normaliseHex(value) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

export function withUtm(url, fields) {
  const value = String(url || '').trim();
  if (!value) return '';
  const params = new URLSearchParams();
  for (const [key, fieldValue] of Object.entries(fields)) {
    const item = String(fieldValue || '').trim();
    if (item) params.set(key, item);
  }
  if (!params.toString()) return value;
  try {
    const parsed = new URL(value);
    for (const [key, item] of params) parsed.searchParams.set(key, item);
    return parsed.toString();
  } catch {
    return `${value}${value.includes('?') ? '&' : '?'}${params.toString()}`;
  }
}

function escapeWifiValue(value) {
  return String(value || '').replace(/([\\;,:"])/g, '\\$1');
}

export function buildWifiData({ type = 'WPA', ssid = '', password = '' } = {}) {
  const security = ['WPA', 'WEP', 'nopass'].includes(type) ? type : 'WPA';
  const fields = [`T:${security}`, `S:${escapeWifiValue(ssid)}`];
  if (security !== 'nopass') fields.push(`P:${escapeWifiValue(password)}`);
  return `WIFI:${fields.join(';')};;`;
}

function escapeVCardText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([;,])/g, '\\$1');
}

function singleLine(value) {
  return String(value || '').replace(/[\r\n]+/g, '').trim();
}

export function buildVCardData({ name = '', phone = '', email = '' } = {}) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVCardText(name)}`];
  const cleanPhone = singleLine(phone);
  const cleanEmail = singleLine(email);
  if (cleanPhone) lines.push(`TEL:${cleanPhone}`);
  if (cleanEmail) lines.push(`EMAIL:${cleanEmail}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function contrastRatio(foreground, background) {
  const toRgb = (hex) => {
    const value = hex.replace('#', '');
    const rgb = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
    return rgb.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  };
  const a = toRgb(foreground);
  const b = toRgb(background);
  const lumA = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  const lumB = 0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2];
  const [light, dark] = lumA > lumB ? [lumA, lumB] : [lumB, lumA];
  return (light + 0.05) / (dark + 0.05);
}
