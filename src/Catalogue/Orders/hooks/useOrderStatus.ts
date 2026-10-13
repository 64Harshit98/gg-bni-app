import { useState } from 'react';
import {
    doc,
    getDoc,
    updateDoc,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import type { Order, OrderStatus } from '../orders.types';

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

            await updateDoc(OrderRef, {
                status: nextStatus,
                isLead: false,
                updatedAt: serverTimestamp()
            });

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

        const OrderRef = doc(
            db,
            "companies",
            currentUser.companyId,
            "Orders",
            orderId
        );

        await updateDoc(OrderRef, {
            status: prevStatus,
            updatedAt: serverTimestamp()
        });
    };

    return {
        isUpdatingStatus, setIsUpdatingStatus,
        selectedOrderForConfirm, setSelectedOrderForConfirm,
        handleUpdateStatus,
        handlePreviousStatus,
    };
};
