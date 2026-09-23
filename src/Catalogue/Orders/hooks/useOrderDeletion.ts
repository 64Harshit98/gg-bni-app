import { useState } from 'react';
import {
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    increment as firebaseIncrement,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { State } from '../../../enums';

interface UseOrderDeletionParams {
    companyId: string | undefined;
    currentUser: any;
    setModal: (modal: { message: string; type: State } | null) => void;
}

// Owns the "delete order" confirm + execute flow — moved verbatim from
// Orders.tsx (was inline handleDeleteOrder).
export const useOrderDeletion = ({ currentUser, setModal }: UseOrderDeletionParams) => {
    const [pendingDeleteOrderId, setPendingDeleteOrderId] = useState<string | null>(null);
    const [pendingDeleteWarning, setPendingDeleteWarning] = useState<string | null>(null);
    const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

    const handleDeleteOrder = async (orderId: string, skipConfirm = false) => {
        if (!skipConfirm) {
            setPendingDeleteOrderId(orderId);

            // Fetch order data to build warning message
            if (currentUser?.companyId) {
                try {
                    const orderRef = doc(db, "companies", currentUser.companyId, "Orders", orderId);
                    const orderSnap = await getDoc(orderRef);
                    if (orderSnap.exists()) {
                        const orderData = orderSnap.data();

                        // Case-insensitive lookup across all payment method keys
                        const creditNotePayment = Object.entries(orderData.paymentMethods || {})
                            .filter(([key]) => key.toLowerCase().includes('credit note') || key.toLowerCase() === 'credit')
                            .reduce((sum, [, val]) => sum + Number(val || 0), 0);

                        const hasCreditNoteReturns = (orderData.returnHistory || []).some((h: any) =>
                            h.modeOfReturn?.toLowerCase().includes('credit note')
                        );

                        let warningMessage = "Are you sure you want to delete this order?";

                        if (creditNotePayment > 0) {
                            warningMessage += `. This order was paid using Credit Note of ${creditNotePayment.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}. The credit note balance will be restored to the customer`;
                        }

                        if (hasCreditNoteReturns) {
                            const creditNoteReturnAmount = (orderData.returnHistory || [])
                                .filter((h: any) => h.modeOfReturn?.toLowerCase().includes('credit note'))
                                .reduce((sum: number, h: any) => sum + (Number(h.finalBalance) || 0), 0);

                            if (creditNotePayment > 0) {
                                warningMessage += ` and the returned items' Credit Note of ${creditNoteReturnAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} will be removed from the customer`;
                            } else {
                                warningMessage += `. This order contains Credit Note returns of ${creditNoteReturnAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} which will be removed from the customer`;
                            }
                        }

                        warningMessage += ".";

                        // Store the custom message to show in the modal
                        setPendingDeleteWarning(warningMessage);
                    }
                } catch (err) {
                    console.error("Warning fetch error:", err);
                    setPendingDeleteWarning(null);
                }
            }

            setShowDeleteConfirmModal(true);
            return;
        }
        if (!currentUser?.companyId) return;

        try {
            const companyId = currentUser.companyId;

            const orderRef = doc(db, "companies", companyId, "Orders", orderId);
            const orderSnap = await getDoc(orderRef);

            if (!orderSnap.exists()) {
                throw new Error("Order not found");
            }

            const orderData = orderSnap.data();
            const items = orderData.items || [];


            // Restore stock
            for (const item of items) {
                const itemId = item.itemId || item.id;
                if (!itemId) {
                    console.warn(" Missing itemId:", item);
                    continue;
                }

                const itemRef = doc(
                    db,
                    "companies",
                    companyId,
                    "items",
                    itemId
                );

                const itemSnap = await getDoc(itemRef);

                if (!itemSnap.exists()) {
                    console.warn("Item not found:", itemId);
                    continue;
                }

                const currentStock = Number(itemSnap.data().stock || 0);
                const restoreQty = Number(item.quantity || 0) * Number(item.unitMultiplier || 1);

                await updateDoc(itemRef, {
                    stock: currentStock + restoreQty,
                });

                // Tell MyShop to increase the stock in the UI
                window.dispatchEvent(new CustomEvent('local_stock_update', {
                    detail: {
                        itemId: String(itemId),
                        delta: restoreQty
                    }
                }));
            }
            // ── Credit Note Adjustment ─────────────────────────────────────────
            // Credit used to PAY this order → restore it back to customer on delete
            const creditNotePayment = Object.entries(orderData.paymentMethods || {})
                .filter(([key]) => key.toLowerCase().includes('credit note') || key.toLowerCase() === 'credit')
                .reduce((sum, [, val]) => sum + Number(val || 0), 0);

            const creditNoteReturns = (orderData.returnHistory || [])
                .filter((h: any) => h.modeOfReturn?.toLowerCase().includes('credit note'))
                .reduce((sum: number, h: any) => sum + (Number(h.finalBalance) || 0), 0);
            const netCreditAdjustment = creditNotePayment - creditNoteReturns;

            const partyPhone = (orderData.userLoginPhone || orderData.billingDetails?.phone || '')
                .replace(/\D/g, '').slice(-10);

            if (netCreditAdjustment !== 0 && partyPhone) {
                const customerRef = doc(db, 'companies', companyId, 'customers', partyPhone);
                await updateDoc(customerRef, {
                    creditBalance: firebaseIncrement(netCreditAdjustment)
                }).catch(() => {
                    // Customer doc may not exist — safe to ignore
                });
            }
            // ──────────────────────────────────────────────────────────────────
            // Delete order
            await deleteDoc(orderRef);

            // setModal({
            //     message: "Order deleted successfully",
            //     type: State.SUCCESS,
            // });
        } catch (error) {
            console.error("Delete Order Error:", error);
            setModal({
                message: "Failed to delete order",
                type: State.ERROR,
            });
        }
    };

    return {
        pendingDeleteOrderId, setPendingDeleteOrderId,
        pendingDeleteWarning, setPendingDeleteWarning,
        showDeleteConfirmModal, setShowDeleteConfirmModal,
        handleDeleteOrder,
    };
};
