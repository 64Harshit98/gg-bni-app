import { describe, it, expect } from 'vitest';
import type { SupplierPriceEntry } from '../../../constants/models';
import {
    buildBookFromPurchases, comparePurchaseRate, entriesFromPurchase,
    pickNewerEntries, priceBookKey, toRateExclTax,
} from './purchasePriceBook';

const entry = (over: Partial<SupplierPriceEntry> = {}): SupplierPriceEntry => ({
    rate: 90, rateExclTax: 90, taxType: 'exclusive', taxRate: 18, mrp: 120,
    date: 1_000, invoiceNumber: 'INV-1', purchaseId: 'p1', ...over,
});

describe('comparePurchaseRate', () => {
    it('flags an increase and a decrease', () => {
        const up = comparePurchaseRate({ productId: 'a', purchasePrice: 95, taxRate: 18 }, entry(), 'exclusive');
        expect(up).toMatchObject({ lastRate: 90, diff: 5, direction: 'up', diffPct: 5.56 });
        const down = comparePurchaseRate({ productId: 'a', purchasePrice: 85, taxRate: 18 }, entry(), 'exclusive');
        expect(down).toMatchObject({ diff: -5, direction: 'down' });
    });

    it('treats the same rate in another tax mode as unchanged', () => {
        expect(comparePurchaseRate({ productId: 'a', purchasePrice: 106.2, taxRate: 18 }, entry(), 'inclusive')).toBeNull();
        const r = comparePurchaseRate({ productId: 'a', purchasePrice: 118, taxRate: 18 }, entry(), 'inclusive');
        expect(r?.lastRate).toBe(106.2);
    });

    it('returns null with no entry, a tiny change, or the bill being edited', () => {
        expect(comparePurchaseRate({ productId: 'a', purchasePrice: 95 }, undefined, 'exclusive')).toBeNull();
        expect(comparePurchaseRate({ productId: 'a', purchasePrice: 90.004 }, entry(), 'exclusive')).toBeNull();
        expect(comparePurchaseRate({ productId: 'a', purchasePrice: 95 }, entry(), 'exclusive', 'p1')).toBeNull();
    });
});

describe('price book entries', () => {
    it('keys tiers separately and skips not-in-DB lines', () => {
        const out = entriesFromPurchase([
            { productId: 'a', purchasePrice: 50, taxRate: 0 },
            { productId: 'a', tierId: 'box', purchasePrice: 480 },
            { productId: 'zz', name: '⚠️ Soap (Not in DB)', purchasePrice: 10 },
        ], { taxType: 'exclusive', date: 1, invoiceNumber: 'I', purchaseId: 'p' });
        expect(Object.keys(out).sort()).toEqual(['a', priceBookKey('a', 'box')].sort());
        expect(toRateExclTax(118, 18, 'inclusive')).toBe(100);
    });

    it('does not let a back-dated bill overwrite a newer rate', () => {
        const existing = { a: entry({ date: 2_000, purchaseId: 'new' }) };
        const older = { a: entry({ date: 1_000, purchaseId: 'old', rate: 70, rateExclTax: 70 }) };
        expect(pickNewerEntries(existing, older)).toEqual({});
        const edit = { a: entry({ date: 500, purchaseId: 'new', rate: 99, rateExclTax: 99 }) };
        expect(pickNewerEntries(existing, edit).a.rate).toBe(99);
    });

    it('builds the book from past purchases keeping the latest rate', () => {
        const book = buildBookFromPurchases([
            { id: 'p2', data: { createdAt: new Date(2000), taxType: 'exclusive', invoiceNumber: 'B', items: [{ id: 'a', purchasePrice: 95 }] } },
            { id: 'p1', data: { createdAt: new Date(1000), taxType: 'exclusive', invoiceNumber: 'A', items: [{ id: 'a', purchasePrice: 90 }] } },
        ], 'Supplier', '');
        expect(book.items.a).toMatchObject({ rate: 95, invoiceNumber: 'B' });
    });
});
