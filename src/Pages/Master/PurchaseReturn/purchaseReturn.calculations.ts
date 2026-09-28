import type { Item } from '../../../constants/models';
import { calculateLineTax } from '../../../shared/calculations/itemCalculations';
import type { PurchaseData, ReturnCartItem, TransactionItem } from './purchaseReturn.types';

// ─────────────────────────────────────────────────────────────────────────
// This file holds calculation functions moved verbatim out of
// PurchaseReturn.tsx (formatting/hoisting only — no behavior changes). This
// is a verbatim extraction, not a consolidation and not a bug fix.
//
// Known divergences/oddities preserved as-is (do not "fix" any of these):
//  - Unlike Purchase's calculatePurchaseTotals, there is NO GST-scheme
//    gating at all here — every tax split below runs unconditionally off
//    whatever taxType/taxRate the item (or the bill's activeTaxMode)
//    carries, with no `isTaxEnabled`-style check against company settings.
//  - `calculatePurchaseReturnTotals`'s per-line tax split for both the
//    returned-items loop and the new-items loop was verified (algebraically,
//    branch-by-branch) to be a byte-for-byte match for
//    `calculateLineTax(lineTotal, taxType, taxRate, true)` from
//    shared/calculations/itemCalculations.ts — always called with
//    taxEnabled=true since there is no settings gate to evaluate. Wired in
//    per the app owner's "if it's a pure drop-in match, wire it in" rule.
//    The original code tracked "exclusive tax to add back to gross"
//    (`returnExclusiveTax` / `newItemsExclusiveTax`) as a separate running
//    total, incremented only inside the `exclusive` branch; this is
//    preserved by taking `lineTax.finalPrice - lineTotal`, which is
//    algebraically identical (0 for inclusive/none, equal to the tax amount
//    for exclusive) but arrived at differently than the original inline
//    code. Confirmed equivalent, not "fixed".
//  - The odd self-referential expression
//    `origItem.taxType === 'exempt' ? 'exempt' : (origItem.taxType || 'exempt')`
//    (effectively just `origItem.taxType || 'exempt'`) is preserved verbatim
//    in `calculatePurchaseReturnTotals` — it looks redundant but is left
//    untouched.
//  - `buildNewPurchaseItemRecord`'s save-time tax split (used only for a new
//    item NOT already present in the original bill) was also verified to be
//    a pure drop-in match for `calculateLineTax` and wired in the same way.
//  - `calculateNewItemDiscountOnAdd` (on selecting a new item) and
//    `calculateNewItemPriceBlur` (on blurring the price field) compute the
//    reverse-discount-from-price formula DIFFERENTLY from each other: the
//    "on add" version has no floor (`((mrp - masterPurchasePrice) / mrp) *
//    100` can go negative if the master purchase price exceeds mrp), while
//    the "on price blur" version clamps with `Math.max(0, ...)`. This is the
//    same kind of inconsistency Purchase.tsx has between its own
//    price/discount handlers, and is preserved unmerged, one function each.
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// Moved verbatim from PurchaseReturn.tsx's `handleNewItemSelected` (LOGIC 1:
// "ADD NEW ITEM (Purchase Price Priority)", previously ~L446-461). Called
// when a new item is picked from SearchableItemInput/BarcodeScanner during
// an exchange, to seed its net price and implied discount.
// ─────────────────────────────────────────────────────────────────────────
export const calculateNewItemDiscountOnAdd = (item: Item): { finalNetPrice: number; calculatedDiscount: number } => {
  const mrp = Number(item.mrp || 0);
  const masterPurchasePrice = Number((item as any).purchasePrice || 0);

  let finalNetPrice = 0;
  let calculatedDiscount = 0;

  if (masterPurchasePrice > 0) {
    finalNetPrice = masterPurchasePrice;
    if (mrp > 0) {
      calculatedDiscount = ((mrp - masterPurchasePrice) / mrp) * 100;
    }
  } else {
    finalNetPrice = 0;
    calculatedDiscount = 0;
  }

  return { finalNetPrice, calculatedDiscount };
};

// ─────────────────────────────────────────────────────────────────────────
// Moved verbatim from PurchaseReturn.tsx's `handleNewItemPriceBlur` (LOGIC
// 2: "NEW ITEM PRICE CHANGE (Updates Discount)", previously ~L487-509) —
// the pure-calculation portion only; the `setNewItemsReceived` map/merge
// stays in the component. NOTE the `Math.max(0, ...)` floor here, which
// `calculateNewItemDiscountOnAdd` above does NOT have — that divergence is
// intentional/pre-existing, not something to reconcile.
// ─────────────────────────────────────────────────────────────────────────
export const calculateNewItemPriceBlur = (
  item: ReturnCartItem
): { unitPrice: number; amount: number; customPrice: number; discount?: number } => {
  const rawVal = item.customPrice;
  const currentPriceVal = parseFloat(String(rawVal));

  if (item.customPrice === '' || isNaN(currentPriceVal)) {
    // NOTE: original spread `{ ...item, unitPrice: 0, amount: 0, customPrice: 0 }`
    // deliberately does NOT touch `discount` here — preserved by omitting the
    // key rather than defaulting it, so a caller merge (`{...item, ...result}`)
    // leaves the existing discount value (even if undefined) untouched.
    return { unitPrice: 0, amount: 0, customPrice: 0 };
  }

  let d = item.discount || 0;
  const mrp = item.mrp || 0;

  if (mrp > 0) {
    d = Math.max(0, ((mrp - currentPriceVal) / mrp) * 100);
  }

  return {
    unitPrice: currentPriceVal,
    amount: currentPriceVal * item.quantity,
    customPrice: currentPriceVal,
    discount: parseFloat(d.toFixed(2))
  };
};

// ─────────────────────────────────────────────────────────────────────────
// Moved verbatim from PurchaseReturn.tsx's `handleNewItemDiscountChange`
// (LOGIC 3: "NEW ITEM DISCOUNT CHANGE (Updates Price)", previously
// ~L517-536) — the pure-calculation portion only. Uses the same
// `Math.round((x + Number.EPSILON) * 100) / 100` rounding idiom as Sales'
// `toCurrency`, but is left as an inline formula here rather than importing
// `toCurrency` from sales.calculations — the app owner's sharing rule is
// scoped to the itemCalculations.ts tax-split helpers, not this rounding
// idiom, so it is not wired to Sales.
// ─────────────────────────────────────────────────────────────────────────
export const calculateNewItemDiscountChange = (
  item: ReturnCartItem,
  newDiscount: number
): { discount: number; unitPrice: number; customPrice: number; amount: number } => {
  const mrp = item.mrp || 0;
  let newNetPrice = item.unitPrice;

  if (mrp > 0) {
    newNetPrice = Math.max(0, mrp * (1 - newDiscount / 100));
  }

  newNetPrice = Math.round((newNetPrice + Number.EPSILON) * 100) / 100;

  return {
    discount: newDiscount,
    unitPrice: newNetPrice,
    customPrice: newNetPrice,
    amount: newNetPrice * item.quantity
  };
};

export interface PurchaseReturnTotals {
  totalReturnValue: number;
  totalNewItemsValue: number;
  finalBalance: number;
  discountDeducted: number;
  totalTax: number;
  totalMrp: number;
}

// ─────────────────────────────────────────────────────────────────────────
// LIVE-UI TOTALS
// Called from: PurchaseReturn.tsx, inside the
//   `useMemo(() => ({ totalReturnValue, ... }), [deps])` that drives the
//   on-screen return-summary panel (previously ~L610-695, "UI CALCULATIONS
//   (With Discount, Tax, and MRP)").
// Moved verbatim, with the two per-line tax splits (return items / new
// items) wired to the shared `calculateLineTax` — see file header for the
// equivalence proof. Everything else (gross accumulation, MRP totals, the
// proportional bill-discount `discountDeducted` calc, and the final
// due-payment clamp) is untouched inline arithmetic.
// ─────────────────────────────────────────────────────────────────────────
export const calculatePurchaseReturnTotals = (
  itemsToReturn: TransactionItem[],
  newItemsReceived: ReturnCartItem[],
  selectedPurchase: PurchaseData | null,
  availableItems: Item[],
  activeTaxMode: 'inclusive' | 'exclusive' | 'exempt'
): PurchaseReturnTotals => {
  let returnGross = 0;
  let returnExclusiveTax = 0;
  let returnTaxAmount = 0;
  let returnMrpTotal = 0;

  itemsToReturn.forEach(returnItem => {
    returnGross += returnItem.amount;

    const baseReturnPrice = returnItem.mrp > 0 ? returnItem.mrp : returnItem.unitPrice;
    returnMrpTotal += baseReturnPrice * returnItem.quantity;

    const origItem = selectedPurchase?.items.find(i => (i.id || (i as any).productId) === returnItem.originalItemId);
    if (origItem) {
      const taxType = origItem.taxType === 'exempt' ? 'exempt' : (origItem.taxType || 'exempt');
      const taxRate = Number((origItem as any).taxRate || (origItem as any).tax || 0);

      const lineTax = calculateLineTax(returnItem.amount, taxType, taxRate, true);
      returnTaxAmount += lineTax.taxAmount;
      returnExclusiveTax += (lineTax.finalPrice - returnItem.amount);
    }
  });

  let newItemsGross = 0;
  let newItemsExclusiveTax = 0;
  let newItemsTaxAmount = 0;
  let newItemsMrpTotal = 0;

  const effectiveTaxMode = activeTaxMode; // Simply use what the original bill dictated

  newItemsReceived.forEach(newItem => {
    newItemsGross += newItem.amount;

    const baseExchangePrice = newItem.mrp > 0 ? newItem.mrp : (newItem.unitPrice || 0);
    newItemsMrpTotal += baseExchangePrice * newItem.quantity;

    const itemMaster = availableItems.find(i => i.id === newItem.originalItemId);
    const itemTaxRate = ((itemMaster as any)?.tax !== undefined) ? Number((itemMaster as any).tax) : 0;

    const lineTax = calculateLineTax(newItem.amount, effectiveTaxMode, itemTaxRate, true);
    newItemsTaxAmount += lineTax.taxAmount;
    newItemsExclusiveTax += (lineTax.finalPrice - newItem.amount);
  });

  let discountDeducted = 0;
  if (selectedPurchase) {
    const originalGross = selectedPurchase.items.reduce((sum, item: any) => sum + (Number(item.finalPrice || 0)), 0);
    const originalManualDiscount = Number(selectedPurchase.manualDiscount) || 0;

    if (originalGross > 0 && originalManualDiscount > 0) {
      const ratio = (returnGross + returnExclusiveTax) / originalGross;
      discountDeducted = Math.round(originalManualDiscount * ratio * 100) / 100;
    }
  }

  const netReturnVal = returnGross + returnExclusiveTax - discountDeducted;
  const netNewItemsVal = newItemsGross + newItemsExclusiveTax;
  let finalBalance = netReturnVal - netNewItemsVal;

  const paidAmountOnPurchase = Object.entries(selectedPurchase?.paymentMethods || {})
    .filter(([mode]) => mode !== 'due')
    .reduce((sum, [, val]) => sum + Number(val || 0), 0);

  finalBalance = finalBalance > 0
    ? Math.min(finalBalance, paidAmountOnPurchase)
    : finalBalance;

  return {
    totalReturnValue: netReturnVal,
    totalNewItemsValue: netNewItemsVal,
    finalBalance: Math.round(finalBalance),
    discountDeducted,
    totalTax: Math.abs(newItemsTaxAmount - returnTaxAmount),
    totalMrp: Math.abs(newItemsMrpTotal - returnMrpTotal)
  };
};

// ─────────────────────────────────────────────────────────────────────────
// SAVE-TIME NEW-ITEM RECORD BUILDER
// Called from: PurchaseReturn.tsx `saveReturnTransaction`, inside the
// `for (const newItem of newItemsReceived)` loop's `else` branch (previously
// ~L737-767) — only runs when the received item was NOT already part of the
// original bill (i.e. `originalItemsMap.get(newItem.originalItemId)` was
// undefined), to build the new line inserted into `originalItemsMap`.
// Moved verbatim, with the inline inclusive/exclusive tax split wired to the
// shared `calculateLineTax` — see file header for the equivalence proof
// (including the `finalPrice` ternary, which matches calculateLineTax's
// finalPrice for all three branches exactly).
// ─────────────────────────────────────────────────────────────────────────
export const buildNewPurchaseItemRecord = (
  newItem: ReturnCartItem,
  availableItems: Item[],
  activeTaxMode: 'inclusive' | 'exclusive' | 'exempt'
): any => {
  const itemMaster = availableItems.find(i => i.id === newItem.originalItemId);
  const itemTaxRate = ((itemMaster as any)?.tax !== undefined) ? Number((itemMaster as any).tax) : 0;

  const lineTotal = newItem.unitPrice * newItem.quantity;
  const lineTax = calculateLineTax(lineTotal, activeTaxMode, itemTaxRate, true);

  return {
    id: newItem.originalItemId,
    name: newItem.name,
    quantity: newItem.quantity,
    purchasePrice: newItem.unitPrice,
    mrp: newItem.mrp || 0,
    tax: newItem.tax || 0,
    taxRate: itemTaxRate,
    taxType: activeTaxMode,
    taxableAmount: lineTax.taxableAmount,
    taxAmount: lineTax.taxAmount,
    finalPrice: lineTax.finalPrice,
    hsnSac: newItem.hsnSac || '',
    barcode: newItem.barcode || '',
    unit: newItem.unit || '',
    unitMultiplier: newItem.unitMultiplier || 1
  };
};
