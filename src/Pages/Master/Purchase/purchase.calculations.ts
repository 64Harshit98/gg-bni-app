import type { PurchaseItem, TaxOption } from './purchase.types';

// ─────────────────────────────────────────────────────────────────────────
// This file holds calculation functions moved verbatim out of Purchase.tsx
// (formatting/hoisting only — no behavior changes). This is a verbatim
// extraction, not a consolidation and not a bug fix: Purchase's calculation
// logic has several known divergences from Sales' equivalent logic (no
// GST-scheme gating before applying tax — effectiveScheme here is derived
// purely from `taxType === 'exempt' ? 'none' : 'regular'`, never from the
// company's actual GST scheme setting; an asymmetric stray Math.round() that
// only fires in the 'exclusive' branch of the save-time formatter; no
// proportional bill-discount-to-tax ("billRatio") scaling at save time,
// unlike Sales; and base-price resolution that is NOT the same rule
// everywhere in Purchase.tsx — e.g. addItemToCart/handleSaveSuccess prefer
// masterPurchasePrice first then mrp, while handleDiscountChange /
// handleDiscount2Change / handlePriceBlur prefer mrp first then
// originalPurchasePrice). All of these are preserved exactly as-is. Do not
// "fix" or normalize any of it here — if you spot something else that looks
// off, leave it and note it.
// ─────────────────────────────────────────────────────────────────────────

// Moved verbatim from Purchase.tsx (was a module-level helper above the
// component, ~L80-85). NOTE: intentionally different from Sales'
// `applyRounding` (which supports a configurable rounding interval and
// always returns a 2-decimal-parsed value even when rounding is disabled).
// This one only ever rounds to whole numbers (Math.round) or passes the
// amount through completely unrounded when disabled — not a bug in this
// extraction, just how Purchase's rounding already worked.
export const applyPurchaseRounding = (amount: number, isRoundingEnabled: boolean): number => {
  if (!isRoundingEnabled) {
    return amount;
  }
  return Math.round(amount);
};

export interface PurchaseTotals {
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  taxAmount: number;
  roundingOffAmount: number;
  finalAmount: number;
  totalQuantity: number;
  totalMrp: number;
}

// ─────────────────────────────────────────────────────────────────────────
// LIVE-UI TOTALS
// Called from: Purchase.tsx, inside the
//   `useMemo(() => calculatePurchaseTotals(...), [deps])` that drives the
//   on-screen subtotal/tax/discount/total shown while building the cart.
// Moved verbatim from the body of that useMemo (previously ~L534-606).
// NOTE: unlike Sales' calculateSaleTotals, there is no gating on the
// company's GST scheme here — `effectiveScheme` is derived purely from
// `taxType === 'exempt' ? 'none' : 'regular'`. That divergence from Sales is
// preserved as-is, not fixed.
// ─────────────────────────────────────────────────────────────────────────
export const calculatePurchaseTotals = (
  items: PurchaseItem[],
  purchaseSettings: any,
  billTaxType: TaxOption
): PurchaseTotals => {
  const taxType = billTaxType;
  const isRoundingEnabled = purchaseSettings?.roundingOff ?? true;

  let mrpTotalAgg = 0;
  let purchasePriceTotalAgg = 0;
  let totalTaxableBaseAgg = 0;
  let totalTaxAgg = 0;
  let finalAmountAggPreRounding = 0;
  let qtyAgg = 0;

  items.forEach(item => {
    const purchasePrice = Number(item.purchasePrice || 0);
    const quantity = item.quantity || 1;
    const itemTaxRate = item.taxRate || 0;
    const mrp = item.mrp || 0;

    qtyAgg += quantity;
    mrpTotalAgg += mrp * quantity;

    const itemTotalPurchasePrice = purchasePrice * quantity;
    purchasePriceTotalAgg += itemTotalPurchasePrice;

    let itemTaxableBase = 0;
    let itemTax = 0;
    let itemFinalTotal = 0;

    const effectiveScheme = taxType === 'exempt' ? 'none' : 'regular';
    if (effectiveScheme === 'regular') {
      if (taxType === 'exclusive') {
        itemTaxableBase = itemTotalPurchasePrice;
        itemTax = itemTaxableBase * (itemTaxRate / 100);
        itemFinalTotal = itemTaxableBase + itemTax;
      } else {
        itemFinalTotal = itemTotalPurchasePrice;
        itemTaxableBase = itemTotalPurchasePrice / (1 + (itemTaxRate / 100));
        itemTax = itemTotalPurchasePrice - itemTaxableBase;
      }
    } else {
      itemTaxableBase = itemTotalPurchasePrice;
      itemTax = 0;
      itemFinalTotal = itemTaxableBase;
    }

    totalTaxableBaseAgg += itemTaxableBase;
    totalTaxAgg += itemTax;
    finalAmountAggPreRounding += itemFinalTotal;
  });

  const roundedAmount = applyPurchaseRounding(finalAmountAggPreRounding, isRoundingEnabled);
  const currentRoundingOffAmount = roundedAmount - finalAmountAggPreRounding;
  const currentTotalDiscount = mrpTotalAgg - purchasePriceTotalAgg;

  return {
    subtotal: totalTaxableBaseAgg,
    totalDiscount: currentTotalDiscount > 0 ? currentTotalDiscount : 0,
    taxableAmount: totalTaxableBaseAgg,
    taxAmount: totalTaxAgg,
    roundingOffAmount: currentRoundingOffAmount,
    finalAmount: roundedAmount,
    totalQuantity: qtyAgg,
    totalMrp: mrpTotalAgg
  };
};

// ─────────────────────────────────────────────────────────────────────────
// SAVE-TIME PER-LINE RECOMPUTE
// Called from: Purchase.tsx `handleSavePurchase`, as the `formatItemsForDB`
// closure (previously ~L750-793), which builds the item rows actually
// written to Firestore for the `purchases` collection.
// Moved verbatim, including the asymmetric stray `Math.round()` that only
// fires in the 'exclusive' branch (`itemTaxableBase = Math.round(...)`) —
// the 'inclusive' and else branches do NOT round `itemTaxableBase` the same
// way. This asymmetry is a known divergence, not fixed here.
// `finalTaxType` was previously read from the enclosing `handleSavePurchase`
// closure — now passed explicitly as a parameter.
// ─────────────────────────────────────────────────────────────────────────
export const formatPurchaseItemsForDB = (
  itemsToFormat: PurchaseItem[],
  finalTaxType: TaxOption
): PurchaseItem[] => {
  return itemsToFormat.map((item) => {
    const purchasePrice = Number(item.purchasePrice || 0);
    const quantity = item.quantity || 1;
    const itemTaxRate = finalTaxType === 'exempt' ? 0 : (item.taxRate || 0);

    const itemTotalPurchasePrice = purchasePrice * quantity;
    let itemTaxableBase = 0;
    let itemTax = 0;

    if (finalTaxType === 'exclusive') {
      itemTaxableBase = Math.round(itemTotalPurchasePrice);
      itemTax = itemTaxableBase * (itemTaxRate / 100);
    } else if (finalTaxType === 'inclusive') {
      itemTaxableBase = itemTotalPurchasePrice / (1 + (itemTaxRate / 100));
      itemTax = itemTotalPurchasePrice - itemTaxableBase;
    } else {
      itemTaxableBase = itemTotalPurchasePrice;
      itemTax = 0;
    }

    const formattedTaxable = parseFloat(itemTaxableBase.toFixed(2));
    const formattedTax = parseFloat(itemTax.toFixed(2));

    // --- NEW: Calculate Item-Wise Total (Taxable + Tax) ---
    const itemLineTotal = parseFloat((formattedTaxable + formattedTax).toFixed(2));

    const { customPrice, isEditable, originalPurchasePrice, ...dbItem } = item;

    return {
      ...dbItem,
      id: item.productId || item.id,
      purchasePrice: purchasePrice,
      discount: item.purchasediscount ?? item.discount ?? 0,
      purchasediscount2: item.purchasediscount2 ?? 0,
      taxableAmount: parseFloat(itemTaxableBase.toFixed(2)),
      taxAmount: parseFloat(itemTax.toFixed(2)),
      taxRate: itemTaxRate,
      taxType: finalTaxType,
      finalPrice: itemLineTotal,
      unitMultiplier: item.unitMultiplier || 1,
    };
  });
};
