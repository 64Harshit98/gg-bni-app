// Shared by the A4, A5 and thermal bill generators (kept separate from
// pdfGenerator.ts so the generators don't import each other at runtime).

export interface BillLoyalty {
    earned: number;
    redeemed: number;
    redeemValue?: number;
    balance?: number | null;
    /** The shop's rule in words, e.g. "Rs.100 = 1 pt, 1 pt = Rs.1". */
    rule?: string;
}

/** One line summarising loyalty points for any bill format, or '' when there's nothing to show. */
export const loyaltyBillLine = (loyalty: BillLoyalty | null | undefined): string => {
    if (!loyalty) return '';
    const parts: string[] = [];
    if (loyalty.earned > 0) parts.push(`Earned +${loyalty.earned}`);
    if (loyalty.redeemed > 0) {
        const value = Number(loyalty.redeemValue) || 0;
        parts.push(`Used ${loyalty.redeemed}${value > 0 ? ` (Rs.${value.toFixed(2)})` : ''}`);
    }
    if (typeof loyalty.balance === 'number') parts.push(`Balance ${loyalty.balance}`);
    if (!parts.length) return '';
    return `Loyalty points: ${parts.join(' | ')}${loyalty.rule ? `   (${loyalty.rule})` : ''}`;
};
