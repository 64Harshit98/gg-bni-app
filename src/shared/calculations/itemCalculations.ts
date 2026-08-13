// Whether tax should be applied at all, based on a company's sales/purchase
// settings. Promoted from src/Catalogue/Orders/orders.calculations.ts —
// verified identical to the equivalent gate in src/Pages/Master/Sales.tsx's
// live-total calculation before being promoted here. See implementation.md
// §2.4.
export const isTaxEnabled = (salesSettings: any): boolean => {
    return (
        salesSettings?.gstScheme?.toLowerCase() === 'regular' &&
        salesSettings?.taxType?.toUpperCase() !== 'NONE'
    );
};

export interface LineTax {
    taxableAmount: number; // the line's value with tax excluded
    taxAmount: number;
    finalPrice: number;    // taxableAmount + taxAmount — the line total actually charged
}

// Per-line tax split. Correctly handles 'inclusive' (the line total already
// contains tax, so the tax portion must be backed out, not added on top) and
// 'exclusive'/'regular' (tax added on top of the line total).
//
// Promoted from src/Catalogue/Orders/orders.calculations.ts's
// computeLineTax. Verified byte-for-byte identical to the equivalent
// per-line inclusive/exclusive formula in Sales.tsx's live-total useMemo —
// both modules already computed this exact math independently, confirming
// it's genuinely shared, not an assumption. Everything upstream of this
// function (discount compounding, per-line rounding, which unit price to
// pass in) stays module-specific — Orders and Sales resolve that
// differently and neither should be forced to match the other.
export const calculateLineTax = (
    lineTotal: number,
    taxType: string | undefined,
    taxRate: number,
    taxEnabled: boolean
): LineTax => {
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
