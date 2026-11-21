import { describe, it, expect } from 'vitest';
import { computeOrderReturn, isOrderTaxEnabled, mapOrderItemToTransactionItem } from './ordersReturn.calculations';

const exclusiveOrder = (extra: Record<string, any> = {}) => ({
    gstScheme: 'regular',
    taxType: 'exclusive',
    manualDiscount: 0,
    expenses: [],
    items: [
        { id: 'a', itemId: 'a', name: 'A', quantity: 2, mrp: 120, salesPrice: 100, effectiveUnitPrice: 100, tax: 18, taxType: 'Exclusive' },
        { id: 'b', itemId: 'b', name: 'B', quantity: 1, mrp: 60, salesPrice: 50, effectiveUnitPrice: 50, tax: 18, taxType: 'Exclusive' },
    ],
    ...extra,
});

const rowFor = (order: any, id: string, quantity: number) => ({
    ...mapOrderItemToTransactionItem(order.items.find((i: any) => i.id === id))!,
    quantity,
});

describe('computeOrderReturn', () => {
    it('adds the GST of exclusive-tax lines to the refund and re-taxes the remaining lines', () => {
        const order = exclusiveOrder();
        const r = computeOrderReturn(order, [rowFor(order, 'a', 1)], [], 'Credit Note', []);

        expect(r.before.total).toBe(295);
        expect(r.totalReturnGross).toBe(100);
        expect(r.returnExclusiveTax).toBe(18);
        expect(r.totalReturnValue).toBe(118);
        expect(r.finalBalance).toBe(118);
        expect(r.after.total).toBe(177);
        expect(r.after.tax).toBeCloseTo(27);

        const a = r.newItems.find((i) => i.id === 'a')!;
        expect(a).toMatchObject({ quantity: 1, taxableAmount: 100, taxAmount: 18, finalPrice: 118 });
    });

    it('does not add GST again for inclusive lines', () => {
        const order = {
            gstScheme: 'regular', taxType: 'inclusive', manualDiscount: 0, expenses: [],
            items: [{ id: 'a', name: 'A', quantity: 2, mrp: 112, salesPrice: 112, effectiveUnitPrice: 112, tax: 12, taxType: 'Inclusive' }],
        };
        const r = computeOrderReturn(order, [rowFor(order, 'a', 1)], [], 'Cash Refund', []);

        expect(r.totalReturnValue).toBe(112);
        expect(r.returnExclusiveTax).toBe(0);
        expect(r.returnTax).toBe(12);
        expect(r.finalBalance).toBe(112);
        expect(r.newItems[0]).toMatchObject({ quantity: 1, taxableAmount: 100, taxAmount: 12, finalPrice: 112 });
    });

    it('takes back the bill discount in proportion, GST included, and shows the rounding', () => {
        const order = exclusiveOrder({ manualDiscount: 29.5 });
        const r = computeOrderReturn(order, [rowFor(order, 'a', 1)], [], 'Credit Note', []);

        expect(r.discountDeducted).toBe(11.8);       // 29.5 × 118 / 295
        expect(r.newManualDiscount).toBe(17.7);
        expect(r.before.total).toBe(266);             // 265.5 rounded
        expect(r.after.total).toBe(159);              // 159.3 rounded
        expect(r.finalBalance).toBe(107);
        expect(r.roundOff).toBe(0.8);                 // 118 − 11.8 = 106.2 → 107
    });

    it('takes the bill discount back on an exchange too (the save used to skip it)', () => {
        const order = exclusiveOrder({ manualDiscount: 29.5 });
        const exchange = [{ id: 'x1', originalItemId: 'x', name: 'X', mrp: 60, quantity: 1, unitPrice: 50, salesPrice: 50, amount: 50, discount: 0, basePrice: 60 }];
        const r = computeOrderReturn(order, [rowFor(order, 'a', 1)], exchange, 'Exchange', [{ id: 'x', tax: 18 }]);

        expect(r.discountDeducted).toBe(11.8);
        expect(r.totalExchangeValue).toBe(59);
        expect(r.after.itemsBase).toBe(200);           // A 100 + B 50 + X 50
        expect(r.finalBalance).toBe(r.before.total - r.after.total);
        const x = r.newItems.find((i) => i.itemId === 'x')!;
        expect(x).toMatchObject({ id: 'x1', quantity: 1, taxType: 'Exclusive', taxAmount: 9, finalPrice: 59 });
    });

    it('merges an exchanged item into its existing line when the price matches', () => {
        const order = exclusiveOrder();
        const exchange = [{ id: 'x1', originalItemId: 'b', name: 'B', mrp: 60, quantity: 1, unitPrice: 50, salesPrice: 50, amount: 50, discount: 0, basePrice: 60 }];
        const r = computeOrderReturn(order, [rowFor(order, 'a', 1)], exchange, 'Exchange', [{ id: 'b', tax: 18 }]);

        expect(r.newItems).toHaveLength(2);
        expect(r.newItems.find((i) => i.id === 'b')!.quantity).toBe(2);
        expect(r.finalBalance).toBe(59);              // 118 back − 59 new
    });

    it('ignores exchange items unless the mode is Exchange', () => {
        const order = exclusiveOrder();
        const exchange = [{ id: 'x1', originalItemId: 'x', name: 'X', mrp: 60, quantity: 1, unitPrice: 50, salesPrice: 50, amount: 50, discount: 0, basePrice: 60 }];
        const r = computeOrderReturn(order, [rowFor(order, 'a', 1)], exchange, 'Credit Note', []);
        expect(r.totalExchangeValue).toBe(0);
        expect(r.finalBalance).toBe(118);
    });

    it('charges no GST when the order was billed without tax', () => {
        const order = exclusiveOrder({ gstScheme: 'composition' });
        const r = computeOrderReturn(order, [rowFor(order, 'a', 1)], [], 'Credit Note', []);
        expect(r.totalReturnValue).toBe(100);
        expect(r.finalBalance).toBe(100);
    });
});

describe('isOrderTaxEnabled', () => {
    it('falls back to recorded tax for older orders without a GST snapshot', () => {
        expect(isOrderTaxEnabled({ items: [{ taxAmount: 18 }] })).toBe(true);
        expect(isOrderTaxEnabled({ items: [{ taxAmount: 0 }] })).toBe(false);
        expect(isOrderTaxEnabled({ gstScheme: 'regular', taxType: 'NONE', items: [] })).toBe(false);
    });
});
