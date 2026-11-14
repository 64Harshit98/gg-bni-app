import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../../../../lib/Firebase';
import type { SupplierPriceBook } from '../../../../constants/models';
import { SUPPLIER_PRICE_BOOK_COLLECTION, getPartyDocId } from '../../../../constants/customerSource';
import type { PriceFlagData } from '../../../../Components/PriceFlag';
import type { PurchaseItem } from '../purchase.types';
import { MANUAL_PRICE_SKIP, withoutSupplierPrice } from '../../../utils/customerPricing';
import {
    buildBookFromPurchases, comparePurchaseRate, priceBookKey, isRealProductLine, type RateComparison,
} from '../purchasePriceBook';

interface Params {
    enabled: boolean;
    companyId?: string;
    supplierName: string;
    supplierPhone: string;
    items: PurchaseItem[];
    setItems: React.Dispatch<React.SetStateAction<PurchaseItem[]>>;
    billTaxType: string;
    editingPurchaseId?: string | null;
}

/** What gets saved on each purchase line for an audit trail. */
export interface RateAudit {
    lastRate: number;
    rateChangePct: number;
    rateReviewed: boolean;
}

const money = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const shortDate = (ms: number) => ms
    ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '';

/**
 * Supplier rate-change alert on the Purchase screen.
 *
 * GROUND RULE: nothing here changes a price on its own. It loads what THIS supplier
 * charged last time and flags lines whose purchase rate differs. The user chooses:
 * "Use ₹x" (switch to the last rate) or "Keep" (accept the new rate).
 */
export const useSupplierPriceAlert = ({
    enabled, companyId, supplierName, supplierPhone, items, setItems, billTaxType, editingPurchaseId,
}: Params) => {
    const supplierId = getPartyDocId(supplierName, supplierPhone);
    const [book, setBook] = useState<SupplierPriceBook | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!enabled || !companyId || !supplierId) { setBook(null); return; }
        let cancelled = false;
        setLoading(true);
        const ref = doc(db, 'companies', companyId, SUPPLIER_PRICE_BOOK_COLLECTION, supplierId);
        (async () => {
            const snap = await getDoc(ref);
            if (snap.exists()) return snap.data() as SupplierPriceBook;

            // Lazy backfill: first time this supplier is used, build the book from their old bills.
            const field = supplierPhone.trim() ? 'partyNumber' : 'partyName';
            const value = supplierPhone.trim() || supplierName.trim();
            const res = await getDocs(query(collection(db, 'companies', companyId, 'purchases'), where(field, '==', value)));
            const built = buildBookFromPurchases(
                res.docs.map(d => ({ id: d.id, data: d.data() })),
                supplierName.trim(),
                supplierPhone.trim()
            );
            if (Object.keys(built.items).length > 0) {
                await setDoc(ref, { ...built, updatedAt: serverTimestamp() }, { merge: true });
            }
            return built;
        })()
            .then(b => { if (!cancelled) setBook(b); })
            .catch(err => { console.error('Supplier price book load failed', err); if (!cancelled) setBook(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
        // supplierName/phone only matter through supplierId for the fetch
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, companyId, supplierId]);

    /** lineId → change vs this supplier's last rate. */
    const comparisons = useMemo(() => {
        const out = new Map<string, RateComparison>();
        if (!enabled || !book) return out;
        for (const line of items) {
            if (!line.productId || !isRealProductLine(line)) continue;
            const entry = book.items?.[priceBookKey(line.productId, line.tierId)];
            const cmp = comparePurchaseRate(line, entry, billTaxType, editingPurchaseId);
            if (cmp) out.set(line.id, cmp);
        }
        return out;
    }, [enabled, book, items, billTaxType, editingPurchaseId]);

    const isReviewed = (line: PurchaseItem) =>
        line.rateReviewedFor !== undefined && Number(line.rateReviewedFor) === Number(line.purchasePrice);

    const unreviewed = useMemo(
        () => items.filter(l => comparisons.has(l.id) && !isReviewed(l)),
        [items, comparisons]
    );

    /** Switch the line to the supplier's last rate (user tapped "Use ₹x"). */
    const applyLastRate = (lineId: string) => {
        const cmp = comparisons.get(lineId);
        if (!cmp) return;
        setItems(prev => prev.map(l => {
            if (l.id !== lineId) return l;
            const base = Number(l.mrp) > 0 ? Number(l.mrp) : Number(l.originalPurchasePrice || 0);
            const d = base > 0 ? parseFloat((((base - cmp.lastRate) / base) * 100).toFixed(2)) : 0;
            return {
                ...withoutSupplierPrice(l),
                supplierPriceSkip: MANUAL_PRICE_SKIP,
                purchasePrice: cmp.lastRate,
                discount: d,
                purchasediscount: d,
                purchasediscount2: 0,
                rateReviewedFor: undefined,
            };
        }));
    };

    /** Accept the new rate (user tapped "Keep"). Typing a different price later re-opens the flag. */
    const keepRate = (lineId: string) =>
        setItems(prev => prev.map(l => (l.id === lineId ? { ...l, rateReviewedFor: Number(l.purchasePrice) } : l)));

    const keepAll = () =>
        setItems(prev => prev.map(l => (comparisons.has(l.id) ? { ...l, rateReviewedFor: Number(l.purchasePrice) } : l)));

    const decorate = (line: PurchaseItem): PriceFlagData | null => {
        const cmp = comparisons.get(line.id);
        if (!cmp) return null;
        const sign = cmp.diff > 0 ? '+' : '−';
        const change = `${sign}${money(Math.abs(cmp.diff))} (${sign}${Math.abs(cmp.diffPct)}%)`;
        const when = [shortDate(cmp.lastDate), cmp.lastInvoice].filter(Boolean).join(', ');
        const text = `Last ${money(cmp.lastRate)}${when ? ` · ${when}` : ''} → now ${change}`;
        if (isReviewed(line)) {
            return { tone: 'muted', text: `${text} · kept`, actions: [{ label: `Use ${money(cmp.lastRate)}`, onClick: () => applyLastRate(line.id) }] };
        }
        return {
            tone: cmp.direction,
            text,
            actions: [
                { label: `Use ${money(cmp.lastRate)}`, onClick: () => applyLastRate(line.id) },
                { label: 'Keep', onClick: () => keepRate(line.id), primary: true },
            ],
        };
    };

    /** Audit fields for a cart line, saved on the purchase (only for the supplier the book is for). */
    const auditFor = (line: PurchaseItem): RateAudit | null => {
        const cmp = comparisons.get(line.id);
        if (!cmp) return null;
        return { lastRate: cmp.lastRate, rateChangePct: cmp.diffPct, rateReviewed: isReviewed(line) };
    };

    return {
        supplierId,
        loading,
        hasHistory: !!book && Object.keys(book.items || {}).length > 0,
        comparisons,
        unreviewed,
        applyLastRate,
        keepRate,
        keepAll,
        decorate,
        auditFor,
    };
};
