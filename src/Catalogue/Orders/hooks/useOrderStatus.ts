import { useState } from 'react';
import {
    doc,
    getDoc,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { deriveTaxContext, retaxDraftOrder } from '../../CheckOut/checkOut.calculations';
import type { Order, OrderStatus } from '../orders.types';
import { useOptionalLoyaltySettings } from '../../../context/SettingsContext';
import { setOrderStatusWithLoyalty } from '../orderLoyalty';

interface UseOrderStatusParams {
    Orders: Order[];
    companyId: string | undefined;
    currentUser: any;
}

// Owns the "move order forward/backward through its status pipeline" flow —
// moved verbatim from Orders.tsx (was inline handleUpdateStatus/handlePreviousStatus).
export const useOrderStatus = ({ currentUser }: UseOrderStatusParams) => {
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
    const [selectedOrderForConfirm, setSelectedOrderForConfirm] = useState<string | null>(null);
    const loyaltySettings = useOptionalLoyaltySettings();
    const loyaltyActor = { uid: currentUser?.uid, name: currentUser?.name || '' };

    const handleUpdateStatus = async (
        orderId: string,
        currentStatus: OrderStatus,
        manualNextStatus?: OrderStatus
    ) => {
        if (currentStatus === 'Packed' && !manualNextStatus) {
            setSelectedOrderForConfirm(orderId);
            return;
        }
        setIsUpdatingStatus(orderId);

        try {
            if (!currentUser?.companyId) return;

            const OrderRef = doc(
                db,
                "companies",
                currentUser.companyId,
                "Orders",
                orderId
            );

            // Fetch the latest order data to make smart status decisions
            const orderSnap = await getDoc(OrderRef);
            if (!orderSnap.exists()) return;
            const orderData = orderSnap.data();

            const nextStatusMap: Record<OrderStatus, OrderStatus> = {
                Upcoming: "Confirmed",
                Confirmed: "Packed",
                Packed: "Completed",
                Completed: "Completed",
                Paid: "Paid",
                Cancelled: 'Cancelled',
            };

            let nextStatus = manualNextStatus || nextStatusMap[currentStatus];

            // --- THE FIX ---
            // If moving out of Packed, check if it's already fully paid via Advance
            if (currentStatus === "Packed" && nextStatus === "Completed") {
                const total = Number(orderData.totalAmount || 0);
                const paid = Number(orderData.paidAmount || 0);

                // If Due is 0 (using <= 0.1 to prevent JS decimal bugs), skip Unpaid and go to Paid
                if ((total - paid) <= 0.1) {
                    nextStatus = "Paid";
                }
            }

            //  STOCK DECREASE WHEN CONFIRMED
            // Skip for cart orders — they already deducted stock at placement
            if (nextStatus === "Confirmed") {
                const freshSnap = await getDoc(OrderRef);
                const freshData = freshSnap.data();
                const wasPlacedViaCart = !!freshData?.orderedBy;

                if (!wasPlacedViaCart) {
                    const items = freshData?.items || [];

                    await Promise.all(
                        items.map(async (item: any) => {
                            try {
                                const itemId = item.itemId || item.id;
                                if (!itemId) return;

                                const itemRef = doc(
                                    db,
                                    "companies",
                                    currentUser.companyId,
                                    "items",
                                    itemId
                                );

                                const snap = await getDoc(itemRef);
                                if (!snap.exists()) {
                                    return;
                                }

                                const currentStock = Number(snap.data().stock || 0);

                                const deductQty =
                                    Number(item.quantity || 0) *
                                    Number(item.unitMultiplier || 1);

                                await updateDoc(itemRef, {
                                    stock: currentStock - deductQty
                                });

                            } catch (err) {
                                console.error("Stock update failed:", err);
                            }
                        })
                    );
                }
            }

            // Draft → order: put GST on its lines (current GST settings + each item's current
            // rate). Drafts are saved from the buyer's cart and could carry no / stale tax.
            if (currentStatus === 'Upcoming' && nextStatus === 'Confirmed') {
                try {
                    const companyId = currentUser.companyId;
                    const draftSnap = await getDoc(OrderRef);
                    const draft = draftSnap.data() || {};
                    const settingsSnap = await getDoc(doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings'));
                    const ctx = deriveTaxContext(settingsSnap.exists() ? (settingsSnap.data() as any) : null);
                    const ids = Array.from(new Set((draft.items || []).map((l: any) => String(l.itemId || l.docId || l.id)).filter(Boolean))) as string[];
                    const itemSnaps = await Promise.all(ids.map((id) => getDoc(doc(db, 'companies', companyId, 'items', id))));
                    const rateById = new Map(itemSnaps.filter((s) => s.exists()).map((s) => [s.id, Number(s.data()!.tax ?? 0) || 0]));
                    const retaxed = retaxDraftOrder(draft, ctx, (l) => rateById.get(String(l.itemId || l.docId || l.id)));
                    await updateDoc(OrderRef, { ...retaxed, updatedAt: serverTimestamp() });
                } catch (err) {
                    console.error('Could not add GST to the confirmed draft:', err);
                }
            }

            // Status + loyalty (earn on Completed / Paid) in one transaction
            await setOrderStatusWithLoyalty(
                currentUser.companyId, orderId, nextStatus, loyaltySettings, loyaltyActor, { isLead: false },
            );

        } catch (err) {
            console.error("Error updating status:", err);
        } finally {
            setIsUpdatingStatus(null);
        }
    };

    const handlePreviousStatus = async (
        orderId: string,
        currentStatus: OrderStatus
    ) => {

        const prevStatusMap: Record<OrderStatus, OrderStatus> = {
            Upcoming: "Upcoming",
            Confirmed: "Confirmed",
            Packed: "Confirmed",
            Completed: "Packed",
            Paid: "Completed",
            Cancelled: 'Cancelled',
        };

        const prevStatus = prevStatusMap[currentStatus];

        if (!currentUser?.companyId) return;

        // Moving back out of Completed takes back the points the order earned
        await setOrderStatusWithLoyalty(currentUser.companyId, orderId, prevStatus, loyaltySettings, loyaltyActor);
    };

    return {
        isUpdatingStatus, setIsUpdatingStatus,
        selectedOrderForConfirm, setSelectedOrderForConfirm,
        handleUpdateStatus,
        handlePreviousStatus,
    };
};
