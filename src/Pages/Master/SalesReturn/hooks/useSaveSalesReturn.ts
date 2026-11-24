import { useState, useEffect, useMemo } from 'react';
import {
    doc,
    getDoc,
    writeBatch,
    increment as firebaseIncrement,
    arrayUnion,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../../lib/Firebase';
import { clearSalesReportCache } from '../../../Reports/SalesReportComponents/salesReportCache';
import { ROUTES } from '../../../../constants/routes.constants';
import { State } from '../../../../enums';
import type { PaymentCompletionData } from '../../../../Components/PaymentDrawer';
import {
    calculateReturnTotals,
    calculatePaidAmountOnSale,
    calculateExchangeLineTax,
    calculateFinalizedReturnItems,
    sumFinalizedReturnTotals,
    calculateSaveTimeDiscountDeduction,
} from '../salesReturn.calculations';
import { isBillUnpaid, splitReturnBalance } from '../../../../shared/calculations/returnBalance';
import type { SalesData, TransactionItem, ExchangeItem } from '../salesReturn.types';
import type { Item } from '../../../../constants/models';
import { addOnStockToRestore } from '../../../../constants/models';
import { calcReturnReversal, readSaleLoyalty, writeLoyaltyInBatch } from '../../../../lib/loyalty';

interface UseSaveSalesReturnParams {
    currentUser: any;
    navigate: (path: string) => void;
    salesSettings: any;
    selectedSale: SalesData | null;
    itemsToReturn: TransactionItem[];
    exchangeItems: ExchangeItem[];
    availableItems: Item[];
    partyName: string;
    partyNumber: string;
    setModal: (modal: { message: string; type: State } | null) => void;
    setIsLoading: (loading: boolean) => void;
}

// Owns the return/exchange totals calculation and the save transaction —
// moved verbatim from SalesReturn.tsx: activeTaxMode state + its
// salesSettings-driven init effect, the totals useMemo
// (calculateReturnTotals), paidAmountOnSale/isDueSale, modeOfReturn/
// returnDate/isDrawerOpen state, saveReturnTransaction (the money-critical
// Firestore batch: stock adjustment, tax/discount recompute, credit
// balance update), handleProcessReturn, and getBalanceLabel.
export const useSaveSalesReturn = ({
    currentUser,
    navigate,
    salesSettings,
    selectedSale,
    itemsToReturn,
    exchangeItems,
    availableItems,
    partyName,
    partyNumber,
    setModal,
    setIsLoading,
}: UseSaveSalesReturnParams) => {
    const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [modeOfReturn, setModeOfReturn] = useState<string>('Credit Note');
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [activeTaxMode, setActiveTaxMode] = useState<'inclusive' | 'exclusive' | 'exempt'>('exclusive');
    // Set after a successful return — drives the "Return completed + Send on WhatsApp" popup
    const [returnSuccess, setReturnSuccess] = useState<{
        invoice: any;
        creditUpdated: boolean;
        creditAdded: number;
        newCreditBalance: number;
    } | null>(null);

    useEffect(() => {
        if (salesSettings) {
            if (salesSettings.gstScheme === 'none' || salesSettings.gstScheme === 'composition') {
                setActiveTaxMode('exempt');
            } else {
                setActiveTaxMode((salesSettings.taxType as any) || 'exclusive');
            }
        }
    }, [salesSettings]);

    const { totalReturnGross, totalReturnValue, totalExchangeValue, finalBalance, discountDeducted, totalMrp, totalTax } = useMemo(
        () => calculateReturnTotals(itemsToReturn, exchangeItems, selectedSale, salesSettings, availableItems, activeTaxMode),
        [itemsToReturn, exchangeItems, selectedSale, salesSettings, availableItems, activeTaxMode]
    );

    const paidAmountOnSale = useMemo(() => calculatePaidAmountOnSale(selectedSale), [selectedSale]);
    // The bill's total (route-state sales can arrive without totalAmount — rebuild it from the lines)
    const billTotal = useMemo(() => {
        if (!selectedSale) return 0;
        const saved = Number(selectedSale.totalAmount);
        if (Number.isFinite(saved) && saved > 0) return saved;
        const lines = (selectedSale.items || []).reduce((s, i: any) => s + (Number(i.finalPrice) || 0), 0);
        return Math.max(0, lines - (Number(selectedSale.manualDiscount) || 0));
    }, [selectedSale]);
    // Unpaid = nothing actually paid (was: "has a stored due" — missed bills without one)
    const isDueSale = !!selectedSale && isBillUnpaid(paidAmountOnSale, billTotal);
    // Money goes back only if it was paid: the balance first lowers what's still owed
    const { refundable, dueReduction } = splitReturnBalance(finalBalance, paidAmountOnSale, billTotal - finalBalance);

    useEffect(() => {
        if (isDueSale) {
            setModeOfReturn('Exchange');
        }
    }, [isDueSale]);

    const saveReturnTransaction = async (
        completionData?: Partial<PaymentCompletionData>,
        exchangeBalanceAction?: 'Credit Note' | 'Cash Refund'
    ) => {
        if (!currentUser || !currentUser.companyId || !selectedSale) return;

        const finalPartyName = (completionData?.partyName || partyName || selectedSale.partyName || '').trim();
        const finalPartyNumber = (completionData?.partyNumber || partyNumber || selectedSale.partyNumber || '').trim();

        // Only the paid-back part (refundable) becomes a credit note / cash refund
        const shouldAddCredit = refundable > 0 &&
            (modeOfReturn === 'Credit Note' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Credit Note'));
        const shouldRefundCash = refundable > 0 &&
            (modeOfReturn === 'Cash Refund' || modeOfReturn === 'Refund' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Cash Refund'));

        if (shouldAddCredit && finalPartyNumber.length < 3) {
            return setModal({ type: State.ERROR, message: 'A valid Customer Number is required to issue a Credit Note.' });
        }

        setIsLoading(true);
        const companyId = currentUser.companyId;

        try {
            const batch = writeBatch(db);
            const saleRef = doc(db, 'companies', companyId, 'sales', selectedSale.id);

            // Loyalty: read the saved bill (selectedSale can come from route state
            // without its loyalty block or totalAmount).
            const savedSaleSnap = await getDoc(saleRef);
            const savedSale: any = savedSaleSnap.exists() ? savedSaleSnap.data() : {};
            const saleLoyalty = readSaleLoyalty(savedSale);
            const totalBeforeReturn = Number(savedSale.totalAmount) || 0;

            const originalItemsMap = new Map(selectedSale.items.map((item: any) => {
                const safeId = item.id || item.productId || 'UNKNOWN_ID';
                const oldQty = Number(item.quantity) || 1;

                let effectiveUnit = 0;
                if (item.effectiveUnitPrice !== undefined) {
                    effectiveUnit = Number(item.effectiveUnitPrice);
                } else {
                    const oldTotal = Number(item.finalPrice || item.amount || 0);
                    effectiveUnit = oldQty > 0 ? (oldTotal / oldQty) : 0;
                }

                return [safeId, { ...item, _effectiveUnitPrice: effectiveUnit }];
            }));

            const originalInvoiceTotal = selectedSale.items.reduce((sum, item) => sum + (Number(item.finalPrice || 0)), 0);
            const validInventoryIds = new Set(availableItems.map(i => i.id));

            const gstScheme = salesSettings?.gstScheme || 'none';
            const isTaxEnabled = salesSettings?.enableTax ?? true;
            const currentTaxRate = salesSettings?.defaultTaxRate ?? 0;

            let effectiveTaxMode = 'none';
            if (gstScheme === 'regular' && isTaxEnabled) {
                effectiveTaxMode = activeTaxMode;
            }

            // 2. HANDLE STOCK (RETURN)
            let returnedItemsGrossValue = 0;
            // Linked add-on items (e.g. Coke sold with a burger) that go back to stock, summed per item
            const linkedRestore = new Map<string, number>();
            itemsToReturn.forEach(returnItem => {
                const originalItem = originalItemsMap.get(returnItem.originalItemId);
                if (originalItem) {
                    originalItem.quantity = Number(originalItem.quantity) - Number(returnItem.quantity);
                    returnedItemsGrossValue += (originalItem._effectiveUnitPrice * returnItem.quantity);
                    if (originalItem.quantity <= 0) originalItemsMap.delete(returnItem.originalItemId);
                }
                if (returnItem.originalItemId && validInventoryIds.has(returnItem.originalItemId)) {
                    batch.update(doc(db, 'companies', companyId, 'items', returnItem.originalItemId), {
                        stock: firebaseIncrement(returnItem.quantity),
                        updatedAt: serverTimestamp()
                    });
                }

                // Same bill line (from the untouched original bill) tells which linked items it took
                const billLine = selectedSale.items.find((i: any) => (i.id || i.productId) === returnItem.originalItemId);
                if (billLine) {
                    addOnStockToRestore(billLine as any, Number(returnItem.quantity)).forEach((qty, itemId) =>
                        linkedRestore.set(itemId, (linkedRestore.get(itemId) || 0) + qty));
                }
            });

            linkedRestore.forEach((qty, itemId) => {
                if (validInventoryIds.has(itemId)) {
                    batch.update(doc(db, 'companies', companyId, 'items', itemId), {
                        stock: firebaseIncrement(qty),
                        updatedAt: serverTimestamp()
                    });
                }
            });

            // 3. HANDLE STOCK (EXCHANGE)
            exchangeItems.forEach(exchangeItem => {
                const existingItem = Array.from(originalItemsMap.values()).find(i => i.id === exchangeItem.originalItemId);
                // Only merge into the existing line if it's genuinely the same price — a
                // partial exchange (e.g. 1 of 3 units swapped for a different net price)
                // must NOT be folded into the remaining units' line, or the new price is
                // silently discarded and the whole quantity ends up billed at the old
                // rate. When the price differs, keep it as its own distinct line instead.
                const priceMatchesExisting = existingItem &&
                    Math.abs(Number(existingItem._effectiveUnitPrice ?? existingItem.unitPrice ?? 0) - Number(exchangeItem.unitPrice)) < 0.01;

                if (existingItem && priceMatchesExisting) {
                    existingItem.quantity = Number(existingItem.quantity) + Number(exchangeItem.quantity);
                } else {
                    const itemMaster = availableItems.find(i => i.id === exchangeItem.originalItemId);
                    const unitPrice = exchangeItem.unitPrice;
                    const lineTotal = unitPrice * exchangeItem.quantity;

                    const itemTaxRate = (itemMaster?.tax !== undefined) ? Number(itemMaster.tax) : currentTaxRate;
                    const { lineBase, lineTax } = calculateExchangeLineTax(lineTotal, itemTaxRate, effectiveTaxMode);

                    // Distinct map key when an existing (different-priced) line for this
                    // same product is already present, so this new-priced batch gets its
                    // own line instead of overwriting/merging into it.
                    const lineKey = existingItem
                        ? `${exchangeItem.originalItemId}::${exchangeItem.id}`
                        : exchangeItem.originalItemId;

                    originalItemsMap.set(lineKey, {
                        id: exchangeItem.originalItemId,
                        name: exchangeItem.name,
                        mrp: exchangeItem.mrp,
                        quantity: exchangeItem.quantity,
                        discount: exchangeItem.discount || 0,
                        discountPercentage: exchangeItem.discount || 0,
                        finalPrice: effectiveTaxMode === 'exclusive' ? lineBase + lineTax : lineTotal,
                        amount: lineTotal,
                        unitPrice: unitPrice,
                        purchasePrice: itemMaster?.purchasePrice || 0,
                        tax: itemMaster?.tax || 0,
                        taxRate: itemTaxRate,
                        taxAmount: lineTax,
                        taxableAmount: lineBase,
                        taxType: effectiveTaxMode,
                        itemGroupId: itemMaster?.itemGroupId || '',
                        stock: 0,
                        barcode: itemMaster?.barcode || '',
                        restockQuantity: 0,
                        isEditable: false,
                        _effectiveUnitPrice: unitPrice,
                        unitMultiplier: 1 // No multiplier math
                    } as any);
                }

                if (exchangeItem.originalItemId && validInventoryIds.has(exchangeItem.originalItemId)) {
                    batch.update(doc(db, 'companies', companyId, 'items', exchangeItem.originalItemId), {
                        stock: firebaseIncrement(-exchangeItem.quantity),
                        updatedAt: serverTimestamp()
                    });
                }
            });

            // 4. RECALCULATE BILL TOTALS (Fixed Tax Recalculation for returns)
            const newItemsList = calculateFinalizedReturnItems(Array.from(originalItemsMap.values()), effectiveTaxMode);

            const updatedTotals = sumFinalizedReturnTotals(newItemsList);

            const originalManualDiscount = Number(selectedSale.manualDiscount) || 0;
            const discountDeductionAmount = calculateSaveTimeDiscountDeduction(originalManualDiscount, originalInvoiceTotal, returnedItemsGrossValue);

            const newDrawerDiscount = Number(completionData?.discount) || 0;
            const newManualDiscount = Math.max(0, originalManualDiscount - discountDeductionAmount + newDrawerDiscount);

            const updatedFinalAmount = updatedTotals.finalTotal - newManualDiscount;
            const totalItemDiscount = updatedTotals.subtotal - updatedTotals.finalTotal;

            // 5. MERGE PAYMENTS & Deduct Cash Refund
            let updatedPaymentMethods: any = { ...(selectedSale.paymentMethods || {}) };
            if (completionData?.paymentDetails) {
                Object.entries(completionData.paymentDetails).forEach(([mode, amount]) => {
                    if (mode !== 'due') updatedPaymentMethods[mode] = (updatedPaymentMethods[mode] || 0) + Number(amount);
                });
            } else if (shouldRefundCash) {
                // Cash handed back comes out of what was paid in cash — only the paid-back
                // part; the rest of the balance just lowers the due (computed below).
                updatedPaymentMethods['cash'] = (updatedPaymentMethods['cash'] || 0) - refundable;
            }

            const totalPaidSoFar = Object.entries(updatedPaymentMethods)
                .filter(([k]) => k !== 'due')
                .reduce((sum, [_, val]) => sum + Number(val), 0);

            let dueAmount = updatedFinalAmount - totalPaidSoFar;
            if (dueAmount < 0.5) dueAmount = 0;
            updatedPaymentMethods.due = dueAmount;

            // 6. HISTORY & DB UPDATE
            const actualReturnMode = modeOfReturn === 'Exchange' && finalBalance > 0
                ? `Exchange & ${exchangeBalanceAction}`
                : modeOfReturn;

            const returnHistoryRecord = {
                id: crypto.randomUUID(),
                returnedAt: new Date(),
                returnedItems: itemsToReturn.map(i => ({ originalItemId: i.originalItemId, name: i.name, quantity: i.quantity, amount: i.amount })),
                exchangeItems: exchangeItems.map(i => ({ originalItemId: i.originalItemId, name: i.name, quantity: i.quantity, amount: i.amount })),
                finalBalance,
                // Of the balance: what went back as credit / refund, and what only lowered the due
                refunded: shouldAddCredit || shouldRefundCash ? refundable : 0,
                dueReduced: dueReduction,
                discountDeducted: discountDeductionAmount,
                newDiscountApplied: newDrawerDiscount,
                modeOfReturn: actualReturnMode,
                partyName: finalPartyName
            };

            const updateData: any = {
                partyName: finalPartyName,
                partyNumber: finalPartyNumber,
                items: newItemsList,
                returnedItemsSnapshot: arrayUnion(...itemsToReturn.map(i => ({
                    id: i.originalItemId,
                    name: i.name,
                    quantity: i.quantity,
                    finalPrice: i.amount,
                    mrp: i.mrp,
                }))),
                subtotal: updatedTotals.subtotal,
                taxableAmount: updatedTotals.taxableAmount,
                taxAmount: updatedTotals.taxAmount,
                discount: totalItemDiscount + newManualDiscount,
                manualDiscount: newManualDiscount,
                totalAmount: updatedFinalAmount,
                returnHistory: arrayUnion(returnHistoryRecord),
                paymentMethods: updatedPaymentMethods,
                isReturned: true,
                lastUpdated: serverTimestamp()
            };

            // Loyalty: take back earned points in proportion to how much the bill went down.
            // Points the customer USED are not given back on a return — the refund / credit
            // note above is worked out on the bill value, which already covers them.
            if (saleLoyalty && saleLoyalty.earned > 0) {
                const reduction = Math.max(0, totalBeforeReturn - updatedFinalAmount);
                const takeBack = calcReturnReversal(saleLoyalty.earned, reduction, totalBeforeReturn);
                if (takeBack > 0) {
                    writeLoyaltyInBatch(batch, db, companyId, saleLoyalty.phone, [{
                        type: 'reverse',
                        points: -takeBack,
                        refType: 'return',
                        refId: selectedSale.id,
                        invoiceNumber: savedSale.invoiceNumber || selectedSale.invoiceNumber,
                        note: `Items returned (₹${reduction.toFixed(2)})`,
                        extra: { reverses: 'earn' },
                    }], { actor: { uid: currentUser.uid, name: currentUser.name || '' } });
                    updateData.loyalty = { ...saleLoyalty, earned: saleLoyalty.earned - takeBack };
                }
            }

            batch.update(saleRef, updateData);

            if (finalPartyNumber.length >= 3) {
                const customerRef = doc(db, 'companies', companyId, 'customers', finalPartyNumber);
                const customerUpdateData: any = { name: finalPartyName, number: finalPartyNumber, companyId, lastUpdatedAt: serverTimestamp() };

                if (shouldAddCredit) {
                    customerUpdateData.creditBalance = firebaseIncrement(refundable);
                }
                batch.set(customerRef, customerUpdateData, { merge: true });
            }

            await batch.commit();
            clearSalesReportCache(companyId);

            // Re-read the updated bill + customer so the WhatsApp invoice/credit message use fresh numbers
            let updatedInvoice: any = null;
            let newCreditBalance = 0;
            try {
                const savedSnap = await getDoc(saleRef);
                const sd: any = savedSnap.data() || {};
                const dueNow = Number(sd.paymentMethods?.due) || 0;
                const createdAtRaw = sd.createdAt?.toDate ? sd.createdAt.toDate() : (sd.createdAt ?? sd.date ?? new Date());
                updatedInvoice = {
                    ...sd,
                    id: selectedSale.id,
                    type: 'Credit',
                    invoiceNumber: sd.invoiceNumber || selectedSale.invoiceNumber,
                    amount: Number(sd.totalAmount) || 0,
                    dueAmount: dueNow,
                    status: dueNow > 0 ? 'Unpaid' : 'Paid',
                    createdAt: createdAtRaw,
                };
                if (shouldAddCredit && finalPartyNumber.length >= 3) {
                    const custSnap = await getDoc(doc(db, 'companies', companyId, 'customers', finalPartyNumber));
                    newCreditBalance = Number(custSnap.data()?.creditBalance) || 0;
                }
            } catch (e) {
                console.warn('Could not re-read updated invoice for WhatsApp share:', e);
            }

            if (updatedInvoice) {
                setReturnSuccess({
                    invoice: updatedInvoice,
                    creditUpdated: !!shouldAddCredit,
                    creditAdded: shouldAddCredit ? refundable : 0,
                    newCreditBalance,
                });
            } else {
                // Fallback: old behaviour
                setModal({ type: State.SUCCESS, message: 'Return processed successfully!' });
                setTimeout(() => navigate(ROUTES.JOURNAL), 1500);
            }
        } catch (err: any) {
            console.error(err);
            setModal({ type: State.ERROR, message: `Failed: ${err.message}` });
        } finally {
            setIsLoading(false);
            setIsDrawerOpen(false);
        }
    };

    const handleProcessReturn = (exchangeBalanceAction: 'Credit Note' | 'Cash Refund') => {
        // Unpaid sale: Exchange with no new items is allowed — the items come back and the due goes down
        if (modeOfReturn === 'Exchange' && exchangeItems.length == 0 && !isDueSale) return setModal({ type: State.ERROR, message: 'No exchange items selected.' });
        if (itemsToReturn.length === 0 && exchangeItems.length === 0) return setModal({ type: State.ERROR, message: 'No items selected.' });

        const isCreditNote = modeOfReturn === 'Credit Note' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Credit Note');
        const isCashRefund = modeOfReturn === 'Cash Refund' || modeOfReturn === 'Refund' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Cash Refund');

        // Nothing paid on this sale → no money can go back (return or exchange balance).
        // Part-paid → only what was paid beyond the new total goes back (see refundable).
        if (modeOfReturn !== 'Exchange' && (isCreditNote || isCashRefund) && isDueSale) {
            return setModal({ type: State.ERROR, message: 'Nothing was paid on this sale, so a credit note or cash refund can’t be given. Use Exchange — with no new items it just lowers the due.' });
        }
        if (isCreditNote && refundable > 0 && partyNumber.trim().length < 3) {
            return setModal({ type: State.ERROR, message: 'A valid Customer Number is required to issue a Credit Note.' });
        }

        if (modeOfReturn === 'Cash Refund' && finalBalance > 0) saveReturnTransaction(undefined, exchangeBalanceAction);
        else if (finalBalance >= 0) saveReturnTransaction(undefined, exchangeBalanceAction);
        else setIsDrawerOpen(true);
    };

    const getBalanceLabel = (exchangeBalanceAction: 'Credit Note' | 'Cash Refund') => {
        if (finalBalance < 0) return 'Payment Due';
        if (finalBalance > 0 && refundable <= 0) return 'Due goes down by';
        if (modeOfReturn === 'Cash Refund') return 'Refund Amount';
        if (modeOfReturn === 'Exchange' && finalBalance > 0 && exchangeBalanceAction === 'Cash Refund') return 'Refund Amount';
        return 'Credit Due';
    };

    return {
        returnDate, setReturnDate,
        modeOfReturn, setModeOfReturn,
        isDrawerOpen, setIsDrawerOpen,
        activeTaxMode, setActiveTaxMode,
        returnSuccess, setReturnSuccess,
        totalReturnGross, totalReturnValue, totalExchangeValue, finalBalance, discountDeducted, totalMrp, totalTax,
        paidAmountOnSale, isDueSale, refundable, dueReduction,
        saveReturnTransaction,
        handleProcessReturn,
        getBalanceLabel,
    };
};
