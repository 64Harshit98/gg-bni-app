// Quick-add items while billing (Sales + Purchase).
//
// The cashier types a name that isn't in the catalogue, adds it to the bill as a
// blank "NEW" line and fills its price / MRP / GST right in the cart. When the
// bill is saved, the item is created in the catalogue INSIDE the same Firestore
// transaction as the bill, so either both are saved or neither is.
//
// A NEW line carries `isNewItem: true` and a temporary productId `__new__<uuid>`.
// Firestore rejects document ids that start with "__", so if any code path ever
// forgets to swap the temp id for the real barcode, the save fails loudly
// instead of writing stock against a bogus item.

import { doc, serverTimestamp, type Firestore, type Transaction } from 'firebase/firestore';

export const NEW_ITEM_PREFIX = '__new__';

/** The cart-line fields this module reads (Sales and Purchase lines both fit). */
export interface QuickAddLineBase {
    id: string;
    productId?: string;
    isNewItem?: boolean;
    name: string;
    quantity: number;
    mrp?: unknown;
    tax?: unknown;
    taxRate?: unknown;
    customPrice?: unknown;
    salesPrice?: unknown;
    purchasePrice?: unknown;
    barcode?: string;
}

/** Details typed for a NEW item (QuickItemSheet / inline NEW strip). */
export interface QuickItemDetails {
    name: string;
    /** Net price on this bill: selling price in Sales, purchase rate in Purchase. */
    price: number;
    mrp: number;
    tax: number;
    /** The other price: purchase price in Sales, sale price in Purchase. */
    extraPrice: number;
    quantity: number;
}

/** Fields the inline NEW strip can change. `extraPrice` = purchase price (Sales) / sale price (Purchase). */
export type NewItemField = 'name' | 'mrp' | 'tax' | 'extraPrice';

export const isNewItemLine =(line: { isNewItem?: boolean } | null | undefined): boolean =>
    !!line && line.isNewItem === true;

export const newTempProductId = (): string => `${NEW_ITEM_PREFIX}${crypto.randomUUID()}`;

const num = (v: unknown): number => {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Same name ignoring case / extra spaces — used for "already exists" checks. */
export const normalizeItemName = (name: string): string =>
    (name || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** A query that looks like a scanned barcode (only digits, 6+ long). Enter must not quick-add it. */
export const looksLikeBarcode = (query: string): boolean => /^\d{6,}$/.test((query || '').trim());

/** Discount % that turns `base` into `price` (0 when either side is missing). */
export const discountFromPrice = (base: number, price: number): number => {
    if (!(base > 0) || !(price >= 0) || price >= base) return 0;
    return parseFloat((((base - price) / base) * 100).toFixed(2));
};

// ---------------------------------------------------------------------------
// Item document builders (what gets saved to companies/{cid}/items/{barcode})
// ---------------------------------------------------------------------------

export interface QuickItemDoc {
    name: string;
    mrp: number;
    salesPrice: number;
    purchasePrice: number;
    discount: number;
    purchasediscount: number;
    tax: number;
}

/**
 * Quick-add never asks for a Sale / Purchase discount, so none is saved. The
 * price typed on the bill is already the item's sale / purchase price; saving the
 * MRP gap as a discount would take it off a second time on the next bill (e.g.
 * with Sales Settings → "Apply item discount on sale price").
 */
const NO_PRESET_DISCOUNTS = { discount: 0, purchasediscount: 0 } as const;

/** Sales line → item: the price it was sold at becomes the item's sale price. */
export const itemDocFromSalesLine = (line: QuickAddLineBase): QuickItemDoc => {
    const mrp = num(line.mrp);
    const salesPrice = round2(num(line.customPrice ?? line.salesPrice));
    return {
        name: (line.name || '').trim(),
        mrp,
        salesPrice,
        purchasePrice: num(line.purchasePrice),
        ...NO_PRESET_DISCOUNTS,
        tax: num(line.tax),
    };
};

/** Purchase line → item: the rate paid becomes the item's purchase price. */
export const itemDocFromPurchaseLine = (line: QuickAddLineBase): QuickItemDoc => {
    const mrp = num(line.mrp);
    const purchasePrice = round2(num(line.customPrice ?? line.purchasePrice));
    const enteredSale = num(line.salesPrice);
    const salesPrice = enteredSale > 0 ? enteredSale : mrp;
    return {
        name: (line.name || '').trim(),
        mrp,
        salesPrice,
        purchasePrice,
        ...NO_PRESET_DISCOUNTS,
        tax: num(line.taxRate ?? line.tax), // purchase lines keep GST in taxRate
    };
};

/** Full Firestore payload for a quick-added item — same shape ItemAdd writes. */
export const buildQuickItemPayload = (data: QuickItemDoc, barcode: string, companyId: string) => ({
    ...data,
    hsnSac: '',
    description: '',
    itemGroupId: '',
    itemGroupIds: [] as string[],
    stock: 0, // the bill's own stock update (−sold / +purchased) runs right after in the same transaction
    amount: 0,
    barcode,
    restockQuantity: 0,
    moq: 1,
    unit: 'pcs',
    unitMultiplier: 1,
    packetSize: null,
    imageUrl: null,
    imageUrls: [] as string[],
    variants: [] as unknown[],
    priceTiers: [] as unknown[],
    quantitySlabs: [] as unknown[],
    addOnGroupIds: [] as string[],
    addOnPicks: [] as unknown[],
    isDeleted: false,
    companyId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
});

// ---------------------------------------------------------------------------
// Validation (run before the payment drawer opens)
// ---------------------------------------------------------------------------

/**
 * Returns an error message for the first problem found on NEW lines, or null.
 * `priceOf` reads the line's net price (sale price in Sales, rate in Purchase).
 */
export const validateNewItemLines = <T extends QuickAddLineBase>(
    lines: T[],
    catalogueNames: string[],
    priceOf: (line: T) => number,
): string | null => {
    const newLines = lines.filter(isNewItemLine);
    if (newLines.length === 0) return null;

    if (newLines.some(l => !(l.name || '').trim())) {
        return 'A new item has no name. Type its name in the NEW row.';
    }
    const noPrice = newLines.filter(l => !(priceOf(l) > 0));
    if (noPrice.length > 0) {
        return `Enter a price for new item: ${noPrice.map(l => l.name.trim()).join(', ')}`;
    }
    const existing = new Set(catalogueNames.map(normalizeItemName));
    const clash = newLines.filter(l => existing.has(normalizeItemName(l.name)));
    if (clash.length > 0) {
        return `Already in your items: ${clash.map(l => l.name.trim()).join(', ')}. Pick it from search instead.`;
    }
    const seen = new Set<string>();
    for (const l of newLines) {
        const key = normalizeItemName(l.name);
        if (seen.has(key)) return `"${l.name.trim()}" is added twice as a new item. Remove one line.`;
        seen.add(key);
    }
    return null;
};

// ---------------------------------------------------------------------------
// Barcode / id reservation inside the save transaction
// ---------------------------------------------------------------------------

/**
 * Picks `count` free barcodes starting after `lastSequence`, skipping any number
 * that is already an item id (e.g. a barcode someone typed by hand).
 * `isTaken` is a transaction read, so this must run before any transaction write.
 */
export const pickFreeBarcodes = async (
    lastSequence: number,
    count: number,
    isTaken: (barcode: string) => Promise<boolean>,
    maxAttempts = 500,
): Promise<{ barcodes: string[]; nextSequence: number }> => {
    const barcodes: string[] = [];
    let seq = lastSequence;
    let attempts = 0;
    while (barcodes.length < count) {
        if (attempts++ >= maxAttempts) throw new Error('QUICK_ADD_NO_FREE_BARCODE');
        seq += 1;
        const candidate = String(seq);
        if (!(await isTaken(candidate))) barcodes.push(candidate);
    }
    return { barcodes, nextSequence: seq };
};

export interface NewItemReservation {
    /** temp productId → real barcode (= item doc id) */
    idMap: Map<string, string>;
    nextSequence: number;
}

/** Reads only. Call at the start of the transaction, before any write. */
export const reserveNewItemIdsInTxn = async (
    txn: Transaction,
    db: Firestore,
    companyId: string,
    tempIds: string[],
): Promise<NewItemReservation> => {
    const unique = Array.from(new Set(tempIds));
    if (unique.length === 0) return { idMap: new Map(), nextSequence: 0 };

    const counterRef = doc(db, 'companies', companyId, 'counters', 'items');
    const counterSnap = await txn.get(counterRef);
    const lastSequence = counterSnap.exists() ? (Number(counterSnap.data().currentSequence) || 1000) : 1000;

    const { barcodes, nextSequence } = await pickFreeBarcodes(lastSequence, unique.length, async (barcode) => {
        const snap = await txn.get(doc(db, 'companies', companyId, 'items', barcode));
        return snap.exists();
    });

    return { idMap: new Map(unique.map((tempId, i) => [tempId, barcodes[i]])), nextSequence };
};

/** Writes the new item docs + bumps the barcode counter. Call after all transaction reads. */
export const writeNewItemsInTxn = (
    txn: Transaction,
    db: Firestore,
    companyId: string,
    docs: { barcode: string; data: QuickItemDoc }[],
    nextSequence: number,
): void => {
    if (docs.length === 0) return;
    docs.forEach(({ barcode, data }) => {
        txn.set(doc(db, 'companies', companyId, 'items', barcode), buildQuickItemPayload(data, barcode, companyId));
    });
    txn.set(doc(db, 'companies', companyId, 'counters', 'items'), { currentSequence: nextSequence }, { merge: true });
};

/**
 * Swaps temp ids for the reserved barcodes and drops the cart-only `isNewItem`
 * flag. Pure, so it's safe to re-run when Firestore retries the transaction.
 * `id` is swapped too when it equals the temp id (formatted purchase lines use
 * `id = productId`); a cart line's own random uuid id is left alone.
 */
export const remapNewItemIds = <T extends { id?: string; productId?: string; isNewItem?: boolean; barcode?: string }>(
    lines: T[],
    idMap: Map<string, string>,
): T[] =>
    lines.map((line) => {
        const temp = line.productId && idMap.has(line.productId)
            ? line.productId
            : line.id && idMap.has(line.id) ? line.id : undefined;
        if (!temp && !('isNewItem' in line)) return line;
        const rest: T = { ...line };
        delete rest.isNewItem;
        if (!temp) return rest;
        const real = idMap.get(temp)!;
        return {
            ...rest,
            productId: real,
            ...(line.id === temp ? { id: real } : {}),
            barcode: real,
        };
    });

/** temp productIds of NEW lines, in cart order (one per distinct item). */
export const newItemTempIds = (lines: { isNewItem?: boolean; productId?: string }[]): string[] =>
    Array.from(new Set(lines.filter(isNewItemLine).map(l => l.productId || '').filter(Boolean)));

/** One item doc per NEW item (first line wins if somehow repeated). */
export const newItemDocs = <T extends QuickAddLineBase>(
    lines: T[],
    idMap: Map<string, string>,
    toDoc: (line: T) => QuickItemDoc,
): { barcode: string; tempId: string; data: QuickItemDoc }[] => {
    const out: { barcode: string; tempId: string; data: QuickItemDoc }[] = [];
    const done = new Set<string>();
    lines.filter(isNewItemLine).forEach((line) => {
        const tempId = line.productId || '';
        const barcode = idMap.get(tempId);
        if (!barcode || done.has(tempId)) return;
        done.add(tempId);
        out.push({ barcode, tempId, data: toDoc(line) });
    });
    return out;
};
