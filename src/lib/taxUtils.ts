/**
 * Pure tax calculation utilities — no Firebase, no DOM, safe to unit-test.
 */

export type TaxType = 'INCLUSIVE' | 'EXCLUSIVE' | 'NONE';

export interface LineTax {
  /** Pre-tax base amount */
  taxableValue: number;
  /** Total tax amount (CGST + SGST combined) */
  taxAmount: number;
  /** Amount the buyer actually pays (taxable + tax for exclusive; same as lineTotal for inclusive) */
  netAmount: number;
}

/**
 * Calculates the tax breakdown for a single line item.
 *
 * @param lineTotal  - The pre-discount subtotal for the line (mrp × qty - discount).
 * @param taxRate    - GST percentage (e.g. 18 for 18%).
 * @param taxType    - 'EXCLUSIVE' | 'INCLUSIVE' | 'NONE'.
 */
export function calcLineTax(
  lineTotal: number,
  taxRate: number,
  taxType: TaxType
): LineTax {
  if (taxRate <= 0 || taxType === 'NONE') {
    return { taxableValue: lineTotal, taxAmount: 0, netAmount: lineTotal };
  }

  if (taxType === 'EXCLUSIVE') {
    const taxAmount = lineTotal * (taxRate / 100);
    return {
      taxableValue: lineTotal,
      taxAmount,
      netAmount: lineTotal + taxAmount,
    };
  }

  // INCLUSIVE — price already contains tax
  const taxableValue = lineTotal / (1 + taxRate / 100);
  const taxAmount = lineTotal - taxableValue;
  return {
    taxableValue,
    taxAmount,
    netAmount: lineTotal,
  };
}

/**
 * Applies standard rounding to a final payable amount.
 * When `isRoundingEnabled` is false the original amount is returned unchanged.
 *
 * @param amount              - The pre-rounding total.
 * @param isRoundingEnabled   - Feature flag from sales settings.
 * @param interval            - Rounding granularity (default: round to nearest integer).
 */
export function applyRounding(
  amount: number,
  isRoundingEnabled: boolean,
  interval = 1
): number {
  if (!isRoundingEnabled) return amount;
  return Math.round(amount / interval) * interval;
}
