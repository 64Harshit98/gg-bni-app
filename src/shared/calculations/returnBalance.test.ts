import { describe, it, expect } from 'vitest';
import { isBillUnpaid, splitReturnBalance } from './returnBalance';

// Bill 1000, return worth 300 → new total 700.
describe('splitReturnBalance — money goes back only if it was paid', () => {
    it('unpaid bill: nothing goes back, the due goes down by the whole balance', () => {
        expect(splitReturnBalance(300, 0, 700)).toEqual({ refundable: 0, dueReduction: 300 });
    });

    it('part-paid, still owing after the return: nothing goes back', () => {
        // paid 400, new total 700 → still owes 300
        expect(splitReturnBalance(300, 400, 700)).toEqual({ refundable: 0, dueReduction: 300 });
    });

    it('part-paid, paid more than the new total: only the overpaid part goes back', () => {
        // paid 800, new total 700 → 100 back, 200 only cleared the due
        expect(splitReturnBalance(300, 800, 700)).toEqual({ refundable: 100, dueReduction: 200 });
    });

    it('fully paid: the whole balance goes back', () => {
        expect(splitReturnBalance(300, 1000, 700)).toEqual({ refundable: 300, dueReduction: 0 });
    });

    it('no positive balance (customer / you pay more): nothing to split', () => {
        expect(splitReturnBalance(-150, 1000, 1150)).toEqual({ refundable: 0, dueReduction: 0 });
        expect(splitReturnBalance(0, 1000, 1000)).toEqual({ refundable: 0, dueReduction: 0 });
    });
});

describe('isBillUnpaid', () => {
    it('is true only when nothing was paid on a bill that has a value', () => {
        expect(isBillUnpaid(0, 500)).toBe(true);
        expect(isBillUnpaid(1, 500)).toBe(false);
        expect(isBillUnpaid(0, 0)).toBe(false);
    });
});
