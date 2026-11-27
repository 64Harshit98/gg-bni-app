import { describe, it, expect, vi } from 'vitest';
import type { Firestore, Transaction } from 'firebase/firestore';

// doc() just records its path; serverTimestamp() is a marker.
vi.mock('firebase/firestore', () => ({
    doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
    serverTimestamp: () => '__ts__',
}));

import {
    NEW_ITEM_PREFIX,
    discountFromPrice,
    isNewItemLine,
    itemDocFromPurchaseLine,
    itemDocFromSalesLine,
    looksLikeBarcode,
    newItemDocs,
    newItemTempIds,
    newTempProductId,
    pickFreeBarcodes,
    remapNewItemIds,
    reserveNewItemIdsInTxn,
    validateNewItemLines,
    writeNewItemsInTxn,
    type QuickAddLineBase,
} from './quickAddItems';

const newLine = (over: Record<string, unknown> = {}) => ({
    id: 'line-1',
    productId: `${NEW_ITEM_PREFIX}a`,
    isNewItem: true,
    name: 'Kaju 250g',
    quantity: 2,
    ...over,
});

// Fake transaction over an in-memory doc store
const DB = {} as Firestore;

const fakeTxn = (existing: Record<string, unknown>) => {
    const writes: { path: string; data: unknown; opts?: unknown }[] = [];
    const reads: string[] = [];
    const txn = {
        get: async (ref: { path: string }) => {
            reads.push(ref.path);
            const data = existing[ref.path];
            return { exists: () => data !== undefined, data: () => data };
        },
        set: (ref: { path: string }, data: unknown, opts?: unknown) => { writes.push({ path: ref.path, data, opts }); },
    };
    return { txn: txn as unknown as Transaction, writes, reads };
};

describe('small helpers', () => {
    it('spots new lines and temp ids', () => {
        expect(isNewItemLine(newLine())).toBe(true);
        expect(isNewItemLine({ isNewItem: false })).toBe(false);
        expect(isNewItemLine(null)).toBe(false);
        expect(newTempProductId().startsWith(NEW_ITEM_PREFIX)).toBe(true);
    });

    it('treats long digit-only text as a scanned barcode', () => {
        expect(looksLikeBarcode('8901234567890')).toBe(true);
        expect(looksLikeBarcode('12345')).toBe(false);
        expect(looksLikeBarcode('Kaju 250')).toBe(false);
    });

    it('works out discount % from MRP and price', () => {
        expect(discountFromPrice(100, 90)).toBe(10);
        expect(discountFromPrice(0, 90)).toBe(0);
        expect(discountFromPrice(100, 120)).toBe(0);
        expect(discountFromPrice(300, 199)).toBe(33.67);
    });
});

describe('item docs from cart lines', () => {
    it('sales: sold price becomes the sale price, no discount is pre-saved', () => {
        const d = itemDocFromSalesLine(newLine({ name: '  Kaju 250g ', mrp: 100, customPrice: '90', purchasePrice: 70, tax: 5 }));
        expect(d).toEqual({ name: 'Kaju 250g', mrp: 100, salesPrice: 90, purchasePrice: 70, discount: 0, purchasediscount: 0, tax: 5 });
    });

    it('purchase: rate becomes the purchase price; sale price falls back to MRP; no discounts pre-saved', () => {
        const d = itemDocFromPurchaseLine(newLine({ mrp: 100, purchasePrice: 60, taxRate: 18 }));
        expect(d).toEqual({ name: 'Kaju 250g', mrp: 100, salesPrice: 100, purchasePrice: 60, discount: 0, purchasediscount: 0, tax: 18 });

        const withSale = itemDocFromPurchaseLine(newLine({ mrp: 100, purchasePrice: 60, salesPrice: 90, taxRate: 5 }));
        expect(withSale.salesPrice).toBe(90);
        expect(withSale.discount).toBe(0);
        expect(withSale.purchasediscount).toBe(0);
    });
});

describe('validateNewItemLines', () => {
    const price = (l: QuickAddLineBase) => Number(l.customPrice) || 0;

    it('passes when there are no new lines', () => {
        expect(validateNewItemLines([{ id: 'x', name: 'Pen', quantity: 1 }], [], price)).toBeNull();
    });

    it('needs a name and a price', () => {
        expect(validateNewItemLines([newLine({ name: ' ', customPrice: 10 })], [], price)).toMatch(/no name/);
        expect(validateNewItemLines([newLine({ customPrice: 0 })], [], price)).toMatch(/Enter a price/);
    });

    it('blocks names already in the catalogue (case/space-insensitive)', () => {
        expect(validateNewItemLines([newLine({ name: 'kaju  250G', customPrice: 10 })], ['Kaju 250g'], price))
            .toMatch(/Already in your items/);
    });

    it('blocks the same new name twice', () => {
        const lines = [newLine({ customPrice: 10 }), newLine({ id: 'line-2', productId: `${NEW_ITEM_PREFIX}b`, customPrice: 10 })];
        expect(validateNewItemLines(lines, [], price)).toMatch(/added twice/);
    });
});

describe('barcode reservation', () => {
    it('picks the next numbers and skips taken ones', async () => {
        const taken = new Set(['1002']);
        const r = await pickFreeBarcodes(1000, 2, async (b) => taken.has(b));
        expect(r).toEqual({ barcodes: ['1001', '1003'], nextSequence: 1003 });
    });

    it('gives up instead of looping forever', async () => {
        await expect(pickFreeBarcodes(1000, 1, async () => true, 5)).rejects.toThrow('QUICK_ADD_NO_FREE_BARCODE');
    });

    it('reserves inside the transaction from the item counter (reads only)', async () => {
        const { txn, writes, reads } = fakeTxn({
            'companies/c1/counters/items': { currentSequence: 1500 },
            'companies/c1/items/1501': { name: 'hand-typed barcode' },
        });
        const r = await reserveNewItemIdsInTxn(txn, DB, 'c1', ['__new__a', '__new__b', '__new__a']);
        expect([...r.idMap.entries()]).toEqual([['__new__a', '1502'], ['__new__b', '1503']]);
        expect(r.nextSequence).toBe(1503);
        expect(writes).toHaveLength(0);
        expect(reads[0]).toBe('companies/c1/counters/items');
    });

    it('starts at 1001 with no counter, and does nothing for no new items', async () => {
        const { txn, reads } = fakeTxn({});
        expect((await reserveNewItemIdsInTxn(txn, DB, 'c1', ['__new__a'])).idMap.get('__new__a')).toBe('1001');
        const none = fakeTxn({});
        await reserveNewItemIdsInTxn(none.txn, DB, 'c1', []);
        expect(none.reads).toHaveLength(0);
        expect(reads.length).toBeGreaterThan(0);
    });

    it('writes item docs with stock 0 and bumps the counter', () => {
        const { txn, writes } = fakeTxn({});
        writeNewItemsInTxn(txn, DB, 'c1', [{ barcode: '1001', data: itemDocFromSalesLine(newLine({ mrp: 100, customPrice: 90 })) }], 1001);
        expect(writes[0].path).toBe('companies/c1/items/1001');
        expect(writes[0].data).toMatchObject({ name: 'Kaju 250g', barcode: '1001', stock: 0, companyId: 'c1', isDeleted: false, unit: 'pcs', salesPrice: 90 });
        expect(writes[1]).toEqual({ path: 'companies/c1/counters/items', data: { currentSequence: 1001 }, opts: { merge: true } });
    });
});

describe('remapNewItemIds', () => {
    const idMap = new Map([['__new__a', '1001']]);

    it('swaps productId + barcode on cart lines, keeps the line id, drops the flag', () => {
        const [out] = remapNewItemIds([newLine()], idMap);
        expect(out).toMatchObject({ id: 'line-1', productId: '1001', barcode: '1001' });
        expect('isNewItem' in out).toBe(false);
    });

    it('swaps id too on formatted purchase lines (id = productId)', () => {
        const [out] = remapNewItemIds([{ id: '__new__a', productId: '__new__a', isNewItem: true }], idMap);
        expect(out).toMatchObject({ id: '1001', productId: '1001' });
    });

    it('leaves normal lines alone and is safe to run twice', () => {
        const normal = { id: 'l2', productId: 'abc', barcode: 'abc' };
        const once = remapNewItemIds([newLine(), normal], idMap);
        expect(once[1]).toBe(normal);
        expect(remapNewItemIds(once, idMap)).toEqual(once);
    });

    it('lists temp ids and builds one doc per new item', () => {
        const lines = [newLine({ customPrice: 90 }), { id: 'l2', productId: 'abc', name: 'Pen', quantity: 1 }];
        expect(newItemTempIds(lines)).toEqual(['__new__a']);
        const docs = newItemDocs(lines, idMap, itemDocFromSalesLine);
        expect(docs).toHaveLength(1);
        expect(docs[0]).toMatchObject({ barcode: '1001', tempId: '__new__a' });
    });
});
