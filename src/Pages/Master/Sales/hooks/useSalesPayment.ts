import { useState } from 'react';
import {
    collection,
    doc,
    increment as firebaseIncrement,
    runTransaction,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../../lib/Firebase';
import { clearSalesReportCache } from '../../../Reports/SalesReportComponents/salesReportCache';
import type { Item } from '../../../../constants/models';
import { addOnStockOf } from '../../../../constants/models';
import type { User } from '../../../../Role/permission';
import { State } from '../../../../enums';
import { ROUTES } from '../../../../constants/routes.constants';
import { peekNextInvoiceNumber } from '../../../../UseComponents/InvoiceCounter';
import type { PaymentCompletionData } from '../../../../Components/PaymentDrawer';
import { calculateFinalizedSaleItems, toCurrency } from '../sales.calculations';
import { omitKeys } from '../../../../lib/omitKeys';
import { CART_ONLY_CUSTOMER_KEYS } from '../../../utils/customerPricing';
import type { SalesInvoice, SalesItem } from '../sales.types';
import { useRestaurantData } from '../../../../context/RestaurantDataContext';
import {
    cartLineConsumption,
    diffConsumption,
    shortfalls,
    totalConsumption,
} from '../../../../lib/restaurant/consumption';
import { queueMovement } from '../../../../lib/restaurant/stockApi';
import { unitCostOf } from '../../../../lib/restaurant/units';
import { KITCHEN_ID, KITCHEN_NAME, type ConsumptionLine } from '../../../../lib/restaurant/types';

/** Items already warned about a missing recipe this session (restaurant mode). */
const warnedNoRecipe = new Set<string>();
import {
    LoyaltyBalanceError,
    planLoyaltyForSave,
    readLoyaltyPlanInTxn,
    readSaleLoyalty,
    writeLoyaltyPlanInTxn,
    type LoyaltyAccountState,
    type SaleLoyalty,
} from '../../../../lib/loyalty';

// Firestore document IDs can't contain '/' (and a few other characters are
// unsafe) — an invoice number like "INV/2024/001" would otherwise throw when
// used directly as a doc ID for the uniqueness-registry check below.
const toRegistryKey = (invoiceNumber: string) => encodeURIComponent(invoiceNumber);

// Called after a save fails with INVOICE_NUMBER_TAKEN for an auto-generated
// number — walks the counter forward past whichever numbers are already
// registered, so the next save attempt doesn't hit the same collision again.
const advanceInvoiceCounterPastDuplicates = async (companyId: string): Promise<string> => {
    const counterRef = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');
    const settingsRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');

    return runTransaction(db, async (transaction) => {
        const [counterDoc, settingsDoc] = await Promise.all([
            transaction.get(counterRef),
            transaction.get(settingsRef),
        ]);

        const prefix = settingsDoc.exists() ? (settingsDoc.data().voucherPrefix || 'INV') : 'INV';
        let candidate = counterDoc.exists() ? (counterDoc.data().currentNumber || 1) : 1;

        const MAX_ATTEMPTS = 500;
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            const registryRef = doc(db, 'companies', companyId, 'salesInvoiceRegistry', toRegistryKey(`${prefix}-${candidate}`));
            const registrySnap = await transaction.get(registryRef);
            if (!registrySnap.exists()) break;
            candidate++;
        }

        transaction.set(counterRef, { currentNumber: candidate }, { merge: true });
        return `${prefix}-${candidate}`;
    });
};

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
    /** Loyalty settings switch. When off, saving never touches points (an edited bill keeps what it had). */
    loyaltyEnabled?: boolean;
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
    loyaltyEnabled = false,
}: UseSalesPaymentParams) => {
    const [isSaving, setIsSaving] = useState(false);
    const { isRestaurant, recipeMap, rawMaterialMap } = useRestaurantData();

    // Lines loaded from the saved bill use its snapshot (none = nothing), new lines use the recipe
    const lineConsumptionOf = (i: any): ConsumptionLine[] => cartLineConsumption(i, recipeMap, rawMaterialMap);

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

                // If the user's custom price is higher than the MRP, flag it (0.01 tolerance for float rounding)
                if (effectiveUnitPrice - mrp > 0.01) {
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
            if (isRestaurant) {
                const alreadyTaken = isEditMode && invoiceToEdit?.items
                    ? totalConsumption((invoiceToEdit.items as any[]).map((oldItem) => oldItem.rawConsumption))
                    : new Map<string, number>();
                const needs = totalConsumption(
                    items.filter(i => i.isEditable).map(i => lineConsumptionOf(i)),
                );
                const short = shortfalls(needs, rawMaterialMap, alreadyTaken);
                if (short.length > 0) {
                    setModal({
                        message: `Insufficient raw material stock: ${short.map(s => `${s.name} (Avail:${s.have} ${s.unit}, Need:${s.need} ${s.unit})`).join(', ')}`,
                        type: State.ERROR,
                    });
                    return;
                }
            } else {
                // Build a map of quantities already committed in the ORIGINAL invoice
                const originalQuantities = new Map<string, number>();
                if (isEditMode && invoiceToEdit?.items) {
                    (invoiceToEdit.items as any[]).forEach((oldItem) => {
                        const pid = oldItem.productId || oldItem.id;
                        const oldQty = (oldItem.quantity || 1) * (oldItem.tierQuantity || 1);
                        originalQuantities.set(pid, (originalQuantities.get(pid) || 0) + oldQty);
                        addOnStockOf(oldItem).forEach((a) =>
                            originalQuantities.set(a.itemId, (originalQuantities.get(a.itemId) || 0) + a.qty * (oldItem.quantity || 1)));
                    });
                }
                const stockNeeds = new Map<string, number>();
                items.filter(i => i.isEditable).forEach(i => {
                    const pid = i.productId;
                    const requiredStock = (i.quantity || 1) * (i.tierQuantity || 1);
                    stockNeeds.set(pid, (stockNeeds.get(pid) || 0) + requiredStock);
                    addOnStockOf(i).forEach((a) =>
                        stockNeeds.set(a.itemId, (stockNeeds.get(a.itemId) || 0) + a.qty * (i.quantity || 1)));
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
        }

        // Restaurant: items with no recipe are sold without deducting raw materials. Say so —
        // once per item per session, and without blocking the bill.
        if (isRestaurant) {
            const missing = items.filter((i: any) => {
                const pid = i.productId || i.id;
                return pid && !i.isCustomAmount && i._origQuantity === undefined
                    && !recipeMap.has(pid) && !warnedNoRecipe.has(pid);
            });
            if (missing.length > 0) {
                missing.forEach((i: any) => warnedNoRecipe.add(i.productId || i.id));
                const names = [...new Set(missing.map(i => i.name))].join(', ');
                setModal({
                    message: `No recipe set for: ${names}. ${missing.length === 1 ? 'It' : 'They'} will be billed without deducting raw-material stock. Add recipes in Settings → Item & Add-on Recipes.`,
                    type: State.WARNING,
                });
            }
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

        // A due (part-paid/unpaid) bill needs a way to track who owes it —
        // enforce customer name + mobile here regardless of the individual
        // require-name/require-mobile toggles above, since those can be off
        // even while Allow Due Billing is on.
        const dueAmount = completionData.paymentDetails?.due || 0;
        if (dueAmount > 0) {
            if (!completionData.partyName?.trim() || !completionData.partyNumber?.trim()) {
                setIsSaving(false);
                // Must throw, not just show a modal and return — PaymentDrawer
                // awaits this as onPaymentComplete and treats a normal return
                // as success, wiping the whole form (party/payment/shipping
                // state) even though the save never happened.
                throw new Error("Customer name and mobile number are required for a due/credit sale.");
            }
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

        const formatItemsForDB = (itemsToFormat: SalesItem[]) => {
            const itemsWithTierNames = itemsToFormat.map(item => {
                // addOns / addOnKey / addOnGroups / addOnGroupIds are cart-only; the add-on text goes into the saved name
                // preCustomer* only back the cart's Revert button — not saved
                // _origQuantity is edit-mode bookkeeping only — never saved
                const { addOns, addOnKey, addOnGroups, addOnGroupIds, addOnPicks, _origQuantity, ...rest } = omitKeys(item, CART_ONLY_CUSTOMER_KEYS) as any;
                const baseName = item.tierLabel ? `${item.name} - ${item.tierLabel}` : item.name;
                const addOnText = addOns?.length ? ` + ${addOns.map((a: { name: string }) => a.name).join(', ')}` : '';
                // Remember which inventory items the add-ons took, so editing this bill can put their stock back
                const addOnStock = addOnStockOf(item);
// Bill/Journal me naam ke saath amount dikhane ke liye
const addOnLines = addOns?.length
    ? addOns.map((a: { name: string; price?: number }) => ({ name: a.name, price: Number(a.price) || 0 }))
    : undefined;
return {
    ...rest,
    name: `${baseName}${addOnText}`,
    ...(addOnStock.length > 0 ? { addOnStock } : {}),
    ...(addOnLines ? { addOnLines } : {}),
} as SalesItem;
            });

            return calculateFinalizedSaleItems(itemsWithTierNames, {
                isRoundingEnabled,
                roundingInterval,
                finalGstScheme,
                finalTaxType,
                currentTaxRate,
                billRatio,
            });
        };

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

        const lineConsumptions = isRestaurant ? items.map(i => lineConsumptionOf(i)) : [];
        const finalizedItemsRaw = formatItemsForDB(items);
        // calculateFinalizedSaleItems nayi object banata hai, to addOnStock yahin wapas jodo (same order, isliye index se)
        const finalizedItems = finalizedItemsRaw.length === items.length
            ? finalizedItemsRaw.map((fi, idx) => {
    const src: any = items[idx];
    const linked = addOnStockOf(src);
    const lines = src.addOns?.length
        ? src.addOns.map((a: any) => ({ name: a.name, price: Number(a.price) || 0 }))
        : src.addOnLines;
    const rawCons = isRestaurant ? lineConsumptions[idx] : undefined;
    const { _origQuantity: _dropOrig, ...fiClean } = fi as any;
    return {
        ...fiClean,
        ...(linked.length > 0 && !(fi as any).addOnStock ? { addOnStock: linked } : {}),
        ...(lines?.length && !(fi as any).addOnLines ? { addOnLines: lines } : {}),
        // Restaurant mode only: retail bill lines stay exactly as before (no rawConsumption key)
        ...(isRestaurant ? { rawConsumption: rawCons?.length ? rawCons : null } : {}),
    };
})
            : finalizedItemsRaw;

        // 3. Re-calculate total Tax and Taxable Amount from the finalized items
        const newTaxableAmount = toCurrency(finalizedItems.reduce((acc, item) => acc + item.taxableAmount, 0));
        const newTaxAmount = toCurrency(finalizedItems.reduce((acc, item) => acc + item.taxAmount, 0));

        // 4. Calculate perfect roundOff to ensure Database matches UI exactly
        const totalExpenseAmount = completionData.expenses?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0;

        // 4. Calculate perfect roundOff to ensure Database matches UI exactly
        const rawInvoiceTotal = newTaxableAmount + newTaxAmount + totalExpenseAmount;
        const finalRoundOff = toCurrency(finalInvoiceTotal - rawInvoiceTotal);

        // --- LOYALTY POINTS ---
        // What this bill should do to the customer's points now. The drawer only
        // sends a selection when loyalty is on and the customer has a 10-digit phone.
        const loyaltySel = loyaltyEnabled ? completionData.loyalty : undefined;
        const nextLoyalty: SaleLoyalty | null = loyaltySel && (loyaltySel.earnPoints > 0 || loyaltySel.redeemPoints > 0)
            ? {
                phone: loyaltySel.phone,
                earned: loyaltySel.earnPoints,
                redeemed: loyaltySel.redeemPoints,
                redeemValue: loyaltySel.redeemValue,
                ...(loyaltySel.overridden ? { autoEarned: loyaltySel.autoEarned, overriddenBy: currentUser.uid } : {}),
            }
            : null;
        // undefined = leave the sale's `loyalty` field as it is (loyalty switched off).
        // `let`: an edit of a bill saved before loyalty existed adjusts it in the transaction below.
        let loyaltyField: SaleLoyalty | null | undefined = loyaltyEnabled ? nextLoyalty : undefined;
        const loyaltyActor = { uid: currentUser.uid, name: currentUser.name || '' };
        const loyaltyNames = nextLoyalty ? { [nextLoyalty.phone]: completionData.partyName || '' } : {};
        let loyaltyBalanceAfter: number | null = null;

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
                // Which customer's fixed pricing was applied on this bill (null when none)
                customerPricingId: items.find(i => i.customerPricingFor)?.customerPricingFor ?? null,
            };
            if (loyaltyField !== undefined) saleData.loyalty = loyaltyField;

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
                    // Loyalty reads first — Firestore needs every read before the first write.
                    // The old loyalty is read from the saved bill, not the copy we navigated with.
                    let loyaltyPlan: ReturnType<typeof planLoyaltyForSave> = [];
                    let loyaltyAccounts = new Map<string, LoyaltyAccountState>();
                    if (loyaltyEnabled) {
                        const saleSnap = await transaction.get(doc(db, "companies", resolvedCompanyId, "sales", invoiceToEdit.id));
                        const prevLoyalty = saleSnap.exists() ? readSaleLoyalty(saleSnap.data()) : null;
                        // A bill saved before loyalty existed never earned — editing it now must
                        // not hand out points for the whole old bill. Points used on it still count.
                        const isLegacyBill = saleSnap.exists() && !('loyalty' in saleSnap.data());
                        let editNext = nextLoyalty;
                        if (isLegacyBill && editNext) {
                            editNext = editNext.redeemed > 0
                                ? { phone: editNext.phone, earned: 0, redeemed: editNext.redeemed, redeemValue: editNext.redeemValue }
                                : null;
                        }
                        loyaltyField = editNext;
                        loyaltyPlan = planLoyaltyForSave(prevLoyalty, editNext, {
                            refType: 'edit',
                            refId: invoiceToEdit.id,
                            invoiceNumber: invoiceNumber.trim(),
                        });
                        loyaltyAccounts = await readLoyaltyPlanInTxn(transaction, db, resolvedCompanyId, loyaltyPlan);
                    }

                    await saveOperation(transaction, false, invoiceToEdit.id);
                    writeLoyaltyPlanInTxn(transaction, db, resolvedCompanyId, loyaltyPlan, loyaltyAccounts, {
                        names: loyaltyNames,
                        actor: loyaltyActor,
                    });

                    if (isRestaurant) {
                        const oldCons = totalConsumption((invoiceToEdit.items || []).map((oldItem: any) => oldItem.rawConsumption));
                        const newCons = totalConsumption(lineConsumptions);
                        const diffs = diffConsumption(oldCons, newCons);
                        const editDateMs = getParsedInvoiceDate().getTime();
                        diffs.forEach((d, rawMaterialId) => {
                            const rm = rawMaterialMap.get(rawMaterialId);
                            // A raw material deleted since the bill was made: nothing to update (would fail the whole save)
                            if (!rm) return;
                            queueMovement(transaction, resolvedCompanyId, {
                                rawMaterialId,
                                rawMaterialName: rm?.name || rawMaterialId,
                                type: 'consumed',
                                qty: -d,
                                locationId: KITCHEN_ID,
                                locationName: KITCHEN_NAME,
                                date: editDateMs,
                                refType: 'sale',
                                refId: invoiceToEdit.id,
                                refNo: invoiceNumber.trim(),
                                unitCost: unitCostOf(rm),
                                note: 'Invoice edited',
                            });
                        });
                    } else {
                        const oldQuantities = new Map<string, number>();
                        (invoiceToEdit.items || []).forEach((oldItem: any) => {
                            const pid = oldItem.productId || oldItem.id;
                            const oldQty = (oldItem.quantity || 1) * (oldItem.tierQuantity || 1);
                            oldQuantities.set(pid, (oldQuantities.get(pid) || 0) + oldQty);
                            addOnStockOf(oldItem).forEach((a: { itemId: string; qty: number }) =>
                                oldQuantities.set(a.itemId, (oldQuantities.get(a.itemId) || 0) + a.qty * (oldItem.quantity || 1)));
                        });

                        const newQuantities = new Map<string, number>();
                        items.forEach(newItem => {
                            const pid = newItem.productId || newItem.id;
                            if (pid) {
                                const newQty = (newItem.quantity || 1) * (newItem.tierQuantity || 1);
                                newQuantities.set(pid, (newQuantities.get(pid) || 0) + newQty);
                                addOnStockOf(newItem).forEach(a =>
                                    newQuantities.set(a.itemId, (newQuantities.get(a.itemId) || 0) + a.qty * (newItem.quantity || 1)));
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
                    }
                });

                if (!isRestaurant) {
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
                }
                clearSalesReportCache(currentUser?.companyId);
                showSuccessModal("Invoice Updated", ROUTES.JOURNAL);

            } else {
                let result: any = null;
                await runTransaction(db, async (transaction) => {
                    // Loyalty reads first — Firestore needs every read before the first write.
                    const loyaltyPlan = planLoyaltyForSave(null, nextLoyalty, { refType: 'sale' });
                    const loyaltyAccounts = await readLoyaltyPlanInTxn(transaction, db, resolvedCompanyId, loyaltyPlan);

                    result = await saveOperation(transaction, true);

                    // Throws LoyaltyBalanceError if the customer no longer has enough
                    // points — which aborts the whole transaction, bill included.
                    const balances = writeLoyaltyPlanInTxn(transaction, db, resolvedCompanyId, loyaltyPlan, loyaltyAccounts, {
                        names: loyaltyNames,
                        actor: loyaltyActor,
                        ref: { refId: result?.id, invoiceNumber: result?.number },
                    });
                    loyaltyBalanceAfter = nextLoyalty ? (balances.get(nextLoyalty.phone) ?? null) : null;

                    if (isRestaurant) {
                        const totals = totalConsumption(lineConsumptions);
                        const saleDateMs = getParsedInvoiceDate().getTime();
                        totals.forEach((qty, rawMaterialId) => {
                            const rm = rawMaterialMap.get(rawMaterialId);
                            if (qty > 0 && rm) {
                                queueMovement(transaction, resolvedCompanyId, {
                                    rawMaterialId,
                                    rawMaterialName: rm?.name || rawMaterialId,
                                    type: 'consumed',
                                    qty: -qty,
                                    locationId: KITCHEN_ID,
                                    locationName: KITCHEN_NAME,
                                    date: saleDateMs,
                                    refType: 'sale',
                                    refId: result?.id,
                                    refNo: result?.number,
                                    unitCost: unitCostOf(rm),
                                });
                            }
                        });
                    } else {
                        // One stock update per product: sold items + linked add-on items (e.g. a Coke sold with a burger)
                        const deductions = new Map<string, number>();
                        items.forEach(i => {
                            const pid = i.productId || i.id;
                            if (pid && !i.isCustomAmount) {
                                deductions.set(pid, (deductions.get(pid) || 0) + (i.quantity || 1) * (i.tierQuantity || 1));
                                addOnStockOf(i).forEach(a =>
                                    deductions.set(a.itemId, (deductions.get(a.itemId) || 0) + a.qty * (i.quantity || 1)));
                            }
                        });
                        deductions.forEach((qty, pid) => {
                            const itemRef = doc(db, "companies", resolvedCompanyId, "items", pid);
                            transaction.update(itemRef, { stock: firebaseIncrement(-qty), updatedAt: serverTimestamp() });
                        });
                    }

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
                        narration: completionData.narration || '',
                        transportDetails: completionData.transportDetails || undefined,
                        gstScheme: finalGstScheme,   // ✅ ADDED
                        taxType: finalTaxType,       // ✅ ADDED
                        placeOfSupply: completionData.placeOfSupply || '',  // ✅ ADDED (IGST calc ke liye bhi zaroori)
                        shippingState: completionData.shippingState || '',
                        loyalty: nextLoyalty
                            ? { ...nextLoyalty, balance: loyaltyBalanceAfter }
                            : null,
                    };

                    if (!isRestaurant) {
                        setAvailableItems(prev => prev.map(item => {
                            const stockDelta = items
                                .filter(i => (i.productId || i.id) === item.id && !i.isCustomAmount)
                                .reduce((sum, i) => sum + (i.quantity || 1), 0);
                            if (stockDelta === 0) return item;
                            return { ...item, stock: Math.max(0, (item.stock || 0) - stockDelta) };
                        }));
                    }

                    clearSalesReportCache(currentUser?.companyId);
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

            if (e instanceof LoyaltyBalanceError) {
                // Re-throw so the payment drawer stays open (with the customer and
                // payments still filled in) and shows this message.
                throw new Error(`${e.message} The points may have been used on another bill — please lower the points used.`);
            } else if (typeof e?.message === 'string' && e.message.startsWith('INVOICE_NUMBER_TAKEN:')) {
                const takenNumber = e.message.split(':')[1];

                // Move the counter past the duplicate(s) so the next save works.
                try {
                    const nextNum = await advanceInvoiceCounterPastDuplicates(resolvedCompanyId);
                    setInvoiceNumber(nextNum);
                } catch (advanceErr) {
                    console.error("Failed to advance invoice counter:", advanceErr);
                }
                setModal({
                    message: `Invoice number ${takenNumber} is repeating. Moved to the next available number — please save again.`,
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
