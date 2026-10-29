import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import type { Item } from '../../constants/models';
import { getFirestoreOperations } from '../../lib/ItemsFirebase';
import { CustomButton } from '../../Components';
import { Variant } from '../../enums';
import { Input } from '../../Components/ui/input';
import QRCodeLib from 'qrcode';
import JsBarcode from 'jsbarcode';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
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

// Falls back to salesPrice when mrp is missing/zero
const getDisplayPrice = (item: Item): number => {
  return item.mrp && item.mrp > 0 ? item.mrp : item.salesPrice;
};

// --- UI-only helpers (no logic) ---
const FONT_STACK = 'Poppins, system-ui, -apple-system, "Segoe UI", sans-serif';

const CHECKER_BG: React.CSSProperties = {
  background: 'repeating-conic-gradient(#f5f7ff 0 25%, #ffffff 0 50%) 0 0 / 16px 16px',
};

const IconMinus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /></svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);
const IconPrinter = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2" /><path d="M6 14h12v7H6z" /></svg>
);
const IconChevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);
const IconBack = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
);
const IconBarcodeEmpty = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5v14M8 5v14M11 5v10M14 5v14M17 5v10M20 5v14" /></svg>
);

// --- Preview Component ---
// "both" layout: QR on LEFT, rotated barcode on RIGHT, equal visual height
const LabelPreview: React.FC<{
  item: Item;
  companyName: string;
  labelFormat: BarcodeFormat;
  showMrp: boolean;
  showSalePrice: boolean;
  showProductName: boolean;
  showBarcodeNumber: boolean;
  showShopName: boolean;
}> = ({ item, companyName, labelFormat, showMrp, showSalePrice, showProductName, showBarcodeNumber, showShopName }) => {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [barcodeDataUrl, setBarcodeDataUrl] = useState('');

  useEffect(() => {
    if (!item.barcode) return;

    if (labelFormat === 'qr_only' || labelFormat === 'both') {
      QRCodeLib.toDataURL(item.barcode, { width: 140, margin: 2, errorCorrectionLevel: 'H' })
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
          width: 2,
          margin: 8,
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
    <div
      className="w-[200px] h-[200px] border border-[#cfd6e4] rounded-sm p-2 flex flex-col items-center justify-around bg-white text-black shadow-[0_6px_20px_rgba(21,48,140,0.12)]"
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
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
            style={{ imageRendering: 'pixelated' }}
          />
          {/* Rotated barcode on the RIGHT — visual height matches QR (96px), visual width = barcode's height dimension (28px) */}
          <div style={{ width: 28, height: 96, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img
              src={barcodeDataUrl}
              alt="Barcode Preview"
              style={{ width: 96, height: 28, transform: 'rotate(90deg)', objectFit: 'contain', imageRendering: 'pixelated' }}
            />
          </div>
        </div>
      ) : (
        /* Single code: centered column */
        <div className="flex flex-col items-center justify-center h-28">
          {barcodeDataUrl && (
            <div className="w-24 h-8 flex items-center justify-center overflow-hidden mb-1">
              <img src={barcodeDataUrl} alt="Barcode Preview" className="w-24 h-8" style={{ imageRendering: 'pixelated' }} />
            </div>
          )}
          {qrDataUrl && (
            <img src={qrDataUrl} alt="QR Code Preview" className="w-24 h-24" style={{ imageRendering: 'pixelated' }} />
          )}
        </div>
      )}

      {showBarcodeNumber && (
        <div className="text-[10px] tracking-[0.1em] text-center">{item.barcode}</div>
      )}
      {showProductName && (
        <div className="text-[10px] font-semibold text-center w-full truncate px-1">{item.name}</div>
      )}
      {showMrp && (
        <div className="text-xs font-bold text-center">
          {item.mrp && item.mrp > 0 ? `MRP: ₹${item.mrp}` : `Price: ₹${item.salesPrice}`}
        </div>
      )}
      {showSalePrice && item.mrp && item.mrp > 0 && (
        <div className="text-[10px] font-semibold text-center">Sale: ₹{item.salesPrice}</div>
      )}
    </div>
  );
};

const QRCodeGeneratorPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { items: catalogueItems, itemsLoading: catalogueItemsLoading } = useCatalogueData();
  const allItems = useMemo(
    () => catalogueItems.filter(item => item.barcode && item.barcode.trim() !== ''),
    [catalogueItems]
  );
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

  // "Show on label" toggles (session-only). Start from saved settings.
  const [labelToggles, setLabelToggles] = useState({
    shopName: true,
    productName: true,
    mrp: true,
    barcodeNumber: true,
    salePrice: false,
  });
  useEffect(() => {
    setLabelToggles({
      shopName: barcodeSettings.showShopNameOnLabel ?? true,
      productName: barcodeSettings.showProductNameOnLabel ?? true,
      mrp: barcodeSettings.showMrpOnLabel ?? true,
      barcodeNumber: barcodeSettings.showBarcodeNumber ?? true,
      salePrice: false,
    });
  }, [barcodeSettings]);

  // Item whose edit drawer should be open (used by "Set MRP")
  const [itemToEdit, setItemToEdit] = useState<Item | null>(null);

  const hasPrefilled = useRef(false);
  const location = useLocation();

  const dbOperations = useMemo(() => {
    if (currentUser?.companyId) return getFirestoreOperations(currentUser.companyId);
    return null;
  }, [currentUser]);

  // items now come from the shared CatalogueDataContext instead of this page
  // fetching them itself; businessInfo/barcode-settings are page-specific.
  const [pageDataLoading, setPageDataLoading] = useState(true);
  useEffect(() => {
    if (!dbOperations || !currentUser?.companyId) { setPageDataLoading(false); return; }
    const fetchData = async () => {
      setPageDataLoading(true);
      try {
        const businessInfo = await dbOperations.getBusinessInfo();
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
        setPageDataLoading(false);
      }
    };
    fetchData();
  }, [dbOperations, currentUser?.companyId]);

  useEffect(() => {
    setIsLoading(pageDataLoading || catalogueItemsLoading);
  }, [pageDataLoading, catalogueItemsLoading]);

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

  // Keep queue/preview in sync when an item is edited elsewhere (e.g. MRP set in the drawer)
  useEffect(() => {
    if (allItems.length === 0) return;
    const byId = new Map(allItems.map(i => [i.id, i]));
    setPrintQueue(prev => prev.map(q => {
      const fresh = byId.get(q.id);
      return fresh ? { ...fresh, quantityToPrint: q.quantityToPrint, queueId: q.queueId } : q;
    }));
    setItemForPreview(prev => {
      if (!prev) return prev;
      const fresh = byId.get(prev.id);
      return fresh ? { ...fresh, quantityToPrint: prev.quantityToPrint, queueId: prev.queueId } : prev;
    });
  }, [allItems]);

  // Called by ItemEditDrawer after a successful save (e.g. MRP set)
  const handleItemSaved = useCallback((updated: Partial<Item>) => {
    const id = itemToEdit?.id;
    if (!id) return;
    setPrintQueue(prev => prev.map(q => q.id === id ? { ...q, ...updated } : q));
    setItemForPreview(prev => prev && prev.id === id ? { ...prev, ...updated } : prev);
    setItemToEdit(null);
  }, [itemToEdit]);

  const isPrintButtonDisabled = printQueue.length === 0 || isPrinting;

  const handlePrint = useCallback(async () => {
    if (isPrintButtonDisabled || !dbOperations) return;
    setIsPrinting(true);

    const labelFormat: BarcodeFormat = barcodeSettings.labelFormat ?? 'both';
    const showShopName = labelToggles.shopName;
    const showBarcodeNum = labelToggles.barcodeNumber;
    const showProductName = labelToggles.productName;
    const showMrp = labelToggles.mrp;
    const showSale = labelToggles.salePrice;
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
               ${showMrp ? `<p class="item-mrp">${item.mrp && item.mrp > 0 ? `MRP: ₹${item.mrp}` : `Price: ₹${item.salesPrice}`}</p>` : ''}
               ${showSale && item.mrp && item.mrp > 0 ? `<p class="item-sale">Sale: ₹${item.salesPrice}</p>` : ''}
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
              align-items: center;
              justify-content: center;
              margin-top: -2mm;
              margin-bottom: -1mm;
            }

            /* QR in side-by-side: 14×14mm */
            .barcode-area.side-by-side .qr-image {
              width: 16mm;
              height: 16mm;
            }

            /*
             * Rotated barcode:
             * Natural SVG = 14mm wide × ~6mm tall.
             * After rotate(90deg): visually ~6mm wide × 14mm tall.
             * Container matches the visual footprint.
             */
            .barcode-rotated-wrapper {
              width: 14mm;
              height: 14mm;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            }
            .barcode-image-rotated {
              width: 14mm;
              height: 14mm;
              transform: rotate(90deg);
              object-fit: contain;
            }

            /* Single-code QR */
            .qr-image { width: 20mm; height: 20mm; object-fit: contain; }
            /* Single-code barcode (horizontal) */
            .barcode-image { width: 30mm; height: 16mm; object-fit: contain; margin-bottom: -6mm; margin-top: -2mm; }

            /* Keep QR/barcode edges crisp instead of letting the browser smooth/blur them
               when scaling down for print — blurred edges are what makes scanners slow to lock on. */
            .qr-image, .barcode-image, .barcode-image-rotated {
              image-rendering: -webkit-optimize-contrast;
              image-rendering: crisp-edges;
              image-rendering: pixelated;
            }

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

    } catch (err: any) {
      console.error("Printing failed:", err);
      alert(`Printing failed: ${err.message}.`);
    } finally {
      setIsPrinting(false);
    }
  }, [printQueue, isPrintButtonDisabled, dbOperations, barcodeSettings, labelToggles]);

  const formatLabel: Record<BarcodeFormat, string> = {
    qr_only: 'QR Code Only',
    barcode_only: 'Barcode Only',
    both: 'Barcode + QR',
  };

  // Display-only totals for the summary UI
  const totalLabels = printQueue.reduce((sum, item) => sum + item.quantityToPrint, 0);

  const missingMrpItems = printQueue.filter(i => !(i.mrp && i.mrp > 0));
  const toggleChips: { key: keyof typeof labelToggles; label: string }[] = [
    { key: 'shopName', label: 'Store name' },
    { key: 'productName', label: 'Item name' },
    { key: 'mrp', label: 'MRP' },
    { key: 'salePrice', label: 'Sale price' },
    { key: 'barcodeNumber', label: 'Barcode no.' },
  ];

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-[#5b6b86]">
          <div className="h-7 w-7 animate-spin rounded-sm border-[3px] border-[#dfe6fb] border-t-[#155dfc]" />
          <p className="text-sm">Loading items...</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">

        {/* ───────── LEFT: format, search, print list ───────── */}
        <div className="flex flex-col gap-4 min-w-0">

          {/* Format + search card */}
          <div className="rounded-sm border border-[#dfe6fb] bg-white p-4 flex flex-col gap-3 shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]">Format</span>
              <span className="inline-flex items-center h-7 px-3 rounded-sm bg-[#e6eeff] text-[#155dfc] text-xs font-semibold">
                {formatLabel[barcodeSettings.labelFormat ?? 'both']}
              </span>
              <span className="inline-flex items-center h-7 px-3 rounded-sm border border-[#dfe6fb] bg-[#f5f7ff] text-xs text-[#45556c]">
                35 × 35 mm
              </span>
              <button
                onClick={() => navigate('/barcode-setting')}
                className="ml-auto text-xs font-medium text-[#155dfc] hover:text-[#1447e6] hover:underline"
              >
                Printer &amp; label settings →
              </button>
            </div>

            <div className="relative rounded-sm ring-0 focus-within:ring-4 focus-within:ring-[#e6eeff]">
              <SearchableItemInput
                label=""
                placeholder="Search items to add..."
                items={availableItemsForSearch}
                onItemSelected={handleAddItemToQueue}
              />
            </div>
          </div>

          {/* Print list card */}
          <div className="rounded-sm border border-[#dfe6fb] bg-white overflow-hidden shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#dfe6fb]">
              <h3 className={`text-base font-semibold ${printQueue.length > 0 ? 'text-[#0f172b]' : 'text-[#5b6b86]'}`}>Print list</h3>
              {printQueue.length > 0 && (
                <span className="inline-flex items-center h-6 px-2.5 rounded-sm bg-[#e6eeff] text-[#155dfc] text-xs font-semibold">
                  {printQueue.length} item{printQueue.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {printQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-14 text-center">
                <div className="mb-1 grid h-14 w-14 place-items-center rounded-sm bg-[#f5f7ff] text-[#5b6b86]">
                  <IconBarcodeEmpty />
                </div>
                <p className="text-sm font-medium text-[#0f172b]">Your print list is empty</p>
                <p className="text-xs text-[#5b6b86]">Search above to add items to the print list.</p>
              </div>
            ) : (
              <>
                <div>
                  <div className="hidden md:grid grid-cols-[minmax(0,1fr)_120px_140px_40px] items-center gap-2 bg-[#f5f7ff] border-b border-[#dfe6fb] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]">
                    <span>Item</span>
                    <span className="text-right">Label price</span>
                    <span>Labels</span>
                    <span />
                  </div>
                  {printQueue.map((item) => {
                    const isSelected = itemForPreview?.queueId === item.queueId;
                    const hasMrp = !!(item.mrp && item.mrp > 0);
                    return (
                      <div
                        key={item.queueId}
                        onClick={() => setItemForPreview(item)}
                        aria-selected={isSelected}
                        className={`grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_120px_140px_40px] items-center gap-x-3 gap-y-3 md:gap-y-0 md:gap-x-2 px-3 sm:px-4 py-3 cursor-pointer border-b border-[#dfe6fb] last:border-b-0 transition-colors ${isSelected ? "bg-[#e6eeff]" : "bg-white hover:bg-[#f5f7ff]"}`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[#0f172b] truncate">{item.name}</div>
                          <div className="text-xs text-[#5b6b86] truncate">Barcode: {item.barcode}</div>
                        </div>
                        <div className="text-right whitespace-nowrap">
                          <div className="text-sm font-semibold text-[#0f172b] tabular-nums">₹{getDisplayPrice(item)}</div>
                          <div className={`text-[11px] ${hasMrp ? 'text-[#5b6b86]' : 'text-[#bb4d00] font-medium'}`}>
                            {hasMrp ? 'MRP' : 'No MRP · sale price'}
                          </div>
                        </div>
                        <div>
                          <div className="inline-flex items-center h-9 rounded-sm border border-[#7a8aa3] bg-white overflow-hidden">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleQuantityChange(item.queueId, item.quantityToPrint - 1); }}
                              className="grid h-9 w-9 place-items-center text-[#45556c] hover:bg-[#f5f7ff]"
                              aria-label="Less"
                            >
                              <IconMinus />
                            </button>
                            <Input
                              type="number"
                              value={item.quantityToPrint}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => { e.stopPropagation(); handleQuantityChange(item.queueId, Number(e.target.value)); }}
                              className="w-12 h-9 text-center text-sm font-semibold tabular-nums border-0 border-x border-[#dfe6fb] rounded-none p-0 focus:ring-0 bg-white"
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); handleQuantityChange(item.queueId, item.quantityToPrint + 1); }}
                              className="grid h-9 w-9 place-items-center text-[#45556c] hover:bg-[#f5f7ff]"
                              aria-label="More"
                            >
                              <IconPlus />
                            </button>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveItemFromQueue(item.queueId); }}
                            className="grid h-9 w-9 place-items-center rounded-sm text-[#5b6b86] hover:bg-[#ffeef0] hover:text-[#d5000c]"
                            aria-label="Remove"
                          >
                            <IconClose width={14} height={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-6 border-t border-[#dfe6fb] bg-[#f5f7ff] px-4 py-2.5 text-[13px] text-[#45556c]">
                  <span>Items <b className="text-[#0f172b] tabular-nums">{printQueue.length}</b></span>
                  <span>Labels <b className="text-[#0f172b] tabular-nums">{totalLabels}</b></span>
                </div>
              </>
            )}
          </div>

          {/* Missing MRP note */}
          {missingMrpItems.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-sm border border-[#f3d49a] bg-[#fff3dd] px-4 py-3 text-[13px] text-[#bb4d00]">
              <span className="min-w-0 flex-1 basis-56">
                <b>
                  {missingMrpItems.length === 1
                    ? `${missingMrpItems[0].name} has no MRP`
                    : `${missingMrpItems[0].name} and ${missingMrpItems.length - 1} more have no MRP`}
                </b>
                {missingMrpItems.length === 1
                  ? ', so its label will show the sale price. Set the MRP first to print it.'
                  : ', so their labels will show the sale price. Set the MRP first to print it.'}
              </span>
              <button
                onClick={() => setItemToEdit(missingMrpItems[0])}
                className="shrink-0 h-8 rounded-sm border border-[#bb4d00]/40 bg-white px-3 text-xs font-semibold text-[#bb4d00] hover:bg-[#fff8ea]"
              >
                Set MRP
              </button>
            </div>
          )}
        </div>

        {/* ───────── RIGHT: preview + print ───────── */}
        <aside className="flex flex-col gap-4 rounded-sm border border-[#dfe6fb] bg-white p-4 min-w-0 shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] lg:sticky lg:top-4">
          <button
            onClick={() => setIsPreviewOpen(!isPreviewOpen)}
            className="w-full flex items-start justify-between gap-3 text-left"
          >
            <span className="min-w-0">
              <span className="block text-base font-semibold text-[#0f172b]">Label preview</span>
              <span className="block text-xs text-[#5b6b86] truncate">
                {itemForPreview ? `${itemForPreview.name} · actual size 35 × 35 mm` : 'Actual size 35 × 35 mm'}
              </span>
            </span>
            <span className={`mt-1 text-[#5b6b86] transition-transform duration-200 ${isPreviewOpen ? "rotate-180" : "rotate-0"}`}>
              <IconChevron />
            </span>
          </button>

          {isPreviewOpen && (
            <div
              className="relative grid place-items-center rounded-sm border border-[#dfe6fb] px-4 py-8"
              style={CHECKER_BG}
            >
              {itemForPreview ? (
                <div className="-mt-4">
                  <LabelPreview
                    item={itemForPreview}
                    companyName={companyName}
                    labelFormat={barcodeSettings.labelFormat ?? 'both'}
                    showMrp={labelToggles.mrp}
                    showSalePrice={labelToggles.salePrice}
                    showProductName={labelToggles.productName}
                    showBarcodeNumber={labelToggles.barcodeNumber}
                    showShopName={labelToggles.shopName}
                  />
                </div>
              ) : (
                <div className="rounded-sm bg-white/90 px-3 py-2 text-xs text-[#5b6b86] text-center">
                  Select an item from the print list to preview its label.
                </div>
              )}
            </div>
          )}

          <div>
            <span className="block mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]">Show on label</span>
            <div className="flex flex-wrap gap-2">
              {toggleChips.map(({ key, label }) => {
                const on = labelToggles[key];
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setLabelToggles(prev => ({ ...prev, [key]: !prev[key] }))}
                    className={`h-8 rounded-sm px-3 text-xs font-medium border transition-colors ${on ? 'border-[#155dfc] bg-[#e6eeff] text-[#155dfc]' : 'border-[#7a8aa3] bg-white text-[#45556c] hover:bg-[#f5f7ff]'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[13px]">
            <dt className="text-[#5b6b86]">Format</dt>
            <dd className="font-medium text-[#0f172b] text-right">{formatLabel[barcodeSettings.labelFormat ?? 'both']}</dd>
            <dt className="text-[#5b6b86]">Items</dt>
            <dd className="font-medium text-[#0f172b] text-right tabular-nums">{printQueue.length}</dd>
            <dt className="text-[#5b6b86]">Labels to print</dt>
            <dd className="font-semibold text-[#0f172b] text-right tabular-nums">{totalLabels}</dd>
          </dl>

          {printQueue.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-[#dfe6fb] pt-4">
              <p className="text-center text-xs text-[#5b6b86]">
                Ready to print labels for{" "}
                <span className="font-semibold text-[#0f172b]">{printQueue.length} item{printQueue.length > 1 ? "s" : ""}</span>.
              </p>
              <CustomButton
                onClick={handlePrint}
                disabled={isPrintButtonDisabled}
                variant={Variant.Filled}
                className="w-full h-12 flex items-center justify-center gap-2 !rounded-sm !bg-[#155dfc] !text-white !text-sm !font-semibold hover:!bg-[#1447e6] disabled:!opacity-60"
              >
                {isPrinting ? "Generating..." : (<><IconPrinter />Print {totalLabels} label{totalLabels > 1 ? "s" : ""}</>)}
              </CustomButton>
            </div>
          )}
        </aside>
      </div>
    );
  };

  return (
    <div
      className="w-full min-h-full bg-[#eef2ff] pb-28 lg:pb-8 sm:rounded-sm overflow-hidden"
      style={{ fontFamily: FONT_STACK }}
    >
      {/* Header: flush to the very top, full width */}
      <div className="flex items-center gap-3 border-b border-[#dfe6fb] bg-white px-3 py-3 sm:px-6 sm:py-4">
        <button
          onClick={() => navigate(-1)}
          className="shrink-0 rounded-sm w-10 h-10 flex items-center justify-center border border-[#dfe6fb] bg-white text-[#0f172b] hover:bg-[#f5f7ff]"
          aria-label="Back"
        >
          <IconBack />
        </button>
        <div className="min-w-0 flex-1 text-left">
          <h1 className="m-0 text-lg sm:text-xl font-semibold tracking-tight text-[#0f172b] leading-tight truncate">Print labels</h1>
          <p className="hidden sm:block m-0 text-xs text-[#5b6b86]">Barcode &amp; QR stickers for your items</p>
        </div>
      </div>

      <div className="p-3 sm:p-5">{renderContent()}</div>

      <ItemEditDrawer
        item={itemToEdit}
        isOpen={!!itemToEdit}
        onClose={() => setItemToEdit(null)}
        onSaveSuccess={handleItemSaved}
      />
    </div>
  );
};

export default QRCodeGeneratorPage;