import { useMemo, useState } from 'react';
import type { Item } from '../../../../constants/models';
import { State } from '../../../../enums';
import { useSmartScanner } from '../../../hooks/SmartScanner';
import type { PurchaseItem } from '../purchase.types';
import { findTierByBarcode } from '../../../../Pages/utils/pricingUtils';
import type { PriceTier } from '../../../../constants/models';
import type { ParsedItem } from '../../../utils/DocumentParser';
import { buildItemMatcher, type ItemMatcher } from '../../../../lib/itemNameMatch';
import { loadScanAliases, lookupScanAlias } from '../../../../lib/scanAliases';
import { discountFromPrice, newTempProductId, normalizeItemName } from '../../../../lib/quickAddItems';

interface UsePurchaseSmartScanParams {
    availableItems: Item[];
    setItems: React.Dispatch<React.SetStateAction<PurchaseItem[]>>;
    // Owned by usePurchaseCart — handleBarcodeScanned re-uses the same
    // add-to-cart pricing logic rather than duplicating it, so it's threaded
    // in as a plain param instead of moving addItemToCart here.
    addItemToCart: (itemToAdd: Item, tier?: PriceTier) => void;
    setModal: (modal: { message: string; type: State } | null) => void;
    companyId?: string;
}

// Maps OCR-extracted unit text to one of the standard UNIT_OPTIONS values used in ItemAdd/ItemEditDrawer
export const normalizeUnit = (rawUnit: string | undefined | null): string => {
    if (!rawUnit) return 'pcs';
    const u = rawUnit.trim().toLowerCase();
    if (['pcs', 'pc', 'piece', 'pieces', 'nos', 'no', 'unit', 'units', 'each', 'ea'].includes(u)) return 'pcs';
    if (['box', 'boxes', 'bx'].includes(u)) return 'box';
    if (['dozen', 'doz', 'dz'].includes(u)) return 'doz';
    if (['quintal', 'quintals', 'qtl', 'qt'].includes(u)) return 'qt';
    if (['ton', 'tons', 'tonne', 'tonnes'].includes(u)) return 'ton';
    if (['pkt', 'packet', 'packets', 'pack', 'pk'].includes(u)) return 'pkt';
    return 'pcs'; // safe fallback — always a valid dropdown option
};

// The HSN column's "N/A" or "-" sometimes sticks to the end of the name
const cleanOcrName = (raw: string) =>
    (raw || '').replace(/\s+/g, ' ').trim().replace(/\s+(N\s*\/?\s*A|-)$/i, '').trim();

const round2 = (n: number) => Math.round(n * 100) / 100;

// Auto-link only when the name is clearly the same item; anything less is a suggestion.
const AUTO_LINK_SCORE = 0.84;
const AUTO_LINK_MARGIN = 0.08;
const SUGGEST_SCORE = 0.5;

/** What one bill row turns into, before it is added to the cart. */
export interface ScanResolution {
    /** Name as read from the bill (cleaned). */
    billName: string;
    /** Catalogue item it will be linked to; undefined → added as a NEW item. */
    linked?: Item;
    linkedBy?: 'learned' | 'exact' | 'fuzzy';
    /** Likely match for a NEW line (user confirms in the cart). */
    suggestion?: Item;
}

/** A bill's net rate vs the catalogue cost — a 3x gap means the name match is probably wrong. */
const priceLooksWrong = (item: Item, billNet: number) => {
    const inv = item as any;
    const cost = Number(inv.purchasePrice) > 0
        ? Number(inv.purchasePrice)
        : (Number(inv.mrp) || 0) * (1 - (Number(inv.purchasediscount) || 0) / 100);
    if (!(cost > 0) || !(billNet > 0)) return false;
    const ratio = billNet / cost;
    return ratio > 3 || ratio < 1 / 3;
};

const netRateOf = (it: ParsedItem) => round2(it.purchasePrice * (1 - (it.discountPercentage || 0) / 100));

export const resolveScannedItem = (
    ocrItem: ParsedItem,
    matcher: ItemMatcher,
    byId: Map<string, Item>,
    aliases: Record<string, string>,
): ScanResolution => {
    const billName = cleanOcrName(ocrItem.name);
    if (!billName || billName === 'Unknown Item') return { billName };

    // 1. Learned from an earlier bill ("this spelling = that item")
    const learnedId = lookupScanAlias(aliases, billName);
    const learned = learnedId ? byId.get(learnedId) : undefined;
    if (learned) return { billName, linked: learned, linkedBy: 'learned' };

    // 2. Same name (case, spaces, punctuation and word order ignored)
    const exact = matcher.exact(billName);
    if (exact) return { billName, linked: exact, linkedBy: 'exact' };

    // 3. Fuzzy — only a clear winner whose price is plausible is linked automatically
    const ranked = matcher.rank(billName, 3, 0.4);
    const [top, second] = ranked;
    if (!top) return { billName };
    const clearWinner = top.score >= AUTO_LINK_SCORE && (!second || top.score - second.score >= AUTO_LINK_MARGIN);
    if (clearWinner && !priceLooksWrong(top.item, netRateOf(ocrItem))) {
        return { billName, linked: top.item, linkedBy: 'fuzzy' };
    }
    return { billName, suggestion: top.score >= SUGGEST_SCORE ? top.item : undefined };
};

// Owns the Purchase-specific bill-scanner ("Smart Scan") subsystem: the
// useSmartScanner wiring, showScannerModal, isScannerOpen, handleApplySmartScan
// (matching bill rows against availableItems) and handleBarcodeScanned.
// No Sales equivalent — this only exists on the Purchase side.
export const usePurchaseSmartScan = ({
    availableItems,
    setItems,
    addItemToCart,
    setModal,
    companyId,
}: UsePurchaseSmartScanParams) => {
    const { fileInputRef, isScanning, scannedData, setScannedData, processFile, clearScannedData } = useSmartScanner();
    const [showScannerModal, setShowScannerModal] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    const matcher = useMemo(() => buildItemMatcher(availableItems), [availableItems]);
    const itemsById = useMemo(() => new Map(availableItems.filter(i => i.id).map(i => [i.id!, i])), [availableItems]);

    // Shown in the "Verify extracted items" dialog: which rows link and which are new
    const scanResolutions = useMemo<ScanResolution[]>(() => {
        if (!scannedData?.items?.length) return [];
        const aliases = loadScanAliases(companyId);
        return scannedData.items.map(it => resolveScannedItem(it, matcher, itemsById, aliases));
    }, [scannedData, matcher, itemsById, companyId]);

    const handleApplySmartScan = () => {
        if (!scannedData) return;
        // The scanner is strictly an item importer: invoice no / date are not touched.
        const rows = scannedData.items || [];
        let linkedCount = 0;
        let newCount = 0;

        if (rows.length > 0) {
            const now = Date.now();
            const newLines: PurchaseItem[] = [];

            rows.forEach((ocrItem, idx) => {
                const res = scanResolutions[idx] ?? { billName: cleanOcrName(ocrItem.name) };
                const quantity = ocrItem.quantity > 0 ? ocrItem.quantity : 1;
                const billNet = netRateOf(ocrItem);
                const billMrp = Number(ocrItem.mrp) || 0;

                // LINKED — the bill's net rate is the real cost; MRP comes from the catalogue
                if (res.linked) {
                    linkedCount++;
                    const dbItem = res.linked as any;
                    const mrp = Number(dbItem.mrp) || billMrp || ocrItem.purchasePrice;
                    const discount = discountFromPrice(mrp, billNet);
                    newLines.push({
                        id: crypto.randomUUID(),
                        productId: dbItem.id,
                        name: dbItem.name,
                        scannedName: res.billName,
                        unit: dbItem.unit || normalizeUnit(ocrItem.unit),
                        purchasePrice: billNet,
                        originalPurchasePrice: Number(dbItem.purchasePrice) || 0,
                        mrp,
                        barcode: dbItem.barcode || '',
                        quantity,
                        unitMultiplier: 1,
                        discount,
                        purchasediscount: discount,
                        purchasediscount2: 0,
                        taxRate: dbItem.tax ?? dbItem.taxRate ?? 0,
                        stock: dbItem.stock || dbItem.Stock || 0,
                        isEditable: true,
                        addedAt: now + idx,
                        tierQuantity: 1,
                    } as PurchaseItem);
                    return;
                }

                // NEW — same kind of line as a search-bar quick-add: name / MRP / GST / sale
                // price are edited right in the cart, and the item is created when the bill is saved.
                const name = res.billName || `Item ${idx + 1}`;
                const same = newLines.find(l => l.isNewItem && normalizeItemName(l.name) === normalizeItemName(name)
                    && Number(l.purchasePrice) === billNet);
                if (same) { same.quantity = (Number(same.quantity) || 0) + quantity; return; }

                newCount++;
                const discount = discountFromPrice(billMrp, billNet);
                newLines.push({
                    id: crypto.randomUUID(),
                    productId: newTempProductId(),
                    isNewItem: true,
                    name,
                    scannedName: res.billName,
                    scanSuggestionId: res.suggestion?.id,
                    unit: normalizeUnit(ocrItem.unit),
                    mrp: billMrp,
                    purchasePrice: billNet,
                    originalPurchasePrice: 0,
                    discount,
                    purchasediscount: discount,
                    purchasediscount2: 0,
                    salesPrice: 0,
                    barcode: '',
                    quantity,
                    unitMultiplier: 1,
                    taxRate: Number(ocrItem.taxRate) || 0,
                    stock: 0,
                    isEditable: true,
                    addedAt: now + idx,
                    tierQuantity: 1,
                } as PurchaseItem);
            });

            // Appended in bill order so the cart reads like the supplier's bill
            setItems(prev => [...prev, ...newLines]);
        }

        clearScannedData();
        setModal({
            message: newCount > 0
                ? `${linkedCount} linked, ${newCount} new. Check the NEW rows: rename, or type to link them to an existing item.`
                : 'Items linked and applied successfully!',
            type: State.SUCCESS,
        });
        setTimeout(() => setModal(null), newCount > 0 ? 3500 : 1500);
    };

    const handleBarcodeScanned = (barcode: string) => {
        setIsScannerOpen(false);

        // Tier-level barcode first (a box/combo can have its own barcode)
        const tierMatch = findTierByBarcode(availableItems, barcode);
        if (tierMatch) {
            const tierToPass = tierMatch.tier.id === '__base__' ? undefined : tierMatch.tier;
            addItemToCart(tierMatch.item, tierToPass);
            return;
        }

        const itemToAdd = availableItems.find(item => item.barcode === barcode);
        if (itemToAdd) {
            addItemToCart(itemToAdd);
        } else {
            setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
        }
    };

    return {
        fileInputRef, isScanning, scannedData, setScannedData, processFile, clearScannedData,
        scanResolutions,
        showScannerModal, setShowScannerModal,
        isScannerOpen, setIsScannerOpen,
        handleApplySmartScan,
        handleBarcodeScanned,
    };
};
