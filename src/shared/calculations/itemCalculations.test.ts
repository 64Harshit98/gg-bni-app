import { describe, it, expect } from 'vitest';
import { calculateLineTax, isTaxEnabled } from './itemCalculations';

describe('isTaxEnabled', () => {
    it('is true when gstScheme is regular (any case) and taxType is not NONE', () => {
        expect(isTaxEnabled({ gstScheme: 'Regular', taxType: 'INCLUSIVE' })).toBe(true);
        expect(isTaxEnabled({ gstScheme: 'regular', taxType: 'exclusive' })).toBe(true);
    });

    it('is false when gstScheme is not regular', () => {
        expect(isTaxEnabled({ gstScheme: 'composition', taxType: 'inclusive' })).toBe(false);
        expect(isTaxEnabled({ gstScheme: 'none', taxType: 'inclusive' })).toBe(false);
        expect(isTaxEnabled({ gstScheme: undefined, taxType: 'inclusive' })).toBe(false);
    });

    it('is false when taxType is NONE (any case), even if gstScheme is regular', () => {
        expect(isTaxEnabled({ gstScheme: 'regular', taxType: 'NONE' })).toBe(false);
        expect(isTaxEnabled({ gstScheme: 'regular', taxType: 'none' })).toBe(false);
    });

    it('is false when salesSettings is null/undefined/empty', () => {
        expect(isTaxEnabled(null)).toBe(false);
        expect(isTaxEnabled(undefined)).toBe(false);
        expect(isTaxEnabled({})).toBe(false);
    });
});

describe('calculateLineTax', () => {
    describe('inclusive tax', () => {
        it('backs the tax portion out of the line total, leaving finalPrice unchanged', () => {
            // lineTotal=1180, rate=18% inclusive => taxable=1000, tax=180
            const result = calculateLineTax(1180, 'inclusive', 18, true);
            expect(result.taxableAmount).toBeCloseTo(1000, 5);
            expect(result.taxAmount).toBeCloseTo(180, 5);
            expect(result.finalPrice).toBe(1180);
        });

        it('taxableAmount + taxAmount reconstructs the original lineTotal', () => {
            const result = calculateLineTax(2500, 'inclusive', 12, true);
            expect(result.taxableAmount + result.taxAmount).toBeCloseTo(2500, 8);
        });

        it('is case-insensitive on taxType', () => {
            const lower = calculateLineTax(1180, 'inclusive', 18, true);
            const upper = calculateLineTax(1180, 'INCLUSIVE', 18, true);
            const mixed = calculateLineTax(1180, 'Inclusive', 18, true);
            expect(upper).toEqual(lower);
            expect(mixed).toEqual(lower);
        });
    });

    describe('exclusive / regular tax', () => {
        it('adds tax on top of the line total', () => {
            // lineTotal=1000, rate=18% exclusive => taxable=1000, tax=180, final=1180
            const result = calculateLineTax(1000, 'exclusive', 18, true);
            expect(result.taxableAmount).toBe(1000);
            expect(result.taxAmount).toBeCloseTo(180, 8);
            expect(result.finalPrice).toBeCloseTo(1180, 8);
        });

        it('treats "regular" the same as "exclusive"', () => {
            const exclusive = calculateLineTax(1000, 'exclusive', 18, true);
            const regular = calculateLineTax(1000, 'regular', 18, true);
            expect(regular).toEqual(exclusive);
        });
    });

    describe('no tax applied', () => {
        it('passes the line total through unchanged when taxEnabled is false', () => {
            const result = calculateLineTax(1000, 'exclusive', 18, false);
            expect(result).toEqual({ taxableAmount: 1000, taxAmount: 0, finalPrice: 1000 });
        });

        it('passes the line total through unchanged when taxRate is 0', () => {
            const result = calculateLineTax(1000, 'exclusive', 0, true);
            expect(result).toEqual({ taxableAmount: 1000, taxAmount: 0, finalPrice: 1000 });
        });

        it('passes the line total through unchanged for an unrecognized taxType', () => {
            const result = calculateLineTax(1000, 'exempt', 18, true);
            expect(result).toEqual({ taxableAmount: 1000, taxAmount: 0, finalPrice: 1000 });
        });

        it('passes the line total through unchanged when taxType is undefined', () => {
            const result = calculateLineTax(1000, undefined, 18, true);
            expect(result).toEqual({ taxableAmount: 1000, taxAmount: 0, finalPrice: 1000 });
        });
    });

    describe('edge cases', () => {
        it('handles a zero line total', () => {
            expect(calculateLineTax(0, 'exclusive', 18, true)).toEqual({
                taxableAmount: 0,
                taxAmount: 0,
                finalPrice: 0,
            });
            expect(calculateLineTax(0, 'inclusive', 18, true)).toEqual({
                taxableAmount: 0,
                taxAmount: 0,
                finalPrice: 0,
            });
        });

        it('handles a negative tax rate the same as a zero rate (no tax applied)', () => {
            const result = calculateLineTax(1000, 'exclusive', -5, true);
            expect(result).toEqual({ taxableAmount: 1000, taxAmount: 0, finalPrice: 1000 });
        });
    });
});
