import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, type DocumentData } from 'firebase/firestore';
import { db } from '../../../../lib/Firebase';
import type { SupplierPriceBook } from '../../../../constants/models';
import { SUPPLIER_PRICE_BOOK_COLLECTION, getPartyDocId } from '../../../../constants/customerSource';
import type { PriceFlagData } from '../../../../Components/PriceFlag';
import type { PurchaseItem } from '../purchase.types';
import { MANUAL_PRICE_SKIP, withoutSupplierPrice } from '../../../utils/customerPricing';
import {
    buildBookFromPurchases, comparePurchaseRate, pickNewerEntries, priceBookKey, isRealProductLine,
    type PurchaseDocLike, type RateComparison,
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
 * Last purchase rate on the Purchase screen — its own feature ("Supplier rate change
 * alert" in Purchase settings), independent of supplier-wise pricing.
 *
 * For every line it shows what THIS supplier charged last time: higher, lower or the
 * same. Nothing here changes a price on its own; on a changed rate the user picks
 * "Use ₹x" (switch to the last rate) or "Keep" (accept the new rate).
 *
 * Source: the supplier's price book (written on every purchase save). When the book is
 * missing or has no entry for an item on the bill, the supplier's past bills are read
 * once and the gaps are filled in (and saved back to the book).
 */
export const useSupplierPriceAlert = ({
    enabled, companyId, supplierName, supplierPhone, items, setItems, billTaxType, editingPurchaseId,
}: Params) => {
    const supplierId = getPartyDocId(supplierName, supplierPhone);
    const [book, setBook] = useState<SupplierPriceBook | null>(null);
    const [bookFor, setBookFor] = useState<string | null>(null);   // supplier the book was loaded for
    const [loading, setLoading] = useState(false);
    const backfilled = useRef(new Set<string>());                   // suppliers whose past bills were read
    const currentSupplier = useRef(supplierId);
    currentSupplier.current = supplierId;
    const latestBook = useRef(book);
    latestBook.current = book;

    // 1. The stored book
    useEffect(() => {
        if (!enabled || !companyId || !supplierId) { setBook(null); setBookFor(null); return; }
        let cancelled = false;
        setLoading(true);
        getDoc(doc(db, 'companies', companyId, SUPPLIER_PRICE_BOOK_COLLECTION, supplierId))
            .then(snap => {
                if (cancelled) return;
                setBook(snap.exists()
                    ? (snap.data() as SupplierPriceBook)
                    : { supplierName: supplierName.trim(), supplierNumber: supplierPhone.trim(), items: {} });
                setBookFor(supplierId);
            })
            .catch(err => {
                console.error('Supplier price book load failed', err);
                if (!cancelled) { setBook({ supplierName: supplierName.trim(), supplierNumber: supplierPhone.trim(), items: {} }); setBookFor(supplierId); }
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
        // supplierName/phone only matter through supplierId for the fetch
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, companyId, supplierId]);

    /** Keys of real lines on the bill that the book has no rate for. */
    const missingKeys = useMemo(() => {
        if (!book) return '';
        return items
            .filter(l => l.productId && isRealProductLine(l) && !book.items?.[priceBookKey(l.productId, l.tierId)])
            .map(l => priceBookKey(l.productId!, l.tierId))
            .join('|');
    }, [items, book]);

    // 2. Fill gaps from the supplier's past bills — once per supplier per screen.
    useEffect(() => {
        if (!enabled || !companyId || !supplierId || !book || bookFor !== supplierId) return;
        if (backfilled.current.has(supplierId)) return;
        if (Object.keys(book.items || {}).length > 0 && !missingKeys) return;
        backfilled.current.add(supplierId);

        const sid = supplierId;
        const name = supplierName.trim();
        const phone = supplierPhone.trim();
        const col = collection(db, 'companies', companyId, 'purchases');
        (async () => {
            const queries = [
                ...(phone ? [query(col, where('partyNumber', '==', phone))] : []),
                ...(name ? [query(col, where('partyName', '==', name))] : []),
            ];
            const snaps = await Promise.all(queries.map(q => getDocs(q)));
            const byId = new Map<string, DocumentData>();
            snaps.forEach(s => s.forEach(d => {
                const data = d.data();
                // A bill matched by name only counts if it has no number or the same one
                const num = String(data.partyNumber || '').trim();
                if (phone && num && num !== phone) return;
                byId.set(d.id, data);
            }));
            const built = buildBookFromPurchases(
                [...byId.entries()].map(([id, data]) => ({ id, data: data as PurchaseDocLike })), name, phone);
            if (currentSupplier.current !== sid || !latestBook.current) return;
            const added = pickNewerEntries(latestBook.current.items, built.items);
            if (Object.keys(added).length > 0) {
                setBook(prev => (prev ? { ...prev, items: { ...prev.items, ...added } } : prev));
                await setDoc(doc(db, 'companies', companyId, SUPPLIER_PRICE_BOOK_COLLECTION, sid),
                    { supplierName: name, supplierNumber: phone, updatedAt: serverTimestamp(), items: added }, { merge: true });
            }
        })().catch(err => console.error('Supplier price history load failed', err));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, companyId, supplierId, bookFor, book, missingKeys]);

    /** lineId → this line vs the supplier's last rate (higher / lower / same). */
    const comparisons = useMemo(() => {
        const out = new Map<string, RateComparison>();
        if (!enabled || !book || bookFor !== supplierId) return out;
        for (const line of items) {
            if (!line.productId || !isRealProductLine(line)) continue;
            const entry = book.items?.[priceBookKey(line.productId, line.tierId)];
            const cmp = comparePurchaseRate(line, entry, billTaxType, editingPurchaseId);
            if (cmp) out.set(line.id, cmp);
        }
        return out;
    }, [enabled, book, bookFor, supplierId, items, billTaxType, editingPurchaseId]);

    const isReviewed = (line: PurchaseItem) =>
        line.rateReviewedFor !== undefined && Number(line.rateReviewedFor) === Number(line.purchasePrice);

    /** Lines whose rate changed and the user hasn't accepted yet. */
    const unreviewed = useMemo(
        () => items.filter(l => {
            const c = comparisons.get(l.id);
            return !!c && c.direction !== 'same' && !isReviewed(l);
        }),
        [items, comparisons]
    );

    const counts = useMemo(() => {
        const c = { up: 0, down: 0, same: 0 };
        comparisons.forEach(v => { c[v.direction] += 1; });
        return c;
    }, [comparisons]);

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
        setItems(prev => prev.map(l => {
            const c = comparisons.get(l.id);
            return c && c.direction !== 'same' ? { ...l, rateReviewedFor: Number(l.purchasePrice) } : l;
        }));

    const decorate = (line: PurchaseItem): PriceFlagData | null => {
        const cmp = comparisons.get(line.id);
        if (!cmp) return null;
        const when = [shortDate(cmp.lastDate), cmp.lastInvoice].filter(Boolean).join(', ');
        if (cmp.direction === 'same') {
            return { tone: 'muted', text: `Same as last time · ${money(cmp.lastRate)}${when ? ` · ${when}` : ''}` };
        }
        const sign = cmp.diff > 0 ? '+' : '−';
        const change = `${sign}${money(Math.abs(cmp.diff))} (${sign}${Math.abs(cmp.diffPct)}%)`;
        const text = `${cmp.direction === 'up' ? 'Higher' : 'Lower'} than last time · was ${money(cmp.lastRate)}${when ? ` · ${when}` : ''} → ${change}`;
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
        return { lastRate: cmp.lastRate, rateChangePct: cmp.diffPct, rateReviewed: cmp.direction === 'same' || isReviewed(line) };
    };

    return {
        supplierId,
        loading,
        hasHistory: !!book && Object.keys(book.items || {}).length > 0,
        comparisons,
        counts,
        unreviewed,
        applyLastRate,
        keepRate,
        keepAll,
        decorate,
        auditFor,
    };
};
