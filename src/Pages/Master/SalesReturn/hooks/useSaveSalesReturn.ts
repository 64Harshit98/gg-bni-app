import { useState, useEffect, useMemo } from 'react';
import {
    doc,
    writeBatch,
    increment as firebaseIncrement,
    arrayUnion,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../../lib/Firebase';
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
import type { SalesData, TransactionItem, ExchangeItem } from '../salesReturn.types';
import type { Item } from '../../../../constants/models';

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
    const isDueSale = paidAmountOnSale <= 0 && (selectedSale?.paymentMethods?.due ?? 0) > 0;

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

        // --- SCRUM-973 FIX: Hard block at the transaction level ---
        const shouldAddCredit = finalBalance > 0 &&
            (modeOfReturn === 'Credit Note' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Credit Note'));

        if (shouldAddCredit && finalPartyNumber.length < 3) {
            return setModal({ type: State.ERROR, message: 'A valid Customer Number is required to issue a Credit Note.' });
        }

        setIsLoading(true);
        const companyId = currentUser.companyId;

        try {
            const batch = writeBatch(db);
            const saleRef = doc(db, 'companies', companyId, 'sales', selectedSale.id);

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
            });

            // 3. HANDLE STOCK (EXCHANGE)
            exchangeItems.forEach(exchangeItem => {
                const existingItem = Array.from(originalItemsMap.values()).find(i => i.id === exchangeItem.originalItemId);

                if (existingItem) {
                    existingItem.quantity = Number(existingItem.quantity) + Number(exchangeItem.quantity);
                } else {
                    const itemMaster = availableItems.find(i => i.id === exchangeItem.originalItemId);
                    const unitPrice = exchangeItem.unitPrice;
                    const lineTotal = unitPrice * exchangeItem.quantity;

                    const itemTaxRate = (itemMaster?.tax !== undefined) ? Number(itemMaster.tax) : currentTaxRate;
                    const { lineBase, lineTax } = calculateExchangeLineTax(lineTotal, itemTaxRate, effectiveTaxMode);

                    originalItemsMap.set(exchangeItem.originalItemId, {
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
            } else if (modeOfReturn === 'Cash Refund' && finalBalance > 0) {
                // If cash refund is processed without opening drawer, deduct it from cash.
                updatedPaymentMethods['cash'] = (updatedPaymentMethods['cash'] || 0) - finalBalance;
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

            batch.update(saleRef, updateData);

            if (finalPartyNumber.length >= 3) {
                const customerRef = doc(db, 'companies', companyId, 'customers', finalPartyNumber);
                const customerUpdateData: any = { name: finalPartyName, number: finalPartyNumber, companyId, lastUpdatedAt: serverTimestamp() };

                if (shouldAddCredit) {
                    customerUpdateData.creditBalance = firebaseIncrement(finalBalance);
                }
                batch.set(customerRef, customerUpdateData, { merge: true });
            }

            await batch.commit();
            setModal({ type: State.SUCCESS, message: 'Return processed successfully!' });
            setTimeout(() => navigate(ROUTES.JOURNAL), 1500);
        } catch (err: any) {
            console.error(err);
            setModal({ type: State.ERROR, message: `Failed: ${err.message}` });
        } finally {
            setIsLoading(false);
            setIsDrawerOpen(false);
        }
    };

    const handleProcessReturn = (exchangeBalanceAction: 'Credit Note' | 'Cash Refund') => {
        if (modeOfReturn === 'Exchange' && exchangeItems.length == 0) return setModal({ type: State.ERROR, message: 'No exchange items selected.' });
        if (itemsToReturn.length === 0 && exchangeItems.length === 0) return setModal({ type: State.ERROR, message: 'No items selected.' });

        // --- SCRUM-973 FIX: Block at the UI level ---
        const isCreditNote = modeOfReturn === 'Credit Note' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Credit Note');
        const isCashRefund = modeOfReturn === 'Cash Refund' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Cash Refund');

        if ((isCreditNote || isCashRefund) && isDueSale && finalBalance > 0) {
            return setModal({ type: State.ERROR, message: 'Credit Note / Cash Refund cannot be issued for a sale with pending dues. Please choose Exchange.' });
        }
        if (isCreditNote && finalBalance > 0 && partyNumber.trim().length < 3) {
            return setModal({ type: State.ERROR, message: 'A valid Customer Number is required to issue a Credit Note.' });
        }

        if (modeOfReturn === 'Cash Refund' && finalBalance > 0) saveReturnTransaction(undefined, exchangeBalanceAction);
        else if (finalBalance >= 0) saveReturnTransaction(undefined, exchangeBalanceAction);
        else setIsDrawerOpen(true);
    };

    const getBalanceLabel = (exchangeBalanceAction: 'Credit Note' | 'Cash Refund') => {
        if (finalBalance < 0) return 'Payment Due';
        if (modeOfReturn === 'Cash Refund') return 'Refund Amount';
        if (modeOfReturn === 'Exchange' && finalBalance > 0 && exchangeBalanceAction === 'Cash Refund') return 'Refund Amount';
        return 'Credit Due';
    };

    return {
        returnDate, setReturnDate,
        modeOfReturn, setModeOfReturn,
        isDrawerOpen, setIsDrawerOpen,
        activeTaxMode, setActiveTaxMode,
        totalReturnGross, totalReturnValue, totalExchangeValue, finalBalance, discountDeducted, totalMrp, totalTax,
        paidAmountOnSale, isDueSale,
        saveReturnTransaction,
        handleProcessReturn,
        getBalanceLabel,
    };
};
