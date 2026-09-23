import { useState, useEffect, useMemo } from 'react';
import {
    doc,
    getDoc,
    collection,
    query,
    getDocs,
    where,
    writeBatch,
    increment as firebaseIncrement,
    arrayUnion,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../../lib/Firebase';
import { ROUTES } from '../../../../constants/routes.constants';
import { State } from '../../../../enums';
import type { PaymentCompletionData } from '../../../../Components/PaymentDrawer';
import { calculatePurchaseReturnTotals, buildNewPurchaseItemRecord } from '../purchaseReturn.calculations';
import type { PurchaseData, TransactionItem, ReturnCartItem } from '../purchaseReturn.types';
import type { Item } from '../../../../constants/models';

interface UseSavePurchaseReturnParams {
    currentUser: any;
    navigate: (path: string) => void;
    purchaseSettings: any;
    selectedPurchase: PurchaseData | null;
    itemsToReturn: TransactionItem[];
    newItemsReceived: ReturnCartItem[];
    availableItems: Item[];
    supplierName: string;
    supplierNumber: string;
    supplierAddress: string;
    supplierGstin: string;
    setModal: (modal: { message: string; type: State } | null) => void;
    setIsLoading: (loading: boolean) => void;
}

// Owns the return/exchange totals calculation and the save transaction —
// moved verbatim from PurchaseReturn.tsx: activeTaxMode state, returnDate,
// modeOfReturn (+ the isPurchaseUnpaid-driven auto-switch-off-Debit-Note
// effect), isDrawerOpen, the totals useMemo (calculatePurchaseReturnTotals),
// isPurchaseUnpaid, saveReturnTransaction (the money-critical Firestore
// batch: stock adjustment via barcode/id lookup, tax/discount recompute,
// supplier debit-balance update), handleProcessReturn, and getBalanceLabel.
export const useSavePurchaseReturn = ({
    currentUser,
    navigate,
    purchaseSettings,
    selectedPurchase,
    itemsToReturn,
    newItemsReceived,
    availableItems,
    supplierName,
    supplierNumber,
    supplierAddress,
    supplierGstin,
    setModal,
    setIsLoading,
}: UseSavePurchaseReturnParams) => {
    const [modeOfReturn, setModeOfReturn] = useState<string>('Exchange');
    const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [activeTaxMode, setActiveTaxMode] = useState<'inclusive' | 'exclusive' | 'exempt'>('exclusive');

    const isPurchaseUnpaid = useMemo(() => {
        if (!selectedPurchase) return true;
        const totalPaid = Object.entries(selectedPurchase.paymentMethods || {})
            .filter(([mode]) => mode !== 'due')
            .reduce((sum, [, val]) => sum + Number(val || 0), 0);
        return totalPaid <= 0;
    }, [selectedPurchase]);

    useEffect(() => {
        if (isPurchaseUnpaid && modeOfReturn === 'Debit Note') {
            setModeOfReturn('Exchange');
        }
    }, [isPurchaseUnpaid, modeOfReturn]);

    const { totalReturnValue, totalNewItemsValue, finalBalance, discountDeducted, totalTax, totalMrp } = useMemo(
        () => calculatePurchaseReturnTotals(itemsToReturn, newItemsReceived, selectedPurchase, availableItems, activeTaxMode),
        [itemsToReturn, newItemsReceived, selectedPurchase, purchaseSettings, availableItems, activeTaxMode]
    );

    // Helper to find Doc Ref by Barcode
    const getItemDocRef = async (barcode: string | undefined, fallbackId: string) => {
        const companyId = currentUser!.companyId;
        if (!barcode) return doc(db, 'companies', companyId, 'items', fallbackId);

        const barcodeAsIdRef = doc(db, 'companies', companyId, 'items', barcode);
        const barcodeAsIdSnap = await getDoc(barcodeAsIdRef);
        if (barcodeAsIdSnap.exists()) return barcodeAsIdRef;

        const q = query(collection(db, 'companies', companyId, 'items'), where('barcode', '==', barcode));
        const querySnap = await getDocs(q);

        if (!querySnap.empty) {
            return querySnap.docs[0].ref;
        }
        return doc(db, 'companies', companyId, 'items', fallbackId);
    };

    // --- SAVE LOGIC ---
    const saveReturnTransaction = async (
        completionData?: Partial<PaymentCompletionData>,
        exchangeBalanceAction?: 'Debit Note' | 'Cash Refund'
    ) => {
        if (!currentUser || !currentUser.companyId || !selectedPurchase) return;

        const finalSupplierName = (completionData?.partyName || supplierName || selectedPurchase.partyName || '').trim();
        const finalSupplierNumber = (completionData?.partyNumber || supplierNumber || selectedPurchase.partyNumber || '').trim();

        // --- UPDATED CHECK: Validates both Name and Number for Debit Notes ---
        const isCreatingDebitNote = modeOfReturn === 'Debit Note' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Debit Note' && finalBalance > 0);

        if (isCreatingDebitNote && (!finalSupplierName || !finalSupplierNumber)) {
            setModal({ type: State.ERROR, message: 'Cannot create Debit Note: Both Party Name and Party Number are required.' });
            return;
        }

        setIsLoading(true);
        const companyId = currentUser.companyId;

        try {
            const batch = writeBatch(db);
            const purchaseRef = doc(db, 'companies', companyId, 'purchases', selectedPurchase.id);

            const originalItemsMap = new Map(selectedPurchase.items.map(item => [item.id, { ...item }]));

            for (const returnItem of itemsToReturn) {
                const originalItem = originalItemsMap.get(returnItem.originalItemId);
                if (originalItem) {
                    originalItem.quantity -= returnItem.quantity;
                    if (originalItem.quantity <= 0) originalItemsMap.delete(returnItem.originalItemId);
                }
                const itemDocRef = await getItemDocRef(returnItem.barcode, returnItem.originalItemId);
                batch.update(itemDocRef, { stock: firebaseIncrement(-returnItem.quantity), updatedAt: serverTimestamp() });
            }

            for (const newItem of newItemsReceived) {
                const originalItem = originalItemsMap.get(newItem.originalItemId);
                if (originalItem) {
                    originalItem.quantity += newItem.quantity;
                } else {
                    originalItemsMap.set(
                        newItem.originalItemId,
                        buildNewPurchaseItemRecord(newItem, availableItems, activeTaxMode)
                    );
                }
                const itemDocRef = await getItemDocRef(newItem.barcode, newItem.originalItemId);
                batch.update(itemDocRef, { stock: firebaseIncrement(newItem.quantity), updatedAt: serverTimestamp() });
            }

            const newItemsList = Array.from(originalItemsMap.values());
            const newGrossTotal = newItemsList.reduce((sum, item) => sum + (item.quantity * (item.purchasePrice || 0)), 0);
            const currentTransactionBillDiscount = Number(completionData?.discount || 0);
            const originalManualDiscount = Number(selectedPurchase.manualDiscount) || 0;
            const newManualDiscount = Math.max(0, originalManualDiscount - discountDeducted) + currentTransactionBillDiscount;
            const newTotalAmount = newGrossTotal - newManualDiscount;
            let updatedPaymentMethods: any = { ...(selectedPurchase.paymentMethods || {}) };

            if (completionData?.paymentDetails) {
                Object.entries(completionData.paymentDetails).forEach(([mode, amount]) => {
                    if (mode !== 'due') {
                        updatedPaymentMethods[mode] = (updatedPaymentMethods[mode] || 0) + Number(amount);
                    }
                });
            }

            const totalPaidSoFar = Object.entries(updatedPaymentMethods)
                .filter(([k]) => k !== 'due')
                .reduce((sum, [_, val]) => sum + Number(val), 0);

            updatedPaymentMethods.due = Math.max(0, newTotalAmount - totalPaidSoFar);

            const actualReturnMode = modeOfReturn === 'Exchange' && finalBalance > 0
                ? `Exchange & ${exchangeBalanceAction}`
                : modeOfReturn;

            const returnHistoryRecord = {
                id: crypto.randomUUID(),
                returnedAt: new Date(),
                returnedItems: itemsToReturn.map(({ id, ...item }) => item),
                newItemsReceived: newItemsReceived.map(({ id, ...item }) => item),
                finalBalance,
                discountDeducted,
                modeOfReturn: actualReturnMode,
                returnType: actualReturnMode,
                paymentDetails: completionData?.paymentDetails || null,
                invoiceNumber: selectedPurchase.invoiceNumber,
                partyName: finalSupplierName,
                partyNumber: finalSupplierNumber,
                billDiscount: currentTransactionBillDiscount
            };

            const updateData: any = {
                partyName: finalSupplierName,
                partyNumber: finalSupplierNumber,
                items: newItemsList,
                totalAmount: newTotalAmount,
                manualDiscount: newManualDiscount,
                returnHistory: arrayUnion(returnHistoryRecord),
                returnedItemsSnapshot: arrayUnion(...itemsToReturn.map(i => ({
                    id: i.originalItemId,
                    name: i.name,
                    quantity: i.quantity,
                    finalPrice: i.amount,
                    mrp: i.mrp,
                }))),
                paymentMethods: updatedPaymentMethods,
                isReturned: true,
                lastUpdated: serverTimestamp()
            };

            batch.update(purchaseRef, updateData);

            if (finalSupplierNumber.length >= 3) {
                const supplierRef = doc(db, 'companies', companyId, 'suppliers', finalSupplierNumber);
                const supplierUpdateData: any = {
                    name: finalSupplierName,
                    number: finalSupplierNumber,
                    address: completionData?.partyAddress || supplierAddress || selectedPurchase.partyAddress || '',
                    gstin: completionData?.partyGST || supplierGstin || selectedPurchase.partyGstin || '',
                    companyId: companyId,
                    lastUpdatedAt: serverTimestamp()
                };

                const shouldAddDebit = finalBalance > 0 &&
                    (modeOfReturn === 'Debit Note' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Debit Note'));

                if (shouldAddDebit) {
                    const netDebitToAdd = finalBalance - (completionData?.discount || 0);
                    if (netDebitToAdd > 0) {
                        supplierUpdateData.debitBalance = firebaseIncrement(netDebitToAdd);
                    }
                }

                batch.set(supplierRef, supplierUpdateData, { merge: true });
            }

            await batch.commit();
            setModal({ type: State.SUCCESS, message: 'Purchase Return processed successfully!' });
            setTimeout(() => navigate(ROUTES.JOURNAL), 1500);
        } catch (error: any) {
            console.error('Error processing return:', error);
            if (error.code === 'not-found') {
                setModal({ type: State.ERROR, message: 'Stock update failed: Item Barcode/ID not found.' });
            } else {
                setModal({ type: State.ERROR, message: `Failed to process return: ${error.message}` });
            }
        } finally {
            setIsLoading(false);
            setIsDrawerOpen(false);
        }
    };

    // --- FIX 3: STRICT QUANTITY CHECK ---
    const handleProcessReturn = (exchangeBalanceAction: 'Debit Note' | 'Cash Refund') => {
        if (!currentUser || !selectedPurchase) return;

        if (itemsToReturn.length === 0 && newItemsReceived.length === 0) {
            return setModal({ type: State.ERROR, message: 'No items have been returned or received.' });
        }
        if (modeOfReturn === 'Exchange' && newItemsReceived.length === 0) {
            return setModal({
                type: State.ERROR,
                message: 'Please add at least one new item to complete the exchange.'
            });
        }

        for (const returnItem of itemsToReturn) {
            const originalItem = selectedPurchase.items.find(i => i.id === returnItem.originalItemId);

            if (!originalItem) {
                return setModal({ type: State.ERROR, message: `Item "${returnItem.name}" not found in original bill.` });
            }

            const currentBillQty = originalItem.quantity || 0;

            if (returnItem.quantity > currentBillQty) {
                return setModal({
                    type: State.ERROR,
                    message: `Error: You are trying to return ${returnItem.quantity} of "${returnItem.name}", but only ${currentBillQty} remain in this bill.`
                });
            }
        }

        if (modeOfReturn === 'Cash Refund' && finalBalance > 0) {
            saveReturnTransaction(undefined, exchangeBalanceAction);
        }
        else if (finalBalance >= 0) {
            saveReturnTransaction(undefined, exchangeBalanceAction);
        }
        else {
            setIsDrawerOpen(true);
        }
    };

    const getBalanceLabel = (exchangeBalanceAction: 'Debit Note' | 'Cash Refund') => {
        if (finalBalance < 0) return 'Payment Due';
        if (modeOfReturn === 'Cash Refund') return 'Refund Received';
        if (modeOfReturn === 'Exchange' && finalBalance > 0 && exchangeBalanceAction === 'Cash Refund') return 'Refund Received';
        return 'Debit Note';
    };

    return {
        modeOfReturn, setModeOfReturn,
        returnDate, setReturnDate,
        isDrawerOpen, setIsDrawerOpen,
        activeTaxMode, setActiveTaxMode,
        isPurchaseUnpaid,
        totalReturnValue, totalNewItemsValue, finalBalance, discountDeducted, totalTax, totalMrp,
        saveReturnTransaction,
        handleProcessReturn,
        getBalanceLabel,
    };
};
