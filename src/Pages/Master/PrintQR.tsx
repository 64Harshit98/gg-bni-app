import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import type { Item } from '../../constants/models';
import { getFirestoreOperations } from '../../lib/ItemsFirebase';
import { Card, CardContent, CardHeader, CardTitle } from '../../Components/ui/card';
import { CustomButton } from '../../Components';
import { Variant } from '../../enums';
import { Input } from '../../Components/ui/input';
import QRCodeLib from 'qrcode';
import JsBarcode from 'jsbarcode';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import { IconClose } from '../../constants/Icons';
import { db } from '../../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { BarcodeSettings, BarcodeFormat } from '../Settings/BarcodeSetting';
import { getDefaultBarcodeSettings } from '../Settings/BarcodeSetting';

// --- Data Types ---
type PrintableItem = Item & {
  quantityToPrint: number;
  queueId: string;
};

type PrefilledItem = { barcode: string, quantity: number, name: string };

// --- Preview Component ---
// "both" layout: QR on LEFT, rotated barcode on RIGHT, equal visual height
const LabelPreview: React.FC<{
  item: Item;
  companyName: string;
  labelFormat: BarcodeFormat;
  showMrp: boolean;
  showProductName: boolean;
  showBarcodeNumber: boolean;
  showShopName: boolean;
}> = ({ item, companyName, labelFormat, showMrp, showProductName, showBarcodeNumber, showShopName }) => {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [barcodeDataUrl, setBarcodeDataUrl] = useState('');

  useEffect(() => {
    if (!item.barcode) return;

    if (labelFormat === 'qr_only' || labelFormat === 'both') {
      QRCodeLib.toDataURL(item.barcode, { width: 140, margin: 1 })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error(err));
    } else {
      setQrDataUrl('');
    }

    if (labelFormat === 'barcode_only' || labelFormat === 'both') {
      const canvas = document.createElement('canvas');
      try {
        JsBarcode(canvas, item.barcode, {
          format: 'CODE128',
          displayValue: false,
          height: 40,
          width: 1,
          margin: 0,
        });
        setBarcodeDataUrl(canvas.toDataURL('image/png'));
      } catch (e) {
        console.error("Invalid barcode format", e);
        setBarcodeDataUrl('');
      }
    } else {
      setBarcodeDataUrl('');
    }
  }, [item.barcode, labelFormat]);

  const isBoth = barcodeDataUrl && qrDataUrl;

  return (
    <div className="w-[200px] h-[200px] border border-dashed border-gray-400 p-2 flex flex-col items-center justify-around font-sans bg-white shadow-lg mt-4">
      {showShopName && (
        <div className="text-xs font-bold text-center">{companyName}</div>
      )}

      {/* Code area */}
      {isBoth ? (
        /* "both": QR LEFT, rotated barcode RIGHT, equal height (96px) */
        <div className="flex flex-row items-center justify-center gap-2 h-28 w-full">
          {/* QR on the LEFT */}
          <img
            src={qrDataUrl}
            alt="QR Code Preview"
            className="w-24 h-24"
          />
          {/* Rotated barcode on the RIGHT — visual height matches QR (96px), visual width = barcode's height dimension (28px) */}
          <div style={{ width: 28, height: 96, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img
              src={barcodeDataUrl}
              alt="Barcode Preview"
              style={{ width: 96, height: 28, transform: 'rotate(90deg)', objectFit: 'contain' }}
            />
          </div>
        </div>
      ) : (
        /* Single code: centered column */
        <div className="flex flex-col items-center justify-center h-28">
          {barcodeDataUrl && (
            <div className="w-24 h-8 flex items-center justify-center overflow-hidden mb-1">
              <img src={barcodeDataUrl} alt="Barcode Preview" className="w-24 h-8" />
            </div>
          )}
          {qrDataUrl && (
            <img src={qrDataUrl} alt="QR Code Preview" className="w-24 h-24" />
          )}
        </div>
      )}

      {showBarcodeNumber && (
        <div className="text-[10px] text-center">{item.barcode}</div>
      )}
      {showProductName && (
        <div className="text-[10px] font-semibold text-center w-full truncate px-1">{item.name}</div>
      )}
      {showMrp && (
        <div className="text-xs font-bold text-center">{`MRP: ₹${item.mrp}`}</div>
      )}
    </div>
  );
};

const QRCodeGeneratorPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [printQueue, setPrintQueue] = useState<PrintableItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const navigate = useNavigate();
  const [itemForPreview, setItemForPreview] = useState<PrintableItem | null>(null);
  const [companyName, setCompanyName] = useState<string>('Your Company');
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);
  const [barcodeSettings, setBarcodeSettings] = useState<BarcodeSettings>(
    getDefaultBarcodeSettings('')
  );

  const hasPrefilled = useRef(false);
  const location = useLocation();

  const dbOperations = useMemo(() => {
    if (currentUser?.companyId) return getFirestoreOperations(currentUser.companyId);
    return null;
  }, [currentUser]);

  useEffect(() => {
    if (!dbOperations || !currentUser?.companyId) { setIsLoading(false); return; }
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [fetchedItems, businessInfo] = await Promise.all([
          dbOperations.syncItems(),
          dbOperations.getBusinessInfo()
        ]);
        setAllItems(fetchedItems.filter(item => item.barcode && item.barcode.trim() !== ''));
        setCompanyName(businessInfo.name || 'Your Company');

        const settingsRef = doc(db, 'companies', currentUser.companyId!, 'settings', 'barcode-settings');
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          setBarcodeSettings({
            ...getDefaultBarcodeSettings(currentUser.companyId!),
            ...settingsSnap.data() as BarcodeSettings,
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [dbOperations, currentUser?.companyId]);

  useEffect(() => {
    const prefilledItems = location.state?.prefilledItems as PrefilledItem[] | undefined;
    if (prefilledItems && allItems.length > 0 && !hasPrefilled.current) {
      const allItemsMap = new Map(allItems.map(item => [item.id, item]));
      const itemsToPrint = prefilledItems.map((pItem: PrefilledItem) => {
        const fullItem = allItemsMap.get(pItem.barcode);
        const matchedItem = fullItem || allItems.find(i => i.barcode === pItem.barcode);
        if (matchedItem) return { ...matchedItem, quantityToPrint: pItem.quantity, queueId: crypto.randomUUID() as string };
        return null;
      }).filter(Boolean) as PrintableItem[];
      setPrintQueue(itemsToPrint);
      if (itemsToPrint.length > 0) setItemForPreview(itemsToPrint[0]);
      hasPrefilled.current = true;
    }
  }, [location.state, allItems]);

  useEffect(() => {
    if (!itemForPreview && printQueue.length > 0) setItemForPreview(printQueue[0]);
    else if (printQueue.length === 0) setItemForPreview(null);
  }, [printQueue, itemForPreview]);

  const availableItemsForSearch = useMemo(() => {
    const itemIdsInQueue = new Set(printQueue.map(item => item.id));
    return allItems.filter(item => !itemIdsInQueue.has(item.id));
  }, [allItems, printQueue]);

  const handleAddItemToQueue = useCallback((item: Item) => {
    if (printQueue.some(qi => qi.id === item.id)) return;
    setPrintQueue(prev => [...prev, { ...item, quantityToPrint: 1, queueId: crypto.randomUUID() as string }]);
  }, [printQueue]);

  const handleRemoveItemFromQueue = useCallback((queueId: string) => {
    setPrintQueue(prev => prev.filter(item => item.queueId !== queueId));
  }, []);

  const handleQuantityChange = useCallback((queueId: string, quantity: number) => {
    setPrintQueue(prev => prev.map(item =>
      item.queueId === queueId ? { ...item, quantityToPrint: Math.max(1, quantity) } : item
    ));
  }, []);

  const isPrintButtonDisabled = printQueue.length === 0 || isPrinting;

  const handlePrint = useCallback(async () => {
    if (isPrintButtonDisabled || !dbOperations) return;
    setIsPrinting(true);

    const labelFormat: BarcodeFormat = barcodeSettings.labelFormat ?? 'both';
    const showShopName = barcodeSettings.showShopNameOnLabel ?? true;
    const showBarcodeNum = barcodeSettings.showBarcodeNumber ?? true;
    const showProductName = barcodeSettings.showProductNameOnLabel ?? true;
    const showMrp = barcodeSettings.showMrpOnLabel ?? true;
    const showAddress = barcodeSettings.showAddressOnLabel ?? true;
    const showPhone = barcodeSettings.showPhoneOnLabel ?? true;

    try {
      const businessInfo = await dbOperations.getBusinessInfo();
      const cName = (businessInfo.name || 'Your Company').replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const businessAddress = (businessInfo.address || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const businessPhone = (businessInfo.phoneNumber || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");

      let allLabelsHtml = '';
      const canvas = document.createElement('canvas');

      for (const item of printQueue) {
        if (!item.barcode) continue;

        let qrDataUrl = '';
        let barcodeDataUrl = '';

        if (labelFormat === 'qr_only' || labelFormat === 'both') {
          qrDataUrl = await QRCodeLib.toDataURL(item.barcode, { width: 150, margin: 1 });
        }

        if (labelFormat === 'barcode_only' || labelFormat === 'both') {
          try {
            JsBarcode(canvas, item.barcode, { format: 'CODE128', displayValue: false, height: 40, width: 1.5, margin: 0 });
            barcodeDataUrl = canvas.toDataURL('image/png');
          } catch (e) {
            console.warn(`Could not generate barcode for ${item.name}`, e);
            continue;
          }
        }

        // Build barcode/QR area HTML
        // "both": QR LEFT, rotated barcode RIGHT, equal heights (14mm each)
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

        for (let i = 0; i < item.quantityToPrint; i++) {
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
                ${showProductName ? `<p class="item-name">${item.name}</p>` : ''}
                ${showMrp ? `<p class="item-mrp">MRP: ₹${item.mrp}</p>` : ''}
              </div>
            </div>
          `;
        }
      }

      const printWindow = window.open('', '', 'height=600,width=800');
      if (!printWindow) throw new Error("Could not open print window. Please allow pop-ups.");

      printWindow.document.write(`
        <html>
        <head>
          <title>Print Labels</title>
          <style>
            @page { size: 110mm 35mm; margin: 0; }
            body {
              margin: 0;
              padding-left: 2.5mm;
              padding-right: 2.5mm;
              box-sizing: border-box;
              font-family: sans-serif;
              display: flex;
              flex-wrap: wrap;
              justify-content: space-between;
            }
            .label-container {
              width: 35mm;
              height: 35mm;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              padding: 0.5mm;
              page-break-inside: avoid;
              text-align: center;
              overflow: hidden;
            }
            .company-name { font-size: 7pt; font-weight: bold; margin: 0; text-align: center; }
            .business-info { font-size: 5pt; margin: 0; }
            .info-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              width: 34mm;
              max-width: 34mm;
              margin-top: 0.5mm;
              gap: 1mm;
              overflow: hidden;
            }
            .info-left { text-align: left; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: clip; }
            .info-right { text-align: right; flex-shrink: 0; max-width: 12mm; white-space: nowrap; overflow: hidden; text-overflow: clip; }

            /* Default (single-code) barcode area */
            .barcode-area {
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              width: 100%;
              margin-top: -5mm;
              margin-bottom: -4mm;
            }

            /* "both" layout: QR LEFT, rotated barcode RIGHT, equal heights */
            .barcode-area.side-by-side {
              flex-direction: row;
              gap: 1.5mm;
              align-items: center;
              justify-content: center;
              margin-top: -2mm;
              margin-bottom: -1mm;
            }

            /* QR in side-by-side: 14×14mm */
            .barcode-area.side-by-side .qr-image {
              width: 14mm;
              height: 14mm;
            }

            /*
             * Rotated barcode:
             * Natural SVG = 14mm wide × ~6mm tall.
             * After rotate(90deg): visually ~6mm wide × 14mm tall.
             * Container matches the visual footprint.
             */
            .barcode-rotated-wrapper {
              width: 6mm;
              height: 14mm;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            }
            .barcode-image-rotated {
              width: 14mm;
              height: 6mm;
              transform: rotate(90deg);
              object-fit: contain;
            }

            /* Single-code QR */
            .qr-image { width: 14mm; height: 14mm; object-fit: contain; }
            /* Single-code barcode (horizontal) */
            .barcode-image { width: 30mm; height: 16mm; object-fit: contain; margin-bottom: -6mm; margin-top: -2mm; }

            .item-barcode { font-size: 4pt; font-weight: bold; margin: 0; }
            .item-name { font-size: 6pt; font-weight: bold; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 33mm; display: block; }
            .item-mrp { font-size: 7pt; font-weight: bold; margin: 0; }
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

    } catch (err: any) {
      console.error("Printing failed:", err);
      alert(`Printing failed: ${err.message}.`);
    } finally {
      setIsPrinting(false);
    }
  }, [printQueue, isPrintButtonDisabled, dbOperations, barcodeSettings]);

  const formatLabel: Record<BarcodeFormat, string> = {
    qr_only: 'QR Code Only',
    barcode_only: 'Barcode Only',
    both: 'Barcode + QR',
  };

  const renderContent = () => {
    if (isLoading) return <p className="text-center text-gray-500">Loading items...</p>;

    return (
      <div className="flex flex-col gap-5 bg-white/80 p-4 rounded-sm border border-gray-100 shadow-sm">

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Printing format:</span>
          <span className="text-xs font-semibold bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">
            {formatLabel[barcodeSettings.labelFormat ?? 'both']}
          </span>
          <span className="text-xs text-gray-400">· 35 × 35 mm</span>
          <button
            onClick={() => navigate('/masters/barcode-setting')}
            className="text-xs text-sky-600 underline hover:text-sky-800 ml-1"
          >
            Change in settings →
          </button>
        </div>

        <div className="relative">
          <SearchableItemInput
            label=""
            placeholder="Search to add items to the print list..."
            items={availableItemsForSearch}
            onItemSelected={handleAddItemToQueue}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Preview */}
          <div className="bg-gray-50 rounded-sm p-3 self-start border border-gray-100">
            <button
              onClick={() => setIsPreviewOpen(!isPreviewOpen)}
              className="w-full flex justify-between items-center text-sm font-medium text-gray-800"
            >
              <span>Label Preview</span>
              <span className={`text-xs text-gray-500 transition-transform duration-200 ${isPreviewOpen ? "rotate-180" : "rotate-0"}`}>▼</span>
            </button>
            {isPreviewOpen && (
              <div className="mt-3 rounded-sm border border-dashed border-gray-200 bg-white flex items-center justify-center px-4 py-6">
                {itemForPreview ? (
                  <LabelPreview
                    item={itemForPreview}
                    companyName={companyName}
                    labelFormat={barcodeSettings.labelFormat ?? 'both'}
                    showMrp={barcodeSettings.showMrpOnLabel ?? true}
                    showProductName={barcodeSettings.showProductNameOnLabel ?? true}
                    showBarcodeNumber={barcodeSettings.showBarcodeNumber ?? true}
                    showShopName={barcodeSettings.showShopNameOnLabel ?? true}
                  />
                ) : (
                  <div className="text-xs text-gray-400 text-center">
                    Select an item from the cart to preview its label.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Queue */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              {printQueue.length > 0 ? (
                <>
                  <h3 className="text-sm font-medium text-gray-800">Cart</h3>
                  <span className="text-xs text-gray-500">{printQueue.length} item{printQueue.length > 1 ? "s" : ""} selected</span>
                </>
              ) : (
                <h3 className="text-sm font-medium text-gray-400">Cart</h3>
              )}
            </div>

            {printQueue.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-gray-200 bg-gray-50 py-8">
                <p className="text-xs text-gray-500">Your cart is empty.</p>
                <p className="text-[11px] text-gray-400">Search above to add items to the print list.</p>
              </div>
            )}

            {printQueue.map((item) => (
              <div
                key={item.queueId}
                onClick={() => setItemForPreview(item)}
                className={`p-2 border rounded-sm bg-white flex items-center justify-between gap-2 cursor-pointer transition shadow-sm hover:shadow-md ${itemForPreview?.queueId === item.queueId ? "border-blue-400 ring-1 ring-blue-100" : "border-gray-200"
                  }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                  <div className="flex flex-col min-w-0 w-full overflow-hidden">
                    <span className="font-medium text-[12px] truncate whitespace-nowrap overflow-hidden block">{item.name}</span>
                    <span className="text-[10px] text-gray-500 truncate whitespace-nowrap overflow-hidden block">Barcode: {item.barcode}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[12px] font-semibold text-gray-800">₹{item.mrp}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-gray-500">Qty</span>
                    <div className="flex items-center border border-gray-200 rounded-sm overflow-hidden bg-gray-50 h-7">
                      <button onClick={(e) => { e.stopPropagation(); handleQuantityChange(item.queueId, item.quantityToPrint - 1); }} className="px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100">-</button>
                      <Input
                        type="number"
                        value={item.quantityToPrint}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); handleQuantityChange(item.queueId, Number(e.target.value)); }}
                        className="w-12 h-7 text-center text-xs border-x border-gray-200 rounded-sm p-0 focus:ring-0 bg-white"
                      />
                      <button onClick={(e) => { e.stopPropagation(); handleQuantityChange(item.queueId, item.quantityToPrint + 1); }} className="px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100">+</button>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleRemoveItemFromQueue(item.queueId); }} className="text-gray-400 hover:text-red-500 p-1">
                    <IconClose width={14} height={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {printQueue.length > 0 && (
          <div className="border-t border-gray-100 pt-4 mt-4 flex flex-col items-center gap-3">
            <p className="text-[11px] text-gray-500">
              Ready to print labels for{" "}
              <span className="font-medium text-gray-700">{printQueue.length} item{printQueue.length > 1 ? "s" : ""}</span>.
            </p>
            <div className="w-full flex justify-center">
              <CustomButton
                onClick={handlePrint}
                disabled={isPrintButtonDisabled}
                variant={Variant.Filled}
                className="w-60 py-3 !rounded-sm !bg-gray-900 !text-white !text-sm !font-semibold hover:!bg-black"
              >
                {isPrinting ? "Generating..." : "Print labels"}
              </CustomButton>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="max-w-4xl mx-auto mb-16">
      <CardHeader className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="rounded-sm w-8 h-8 flex items-center justify-center bg-gray-200 text-gray-900 hover:bg-gray-300">
          <IconClose width={18} height={20} />
        </button>
        <CardTitle className="text-lg font-bold text-gray-800 text-center flex-1">Item QR Code Generator</CardTitle>
        <div className="w-8" />
      </CardHeader>
      <CardContent>{renderContent()}</CardContent>
    </Card>
  );
};

export default QRCodeGeneratorPage;