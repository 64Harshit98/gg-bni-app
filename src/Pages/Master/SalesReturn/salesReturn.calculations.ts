import type { SalesData, TransactionItem, ExchangeItem } from './salesReturn.types';

// ─────────────────────────────────────────────────────────────────────────
// This file holds SIX separate, independently-called calculation functions
// moved verbatim out of SalesReturn.tsx (formatting/hoisting only — no
// behavior changes). This is a verbatim extraction, not a consolidation and
// not a bug fix, matching the standing policy from the Sales/Purchase
// extractions: calculation logic is moved exactly as-is, duplicate-looking
// formulas are NOT merged even when they look like they compute "the same
// thing," and nothing that looks wrong is fixed here — only documented.
//
// Known divergences found while extracting (all preserved unchanged):
//
// 1. TWO DIFFERENT "proportional bill discount" formulas exist, computed at
//    two different moments, using two different bases:
//      - Live-UI preview (`calculateReturnTotals`, folded into its
//        `discountDeducted` output): ratio = (sum of returned line amounts
//        + their exclusive-mode tax) / originalInvoiceTotal, using the
//        RETURN ITEM's own snapshot `.amount` (taken from the editable
//        `originalSaleItems` UI state, which the user can hand-edit via
//        quantity/discount fields before saving).
//      - Save-time (`calculateSaveTimeDiscountDeduction`, called from
//        `saveReturnTransaction`): ratio = returnedItemsGrossValue /
//        originalInvoiceTotal, where returnedItemsGrossValue is built from
//        the ORIGINAL SALE's own recorded `_effectiveUnitPrice * quantity`
//        for each returned line — a different source, does not add tax, and
//        is computed in a stock-mutation loop that lives inline in
//        SalesReturn.tsx (not moved here, see note below).
//    These two numbers can legitimately disagree (e.g. if a user edited a
//    return-item quantity/price in the UI in a way not perfectly mirrored
//    by the original sale record). Do not merge or reconcile them.
//
// 2. `calculatePaidAmountOnSale` below is a literal, byte-for-byte duplicate
//    of a `paidAmountOnSale` local variable computed *inside*
//    `calculateReturnTotals` (used there only to cap `finalBalance` so a
//    refund/credit can never exceed what was actually paid on the original
//    sale). The two were already independently duplicated in
//    SalesReturn.tsx before this extraction (once inline in the big
//    useMemo, once as its own separate useMemo powering `paidAmountOnSale`/
//    `isDueSale` used elsewhere in the render). Kept as two separate call
//    sites here rather than having `calculateReturnTotals` call
//    `calculatePaidAmountOnSale` internally, to avoid quietly turning two
//    independently-evaluated duplicates into a single shared dependency.
//
// 3. Per-line tax-split math here (inclusive: divide out; exclusive: add on
//    top) is structurally identical to `calculateLineTax` in
//    src/shared/calculations/itemCalculations.ts, but every call site in
//    this file interleaves `toCurrency`-style 2-decimal rounding into the
//    intermediate taxable/tax values (`toCurrency(lineTotal / (1 + rate))`,
//    etc.), which `calculateLineTax` does not do internally. That is the
//    same kind of rounding divergence that kept Purchase's inner tax split
//    from being wired to the shared helper. Per the established policy,
//    nothing here is wired to `calculateLineTax` — left inline as found.
//
// NOT extracted (left inline in SalesReturn.tsx on purpose): the stock
// adjustment loops inside `saveReturnTransaction` (`itemsToReturn.forEach`
// stock-decrement/increment via `batch.update`, and the matching exchange-
// item `originalItemsMap.set(...)` block) interleave pure arithmetic with
// Firestore `batch.update` side effects and `Map` mutation, so unlike
// Sales/Purchase's save-time formatters they are not pure functions and
// were not moved. Only the pure per-line tax split inside that exchange
// block (`calculateExchangeLineTax` below) was pulled out.
// ─────────────────────────────────────────────────────────────────────────

// Moved verbatim from SalesReturn.tsx (was a module-level helper above the
// component, ~L83-85). Identical formula to Sales' `toCurrency` in
// sales.calculations.ts, but SalesReturn defined its own separate copy
// rather than importing Sales' — kept as its own copy here too, per the
// "don't consolidate" policy.
export const toCurrency = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

export interface ReturnTotals {
  totalReturnGross: number;
  totalReturnValue: number;
  totalExchangeValue: number;
  finalBalance: number;
  discountDeducted: number;
  totalMrp: number;
  totalTax: number;
}

// ─────────────────────────────────────────────────────────────────────────
// #1 — LIVE-UI RETURN/EXCHANGE TOTALS
// Called from: SalesReturn.tsx, inside the
//   `useMemo(() => {...}, [itemsToReturn, exchangeItems, selectedSale,
//   salesSettings, availableItems, activeTaxMode])` that drives the
//   on-screen Return Value / Exchange Value / Credit-or-Refund balance
//   shown while building the return (previously ~L568-659).
// Moved verbatim, including the proportional-discount formula documented as
// divergence #1 above and the finalBalance capping against
// `paidAmountOnSale` (also duplicated separately as
// `calculatePaidAmountOnSale` below — divergence #2).
// ─────────────────────────────────────────────────────────────────────────
export const calculateReturnTotals = (
  itemsToReturn: TransactionItem[],
  exchangeItems: ExchangeItem[],
  selectedSale: SalesData | null,
  salesSettings: any,
  availableItems: any[],
  activeTaxMode: 'inclusive' | 'exclusive' | 'exempt'
): ReturnTotals => {
  let returnGross = 0;
  let returnExclusiveTax = 0;
  let returnMrpTotal = 0;
  let returnTaxAmount = 0; // <-- Added to track total return tax

  itemsToReturn.forEach(returnItem => {
    returnGross += returnItem.amount;

    const baseReturnPrice = returnItem.mrp > 0 ? returnItem.mrp : returnItem.unitPrice;
    returnMrpTotal += baseReturnPrice * returnItem.quantity;

    const origItem = selectedSale?.items.find(i => (i.id || (i as any).productId) === returnItem.originalItemId);
    if (origItem) {
      const extendedItem = origItem as any;
      const taxType = extendedItem.taxType || 'none';
      const taxRate = Number(extendedItem.taxRate || extendedItem.tax || 0);

      if (taxType === 'inclusive' && taxRate > 0) {
        const base = returnItem.amount / (1 + (taxRate / 100));
        returnTaxAmount += (returnItem.amount - base);
      } else if (taxType === 'exclusive' && taxRate > 0) {
        const tax = returnItem.amount * (taxRate / 100);
        returnTaxAmount += tax;
        returnExclusiveTax += tax;
      }
    }
  });

  let exchangeGross = 0;
  let exchangeExclusiveTax = 0;
  let exchangeMrpTotal = 0;
  let exchangeTaxAmount = 0; // <-- Added to track total exchange tax

  const gstScheme = salesSettings?.gstScheme || 'none';
  const isTaxEnabled = salesSettings?.enableTax ?? true;
  const effectiveTaxMode = (gstScheme === 'regular' && isTaxEnabled) ? activeTaxMode : 'none';

  exchangeItems.forEach(exchangeItem => {
    exchangeGross += exchangeItem.amount;

    const baseExchangePrice = exchangeItem.mrp > 0 ? exchangeItem.mrp : (exchangeItem.salesPrice || 0);
    exchangeMrpTotal += baseExchangePrice * exchangeItem.quantity;

    const itemMaster = availableItems.find(i => i.id === exchangeItem.originalItemId);
    const itemTaxRate = (itemMaster?.tax !== undefined) ? Number(itemMaster.tax) : (salesSettings?.defaultTaxRate ?? 0);

    if (effectiveTaxMode === 'inclusive' && itemTaxRate > 0) {
      const base = exchangeItem.amount / (1 + (itemTaxRate / 100));
      exchangeTaxAmount += (exchangeItem.amount - base);
    } else if (effectiveTaxMode === 'exclusive' && itemTaxRate > 0) {
      const tax = exchangeItem.amount * (itemTaxRate / 100);
      exchangeTaxAmount += tax;
      exchangeExclusiveTax += tax;
    }
  });

  let discountDeducted = 0;

  if (selectedSale) {
    const originalInvoiceTotal = selectedSale.items.reduce((sum, item: any) => sum + (Number(item.finalPrice || 0)), 0);
    const originalManualDiscount = Number(selectedSale.manualDiscount) || 0;
    if (originalInvoiceTotal > 0 && originalManualDiscount > 0) {
      const ratio = (returnGross + returnExclusiveTax) / originalInvoiceTotal;
      if (originalManualDiscount > 0) {
        discountDeducted = Math.round(originalManualDiscount * ratio * 100) / 100;
      }
    }
  }

  const totalReturnValue = returnGross + returnExclusiveTax;
  const totalExchangeVal = exchangeGross + exchangeExclusiveTax;
  const finalBalance = totalReturnValue - totalExchangeVal;

  const paidAmountOnSale = Object.entries(selectedSale?.paymentMethods || {})
    .filter(([key]) => key !== 'due')
    .reduce((sum, [, val]) => sum + (Number(val) || 0), 0);

  const cappedFinalBalance = finalBalance > 0
    ? Math.min(finalBalance, paidAmountOnSale)
    : finalBalance;

  return {
    totalReturnGross: returnGross,
    totalReturnValue,
    totalExchangeValue: totalExchangeVal,
    finalBalance: Math.round(cappedFinalBalance),
    discountDeducted,
    totalMrp: Math.abs(exchangeMrpTotal - returnMrpTotal),
    totalTax: Math.abs(exchangeTaxAmount - returnTaxAmount) // <-- Export the absolute tax difference
  };
};

// ─────────────────────────────────────────────────────────────────────────
// #2 — PAID-AMOUNT-ON-SALE (standalone)
// Called from: SalesReturn.tsx's own
//   `const paidAmountOnSale = useMemo(() => {...}, [selectedSale])`
//   (previously ~L930-935), which feeds the "Paid Amount" summary line and
//   the `isDueSale` gate (blocks Credit Note/Cash Refund on a sale that was
//   never actually paid).
// Moved verbatim. See divergence #2 above — this is a literal duplicate of
// the `paidAmountOnSale` computed inline inside calculateReturnTotals, kept
// as its own separate function/call site rather than merged.
// ─────────────────────────────────────────────────────────────────────────
export const calculatePaidAmountOnSale = (selectedSale: SalesData | null): number => {
  const methods = selectedSale?.paymentMethods || {};
  return Object.entries(methods)
    .filter(([key]) => key !== 'due')
    .reduce((sum, [, val]) => sum + (Number(val) || 0), 0);
};

export interface ExchangeLineTax {
  lineBase: number;
  lineTax: number;
}

// ─────────────────────────────────────────────────────────────────────────
// #3 — SAVE-TIME TAX SPLIT FOR A NEWLY-ADDED EXCHANGE ITEM
// Called from: SalesReturn.tsx `saveReturnTransaction`, inside the
// "3. HANDLE STOCK (EXCHANGE)" `exchangeItems.forEach` block, only on the
// branch where the exchanged item did NOT already exist on the original
// sale (previously ~L737-753) — used to build the taxableAmount/taxAmount
// recorded for that brand-new line item.
// Moved verbatim (structurally the same inclusive/exclusive split as
// calculateReturnTotals and calculateFinalizedReturnItems below, but NOT
// merged with either — see the "don't consolidate" policy note above).
// ─────────────────────────────────────────────────────────────────────────
export const calculateExchangeLineTax = (
  lineTotal: number,
  itemTaxRate: number,
  effectiveTaxMode: string
): ExchangeLineTax => {
  let lineBase = 0;
  let lineTax = 0;

  if (effectiveTaxMode !== 'none' && itemTaxRate > 0) {
    if (effectiveTaxMode === 'inclusive') {
      lineBase = toCurrency(lineTotal / (1 + (itemTaxRate / 100)));
      lineTax = toCurrency(lineTotal - lineBase);
    } else {
      lineBase = lineTotal;
      lineTax = toCurrency(lineTotal * (itemTaxRate / 100));
    }
  } else {
    lineBase = lineTotal;
    lineTax = 0;
  }

  return { lineBase, lineTax };
};

// ─────────────────────────────────────────────────────────────────────────
// #4 — SAVE-TIME FULL LINE-ITEM RECOMPUTE
// Called from: SalesReturn.tsx `saveReturnTransaction`, as the
// `newItemsList` map over `Array.from(originalItemsMap.values())`
// (previously ~L789-823, comment: "4. RECALCULATE BILL TOTALS (Fixed Tax
// Recalculation for returns)") — rebuilds every remaining/added line's
// taxableAmount/taxAmount/finalPrice for the updated sale document written
// back to Firestore.
// Moved verbatim. Pure function — the surrounding `originalItemsMap`
// mutation (stock deltas, `batch.update` calls) stays inline in
// SalesReturn.tsx since that part is not pure (see file-header note above).
// ─────────────────────────────────────────────────────────────────────────
export const calculateFinalizedReturnItems = (
  originalItems: any[],
  effectiveTaxMode: string
): any[] => {
  return originalItems.map((item: any) => {
    const lineQty = Number(item.quantity);
    const lineUnit = Number(item._effectiveUnitPrice);
    const lineTotal = lineQty * lineUnit;

    const taxRate = Number(item.taxRate || item.tax || 0);
    const activeTaxType = item.taxType || effectiveTaxMode;

    let lineTaxableAmount = 0;
    let lineTaxAmount = 0;
    let lineFinalPrice = 0;

    if (activeTaxType === 'inclusive' && taxRate > 0) {
      lineFinalPrice = lineTotal;
      lineTaxableAmount = toCurrency(lineTotal / (1 + (taxRate / 100)));
      lineTaxAmount = toCurrency(lineTotal - lineTaxableAmount);
    } else if (activeTaxType === 'exclusive' && taxRate > 0) {
      lineTaxableAmount = lineTotal;
      lineTaxAmount = toCurrency(lineTotal * (taxRate / 100));
      lineFinalPrice = toCurrency(lineTaxableAmount + lineTaxAmount);
    } else {
      lineTaxableAmount = lineTotal;
      lineTaxAmount = 0;
      lineFinalPrice = lineTotal;
    }

    const { _effectiveUnitPrice, ...cleanItem } = item;

    cleanItem.effectiveUnitPrice = lineUnit;
    cleanItem.taxableAmount = lineTaxableAmount;
    cleanItem.taxAmount = lineTaxAmount;
    cleanItem.finalPrice = lineFinalPrice;

    return cleanItem;
  });
};

export interface FinalizedReturnTotals {
  subtotal: number;
  taxableAmount: number;
  taxAmount: number;
  finalTotal: number;
}

// ─────────────────────────────────────────────────────────────────────────
// #5 — SAVE-TIME BILL TOTALS ROLLUP
// Called from: SalesReturn.tsx `saveReturnTransaction`, immediately after
// building `newItemsList` (previously ~L825-831), as the `updatedTotals`
// reduce that feeds the updated `subtotal`/`taxableAmount`/`taxAmount`/
// `totalAmount` written back to the sale document.
// Moved verbatim. Deliberately kept as its own function rather than folded
// into calculateFinalizedReturnItems above, mirroring how SalesReturn.tsx
// itself kept the map and the reduce as two separate steps.
// ─────────────────────────────────────────────────────────────────────────
export const sumFinalizedReturnTotals = (newItemsList: any[]): FinalizedReturnTotals => {
  return newItemsList.reduce((acc, item) => {
    acc.subtotal += (Number(item.mrp) || 0) * (Number(item.quantity) || 0);
    acc.taxableAmount += (Number(item.taxableAmount) || 0);
    acc.taxAmount += (Number(item.taxAmount) || 0);
    acc.finalTotal += (Number(item.finalPrice) || 0);
    return acc;
  }, { subtotal: 0, taxableAmount: 0, taxAmount: 0, finalTotal: 0 });
};

// ─────────────────────────────────────────────────────────────────────────
// #6 — SAVE-TIME PROPORTIONAL DISCOUNT DEDUCTION
// Called from: SalesReturn.tsx `saveReturnTransaction` (previously
// ~L833-839) — computes how much of the original manual/bill discount to
// claw back proportional to what was actually returned, before adding any
// new discount entered on the PaymentDrawer.
// Moved verbatim. See divergence #1 above — this uses a DIFFERENT ratio
// base (`returnedItemsGrossValue`, built from the original sale's own
// `_effectiveUnitPrice`) than calculateReturnTotals's live-UI
// `discountDeducted` (which uses the return item's own `.amount` snapshot
// plus exclusive tax). Do not reconcile the two.
// ─────────────────────────────────────────────────────────────────────────
export const calculateSaveTimeDiscountDeduction = (
  originalManualDiscount: number,
  originalInvoiceTotal: number,
  returnedItemsGrossValue: number
): number => {
  let discountDeductionAmount = 0;
  if (originalManualDiscount > 0 && originalInvoiceTotal > 0 && returnedItemsGrossValue > 0) {
    const ratio = returnedItemsGrossValue / originalInvoiceTotal;
    discountDeductionAmount = originalManualDiscount * ratio;
  }
  return Math.round(discountDeductionAmount * 100) / 100;
};
