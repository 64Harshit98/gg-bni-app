import { useState, useEffect, useMemo } from 'react';
import {
    doc,
    getDoc,
    updateDoc,
    runTransaction,
    serverTimestamp,
    increment as firebaseIncrement,
} from 'firebase/firestore';
import { loadAliases, groupPhones, loadGroupCredit, deductGroupCredit } from '../../../Pages/Reports/CustomerReportComponents/customerAliases';
import { db } from '../../../lib/Firebase';
import { State } from '../../../enums';
import type { Order } from '../orders.types';
import { useOptionalLoyaltySettings } from '../../../context/SettingsContext';
import { LoyaltyBalanceError, fetchLoyaltyAccount, pointsToRupees } from '../../../lib/loyalty';
import { LOYALTY_ORDER_PAYMENT_KEY, maxOrderRedeemPoints, orderLoyaltyOn, orderLoyaltyPhone, redeemPointsOnOrder, syncOrderEarnedPoints } from '../orderLoyalty';

interface UseOrderPaymentParams {
    currentUser: any;
    companyId: string | undefined;
    setModal: (modal: { message: string; type: State } | null) => void;
    setEnableItemWiseDiscount: (v: boolean) => void;
    setEnableDiscount2: (v: boolean) => void;
    setEnableTransportDetails: (v: boolean) => void;
}

const isLoyaltyMethod = (method: string) => (method || '').toUpperCase() === LOYALTY_ORDER_PAYMENT_KEY;

// Owns the "settle/advance payment" drawer flow — moved verbatim from
// Orders.tsx (was the showPaymentModal/customerCredit state, the
// credit-fetch effect, and the total/due calc + onSubmit inline in the
// <PaymentModal> render).
export const useOrderPayment = ({
    currentUser,
    setModal,
    setEnableItemWiseDiscount,
    setEnableDiscount2,
    setEnableTransportDetails,
}: UseOrderPaymentParams) => {
    const [showPaymentModal, setShowPaymentModal] = useState<Order | null>(null);
    const [customerCredit, setCustomerCredit] = useState<number>(0);
    const loyaltySettings = useOptionalLoyaltySettings();
    const [loyaltyBalance, setLoyaltyBalance] = useState<number>(0);

    // Loyalty balance for the order's customer, when the payment modal opens
    useEffect(() => {
        setLoyaltyBalance(0);
        const phone = orderLoyaltyPhone(showPaymentModal);
        if (!showPaymentModal || !currentUser?.companyId || !phone || !orderLoyaltyOn(loyaltySettings)) return;
        let cancelled = false;
        fetchLoyaltyAccount(db, currentUser.companyId, phone)
            .then((acc) => { if (!cancelled) setLoyaltyBalance(acc?.balance ?? 0); })
            .catch((err) => console.error('Failed to load loyalty points', err));
        return () => { cancelled = true; };
    }, [showPaymentModal, currentUser?.companyId, loyaltySettings]);

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
                        setEnableItemWiseDiscount(
                            data.enableItemWiseDiscount ?? false
                        );
                        setEnableDiscount2(
                            data.enableDiscount2 ?? false
                        );
                        setEnableTransportDetails(
                            data.enableTransportDetails ?? false
                        );
                    }
                    // Merged numbers: sirf is number ka nahi, poore group ka creditBalance.
                    // Merge nahi hai to group me ek hi number hota hai, behaviour pehle jaisa.
                    const aliases = await loadAliases(currentUser.companyId);
                    setCustomerCredit(
                        await loadGroupCredit(currentUser.companyId, aliases, normalizedPhone)
                    );
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

    // Payment due — read directly off the order as saved (checkout/edit-save
    // time), never recomputed from the company's *current* tax settings, so
    // the due amount can't drift from what the bill actually says.
    const { updatedTotal, currentDue, alreadyPaid } = useMemo(() => {
        if (!showPaymentModal) {
            return { updatedTotal: 0, currentDue: 0, alreadyPaid: 0 };
        }

        const updatedTotal = Number(showPaymentModal.totalAmount) || 0;

        // Current paid
        const alreadyPaid = Number(showPaymentModal.paidAmount || 0);

        // FIX: Round the final due amount to prevent long decimals
        const currentDue = Number(Math.max(0, updatedTotal - alreadyPaid).toFixed(2));

        return { updatedTotal, currentDue, alreadyPaid };
    }, [showPaymentModal]);

    const onSubmit = async (_inv: any, amount: number, method: string, paymentDate: string) => {
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
                    const aliases = await loadAliases(currentUser.companyId);
                    if (groupPhones(aliases, normalizedPhone).length > 1) {
                        // Merged numbers: primary pehle, phir baaki numbers ke docs se deduct
                        await runTransaction(db, async (transaction) => {
                            await deductGroupCredit(transaction, currentUser.companyId, aliases, normalizedPhone, amount);
                        });
                    } else {
                        const customerRef = doc(db, 'companies', currentUser.companyId, 'customers', normalizedPhone);
                        await updateDoc(customerRef, {
                            creditBalance: firebaseIncrement(-amount) // Deduct the used amount
                        });
                    }
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

            // Order fields for a payment of `paid` rupees (shared by the normal and the points path)
            const buildPaymentUpdate = (paid: number) => {
                const newPaidTotal = alreadyPaid + paid;
                const remainingDue = Math.max(0, updatedTotal - newPaidTotal);
                const updatedMethods = {
                    ...currentMethods,
                    [methodKey]: (currentMethods[methodKey] || 0) + paid,
                    due: remainingDue // Sync the exact database due amount!
                };

                let status = showPaymentModal.status;
                // FIXED: Only alter the status automatically if it's already in the final stages.
                // Otherwise, keep it in its current tab (Upcoming, Confirmed, Packed).
                if (status === 'Completed' || status === 'Paid') {
                    status = remainingDue <= 0.1 ? 'Paid' : 'Completed';
                }
                return {
                    paidAmount: newPaidTotal,
                    paymentMethods: updatedMethods,
                    paymentMethod: methodKey,
                    status,
                    updatedAt: serverTimestamp(),
                };
            };

            let paidNow = amount;
            let newStatus = buildPaymentUpdate(amount).status;

            if (methodKey === LOYALTY_ORDER_PAYMENT_KEY) {
                if (!loyaltySettings || !orderLoyaltyOn(loyaltySettings)) {
                    setModal({ message: 'Loyalty points are turned off for online orders.', type: State.ERROR });
                    return;
                }
                // Points + order payment in one transaction; amount rounds down to whole points
                paidNow = await redeemPointsOnOrder(
                    currentUser.companyId, showPaymentModal.id, amount, loyaltySettings,
                    { uid: currentUser.uid, name: currentUser.name || '' },
                    (applied) => buildPaymentUpdate(applied),
                );
                newStatus = buildPaymentUpdate(paidNow).status;
                // If the order already earned (Completed), it now earns on less — the part paid with points doesn't earn.
                await syncOrderEarnedPoints(currentUser.companyId, showPaymentModal.id, loyaltySettings, {
                    uid: currentUser.uid,
                    name: currentUser.name || '',
                });
            } else {
                await updateDoc(orderRef, buildPaymentUpdate(amount));
            }

            window.dispatchEvent(
                new CustomEvent('pdc_notification', {
                    detail: {
                        type: 'PAYMENT_RECEIVED',
                        invoiceNumber: showPaymentModal.orderId,
                        partyName: showPaymentModal.userName || showPaymentModal.billingDetails?.name || 'Customer',
                        amount: Number(paidNow || 0),
                        method: methodKey,
                        status: newStatus === 'Paid' ? 'PAID' : 'UPCOMING',
                        createdAt: new Date(paymentDate).toISOString(),
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
            const isLoyaltyError = err instanceof LoyaltyBalanceError || isLoyaltyMethod(method);
            setModal({
                message: isLoyaltyError && err instanceof Error ? `Payment failed: ${err.message}` : "Payment failed",
                type: State.ERROR,
            });
        }
    };

    // What the payment modal needs to offer "Loyalty Points" as a method
    const loyaltyMaxPoints = showPaymentModal
        ? maxOrderRedeemPoints(loyaltyBalance, showPaymentModal as any, currentDue, loyaltySettings)
        : 0;
    const orderLoyalty = loyaltyMaxPoints > 0 && loyaltySettings
        ? {
            balance: loyaltyBalance,
            maxPoints: loyaltyMaxPoints,
            maxValue: pointsToRupees(loyaltyMaxPoints, loyaltySettings),
            pointValue: Number(loyaltySettings.pointValue) || 1,
        }
        : undefined;

    return {
        showPaymentModal, setShowPaymentModal,
        customerCredit,
        orderLoyalty,
        updatedTotal,
        currentDue,
        onSubmit,
    };
};
