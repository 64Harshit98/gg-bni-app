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
import type { User } from '../../../../Role/permission';
import { State } from '../../../../enums';
import { ROUTES } from '../../../../constants/routes.constants';
import { peekNextInvoiceNumber } from '../../../../UseComponents/InvoiceCounter';
import type { PaymentCompletionData } from '../../../../Components/PaymentDrawer';
import { calculateFinalizedSaleItems, toCurrency } from '../sales.calculations';
import type { SalesInvoice, SalesItem } from '../sales.types';

// Firestore document IDs can't contain '/' (and a few other characters are
// unsafe) — an invoice number like "INV/2024/001" would otherwise throw when
// used directly as a doc ID for the uniqueness-registry check below.
const toRegistryKey = (invoiceNumber: string) => encodeURIComponent(invoiceNumber);

interface UseSalesPaymentParams {
    currentUser: any;
    companyId: string | undefined;
    salesSettings: any;
    activeTaxMode: 'inclusive' | 'exclusive' | 'exempt';
    items: SalesItem[];
    setItems: React.Dispatch<React.SetStateAction<SalesItem[]>>;
    availableItems: Item[];
    setAvailableItems: React.Dispatch<React.SetStateAction<Item[]>>;
    selectedWorker: User | null;
    workers: User[];
    isEditMode: boolean;
    invoiceToEdit: any;
    invoiceDate: string;
    invoiceNumber: string;
    setInvoiceNumber: (n: string) => void;
    isInvoiceNumberManuallyEdited: React.MutableRefObject<boolean>;
    settingsDocId: string | null;
    subtotal: number;
    totalDiscount: number;
    finalAmount: number;
    setModal: (modal: { message: string; type: State } | null) => void;
    setStagedCalcInput: (v: string) => void;
    setCalcInput: (v: string) => void;
    isDrawerOpen: boolean;
    setIsDrawerOpen: (open: boolean) => void;
    setSavedBillData: (data: { id: string, number: string, invoiceData?: any } | null) => void;
    showSuccessModal: (message: string, navigateTo?: string) => void;
}

// Owns the payment-drawer flow — moved verbatim from Sales.tsx:
// handleProceedToPayment (the MRP/stock/salesman validation gate that runs
// before the payment drawer opens) and handleSavePayment (the big save
// handler — new+edit invoice save, calls calculateFinalizedSaleItems from
// sales.calculations.ts, the Firestore transaction, stock decrement, and
// formatItemsForDB). `isDrawerOpen`/`setIsDrawerOpen` are NOT declared here —
// they live in useSalesCommunication (see the note there for why) and are
// threaded into this hook as params instead.
export const useSalesPayment = ({
    currentUser,
    companyId,
    salesSettings,
    activeTaxMode,
    items,
    setItems,
    availableItems,
    setAvailableItems,
    selectedWorker,
    workers,
    isEditMode,
    invoiceToEdit,
    invoiceDate,
    invoiceNumber,
    setInvoiceNumber,
    isInvoiceNumberManuallyEdited,
    settingsDocId,
    subtotal,
    totalDiscount,
    finalAmount,
    setModal,
    setStagedCalcInput,
    setCalcInput,
    setIsDrawerOpen,
    setSavedBillData,
    showSuccessModal,
}: UseSalesPaymentParams) => {
    const [isSaving, setIsSaving] = useState(false);

    const handleProceedToPayment = () => {
        if (items.length === 0) {
            setModal({ message: 'Please add at least one item.', type: State.INFO });
            return;
        }
        if (salesSettings?.enableSalesmanSelection && !selectedWorker) {
            setModal({ message: 'Please select a salesman.', type: State.ERROR });
            return;
        }

        // --- NEW: MRP PRICE VALIDATION ---
        const invalidMrpItems: string[] = [];
        items.filter(i => !i.isCustomAmount).forEach(item => {
            const mrp = Number(item.mrp) || 0;

            // Only check if the item actually has an MRP set in the database
            if (mrp > 0) {
                let effectiveUnitPrice = 0;
                if (item.customPrice !== undefined && item.customPrice !== null && item.customPrice !== '') {
                    effectiveUnitPrice = parseFloat(String(item.customPrice));
                } else {
                    const currentDiscount = Number(item.discount) || 0;
                    effectiveUnitPrice = mrp * (1 - currentDiscount / 100);
                }

                // If the user's custom price is higher than the MRP, flag it
                if (effectiveUnitPrice > mrp) {
                    invalidMrpItems.push(`${item.name} (Max: ₹${mrp})`);
                }
            }
        });

        // Block the payment drawer from opening and show an error
        if (invalidMrpItems.length > 0) {
            setModal({
                message: `Selling price cannot exceed MRP for: ${invalidMrpItems.join(', ')}`,
                type: State.ERROR
            });
            return;
        }
        // ---------------------------------

        if (!(salesSettings as any)?.allowNegativeStock) {
            // Build a map of quantities already committed in the ORIGINAL invoice
            const originalQuantities = new Map<string, number>();
            if (isEditMode && invoiceToEdit?.items) {
                (invoiceToEdit.items as any[]).forEach((oldItem) => {
                    const pid = oldItem.productId || oldItem.id;
                    const oldQty = oldItem.quantity || 1;
                    originalQuantities.set(pid, (originalQuantities.get(pid) || 0) + oldQty);
                });
            }
            const stockNeeds = new Map<string, number>();
            items.filter(i => i.isEditable).forEach(i => {
                const pid = i.productId;
                const requiredStock = i.quantity || 1; // Multiplier removed. 1:1 mapping.
                stockNeeds.set(pid, (stockNeeds.get(pid) || 0) + requiredStock);
            });
            const invalidItems: string[] = [];
            stockNeeds.forEach((needed, pid) => {
                const avail = availableItems.find(a => a.id === pid);
                const currentStock = avail?.stock ?? 0;
                // Add back the original committed quantity — those units are already deducted
                const alreadyCommitted = originalQuantities.get(pid) || 0;
                const effectiveAvailable = currentStock + alreadyCommitted;
                if (effectiveAvailable < needed) {
                    invalidItems.push(`${avail?.name} (Avail:${effectiveAvailable}, Need:${needed})`);
                }
            });
            if (invalidItems.length > 0) { setModal({ message: `Insufficient stock: ${invalidItems.join(', ')}`, type: State.ERROR }); return; }
        }

        setIsDrawerOpen(true);
    };

    const handleSavePayment = async (completionData: PaymentCompletionData) => {
        if (isSaving) return; // Exit if already saving
        setIsSaving(true);
        if (!currentUser?.companyId) return;

        if (salesSettings?.requireCustomerName && !completionData.partyName?.trim()) {
            setModal({ message: "Customer Name is required.", type: State.ERROR });
            setIsSaving(false);
            return;
        }
        if (salesSettings?.requireCustomerMobile && !completionData.partyNumber?.trim()) {
            setModal({ message: "Customer Mobile Number is required.", type: State.ERROR });
            setIsSaving(false);
            return;
        }

        const resolvedCompanyId = companyId!;
        const salesman = salesSettings?.enableSalesmanSelection ? selectedWorker : workers.find(w => w.uid === currentUser.uid);
        const finalSalesman = salesman || { uid: currentUser.uid, name: currentUser.uid || 'Current User' };

        let finalGstScheme = salesSettings?.gstScheme || 'none';
        let finalTaxType = activeTaxMode === 'exempt' ? 'none' : activeTaxMode;

        const currentTaxRate = salesSettings?.defaultTaxRate ?? 0;
        const isRoundingEnabled = salesSettings?.enableRounding ?? true;
        const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

        // --- NEW VARIABLES FOR PROPORTIONAL TAX ---
        const finalInvoiceTotal = completionData.finalAmount;
        const totalInvoiceDiscount = totalDiscount + (completionData.discount || 0);

        // Calculate proportional scale: (Total Before Drawer Discount - Drawer Discount) / Total Before Drawer Discount
        const billRatio = finalAmount > 0 ? Math.max(0, (finalAmount - (completionData.discount || 0)) / finalAmount) : 1;

        const getParsedInvoiceDate = () => {
            try {
                if (!invoiceDate) return new Date();
                const parts = invoiceDate.split('-');
                if (parts.length === 3) {
                    const year = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1;
                    const day = parseInt(parts[2], 10);
                    if (isEditMode && invoiceToEdit?.createdAt) {
                        const originalDate = new Date(invoiceToEdit.createdAt);
                        if (!isNaN(originalDate.getTime())) {
                            originalDate.setFullYear(year);
                            originalDate.setMonth(month);
                            originalDate.setDate(day);
                            return originalDate; // keeps original HH:MM:SS
                        }
                    }
                    const finalDate = new Date();
                    finalDate.setFullYear(year);
                    finalDate.setMonth(month);
                    finalDate.setDate(day);
                    return finalDate;
                }
            } catch (e) {
                console.error("Date parsing error", e);
            }
            return new Date();
        };

        const formatItemsForDB = (itemsToFormat: SalesItem[]) => calculateFinalizedSaleItems(itemsToFormat, {
            isRoundingEnabled,
            roundingInterval,
            finalGstScheme,
            finalTaxType,
            currentTaxRate,
            billRatio,
        });

        const sanitizeForFirestore = (obj: any): any => {
            if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
            if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
                const cleaned: any = {};
                for (const [key, value] of Object.entries(obj)) {
                    if (value === undefined) cleaned[key] = null;
                    else if (typeof value === 'number' && isNaN(value)) cleaned[key] = 0;
                    else cleaned[key] = sanitizeForFirestore(value);
                }
                return cleaned;
            }
            return obj;
        };

        // 2. Generate finalized items WITH the proportional discount applied
        const finalizedItems = formatItemsForDB(items);

        // 3. Re-calculate total Tax and Taxable Amount from the finalized items
        const newTaxableAmount = toCurrency(finalizedItems.reduce((acc, item) => acc + item.taxableAmount, 0));
        const newTaxAmount = toCurrency(finalizedItems.reduce((acc, item) => acc + item.taxAmount, 0));

        // 4. Calculate perfect roundOff to ensure Database matches UI exactly
        const totalExpenseAmount = completionData.expenses?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0;

        // 4. Calculate perfect roundOff to ensure Database matches UI exactly
        const rawInvoiceTotal = newTaxableAmount + newTaxAmount + totalExpenseAmount;
        const finalRoundOff = toCurrency(finalInvoiceTotal - rawInvoiceTotal);

        const saveOperation = async (transaction: any, isNew: boolean, existingId?: string) => {
            const customDate = getParsedInvoiceDate();
            const saleData: SalesInvoice = {
                items: finalizedItems,
                subtotal,
                discount: totalInvoiceDiscount,
                manualDiscount: completionData.discount || 0,
                revDiscount: completionData.revDiscount || 0,
                roundOff: finalRoundOff,
                taxableAmount: newTaxableAmount,
                taxAmount: newTaxAmount,
                gstScheme: finalGstScheme,
                taxType: finalTaxType,
                totalAmount: finalInvoiceTotal,
                paymentMethods: completionData.paymentDetails,
                partyName: completionData.partyName,
                partyNumber: completionData.partyNumber,
                partyAddress: completionData.partyAddress || '',
                partyGstin: completionData.partyGST || '',
                placeOfSupply: completionData.placeOfSupply || '',    // <-- ADD THIS
                shippingState: completionData.shippingState || '',
                salesmanId: finalSalesman.uid,
                salesmanName: finalSalesman.name,
                updatedAt: serverTimestamp(),
                shippingName: completionData.shippingName || '',
                shippingNumber: completionData.shippingNumber || '',
                shippingAddress: completionData.shippingAddress || '',
                shippingGST: completionData.shippingGST || '',
                expenses: completionData.expenses || [],
                narration: completionData.narration || '',
                transportDetails: completionData.transportDetails || null,
            };

            if (isNew) {
                const counterRef = doc(db, 'companies', resolvedCompanyId, 'counters', 'invoiceCounter');
                const settingsRef = doc(db, 'companies', resolvedCompanyId, 'settings', 'sales-settings');

                const [counterDoc, settingsDoc] = await Promise.all([
                    transaction.get(counterRef),
                    transaction.get(settingsRef)
                ]);

                const prefix = settingsDoc.exists() ? (settingsDoc.data().voucherPrefix || 'INV') : 'INV';
                const nextNumber = counterDoc.exists() ? (counterDoc.data().currentNumber || 1) : 1;
                const finalInvNo = (isInvoiceNumberManuallyEdited.current ? invoiceNumber : `${prefix}-${nextNumber}`).trim();

                if (!finalInvNo) {
                    throw new Error('EMPTY_INVOICE_NUMBER');
                }

                // Strict, transaction-atomic uniqueness check. The registry doc's ID
                // IS the invoice number, so two tabs racing to save the same number
                // (auto-generated OR hand-typed) can never both win: Firestore
                // serializes transactions that read+write the same document, and
                // whichever one commits second sees the registry entry the first one
                // just created and aborts here — instead of silently duplicating it.
                const registryRef = doc(db, 'companies', resolvedCompanyId, 'salesInvoiceRegistry', toRegistryKey(finalInvNo));
                const registrySnap = await transaction.get(registryRef);
                if (registrySnap.exists()) {
                    throw new Error(`INVOICE_NUMBER_TAKEN:${finalInvNo}`);
                }

                saleData.createdAt = customDate;
                saleData.invoiceNumber = finalInvNo;
                saleData.userId = currentUser.uid;
                saleData.companyId = resolvedCompanyId;
                saleData.voucherName = salesSettings?.voucherName ?? 'Sales';

                const newSaleRef = doc(collection(db, "companies", resolvedCompanyId, "sales"));
                transaction.set(newSaleRef, sanitizeForFirestore(saleData));
                transaction.set(registryRef, { saleId: newSaleRef.id, createdAt: serverTimestamp() });

                if (!isInvoiceNumberManuallyEdited.current) {
                    transaction.set(counterRef, { currentNumber: nextNumber + 1 }, { merge: true });
                }
                return { id: newSaleRef.id, number: finalInvNo };

            } else if (existingId) {
                const invoiceRef = doc(db, "companies", resolvedCompanyId, "sales", existingId);
                const finalInvNo = invoiceNumber.trim();

                if (!finalInvNo) {
                    throw new Error('EMPTY_INVOICE_NUMBER');
                }

                // Only touch the registry if the number actually changed during this
                // edit — re-saving with the same number it already owns must not
                // trip the "already taken" check against itself.
                if (finalInvNo !== invoiceToEdit?.invoiceNumber) {
                    const registryRef = doc(db, 'companies', resolvedCompanyId, 'salesInvoiceRegistry', toRegistryKey(finalInvNo));
                    const registrySnap = await transaction.get(registryRef);
                    if (registrySnap.exists()) {
                        throw new Error(`INVOICE_NUMBER_TAKEN:${finalInvNo}`);
                    }
                    transaction.set(registryRef, { saleId: existingId, createdAt: serverTimestamp() });
                }

                saleData.createdAt = customDate;
                saleData.invoiceNumber = finalInvNo;
                transaction.update(invoiceRef, sanitizeForFirestore(saleData));
                return { id: existingId, number: finalInvNo };
            }
            return null;
        };

        try {
            if (isEditMode && invoiceToEdit?.id) {
                await runTransaction(db, async (transaction) => {
                    await saveOperation(transaction, false, invoiceToEdit.id);

                    const oldQuantities = new Map<string, number>();
                    (invoiceToEdit.items || []).forEach((oldItem: any) => {
                        const pid = oldItem.productId || oldItem.id;
                        const oldQty = oldItem.quantity || 1;
                        oldQuantities.set(pid, (oldQuantities.get(pid) || 0) + oldQty);
                    });

                    const newQuantities = new Map<string, number>();
                    items.forEach(newItem => {
                        const pid = newItem.productId || newItem.id;
                        if (pid) {
                            const newQty = newItem.quantity || 1;
                            newQuantities.set(pid, (newQuantities.get(pid) || 0) + newQty);
                        }
                    });

                    const allProductIds = new Set([...oldQuantities.keys(), ...newQuantities.keys()]);

                    allProductIds.forEach(pid => {
                        const oldTotal = oldQuantities.get(pid) || 0;
                        const newTotal = newQuantities.get(pid) || 0;
                        const difference = newTotal - oldTotal;

                        if (difference !== 0) {
                            const itemRef = doc(db, "companies", resolvedCompanyId, "items", pid);
                            transaction.update(itemRef, {
                                stock: firebaseIncrement(-difference),
                                updatedAt: serverTimestamp()
                            });
                        }
                    });
                });

                setAvailableItems(prev => prev.map(item => {
                    const oldQty = (invoiceToEdit.items || [])
                        .filter((i: any) => (i.productId || i.id) === item.id)
                        .reduce((sum: number, i: any) => sum + (i.quantity || 1), 0);
                    const newQty = items
                        .filter(i => (i.productId || i.id) === item.id && !i.isCustomAmount)
                        .reduce((sum, i) => sum + (i.quantity || 1), 0);
                    const delta = newQty - oldQty;
                    if (delta === 0) return item;
                    return { ...item, stock: Math.max(0, (item.stock || 0) - delta) };
                }));
                showSuccessModal("Invoice Updated", ROUTES.JOURNAL);

            } else {
                let result: any = null;
                await runTransaction(db, async (transaction) => {
                    result = await saveOperation(transaction, true);

                    items.forEach(i => {
                        const pid = i.productId || i.id;
                        if (pid && !i.isCustomAmount) {
                            const itemRef = doc(db, "companies", resolvedCompanyId, "items", pid);
                            const totalToDeduct = i.quantity || 1;
                            transaction.update(itemRef, { stock: firebaseIncrement(-totalToDeduct), updatedAt: serverTimestamp() });
                        }
                    });

                    if (settingsDocId) {
                        const settingsRef = doc(db, "companies", resolvedCompanyId, "settings", settingsDocId);
                        transaction.update(settingsRef, { currentVoucherNumber: firebaseIncrement(1) });
                    }
                });

                if (result) {
                    const invoiceData = {
                        id: result.id,
                        invoiceNumber: result.number,
                        amount: finalInvoiceTotal,
                        partyName: completionData.partyName || 'Cash',
                        partyNumber: completionData.partyNumber || '',
                        partyAddress: completionData.partyAddress || '',
                        partyGstin: completionData.partyGST || '',
                        createdAt: getParsedInvoiceDate(),
                        manualDiscount: completionData.discount || 0,
                        salesmanName: finalSalesman.name,
                        items: finalizedItems,
                        expenses: completionData.expenses || [],
                        paymentMethods: completionData.paymentDetails,
                        dueAmount: completionData.paymentDetails?.due || 0,
                        shippingName: completionData.shippingName || '',
                        shippingNumber: completionData.shippingNumber || '',
                        shippingAddress: completionData.shippingAddress || '',
                        shippingGST: completionData.shippingGST || '',
                        transportDetails: completionData.transportDetails || undefined,
                        gstScheme: finalGstScheme,   // ✅ ADDED
                        taxType: finalTaxType,       // ✅ ADDED
                        placeOfSupply: completionData.placeOfSupply || ''   // ✅ ADDED (IGST calc ke liye bhi zaroori)
                    };

                    setAvailableItems(prev => prev.map(item => {
                        const stockDelta = items
                            .filter(i => (i.productId || i.id) === item.id && !i.isCustomAmount)
                            .reduce((sum, i) => sum + (i.quantity || 1), 0);
                        if (stockDelta === 0) return item;
                        return { ...item, stock: Math.max(0, (item.stock || 0) - stockDelta) };
                    }));

                    setIsDrawerOpen(false);
                    setSavedBillData({ id: result.id, number: result.number, invoiceData: invoiceData });
                    sessionStorage.removeItem('sales_cart_draft');
                    sessionStorage.removeItem('sales_tax_mode_draft');
                    sessionStorage.removeItem('sales_salesman_draft');
                    setItems([]);
                    setStagedCalcInput('');
                    setCalcInput('');
                    const nextNum = await peekNextInvoiceNumber(currentUser.companyId);
                    isInvoiceNumberManuallyEdited.current = false;
                    setInvoiceNumber(nextNum);
                }
            }
        } catch (e: any) {
            console.error("Save error:", e?.code, e?.message);

            if (typeof e?.message === 'string' && e.message.startsWith('INVOICE_NUMBER_TAKEN:')) {
                const takenNumber = e.message.split(':')[1];
                setModal({
                    message: `Invoice number ${takenNumber} is already in use. Please choose a different number.`,
                    type: State.ERROR
                });
            } else if (e?.message === 'EMPTY_INVOICE_NUMBER') {
                setModal({
                    message: 'Please enter an invoice number.',
                    type: State.ERROR
                });
            } else if (e?.code === 'unavailable' || e?.message?.includes('network-request-failed')) {
                setModal({
                    message: 'Network lost while saving. Please check your connection and try again.',
                    type: State.ERROR
                });
            } else if (e?.code === 'permission-denied') {
                setModal({
                    message: 'You do not have permission to complete this action.',
                    type: State.ERROR
                });
            } else if (e?.code === 'aborted') {
                setModal({
                    message: 'Transaction conflict. Please try again.',
                    type: State.ERROR
                });
            } else {
                setModal({ message: 'Failed to save invoice. Please refresh the page and try again.', type: State.ERROR });
            }
        } finally {
            setIsSaving(false);
        }
    };

    return {
        isSaving, setIsSaving,
        handleProceedToPayment,
        handleSavePayment,
    };
};
