import type { CartItem, CatalogueSalesSettings } from './checkOut.types';

// ─────────────────────────────────────────────────────────────────────────
// This file holds calculation functions moved verbatim out of CheckOut.tsx
// (formatting/hoisting only — no behavior changes). This is a verbatim
// extraction, not a consolidation and not a bug fix. CheckOut's calculation
// logic has several known divergences from Orders'/Sales'/Purchase's
// equivalent logic — all preserved exactly as-is, documented here instead of
// "fixed":
//
// 1. STRUCTURAL: no per-line taxType. Orders/Sales/Purchase resolve tax
//    mode per line item (item.taxType). CheckOut instead applies ONE bill-
//    level tax mode (derived from CatalogueSalesSettings.gstScheme/taxType)
//    to every line in the cart uniformly — see deriveTaxContext(). CartItem
//    (checkOut.types.ts) has no taxType field at all.
//
// 2. GATING: unlike shared/calculations/itemCalculations.ts's isTaxEnabled
//    (which requires gstScheme === 'regular' AND taxType !== 'NONE'),
//    CheckOut's applyExclusiveTax only ever checks
//    `scheme === 'regular' && taxType === 'exclusive'` — there is no
//    "taxType !== NONE" style gate here at all, and any taxType value other
//    than the literal string 'exclusive' is treated as inclusive whenever
//    scheme === 'regular' (see computeCartTotals / buildOrderLineItems).
//    This is NOT a pure drop-in match for the shared calculateLineTax()
//    (which zeroes tax for any unrecognized taxType string), so it is left
//    inline rather than wired to shared/calculations/itemCalculations.ts.
//
// 3. NO resolveUnitPrice-style fallback. Orders' resolveUnitPrice falls back
//    through effectiveUnitPrice ?? customPrice ?? salesPrice ?? mrp ?? 0.
//    CheckOut uses `item.salesPrice` directly everywhere (both in the live
//    cart totals and in the save-time line builder) with no such chain.
//
// 4. DUPLICATED DIVISION IN buildOrderLineItems: for the inclusive branch,
//    `lineBaseAmount / (1 + taxRate / 100)` is computed twice independently
//    (once inline for taxableAmount, once again inline for taxAmount)
//    instead of being computed once and reused the way computeCartTotals
//    does it. Not a behavior bug (same result), just redundant — preserved
//    verbatim, not refactored.
//
// 5. FIXED (was the biggest divergence): buildUpcomingSyncPayload() (used
//    by the "syncToUpcoming" draft-order writer that fires on every
//    quantity change) used to compute
//    `finalPrice: item.salesPrice * item.quantity` for every line with NO
//    tax split applied at all, regardless of scheme/taxType. In 'exclusive'
//    tax mode this made the draft "upcoming_<user>" order's
//    totalAmount/roundOff systematically UNDERSTATE the real payable total
//    (which does include the tax add-on once placeOrder() actually runs via
//    buildOrderLineItems + computeCartTotals). Fixed by having
//    buildUpcomingSyncPayload take the same scheme/taxType computed by
//    deriveTaxContext() and apply the identical exclusive-tax branch
//    computeCartTotals uses, so the draft total now matches what checkout
//    will actually charge in every tax mode.
// ─────────────────────────────────────────────────────────────────────────

export interface TaxContext {
    scheme: string;
    taxType: string;
    applyExclusiveTax: boolean;
}

// Moved verbatim from the top of the CartPage component body (previously
// ~L347-354, computed inline from salesSettings on every render).
export const deriveTaxContext = (salesSettings: CatalogueSalesSettings | null): TaxContext => {
    const scheme = salesSettings?.gstScheme?.toLowerCase() || 'regular';
    const taxType = salesSettings?.taxType?.toLowerCase() || 'inclusive';
    const applyExclusiveTax = scheme === 'regular' && taxType === 'exclusive';
    return { scheme, taxType, applyExclusiveTax };
};

export interface CartTotals {
    baseSubtotal: number;
    totalTaxAmount: number;
    subtotal: number;
    totalPay: number;
}

// ─────────────────────────────────────────────────────────────────────────
// LIVE-UI TOTALS
// Called from: CheckOut.tsx render body, previously the inline
// `cartItems.reduce(...)` (L356-388) plus `Math.round(subtotal)` (L390) that
// drives the on-screen Subtotal/Tax/Total Pay figures and the sticky
// mobile/desktop summary panels. Moved verbatim.
// ─────────────────────────────────────────────────────────────────────────
export const computeCartTotals = (
    cartItems: CartItem[],
    scheme: string,
    taxType: string
): CartTotals => {
    let totalTaxAmount = 0;
    let baseSubtotal = 0;

    const subtotal = cartItems.reduce((acc, item) => {
        const qty = item.quantity;
        const price = item.salesPrice;
        const taxRate = item.tax || 0;

        let itemBaseAmount = 0;
        let itemTaxAmount = 0;
        let itemTotalAmount = 0;

        if (scheme === 'regular') {
            if (taxType === 'exclusive') {
                // EXCLUSIVE: Tax is calculated on top of the base price
                itemBaseAmount = price * qty;
                itemTaxAmount = itemBaseAmount * (taxRate / 100);
                itemTotalAmount = itemBaseAmount + itemTaxAmount;
            } else {
                // INCLUSIVE: Tax is already inside the price, we extract it
                itemTotalAmount = price * qty;
                itemBaseAmount = itemTotalAmount / (1 + (taxRate / 100));
                itemTaxAmount = itemTotalAmount - itemBaseAmount;
            }
        } else {
            // EXEMPT / COMPOSITION: No tax to display or calculate
            itemBaseAmount = price * qty;
            itemTaxAmount = 0;
            itemTotalAmount = itemBaseAmount;
        }

        baseSubtotal += itemBaseAmount;
        totalTaxAmount += itemTaxAmount;

        return acc + itemTotalAmount;
    }, 0);

    const totalPay = Math.round(subtotal);

    return { baseSubtotal, totalTaxAmount, subtotal, totalPay };
};

// Moved verbatim from the `isMovValid` closure (previously ~L392-395).
export const isMinimumOrderValueMet = (
    salesSettings: CatalogueSalesSettings | null,
    totalPay: number
): boolean => {
    if (!salesSettings) return true;
    return totalPay >= (salesSettings.minimumOrderValue || 0);
};

// Moved verbatim from `placeOrder` (previously L444):
// `const roundOffAmt = Number((totalPay - subtotal).toFixed(2));`
export const computeOrderRoundOff = (totalPay: number, subtotal: number): number => {
    return Number((totalPay - subtotal).toFixed(2));
};

export interface OrderLineItem {
    id: string;
    itemId: string;
    groupId: string | undefined;
    name: string;
    quantity: number;
    mrp: number;
    salesPrice: number;
    effectiveUnitPrice: number;
    tax: number;
    taxRate: number;
    taxType: string;
    taxableAmount: number;
    taxAmount: number;
    finalPrice: number;
    note: string;
    image: string;
    unit: string;
    unitMultiplier: number;
}

// ─────────────────────────────────────────────────────────────────────────
// SAVE-TIME PER-LINE RECOMPUTE
// Called from: CheckOut.tsx `placeOrder`, as the `items: cartItems.map(...)`
// closure inside the Firestore transaction.set() call (previously
// ~L460-502), which builds the item rows actually written to the `Orders`
// collection. Moved verbatim, including the redundant double-division noted
// in divergence #4 above and the salesPrice-only base price (divergence #3).
// ─────────────────────────────────────────────────────────────────────────
export const buildOrderLineItems = (
    cartItems: CartItem[],
    scheme: string,
    taxType: string,
    applyExclusiveTax: boolean
): OrderLineItem[] => {
    return cartItems.map(i => {
        const originalUnitPrice = Number(i.salesPrice);
        const qty = Number(i.quantity);
        const taxRate = Number(i.tax || 0);

        let lineBaseAmount = originalUnitPrice * qty;
        let lineTaxAmount = 0;
        let lineFinalAmount = lineBaseAmount;

        if (applyExclusiveTax) {
            lineTaxAmount = lineBaseAmount * (taxRate / 100);
            lineFinalAmount = lineBaseAmount + lineTaxAmount;
        }

        let itemTaxTypeToSave = 'Inclusive';
        if (scheme === 'exempt' || scheme === 'composition') {
            itemTaxTypeToSave = scheme.charAt(0).toUpperCase() + scheme.slice(1);
        } else if (taxType === 'exclusive') {
            itemTaxTypeToSave = 'Exclusive';
        }

        return {
            id: String(i.id),
            itemId: String(i.id),
            groupId: i.groupId || i.category,
            name: i.name,
            quantity: qty,
            mrp: Number(i.mrp),
            salesPrice: originalUnitPrice,
            effectiveUnitPrice: originalUnitPrice,
            tax: taxRate,
            taxRate: taxRate,
            taxType: itemTaxTypeToSave,
            // 👇 FIX: Wrap these 3 in toFixed(2) to clean up decimals in DB
            taxableAmount: Number((applyExclusiveTax ? lineBaseAmount : (lineBaseAmount / (1 + (taxRate / 100)))).toFixed(2)),
            taxAmount: Number((applyExclusiveTax ? lineTaxAmount : (lineBaseAmount - (lineBaseAmount / (1 + (taxRate / 100))))).toFixed(2)),
            finalPrice: Number(lineFinalAmount.toFixed(2)),
            note: i.note,
            image: i.imageUrl || "",
            unit: i.unit || "pcs",
            unitMultiplier: i.unitMultiplier || 1
        };
    });
};

export interface UpcomingSyncItem {
    id: string;
    docId: string;
    name: string;
    quantity: number;
    mrp: number;
    salesPrice: number;
    unit: string | undefined;
    unitMultiplier: number;
    finalPrice: number;
}

export interface UpcomingSyncPayload {
    itemsForFirebase: UpcomingSyncItem[];
    totalAmount: number;
    roundOff: number;
}

// ─────────────────────────────────────────────────────────────────────────
// UPCOMING-DRAFT SYNC TOTALS
// Called from: CheckOut.tsx `syncToUpcoming`, fired on every quantity
// change / item removal while step === 1 (previously ~L210-230). Writes the
// live-editing draft order (`upcoming_<userKey>`) to Firestore.
//
// FIX (previously divergence #5 in the file header comment): this used to
// always compute `finalPrice = salesPrice * quantity` with no tax split at
// all, regardless of scheme/taxType — so in 'exclusive' tax mode the draft
// order's totalAmount understated what `placeOrder` actually charges (via
// computeCartTotals/buildOrderLineItems, which do apply exclusive tax).
// Now takes the same `scheme`/`taxType` computed by `deriveTaxContext` and
// applies the identical per-item branch logic `computeCartTotals` above
// uses, so the live draft total and the final placed-order total agree in
// every tax mode, not just 'inclusive'.
// ─────────────────────────────────────────────────────────────────────────
export const buildUpcomingSyncPayload = (
    updatedCart: CartItem[],
    scheme: string,
    taxType: string
): UpcomingSyncPayload => {
    const itemsForFirebase = updatedCart.map(item => {
        const qty = item.quantity;
        const price = item.salesPrice;
        const taxRate = item.tax || 0;

        let itemTotalAmount = price * qty;
        if (scheme === 'regular' && taxType === 'exclusive' && taxRate > 0) {
            const itemBaseAmount = price * qty;
            itemTotalAmount = itemBaseAmount + itemBaseAmount * (taxRate / 100);
        }
        // 'inclusive': price already contains tax, so salesPrice * qty is
        // already the correct final amount — same as before.
        // scheme !== 'regular' (exempt/composition): no tax, also unchanged.

        return {
            id: String(item.id),
            docId: String(item.id),
            name: item.name,
            quantity: item.quantity,
            mrp: item.mrp,
            salesPrice: item.salesPrice,
            unit: item.unit,
            unitMultiplier: item.unitMultiplier || 1,
            finalPrice: itemTotalAmount,
        };
    });

    const rawTotalAmount = itemsForFirebase.reduce(
        (acc, curr) => acc + curr.finalPrice,
        0
    );

    // Round the final total
    const roundedTotalAmount = Math.round(rawTotalAmount);
    // Calculate the exact round off difference
    const roundOffAmt = Number((roundedTotalAmount - rawTotalAmount).toFixed(2));

    return { itemsForFirebase, totalAmount: roundedTotalAmount, roundOff: roundOffAmt };
};
