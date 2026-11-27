// UPI "Scan to pay" QR printed on every bill format (A4, A5, 2" and 3" thermal).
// The QR carries the amount, so the customer's UPI app opens with it filled in.
import QRCode from 'qrcode';

/**
 * Standard UPI deep link; any UPI app scans this. `am` only when there's an amount.
 * `am` without `mam` (minimum amount) = a fixed amount the payer can't change (NPCI UPI linking spec).
 */
export const buildUpiUri = (upiId: string, payeeName: string, amount?: number, note?: string): string => {
    const parts = [`pa=${upiId.trim()}`, `pn=${encodeURIComponent((payeeName || '').trim())}`];
    if (amount !== undefined && Number.isFinite(amount) && amount > 0) parts.push(`am=${amount.toFixed(2)}`);
    parts.push('cu=INR');
    if (note && note.trim()) parts.push(`tn=${encodeURIComponent(note.trim().slice(0, 50))}`);
    return `upi://pay?${parts.join('&')}`;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The fixed amount put in the QR: what's still unpaid on this bill.
 * 0 when the bill is fully paid — the QR then carries no amount (plain "Scan to Pay").
 * `due` is the bill's saved balance due; when a bill doesn't carry one, it's total − paid.
 */
export const qrPayAmount = (due: unknown, total?: unknown, paid?: unknown): number => {
    if (due !== undefined && due !== null && due !== '') {
        const d = Number(due);
        if (Number.isFinite(d)) return d > 0 ? round2(d) : 0;
    }
    const left = (Number(total) || 0) - (Number(paid) || 0);
    return left > 0 ? round2(left) : 0;
};

export interface BillQr {
    /** PNG data URL */
    image: string;
    amount: number;
}

/** QR image for a bill, or null when no UPI ID is set (or the QR can't be made). */
export const makeBillUpiQr = async (opts: {
    upiId?: string;
    payeeName: string;
    amount: number;
    billNumber?: string;
}): Promise<BillQr | null> => {
    const upiId = (opts.upiId || '').trim();
    if (!upiId) return null;
    const uri = buildUpiUri(upiId, opts.payeeName, opts.amount, opts.billNumber ? `Bill ${opts.billNumber}` : undefined);
    try {
        // Large enough to stay sharp when printed (the PDF scales it down)
        const image = await QRCode.toDataURL(uri, { width: 300, margin: 0, errorCorrectionLevel: 'M' });
        return { image, amount: opts.amount };
    } catch (err) {
        console.error('Failed to generate QR code', err);
        return null;
    }
};

/**
 * Label under the QR. jsPDF's built-in fonts have no ₹ sign, so "Rs".
 * `short` fits under the 18mm QR in the A4 / A5 header: "Pay Rs 450.00".
 */
export const scanToPayLabel = (amount: number, short = false): string => {
    if (!(amount > 0)) return 'Scan to Pay';
    return short ? `Pay Rs ${amount.toFixed(2)}` : `Scan to pay Rs ${amount.toFixed(2)}`;
};
