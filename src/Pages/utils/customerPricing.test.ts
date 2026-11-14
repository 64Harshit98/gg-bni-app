import { describe, it, expect } from 'vitest';
import type { CustomerPricingRule } from '../../constants/models';
import { getCustomerPriceSuggestion, resolveCustomerDiscount } from './customerPricing';

const rule = (over: Partial<CustomerPricingRule> = {}): CustomerPricingRule => ({
    customerId: '9999999999',
    customerName: 'Ravi Traders',
    customerNumber: '9999999999',
    isActive: true,
    defaultDiscountPct: 5,
    categoryDiscounts: { snacks: 10, drinks: 12 },
    itemOverrides: { x: { name: 'X', type: 'netPrice', value: 90 }, y: { name: 'Y', type: 'percent', value: 20 } },
    ...over,
});

describe('resolveCustomerDiscount', () => {
    it('uses item override, then best category, then default', () => {
        expect(resolveCustomerDiscount(rule(), { productId: 'y', itemGroupId: 'snacks' }))
            .toEqual({ type: 'percent', value: 20, source: 'item' });
        expect(resolveCustomerDiscount(rule(), { productId: 'p', itemGroupId: 'snacks', itemGroupIds: ['drinks'] }))
            .toEqual({ type: 'percent', value: 12, source: 'category' });
        expect(resolveCustomerDiscount(rule(), { productId: 'p', itemGroupId: 'other' }))
            .toEqual({ type: 'percent', value: 5, source: 'default' });
    });

    it('ignores inactive rules and empty rules', () => {
        expect(resolveCustomerDiscount(rule({ isActive: false }), { productId: 'y' })).toBeNull();
        expect(resolveCustomerDiscount(rule({ defaultDiscountPct: 0, categoryDiscounts: {}, itemOverrides: {} }), { productId: 'p' })).toBeNull();
    });

    it('applies a fixed net price only to the base unit, not a tier pack', () => {
        expect(resolveCustomerDiscount(rule(), { productId: 'x' })?.type).toBe('netPrice');
        expect(resolveCustomerDiscount(rule(), { productId: 'x', tierId: 'box' }))
            .toEqual({ type: 'percent', value: 5, source: 'default' });
    });
});

describe('getCustomerPriceSuggestion', () => {
    it('suggests the customer price off MRP', () => {
        const s = getCustomerPriceSuggestion(
            { productId: 'p', itemGroupId: 'snacks', mrp: 100, salesPrice: 95, customPrice: 95 }, rule());
        expect(s).toEqual({ net: 90, discount: 10, pct: 10, source: 'category' });
    });

    it("uses the customer's rate even when the item's own discount is bigger", () => {
        // Item sells at 10% off (₹90); customer is set to 5% → ₹95
        expect(getCustomerPriceSuggestion(
            { productId: 'p', mrp: 100, salesPrice: 90, customPrice: 90 }, rule())).toEqual(
            { net: 95, discount: 5, pct: 5, source: 'default' });
        // Slab price ₹94 → customer's 5% (₹95) still applies
        expect(getCustomerPriceSuggestion(
            { productId: 'p', mrp: 100, salesPrice: 100, customPrice: 94 }, rule())?.net).toBe(95);
    });

    it('returns nothing when the line is already at the customer price', () => {
        expect(getCustomerPriceSuggestion(
            { productId: 'p', mrp: 100, salesPrice: 95, customPrice: 95 }, rule())).toBeNull();
    });

    it('uses sale price as base when there is no MRP', () => {
        const s = getCustomerPriceSuggestion({ productId: 'p', mrp: 0, salesPrice: 200, customPrice: 200 }, rule());
        expect(s?.net).toBe(190);
        expect(s?.discount).toBe(5);
    });

    it('takes the % off basePrice when given (purchase rate), not MRP', () => {
        // 5% default off a ₹80 purchase rate → ₹76, even though MRP is ₹100
        const s = getCustomerPriceSuggestion({ productId: 'p', mrp: 100, salesPrice: 80, basePrice: 80, customPrice: 80 }, rule());
        expect(s?.net).toBe(76);
        expect(s?.pct).toBe(5);
        // Without basePrice it is taken off MRP instead: ₹95
        expect(getCustomerPriceSuggestion({ productId: 'p', mrp: 100, salesPrice: 80, customPrice: 80 }, rule())?.net).toBe(95);
    });

    it('handles a fixed net price override', () => {
        const s = getCustomerPriceSuggestion({ productId: 'x', mrp: 120, salesPrice: 110, customPrice: 110 }, rule());
        expect(s).toEqual({ net: 90, discount: 25, pct: 25, source: 'item' });
    });

    it('never goes above MRP after rounding and never suggests for custom amounts', () => {
        const s = getCustomerPriceSuggestion(
            { productId: 'x', mrp: 89.5, salesPrice: 0, customPrice: 200 }, rule(), true, 10);
        expect(s!.net).toBeLessThanOrEqual(89.5);
        expect(getCustomerPriceSuggestion(
            { productId: 'p', mrp: 100, customPrice: 100, isCustomAmount: true }, rule())).toBeNull();
    });
});
