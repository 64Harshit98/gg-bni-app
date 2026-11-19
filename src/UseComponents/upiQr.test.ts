import { describe, it, expect } from 'vitest';
import { buildUpiUri, qrPayAmount, scanToPayLabel } from './upiQr';

describe('buildUpiUri', () => {
    it('puts the amount and bill number in the UPI link', () => {
        expect(buildUpiUri(' shop@upi ', 'My Shop', 450, 'Bill INV-1099'))
            .toBe('upi://pay?pa=shop@upi&pn=My%20Shop&am=450.00&cu=INR&tn=Bill%20INV-1099');
    });

    it('leaves the amount out when there is none', () => {
        expect(buildUpiUri('shop@upi', 'My Shop', 0)).toBe('upi://pay?pa=shop@upi&pn=My%20Shop&cu=INR');
    });
});

describe('qrPayAmount', () => {
    it('fixes the QR to the unpaid amount', () => {
        expect(qrPayAmount(200, 450)).toBe(200);       // part paid
        expect(qrPayAmount(450, 450)).toBe(450);       // nothing paid
        expect(qrPayAmount(381.355)).toBe(381.36);
    });

    it('puts no amount on a fully paid bill', () => {
        expect(qrPayAmount(0, 450)).toBe(0);
        expect(qrPayAmount(0, 450, 450)).toBe(0);
    });

    it('works out the unpaid part when the bill has no saved due', () => {
        expect(qrPayAmount(undefined, 450, 100)).toBe(350);
        expect(qrPayAmount(undefined, 450, 450)).toBe(0);
        expect(qrPayAmount(undefined, 450)).toBe(450);
        expect(qrPayAmount(undefined, undefined)).toBe(0);
    });
});

describe('scanToPayLabel', () => {
    it('shows the amount under the QR', () => {
        expect(scanToPayLabel(450)).toBe('Scan to pay Rs 450.00');
        expect(scanToPayLabel(450, true)).toBe('Pay Rs 450.00');
        expect(scanToPayLabel(0)).toBe('Scan to Pay');
    });
});
