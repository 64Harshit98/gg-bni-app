import type { SalesItem } from './sales.types';

// ─────────────────────────────────────────────────────────────────────────
// This file holds THREE separate, independently-called calculation
// functions moved verbatim out of Sales.tsx (formatting/hoisting only — no
// behavior changes). Sales' calculation logic is treated as the reference
// implementation elsewhere in the app, and the app owner has explicitly
// confirmed these three are NOT to be consolidated, deduplicated, or made
// to share a common formula. They intentionally recompute overlapping
// numbers (subtotal/tax/discount) at three different moments — live UI,
// save-time, and PDF-display-time — and may even disagree slightly with
// each other. That is a known, accepted state, not an oversight. Do not
// "fix" the divergence here; if you spot one, leave it and note it.
// ─────────────────────────────────────────────────────────────────────────

// Moved verbatim from Sales.tsx (was a module-level helper above the
// component). Used by all three calculation functions below, plus by many
// other spots inside Sales.tsx itself (price/discount input handlers,
// add-to-cart, item-edit merge, etc.) — exported so Sales.tsx can still call
// it directly for those unrelated call sites.
export const applyRounding = (amount: number, isRoundingEnabled: boolean, interval: number = 1): number => {
    if (!isRoundingEnabled || !interval || interval <= 0) {
        return parseFloat(amount.toFixed(2));
    }
    const rounded = Math.round(amount / interval) * interval;
    return parseFloat(rounded.toFixed(2));
};

// Moved verbatim from Sales.tsx (was a module-level helper above the
// component). Used by both calculateSaleTotals and
// calculateFinalizedSaleItems below, plus by a couple of leftover call
// sites still in Sales.tsx's handleSavePayment (outside the moved
// functions) — exported so those keep working. A plain 2-decimal rounding
// utility, not part of the "don't consolidate" concern (it carries no
// tax/discount domain logic of its own).
export const toCurrency = (num: number) => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
};

export interface SaleTotals {
    subtotal: number;
    totalDiscount: number;
    roundOff: number;
    taxableAmount: number;
    taxAmount: number;
    finalAmount: number;
    totalQuantity: number;
    totalMrp: number;
}

// ─────────────────────────────────────────────────────────────────────────
// #1 — LIVE-UI TOTALS
// Called from: Sales.tsx, inside the
//   `useMemo(() => calculateSaleTotals(...), [deps])` that drives the
//   on-screen subtotal/tax/discount/total shown while building the cart.
// Moved verbatim from the body of that useMemo (previously ~L489-586).
// Intentionally independent of calculateFinalizedSaleItems (save-time) and
// calculatePdfItemDiscounts (PDF-time) below — do not merge.
// ─────────────────────────────────────────────────────────────────────────
export const calculateSaleTotals = (
    items: SalesItem[],
    salesSettings: any,
    activeTaxMode: 'inclusive' | 'exclusive' | 'exempt',
    gstSchemeDisplay: string | undefined
): SaleTotals => {
    let accumulatorSubtotal = 0;
    let accumulatorTaxable = 0;
    let accumulatorTax = 0;
    let accumulatorQuantity = 0;
    let accumulatorMrp = 0;

    const taxRate = salesSettings?.defaultTaxRate ?? 0;
    const isRoundingEnabled = salesSettings?.enableRounding ?? true;
    const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

    // Determine Effective Tax Mode
    // Determine Effective Tax Mode
    let effectiveTaxMode = 'none';

    // Removed "&& isTaxEnabled" so it only relies on the GST scheme and the dropdown
    if (gstSchemeDisplay?.toLowerCase() === 'regular') {
        effectiveTaxMode = activeTaxMode === 'exempt' ? 'none' : activeTaxMode;
    } else {
        effectiveTaxMode = 'none';
    }


    items.forEach(cartItem => {
        const currentQuantity = cartItem.quantity || 1;
        accumulatorQuantity += currentQuantity;
        const basePrice = (cartItem.mrp > 0) ? cartItem.mrp : (cartItem.salesPrice || 0);
        accumulatorMrp += basePrice * currentQuantity;

        let baseForSubtotal = (cartItem.mrp > 0) ? cartItem.mrp : (cartItem.salesPrice || 0);
        const itemSpecificTaxRate = cartItem.tax !== undefined ? Number(cartItem.tax) : taxRate;

        if (effectiveTaxMode === 'inclusive' && itemSpecificTaxRate > 0) {
            baseForSubtotal = baseForSubtotal / (1 + (itemSpecificTaxRate / 100));
        }

        accumulatorSubtotal += baseForSubtotal * currentQuantity;

        const baseForDiscount = (cartItem.mrp > 0) ? cartItem.mrp : (cartItem.salesPrice || 0);
        let effectiveUnitPrice = 0;
        if (cartItem.customPrice !== undefined && cartItem.customPrice !== null && cartItem.customPrice !== '') {
            effectiveUnitPrice = parseFloat(String(cartItem.customPrice));
        } else {
            const priceAfterDiscount1 = baseForDiscount * (1 - (cartItem.discount || 0) / 100);
            effectiveUnitPrice = priceAfterDiscount1 * (1 - (cartItem.discount2 || 0) / 100);
        }

        effectiveUnitPrice = applyRounding(effectiveUnitPrice, isRoundingEnabled, roundingInterval);
        const lineTotal = toCurrency(effectiveUnitPrice * currentQuantity);

        // 3. Tax Calculation
        let lineBaseAmount = 0;
        let lineTaxAmount = 0;

        if (effectiveTaxMode !== 'none' && itemSpecificTaxRate > 0) {
            if (effectiveTaxMode === 'inclusive') {
                lineBaseAmount = toCurrency(lineTotal / (1 + (itemSpecificTaxRate / 100)));
                lineTaxAmount = toCurrency(lineTotal - lineBaseAmount);
            } else {
                lineBaseAmount = lineTotal;
                lineTaxAmount = toCurrency(lineTotal * (itemSpecificTaxRate / 100));
            }
        } else {
            lineBaseAmount = lineTotal;
            lineTaxAmount = 0;
        }

        accumulatorTaxable += lineBaseAmount;
        accumulatorTax += lineTaxAmount;
    });

    const finalTaxable = toCurrency(accumulatorTaxable);
    const finalTax = toCurrency(accumulatorTax);
    const rawFinalAmount = toCurrency(finalTaxable + finalTax);

    let totalDiscountValue = 0;

    if (effectiveTaxMode === 'none') {
        totalDiscountValue = toCurrency(accumulatorSubtotal - rawFinalAmount);
    } else {
        totalDiscountValue = toCurrency(accumulatorSubtotal - finalTaxable);
    }

    const finalPayableAmount = Math.round(rawFinalAmount);
    const roundOffAmount = toCurrency(finalPayableAmount - rawFinalAmount);


    return {
        subtotal: accumulatorSubtotal,
        totalDiscount: totalDiscountValue > 0 ? totalDiscountValue : 0,
        roundOff: roundOffAmount,
        taxableAmount: finalTaxable,
        taxAmount: finalTax,
        finalAmount: finalPayableAmount,
        totalQuantity: accumulatorQuantity,
        totalMrp: accumulatorMrp
    };
};

export interface FinalizedSaleItemsContext {
    isRoundingEnabled: boolean;
    roundingInterval: number;
    finalGstScheme: string;
    finalTaxType: string;
    currentTaxRate: number;
    billRatio: number;
}

// ─────────────────────────────────────────────────────────────────────────
// #2 — SAVE-TIME PER-LINE RECOMPUTE
// Called from: Sales.tsx `handleSavePayment`, inside `formatItemsForDB`
// (previously ~L1344-1413), which builds the item rows actually written to
// Firestore for the `sales` collection. Includes the proportional
// bill-discount `billRatio` scaling step applied only at save time.
// Moved verbatim. Intentionally independent of calculateSaleTotals (live
// UI) and calculatePdfItemDiscounts (PDF-time) above/below — do not merge,
// do not have this call either of the other two.
// ─────────────────────────────────────────────────────────────────────────
export const calculateFinalizedSaleItems = (
    itemsToFormat: SalesItem[],
    ctx: FinalizedSaleItemsContext
) => {
    const { isRoundingEnabled, roundingInterval, finalGstScheme, finalTaxType, currentTaxRate, billRatio } = ctx;

    return itemsToFormat.map(({ isEditable, customPrice, ...item }) => {
        const currentDiscount = Number(item.discount) || 0;
        const currentDiscount2 = Number(item.discount2) || 0;
        const currentQuantity = Number(item.quantity) || 1;

        let effectiveUnitPrice = 0;
        if (customPrice !== undefined && customPrice !== null && customPrice !== '') {
            effectiveUnitPrice = parseFloat(String(customPrice));
        } else {
            const basePrice = (item.mrp && item.mrp > 0) ? item.mrp : (item.salesPrice || 0);
            const priceAfterDiscount1 = basePrice * (1 - currentDiscount / 100);
            effectiveUnitPrice = priceAfterDiscount1 * (1 - currentDiscount2 / 100);
        }

        effectiveUnitPrice = applyRounding(effectiveUnitPrice, isRoundingEnabled, roundingInterval);
        effectiveUnitPrice = toCurrency(effectiveUnitPrice);

        const lineTotal = toCurrency(effectiveUnitPrice * currentQuantity);

        // MATCH UI EXACTLY: Rely purely on finalGstScheme and finalTaxType
        let effectiveTaxMode = 'none';
        if (finalGstScheme === 'regular') {
            effectiveTaxMode = finalTaxType === 'exempt' ? 'none' : finalTaxType;
        }

        // Extract tax safely
        const rawTax = item.tax ?? item.taxRate ?? currentTaxRate;
        const itemSpecificTaxRate = isNaN(Number(rawTax)) ? 0 : Number(rawTax);

        let itemTaxableBase = 0, itemTaxAmount = 0, itemFinalPrice = 0;

        if (effectiveTaxMode !== 'none' && itemSpecificTaxRate > 0) {
            if (effectiveTaxMode === 'inclusive') {
                itemFinalPrice = lineTotal;
                itemTaxableBase = toCurrency(lineTotal / (1 + (itemSpecificTaxRate / 100)));
                itemTaxAmount = toCurrency(lineTotal - itemTaxableBase);
            } else {
                itemTaxableBase = lineTotal;
                itemTaxAmount = toCurrency(lineTotal * (itemSpecificTaxRate / 100));
                itemFinalPrice = toCurrency(itemTaxableBase + itemTaxAmount);
            }
        } else {
            itemTaxableBase = lineTotal;
            itemFinalPrice = lineTotal;
        }

        // APPLY PROPORTIONAL DISCOUNT TO THE TAX VALUES ONLY
        const scaledTaxableBase = toCurrency(itemTaxableBase * billRatio);
        const scaledTaxAmount = toCurrency(itemTaxAmount * billRatio);

        return {
            ...item,
            id: item.productId || item.id,
            quantity: currentQuantity,
            discount: currentDiscount,
            discount2: currentDiscount2,
            effectiveUnitPrice: effectiveUnitPrice,
            finalPrice: itemFinalPrice,
            unit: item.unit || '',
            unitMultiplier: 1,
            packetSize: item.packetSize || null,
            taxableAmount: scaledTaxableBase,
            taxAmount: scaledTaxAmount,
            taxRate: itemSpecificTaxRate,     // FIX: Forces the DB to save the actual percentage!
            taxType: finalTaxType,
            discountPercentage: currentDiscount,
        };
    });
};

export interface PdfItemDiscounts {
    itemAmount: number;
    discount1Amount: number;
    discount2Amount: number;
    d1Pct: number;
    d2Pct: number;
    absoluteDiscount: number;
}

// ─────────────────────────────────────────────────────────────────────────
// #3 — PDF-DISPLAY-TIME PER-ITEM DISCOUNT RECOMPUTE
// Called from: Sales.tsx `preparePdfData`, inside the `populatedItems` map
// (previously ~L1685-1707), to derive the ₹-amount discount1/discount2
// breakdown shown on the printed/WhatsApp'd invoice.
// Moved verbatim. Intentionally independent of calculateSaleTotals (live
// UI) and calculateFinalizedSaleItems (save-time) above — do not merge, do
// not have this call either of the other two.
// ─────────────────────────────────────────────────────────────────────────
export const calculatePdfItemDiscounts = (item: any): PdfItemDiscounts => {
    const itemAmount = (item.finalPrice !== undefined && item.finalPrice !== null) ? item.finalPrice : (item.mrp * item.quantity);
    // --- Discount 1 + Discount 2 ko ₹ amount mein nikalna (Journal.tsx jaisa) ---
    const qty = Number(item.quantity) || 1;
    const actualMrp = Number(item.mrp) || 0;
    const basePrice = actualMrp > 0 ? actualMrp : (Number(item.salesPrice) || 0);

    const d1Pct = Number(item.discount || item.discountPercentage) || 0;
    const d2Pct = Number(item.discount2) || 0;

    const priceAfterD1 = basePrice * (1 - d1Pct / 100);
    const priceAfterD2 = priceAfterD1 * (1 - d2Pct / 100);

    const discount1Amount = (basePrice - priceAfterD1) * qty;
    let discount2Amount = (priceAfterD1 - priceAfterD2) * qty;

    // Agar discount2 % missing hai, actual amount se back-calculate karo
    if (d2Pct === 0 && itemAmount > 0) {
        const totalDiscountAmt = (basePrice * qty) - itemAmount;
        discount2Amount = Math.max(0, totalDiscountAmt - discount1Amount);
    }

    let absoluteDiscount = (basePrice * qty) - itemAmount;
    if (absoluteDiscount < 0) absoluteDiscount = 0;

    return { itemAmount, discount1Amount, discount2Amount, d1Pct, d2Pct, absoluteDiscount };
};
