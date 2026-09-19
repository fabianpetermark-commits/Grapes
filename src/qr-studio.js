import QRCode from 'qrcode';
import { el } from './ui/dom.js';
import { notifySuccess, notifyError } from './ui/toast.js';

const PALETTE = [
  '#000000','#1f2937','#475569','#64748b','#94a3b8','#cbd5e1','#e2e8f0','#ffffff',
  '#7f1d1d','#991b1b','#dc2626','#ef4444','#f97316','#f59e0b','#eab308','#84cc16',
  '#166534','#16a34a','#22c55e','#10b981','#0f766e','#14b8a6','#06b6d4','#0ea5e9',
  '#1d4ed8','#2563eb','#3b82f6','#6366f1','#4f46e5','#7c3aed','#9333ea','#a855f7',
  '#be185d','#db2777','#ec4899','#f43f5e','#7c2d12','#92400e','#a16207','#365314',
  '#14532d','#164e63','#0c4a6e','#172554','#312e81','#3b0764','#4c1d95','#831843'
];

function normaliseHex(value) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

function withUtm(url, fields) {
  const value = String(url || '').trim();
  if (!value) return '';
  const params = new URLSearchParams();
  for (const [key, field] of Object.entries(fields)) {
    const item = String(field?.value || '').trim();
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

function contrastRatio(foreground, background) {
  const toRgb = (hex) => {
    const value = hex.replace('#', '');
    const rgb = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
    return rgb.map((c) => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  };
  const a = toRgb(foreground);
  const b = toRgb(background);
  const lumA = .2126 * a[0] + .7152 * a[1] + .0722 * a[2];
  const lumB = .2126 * b[0] + .7152 * b[1] + .0722 * b[2];
  const [light, dark] = lumA > lumB ? [lumA, lumB] : [lumB, lumA];
  return (light + .05) / (dark + .05);
}

export function initQrStudio() {
  const canvas = el('#qr-canvas');
  if (!canvas || canvas.dataset.initialized === 'true') return;
  canvas.dataset.initialized = 'true';

  const urlInput = el('#qr-url');
  const utmSource = el('#qr-utm-source');
  const utmMedium = el('#qr-utm-medium');
  const utmCampaign = el('#qr-utm-campaign');
  const fgColorInput = el('#qr-fg-color');
  const bgColorInput = el('#qr-bg-color');
  const fgHex = el('#qr-fg-hex');
  const bgHex = el('#qr-bg-hex');
  const errorLevelSelect = el('#qr-error-level');
  const downloadBtn = el('#qr-download-png');
  const copyBtn = el('#qr-copy-btn');
  const dynamicContainer = el('#qr-dynamic-inputs');
  const typeSelect = el('#qr-type');

  function getUrlData() {
    return withUtm(urlInput?.value, {
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign
    });
  }

  function getLegacyData() {
    const t = typeSelect?.value;
    if (t === 'text') return el('#qr-val-text')?.value || '';
    if (t === 'wifi') {
      return `WIFI:T:${el('#qr-wifi-type')?.value || 'WPA'};S:${el('#qr-wifi-ssid')?.value || ''};P:${el('#qr-wifi-pass')?.value || ''};;`;
    }
    if (t === 'vcard') {
      return `BEGIN:VCARD\\nVERSION:3.0\\nFN:${el('#qr-vc-name')?.value || ''}\\nTEL:${el('#qr-vc-phone')?.value || ''}\\nEMAIL:${el('#qr-vc-email')?.value || ''}\\nEND:VCARD`;
    }
    return getUrlData();
  }

  function getQRData() {
    return getLegacyData();
  }

  function generateQR() {
    const text = getQRData();
    if (!text) {
      canvas.width = 280;
      canvas.height = 280;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    QRCode.toCanvas(canvas, text, {
      width: 280,
      margin: 2,
      color: { dark: fgColorInput.value, light: bgColorInput.value },
      errorCorrectionLevel: errorLevelSelect.value
    }, (error) => {
      if (error) console.error(error);
    });
  }

  function syncHexInputs() {
    if (fgHex) fgHex.value = fgColorInput.value;
    if (bgHex) bgHex.value = bgColorInput.value;
    const contrast = el('#qr-contrast');
    if (contrast) {
      const ratio = contrastRatio(fgColorInput.value, bgColorInput.value);
      contrast.textContent = `Kontraszt: ${ratio.toFixed(2)}:1 ${ratio >= 4.5 ? '· jó olvashatóság' : '· érdemes sötétebb/világosabb színt választani'}`;
    }
    updateActiveSwatches();
  }

  function updateColor(which, value) {
    const hex = normaliseHex(value);
    if (!hex) return;
    const input = which === 'fg' ? fgColorInput : bgColorInput;
    input.value = hex;
    syncHexInputs();
    generateQR();
  }

  function updateActiveSwatches() {
    document.querySelectorAll('[data-qr-color]').forEach((button) => {
      const active = button.dataset.qrTarget === 'fg'
        ? button.dataset.qrColor === fgColorInput.value.toLowerCase()
        : button.dataset.qrColor === bgColorInput.value.toLowerCase();
      button.classList.toggle('qr-studio__swatch--active', active);
    });
  }

  function activateTab(tabId) {
    document.querySelectorAll('.qr-studio__tab').forEach((tab) => {
      const active = tab.dataset.tab === tabId;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('.qr-studio__panel').forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tabId;
    });
  }

  function renderLegacyInputs() {
    if (!dynamicContainer || !typeSelect) return;
    let html = '';
    if (typeSelect.value === 'text') {
      html = '<label class="field__label" for="qr-val-text">Szöveg</label><textarea id="qr-val-text" class="input" rows="3" placeholder="Írd ide a szöveget..."></textarea>';
    } else if (typeSelect.value === 'wifi') {
      html = '<label class="field__label" for="qr-wifi-ssid">Hálózat neve (SSID)</label><input id="qr-wifi-ssid" class="input" type="text" placeholder="WiFi név" /><label class="field__label" for="qr-wifi-pass" style="margin-top:8px;">Jelszó</label><input id="qr-wifi-pass" class="input" type="text" placeholder="WiFi jelszó" /><label class="field__label" for="qr-wifi-type" style="margin-top:8px;">Titkosítás</label><select id="qr-wifi-type" class="select"><option value="WPA">WPA/WPA2</option><option value="WEP">WEP</option><option value="nopass">Nyílt</option></select>';
    } else if (typeSelect.value === 'vcard') {
      html = '<label class="field__label" for="qr-vc-name">Név</label><input id="qr-vc-name" class="input" type="text" placeholder="Kovács János" /><label class="field__label" for="qr-vc-phone" style="margin-top:8px;">Telefon</label><input id="qr-vc-phone" class="input" type="text" placeholder="+36 30 123 4567" /><label class="field__label" for="qr-vc-email" style="margin-top:8px;">E-mail</label><input id="qr-vc-email" class="input" type="email" placeholder="janos@pelda.hu" />';
    }
    dynamicContainer.innerHTML = html;
    dynamicContainer.querySelectorAll('input, textarea, select').forEach((input) => {
      input.addEventListener('input', generateQR);
      input.addEventListener('change', generateQR);
    });
    generateQR();
  }

  document.querySelectorAll('.qr-studio__tab').forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });

  [urlInput, utmSource, utmMedium, utmCampaign].filter(Boolean).forEach((input) => {
    input.addEventListener('input', generateQR);
    input.addEventListener('change', generateQR);
  });

  fgColorInput?.addEventListener('input', () => {
    syncHexInputs();
    generateQR();
  });
  bgColorInput?.addEventListener('input', () => {
    syncHexInputs();
    generateQR();
  });

  fgHex?.addEventListener('change', () => updateColor('fg', fgHex.value));
  bgHex?.addEventListener('change', () => updateColor('bg', bgHex.value));

  document.querySelectorAll('[data-qr-color]').forEach((button) => {
    button.addEventListener('click', () => updateColor(button.dataset.qrTarget, button.dataset.qrColor));
  });

  document.querySelectorAll('[data-qr-eyedropper]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.EyeDropper) {
        notifyError('A színmintavételhez használj EyeDropper-t támogató böngészőt (pl. friss Chrome/Edge).');
        return;
      }
      try {
        const picker = new window.EyeDropper();
        const result = await picker.open();
        updateColor(button.dataset.qrEyedropper, result.sRGBHex);
      } catch (error) {
        if (error?.name !== 'AbortError') notifyError('A színmintavétel nem sikerült.');
      }
    });
  });

  errorLevelSelect?.addEventListener('change', generateQR);

  downloadBtn?.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'qrcode.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    notifySuccess('QR-kód sikeresen letöltve!');
  });

  copyBtn?.addEventListener('click', () => {
    navigator.clipboard.writeText(getQRData())
      .then(() => notifySuccess('A QR kód tartalma a vágólapra másolva!'))
      .catch(() => notifyError('Nem sikerült a vágólapra másolni.'));
  });

  typeSelect?.addEventListener('change', renderLegacyInputs);

  syncHexInputs();
  activateTab('link');
  renderLegacyInputs();
}
