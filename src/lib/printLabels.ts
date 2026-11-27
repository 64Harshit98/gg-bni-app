import { doc, getDoc } from 'firebase/firestore';
import QRCodeLib from 'qrcode';
import JsBarcode from 'jsbarcode';
import { db } from './Firebase';
import { getFirestoreOperations } from './ItemsFirebase';
import type { Item } from '../constants/models';
// ⚠️ Path apne folder ke hisaab se theek karo (QR page me '../Settings/BarcodeSetting' tha)
import type { BarcodeSettings, BarcodeFormat } from '../Pages/Settings/BarcodeSetting';
import { getDefaultBarcodeSettings } from '../Pages/Settings/BarcodeSetting';

export type LabelEntry = { item: Item; quantity: number };

const esc = (s: string) => (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Same label output as the Print QR page's handlePrint
export const printItemLabels = async (companyId: string, entries: LabelEntry[]) => {
  // Popup blocker se bachne ke liye window click ke turant baad (await se pehle) kholo
  const printWindow = window.open('', '', 'height=600,width=800');
  if (!printWindow) throw new Error('Could not open print window. Please allow pop-ups.');

  try {
    const dbOperations = getFirestoreOperations(companyId);
    const businessInfo = await dbOperations.getBusinessInfo();

    const settingsSnap = await getDoc(doc(db, 'companies', companyId, 'settings', 'barcode-settings'));
    const barcodeSettings: BarcodeSettings = settingsSnap.exists()
      ? { ...getDefaultBarcodeSettings(companyId), ...(settingsSnap.data() as BarcodeSettings) }
      : getDefaultBarcodeSettings(companyId);

    const labelFormat: BarcodeFormat = barcodeSettings.labelFormat ?? 'both';
    const showShopName = barcodeSettings.showShopNameOnLabel ?? true;
    const showProductName = barcodeSettings.showProductNameOnLabel ?? true;
    const showMrp = barcodeSettings.showMrpOnLabel ?? true;
    const showBarcodeNum = barcodeSettings.showBarcodeNumber ?? true;
    const showSale = false; // QR page me bhi default false hai
    const showAddress = barcodeSettings.showAddressOnLabel ?? true;
    const showPhone = barcodeSettings.showPhoneOnLabel ?? true;

    const cName = esc(businessInfo.name || 'Your Company');
    const businessAddress = esc(businessInfo.address || '');
    const businessPhone = esc(businessInfo.phoneNumber || '');

    let allLabelsHtml = '';
    const canvas = document.createElement('canvas');

    for (const { item, quantity } of entries) {
      if (!item.barcode) continue;

      let qrDataUrl = '';
      let barcodeDataUrl = '';

      if (labelFormat === 'qr_only' || labelFormat === 'both') {
        qrDataUrl = await QRCodeLib.toDataURL(item.barcode, { width: 300, margin: 2, errorCorrectionLevel: 'H' });
      }

      if (labelFormat === 'barcode_only' || labelFormat === 'both') {
        try {
          JsBarcode(canvas, item.barcode, { format: 'CODE128', displayValue: false, height: 60, width: 2, margin: 8 });
          barcodeDataUrl = canvas.toDataURL('image/png');
        } catch (e) {
          console.warn(`Could not generate barcode for ${item.name}`, e);
          continue;
        }
      }

      let barcodeAreaHtml = '';
      if (labelFormat === 'both' && barcodeDataUrl && qrDataUrl) {
        barcodeAreaHtml = `
          <div class="barcode-area side-by-side">
            <img class="qr-image" src="${qrDataUrl}" alt="QR" />
            <div class="barcode-rotated-wrapper">
              <img class="barcode-image-rotated" src="${barcodeDataUrl}" alt="Barcode" />
            </div>
          </div>`;
      } else {
        barcodeAreaHtml = `
          <div class="barcode-area">
            ${barcodeDataUrl ? `<img class="barcode-image" src="${barcodeDataUrl}" alt="Barcode" />` : ''}
            ${qrDataUrl ? `<img class="qr-image" src="${qrDataUrl}" alt="QR" />` : ''}
          </div>`;
      }

      for (let i = 0; i < quantity; i++) {
        allLabelsHtml += `
          <div class="label-container">
            <div>
              ${showShopName ? `<p class="company-name">${cName}</p>` : ''}
              ${(showAddress || showPhone) ? `
                <div class="info-row">
                  <p class="business-info info-left">${showAddress ? businessAddress : ''}</p>
                  <p class="business-info info-right">${showPhone ? businessPhone : ''}</p>
                </div>` : ''}
            </div>
            ${barcodeAreaHtml}
            <div>
              ${showBarcodeNum ? `<p class="item-barcode">${item.barcode}</p>` : ''}
              ${showProductName ? `<p class="item-name">${esc(item.name)}</p>` : ''}
              ${showMrp ? `<p class="item-mrp">${item.mrp && item.mrp > 0 ? `MRP: ₹${item.mrp}` : `Price: ₹${item.salesPrice}`}</p>` : ''}
              ${showSale && item.mrp && item.mrp > 0 ? `<p class="item-sale">Sale: ₹${item.salesPrice}</p>` : ''}
            </div>
          </div>
        `;
      }
    }

    printWindow.document.write(`
      <html>
      <head>
        <title>Print Labels</title>
        <style>
          @page { size: 110mm 35mm; margin: 0; }
          body { margin: 0; padding-left: 2.5mm; padding-right: 2.5mm; box-sizing: border-box; font-family: sans-serif; display: flex; flex-wrap: wrap; justify-content: space-between; }
          .label-container { width: 35mm; height: 35mm; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 0.5mm; page-break-inside: avoid; text-align: center; overflow: hidden; }
          .company-name { font-size: 7pt; font-weight: bold; margin: 0; text-align: center; }
          .business-info { font-size: 5pt; margin: 0; }
          .info-row { display: flex; justify-content: space-between; align-items: center; width: 34mm; max-width: 34mm; margin-top: 0.5mm; gap: 1mm; overflow: hidden; }
          .info-left { text-align: left; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: clip; }
          .info-right { text-align: right; flex-shrink: 0; max-width: 12mm; white-space: nowrap; overflow: hidden; text-overflow: clip; }
          .barcode-area { display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; margin-top: -5mm; margin-bottom: -4mm; }
          .barcode-area.side-by-side { flex-direction: row; align-items: center; justify-content: center; margin-top: -2mm; margin-bottom: -1mm; }
          .barcode-area.side-by-side .qr-image { width: 16mm; height: 16mm; }
          .barcode-rotated-wrapper { width: 14mm; height: 14mm; overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
          .barcode-image-rotated { width: 14mm; height: 14mm; transform: rotate(90deg); object-fit: contain; }
          .qr-image { width: 20mm; height: 20mm; object-fit: contain; }
          .barcode-image { width: 30mm; height: 16mm; object-fit: contain; margin-bottom: -6mm; margin-top: -2mm; }
          .qr-image, .barcode-image, .barcode-image-rotated { image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; image-rendering: pixelated; }
          .item-barcode { font-size: 4pt; font-weight: bold; margin: 0; }
          .item-name { font-size: 6pt; font-weight: bold; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 33mm; display: block; }
          .item-mrp { font-size: 7pt; font-weight: bold; margin: 0; }
          .item-sale { font-size: 5pt; font-weight: bold; margin: 0; }
        </style>
      </head>
      <body>
        ${allLabelsHtml}
        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 500); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  } catch (err) {
    printWindow.close();
    throw err;
  }
};