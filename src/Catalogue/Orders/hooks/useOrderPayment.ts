import { useState, useEffect, useMemo } from 'react';
import {
    doc,
    getDoc,
    updateDoc,
    serverTimestamp,
    increment as firebaseIncrement,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { State } from '../../../enums';
import type { Order } from '../orders.types';
import { computeOrderTotals, isTaxEnabled as computeIsTaxEnabled } from '../orders.calculations';

interface UseOrderPaymentParams {
    currentUser: any;
    companyId: string | undefined;
    salesSettings: any;
    setModal: (modal: { message: string; type: State } | null) => void;
    setEnableItemWiseDiscount: (v: boolean) => void;
    setEnableDiscount2: (v: boolean) => void;
    setEnableTransportDetails: (v: boolean) => void;
}

// Owns the "settle/advance payment" drawer flow — moved verbatim from
// Orders.tsx (was the showPaymentModal/customerCredit state, the
// credit-fetch effect, and the total/due calc + onSubmit inline in the
// <PaymentModal> render).
export const useOrderPayment = ({
    currentUser,
    salesSettings,
    setModal,
    setEnableItemWiseDiscount,
    setEnableDiscount2,
    setEnableTransportDetails,
}: UseOrderPaymentParams) => {
    const [showPaymentModal, setShowPaymentModal] = useState<Order | null>(null);
    const [customerCredit, setCustomerCredit] = useState<number>(0);

    // Fetch customer credit when the Payment Modal opens
    useEffect(() => {
        const fetchCredit = async () => {
            if (!showPaymentModal || !currentUser?.companyId) {
                setCustomerCredit(0);
                return;
            }

            const phone = showPaymentModal.userLoginPhone || showPaymentModal.billingDetails?.phone || '';
            const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

            if (normalizedPhone) {
                try {
                    // ✅ Sirf customers collection — advance wahan store ho gaya
                    const customerRef = doc(
                        db,
                        'companies',
                        currentUser.companyId,
                        'customers',
                        normalizedPhone
                    );
                    const snap = await getDoc(customerRef);
                    if (snap.exists()) {
                        const data = snap.data();
                        setCustomerCredit(Number(data.creditBalance || 0));
                        setEnableItemWiseDiscount(
                            data.enableItemWiseDiscount ?? false
                        );
                        setEnableDiscount2(
                            data.enableDiscount2 ?? false
                        );
                        setEnableTransportDetails(
                            data.enableTransportDetails ?? false
                        );
                    } else {
                        setCustomerCredit(0);
                    }
                } catch (err) {
                    console.error("Error fetching credit balance:", err);
                    setCustomerCredit(0);
                }
            } else {
                setCustomerCredit(0);
            }
        };

        fetchCredit();
    }, [showPaymentModal, currentUser?.companyId]);

    // Payment due — same canonical formula as the edit modal and card
    // preview, kept at 2-decimal precision (not whole-rupee rounded)
    // since that's what this drawer showed before.
    const { updatedTotal, currentDue, alreadyPaid } = useMemo(() => {
        if (!showPaymentModal) {
            return { updatedTotal: 0, currentDue: 0, alreadyPaid: 0 };
        }

        const discTotal = Number(showPaymentModal.manualDiscount || 0);
        const paymentTotals = computeOrderTotals(
            showPaymentModal.items,
            showPaymentModal.expenses,
            discTotal,
            computeIsTaxEnabled(salesSettings)
        );
        const updatedTotal = Number(Math.max(0, paymentTotals.raw).toFixed(2));

        // Current paid
        const alreadyPaid = Number(showPaymentModal.paidAmount || 0);

        // FIX: Round the final due amount to prevent long decimals
        const currentDue = Number(Math.max(0, updatedTotal - alreadyPaid).toFixed(2));

        return { updatedTotal, currentDue, alreadyPaid };
    }, [showPaymentModal, salesSettings]);

    const onSubmit = async (_inv: any, amount: number, method: string) => {
        try {
            if (!currentUser?.companyId || !showPaymentModal) return;

            const methodKey = method ? method.toUpperCase() : 'CASH';

            // 🛑 FIX: Prevent settling if amount exceeds available credit
            if (methodKey === 'CREDIT NOTE' || methodKey === 'CREDIT') {
                if (amount > customerCredit) {
                    setModal({
                        message: `Insufficient Credit Balance. Available: ₹${customerCredit.toFixed(2)}`,
                        type: State.ERROR,
                    });
                    return; // Stop the payment from processing
                }

                const phone = showPaymentModal.userLoginPhone || showPaymentModal.billingDetails?.phone || '';
                const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

                if (normalizedPhone) {
                    const customerRef = doc(db, 'companies', currentUser.companyId, 'customers', normalizedPhone);
                    await updateDoc(customerRef, {
                        creditBalance: firebaseIncrement(-amount) // Deduct the used amount
                    });
                }
            }

            const orderRef = doc(
                db,
                'companies',
                currentUser.companyId,
                'Orders',
                showPaymentModal.id
            );
            // --------------------------------------------------------

            const currentMethods = showPaymentModal.paymentMethods || {};

            const newPaidTotal = alreadyPaid + amount;
            const remainingDue = Math.max(0, updatedTotal - newPaidTotal);

            const updatedMethods = {
                ...currentMethods,
                [methodKey]: (currentMethods[methodKey] || 0) + amount,
                due: remainingDue // Sync the exact database due amount!
            };

            let newStatus = showPaymentModal.status;

            // FIXED: Only alter the status automatically if it's already in the final stages.
            // Otherwise, keep it in its current tab (Upcoming, Confirmed, Packed).
            if (newStatus === 'Completed' || newStatus === 'Paid') {
                if (remainingDue <= 0.1) {
                    newStatus = 'Paid';
                } else {
                    newStatus = 'Completed';
                }
            }

            await updateDoc(orderRef, {
                paidAmount: newPaidTotal,
                paymentMethods: updatedMethods,
                paymentMethod: methodKey,
                status: newStatus,
                updatedAt: serverTimestamp(),
            });

            window.dispatchEvent(
                new CustomEvent('pdc_notification', {
                    detail: {
                        type: 'PAYMENT_RECEIVED',
                        invoiceNumber: showPaymentModal.orderId,
                        partyName: showPaymentModal.userName || showPaymentModal.billingDetails?.name || 'Customer',
                        amount: Number(amount || 0),
                        method: methodKey,
                        status: newStatus === 'Paid' ? 'PAID' : 'UPCOMING',
                        createdAt: new Date().toISOString(),
                    },
                })
            );

            setShowPaymentModal(null);
            setModal({
                message: "Payment successful!",
                type: State.SUCCESS,
            });

        } catch (err) {
            console.error("Payment Error:", err);
            setModal({
                message: "Payment failed",
                type: State.ERROR,
            });
        }
    };

    return {
        showPaymentModal, setShowPaymentModal,
        customerCredit,
        updatedTotal,
        currentDue,
        onSubmit,
    };
};
