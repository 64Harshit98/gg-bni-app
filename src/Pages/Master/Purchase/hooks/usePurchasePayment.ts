import { useState } from 'react';
import {
    collection,
    doc,
    increment as firebaseIncrement,
    runTransaction,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../../lib/Firebase';
import type { Item } from '../../../../constants/models';
import { State } from '../../../../enums';
import { ROUTES } from '../../../../constants/routes.constants';
import { getFinancialYear, peekNextPurchaseNumber } from '../../../../UseComponents/InvoiceCounter';
import type { PaymentCompletionData } from '../../../../Components/PaymentDrawer';
import { SHOP_ID } from '../../../hooks/useStockTransfer';
import type { Godown } from '../../../hooks/useStockTransfer';
import type { GodownSplit } from '../../../../Components/PurchaseGodownAssign';
import { formatPurchaseItemsForDB } from '../purchase.calculations';
import type { Purchase, PurchaseDocumentData, PurchaseItem, TaxOption } from '../purchase.types';

// Moved verbatim from Purchase.tsx (was a module-level helper above the
// component, L34-38). Removes all undefined values from an object before
// sending to Firestore.
const sanitizeForFirestore = <T extends Record<string, any>>(obj: T): T => {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v !== undefined)
    ) as T;
};

// Firestore document IDs can't contain '/' (and a few other characters are
// unsafe) — an invoice number like "PUR/2024/001" would otherwise throw when
// used directly as a doc ID for the uniqueness-registry check below.
const toRegistryKey = (invoiceNumber: string) => encodeURIComponent(invoiceNumber);

interface UsePurchasePaymentParams {
    currentUser: any;
    purchaseSettings: any;
    // Typed loosely (not react-router's NavigateFunction) since this file
    // doesn't otherwise depend on react-router-dom.
    navigate: (path: any, opts?: any) => void;
    items: PurchaseItem[];
    setItems: React.Dispatch<React.SetStateAction<PurchaseItem[]>>;
    setAvailableItems: React.Dispatch<React.SetStateAction<Item[]>>;
    invoiceNumber: string;
    setInvoiceNumber: (n: string) => void;
    invoiceDate: string;
    billTaxType: TaxOption;
    editModeData: Purchase | null;
    purchaseIdToEdit: string | undefined;
    subtotal: number;
    taxableAmount: number;
    taxAmount: number;
    roundingOffAmount: number;
    finalAmount: number;
    totalDiscount: number;
    setModal: (modal: { message: string; type: State } | null) => void;
    // From usePurchaseGodownAssignment — see the cross-hook-dependency note in
    // that hook for why isDrawerOpen/isGodownAssignOpen live there instead of
    // here.
    godowns: Godown[];
    setIsGodownAssignOpen: (open: boolean) => void;
    setIsDrawerOpen: (open: boolean) => void;
    godownAssignments: Record<string, GodownSplit[]>;
    setGodownAssignments: React.Dispatch<React.SetStateAction<Record<string, GodownSplit[]>>>;
}

// Owns the payment-drawer flow — moved verbatim from Purchase.tsx:
// handleProceedToPayment (the MRP/invoice-number validation gate that also
// decides whether to route through the godown-assign modal first),
// getParsedInvoiceDate, handleSavePurchase, createNewPurchase (the Firestore
// transaction for a brand-new purchase — money-critical), updateExistingPurchase
// (the Firestore transaction for edit-mode saves — money-critical), and
// showSuccessModal. The QR/print-preview state (showPrintQrModal,
// handleNavigateToQrPage, handleCloseQrModal) is folded in here too, rather
// than into usePurchaseCart or its own hook — it's populated by
// createNewPurchase (right after a successful save, when
// enableBarcodePrinting is on) and only read by two tiny handlers that both
// just need `navigate`, which this hook already has. Purchase.tsx has no
// `isSaving`-equivalent guard around handleSavePurchase (unlike Sales.tsx) —
// preserved as-is, not added.
export const usePurchasePayment = ({
    currentUser,
    purchaseSettings,
    navigate,
    items,
    setItems,
    setAvailableItems,
    invoiceNumber,
    setInvoiceNumber,
    invoiceDate,
    billTaxType,
    editModeData,
    purchaseIdToEdit,
    subtotal,
    taxableAmount,
    taxAmount,
    roundingOffAmount,
    finalAmount,
    totalDiscount,
    setModal,
    godowns,
    setIsGodownAssignOpen,
    setIsDrawerOpen,
    godownAssignments,
    setGodownAssignments,
}: UsePurchasePaymentParams) => {
    const [showPrintQrModal, setShowPrintQrModal] = useState<PurchaseItem[] | null>(null);

    const handleProceedToPayment = () => {
        if (items.length === 0) {
            setModal({ message: 'Please add items to purchase.', type: State.ERROR });
            return;
        }
        if (purchaseSettings?.inputMRP) {
            const missingMrpItem = items.find(item => (item.mrp === undefined || item.mrp === null || item.mrp <= 0));
            if (missingMrpItem) {
                setModal({ message: `Cannot proceed: MRP is required but missing or invalid for "${missingMrpItem.name}". Please input MRP for all items.`, type: State.ERROR });
                return;
            }
        }
        if (!invoiceNumber.trim()) {
            setModal({ message: "Invoice Number is required.", type: State.ERROR });
            return;
        }
        if (purchaseSettings?.enableGodownAssignment) {
            setIsGodownAssignOpen(true);
        } else {
            setIsDrawerOpen(true);
        }
    };

    const getParsedInvoiceDate = () => {
        try {
            if (!invoiceDate) return new Date();

            const parts = invoiceDate.split('-'); // [YYYY, MM, DD]

            if (parts.length === 3) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // Months are 0-indexed in JS
                const day = parseInt(parts[2], 10);

                // 1. Get the exact current time right now (e.g., 2:45:30 PM)
                const finalDate = new Date();

                // 2. Inject ONLY the Year, Month, and Day from the calendar input
                finalDate.setFullYear(year);
                finalDate.setMonth(month);
                finalDate.setDate(day);

                // Result: The user's selected date + the exact current time!
                return finalDate;
            }
        } catch (e) {
            console.error("Date parsing error", e);
        }
        return new Date(); // Safe fallback
    };

    const handleSavePurchase = async (completionData: PaymentCompletionData) => {
        if (!currentUser?.companyId) {
            setModal({ message: 'User or company information missing.', type: State.ERROR });
            return;
        }
        if (purchaseSettings?.requireSupplierName && !completionData.partyName.trim()) { setModal({ message: 'Supplier name is required.', type: State.ERROR }); setIsDrawerOpen(true); return; }
        if (purchaseSettings?.requireSupplierMobile && !completionData.partyNumber.trim()) { setModal({ message: 'Supplier mobile is required.', type: State.ERROR }); setIsDrawerOpen(true); return; }

        const taxType = billTaxType;

        const finalTaxType = taxType;
        const gstScheme = taxType === 'exempt' ? 'none' : 'regular';

        const formattedItemsForDB = formatPurchaseItemsForDB(items, finalTaxType);

        if (editModeData && purchaseIdToEdit) {
            await updateExistingPurchase(purchaseIdToEdit, completionData, formattedItemsForDB, gstScheme, finalTaxType);
        } else {
            await createNewPurchase(completionData, formattedItemsForDB, gstScheme, finalTaxType);
        }
    };

    const createNewPurchase = async (
        completionData: PaymentCompletionData,
        formattedItemsForDB: PurchaseItem[],
        gstScheme: 'regular' | 'composition' | 'none',
        finalTaxType: 'inclusive' | 'exclusive' | 'exempt'
    ) => {
        if (!currentUser?.companyId) return;
        const companyId = currentUser.companyId;
        const typedInvoiceNumber = invoiceNumber.trim();

        try {
            const manualDiscount = completionData.discount || 0;
            const finalTotalAmount = Math.max(0, finalAmount - manualDiscount);
            let finalInvoiceNumber = '';

            await runTransaction(db, async (transaction) => {
                // Counter peek + uniqueness check + increment + document write all
                // happen inside this ONE transaction now (previously the counter
                // peek/increment were two separate, disconnected calls that both
                // completed before this transaction even started — so two tabs
                // saving around the same time could each peek the same suggested
                // number and both bake it into their purchase doc, since neither
                // the increment nor this write ever re-checked what was actually
                // saved). The registry doc's ID IS the invoice number, so a second
                // transaction racing to use the same number — auto-suggested OR
                // hand-typed — always loses this get()+exists() check once the
                // first transaction commits, instead of silently duplicating it.
                const counterRef = doc(db, 'companies', companyId, 'counters', 'purchaseCounter');
                const settingsRef = doc(db, 'companies', companyId, 'settings', 'purchase-settings');
                const [counterDoc, settingsDoc] = await Promise.all([
                    transaction.get(counterRef),
                    transaction.get(settingsRef),
                ]);

                const prefix = settingsDoc.exists() ? (settingsDoc.data().voucherPrefix || 'INV') : 'INV';
                const currentFY = getFinancialYear();
                let nextNumber = 1;
                if (counterDoc.exists()) {
                    const counterData = counterDoc.data();
                    nextNumber = counterData.financialYear === currentFY ? (counterData.currentNumber || 1) : 1;
                }
                const suggestedNumber = `${prefix}-${nextNumber}`;
                const usedSuggestedNumber = typedInvoiceNumber === suggestedNumber;
                finalInvoiceNumber = typedInvoiceNumber || suggestedNumber;

                if (!finalInvoiceNumber) {
                    throw new Error('EMPTY_INVOICE_NUMBER');
                }

                const registryRef = doc(db, 'companies', companyId, 'purchaseInvoiceRegistry', toRegistryKey(finalInvoiceNumber));
                const registrySnap = await transaction.get(registryRef);
                if (registrySnap.exists()) {
                    throw new Error(`INVOICE_NUMBER_TAKEN:${finalInvoiceNumber}`);
                }

                const purchaseData: Omit<PurchaseDocumentData, 'id'> = {
                    userId: currentUser.uid,
                    partyName: completionData.partyName.trim(),
                    partyNumber: completionData.partyNumber.trim(),
                    partyAddress: completionData.partyAddress || '',
                    partyGstin: completionData.partyGST || '',
                    invoiceNumber: finalInvoiceNumber,
                    items: formattedItemsForDB,
                    subtotal: subtotal,
                    totalDiscount: totalDiscount,
                    taxableAmount: taxableAmount,
                    taxAmount: taxAmount,
                    gstScheme: gstScheme,
                    taxType: finalTaxType,
                    roundingOff: roundingOffAmount,
                    manualDiscount: manualDiscount,
                    totalAmount: finalTotalAmount,
                    paymentMethods: completionData.paymentDetails,
                    createdAt: getParsedInvoiceDate(),
                    companyId: companyId,
                    voucherName: purchaseSettings?.voucherName ?? 'Purchase',
                };

                const newPurchaseRef = doc(collection(db, 'companies', companyId, 'purchases'));
                transaction.set(newPurchaseRef, sanitizeForFirestore(purchaseData));
                transaction.set(registryRef, { purchaseId: newPurchaseRef.id, createdAt: serverTimestamp() });

                if (usedSuggestedNumber) {
                    transaction.set(counterRef, { currentNumber: nextNumber + 1, financialYear: currentFY }, { merge: false });
                }

                // Group by (productId, destination) — the same cart line can itself
                // be split across multiple destinations, and the same product can
                // appear as multiple cart lines — so aggregate per destination
                // across every split of every line, not just per product.
                const perProductUpdates = new Map<string, { shopQty: number; godownQty: Map<string, number> }>();
                items.forEach(cartItem => {
                    const pid = cartItem.productId || cartItem.id;
                    const splits = godownAssignments[cartItem.id];
                    const rows: GodownSplit[] = (splits && splits.length > 0)
                        ? splits
                        : [{ godownId: SHOP_ID, quantity: cartItem.quantity || 1 }];

                    if (!perProductUpdates.has(pid)) {
                        perProductUpdates.set(pid, { shopQty: 0, godownQty: new Map() });
                    }
                    const entry = perProductUpdates.get(pid)!;

                    rows.forEach(({ godownId, quantity }) => {
                        if (!quantity) return;
                        if (godownId === SHOP_ID) {
                            entry.shopQty += quantity;
                        } else {
                            entry.godownQty.set(godownId, (entry.godownQty.get(godownId) || 0) + quantity);
                        }
                    });
                });

                perProductUpdates.forEach((upd, pid) => {
                    const itemRef = doc(db, "companies", companyId, "items", pid);
                    const updatePayload: Record<string, any> = { updatedAt: serverTimestamp() };

                    if (upd.shopQty > 0) {
                        updatePayload.stock = firebaseIncrement(upd.shopQty);
                    }
                    upd.godownQty.forEach((qty, godownId) => {
                        updatePayload[`godownStock.${godownId}`] = firebaseIncrement(qty);
                    });
                    transaction.update(itemRef, updatePayload);

                    const matchedItem = formattedItemsForDB.find(i => i.id === pid);

                    if (upd.shopQty > 0) {
                        const transferRef = doc(collection(db, 'companies', companyId, 'stockTransfers'));
                        transaction.set(transferRef, {
                            itemId: pid,
                            itemName: matchedItem?.name || '',
                            quantity: upd.shopQty,
                            type: 'purchase-in',
                            toGodownId: SHOP_ID,
                            toGodownName: 'Shop',
                            date: getParsedInvoiceDate().getTime(),
                            refInvoice: finalInvoiceNumber,
                            createdAt: Date.now(),
                        });
                    }

                    upd.godownQty.forEach((qty, godownId) => {
                        const godown = godowns.find(g => g.id === godownId);
                        const transferRef = doc(collection(db, 'companies', companyId, 'stockTransfers'));
                        transaction.set(transferRef, {
                            itemId: pid,
                            itemName: matchedItem?.name || '',
                            quantity: qty,
                            type: 'purchase-in',
                            toGodownId: godownId,
                            toGodownName: godown?.name || '',
                            date: getParsedInvoiceDate().getTime(),
                            refInvoice: finalInvoiceNumber,
                            createdAt: Date.now(),
                        });
                    });
                });
            });
            setAvailableItems(prev => prev.map(item => {
                const shopDelta = items
                    .filter(i => (i.productId || i.id) === item.id)
                    .reduce((sum, i) => {
                        const splits = godownAssignments[i.id];
                        const rows: GodownSplit[] = (splits && splits.length > 0)
                            ? splits
                            : [{ godownId: SHOP_ID, quantity: i.quantity || 1 }];
                        const shopQty = rows
                            .filter(r => r.godownId === SHOP_ID)
                            .reduce((s, r) => s + (r.quantity || 0), 0);
                        return sum + shopQty;
                    }, 0);
                if (shopDelta === 0) return item;
                return { ...item, stock: (item.stock || 0) + shopDelta };
            }));
            setIsDrawerOpen(false);
            setGodownAssignments({});
            const savedItemsCopy = [...items];
            localStorage.removeItem('purchase_cart_draft');

            if (!purchaseSettings?.copyVoucherAfterSaving) {
                setItems([]);
                const nextNum = await peekNextPurchaseNumber(companyId);
                setInvoiceNumber(nextNum);
            }
            if (purchaseSettings?.enableBarcodePrinting) {
                setShowPrintQrModal(savedItemsCopy);
            } else {
                setModal({ message: `Purchase #${finalInvoiceNumber} saved!`, type: State.SUCCESS });
                setTimeout(() => { setModal(null); }, 1500);
            }
        } catch (err: any) {
            console.error('Error saving purchase:', err?.code, err?.message);
            if (typeof err?.message === 'string' && err.message.startsWith('INVOICE_NUMBER_TAKEN:')) {
                const takenNumber = err.message.split(':')[1];
                setModal({ message: `Invoice number ${takenNumber} is already in use. Please choose a different number.`, type: State.ERROR });
            } else if (err?.message === 'EMPTY_INVOICE_NUMBER') {
                setModal({ message: 'Please enter an invoice number.', type: State.ERROR });
            } else if (err?.code === 'unavailable' || err?.message?.includes('network-request-failed')) {
                setModal({ message: 'Network lost during save. Please check your connection and try again.', type: State.ERROR });
            } else if (err?.message?.includes('undefined') || err?.message?.includes('invalid data')) {
                setModal({ message: 'Save failed due to invalid data. Please refresh and try again.', type: State.ERROR });
            } else if (err?.code === 'permission-denied') {
                setModal({ message: 'You do not have permission to complete this action.', type: State.ERROR });
            } else if (err?.code === 'aborted') {
                setModal({ message: 'Transaction conflict. Please try again.', type: State.ERROR });
            } else {
                setModal({ message: 'Failed to save purchase. Please try again.', type: State.ERROR });
            }
        }
    };

    const updateExistingPurchase = async (
        purchaseId: string,
        completionData: PaymentCompletionData,
        formattedItemsForDB: PurchaseItem[],
        gstScheme: 'regular' | 'composition' | 'none',
        finalTaxType: 'inclusive' | 'exclusive' | 'exempt'
    ) => {
        if (!editModeData || !currentUser?.companyId) return;
        const companyId = currentUser.companyId;

        try {
            const manualDiscount = completionData.discount || 0;
            const finalTotalAmount = Math.max(0, finalAmount - manualDiscount);

            await runTransaction(db, async (transaction) => {
                const purchaseRef = doc(db, 'companies', companyId, 'purchases', purchaseId);
                const purchaseDoc = await transaction.get(purchaseRef);
                if (!purchaseDoc.exists()) throw new Error("Purchase not found.");

                const originalItemsMap = new Map(
                    (purchaseDoc.data().items as PurchaseItem[] || []).map(item => [item.id, item.quantity || 1])
                );
                const currentItemsMap = new Map(
                    formattedItemsForDB.map(item => [item.id, item.quantity || 1])
                );
                const allItemIds = new Set([...originalItemsMap.keys(), ...currentItemsMap.keys()]);

                const finalInvoiceNumber = invoiceNumber.trim();
                if (!finalInvoiceNumber) {
                    throw new Error('EMPTY_INVOICE_NUMBER');
                }
                // Only touch the registry if the number actually changed during this
                // edit — re-saving with the same number it already owns must not
                // trip the "already taken" check against itself.
                if (finalInvoiceNumber !== purchaseDoc.data().invoiceNumber) {
                    const registryRef = doc(db, 'companies', companyId, 'purchaseInvoiceRegistry', toRegistryKey(finalInvoiceNumber));
                    const registrySnap = await transaction.get(registryRef);
                    if (registrySnap.exists()) {
                        throw new Error(`INVOICE_NUMBER_TAKEN:${finalInvoiceNumber}`);
                    }
                    transaction.set(registryRef, { purchaseId, createdAt: serverTimestamp() });
                }

                allItemIds.forEach(id => {
                    const oldQty = originalItemsMap.get(id) || 0;
                    const newQty = currentItemsMap.get(id) || 0;
                    const difference = newQty - oldQty;

                    if (difference !== 0) {
                        const itemRef = doc(db, 'companies', companyId, 'items', id);
                        transaction.update(itemRef, {
                            stock: firebaseIncrement(difference)
                        });
                    }
                });

                const updatedPurchaseData: Partial<PurchaseDocumentData> = {
                    partyName: completionData.partyName.trim(),
                    partyNumber: completionData.partyNumber.trim(),
                    partyAddress: completionData.partyAddress || '',
                    partyGstin: completionData.partyGST || '',
                    invoiceNumber: finalInvoiceNumber,
                    items: formattedItemsForDB,
                    subtotal: subtotal,
                    totalDiscount: totalDiscount,
                    taxableAmount: taxableAmount,
                    taxAmount: taxAmount,
                    gstScheme: gstScheme,
                    taxType: finalTaxType,
                    roundingOff: roundingOffAmount,
                    manualDiscount: manualDiscount,
                    totalAmount: finalTotalAmount,
                    paymentMethods: completionData.paymentDetails,
                    updatedAt: serverTimestamp(),
                    createdAt: getParsedInvoiceDate(),
                };

                transaction.update(purchaseRef, sanitizeForFirestore(updatedPurchaseData));
            });
            // ✅ FIX: Update local inventory immediately for edit mode
            setAvailableItems(prev => prev.map(item => {
                const oldQty = ((editModeData?.items || []) as PurchaseItem[])
                    .filter(i => (i.productId || i.id) === item.id)
                    .reduce((sum, i) => sum + (i.quantity || 1), 0);
                const newQty = formattedItemsForDB
                    .filter(i => i.id === item.id)
                    .reduce((sum, i) => sum + (i.quantity || 1), 0);
                const delta = newQty - oldQty;
                if (delta === 0) return item;
                return { ...item, stock: (item.stock || 0) + delta };
            }));

            showSuccessModal('Purchase updated successfully!', ROUTES.JOURNAL);
        } catch (err: any) {
            console.error('Error updating purchase:', err?.code, err?.message);
            if (typeof err?.message === 'string' && err.message.startsWith('INVOICE_NUMBER_TAKEN:')) {
                const takenNumber = err.message.split(':')[1];
                setModal({ message: `Invoice number ${takenNumber} is already in use. Please choose a different number.`, type: State.ERROR });
            } else if (err?.message === 'EMPTY_INVOICE_NUMBER') {
                setModal({ message: 'Please enter an invoice number.', type: State.ERROR });
            } else if (err?.code === 'unavailable' || err?.message?.includes('network-request-failed')) {
                setModal({ message: 'Network lost during update. Please check your connection and try again.', type: State.ERROR });
            } else if (err?.message?.includes('undefined') || err?.message?.includes('invalid data')) {
                setModal({ message: 'Update failed due to invalid data. Please refresh and try again.', type: State.ERROR });
            } else if (err?.code === 'permission-denied') {
                setModal({ message: 'You do not have permission to complete this action.', type: State.ERROR });
            } else if (err?.code === 'aborted') {
                setModal({ message: 'Transaction conflict. Please try again.', type: State.ERROR });
            } else {
                setModal({ message: 'Failed to update purchase. Please try again.', type: State.ERROR });
            }
        }
    };

    const showSuccessModal = (message: string, navigateTo?: string) => {
        localStorage.removeItem('purchase_cart_draft');
        setIsDrawerOpen(false);
        setModal({ message, type: State.SUCCESS });
        setTimeout(() => {
            setModal(null);
            if (navigateTo) {
                navigate(navigateTo);
            } else if (!purchaseSettings?.copyVoucherAfterSaving) {
                setItems([]);
            }
        }, 1500);
    };

    const handleNavigateToQrPage = () => {
        if (showPrintQrModal) {
            const itemsForPrint = showPrintQrModal.map((item: PurchaseItem) => ({
                ...item,
                id: item.productId || item.id,
                purchasePrice: Number(item.purchasePrice || 0) // Ensure number for QR print
            }));
            navigate(ROUTES.PRINTQR, { state: { prefilledItems: itemsForPrint } });
            setShowPrintQrModal(null);
        }
    };

    const handleCloseQrModal = () => { setShowPrintQrModal(null); };

    return {
        showPrintQrModal, setShowPrintQrModal,
        handleProceedToPayment,
        getParsedInvoiceDate,
        handleSavePurchase,
        createNewPurchase,
        updateExistingPurchase,
        showSuccessModal,
        handleNavigateToQrPage,
        handleCloseQrModal,
    };
};
