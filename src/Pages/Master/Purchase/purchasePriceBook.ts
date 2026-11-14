// Supplier price book: "what did THIS supplier charge last time for this item?"
//
// Ground rule: nothing here changes a cart line. The purchase screen only flags a
// changed rate; the user decides whether to use the last rate or keep the new one.
// The book itself (companies/{cid}/supplierPriceBook/{partyDocId}) is a record of what
// was paid, written when a purchase is saved — the item master is never touched.

import type { SupplierPriceBook, SupplierPriceEntry } from '../../../constants/models';

export const priceBookKey = (productId: string, tierId?: string | null) =>
    tierId ? `${productId}__${tierId}` : productId;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Per-unit rate without tax, so bills saved inclusive and exclusive compare fairly. */
export const toRateExclTax = (rate: number, taxRate: number, taxType?: string) => {
    const r = Number(rate) || 0;
    const t = Number(taxRate) || 0;
    return round2(taxType === 'inclusive' && t > 0 ? r / (1 + t / 100) : r);
};

/** Inverse of toRateExclTax: the rate to type on a bill in the given tax mode. */
export const fromRateExclTax = (rateExclTax: number, taxRate: number, taxType?: string) => {
    const r = Number(rateExclTax) || 0;
    const t = Number(taxRate) || 0;
    return round2(taxType === 'inclusive' && t > 0 ? r * (1 + t / 100) : r);
};

export interface RateComparison {
    lastRate: number;          // last rate, converted to the current bill's tax mode
    lastDate: number;
    lastInvoice: string;
    diff: number;              // current − last (current bill's tax mode)
    diffPct: number;
    direction: 'up' | 'down';
}

export interface ComparableLine {
    productId?: string;
    tierId?: string;
    purchasePrice: number | string;
    taxRate?: number;
    tax?: number;
}

/**
 * Compares a cart line with the supplier's last entry. Null when there is no entry,
 * the entry came from the bill being edited, or the change is under ₹0.01.
 */
export const comparePurchaseRate = (
    line: ComparableLine,
    entry: SupplierPriceEntry | undefined,
    billTaxType: string,
    editingPurchaseId?: string | null
): RateComparison | null => {
    if (!entry || !line.productId) return null;
    if (editingPurchaseId && entry.purchaseId === editingPurchaseId) return null;

    const current = Number(line.purchasePrice);
    if (!Number.isFinite(current) || current <= 0) return null;

    const taxRate = Number(line.taxRate ?? line.tax ?? 0);
    const currentExcl = toRateExclTax(current, taxRate, billTaxType);
    if (Math.abs(currentExcl - entry.rateExclTax) < 0.01) return null;

    const lastRate = fromRateExclTax(entry.rateExclTax, taxRate, billTaxType);
    const diff = round2(current - lastRate);
    if (Math.abs(diff) < 0.01) return null;

    return {
        lastRate,
        lastDate: entry.date,
        lastInvoice: entry.invoiceNumber,
        diff,
        diffPct: lastRate > 0 ? round2((diff / lastRate) * 100) : 0,
        direction: diff > 0 ? 'up' : 'down',
    };
};

export interface PriceBookSourceItem {
    id?: string;
    productId?: string;
    tierId?: string;
    name?: string;
    purchasePrice?: number | string;
    taxRate?: number;
    tax?: number;
    mrp?: number;
}

/** Whether a purchase line refers to a real item (smart-scan "(Not in DB)" lines don't). */
export const isRealProductLine = (line: PriceBookSourceItem) =>
    !!(line.productId || line.id) && !String(line.name ?? '').includes('(Not in DB)');

/** Builds price-book entries from one saved/being-saved purchase. */
export const entriesFromPurchase = (
    items: PriceBookSourceItem[],
    meta: { taxType: string; date: number; invoiceNumber: string; purchaseId: string }
): Record<string, SupplierPriceEntry> => {
    const out: Record<string, SupplierPriceEntry> = {};
    for (const it of items) {
        if (!isRealProductLine(it)) continue;
        const pid = String(it.productId || it.id);
        const rate = Number(it.purchasePrice);
        if (!Number.isFinite(rate) || rate <= 0) continue;
        const taxRate = Number(it.taxRate ?? it.tax ?? 0);
        out[priceBookKey(pid, it.tierId)] = {
            rate: round2(rate),
            rateExclTax: toRateExclTax(rate, taxRate, meta.taxType),
            taxType: meta.taxType,
            taxRate,
            mrp: Number(it.mrp || 0),
            date: meta.date,
            invoiceNumber: meta.invoiceNumber,
            purchaseId: meta.purchaseId,
        };
    }
    return out;
};

/**
 * Entries from `incoming` that should be written over `existing`: only when the bill is
 * the same age or newer (a back-dated bill must not replace a newer rate), or when the
 * existing entry was written by this same purchase (editing it).
 */
export const pickNewerEntries = (
    existing: Record<string, SupplierPriceEntry> | undefined,
    incoming: Record<string, SupplierPriceEntry>
): Record<string, SupplierPriceEntry> => {
    const out: Record<string, SupplierPriceEntry> = {};
    for (const [key, entry] of Object.entries(incoming)) {
        const prev = existing?.[key];
        if (!prev || prev.purchaseId === entry.purchaseId || entry.date >= prev.date) {
            out[key] = entry;
        }
    }
    return out;
};

/** Builds a whole book from a supplier's past purchases (lazy backfill). */
export interface PurchaseDocLike {
    createdAt?: unknown;
    taxType?: string;
    invoiceNumber?: string;
    items?: PriceBookSourceItem[];
}

const toMillis = (v: unknown): number => {
    if (v instanceof Date) return v.getTime();
    if (v && typeof v === 'object') {
        const o = v as { toMillis?: () => number; seconds?: number };
        if (typeof o.toMillis === 'function') return o.toMillis();
        if (typeof o.seconds === 'number') return o.seconds * 1000;
    }
    return Number(v) || 0;
};

export const buildBookFromPurchases = (
    purchases: { id: string; data: PurchaseDocLike }[],
    supplierName: string,
    supplierNumber: string
): SupplierPriceBook => {
    let items: Record<string, SupplierPriceEntry> = {};
    for (const p of purchases) {
        const d = p.data;
        const date = toMillis(d.createdAt);
        const incoming = entriesFromPurchase(Array.isArray(d.items) ? d.items : [], {
            taxType: d.taxType || 'exclusive',
            date,
            invoiceNumber: d.invoiceNumber || '',
            purchaseId: p.id,
        });
        items = { ...items, ...pickNewerEntries(items, incoming) };
    }
    return { supplierName, supplierNumber, items };
};
