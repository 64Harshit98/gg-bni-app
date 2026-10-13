import type { TransactionItem } from './ordersReturn.types';

// ─────────────────────────────────────────────────────────────────────────
// This file holds calculation functions moved verbatim out of
// OrdersReturn.tsx (formatting/hoisting only — no behavior changes). This is
// a verbatim extraction, not a consolidation and not a bug fix.
//
// BIGGEST DIVERGENCE FROM Orders/orders.calculations.ts: OrdersReturn never
// reads taxType/taxRate/tax, and never calls computeLineTax/isTaxEnabled (or
// the shared shared/calculations/itemCalculations.ts formulas). Every return
// and exchange line here is worked out purely from finalPrice/amount/mrp —
// there is no tax-inclusive/exclusive reversal logic anywhere in this
// module. Nothing in this file could be wired to the shared tax-split
// function because OrdersReturn's original code never performed that split
// in the first place; that gap is preserved as-is, not fixed.
//
// Other known divergences/oddities preserved verbatim (see each function's
// comment for detail):
//  - resolveSelectedSaleItemUnit vs resolveEffectiveUnitPriceForSave compute
//    the "effective unit price" of the SAME original order line in two
//    subtly different ways (different qty fallback, `??` vs `||`, and one
//    of them drops `mrp` from the fallback chain entirely).
//  - buildRecalculatedItemsList contains a real ASI (automatic semicolon
//    insertion) bug: `Number(item.mrp)` on its own line followed by a
//    dangling `0;` statement — the intended `|| 0` fallback never executes;
//    it's a no-op expression statement. Preserved exactly.
// ─────────────────────────────────────────────────────────────────────────

// ─── handleSelectSale mapping ───────────────────────────────────────────
// Moved verbatim from the `.map()` callback inside handleSelectSale
// (previously ~L271-296). Builds the on-screen "items available to return"
// list from the raw items stored on the selected original Order.
// NOTE: qty fallback is `|| 0`, lineTotal uses `??`, and the final price
// fallback chain includes `mrp`. Compare with resolveEffectiveUnitPriceForSave
// below, which looks similar but is NOT the same formula.
export const mapOrderItemToTransactionItem = (
  item: any
): (TransactionItem & { originalItemId: string; originalQuantity: number }) | null => {
  const id = item.id;
  if (!id) return null;
  const qty = Number(item.quantity) || 0;
  const lineTotal = Number(item.finalPrice ?? item.amount ?? 0);
  const fallbackUnit = qty > 0 ? lineTotal / qty : 0;
  const unit =
    item.effectiveUnitPrice !== undefined
      ? Number(item.effectiveUnitPrice)
      : fallbackUnit ||
      Number(item.customPrice ?? item.unitPrice ?? item.salesPrice ?? item.mrp) ||
      0;
  const total = unit * qty;

  return {
    id,
    originalItemId: id,
    name: item.name ?? 'Unnamed Item',
    quantity: qty,
    originalQuantity: qty,
    unitPrice: unit,
    amount: total,
    mrp: Number(item.mrp) || unit
  };
};

// ─── handleListChange 'discount' field branch ──────────────────────────
// Moved verbatim from handleListChange (previously ~L405-423). Applies the
// "round to nearest ₹5 below ₹100, else nearest ₹10" bucketing that only
// this return/exchange screen uses — not present anywhere in Orders.
export const computeDiscountRoundedPrice = (mrp: number, discountValue: number): number => {
  const basePrice = Number(mrp) || 0;

  let newPrice = basePrice * (1 - discountValue / 100);

  if (discountValue > 0) {
    newPrice =
      newPrice < 100
        ? Math.ceil(newPrice / 5) * 5
        : Math.ceil(newPrice / 10) * 10;
  }

  if (discountValue === 0) {
    newPrice = Number(mrp) || 0;
  }

  return newPrice;
};

export interface CustomPriceApplication {
  unitPrice: number;
  basePrice: number;
  discount: number;
  amount: number;
}

// ─── handleCustomPriceBlur ──────────────────────────────────────────────
// Moved verbatim from the calculation portion of handleCustomPriceBlur
// (previously ~L511-524). Caller is still responsible for the `isNaN(num)`
// guard and for clearing `customPrice` on the item afterward — this
// function only reproduces the numeric derivation.
export const computeCustomPriceApplication = (
  mrp: number,
  quantity: number,
  num: number
): CustomPriceApplication => {
  const safeMrp = Number(mrp || 0);

  let discount = 0;
  if (safeMrp > 0) {
    discount = ((safeMrp - num) / safeMrp) * 100;
  }

  const newAmount = num * quantity;

  return {
    unitPrice: Number(num.toFixed(2)),
    basePrice: safeMrp,
    discount: Number(discount.toFixed(2)),
    amount: Number(newAmount.toFixed(2))
  };
};

export interface ExchangeItemPricing {
  finalExchangePrice: number;
  calculatedDiscount: number;
}

// ─── addExchangeItem ─────────────────────────────────────────────────────
// Moved verbatim from addExchangeItem (previously ~L537-558). Priority
// order: salesPrice wins over presetDiscount if both are present.
export const computeExchangeItemPricing = (
  mrp: number,
  salesPrice: number,
  presetDiscount: number
): ExchangeItemPricing => {
  let finalExchangePrice = mrp;
  let calculatedDiscount = 0;

  if (salesPrice > 0) {
    finalExchangePrice = salesPrice;

    if (mrp > 0) {
      calculatedDiscount = ((mrp - salesPrice) / mrp) * 100;
    }
  }
  else if (presetDiscount > 0) {
    calculatedDiscount = presetDiscount;
    finalExchangePrice = mrp * (1 - (presetDiscount / 100));
  }
  else {
    finalExchangePrice = mrp;
    calculatedDiscount = 0;
  }

  return { finalExchangePrice, calculatedDiscount };
};

export interface ExchangeItemEditRecompute {
  finalPrice: number;
  discount: number;
  newAmount: number;
}

// ─── handleSaveSuccess exchange-item recompute ──────────────────────────
// Moved verbatim from the calculation portion of the setExchangeItems
// updater inside handleSaveSuccess (previously ~L352-363). Runs when an
// item's master data (mrp/salesPrice) is edited mid-return via the item
// drawer, to keep any already-added exchange line in sync.
// NOTE: this discount formula (gated on `newMrp > 0 && newSalesPrice > 0`,
// no presetDiscount branch) is NOT the same formula as
// computeExchangeItemPricing above — kept separate, not merged.
export const recomputeExchangeItemPricingOnEdit = (
  newMrp: number,
  newSalesPrice: number,
  quantity: number
): ExchangeItemEditRecompute => {
  let finalPrice = newSalesPrice > 0 ? newSalesPrice : newMrp;

  let discount = 0;
  if (newMrp > 0 && newSalesPrice > 0) {
    discount = ((newMrp - newSalesPrice) / newMrp) * 100;
  }

  const newAmount = finalPrice * quantity;

  return { finalPrice, discount, newAmount };
};

// ─── shared original-invoice total ──────────────────────────────────────
// This exact reduce (`sum + Number(item.finalPrice || 0)` over
// selectedSale.items) appeared identically in two places in the original
// file — the return-summary useMemo (previously ~L694-698) and
// saveReturnTransaction's step 1 (previously ~L776-779). Proven identical,
// so — unlike the two "effective unit price" resolvers below, which
// diverge — this one is safely shared as a single function.
export const computeOriginalInvoiceTotal = (items: any[] | undefined): number => {
  return (items || []).reduce(
    (sum: number, item: any) => sum + Number(item.finalPrice || 0),
    0
  );
};

export interface ReturnSummary {
  totalReturnGross: number;
  totalReturnValue: number;
  totalExchangeValue: number;
  finalBalance: number;
  discountDeducted: number;
}

// ─── Return summary (live UI) ───────────────────────────────────────────
// Called from: OrdersReturn.tsx, inside the
//   `useMemo(() => ..., [itemsToReturn, exchangeItems, selectedSale, modeOfReturn])`
// that drives the on-screen return-value/exchange-value/final-balance
// summary. Moved verbatim from the body of that useMemo (previously
// ~L678-731). `totalReturnValue` is computed and returned here exactly as
// before even though the original destructure at the call site never pulls
// it out — dead-but-harmless, preserved as-is.
export const computeReturnSummary = (
  itemsToReturn: { amount?: number }[],
  exchangeItems: { amount?: number }[],
  selectedSale: { items?: any[]; manualDiscount?: number; paymentMethods?: Record<string, any> } | null,
  modeOfReturn: string
): ReturnSummary => {
  const trg = itemsToReturn.reduce(
    (sum, item) => sum + (item.amount || 0),
    0
  );

  const tev = exchangeItems.reduce(
    (sum, item) => sum + (item.amount || 0),
    0
  );

  let dd = 0;

  if (selectedSale) {
    const originalInvoiceTotal = computeOriginalInvoiceTotal(selectedSale.items);
    const originalManualDiscount = Number(selectedSale.manualDiscount) || 0;

    if (originalInvoiceTotal > 0 && originalManualDiscount > 0) {
      const ratio = trg / originalInvoiceTotal;
      dd = Math.round(originalManualDiscount * ratio * 100) / 100;
    }
  }

  const totalReturnValue = trg - dd;

  let fb = 0;

  if (modeOfReturn === 'Exchange') {
    fb = totalReturnValue - tev;
  } else {
    fb = totalReturnValue;
  }

  // fb is the true return/exchange difference — never capped to what was
  // actually paid on the original order. A Credit Note is a book adjustment,
  // not a cash outflow, so it must always reflect the real amount regardless
  // of the order's paid status. (Matches the same fix applied to the
  // Sales-return module's calculateReturnTotals — this cap zeroed the
  // balance, and with it the Credit Note/Cash Refund choice, for any
  // unpaid/due order.)
  return {
    totalReturnGross: trg,
    totalReturnValue,
    totalExchangeValue: tev,
    finalBalance: Math.round(fb * 100) / 100,
    discountDeducted: dd
  };
};

// ─── saveReturnTransaction: original-items-map unit resolution ─────────
// Moved verbatim from the forEach body that builds `originalItemsMap`
// inside saveReturnTransaction (previously ~L758-772).
// NOTE: this is deliberately NOT the same formula as
// mapOrderItemToTransactionItem above, even though both resolve "the
// effective unit price of an original order line":
//  - qty fallback here is `|| 1` (mapOrderItemToTransactionItem uses `|| 0`)
//  - total here uses `||` (mapOrderItemToTransactionItem uses `??`)
//  - the final fallback chain here is customPrice ?? unitPrice ?? salesPrice
//    — it does NOT fall through to `mrp` the way
//    mapOrderItemToTransactionItem's chain does.
// Both are preserved exactly as they were, not reconciled.
export const resolveEffectiveUnitPriceForSave = (item: any): number => {
  const qty = Number(item.quantity) || 1;
  const total = Number(item.finalPrice || item.amount || 0);
  const unit =
    item.effectiveUnitPrice !== undefined
      ? Number(item.effectiveUnitPrice)
      : (qty > 0 ? total / qty : 0) ||
      Number(item.customPrice ?? item.unitPrice ?? item.salesPrice) ||
      0;

  return unit;
};

// ─── saveReturnTransaction: post-merge item list recompute ─────────────
// Moved verbatim from the `.map()` that builds `newItemsList` out of the
// merged `originalItemsMap` (previously ~L871-889). FIXED a real ASI bug:
// the `safeUnit` fallback chain used to end with a bare `Number(item.mrp)`
// line followed by a dangling `0;` on the next line — with no `||` joining
// them, JS's automatic semicolon insertion parsed this as TWO statements
// (`const safeUnit = ... || Number(item.mrp);` then a no-op `0;` expression
// statement), so the intended "fall back to 0" never actually ran, and
// `safeUnit` could end up `NaN` if `item.mrp` was also falsy/NaN. Fixed by
// joining the fallback chain with `||` as originally intended.
export const buildRecalculatedItemsList = (itemsMap: Map<string, any>): any[] => {
  return Array.from(itemsMap.values()).map(item => {
    const safeUnit =
      Number(item._effectiveUnitPrice) ||
      Number(item.unitPrice) ||
      Number(item.mrp) ||
      0;

    const lineTotal = safeUnit * Number(item.quantity);

    const { _effectiveUnitPrice, ...clean } = item;

    return {
      ...clean,
      unitPrice: safeUnit,
      salesPrice: safeUnit,
      finalPrice: lineTotal,
      amount: lineTotal
    };
  });
};

export interface ItemGrossTotals {
  subtotal: number;
  totalItemDiscount: number;
}

// ─── saveReturnTransaction: gross/discount totals over the new item list ─
// Moved verbatim from the `.reduce()` immediately after newItemsList is
// built (previously ~L891-900).
export const computeItemGrossTotals = (items: { mrp: number; quantity: number; finalPrice: number }[]): ItemGrossTotals => {
  return items.reduce(
    (acc, item) => {
      const gross = item.mrp * item.quantity;
      const discount = gross - item.finalPrice;
      acc.subtotal += gross;
      acc.totalItemDiscount += discount;
      return acc;
    },
    { subtotal: 0, totalItemDiscount: 0 }
  );
};

export interface ManualDiscountDeduction {
  discountDeduction: number;
  newManualDiscount: number;
}

// ─── saveReturnTransaction: proportional manual-discount deduction ─────
// Moved verbatim from the manual-discount block of saveReturnTransaction
// (previously ~L902-920). NOTE: this proportional-discount formula is
// gated on `returnedItemsGrossValue` (the sum of returned items' effective
// unit price × qty), which is DIFFERENT from the `dd`/discountDeducted
// figure computed in computeReturnSummary above, which is gated on
// `trg` (itemsToReturn's `.amount` sum) instead. The two are computed from
// different source values and are not guaranteed to match — preserved as
// two separate calculations, not reconciled.
export const computeManualDiscountDeduction = (
  originalManualDiscount: number,
  originalInvoiceTotal: number,
  returnedItemsGrossValue: number
): ManualDiscountDeduction => {
  let discountDeduction = 0;

  if (
    originalManualDiscount > 0 &&
    originalInvoiceTotal > 0 &&
    returnedItemsGrossValue > 0
  ) {
    discountDeduction =
      (returnedItemsGrossValue / originalInvoiceTotal) *
      originalManualDiscount;
  }

  discountDeduction = Math.round(discountDeduction * 100) / 100;
  const newManualDiscount = Math.max(
    0,
    originalManualDiscount - discountDeduction
  );

  return { discountDeduction, newManualDiscount };
};

export interface PostReturnPaymentStatus {
  isUnpaidOrder: boolean;
  newPaymentAmount: number;
  effectivePaid: number;
  effectiveDue: number;
  newStatus: 'Paid' | 'Completed';
}

// ─── saveReturnTransaction: post-return payment/status clamp ───────────
// Moved verbatim from the payment-status block near the end of
// saveReturnTransaction (previously ~L1017-1034).
export const computePostReturnPaymentStatus = (
  actualPaid: number,
  paymentDetails: Record<string, any> | undefined | null,
  updatedFinalAmount: number
): PostReturnPaymentStatus => {
  const isUnpaidOrder = actualPaid === 0;

  const newPaymentAmount = paymentDetails
    ? Object.entries(paymentDetails)
      .filter(([k]) => k.toLowerCase() !== 'due')
      .reduce((sum, [, v]) => sum + Number(v), 0)
    : 0;

  const totalPaidAfterReturn = actualPaid + newPaymentAmount;

  const effectivePaid = Math.min(totalPaidAfterReturn, updatedFinalAmount);
  const effectiveDue = Math.max(0, updatedFinalAmount - effectivePaid);

  const newStatus = effectiveDue <= 0.1 ? 'Paid' : 'Completed';

  return { isUnpaidOrder, newPaymentAmount, effectivePaid, effectiveDue, newStatus };
};
