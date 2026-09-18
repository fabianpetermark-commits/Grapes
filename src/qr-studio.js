import QRCode from 'qrcode';
import { el } from './ui/dom.js';
import { notifySuccess, notifyError } from './ui/toast.js';

export function initQrStudio() {
  const typeSelect=el('#qr-type'), dynamicContainer=el('#qr-dynamic-inputs');
  const fgColorInput=el('#qr-fg-color'), bgColorInput=el('#qr-bg-color');
  const errorLevelSelect=el('#qr-error-level'), canvas=el('#qr-canvas');
  const downloadBtn=el('#qr-download-png'), copyBtn=el('#qr-copy-btn');
  function renderInputs() {
    let html='';
    if(typeSelect.value==='url') html='<label class="field__label" for="qr-val-url">Weboldal cím</label><input id="qr-val-url" class="input" type="url" value="https://" />';
    else if(typeSelect.value==='text') html='<label class="field__label" for="qr-val-text">Szöveg</label><textarea id="qr-val-text" class="input" rows="3" placeholder="Írd ide a szöveget..."></textarea>';
    else if(typeSelect.value==='wifi') html='<label class="field__label" for="qr-wifi-ssid">Hálózat neve (SSID)</label><input id="qr-wifi-ssid" class="input" type="text" placeholder="WiFi név" /><label class="field__label" for="qr-wifi-pass" style="margin-top:8px;">Jelszó</label><input id="qr-wifi-pass" class="input" type="text" placeholder="WiFi jelszó" /><label class="field__label" for="qr-wifi-type" style="margin-top:8px;">Titkosítás</label><select id="qr-wifi-type" class="select"><option value="WPA">WPA/WPA2</option><option value="WEP">WEP</option><option value="nopass">Nyílt</option></select>';
    else html='<label class="field__label" for="qr-vc-name">Név</label><input id="qr-vc-name" class="input" type="text" placeholder="Kovács János" /><label class="field__label" for="qr-vc-phone" style="margin-top:8px;">Telefon</label><input id="qr-vc-phone" class="input" type="text" placeholder="+36 30 123 4567" /><label class="field__label" for="qr-vc-email" style="margin-top:8px;">E-mail</label><input id="qr-vc-email" class="input" type="email" placeholder="janos@pelda.hu" />';
    dynamicContainer.innerHTML=html; attachInputListeners(); generateQR();
  }
  function getQRData() {
    const t=typeSelect.value;
    if(t==='url') return el('#qr-val-url')?.value||'';
    if(t==='text') return el('#qr-val-text')?.value||'';
    if(t==='wifi') return `WIFI:T:${el('#qr-wifi-type')?.value||'WPA'};S:${el('#qr-wifi-ssid')?.value||''};P:${el('#qr-wifi-pass')?.value||''};;`;
    return `BEGIN:VCARD\nVERSION:3.0\nFN:${el('#qr-vc-name')?.value||''}\nTEL:${el('#qr-vc-phone')?.value||''}\nEMAIL:${el('#qr-vc-email')?.value||''}\nEND:VCARD`;
  }
  function generateQR() {
    const text=getQRData(); if(!text)return;
    QRCode.toCanvas(canvas,text,{width:240,margin:2,color:{dark:fgColorInput.value,light:bgColorInput.value},errorCorrectionLevel:errorLevelSelect.value},e=>{if(e)console.error(e)});
  }
  function attachInputListeners(){dynamicContainer.querySelectorAll('input, textarea, select').forEach(input=>{input.addEventListener('input',generateQR);input.addEventListener('change',generateQR)})}
  typeSelect.addEventListener('change',renderInputs); fgColorInput.addEventListener('input',generateQR); bgColorInput.addEventListener('input',generateQR); errorLevelSelect.addEventListener('change',generateQR);
  downloadBtn.addEventListener('click',()=>{const link=document.createElement('a');link.download='qrcode.png';link.href=canvas.toDataURL('image/png');link.click();notifySuccess('QR-kód sikeresen letöltve!')});
  copyBtn.addEventListener('click',()=>navigator.clipboard.writeText(getQRData()).then(()=>notifySuccess('A QR kód tartalma a vágólapra másolva!')).catch(()=>notifyError('Nem sikerült a vágólapra másolni.')));
  renderInputs();
}
