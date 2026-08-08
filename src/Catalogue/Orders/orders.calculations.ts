import type { OrderItem } from './orders.types';

// Whether tax should be applied at all, based on the company's sales settings.
// (Transcribed verbatim from the 9 call sites that used to compute this inline —
// see implementation.md Stage 2 notes.)
export const isTaxEnabled = (salesSettings: any): boolean => {
    return (
        salesSettings?.gstScheme?.toLowerCase() === 'regular' &&
        salesSettings?.taxType?.toUpperCase() !== 'NONE'
    );
};

export interface LineTax {
    taxableAmount: number; // the item's value with tax excluded
    taxAmount: number;
    finalPrice: number;    // taxableAmount + taxAmount — the line total actually charged
}

// Per-item tax split. Correctly handles all three tax types, including
// 'inclusive' (where the stored unit price already contains tax and the tax
// portion must be backed out, not added on top). Modeled on the save-time
// formula in the pre-refactor Orders.tsx, which was the one occurrence of
// this formula that already got 'inclusive' right.
export const computeLineTax = (
    unitPrice: number,
    quantity: number,
    taxType: string | undefined,
    taxRate: number,
    taxEnabled: boolean
): LineTax => {
    const lineTotal = unitPrice * quantity;
    const effectiveTaxRate = taxEnabled ? taxRate : 0;
    const normalizedType = (taxType || '').toLowerCase();

    if (effectiveTaxRate > 0 && normalizedType === 'inclusive') {
        const taxableAmount = lineTotal / (1 + effectiveTaxRate / 100);
        return {
            taxableAmount,
            taxAmount: lineTotal - taxableAmount,
            finalPrice: lineTotal,
        };
    }

    if (effectiveTaxRate > 0 && (normalizedType === 'exclusive' || normalizedType === 'regular')) {
        const taxAmount = lineTotal * (effectiveTaxRate / 100);
        return {
            taxableAmount: lineTotal,
            taxAmount,
            finalPrice: lineTotal + taxAmount,
        };
    }

    return { taxableAmount: lineTotal, taxAmount: 0, finalPrice: lineTotal };
};

// Resolves the per-unit price used everywhere in Orders for a line item,
// following the same fallback chain used at every one of the original 9
// call sites: effectiveUnitPrice ?? customPrice ?? salesPrice ?? mrp ?? 0.
export const resolveUnitPrice = (item: Pick<OrderItem, 'effectiveUnitPrice' | 'customPrice' | 'salesPrice' | 'mrp'>): number => {
    return Number(item.effectiveUnitPrice ?? item.customPrice ?? item.salesPrice ?? item.mrp ?? 0);
};

export interface OrderTotals {
    itemsBase: number;   // sum of taxable (tax-excluded) item value
    tax: number;         // total tax across all items
    expenses: number;    // sum of expense amounts (untaxed, added after tax)
    discount: number;    // flat bill-level discount subtracted last
    raw: number;         // itemsBase + tax + expenses - discount, unrounded, can be negative before clamping
    total: number;        // max(0, round(raw)) — the number to display/persist
}

type MinimalItem = Pick<OrderItem, 'effectiveUnitPrice' | 'customPrice' | 'salesPrice' | 'mrp' | 'quantity' | 'taxType' | 'tax' | 'taxRate'>;
type MinimalExpense = { amount: number | string };

// The single canonical order-total formula. Replaces 9 independent
// reimplementations found in the pre-refactor Orders.tsx that disagreed on
// how 'inclusive' tax contributes to the total (some silently treated it as
// contributing zero extra tax). This version is correct for all three tax
// types, since computeLineTax() backs inclusive tax out of the line total
// rather than ignoring it.
export const computeOrderTotals = (
    items: MinimalItem[] | undefined,
    expenses: MinimalExpense[] | undefined,
    discount: number,
    taxEnabled: boolean
): OrderTotals => {
    let itemsBase = 0;
    let tax = 0;

    for (const item of items || []) {
        const unitPrice = resolveUnitPrice(item);
        const quantity = Number(item.quantity || 0);
        const taxRate = Number(item.tax ?? item.taxRate ?? 0);
        const { taxableAmount, taxAmount } = computeLineTax(unitPrice, quantity, item.taxType, taxRate, taxEnabled);
        itemsBase += taxableAmount;
        tax += taxAmount;
    }

    const expensesTotal = (expenses || []).reduce(
        (sum, e) => sum + (parseFloat(String(e.amount)) || 0),
        0
    );

    const raw = itemsBase + tax + expensesTotal - discount;
    const total = Math.round(Math.max(0, raw));

    return { itemsBase, tax, expenses: expensesTotal, discount, raw, total };
};
