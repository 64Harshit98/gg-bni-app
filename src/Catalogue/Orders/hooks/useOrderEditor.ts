import { useState, useEffect, useMemo } from 'react';
import {
    doc,
    getDoc,
    updateDoc,
    serverTimestamp,
    increment as firebaseIncrement,
    setDoc,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { State } from '../../../enums';
import type { Item } from '../../../constants/models';
import type { Order } from '../orders.types';
import { computeOrderTotals, computeLineTax, isTaxEnabled as computeIsTaxEnabled, resolveUnitPrice } from '../orders.calculations';

// ─── Live MOQ lookup for items currently in the order being edited ─────────
// Moved verbatim from Orders.tsx (was module-level `useLiveMoqMapHook`).
export const useLiveMoqMapHook = (
    companyId: string | undefined,
    editingOrder: Order | null
): Record<string, number> => {
    const [moqMap, setMoqMap] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!companyId || !editingOrder?.items?.length) {
            setMoqMap({});
            return;
        }

        let cancelled = false;

        const fetchMoqs = async () => {
            const entries: [string, number][] = await Promise.all(
                editingOrder.items!.map(async (item): Promise<[string, number]> => {
                    const itemId = item.itemId || item.id;
                    if (!itemId) return [item.id, 0];

                    try {
                        const itemSnap = await getDoc(
                            doc(db, 'companies', companyId, 'items', itemId)
                        );

                        if (itemSnap.exists()) {
                            const data = itemSnap.data();
                            return [item.id, Number(data.moq ?? 0)];
                        }
                    } catch (err) {
                        console.warn(`[MOQ] fetch failed for ${itemId}:`, err);
                    }

                    return [item.id, 0];
                })
            );

            if (!cancelled) setMoqMap(Object.fromEntries(entries));
        };

        fetchMoqs();
        return () => { cancelled = true; };
    }, [companyId, editingOrder?.id]);

    return moqMap;
};

interface UseOrderEditorParams {
    companyId: string | undefined;
    currentUser: any;
    Orders: Order[];
    salesSettings: any;
    enableItemWiseDiscount: boolean;
    enableDiscount2: boolean;
    enableTransportDetails: boolean;
    setModal: (modal: { message: string; type: State } | null) => void;
}

// Owns all state/handlers for the "edit order" modal flow: the edit form
// state itself, item-level edit math, expenses/discount/transport handling,
// and the Firestore-writing save/credit-note/refund handlers.
export const useOrderEditor = ({
    companyId,
    currentUser,
    Orders,
    salesSettings,
    setModal,
}: UseOrderEditorParams) => {
    const [activeTab, setActiveTab] = useState<'billing' | 'shipping'>('billing');
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [editExpenses, setEditExpenses] = useState<{ id: number; name: string; amount: number | '' }[]>([]);
    const [cartSearchQuery, setCartSearchQuery] = useState<string>('');
    const [editDiscount, setEditDiscount] = useState<number>(0);
    const [editDiscountPercent, setEditDiscountPercent] = useState<number>(0);
    const [showBillDiscountFields, setShowBillDiscountFields] = useState<boolean>(false);
    const [showTransportModal, setShowTransportModal] = useState(false);
    const [transportName, setTransportName] = useState('');
    const [grRrNo, setGrRrNo] = useState('');
    const [grRrDate, setGrRrDate] = useState('');
    const [vehicleNo, setVehicleNo] = useState('');
    const [stationFrom, setStationFrom] = useState('');
    const [pinCode, setPinCode] = useState('');
    const hasTransportDetails = !!(transportName || grRrNo || grRrDate || vehicleNo || stationFrom || pinCode);
    const [pendingAdjustment, setPendingAdjustment] = useState<{ amount: number } | null>(null);
    const [showAdjustmentPopup, setShowAdjustmentPopup] = useState(false);
    const [showZeroAmountModal, setShowZeroAmountModal] = useState(false);
    const [pendingZeroOrderId, setPendingZeroOrderId] = useState<string | null>(null);
    const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
    const [selectedItemForEdit, setSelectedItemForEdit] = useState<any>(null);

    const liveMoqMap = useLiveMoqMapHook(companyId, editingOrder);

    // ─── Opens the editor for a given order, restoring saved expenses/discount/
    // transport details — moved verbatim from the card's pencil-edit button.
    const openEditor = (Order: Order) => {
        setEditingOrder(Order);
        setSelectedItemForEdit(null);
        setCartSearchQuery('');
        // Restore saved expenses
        setEditExpenses(
            Array.isArray((Order as any).expenses) && (Order as any).expenses.length > 0
                ? (Order as any).expenses.map((ex: any) => ({ ...ex, id: ex.id || Date.now() }))
                : []
        );
        // Restore saved discount
        const savedDiscount = Number((Order as any).manualDiscount || 0);
        setEditDiscount(savedDiscount);
        // Restore saved transport details
        const savedTransport = (Order as any).transportDetails || {};
        setTransportName(savedTransport.transportName || '');
        setGrRrNo(savedTransport.grRrNo || '');
        setGrRrDate(savedTransport.grRrDate || '');
        setVehicleNo(savedTransport.vehicleNo || '');
        setStationFrom(savedTransport.stationFrom || '');
        setPinCode(savedTransport.pinCode || '');
        const itemsBase = (Order.items || []).reduce((sum, item) => {
            const salesPrice = Number(item.salesPrice || 0);
            const mrp = Number(item.mrp || 0);
            const price = item.finalPrice ?? (salesPrice > 0 ? salesPrice : mrp);
            return sum + price * Number(item.quantity || 0);
        }, 0);
        setEditDiscountPercent(itemsBase > 0 ? parseFloat(((savedDiscount / itemsBase) * 100).toFixed(2)) : 0);
        setShowBillDiscountFields(savedDiscount > 0);
    };

    const calculatedEditTotal = useMemo(() => {
        if (!editingOrder?.items) return 0;
        return computeOrderTotals(
            editingOrder.items,
            editExpenses,
            editDiscount,
            computeIsTaxEnabled(salesSettings)
        ).total;
    }, [editingOrder?.items, editExpenses, editDiscount, salesSettings]);

    const handleNetPriceChange = (id: string, value: string) => {
        if (!editingOrder) return;
        const newNetPrice = Number(value) || 0;

        const updatedItems = editingOrder.items?.map((item) => {
            if (item.id !== id) return item;

            const mrp = Number(item.mrp || 0);
            const salesPrice = Number(item.salesPrice || 0);
            const basePrice = mrp > 0 ? mrp : salesPrice;

            let discount = 0;
            if (basePrice > 0) {
                discount = ((basePrice - newNetPrice) / basePrice) * 100;
            }

            // Recalculate line total (Base + Tax)
            const qty = Number(item.quantity || 1);
            const taxRate = Number(item.tax ?? item.taxRate ?? 0);
            const taxType = (item.taxType || '').toLowerCase();
            const isExclusive = taxType === 'exclusive' || taxType === 'regular';

            const lineBase = newNetPrice * qty;
            const lineTax = isExclusive ? lineBase * (taxRate / 100) : 0;
            const newFinalPrice = lineBase + lineTax;

            return {
                ...item,
                effectiveUnitPrice: Number(newNetPrice.toFixed(2)),
                customPrice: Number(newNetPrice.toFixed(2)),
                finalPrice: Number(newFinalPrice.toFixed(2)),
                discount: Number(discount.toFixed(2)),
            };
        });

        setEditingOrder({ ...editingOrder, items: updatedItems });
    };

    const mappedOrderItems = (editingOrder?.items || []).map((item) => {
        const dbMrp = Number(item.mrp || 0);
        const salePrice = Number(item.salesPrice || 0);

        // 1. If MRP is 0, use the Sale Price as the base reference so the UI doesn't show "₹0"
        const basePrice = dbMrp > 0 ? dbMrp : salePrice;

        // 2. Extract the pure UNIT price, NEVER the line total (finalPrice)
        let netPrice = item.effectiveUnitPrice ?? item.customPrice ?? salePrice ?? dbMrp ?? 0;

        let discount = Number(item.discount ?? 0);
        const liveMoq = liveMoqMap[item.id] ?? Number(item.moq ?? 0);

        // Only recalculate discount% from net price when there is NO discount2
        // If discount2 exists, trust the stored discount value to avoid cascade corruption
        const discount2 = Number(item.discount2 ?? 0);
        if (basePrice > 0 && netPrice > 0 && discount2 === 0) {
            discount = ((basePrice - netPrice) / basePrice) * 100;
        }

        return {
            ...item,
            productId: item.itemId || item.id,
            isEditable: true,
            discount: Number(discount.toFixed(2)),
            discount2: Number(item.discount2 ?? 0),
            customPrice: Number(netPrice.toFixed(2)), // <-- Ensures CartList uses the Unit Price
            finalPrice: item.finalPrice,              // Keeps the DB Line Total intact
            mrp: basePrice,                           // <-- Fixes the "MRP ₹0" visual bug
            unitMultiplier: Number(item.unitMultiplier || 1),
            moq: liveMoq,
        };
    });
    // 👈 NEW: when the user types in the item search bar, bring matching cart items to the top
    // (same "search bumps result to top" behavior as the main Orders search)
    const displayedOrderItems = useMemo(() => {
        const q = cartSearchQuery.trim().toLowerCase();
        if (!q) return mappedOrderItems;

        return [...mappedOrderItems].sort((a, b) => {
            const aMatch = (a.name || '').toLowerCase().includes(q);
            const bMatch = (b.name || '').toLowerCase().includes(q);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0; // keep original relative order otherwise
        });
    }, [mappedOrderItems, cartSearchQuery]);

    const handleQuantityChange = (id: string, newQuantity: number) => {
        if (!editingOrder) return;

        const updatedItems = editingOrder.items?.map((item) => {
            if (item.id !== id) return item;

            const moq = Number(item.moq ?? 0);
            const minQty = moq > 0 ? moq : 1;

            let qty = Number(newQuantity);

            if (isNaN(qty) || qty < minQty) qty = minQty;

            return {
                ...item,
                quantity: qty,
            };
        });

        setEditingOrder({
            ...editingOrder,
            items: updatedItems || [],
        });
    };

    const handleDiscountChange = (id: string, value: number | string) => {
        if (!editingOrder) return;
        const discountValue = typeof value === "string" ? parseFloat(value) || 0 : value;

        const updatedItems = editingOrder.items?.map((item) => {
            if (item.id !== id) return item;

            const mrp = Number(item.mrp || 0);
            const salesPrice = Number(item.salesPrice || 0);
            const basePrice = mrp > 0 ? mrp : salesPrice;

            const priceAfterDiscount1 = basePrice * (1 - discountValue / 100);
            const discount2 = Number(item.discount2 ?? 0);
            const newNetPrice = priceAfterDiscount1 * (1 - discount2 / 100);

            const taxRate = Number(item.tax || item.taxRate || 0);
            const taxType = (item.taxType || '').toLowerCase();

            const qty = Number(item.quantity || 1);
            const lineTotal = newNetPrice * qty;

            let newFinalPrice = lineTotal;
            if (taxType === 'exclusive' || taxType === 'regular') {
                newFinalPrice = lineTotal + (lineTotal * (taxRate / 100));
            }

            return {
                ...item,
                discount: Number(discountValue.toFixed(2)),
                effectiveUnitPrice: Number(newNetPrice.toFixed(2)),
                customPrice: Number(newNetPrice.toFixed(2)),
                finalPrice: Number(newFinalPrice.toFixed(2)),
            };
        });

        setEditingOrder({ ...editingOrder, items: updatedItems });
    };
    const handleDiscount2Change = (id: string, value: number | string) => {
        if (!editingOrder) return;
        const discount2Value = typeof value === "string" ? parseFloat(value) || 0 : value;

        const updatedItems = editingOrder.items?.map((item) => {
            if (item.id !== id) return item;

            const mrp = Number(item.mrp || 0);
            const salesPrice = Number(item.salesPrice || 0);
            const basePrice = mrp > 0 ? mrp : salesPrice;

            const discount1 = Number(item.discount ?? 0);
            const priceAfterDiscount1 = basePrice * (1 - discount1 / 100);
            const newNetPrice = priceAfterDiscount1 * (1 - discount2Value / 100);

            const taxRate = Number(item.tax || item.taxRate || 0);
            const taxType = (item.taxType || '').toLowerCase();

            const qty = Number(item.quantity || 1);
            const lineTotal = newNetPrice * qty;

            let newFinalPrice = lineTotal;
            if (taxType === 'exclusive' || taxType === 'regular') {
                newFinalPrice = lineTotal + (lineTotal * (taxRate / 100));
            }

            return {
                ...item,
                discount2: Number(discount2Value.toFixed(2)),
                effectiveUnitPrice: Number(newNetPrice.toFixed(2)),
                customPrice: Number(newNetPrice.toFixed(2)),
                finalPrice: Number(newFinalPrice.toFixed(2)),
            };
        });

        setEditingOrder({ ...editingOrder, items: updatedItems });
    };
    const handleDeleteItem = (id: string) => {
        if (!editingOrder) return;

        const updatedItems = editingOrder.items?.filter(
            (item) => item.id !== id
        );

        setEditingOrder({
            ...editingOrder,
            items: updatedItems,
        });
    };

    // useEffect(() => {
    //     if (!editingOrder || !currentUser?.companyId) return;

    //     setEditingOrder(prev =>
    //         prev ? { ...prev, totalAmount: calculatedEditTotal } : prev
    //     );
    // }, [calculatedEditTotal]);

    // ─── Add-new-item handler (SearchableItemInput's onItemSelected inside the
    // edit modal) — moved verbatim from the inline JSX handler. ──────────────
    const handleAddItem = (selectedItem: Item) => {
        if (!selectedItem.id || !editingOrder) return;

        const newMrp = Number(selectedItem.mrp || 0);
        const newSalesPrice = Number(selectedItem.salesPrice || 0);
        const presetDiscount = Number(selectedItem.discount || 0);

        let finalNetPrice = 0;
        let calculatedDiscount = 0;

        // 1. Calculate the exact unit price and discount
        if (newMrp > 0 && newSalesPrice > 0) {
            finalNetPrice = newSalesPrice;
            calculatedDiscount = ((newMrp - newSalesPrice) / newMrp) * 100;
        } else if (newSalesPrice > 0) {
            calculatedDiscount = presetDiscount;
            finalNetPrice = newSalesPrice * (1 - (presetDiscount / 100));
        } else if (newMrp > 0) {
            calculatedDiscount = presetDiscount;
            finalNetPrice = newMrp * (1 - (presetDiscount / 100));
        }

        const qty = selectedItem.moq && selectedItem.moq > 0 ? selectedItem.moq : 1;
        const taxRate = Number(selectedItem.tax ?? selectedItem.taxRate ?? 0);

        // --- FIX: Inherit the Tax Type from the existing order ---
        // Look at the first item in the order to see if this bill is Inclusive or Exclusive
        const savedTaxType = (editingOrder?.items && editingOrder.items.length > 0)
            ? (editingOrder.items[0].taxType || 'Exclusive')
            : 'Exclusive';

        const activeTaxType = savedTaxType.toLowerCase();

        // 2. Calculate the item's line total with exclusive tax if needed
        const lineBase = finalNetPrice * qty;
        let lineFinalPrice = lineBase;

        if (taxRate > 0 && (activeTaxType === 'exclusive' || activeTaxType === 'regular')) {
            lineFinalPrice = lineBase + (lineBase * (taxRate / 100));
        }

        const newItem: any = {
            ...selectedItem,
            id: crypto.randomUUID(),
            itemId: selectedItem.id,
            productId: selectedItem.id,
            name: selectedItem.name,
            quantity: qty,
            mrp: newMrp,
            salesPrice: newSalesPrice,
            effectiveUnitPrice: Number(finalNetPrice.toFixed(2)),
            customPrice: Number(finalNetPrice.toFixed(2)),
            discount: Number(calculatedDiscount.toFixed(2)),
            discount2: 0,
            unitMultiplier: selectedItem.unitMultiplier ?? 1,
            note: "",
            itemGroupId: selectedItem.itemGroupId,
            moq: selectedItem.moq ?? 0,
            tax: taxRate,
            taxRate: taxRate,
            taxType: savedTaxType, // Assign the inherited taxType
            imageUrl: selectedItem.imageUrl || "",
            imageBase64: "",
            unitPrice: Number(finalNetPrice.toFixed(2)),
            finalPrice: Number(lineFinalPrice.toFixed(2)),
        };

        const updatedItems = [newItem, ...(editingOrder.items || [])];

        // 3. Recalculate the entire order total, factoring in the new item's tax.
        // Note: never gated on isTaxEnabled in the original — preserved via
        // taxEnabled=true unconditionally.
        const finalNewTotal = computeOrderTotals(
            updatedItems,
            editingOrder.expenses || [],
            Number(editingOrder.manualDiscount || 0),
            true
        ).total;

        setEditingOrder({ ...editingOrder, items: updatedItems, totalAmount: finalNewTotal });
    };

    // ─── Expense add/edit/remove handlers — moved verbatim from the inline
    // JSX handlers in the Expenses & Discount section. ──────────────────────
    const handleAddExpense = () => {
        setEditExpenses(prev => [...prev, { id: Date.now(), name: '', amount: '' }]);
    };

    const handleExpenseNameChange = (id: number, value: string) => {
        setEditExpenses(prev => prev.map(ex => ex.id === id ? { ...ex, name: value } : ex));
    };

    const handleExpenseAmountChange = (id: number, value: string) => {
        const val = parseFloat(value) || '';
        setEditExpenses(prev => prev.map(ex => ex.id === id ? { ...ex, amount: val } : ex));
    };

    const handleRemoveExpense = (id: number) => {
        setEditExpenses(prev => prev.filter(ex => ex.id !== id));
    };

    // ─── Bill-discount %⇄₹ sync handlers — moved verbatim from the inline JSX
    // handlers in the Bill Discount fields. ─────────────────────────────────
    const handleDiscountPercentInputChange = (value: string) => {
        let pct = parseFloat(value) || 0;
        if (pct > 100) pct = 100;
        if (pct < 0) pct = 0;
        setEditDiscountPercent(pct);
        // base = items only (no expenses, no existing discount)
        const base = (editingOrder?.items || []).reduce((sum, item) => {
            const salesPrice = Number(item.salesPrice || 0);
            const mrp = Number(item.mrp || 0);
            const price = item.finalPrice ?? (salesPrice > 0 ? salesPrice : mrp);
            return sum + price * Number(item.quantity || 0);
        }, 0);
        setEditDiscount(parseFloat(((pct / 100) * base).toFixed(2)));
    };

    const handleDiscountAmountInputChange = (value: string) => {
        const amt = parseFloat(value) || 0;
        setEditDiscount(amt);
        const base = (editingOrder?.items || []).reduce((sum, item) => {
            const salesPrice = Number(item.salesPrice || 0);
            const mrp = Number(item.mrp || 0);
            const price = item.finalPrice ?? (salesPrice > 0 ? salesPrice : mrp);
            return sum + price * Number(item.quantity || 0);
        }, 0);
        setEditDiscountPercent(base > 0 ? parseFloat(((amt / base) * 100).toFixed(2)) : 0);
    };

    const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
        if (!selectedItemForEdit || !editingOrder) return;

        const updatePayload: any = { ...updatedItemData };

        // Stock fix
        if (updatePayload.Stock !== undefined) {
            updatePayload.stock = updatePayload.Stock;
            delete updatePayload.Stock;
        }

        Object.keys(updatePayload).forEach((key) => {
            if (updatePayload[key] === undefined) delete updatePayload[key];
        });

        const updatedItems = (editingOrder.items || []).map((item) => {
            if (String(item.id) === String(selectedItemForEdit.id)) {
                const mergedItem = { ...item, ...updatePayload };

                const mrp = Number(mergedItem.mrp || 0);
                const salesPrice = Number(mergedItem.salesPrice || 0);
                const presetDiscount = Number(mergedItem.discount || 0);

                let finalNetPrice = 0;
                let calculatedDiscount = 0;

                // --- 3-TIER LOGIC ---
                if (mrp > 0 && salesPrice > 0) {
                    finalNetPrice = salesPrice;
                    calculatedDiscount = ((mrp - salesPrice) / mrp) * 100;
                } else if (salesPrice > 0) {
                    calculatedDiscount = presetDiscount;
                    finalNetPrice = salesPrice * (1 - (presetDiscount / 100));
                } else if (mrp > 0) {
                    calculatedDiscount = presetDiscount;
                    finalNetPrice = mrp * (1 - (presetDiscount / 100));
                }

                // Using toFixed(2) as a fallback since applyRounding isn't imported here
                mergedItem.finalPrice = Number(finalNetPrice.toFixed(2));
                mergedItem.discount = Number(calculatedDiscount.toFixed(2));

                return mergedItem;
            }
            return item;
        });

        // Note: this recompute was never gated on the company's isTaxEnabled
        // setting in the original code (always taxes items that carry a
        // taxRate) — preserved as-is by passing taxEnabled=true unconditionally.
        const saveSuccessTotals = computeOrderTotals(
            updatedItems,
            editingOrder.expenses || [],
            Number(editingOrder.manualDiscount || 0),
            true
        );
        const dynamicTax = saveSuccessTotals.tax;
        const rawNewTotal = Math.max(0, saveSuccessTotals.raw);
        const finalNewTotal = saveSuccessTotals.total;
        const roundOffAmt = Number((finalNewTotal - rawNewTotal).toFixed(2));

        setEditingOrder((prev) =>
            prev ? { ...prev, items: updatedItems, totalAmount: finalNewTotal } : prev
        );

        if (currentUser?.companyId) {
            const orderRef = doc(db, "companies", currentUser.companyId, "Orders", editingOrder.id);

            const safeItems = updatedItems.map(item => {
                const safeItem = { ...item };
                Object.keys(safeItem).forEach(key => {
                    if (safeItem[key as keyof typeof safeItem] === undefined) {
                        delete safeItem[key as keyof typeof safeItem];
                    }
                });
                return safeItem;
            });

            updateDoc(orderRef, {
                items: safeItems,
                totalAmount: finalNewTotal,
                roundOff: roundOffAmt, // 👇 FIX: Save round off to DB
                totalTax: dynamicTax,
                updatedAt: serverTimestamp(),
            });
        }

        setIsEditDrawerOpen(false);
        setSelectedItemForEdit(null);
    };

    const handleSaveChanges = async () => {
        if (!editingOrder || !currentUser?.companyId) return;
        // ── Zero-amount guard ──────────────────────────────────────────────────
        // Deliberately left as its own formula (not routed through
        // computeOrderTotals): it's a boolean threshold check, not a displayed
        // or persisted total, and it intentionally prefers each item's already
        // -stored finalPrice (tax-inclusive) over recomputing tax fresh.
        const itemsOnlyTotal = (editingOrder.items || []).reduce((sum, item) => {
            // FIX: finalPrice is already the line total
            if (item.finalPrice !== undefined && item.finalPrice !== null) {
                return sum + Number(item.finalPrice);
            }
            const unitPrice = item.effectiveUnitPrice ?? item.customPrice ?? item.salesPrice ?? item.mrp ?? 0;
            return sum + (Number(unitPrice) * Number(item.quantity || 0));
        }, 0);
        const expensesTotal = editExpenses.reduce((sum, e) => sum + (parseFloat(e.amount.toString()) || 0), 0);
        const preCheckTotal = Math.max(0, itemsOnlyTotal + expensesTotal - editDiscount);

        if (preCheckTotal <= 0) {
            setPendingZeroOrderId(editingOrder.id);
            setShowZeroAmountModal(true);
            return;
        }
        // ──────────────────────────────────────────────────────────────────────
        try {
            const orderRef = doc(db, 'companies', companyId!, 'Orders', editingOrder.id);
            const liveOrderSnap = await getDoc(orderRef);
            const originalOrder = liveOrderSnap.exists()
                ? ({ id: editingOrder.id, ...(liveOrderSnap.data() as any) } as any)
                : Orders.find(o => o.id === editingOrder.id);

            const isTaxEnabled = computeIsTaxEnabled(salesSettings);

            // Compare item-based totals so increase/decrease detection is always correct,
            // even if stored totalAmount was stale.
            const originalTotals = computeOrderTotals(
                originalOrder?.items || [],
                Array.isArray(originalOrder?.expenses) ? originalOrder.expenses : [],
                Number(originalOrder?.manualDiscount || 0),
                isTaxEnabled
            );
            const originalTotal = Math.max(0, originalTotals.raw);

            const newTotals = computeOrderTotals(editingOrder.items || [], editExpenses, editDiscount, isTaxEnabled);
            const newTotal = newTotals.total;
            const newTotalTax = newTotals.tax;
            const netDiff = newTotal - originalTotals.total;

            // ── Stock delta calculation (same logic as EditOrderModal) ──────────
            const oldQuantities = new Map<string, number>();
            (originalOrder?.items || []).forEach((oldItem: any) => {
                const pid = oldItem.itemId || oldItem.id;
                const qty = Number(oldItem.quantity || 0) * Number(oldItem.unitMultiplier || 1);
                oldQuantities.set(pid, (oldQuantities.get(pid) || 0) + qty);
            });

            const newQuantities = new Map<string, number>();
            (editingOrder.items || []).forEach((item: any) => {
                const pid = item.itemId || item.id;
                if (pid) {
                    const qty = Number(item.quantity || 0) * Number(item.unitMultiplier || 1);
                    newQuantities.set(pid, (newQuantities.get(pid) || 0) + qty);
                }
            });

            const allPids = new Set([...oldQuantities.keys(), ...newQuantities.keys()]);

            // ── Helper: build the Firestore update payload ──────────────────────
            const buildUpdatePayload = (extraFields: Record<string, any> = {}) => {
                const safeItems = (editingOrder.items || []).map(item => {
                    const safeItem = { ...item };

                    const qty = Number(safeItem.quantity || 0);
                    const unitPrice = resolveUnitPrice(safeItem);
                    const taxRate = Number(safeItem.tax ?? safeItem.taxRate ?? 0);

                    // Recalculate exact item-level tax amounts. Note: unlike the order
                    // total, this per-item breakdown was never gated on the company's
                    // isTaxEnabled setting in the original code — preserved as-is here
                    // (passing taxEnabled=true unconditionally) rather than silently
                    // changing what gets persisted per item.
                    const { taxableAmount, taxAmount, finalPrice } = computeLineTax(unitPrice, qty, safeItem.taxType, taxRate, true);

                    // Save the updated breakdown to the item object
                    safeItem.taxableAmount = Number(taxableAmount.toFixed(2));
                    safeItem.taxAmount = Number(taxAmount.toFixed(2));
                    safeItem.finalPrice = Number(finalPrice.toFixed(2));

                    // Strip undefined values to prevent Firebase errors
                    Object.keys(safeItem).forEach(key => {
                        if (safeItem[key as keyof typeof safeItem] === undefined) {
                            delete safeItem[key as keyof typeof safeItem];
                        }
                    });

                    return safeItem;
                });

                const payload: any = {
                    items: safeItems,
                    totalAmount: newTotal,
                    totalTax: newTotalTax,
                    manualDiscount: editDiscount,
                    expenses: editExpenses.map(({ id, name, amount }) => ({ id, name, amount: parseFloat(amount.toString()) || 0 })),
                    billingDetails: editingOrder.billingDetails || null,
                    shippingDetails: editingOrder.shippingDetails || null,
                    userName: editingOrder.billingDetails?.name || editingOrder.userName || "",
                    userLoginPhone: editingOrder.billingDetails?.phone || editingOrder.userLoginPhone || "",
                    transportDetails: hasTransportDetails ? {
                        transportName: transportName.trim(),
                        grRrNo: grRrNo.trim(),
                        grRrDate: grRrDate.trim(),
                        vehicleNo: vehicleNo.trim(),
                        stationFrom: stationFrom.trim(),
                        pinCode: pinCode.trim(),
                    } : null,
                    updatedAt: serverTimestamp(),
                    ...extraFields,
                };

                // 3. Final top-level sweep to guarantee no undefined values leak through
                Object.keys(payload).forEach(key => {
                    if (payload[key] === undefined) delete payload[key];
                });

                return payload;
            };

            // ── Helper: resolve status after amount change ──────────────────────
            // Replace your existing resolveStatus inside handleSaveChanges with this:
            const resolveStatus = (total: number, paid: number) => {
                const liveStatus = originalOrder?.status || editingOrder.status;

                // RULE 1: Never auto-move from Confirmed or Packed on edit.
                if (liveStatus !== 'Completed' && liveStatus !== 'Paid') {
                    return liveStatus;
                }

                // RULE 2: Auto-move ONLY between Completed (Unpaid) and Paid
                const effectiveDue = total - paid;
                if (effectiveDue <= 0.1) { // 0.1 handles JavaScript float precision bugs
                    return 'Paid';
                } else {
                    return 'Completed';
                }
            };

            // ── Stock updates (runs for all cases) ─────────────────────────────
            const stockUpdatePromises: Promise<void>[] = [];
            allPids.forEach(pid => {
                const diff = (newQuantities.get(pid) || 0) - (oldQuantities.get(pid) || 0);
                if (diff !== 0) {
                    const itemRef = doc(db, 'companies', companyId!, 'items', pid);
                    stockUpdatePromises.push(
                        updateDoc(itemRef, {
                            stock: firebaseIncrement(-diff), // sold more → stock decreases
                            updatedAt: serverTimestamp(),
                        })
                    );
                }
            });

            // CASE 1: Amount reduced -> check due before offering refund (stock still updates)
            const originalPaid = Number(originalOrder?.paidAmount || 0);
            const originalDue = Math.max(0, originalTotal - originalPaid);
            const priceReduction = Math.abs(netDiff);
            const expensesPayload = editExpenses.map(({ id, name, amount }) => ({
                id,
                name,
                amount: parseFloat(amount.toString()) || 0,
            }));
            if (netDiff < 0) {

                if (priceReduction <= originalDue) {
                    // CASE 1A: The reduction just eats into the unpaid Due.
                    // No refund/credit note needed. Just save the new total.
                    await Promise.all([
                        ...stockUpdatePromises,
                        updateDoc(orderRef, buildUpdatePayload({
                            status: resolveStatus(newTotal, originalPaid)
                        })),
                    ]);
                    setEditingOrder(null);
                    setModal({ message: 'Due reduced successfully.', type: State.SUCCESS });
                    return;
                } else {
                    // CASE 1B: The reduction wipes out the Due and digs into the Paid amount.
                    // We ONLY refund the leftover difference.
                    const refundableAmount = priceReduction - originalDue;
                    await Promise.all([
                        ...stockUpdatePromises,
                        updateDoc(orderRef, {
                            expenses: expensesPayload,
                            manualDiscount: editDiscount,
                            transportDetails: hasTransportDetails ? {
                                transportName: transportName.trim(),
                                grRrNo: grRrNo.trim(),
                                grRrDate: grRrDate.trim(),
                                vehicleNo: vehicleNo.trim(),
                                stationFrom: stationFrom.trim(),
                                pinCode: pinCode.trim(),
                            } : null,
                            updatedAt: serverTimestamp(),
                        }),
                    ]);

                    setPendingAdjustment({ amount: refundableAmount });
                    setShowAdjustmentPopup(true);
                    return;
                }
            }

            // CASE 2: Amount increased
            if (netDiff > 0) {
                await Promise.all([
                    ...stockUpdatePromises,
                    updateDoc(orderRef, buildUpdatePayload({
                        status: resolveStatus(newTotal, originalPaid), // <--- FIXED
                        extraDueAmount: netDiff,
                    })),
                ]);
                setEditingOrder(null);
                setModal({ message: `Due Increased: ₹${netDiff.toFixed(2)}`, type: State.SUCCESS });
                return;
            }

            // CASE 3: No amount change (items/qty may still have changed)
            await Promise.all([
                ...stockUpdatePromises,
                updateDoc(orderRef, buildUpdatePayload({
                    status: resolveStatus(newTotal, originalPaid) // <--- FIXED
                })),
            ]);
            setEditingOrder(null);

        } catch (error) {
            console.error('Save error:', error);
            setModal({ message: 'Failed to save changes.', type: State.ERROR });
        }
    };

    // --- Adjustment Handlers ---
    const handleCreditNote = async () => {
        if (!editingOrder || !currentUser?.companyId || !pendingAdjustment) return;
        try {
            const liveOrder = Orders.find(o => o.id === editingOrder.id);
            // Note: never gated on isTaxEnabled in the original — preserved via
            // taxEnabled=true unconditionally.
            const adjustmentTotals = computeOrderTotals(
                editingOrder.items || [],
                editingOrder.expenses || [],
                Number(editingOrder.manualDiscount || 0),
                true
            );
            const dynamicTax = adjustmentTotals.tax;
            const totalAmt = adjustmentTotals.total;
            const paidAmt = Number(liveOrder?.paidAmount || 0);
            const updatedPaidAmt = Math.max(0, paidAmt - pendingAdjustment.amount);
            const effectiveDue = Math.max(0, totalAmt - updatedPaidAmt);

            // --- SMART STATUS LOGIC ---
            const liveStatus = liveOrder?.status || editingOrder.status;
            let updatedStatus = liveStatus;

            // Only alter the status if it's already in the final stages
            if (liveStatus === 'Completed' || liveStatus === 'Paid') {
                updatedStatus = effectiveDue > 0.1 ? 'Completed' : 'Paid';
            }
            // --------------------------
            // 🔧 Sweep undefined values so Firestore doesn't reject the write
            const safeItems = (editingOrder.items || []).map(item => {
                const safeItem = { ...item };
                Object.keys(safeItem).forEach(key => {
                    if (safeItem[key as keyof typeof safeItem] === undefined) {
                        delete safeItem[key as keyof typeof safeItem];
                    }
                });
                return safeItem;
            });
            await updateDoc(
                doc(db, 'companies', currentUser.companyId, 'Orders', editingOrder.id),
                {
                    items: safeItems,
                    totalAmount: totalAmt,
                    totalTax: dynamicTax,
                    expenses: editExpenses.map(({ id, name, amount }) => ({ id, name, amount: parseFloat(amount.toString()) || 0 })),
                    manualDiscount: editDiscount,
                    paidAmount: updatedPaidAmt,
                    status: updatedStatus, // Uses the smart status
                    billingDetails: editingOrder.billingDetails,
                    shippingDetails: editingOrder.shippingDetails,
                    creditNoteAmount: firebaseIncrement(pendingAdjustment.amount),
                    updatedAt: serverTimestamp(),
                }
            );

            // Credit balance update (your existing customer code stays the same)
            try {
                const normalizePhone = (num: string) => num.replace(/\D/g, '').slice(-10);
                const rawNumber = editingOrder.userLoginPhone || editingOrder.billingDetails?.phone || '';
                const customerIdentifier = normalizePhone(rawNumber);
                if (customerIdentifier) {
                    const customerRef = doc(db, 'companies', currentUser.companyId, 'customers', customerIdentifier);
                    const customerName = editingOrder.userName || editingOrder.billingDetails?.name || '';
                    await setDoc(customerRef, {
                        number: customerIdentifier,
                        name: customerName,
                        creditBalance: firebaseIncrement(pendingAdjustment.amount),
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                }
            } catch (err) {
                console.error("Failed to update customer credit balance:", err);
            }

            setShowAdjustmentPopup(false);
            setPendingAdjustment(null);
            setEditingOrder(null);
            setModal({ message: `Credit Note: ₹${pendingAdjustment.amount.toFixed(2)} added`, type: State.SUCCESS });
        } catch (err) {
            console.error("Credit Note Error:", err);
            setModal({ message: "Failed to add credit note.", type: State.ERROR });
        }
    };
    const handleRefund = async () => {
        if (!editingOrder || !currentUser?.companyId || !pendingAdjustment) return;
        try {
            const liveOrder = Orders.find(o => o.id === editingOrder.id);
            // Note: never gated on isTaxEnabled in the original — preserved via
            // taxEnabled=true unconditionally.
            const adjustmentTotals = computeOrderTotals(
                editingOrder.items || [],
                editingOrder.expenses || [],
                Number(editingOrder.manualDiscount || 0),
                true
            );
            const dynamicTax = adjustmentTotals.tax;
            const totalAmt = adjustmentTotals.total;
            const paidAmt = Number(liveOrder?.paidAmount || 0);
            const updatedPaidAmt = Math.max(0, paidAmt - pendingAdjustment.amount);
            const effectiveDue = Math.max(0, totalAmt - updatedPaidAmt);

            // --- SMART STATUS LOGIC ---
            const liveStatus = liveOrder?.status || editingOrder.status;
            let updatedStatus = liveStatus;

            // Only alter the status if it's already in the final stages
            if (liveStatus === 'Completed' || liveStatus === 'Paid') {
                updatedStatus = effectiveDue > 0.1 ? 'Completed' : 'Paid';
            }
            // --------------------------
            // 🔧 Sweep undefined values so Firestore doesn't reject the write
            const safeItems = (editingOrder.items || []).map(item => {
                const safeItem = { ...item };
                Object.keys(safeItem).forEach(key => {
                    if (safeItem[key as keyof typeof safeItem] === undefined) {
                        delete safeItem[key as keyof typeof safeItem];
                    }
                });
                return safeItem;
            });
            await updateDoc(
                doc(db, 'companies', currentUser.companyId, 'Orders', editingOrder.id),
                {
                    items: safeItems,
                    totalAmount: totalAmt,
                    totalTax: dynamicTax,
                    expenses: editExpenses.map(({ id, name, amount }) => ({ id, name, amount: parseFloat(amount.toString()) || 0 })),
                    manualDiscount: editDiscount,
                    paidAmount: updatedPaidAmt,
                    status: updatedStatus, // Uses the smart status
                    billingDetails: editingOrder.billingDetails,
                    shippingDetails: editingOrder.shippingDetails,
                    refundAmount: firebaseIncrement(pendingAdjustment.amount),
                    updatedAt: serverTimestamp(),
                }
            );

            setShowAdjustmentPopup(false);
            setPendingAdjustment(null);
            setEditingOrder(null);
            setModal({ message: `Refund: ₹${pendingAdjustment.amount.toFixed(2)} processed`, type: State.SUCCESS });
        } catch (err) {
            console.error("Refund Error:", err);
            setModal({ message: "Failed to process refund.", type: State.ERROR });
        }
    };

    return {
        activeTab, setActiveTab,
        editingOrder, setEditingOrder,
        editExpenses, setEditExpenses,
        cartSearchQuery, setCartSearchQuery,
        editDiscount, setEditDiscount,
        editDiscountPercent, setEditDiscountPercent,
        showBillDiscountFields, setShowBillDiscountFields,
        showTransportModal, setShowTransportModal,
        transportName, setTransportName,
        grRrNo, setGrRrNo,
        grRrDate, setGrRrDate,
        vehicleNo, setVehicleNo,
        stationFrom, setStationFrom,
        pinCode, setPinCode,
        hasTransportDetails,
        pendingAdjustment, setPendingAdjustment,
        showAdjustmentPopup, setShowAdjustmentPopup,
        showZeroAmountModal, setShowZeroAmountModal,
        pendingZeroOrderId, setPendingZeroOrderId,
        isEditDrawerOpen, setIsEditDrawerOpen,
        selectedItemForEdit, setSelectedItemForEdit,
        liveMoqMap,
        openEditor,
        calculatedEditTotal,
        mappedOrderItems,
        displayedOrderItems,
        handleNetPriceChange,
        handleQuantityChange,
        handleDiscountChange,
        handleDiscount2Change,
        handleDeleteItem,
        handleAddItem,
        handleAddExpense,
        handleExpenseNameChange,
        handleExpenseAmountChange,
        handleRemoveExpense,
        handleDiscountPercentInputChange,
        handleDiscountAmountInputChange,
        handleSaveSuccess,
        handleSaveChanges,
        handleCreditNote,
        handleRefund,
    };
};
