import { useMemo } from 'react';
import { applyRounding, toCurrency } from '../SalesComponents/Salescalculations';
import type { SalesItem } from '../SalesComponents/Salestypes';

interface UseSalesTotalsOptions {
    items: SalesItem[];
    salesSettings: any;
    activeTaxMode: 'inclusive' | 'exclusive' | 'exempt';
}

export const useSalesTotals = ({
    items,
    salesSettings,
    activeTaxMode,
}: UseSalesTotalsOptions) => {
    return useMemo(() => {
        let accSubtotal = 0;
        let accTaxable = 0;
        let accTax = 0;
        let accQuantity = 0;

        const taxRate = salesSettings?.defaultTaxRate ?? 0;
        const isRoundingEnabled = salesSettings?.enableRounding ?? true;
        const roundingInterval = salesSettings?.roundingInterval ?? 1;
        const gstScheme = salesSettings?.gstScheme?.toLowerCase();

        // Determine effective tax mode
        const effectiveTaxMode =
            gstScheme === 'regular' && activeTaxMode !== 'exempt'
                ? activeTaxMode
                : 'none';

        items.forEach(cartItem => {
            const qty = cartItem.quantity || 1;
            accQuantity += qty;

            const itemTaxRate =
                cartItem.tax !== undefined ? Number(cartItem.tax) : taxRate;

            // Subtotal: MRP-based, strip tax if inclusive
            let baseForSubtotal =
                cartItem.mrp && cartItem.mrp > 0
                    ? cartItem.mrp
                    : cartItem.salesPrice || 0;

            if (effectiveTaxMode === 'inclusive' && itemTaxRate > 0) {
                baseForSubtotal = baseForSubtotal / (1 + itemTaxRate / 100);
            }
            accSubtotal += baseForSubtotal * qty;

            // Effective unit price (custom or discount-derived)
            const baseForDiscount =
                cartItem.mrp && cartItem.mrp > 0
                    ? cartItem.mrp
                    : cartItem.salesPrice || 0;

            let effectiveUnitPrice =
                cartItem.customPrice !== undefined &&
                cartItem.customPrice !== null &&
                cartItem.customPrice !== ''
                    ? parseFloat(String(cartItem.customPrice))
                    : baseForDiscount * (1 - (cartItem.discount || 0) / 100);

            effectiveUnitPrice = applyRounding(
                effectiveUnitPrice,
                isRoundingEnabled,
                roundingInterval
            );

            const lineTotal = toCurrency(effectiveUnitPrice * qty);

            // Tax split
            let lineBase = 0;
            let lineTax = 0;

            if (effectiveTaxMode !== 'none' && itemTaxRate > 0) {
                if (effectiveTaxMode === 'inclusive') {
                    lineBase = toCurrency(lineTotal / (1 + itemTaxRate / 100));
                    lineTax = toCurrency(lineTotal - lineBase);
                } else {
                    lineBase = lineTotal;
                    lineTax = toCurrency(lineTotal * (itemTaxRate / 100));
                }
            } else {
                lineBase = lineTotal;
            }

            accTaxable += lineBase;
            accTax += lineTax;
        });

        const finalTaxable = toCurrency(accTaxable);
        const finalTax = toCurrency(accTax);
        const rawFinal = toCurrency(finalTaxable + finalTax);

        const totalDiscount = toCurrency(
            effectiveTaxMode === 'none'
                ? accSubtotal - rawFinal
                : accSubtotal - finalTaxable
        );

        const finalAmount = Math.round(rawFinal);
        const roundOff = toCurrency(finalAmount - rawFinal);

        return {
            subtotal: accSubtotal,
            totalDiscount: totalDiscount > 0 ? totalDiscount : 0,
            roundOff,
            taxableAmount: finalTaxable,
            taxAmount: finalTax,
            finalAmount,
            totalQuantity: accQuantity,
        };
    }, [items, salesSettings, activeTaxMode]);
};