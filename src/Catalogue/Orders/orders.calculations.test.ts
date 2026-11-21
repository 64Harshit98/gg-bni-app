import { describe, it, expect } from 'vitest';
import { computeOrderTotals, isOrderTaxEnabled, orderLineTax } from './orders.calculations';
import { buildOrderLineItems, buildUpcomingSyncPayload, computeCartTotals, deriveTaxContext, retaxDraftOrder } from '../CheckOut/checkOut.calculations';

// MRP 1000, sold at 800, 18% GST: tax must be worked out on 800, never on 1000.
const cartLine = { id: 'a', name: 'A', category: '', mrp: 1000, salesPrice: 800, quantity: 2, image: '', note: '', tax: 18 };

describe('catalogue GST is on the selling price, not MRP', () => {
    it('checkout: exclusive adds 18% of the sale price', () => {
        const t = computeCartTotals([cartLine], 'regular', 'exclusive');
        expect(t.baseSubtotal).toBe(1600);
        expect(t.totalTaxAmount).toBeCloseTo(288);
        expect(t.totalPay).toBe(1888);
    });

    it('checkout: inclusive takes GST out of the sale price', () => {
        const t = computeCartTotals([cartLine], 'regular', 'inclusive');
        expect(t.totalPay).toBe(1600);
        expect(t.totalTaxAmount).toBeCloseTo(1600 - 1600 / 1.18);
    });

    it('saved order line, order total and tax-report line all use the sale price', () => {
        const [line] = buildOrderLineItems([cartLine], 'regular', 'exclusive', true);
        expect(line).toMatchObject({ effectiveUnitPrice: 800, taxableAmount: 1600, taxAmount: 288, finalPrice: 1888 });

        const totals = computeOrderTotals([line as any], [], 0, true);
        expect(totals.total).toBe(1888);

        const split = orderLineTax(line as any, true);
        expect(split.taxableAmount).toBe(1600);
        expect(split.taxAmount).toBeCloseTo(288);
    });

    it('a draft (Upcoming) order carries its GST like a placed order', () => {
        // Eggs: no MRP, sold at 240, 10% GST, Regular + Inclusive, 3 trays
        const eggs = { id: 'e', name: 'Eggs', category: '', mrp: 0, salesPrice: 240, quantity: 3, image: '', note: '', tax: 10 };
        const p = buildUpcomingSyncPayload([eggs], 'regular', 'inclusive');
        expect(p.totalAmount).toBe(720);
        expect(p.totalTax).toBeCloseTo(65.45, 2);
        expect(p.itemsForFirebase[0]).toMatchObject({ tax: 10, taxType: 'Inclusive', finalPrice: 720, taxAmount: 65.45 });
    });

    it('confirming an old draft without tax fields adds GST from the current item rate', () => {
        const oldDraft = { items: [{ id: 'e', docId: 'e', name: 'Eggs', quantity: 3, mrp: 0, salesPrice: 240, finalPrice: 720 }] };
        const ctx = deriveTaxContext({ minimumOrderValue: 0, gstScheme: 'regular', taxType: 'inclusive' });
        const r = retaxDraftOrder(oldDraft, ctx, () => 10);
        expect(r.totalAmount).toBe(720);
        expect(r.totalTax).toBeCloseTo(65.45, 2);
        expect(r.gstScheme).toBe('regular');
        expect(r.items[0]).toMatchObject({ itemId: 'e', tax: 10, taxType: 'Inclusive', taxableAmount: 654.55 });

        const excl = retaxDraftOrder(oldDraft, deriveTaxContext({ minimumOrderValue: 0, gstScheme: 'regular', taxType: 'exclusive' }), () => 10);
        expect(excl.totalAmount).toBe(792);
    });

    it('no GST scheme saved means None, as Catalogue Sales Settings shows it', () => {
        expect(deriveTaxContext({ minimumOrderValue: 0 }).scheme).toBe('none');
        expect(deriveTaxContext(null).applyExclusiveTax).toBe(false);
    });

    it('no GST when the order was billed without it', () => {
        expect(isOrderTaxEnabled({ gstScheme: 'composition', items: [] })).toBe(false);
        expect(orderLineTax({ effectiveUnitPrice: 800, mrp: 1000, quantity: 2, tax: 18, taxType: 'Exclusive' } as any, false).taxAmount).toBe(0);
    });
});
