import type { TransactionItem, ExchangeItem } from './ordersReturn.types';
import { computeOrderTotals, isOrderTaxEnabled as isOrderTaxEnabledShared, resolveUnitPrice, type OrderTotals } from '../Orders/orders.calculations';
import { calculateLineTax } from '../../shared/calculations/itemCalculations';
import { splitReturnBalance } from '../../shared/calculations/returnBalance';

// ─────────────────────────────────────────────────────────────────────────
// Return / exchange maths for catalogue orders.
//
// Works the same way as Sales return (salesReturn.calculations.ts), on the
// order's own per-line tax model:
//  - each returned / exchanged line is valued at its unit price × qty, and GST
//    is added on top for Exclusive lines (Inclusive lines already contain it);
//  - the order's bill discount is taken back in proportion to the returned
//    value (GST included on both sides of the ratio);
//  - the remaining + exchanged lines are re-taxed and re-totalled with the
//    exact formula the order editor uses (computeOrderTotals), so the saved
//    order, its tax fields and the refund always agree.
//
// The balance is the change in the order total (before − after). Order totals
// are rounded to the rupee, so any rounding shows up as its own "round off".
//
// computeOrderReturn is the single source for both the live summary on the
// return screen and the values written on save — they can't drift apart.
// ─────────────────────────────────────────────────────────────────────────

type AnyLine = Record<string, any>;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** The unit price the order total is built from (orders.calculations' resolveUnitPrice). */
const unitOf = (line: AnyLine): number => resolveUnitPrice(line as Parameters<typeof resolveUnitPrice>[0]);
const taxRateOf = (line: AnyLine) => Number(line.tax ?? line.taxRate ?? 0) || 0;

/** Whether this order was billed with GST — shared with the tax report (orders.calculations). */
export const isOrderTaxEnabled = (order: AnyLine | null | undefined): boolean => isOrderTaxEnabledShared(order);

/**
 * What the customer has actually paid on this order. `paidAmount` is kept by the
 * payment drawer and by earlier returns; orders that never had it fall back to the
 * payment entries. A missing `paymentMethods.due` does NOT mean paid — orders placed
 * from the shared catalogue have no payment entries at all until one is recorded.
 */
export const orderPaidSoFar = (order: AnyLine | null | undefined): number => {
  if (!order) return 0;
  if (order.paidAmount !== undefined && order.paidAmount !== null && Number.isFinite(Number(order.paidAmount))) {
    return Math.max(0, Number(order.paidAmount));
  }
  return Math.max(0, Object.entries(order.paymentMethods || {})
    .filter(([k]) => k.toLowerCase() !== 'due')
    .reduce((sum, [, v]) => sum + (Number(v) || 0), 0));
};

/** Tax type new (exchange) lines get: the same as the order's existing lines. */
export const orderLineTaxType = (order: AnyLine | null | undefined): string => {
  const fromLine = (order?.items || []).find((i: AnyLine) => i?.taxType)?.taxType;
  if (fromLine) return String(fromLine);
  return String(order?.taxType || '').toLowerCase() === 'exclusive' ? 'Exclusive' : 'Inclusive';
};

/** One order line at `qty`, split into taxable value / GST / line total. */
export const splitOrderLine = (line: AnyLine, qty: number, taxEnabled: boolean) =>
  calculateLineTax(unitOf(line) * qty, line.taxType, taxRateOf(line), taxEnabled);

// ─── Original order line → row in "items to return" ────────────────────
// Unit price is the one the order total is built from (resolveUnitPrice) —
// before GST for Exclusive lines; the summary adds that GST on top.
export const mapOrderItemToTransactionItem = (
  item: any
): (TransactionItem & { originalItemId: string; originalQuantity: number }) | null => {
  const id = item.id;
  if (!id) return null;
  const qty = Number(item.quantity) || 0;
  const unit = unitOf(item);

  return {
    id,
    originalItemId: id,
    name: item.name ?? 'Unnamed Item',
    quantity: qty,
    originalQuantity: qty,
    unitPrice: unit,
    amount: round2(unit * qty),
    mrp: Number(item.mrp) || unit
  };
};

// ─── handleListChange 'discount' field branch ──────────────────────────
// Applies the "round to nearest ₹5 below ₹100, else nearest ₹10" bucketing
// that only this return/exchange screen uses — not present anywhere in Orders.
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
// Caller is still responsible for the `isNaN(num)` guard and for clearing
// `customPrice` on the item afterward — this only does the numeric derivation.
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
// Priority order: salesPrice wins over presetDiscount if both are present.
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
// Runs when an item's master data (mrp/salesPrice) is edited mid-return via
// the item drawer, to keep any already-added exchange line in sync.
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

// ─── The return / exchange itself ───────────────────────────────────────

export interface OrderReturnResult {
  /** Returned lines at their unit price × qty — what the rows show. */
  totalReturnGross: number;
  /** GST on the returned lines (for Inclusive lines it's already inside the gross). */
  returnTax: number;
  /** GST added on top of the gross (Exclusive lines only). */
  returnExclusiveTax: number;
  /** Gross + GST added on top: what the returned items were billed at. */
  totalReturnValue: number;
  /** Share of the order's bill discount that goes back with the returned items. */
  discountDeducted: number;
  /** New (exchange) items including their GST. */
  totalExchangeValue: number;
  exchangeTax: number;
  /** Rounding of the order total to the rupee, folded into the balance. */
  roundOff: number;
  /** How much the order total went down (> 0) or up (< 0, the customer pays). */
  finalBalance: number;
  /**
   * Part of a positive balance that can go back as credit note / cash refund: only
   * money the customer has actually paid beyond the new total. 0 on an unpaid order.
   */
  refundable: number;
  /** Rest of a positive balance: it only lowers what the customer still owes. */
  dueReduction: number;
  /** The order's lines after the return, re-taxed. */
  newItems: AnyLine[];
  newManualDiscount: number;
  before: OrderTotals;
  after: OrderTotals;
}

export const computeOrderReturn = (
  order: AnyLine | null,
  itemsToReturn: TransactionItem[],
  exchangeItems: ExchangeItem[],
  modeOfReturn: string,
  availableItems: AnyLine[],
  /** Paid so far (orderPaidSoFar). Defaults to the order's own record. */
  paidSoFar: number = orderPaidSoFar(order)
): OrderReturnResult => {
  const taxEnabled = isOrderTaxEnabled(order);
  const originalLines: AnyLine[] = order?.items || [];
  const expenses = order?.expenses || [];
  const manualDiscount = Number(order?.manualDiscount) || 0;
  const isExchange = modeOfReturn === 'Exchange';

  // 1. Returned lines
  const lines = new Map<string, AnyLine>(originalLines.map((l) => [String(l.id), { ...l }]));
  let totalReturnGross = 0;
  let returnTax = 0;
  let returnValue = 0;
  itemsToReturn.forEach((r) => {
    const line = lines.get(String(r.originalItemId));
    if (!line) return;
    const qty = Math.min(Number(r.quantity) || 0, Number(line.quantity) || 0);
    if (qty <= 0) return;
    const split = splitOrderLine(line, qty, taxEnabled);
    totalReturnGross += unitOf(line) * qty;
    returnTax += split.taxAmount;
    returnValue += split.finalPrice;
    line.quantity = Number(line.quantity) - qty;
    if (line.quantity <= 0) lines.delete(String(r.originalItemId));
  });

  // 2. Exchange lines, taxed the way the order's own lines are
  const exchangeTaxType = orderLineTaxType(order);
  const added: AnyLine[] = [];
  let totalExchangeValue = 0;
  let exchangeTax = 0;
  if (isExchange) {
    exchangeItems.forEach((x) => {
      const qty = Number(x.quantity) || 0;
      if (qty <= 0) return;
      const unit = Number(x.unitPrice) || (qty > 0 ? Number(x.amount) / qty : 0) || 0;
      const master = availableItems.find((i) => String(i.id) === String(x.originalItemId));
      const rate = Number(master?.tax ?? master?.taxRate ?? 0) || 0;
      const split = calculateLineTax(unit * qty, exchangeTaxType, rate, taxEnabled);
      totalExchangeValue += split.finalPrice;
      exchangeTax += split.taxAmount;

      // Same item at the same price → just more of that line; otherwise its own line
      const existing = [...lines.values(), ...added].find((l) =>
        String(l.itemId || l.id) === String(x.originalItemId) && !l.tierId &&
        Math.abs(unitOf(l) - unit) < 0.005 &&
        Math.abs(taxRateOf(l) - rate) < 0.001
      );
      if (existing) {
        existing.quantity = Number(existing.quantity) + qty;
        return;
      }
      added.push({
        id: x.id,
        itemId: x.originalItemId,
        name: x.name,
        quantity: qty,
        mrp: Number(x.mrp) || 0,
        salesPrice: unit,
        effectiveUnitPrice: unit,
        customPrice: unit,
        unitPrice: unit,
        discount: Number(x.discount) || 0,
        discount2: 0,
        tax: rate,
        taxRate: rate,
        taxType: exchangeTaxType,
        itemGroupId: master?.itemGroupId || '',
        unit: master?.unit || 'pcs',
        unitMultiplier: 1,
        note: '',
        imageUrl: master?.imageUrl || '',
      });
    });
  }

  // 3. Re-tax every remaining / new line (same split the order editor uses)
  const newItems = [...lines.values(), ...added].map((l) => {
    const qty = Number(l.quantity) || 0;
    const split = splitOrderLine(l, qty, taxEnabled);
    return {
      ...l,
      quantity: qty,
      effectiveUnitPrice: round2(unitOf(l)),
      taxableAmount: round2(split.taxableAmount),
      taxAmount: round2(split.taxAmount),
      finalPrice: round2(split.finalPrice),
    };
  });

  // 4. Bill discount goes back in proportion to what was returned
  const before = computeOrderTotals(originalLines as any, expenses, manualDiscount, taxEnabled);
  const itemsTotalBefore = before.itemsBase + before.tax;
  const discountDeducted = manualDiscount > 0 && itemsTotalBefore > 0 && returnValue > 0
    ? round2(Math.min(manualDiscount, manualDiscount * (returnValue / itemsTotalBefore)))
    : 0;
  const newManualDiscount = round2(Math.max(0, manualDiscount - discountDeducted));
  const after = computeOrderTotals(newItems as any, expenses, newManualDiscount, taxEnabled);

  // 5. Balance = how much the order total went down (up, for a bigger exchange)
  const finalBalance = round2(before.total - after.total);
  const unrounded = returnValue - discountDeducted - totalExchangeValue;

  // 6. Money only goes back if it was paid: the balance first clears what's still owed,
  //    and only what was paid beyond the new total can be a credit note / refund.
  const { refundable, dueReduction } = splitReturnBalance(finalBalance, paidSoFar, after.total);
  const returnExclusiveTax = round2(returnValue - totalReturnGross);

  return {
    totalReturnGross: round2(totalReturnGross),
    returnTax: round2(returnTax),
    returnExclusiveTax: returnExclusiveTax > 0 ? returnExclusiveTax : 0,
    totalReturnValue: round2(returnValue),
    discountDeducted,
    totalExchangeValue: round2(totalExchangeValue),
    exchangeTax: round2(exchangeTax),
    roundOff: round2(finalBalance - unrounded),
    finalBalance,
    refundable,
    dueReduction,
    newItems,
    newManualDiscount,
    before,
    after,
  };
};

export interface PostReturnPaymentStatus {
  isUnpaidOrder: boolean;
  newPaymentAmount: number;
  effectivePaid: number;
  effectiveDue: number;
  newStatus: 'Paid' | 'Completed';
}

// ─── saveReturnTransaction: post-return payment/status clamp ───────────
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
