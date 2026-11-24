// How the positive balance of a return / exchange is settled — shared by Sales return,
// Purchase return and catalogue Order return so all three follow one rule:
//
//   Money only goes back (credit note / debit note / cash refund) if it was actually paid.
//   The balance first lowers what is still owed on the bill; only what was paid beyond
//   the bill's new total can be paid back.
//
//   Unpaid bill      → nothing goes back, the whole balance lowers the due.
//   Part-paid bill   → the due is cleared first, the rest (if any) goes back.
//   Fully paid bill  → the whole balance goes back.

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ReturnBalanceSplit {
    /** Can go back as credit / debit note or cash refund. */
    refundable: number;
    /** Only lowers what is still owed on the bill. */
    dueReduction: number;
}

/**
 * @param balance    How much the bill went down (> 0). 0 or less → nothing to split.
 * @param paidSoFar  What has actually been paid on the bill.
 * @param newTotal   The bill's total after the return / exchange.
 */
export const splitReturnBalance = (balance: number, paidSoFar: number, newTotal: number): ReturnBalanceSplit => {
    if (!(balance > 0)) return { refundable: 0, dueReduction: 0 };
    const refundable = round2(Math.max(0, Math.min(balance, (Number(paidSoFar) || 0) - (Number(newTotal) || 0))));
    return { refundable, dueReduction: round2(balance - refundable) };
};

/** Nothing paid yet on a bill that has a value: no money can go back on a return. */
export const isBillUnpaid = (paidSoFar: number, billTotal: number): boolean =>
    (Number(paidSoFar) || 0) <= 0.01 && (Number(billTotal) || 0) > 0;
