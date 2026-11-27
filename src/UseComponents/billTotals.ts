// How a printed bill's line amounts, bill discount, expenses and round-off add
// up to the total on the bill. Used by the thermal and A5 receipts.
//
// Bills reach the printers in two shapes:
//  - POS Sales spreads the bill discount into every line's taxableAmount /
//    taxAmount before saving, so lines + expenses already equal the total.
//  - Lines that were not scaled (catalogue orders, lines rebuilt by a sales
//    return, older or purchase records) still need the discount taken off once.
// The saved total tells the two apart: whichever reading lands closer to it is
// the one the bill was saved with. Nothing here changes a saved total; it only
// decides what the printed breakdown and round-off line show.

export interface BillTotalInput {
    /** Sum of the line amounts as printed. */
    linesTotal: number;
    /** The same lines with tax kept, used only to compare with savedTotal. Defaults to linesTotal. */
    taxedLinesTotal?: number;
    expensesTotal: number;
    billDiscount: number;
    /** The bill's saved total; 0 when not known. */
    savedTotal: number;
    /** Print a total recomputed from the lines (estimates) instead of the saved one. */
    recompute: boolean;
    /** What to assume about the discount when the saved total can't tell. */
    discountInLinesByDefault: boolean;
}

export interface BillTotal {
    total: number;
    roundOff: number;
    /** True when the bill discount is already inside the line amounts. */
    discountInLines: boolean;
}

/** Expense rows saved on the bill, or the single legacy extra-expense amount. */
export const sumExpenses = (
    expenses: { amount: number | string }[] | undefined | null,
    extraExpenseAmount?: number | string
): number => {
    if (expenses && expenses.length > 0) {
        return expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    }
    return Number(extraExpenseAmount) || 0;
};

export const settleBillTotal = (input: BillTotalInput): BillTotal => {
    const discount = Math.max(0, Number(input.billDiscount) || 0);
    const savedTotal = Number(input.savedTotal) || 0;
    const taxedLines = input.taxedLinesTotal ?? input.linesTotal;

    let discountInLines = input.discountInLinesByDefault;
    if (discount > 0 && savedTotal > 0) {
        const gapIfInside = Math.abs(savedTotal - (taxedLines + input.expensesTotal));
        const gapIfSeparate = Math.abs(savedTotal - (taxedLines - discount + input.expensesTotal));
        discountInLines = gapIfInside <= gapIfSeparate;
    }

    const beforeRounding = input.linesTotal + input.expensesTotal - (discountInLines ? 0 : discount);
    const total = input.recompute || savedTotal <= 0 ? Math.round(beforeRounding) : savedTotal;
    return { total, roundOff: total - beforeRounding, discountInLines };
};
