import QRCode from 'qrcode';
import { el } from './ui/dom.js';
import { notifySuccess, notifyError } from './ui/toast.js';
import { saveLocalProject, loadLocalProject } from './storage/local-project-store.js';
import { isGrapesDriveConnected, saveGrapesProject, loadGrapesProject } from './storage/grapes-drive.js';
import { buildVCardData, buildWifiData, contrastRatio, normaliseHex, withUtm } from './qr-data.js';

const QR_BACKUP_ID = 'qr-studio-current';

const PALETTE = [
  '#000000','#1f2937','#475569','#64748b','#94a3b8','#cbd5e1','#e2e8f0','#ffffff',
  '#7f1d1d','#991b1b','#dc2626','#ef4444','#f97316','#f59e0b','#eab308','#84cc16',
  '#166534','#16a34a','#22c55e','#10b981','#0f766e','#14b8a6','#06b6d4','#0ea5e9',
  '#1d4ed8','#2563eb','#3b82f6','#6366f1','#4f46e5','#7c3aed','#9333ea','#a855f7',
  '#be185d','#db2777','#ec4899','#f43f5e','#7c2d12','#92400e','#a16207','#365314',
  '#14532d','#164e63','#0c4a6e','#172554','#312e81','#3b0764','#4c1d95','#831843'
];

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
  const generationStatus = el('#qr-generation-status');
  const dynamicContainer = el('#qr-dynamic-inputs');
  const typeSelect = el('#qr-type');
  let generationId = 0;

  function getUrlData() {
    return withUtm(urlInput?.value, {
      utm_source: utmSource?.value,
      utm_medium: utmMedium?.value,
      utm_campaign: utmCampaign?.value
    });
  }

  function getLegacyData() {
    const t = typeSelect?.value;
    if (t === 'text') return el('#qr-val-text')?.value || '';
    if (t === 'wifi') {
      return buildWifiData({
        type: el('#qr-wifi-type')?.value,
        ssid: el('#qr-wifi-ssid')?.value,
        password: el('#qr-wifi-pass')?.value
      });
    }
    if (t === 'vcard') {
      return buildVCardData({
        name: el('#qr-vc-name')?.value,
        phone: el('#qr-vc-phone')?.value,
        email: el('#qr-vc-email')?.value
      });
    }
    return getUrlData();
  }

  function getQRData() {
    return getLegacyData();
  }

  let driveProjectFileId = null;
  let autosaveTimer = null;

  function serializeQrProject() {
    const dynamic = {};
    dynamicContainer?.querySelectorAll('input, textarea, select').forEach((input) => { dynamic[input.id] = input.value; });
    return {
      format: 'grapes-qr',
      version: 1,
      type: typeSelect?.value || 'url',
      url: urlInput?.value || '',
      utmSource: utmSource?.value || '',
      utmMedium: utmMedium?.value || '',
      utmCampaign: utmCampaign?.value || '',
      foreground: fgColorInput?.value || '#000000',
      background: bgColorInput?.value || '#ffffff',
      errorLevel: errorLevelSelect?.value || 'M',
      dynamic,
    };
  }

  async function restoreQrProject(data) {
    if (!data || data.format !== 'grapes-qr') return;
    if (typeSelect) typeSelect.value = data.type || 'url';
    renderLegacyInputs();
    if (urlInput) urlInput.value = data.url || '';
    if (utmSource) utmSource.value = data.utmSource || '';
    if (utmMedium) utmMedium.value = data.utmMedium || '';
    if (utmCampaign) utmCampaign.value = data.utmCampaign || '';
    if (fgColorInput) fgColorInput.value = data.foreground || '#000000';
    if (bgColorInput) bgColorInput.value = data.background || '#ffffff';
    if (errorLevelSelect) errorLevelSelect.value = data.errorLevel || 'M';
    for (const [id, value] of Object.entries(data.dynamic || {})) {
      const input = document.getElementById(id);
      if (input) input.value = value;
    }
    syncHexInputs();
    generateQR();
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async () => {
      const data = serializeQrProject();
      try {
        await saveLocalProject({ id: QR_BACKUP_ID, module: 'QR & Barcode', name: 'QR projekt', data, driveFileId: driveProjectFileId });
        if (isGrapesDriveConnected() && driveProjectFileId) {
          driveProjectFileId = await saveGrapesProject({ module: 'QR & Barcode', name: 'QR projekt', data, fileId: driveProjectFileId });
        }
      } catch (error) {
        console.warn('QR automatikus mentés sikertelen:', error);
      }
    }, 4000);
  }

  async function restoreLastProject() {
    try {
      const raw = sessionStorage.getItem('grapes-open-project');
      if (raw) {
        const target = JSON.parse(raw);
        if (target.module === 'QR & Barcode') {
          sessionStorage.removeItem('grapes-open-project');
          if (target.source === 'Drive') {
            const wrapper = await loadGrapesProject(target.id);
            driveProjectFileId = target.id;
            await restoreQrProject(wrapper.data);
            return;
          }
          const local = await loadLocalProject(target.id);
          if (local?.data) { driveProjectFileId = local.driveFileId || null; await restoreQrProject(local.data); return; }
        }
      }
      const backup = await loadLocalProject(QR_BACKUP_ID);
      if (backup?.data) {
        driveProjectFileId = backup.driveFileId || null;
        await restoreQrProject(backup.data);
      }
    } catch (error) {
      console.warn('QR projekt visszaállítása sikertelen:', error);
    }
  }

  function generateQR() {
    const text = getQRData();
    const currentGeneration = ++generationId;
    downloadBtn.disabled = true;
    copyBtn.disabled = !text;
    if (!text) {
      canvas.width = 280;
      canvas.height = 280;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      generationStatus.textContent = 'Adj meg tartalmat a QR-kód elkészítéséhez.';
      generationStatus.dataset.state = 'empty';
      return;
    }
    generationStatus.textContent = '';
    generationStatus.dataset.state = 'ready';
    QRCode.toCanvas(canvas, text, {
      width: 280,
      margin: 2,
      color: { dark: fgColorInput.value, light: bgColorInput.value },
      errorCorrectionLevel: errorLevelSelect.value
    }, (error) => {
      if (currentGeneration !== generationId) return;
      downloadBtn.disabled = Boolean(error);
      if (error) {
        console.error(error);
        generationStatus.textContent = 'Ez a tartalom túl hosszú vagy nem kódolható. Rövidítsd le, majd próbáld újra.';
        generationStatus.dataset.state = 'error';
      } else {
        generationStatus.textContent = 'A QR-kód elkészült.';
        generationStatus.dataset.state = 'ready';
      }
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
    const hexInput = which === 'fg' ? fgHex : bgHex;
    if (!hex) {
      hexInput?.setCustomValidity('Adj meg egy hatjegyű HEX színkódot.');
      hexInput?.reportValidity();
      return;
    }
    hexInput?.setCustomValidity('');
    const input = which === 'fg' ? fgColorInput : bgColorInput;
    input.value = hex;
    syncHexInputs();
    generateQR();
    scheduleAutosave();
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
    dynamicContainer.classList.toggle('hidden', typeSelect.value === 'url');
    dynamicContainer.querySelectorAll('input, textarea, select').forEach((input) => {
      input.addEventListener('input', () => { generateQR(); scheduleAutosave(); });
      input.addEventListener('change', () => { generateQR(); scheduleAutosave(); });
    });
    generateQR();
  }

  document.querySelectorAll('.qr-studio__tab').forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...document.querySelectorAll('.qr-studio__tab')];
      const currentIndex = tabs.indexOf(tab);
      const nextIndex = event.key === 'Home' ? 0
        : event.key === 'End' ? tabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      activateTab(tabs[nextIndex].dataset.tab);
      tabs[nextIndex].focus();
    });
  });

  [urlInput, utmSource, utmMedium, utmCampaign].filter(Boolean).forEach((input) => {
    input.addEventListener('input', () => { generateQR(); scheduleAutosave(); });
    input.addEventListener('change', () => { generateQR(); scheduleAutosave(); });
  });

  fgColorInput?.addEventListener('input', () => {
    syncHexInputs();
    generateQR();
    scheduleAutosave();
  });
  bgColorInput?.addEventListener('input', () => {
    syncHexInputs();
    generateQR();
    scheduleAutosave();
  });

  fgHex?.addEventListener('change', () => updateColor('fg', fgHex.value));
  bgHex?.addEventListener('change', () => updateColor('bg', bgHex.value));

  document.querySelectorAll('[data-qr-color]').forEach((button) => {
    button.addEventListener('click', () => updateColor(button.dataset.qrTarget, button.dataset.qrColor));
  });

  document.querySelectorAll('[data-qr-eyedropper]').forEach((button) => {
    if (!window.EyeDropper) {
      button.hidden = true;
      button.setAttribute('aria-hidden', 'true');
      return;
    }

    button.addEventListener('click', async () => {
      try {
        const picker = new window.EyeDropper();
        const result = await picker.open();
        updateColor(button.dataset.qrEyedropper, result.sRGBHex);
      } catch (error) {
        if (error?.name !== 'AbortError') notifyError('A színmintavétel nem sikerült.');
      }
    });
  });

  errorLevelSelect?.addEventListener('change', () => { generateQR(); scheduleAutosave(); });

  downloadBtn?.addEventListener('click', () => {
    if (!getQRData()) return notifyError('Előbb adj meg tartalmat a QR-kódhoz.');
    const link = document.createElement('a');
    link.download = 'qrcode.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    notifySuccess('QR-kód sikeresen letöltve!');
  });

  copyBtn?.addEventListener('click', () => {
    if (!getQRData()) return notifyError('Előbb adj meg tartalmat a QR-kódhoz.');
    navigator.clipboard.writeText(getQRData())
      .then(() => notifySuccess('A QR kód tartalma a vágólapra másolva!'))
      .catch(() => notifyError('Nem sikerült a vágólapra másolni.'));
  });

  typeSelect?.addEventListener('change', () => { renderLegacyInputs(); scheduleAutosave(); });

  syncHexInputs();
  activateTab('link');
  renderLegacyInputs();
  restoreLastProject();
}
