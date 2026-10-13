import type { OrderItem } from './orders.types';
import { calculateLineTax, isTaxEnabled as sharedIsTaxEnabled, type LineTax } from '../../shared/calculations/itemCalculations';

// Re-exported from the shared calc layer — this formula was verified
// identical to Sales.tsx's equivalent gate before being promoted to
// src/shared/calculations/itemCalculations.ts. See implementation.md §2.4.
export const isTaxEnabled = sharedIsTaxEnabled;

export type { LineTax };

// Per-item tax split, same signature/behavior as before. Now a thin wrapper
// around the shared shared/calculations/itemCalculations.ts formula (which
// takes lineTotal directly) — kept as unitPrice*quantity here so every
// existing call site in this Orders module needs no changes.
export const computeLineTax = (
    unitPrice: number,
    quantity: number,
    taxType: string | undefined,
    taxRate: number,
    taxEnabled: boolean
): LineTax => {
    return calculateLineTax(unitPrice * quantity, taxType, taxRate, taxEnabled);
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
