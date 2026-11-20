import { describe, it, expect } from 'vitest';
import {
    discountBaseOf,
    loadedLineDiscount,
    mrpDiscountToSale,
    presetLinePricing,
    saleDiscountToMrp,
    savedDiscountFields,
} from './sales.discountBase';

describe('presetLinePricing', () => {
    it('OFF: MRP + sale price → sale price as is, Disc1 = MRP gap, item discount ignored', () => {
        const p = presetLinePricing(100, 90, 10, false);
        expect(p.net).toBe(90);
        expect(p.discount).toBeCloseTo(10);
    });

    it('ON: item discount is taken off the sale price', () => {
        expect(presetLinePricing(100, 90, 10, true)).toEqual({ net: 81, discount: 10 });
        expect(presetLinePricing(100, 90, 0, true)).toEqual({ net: 90, discount: 0 });
    });

    it('only one price set: same in both modes', () => {
        for (const on of [false, true]) {
            expect(presetLinePricing(0, 50, 10, on)).toEqual({ net: 45, discount: 10 });
            expect(presetLinePricing(100, 0, 10, on)).toEqual({ net: 90, discount: 10 });
            expect(presetLinePricing(0, 0, 10, on)).toEqual({ net: 0, discount: 0 });
        }
    });
});

describe('discountBaseOf', () => {
    it('is MRP when OFF and the sale price when ON', () => {
        expect(discountBaseOf({ mrp: 100, salesPrice: 90 }, false)).toBe(100);
        expect(discountBaseOf({ mrp: 100, salesPrice: 90 }, true)).toBe(90);
        expect(discountBaseOf({ mrp: 100, salesPrice: 0 }, true)).toBe(100);
        expect(discountBaseOf({ mrp: 0, salesPrice: 90 }, false)).toBe(90);
    });

    it('ON: Disc1 then Disc2 → 90 → 81 → 76.95', () => {
        const base = discountBaseOf({ mrp: 100, salesPrice: 90 }, true);
        expect(base * (1 - 10 / 100) * (1 - 5 / 100)).toBeCloseTo(76.95);
    });
});

describe('MRP ↔ sale price discount', () => {
    it('converts both ways', () => {
        expect(saleDiscountToMrp(100, 90, 10)).toBe(19);
        expect(mrpDiscountToSale(100, 90, 19)).toBe(10);
        expect(mrpDiscountToSale(100, 90, 10)).toBe(0);
    });

    it('leaves the value alone when a price is missing', () => {
        expect(saleDiscountToMrp(0, 90, 10)).toBe(10);
        expect(mrpDiscountToSale(100, 0, 10)).toBe(10);
    });
});

describe('saving and reopening a bill', () => {
    it('ON: saves the saving against MRP plus the on-sale-price Disc1', () => {
        expect(savedDiscountFields({ mrp: 100, salesPrice: 90 }, 10, true))
            .toEqual({ discount: 19, discountPercentage: 19, saleDiscount: 10, discountOnSalePrice: true });
    });

    it('OFF, or no MRP: saves Disc1 as it is', () => {
        expect(savedDiscountFields({ mrp: 100, salesPrice: 90 }, 10, false)).toEqual({ discount: 10, discountPercentage: 10 });
        expect(savedDiscountFields({ mrp: 0, salesPrice: 90 }, 10, true)).toEqual({ discount: 10, discountPercentage: 10 });
    });

    it('reopens with the right Disc1 for the current mode', () => {
        const savedOn = { mrp: 100, salesPrice: 90, discount: 19, saleDiscount: 10, discountOnSalePrice: true };
        expect(loadedLineDiscount(savedOn, true)).toBe(10);
        expect(loadedLineDiscount(savedOn, false)).toBe(19);

        const savedOff = { mrp: 100, salesPrice: 90, discount: 10 };
        expect(loadedLineDiscount(savedOff, false)).toBe(10);
        expect(loadedLineDiscount(savedOff, true)).toBe(0); // price 90 = sale price, no discount on it
    });
});
