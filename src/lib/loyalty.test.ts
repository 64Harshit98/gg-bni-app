import { describe, it, expect } from 'vitest';
import {
    calcEarnPoints,
    calcMaxRedeemPoints,
    calcReturnReversal,
    getDefaultLoyaltySettings,
    normalizeLoyaltyPhone,
    planLoyaltyForSave,
    loyaltyRuleText,
    pointsToRupees,
    rupeesToPoints,
    readSaleLoyalty,
    undoSaleChanges,
    type LoyaltySettings,
} from './loyalty';

const on = (over: Partial<LoyaltySettings> = {}): LoyaltySettings => ({
    ...getDefaultLoyaltySettings(),
    enabled: true,
    ...over,
});

describe('calcEarnPoints', () => {
    it('earns nothing while loyalty is off', () => {
        expect(calcEarnPoints(5000, getDefaultLoyaltySettings())).toBe(0);
        expect(calcEarnPoints(5000, null)).toBe(0);
    });

    it('floors to whole points: 1 pt per ₹100', () => {
        expect(calcEarnPoints(1250, on())).toBe(12);
        expect(calcEarnPoints(99.99, on())).toBe(0);
        expect(calcEarnPoints(300, on())).toBe(3);
    });

    it('supports several points per step', () => {
        expect(calcEarnPoints(1250, on({ earnPoints: 5, earnPerAmount: 100 }))).toBe(62);
    });

    it('respects the minimum bill', () => {
        expect(calcEarnPoints(499, on({ minBillForEarn: 500 }))).toBe(0);
        expect(calcEarnPoints(500, on({ minBillForEarn: 500 }))).toBe(5);
    });

    it('never goes negative or divides by zero', () => {
        expect(calcEarnPoints(-100, on())).toBe(0);
        expect(calcEarnPoints(1000, on({ earnPerAmount: 0 }))).toBe(0);
    });
});

describe('calcMaxRedeemPoints', () => {
    it('is limited by the balance', () => {
        expect(calcMaxRedeemPoints(40, 1000, on())).toBe(40);
    });

    it('is limited by the max % of the bill', () => {
        expect(calcMaxRedeemPoints(500, 100, on({ maxRedeemPercent: 50 }))).toBe(50);
    });

    it('accounts for point value', () => {
        // ₹0.50 a point, bill ₹100 at 100% → up to 200 pts
        expect(calcMaxRedeemPoints(1000, 100, on({ pointValue: 0.5 }))).toBe(200);
    });

    it('is 0 below the minimum, or when redeeming is off', () => {
        expect(calcMaxRedeemPoints(40, 1000, on({ minPointsToRedeem: 50 }))).toBe(0);
        expect(calcMaxRedeemPoints(400, 1000, on({ redeemEnabled: false }))).toBe(0);
        expect(calcMaxRedeemPoints(400, 1000, getDefaultLoyaltySettings())).toBe(0);
    });
});

describe('pointsToRupees', () => {
    it('rounds to paise', () => {
        expect(pointsToRupees(3, on({ pointValue: 0.333 }))).toBe(1);
        expect(pointsToRupees(50, on())).toBe(50);
    });
});

describe('rupeesToPoints', () => {
    it('converts an amount back to whole points', () => {
        expect(rupeesToPoints(124, on())).toBe(124);
        expect(rupeesToPoints(124, on({ pointValue: 0.5 }))).toBe(248);
        expect(rupeesToPoints(180, on({ pointValue: 0.5 }))).toBe(360);
    });
    it('rounds down so it never gives more than asked', () => {
        expect(rupeesToPoints(124, on({ pointValue: 3 }))).toBe(41);
        expect(rupeesToPoints(0.3, on({ pointValue: 0.1 }))).toBe(3);
    });
    it('handles empty inputs', () => {
        expect(rupeesToPoints(0, on())).toBe(0);
        expect(rupeesToPoints(-5, on())).toBe(0);
        expect(rupeesToPoints(100, on({ pointValue: 0 }))).toBe(0);
    });
});

describe('loyaltyRuleText', () => {
    it('describes earning and redeeming', () => {
        expect(loyaltyRuleText(on())).toBe('Rs.100 = 1 pt, 1 pt = Rs.1');
        expect(loyaltyRuleText(on({ earnPoints: 5, earnPerAmount: 200, pointValue: 0.5 }))).toBe('Rs.200 = 5 pts, 1 pt = Rs.0.50');
    });
    it('leaves out redeeming when it is off', () => {
        expect(loyaltyRuleText(on({ redeemEnabled: false }))).toBe('Rs.100 = 1 pt');
    });
});

describe('calcReturnReversal', () => {
    it('takes back points pro-rata', () => {
        expect(calcReturnReversal(12, 625, 1250)).toBe(6);
    });
    it('takes back everything on a full return', () => {
        expect(calcReturnReversal(12, 1250, 1250)).toBe(12);
        expect(calcReturnReversal(12, 2000, 1250)).toBe(12);
    });
    it('handles empty inputs', () => {
        expect(calcReturnReversal(0, 500, 1000)).toBe(0);
        expect(calcReturnReversal(10, 0, 1000)).toBe(0);
        expect(calcReturnReversal(10, 100, 0)).toBe(0);
    });
});

describe('normalizeLoyaltyPhone', () => {
    it('keeps the last 10 digits', () => {
        expect(normalizeLoyaltyPhone('+91 98765-43210')).toBe('9876543210');
        expect(normalizeLoyaltyPhone('9876543210')).toBe('9876543210');
    });
    it('returns empty for a missing or short number', () => {
        expect(normalizeLoyaltyPhone('12345')).toBe('');
        expect(normalizeLoyaltyPhone(undefined)).toBe('');
        expect(normalizeLoyaltyPhone('Walk-in')).toBe('');
    });
});

describe('planLoyaltyForSave', () => {
    const A = '9876543210';
    const B = '9123456780';
    const l = (phone: string, earned: number, redeemed: number) => ({ phone, earned, redeemed, redeemValue: redeemed });
    const pts = (steps: ReturnType<typeof planLoyaltyForSave>) =>
        steps.map((s) => ({ phone: s.phone, changes: s.changes.filter((c) => c.points !== 0).map((c) => `${c.type}:${c.points}`) }));

    it('new bill: earns first, then redeems', () => {
        expect(pts(planLoyaltyForSave(null, l(A, 12, 5), { refType: 'sale' }))).toEqual([
            { phone: A, changes: ['earn:12', 'redeem:-5'] },
        ]);
    });

    it('nothing to do without a loyalty customer', () => {
        expect(planLoyaltyForSave(null, null, { refType: 'sale' })).toEqual([]);
    });

    it('edit, same customer: applies only the difference, additions first', () => {
        expect(pts(planLoyaltyForSave(l(A, 12, 5), l(A, 10, 8), { refType: 'edit' }))).toEqual([
            { phone: A, changes: ['redeem:-3', 'reverse:-2'] },
        ]);
        expect(pts(planLoyaltyForSave(l(A, 12, 5), l(A, 15, 0), { refType: 'edit' }))).toEqual([
            { phone: A, changes: ['reverse:5', 'earn:3'] },
        ]);
    });

    it('edit with no change writes nothing', () => {
        expect(planLoyaltyForSave(l(A, 12, 5), l(A, 12, 5), { refType: 'edit' })).toEqual([]);
    });

    it('edit, customer changed: undo the old one fully, apply the new one fully', () => {
        expect(pts(planLoyaltyForSave(l(A, 12, 5), l(B, 7, 0), { refType: 'edit' }))).toEqual([
            { phone: A, changes: ['reverse:5', 'reverse:-12'] },
            { phone: B, changes: ['earn:7'] },
        ]);
    });

    it('edit, customer removed: undo the old one', () => {
        expect(pts(planLoyaltyForSave(l(A, 12, 0), null, { refType: 'edit' }))).toEqual([
            { phone: A, changes: ['reverse:-12'] },
        ]);
    });

    it('carries the override details on the earn row', () => {
        const [step] = planLoyaltyForSave(null, { ...l(A, 20, 0), autoEarned: 12, overriddenBy: 'u1' }, { refType: 'sale' });
        expect(step.changes[0].extra).toEqual({ autoEarned: 12, overriddenBy: 'u1' });
    });
});

describe('readSaleLoyalty / undoSaleChanges', () => {
    it('reads a stored loyalty block', () => {
        expect(readSaleLoyalty({ loyalty: { phone: '9876543210', earned: 12, redeemed: 5, redeemValue: 5 } })).toEqual({
            phone: '9876543210',
            earned: 12,
            redeemed: 5,
            redeemValue: 5,
        });
    });
    it('returns null without a block or phone', () => {
        expect(readSaleLoyalty({})).toBeNull();
        expect(readSaleLoyalty({ loyalty: { earned: 3 } })).toBeNull();
    });
    it('undo takes back earned and gives back redeemed', () => {
        const changes = undoSaleChanges({ phone: '9876543210', earned: 12, redeemed: 5, redeemValue: 5 }, 'delete', { refId: 's1' });
        expect(changes.map((c) => c.points)).toEqual([-12, 5]);
        expect(changes.every((c) => c.type === 'reverse')).toBe(true);
    });
});
