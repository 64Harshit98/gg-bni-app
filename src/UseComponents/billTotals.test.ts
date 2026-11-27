import { describe, expect, it } from 'vitest';
import { settleBillTotal, sumExpenses } from './billTotals';

describe('sumExpenses', () => {
    it('adds the saved expense rows', () => {
        expect(sumExpenses([{ amount: 50 }, { amount: '25.5' }], 999)).toBe(75.5);
    });
    it('falls back to the single extra-expense amount', () => {
        expect(sumExpenses([], 40)).toBe(40);
        expect(sumExpenses(undefined, undefined)).toBe(0);
    });
});

describe('settleBillTotal', () => {
    it('POS bill, no discount, ₹50 expense: no round-off (thermal used to print Round Off 230)', () => {
        // 1 × ₹1,000 at 18% exclusive → taxable 1000 + tax 180, saved total 1230
        const r = settleBillTotal({
            linesTotal: 1180, expensesTotal: 50, billDiscount: 0,
            savedTotal: 1230, recompute: false, discountInLinesByDefault: true,
        });
        expect(r.total).toBe(1230);
        expect(r.roundOff).toBeCloseTo(0, 2);
    });

    it('POS bill: discount already inside the scaled lines is not taken off again', () => {
        // ₹1,000 at 18% exclusive, ₹100 bill discount → scaled taxable 915.25 + tax 164.75, saved 1080
        const r = settleBillTotal({
            linesTotal: 1080, expensesTotal: 0, billDiscount: 100,
            savedTotal: 1080, recompute: false, discountInLinesByDefault: true,
        });
        expect(r.discountInLines).toBe(true);
        expect(r.total).toBe(1080);
        expect(r.roundOff).toBeCloseTo(0, 2);
    });

    it('unscaled lines (catalogue / after a return): discount is taken off once', () => {
        // two ₹500 lines at 18% exclusive left as 590 after a return, discount 68, saved total 522
        const r = settleBillTotal({
            linesTotal: 590, expensesTotal: 0, billDiscount: 68,
            savedTotal: 522, recompute: false, discountInLinesByDefault: true,
        });
        expect(r.discountInLines).toBe(false);
        expect(r.total).toBe(522);
        expect(r.roundOff).toBeCloseTo(0, 2);
    });

    it('saved total always wins over the lines for a real bill', () => {
        const r = settleBillTotal({
            linesTotal: 999.6, expensesTotal: 0, billDiscount: 0,
            savedTotal: 1000, recompute: false, discountInLinesByDefault: true,
        });
        expect(r.total).toBe(1000);
        expect(r.roundOff).toBeCloseTo(0.4, 2);
    });

    it('estimate: recomputes from the printed lines, using the taxed lines to read the discount', () => {
        // Same ₹100-discount POS bill as an estimate: lines printed without tax (915.25)
        const r = settleBillTotal({
            linesTotal: 915.25, taxedLinesTotal: 1080, expensesTotal: 0, billDiscount: 100,
            savedTotal: 1080, recompute: true, discountInLinesByDefault: true,
        });
        expect(r.discountInLines).toBe(true);
        expect(r.total).toBe(915);
    });

    it('no saved total: falls back to the default and rounds', () => {
        const r = settleBillTotal({
            linesTotal: 1180, expensesTotal: 0, billDiscount: 80,
            savedTotal: 0, recompute: false, discountInLinesByDefault: false,
        });
        expect(r.total).toBe(1100);
    });
});
