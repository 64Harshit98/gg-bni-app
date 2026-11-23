import { useState } from 'react';
import {
    doc,
    getDoc,
    updateDoc,
    increment,
    runTransaction,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { deriveTaxContext, retaxDraftOrder } from '../../CheckOut/checkOut.calculations';
import type { Order, OrderStatus } from '../orders.types';
import { useOptionalLoyaltySettings } from '../../../context/SettingsContext';
import { setOrderStatusWithLoyalty } from '../orderLoyalty';

// Upcoming → Confirmed: order ko next voucher number do.
// Same counter jo checkout (usePlaceOrder) use karta hai, isliye numbers repeat/skip nahi honge.
// orderNumberAssigned flag se double-click ya retry par number dobara nahi katta.
const assignOrderNumber = async (companyId: string, orderDocId: string): Promise<string | null> => {
    const settingsRef = doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');
    const orderRef = doc(db, 'companies', companyId, 'Orders', orderDocId);

    return runTransaction(db, async (tx) => {
        const [settingsSnap, orderSnap] = await Promise.all([tx.get(settingsRef), tx.get(orderRef)]);
        if (!orderSnap.exists()) return null;

        const existing = orderSnap.data();
        if (existing.orderNumberAssigned) return (existing.orderId as string) || null;

        const s = settingsSnap.exists() ? settingsSnap.data() : {};
        const prefix = s.voucherPrefix || 'SLS-';
        const current = Number(s.currentVoucherNumber || 1001);
        const invoice = `${prefix}${current}`;

        tx.update(orderRef, { orderId: invoice, invoiceNumber: invoice, orderNumberAssigned: true });
        tx.set(settingsRef, { currentVoucherNumber: current + 1, updatedAt: serverTimestamp() }, { merge: true });
        return invoice;
    });
};

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

            // Upcoming → Confirmed: pehle next order number, phir status.
            // Number allocate na ho to order draft id ke saath Confirmed nahi hoga.
            if (nextStatus === "Confirmed" && currentStatus === "Upcoming") {
                const assignedId = await assignOrderNumber(currentUser.companyId, orderId);
                if (!assignedId) return;
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

            // Stock status ke BAAD, background mein: UI ko iska wait nahi karna padta.
            // Cart orders (orderedBy set) ka stock placement par hi kat chuka hota hai.
            // increment() se read-then-write wali race bhi khatam.
            if (nextStatus === "Confirmed" && !orderData.orderedBy) {
                const companyId = currentUser.companyId;
                void Promise.all(
                    ((orderData.items as any[]) || []).map(async (item: any) => {
                        try {
                            const itemId = item.itemId || item.id;
                            if (!itemId) return;
                            const deductQty =
                                Number(item.quantity || 0) * Number(item.unitMultiplier || 1);
                            await updateDoc(
                                doc(db, "companies", companyId, "items", itemId),
                                { stock: increment(-deductQty) }
                            );
                        } catch (err) {
                            console.error("Stock update failed:", err);
                        }
                    })
                );
            }

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
