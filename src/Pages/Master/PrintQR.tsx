import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import type { Item, PriceTier } from '../../constants/models';
import { TierPickerModal } from '../../Components/TierPickerModal';
import { hasMultiplePricing } from '../utils/pricingUtils';
import { getFirestoreOperations } from '../../lib/ItemsFirebase';
import { CustomButton } from '../../Components';
import { Variant } from '../../enums';
import { Input } from '../../Components/ui/input';
import QRCodeLib from 'qrcode';
import JsBarcode from 'jsbarcode';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { IconClose } from '../../constants/Icons';
import BackButton from '../../Components/BackButton';
import { db } from '../../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { BarcodeSettings, BarcodeFormat, LabelSize } from '../Settings/BarcodeSetting';
import { getDefaultBarcodeSettings, getLabelSize } from '../Settings/BarcodeSetting';
import { useFormatNumber } from '../../lib/formatNumber';
import useTutorial from '../../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../../Catalogue/hooks/useCompleteTutorial';
import { TutorialStep } from '../../Components/TutorialStep';

const TOTAL_STEPS = 5;
const TUTORIAL_KEY = 'printLabelsTutorialDone';

// --- Data Types ---
type PrintableItem = Item & {
  quantityToPrint: number;
  queueId: string;
  tierId?: string; // set when this row is a pricing option (tier) of the item
};

// Builds one print-list row. A tier row uses the tier's own barcode and prices.
const buildQueueRow = (item: Item, tier?: PriceTier): PrintableItem => {
  if (!tier) return { ...item, quantityToPrint: 1, queueId: crypto.randomUUID() as string };
  return {
    ...item,
    name: `${item.name} (${tier.label})`,
    barcode: (tier.barcode || '').trim(),
    mrp: tier.mrp,
    salesPrice: tier.salesPrice,
    tierId: tier.id,
    quantityToPrint: 1,
    queueId: crypto.randomUUID() as string,
  };
};

type PrefilledItem = { barcode: string, quantity: number, name: string };

// Falls back to salesPrice when mrp is missing/zero
const getDisplayPrice = (item: Item): number => {
  return item.mrp && item.mrp > 0 ? item.mrp : item.salesPrice;
};

// Sample data shown ONLY while the tutorial is running (never saved or printed).
// All items have an MRP so the "Set MRP" warning doesn't appear in the tutorial.
const SAMPLE_PRINT_QUEUE: PrintableItem[] = [
  { id: 'sample-1', name: 'Sample Item A', barcode: '100000000001', mrp: 120, salesPrice: 110, quantityToPrint: 2, queueId: 'sample-q-1' },
  { id: 'sample-2', name: 'Sample Item B', barcode: '100000000002', mrp: 250, salesPrice: 235, quantityToPrint: 1, queueId: 'sample-q-2' },
  { id: 'sample-3', name: 'Sample Item C', barcode: '100000000003', mrp: 80, salesPrice: 75, quantityToPrint: 3, queueId: 'sample-q-3' },
] as unknown as PrintableItem[];

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
const IconBarcodeEmpty = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5v14M8 5v14M11 5v10M14 5v14M17 5v10M20 5v14" /></svg>
);
// JsBarcode options. 35x35 is unchanged (margin 8).
// 28x14 "both": no top/bottom margin so the bars use the full box height.
// 28x14 "barcode only": margin 0 (spacing is added in CSS, so the quiet zone is exact).
// NOTE: use `margin: 0`, not `marginTop: 0`. JsBarcode treats a 0 marginTop as "not set".
const getBarcodeOptions = (compact: boolean, format: BarcodeFormat, height: number) => {
  if (!compact) return { height, width: 2, margin: 8 };
  if (format === 'both') {
    return { height, width: 2, marginTop: 2, marginBottom: 2, marginLeft: 8, marginRight: 8 };
  }
  return { height, width: 2, margin: 0 };
};
// --- Preview Component ---
// "both" layout: QR on LEFT, rotated barcode on RIGHT, equal visual height
const LabelPreview: React.FC<{
  item: Item;
  companyName: string;
  businessAddress: string;
  businessPhone: string;
  labelFormat: BarcodeFormat;
  labelSize: LabelSize;
  showMrp: boolean;
  showSalePrice: boolean;
  showProductName: boolean;
  showBarcodeNumber: boolean;
  showShopName: boolean;
  showAddress: boolean;
  showPhone: boolean;
}> = ({ item, companyName, businessAddress, businessPhone, labelFormat, labelSize, showMrp, showSalePrice, showProductName, showBarcodeNumber, showShopName, showAddress, showPhone }) => {
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
          ...getBarcodeOptions(labelSize === '14x28', labelFormat, labelSize === '14x28' ? 60 : 40),
        });
        setBarcodeDataUrl(canvas.toDataURL('image/png'));
      } catch (e) {
        console.error("Invalid barcode format", e);
        setBarcodeDataUrl('');
      }
    } else {
      setBarcodeDataUrl('');
    }
   }, [item.barcode, labelFormat, labelSize]);

  const isBoth = barcodeDataUrl && qrDataUrl;

  // 28 × 14 mm (landscape): same 1.5x preview scale as the 35 × 35 box, so 160 × 80px
  if (labelSize === '14x28') {
    // Barcode only: text on top, wide barcode below with side spacing (23 × 5 mm)
    if (labelFormat === 'barcode_only') {
      return (
        <div
          className="w-[160px] h-[80px] border border-[#cfd6e4] rounded-sm p-[3px] flex flex-col items-center justify-between gap-px bg-white text-black shadow-[0_6px_20px_rgba(21,48,140,0.12)]"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          <div className="w-full flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center gap-px">
            {showShopName && (
              <div className="w-full text-[6px] leading-tight font-bold text-center whitespace-nowrap overflow-hidden">{companyName}</div>
            )}
            {showProductName && <div className="w-full text-[6px] leading-tight font-semibold text-center truncate">{item.name}</div>}
            {showMrp && (
              <div className="text-[8px] leading-tight font-bold text-center">
                {item.mrp && item.mrp > 0 ? `MRP: ₹${item.mrp}` : `Price: ₹${item.salesPrice}`}
              </div>
            )}
            {showSalePrice && item.mrp && item.mrp > 0 && (
              <div className="text-[6px] leading-tight font-semibold text-center">Sale: ₹{item.salesPrice}</div>
            )}
          </div>
          {barcodeDataUrl && (
            <img src={barcodeDataUrl} alt="Barcode Preview" className="w-[131px] h-[28px] shrink-0" style={{ objectFit: 'fill', imageRendering: 'pixelated' }} />
          )}
          {showBarcodeNumber && <div className="text-[5px] leading-none tracking-[0.05em] text-center">{item.barcode}</div>}
        </div>
      );
    }
    return (
      <div
        className="w-[160px] h-[80px] border border-[#cfd6e4] rounded-sm p-1 flex flex-row items-center gap-1 bg-white text-black shadow-[0_6px_20px_rgba(21,48,140,0.12)]"
        style={{ fontFamily: 'Arial, sans-serif' }}
      >
        {qrDataUrl && (
          <img src={qrDataUrl} alt="QR Code Preview" className="w-[56px] h-[56px] shrink-0" style={{ imageRendering: 'pixelated' }} />
        )}
        <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-px">
          {showShopName && (
            <div className="w-full text-[6px] leading-tight font-bold text-center whitespace-nowrap overflow-hidden">{companyName}</div>
          )}
          {showProductName && <div className="w-full text-[6px] leading-tight font-semibold text-center truncate">{item.name}</div>}
          {showMrp && (
            <div className="text-[8px] leading-tight font-bold text-center">
              {item.mrp && item.mrp > 0 ? `MRP: ₹${item.mrp}` : `Price: ₹${item.salesPrice}`}
            </div>
          )}
          {showSalePrice && item.mrp && item.mrp > 0 && (
            <div className="text-[6px] leading-tight font-semibold text-center">Sale: ₹{item.salesPrice}</div>
          )}
                    {barcodeDataUrl && (
            <img src={barcodeDataUrl} alt="Barcode Preview" className="w-full h-[26px] shrink-0" style={{ objectFit: 'fill', imageRendering: 'pixelated' }} />
          )}
          {showBarcodeNumber && <div className="text-[5px] leading-tight tracking-[0.05em] text-center">{item.barcode}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-[200px] h-[200px] border border-[#cfd6e4] rounded-sm p-2 flex flex-col items-center justify-around bg-white text-black shadow-[0_6px_20px_rgba(21,48,140,0.12)]"
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      <div className="w-full">
        {showShopName && (
          <div className="text-xs font-bold text-center">{companyName}</div>
        )}
        {(showAddress || showPhone) && (
          <div className="flex items-center justify-between gap-1 w-full overflow-hidden mt-0.5">
            <p className="m-0 flex-1 min-w-0 text-left whitespace-nowrap overflow-hidden text-[7px] leading-tight">
              {showAddress ? businessAddress : ''}
            </p>
            <p className="m-0 shrink-0 max-w-[70px] text-right whitespace-nowrap overflow-hidden text-[7px] leading-tight">
              {showPhone ? businessPhone : ''}
            </p>
          </div>
        )}
      </div>

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
  const fmt = useFormatNumber();
  const [itemForPreview, setItemForPreview] = useState<PrintableItem | null>(null);
  const [companyName, setCompanyName] = useState<string>('Your Company');
  const [businessAddress, setBusinessAddress] = useState<string>('');
  const [businessPhone, setBusinessPhone] = useState<string>('');
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
  const [tierPickerItem, setTierPickerItem] = useState<Item | null>(null);
  const [tierNotice, setTierNotice] = useState<string | null>(null);

  // Tutorial
  const [tutorialStep, setTutorialStep] = useState(0);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const togglesRef = useRef<HTMLDivElement | null>(null);
  const printRef = useRef<HTMLDivElement | null>(null);

  const stepRefMap: Record<number, React.RefObject<HTMLDivElement | null>> = {
    1: searchRef,
    2: listRef,
    3: previewRef,
    4: togglesRef,
    5: printRef,
  };

  const next = useCallback((n: number) => {
    setTutorialStep(n <= TOTAL_STEPS ? n : 0);
  }, []);

  const skip = useCallback(() => {
    completeTutorial(currentUser, TUTORIAL_KEY, setTutorialStep);
  }, [currentUser]);

  useTutorial(currentUser, setTutorialStep, TUTORIAL_KEY);

  // While the tutorial runs, show sample data instead of the real print list
  const isTutorialActive = tutorialStep > 0 && tutorialStep <= TOTAL_STEPS;
  const displayQueue = isTutorialActive ? SAMPLE_PRINT_QUEUE : printQueue;
  const displayPreviewItem = isTutorialActive ? SAMPLE_PRINT_QUEUE[0] : itemForPreview;

  useEffect(() => {
    if (tutorialStep === 0) return;
    const ref = stepRefMap[tutorialStep];
    if (!ref?.current) return;
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialStep]);

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
        setBusinessAddress(businessInfo.address || '');
        setBusinessPhone(businessInfo.phoneNumber || '');

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

  // Items with pricing options stay searchable, because another pack may still need adding
  const availableItemsForSearch = useMemo(() => {
    const plainIdsInQueue = new Set(printQueue.filter(q => !q.tierId).map(q => q.id));
    return allItems.filter(item => hasMultiplePricing(item) || !plainIdsInQueue.has(item.id));
  }, [allItems, printQueue]);

  const addToQueue = useCallback((item: Item, tier?: PriceTier) => {
    const realTier = tier && tier.id !== '__base__' ? tier : undefined; // '__base__' = the item itself
    if (realTier && !realTier.barcode?.trim()) {
      setTierNotice(`"${realTier.label}" has no barcode of its own. Add one in Edit item to print its label.`);
      return;
    }
    setTierNotice(null);
    setPrintQueue(prev =>
      prev.some(q => q.id === item.id && q.tierId === realTier?.id)
        ? prev
        : [...prev, buildQueueRow(item, realTier)]
    );
  }, []);

  const handleAddItemToQueue = useCallback((item: Item) => {
    if (hasMultiplePricing(item)) { setTierPickerItem(item); return; } // same as Sales
    addToQueue(item);
  }, [addToQueue]);

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

    const refresh = (q: PrintableItem): PrintableItem => {
      const fresh = byId.get(q.id);
      if (!fresh) return q;
      if (!q.tierId) return { ...fresh, quantityToPrint: q.quantityToPrint, queueId: q.queueId };
      const tier = fresh.priceTiers?.find(t => t.id === q.tierId);
      if (!tier?.barcode?.trim()) return q; // tier deleted or barcode removed: keep old row
      return { ...buildQueueRow(fresh, tier), quantityToPrint: q.quantityToPrint, queueId: q.queueId };
    };

    setPrintQueue(prev => prev.map(refresh));
    setItemForPreview(prev => (prev ? refresh(prev) : prev));
  }, [allItems]);

  // Called by ItemEditDrawer after a successful save (e.g. MRP set)
  const handleItemSaved = useCallback((updated: Partial<Item>) => {
    const id = itemToEdit?.id;
    if (!id) return;
    // Tier rows are rebuilt by the sync effect above, so merging base fields here would overwrite them
    setPrintQueue(prev => prev.map(q => q.id === id && !q.tierId ? { ...q, ...updated } : q));
    setItemForPreview(prev => prev && prev.id === id && !prev.tierId ? { ...prev, ...updated } : prev);
    setItemToEdit(null);
  }, [itemToEdit]);

  const isPrintButtonDisabled = printQueue.length === 0 || isPrinting || isTutorialActive;

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
    const isCompact = barcodeSettings.labelSize === '14x28';
    // 28 × 14 mm roll: ek row mein kitne labels. Roll ke hisaab se badlo.
    const COMPACT_COLS = 3;
    const COMPACT_GAP_MM = 2.5; // do labels ke beech ka gap
    const compactPageWidthMm = COMPACT_COLS * 28 + (COMPACT_COLS - 1) * COMPACT_GAP_MM;

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
                       JsBarcode(canvas, item.barcode, { format: 'CODE128', displayValue: false, ...getBarcodeOptions(isCompact, labelFormat, 60) });
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
          // 28 × 14 mm: QR left, text + barcode right (no address/phone)
          if (isCompact) {
            // Barcode only: text on top, wide barcode below with side spacing
            if (labelFormat === 'barcode_only') {
              allLabelsHtml += `
                <div class="label-container compact compact-single">
                  <div class="compact-text">
                    ${showShopName ? `<p class="company-name">${cName}</p>` : ''}
                    ${showProductName ? `<p class="item-name">${item.name}</p>` : ''}
                    ${showMrp ? `<p class="item-mrp">${item.mrp && item.mrp > 0 ? `MRP: ₹${item.mrp}` : `Price: ₹${item.salesPrice}`}</p>` : ''}
                    ${showSale && item.mrp && item.mrp > 0 ? `<p class="item-sale">Sale: ₹${item.salesPrice}</p>` : ''}
                  </div>
                  ${barcodeDataUrl ? `<img class="barcode-image" src="${barcodeDataUrl}" alt="Barcode" />` : ''}
                  ${showBarcodeNum ? `<p class="item-barcode">${item.barcode}</p>` : ''}
                </div>
              `;
              continue;
            }
            allLabelsHtml += `
              <div class="label-container compact">
                ${qrDataUrl ? `<img class="qr-image" src="${qrDataUrl}" alt="QR" />` : ''}
                <div class="compact-text">
                  ${showShopName ? `<p class="company-name">${cName}</p>` : ''}
                  ${showProductName ? `<p class="item-name">${item.name}</p>` : ''}
                  ${showMrp ? `<p class="item-mrp">${item.mrp && item.mrp > 0 ? `MRP: ₹${item.mrp}` : `Price: ₹${item.salesPrice}`}</p>` : ''}
                  ${showSale && item.mrp && item.mrp > 0 ? `<p class="item-sale">Sale: ₹${item.salesPrice}</p>` : ''}
                  ${barcodeDataUrl ? `<img class="barcode-image" src="${barcodeDataUrl}" alt="Barcode" />` : ''}
                  ${showBarcodeNum ? `<p class="item-barcode">${item.barcode}</p>` : ''}
                </div>
              </div>
            `;
            continue;
          }
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
                                    @page { size: ${isCompact ? `${compactPageWidthMm}mm 14mm` : '110mm 35mm'}; margin: 0; }
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

                        ${isCompact ? `
                       /* 28 × 14 mm landscape: COMPACT_COLS labels per row, QR left, text + barcode right */
            body {
              padding: 0;
              display: flex;
              flex-wrap: wrap;
              justify-content: flex-start;
              gap: 0 ${COMPACT_GAP_MM}mm;
            }
            .label-container.compact {
              width: 28mm;
              height: 14mm;
              padding: 0.5mm;
              flex-direction: row;
              align-items: center;
              justify-content: flex-start;
              gap: 0.8mm;
              flex-shrink: 0;
              break-inside: avoid;
            }
            .compact .qr-image { width: 11mm; height: 11mm; flex-shrink: 0; }
            .compact-text {
              flex: 1;
              min-width: 0;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            .compact .company-name { font-size: 4pt; white-space: nowrap; max-width: 100%; overflow: hidden; }
            .compact .item-name { font-size: 4pt; max-width: 100%; }
            .compact .item-mrp { font-size: 5pt; }
            .compact .item-sale { font-size: 3.5pt; }
                       .compact .barcode-image { width: 100%; height: 4.5mm; margin: 0.3mm 0; object-fit: fill; }
            .compact .item-barcode { font-size: 3pt; }

            /* Barcode only: text on top, 23 x 5 mm barcode below (~2.5mm free on both sides) */
            .label-container.compact.compact-single {
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              gap: 0.3mm;
            }
            .compact-single .compact-text { flex: 1 1 auto; width: 100%; }
            .compact-single p { line-height: 1.1; }
            .compact-single .barcode-image { width: 23mm; height: 5mm; margin: 0; flex-shrink: 0; object-fit: fill; }
            ` : ''}
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
  const totalLabels = displayQueue.reduce((sum, item) => sum + item.quantityToPrint, 0);

  const missingMrpItems = displayQueue.filter(i => !(i.mrp && i.mrp > 0));
  const toggleChips: { key: keyof typeof labelToggles; label: string }[] = [
    { key: 'shopName', label: 'Store name' },
    { key: 'productName', label: 'Item name' },
    { key: 'mrp', label: 'MRP' },
    { key: 'salePrice', label: 'Sale price' },
    { key: 'barcodeNumber', label: 'Barcode no.' },
  ];

  const renderContent = () => {
    if (isLoading && !isTutorialActive) {
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
          <div ref={searchRef}>
            <TutorialStep
              step={1}
              currentStep={tutorialStep}
              text="Search for an item by name and add it to the print list."
              onNext={() => next(2)}
              onSkip={skip}
              mobileArrowAlign="left"
            >
              <div className="rounded-sm border border-[#dfe6fb] bg-white p-4 flex flex-col gap-3 shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]">Format</span>
                  <span className="inline-flex items-center h-7 px-3 rounded-sm bg-[#e6eeff] text-[#155dfc] text-xs font-semibold">
                    {formatLabel[barcodeSettings.labelFormat ?? 'both']}
                  </span>
                  <span className="inline-flex items-center h-7 px-3 rounded-sm border border-[#dfe6fb] bg-[#f5f7ff] text-xs text-[#45556c]">
                    {getLabelSize(barcodeSettings.labelSize).label}
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
            </TutorialStep>
          </div>

          {/* Print list card */}
          <div ref={listRef}>
            <TutorialStep
              step={2}
              currentStep={tutorialStep}
              text="Added items appear here. Change the number of labels for each item here."
              onNext={() => next(3)}
              onSkip={skip}
            >
              <div className="rounded-sm border border-[#dfe6fb] bg-white overflow-hidden shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]">
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#dfe6fb]">
                  <h3 className={`text-base font-semibold ${displayQueue.length > 0 ? 'text-[#0f172b]' : 'text-[#5b6b86]'}`}>Print list</h3>
                  {displayQueue.length > 0 && (
                    <span className="inline-flex items-center h-6 px-2.5 rounded-sm bg-[#e6eeff] text-[#155dfc] text-xs font-semibold">
                      {displayQueue.length} item{displayQueue.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {displayQueue.length === 0 ? (
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
                      {displayQueue.map((item) => {
                        const isSelected = displayPreviewItem?.queueId === item.queueId;
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
                              <div className="text-sm font-semibold text-[#0f172b] tabular-nums">₹{fmt(getDisplayPrice(item), 0, 2)}</div>
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
                      <span>Items <b className="text-[#0f172b] tabular-nums">{displayQueue.length}</b></span>
                      <span>Labels <b className="text-[#0f172b] tabular-nums">{totalLabels}</b></span>
                    </div>
                  </>
                )}
              </div>
            </TutorialStep>
          </div>
          {tierNotice && (
            <div className="flex items-center gap-3 rounded-sm border border-[#f3d49a] bg-[#fff3dd] px-4 py-3 text-[13px] text-[#bb4d00]">
              <span className="min-w-0 flex-1">{tierNotice}</span>
              <button onClick={() => setTierNotice(null)} className="shrink-0 text-xs font-semibold">Dismiss</button>
            </div>
          )}
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
        <aside className="flex flex-col gap-3 rounded-sm border border-[#dfe6fb] bg-white p-3 min-w-0 shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] lg:sticky lg:top-4">
          <button
            onClick={() => setIsPreviewOpen(!isPreviewOpen)}
            className="w-full flex items-start justify-between gap-3 text-left"
          >
            <span className="min-w-0">
              <span className="block text-base font-semibold text-[#0f172b]">Label preview</span>
              <span className="block text-xs text-[#5b6b86] truncate">
                {displayPreviewItem
                  ? `${displayPreviewItem.name} · actual size ${getLabelSize(barcodeSettings.labelSize).label}`
                  : `Actual size ${getLabelSize(barcodeSettings.labelSize).label}`}
              </span>
            </span>
            <span className={`mt-1 text-[#5b6b86] transition-transform duration-200 ${isPreviewOpen ? "rotate-180" : "rotate-0"}`}>
              <IconChevron />
            </span>
          </button>

          {isPreviewOpen && (
            <div ref={previewRef}>
              <TutorialStep
                step={3}
                currentStep={tutorialStep}
                text="This is how the label will look at actual size. Select an item from the list to preview it."
                onNext={() => next(4)}
                onSkip={skip}
                position="top"
              >
                <div
                  className="relative grid place-items-center rounded-sm border border-[#dfe6fb] px-4 py-2"
                  style={CHECKER_BG}
                >
                  {displayPreviewItem ? (
                    <div>
                      <LabelPreview
                        item={displayPreviewItem}
                        companyName={companyName}
                        businessAddress={businessAddress}
                        businessPhone={businessPhone}
                        labelFormat={barcodeSettings.labelFormat ?? 'both'}
                        labelSize={barcodeSettings.labelSize ?? '35x35'}
                        showMrp={labelToggles.mrp}
                        showSalePrice={labelToggles.salePrice}
                        showProductName={labelToggles.productName}
                        showBarcodeNumber={labelToggles.barcodeNumber}
                        showShopName={labelToggles.shopName}
                        showAddress={barcodeSettings.showAddressOnLabel ?? true}
                        showPhone={barcodeSettings.showPhoneOnLabel ?? true}
                      />
                    </div>
                  ) : (
                    <div className="rounded-sm bg-white/90 px-3 py-2 text-xs text-[#5b6b86] text-center">
                      Select an item from the print list to preview its label.
                    </div>
                  )}
                </div>
              </TutorialStep>
            </div>
          )}

          <div ref={togglesRef}>
            <TutorialStep
              step={4}
              currentStep={tutorialStep}
              text="Choose what to show on the label (store name, item name, MRP, price) from here."
              onNext={() =>
                displayQueue.length > 0
                  ? next(5)
                  : completeTutorial(currentUser, TUTORIAL_KEY, setTutorialStep)
              }
              onSkip={skip}
              isLast={displayQueue.length === 0}
              position="top"
            >
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
            </TutorialStep>
          </div>

          <div className="flex flex-col gap-1 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-[#5b6b86]">Format</span>
              <span className="font-medium text-[#0f172b]">{formatLabel[barcodeSettings.labelFormat ?? 'both']}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#5b6b86]">
                {displayQueue.length} item{displayQueue.length !== 1 ? 's' : ''}
              </span>
              <span className="font-semibold text-[#0f172b] tabular-nums">
                {totalLabels} label{totalLabels !== 1 ? 's' : ''} to print
              </span>
            </div>
          </div>

          {displayQueue.length > 0 && (
            <div ref={printRef}>
              <TutorialStep
                step={5}
                currentStep={tutorialStep}
                text="When everything is set, print your labels from here."
                onNext={() => completeTutorial(currentUser, TUTORIAL_KEY, setTutorialStep)}
                onSkip={skip}
                isLast
                position="top"
              >
                <div className="flex flex-col gap-2 border-t border-[#dfe6fb] pt-3">
                  <CustomButton
                    onClick={handlePrint}
                    disabled={isPrintButtonDisabled}
                    variant={Variant.Filled}
                    className="w-full h-11 flex items-center justify-center gap-2 !rounded-sm !bg-[#155dfc] !text-white !text-sm !font-semibold !border-0 !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none hover:!bg-[#1447e6] disabled:!opacity-60"
                  >
                    {isPrinting ? "Generating..." : (<><IconPrinter />Print {totalLabels} label{totalLabels > 1 ? "s" : ""}</>)}
                  </CustomButton>
                </div>
              </TutorialStep>
            </div>
          )}
        </aside>
      </div>
    );
  };

  return (
    <div
      className="w-full min-h-full lg:h-full bg-[#eef2ff] pb-28 lg:pb-0 sm:rounded-sm overflow-hidden lg:overflow-y-auto"
      style={{ fontFamily: FONT_STACK }}
    >
      {/* Header: flush to the very top, full width */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#dfe6fb] bg-white px-2 h-14 sm:px-6 sm:h-auto sm:py-4">
        <div className="flex-shrink-0">
          <BackButton />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <h1 className="m-0 text-lg sm:text-xl font-semibold tracking-tight text-[#0f172b] leading-tight truncate">Print labels</h1>
          <p className="hidden sm:block m-0 text-xs text-[#5b6b86]">Barcode &amp; QR stickers for your items</p>
        </div>
      </div>

      <div className="p-3 sm:px-5 sm:pt-5 sm:pb-3">{renderContent()}</div>

      <ItemEditDrawer
        item={itemToEdit}
        isOpen={!!itemToEdit}
        onClose={() => setItemToEdit(null)}
        onSaveSuccess={handleItemSaved}
      />
      <TierPickerModal
        item={tierPickerItem}
        isOpen={!!tierPickerItem}
        onClose={() => setTierPickerItem(null)}
        onSelect={(item, tier) => addToQueue(item, tier)}
      />
    </div>
  );
};

export default QRCodeGeneratorPage;