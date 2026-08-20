import { useState } from 'react';
import { doc, collection, serverTimestamp, increment, runTransaction } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import type { CartItem, Address } from '../checkOut.types';
import { buildOrderLineItems, computeOrderLevelTotals } from '../checkOut.calculations';

interface UsePlaceOrderParams {
    effectiveCompanyId: string | null;
    billing: Address;
    shipping: Address;
    isSameAsShipping: boolean;
    cartItems: CartItem[];
    setCartItems: (items: CartItem[]) => void;
    specialInstruction: string;
    scheme: string;
    taxType: string;
    applyExclusiveTax: boolean;
    setShowAlert: (show: boolean) => void;
}

// Owns order placement — moved verbatim from CheckOut.tsx's CartPage body
// (isPlacing/orderSuccess/placedOrderId state, the placeOrder Firestore
// transaction — money-critical: creates the order doc, increments the
// voucher counter, deducts item stock).
export const usePlaceOrder = ({
    effectiveCompanyId,
    billing,
    shipping,
    isSameAsShipping,
    cartItems,
    setCartItems,
    specialInstruction,
    scheme,
    taxType,
    applyExclusiveTax,
    setShowAlert,
}: UsePlaceOrderParams) => {
    const [isPlacing, setIsPlacing] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState(false);
    const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

    const placeOrder = async () => {
        // Immediate lock to prevent double-clicks
        if (isPlacing || cartItems.length === 0) return;

        // Basic address validation
        const billingValid = billing.name?.trim() && billing.phone?.length === 10 && billing.address?.trim() && billing.city?.trim() && billing.state?.trim();
        const shippingValid = isSameAsShipping ? billingValid : (shipping.name?.trim() && shipping.phone?.length === 10 && shipping.address?.trim()) && shipping.city?.trim() && shipping.state?.trim();

        if (!billingValid || !shippingValid) {
            setShowAlert(true);
            return;
        }

        setIsPlacing(true);

        try {
            const settingsRef = doc(db, "companies", effectiveCompanyId!, "settings", "catalogue-sales-settings");
            const ordersRef = collection(db, 'companies', effectiveCompanyId!, 'Orders');

            // ATOMIC TRANSACTION: Only one place where the number increases
            // ATOMIC TRANSACTION: Create order, increment voucher, deduct stock
            const finalInvoiceNumber = await runTransaction(db, async (transaction) => {
                const settingsSnap = await transaction.get(settingsRef);

                // 1. READ ALL ITEMS FIRST (Firestore Transaction Rule)
                const itemRefs = cartItems.map(item => doc(db, 'companies', effectiveCompanyId!, 'items', String(item.id)));
                const itemSnaps = await Promise.all(itemRefs.map(ref => transaction.get(ref)));

                let prefix = "SLS-";
                let currentNumber = 1001;

                if (settingsSnap.exists()) {
                    const sData = settingsSnap.data();
                    prefix = sData.voucherPrefix || "SLS-";
                    currentNumber = sData.currentVoucherNumber || 1001;
                }

                const invoice = `${prefix}${currentNumber}`;
                const newOrderDoc = doc(ordersRef);
                const leadData = JSON.parse(localStorage.getItem("leadData") || "{}");
                const fallbackPhone = (leadData.number || "").replace(/\D/g, "").trim();

                // 2. WRITE: Create the final order — the full bill snapshot (items,
                // tax breakdown, scheme/taxType, discount, expenses) is computed
                // once here, exactly as Sales computes and saves its invoice at
                // payment time. Every other screen reads these persisted fields
                // instead of recomputing from the company's *current* settings, so
                // this order's numbers stay fixed unless the bill is itself edited.
                const orderItems = buildOrderLineItems(cartItems, scheme, taxType, applyExclusiveTax);
                const orderTotals = computeOrderLevelTotals(orderItems, [], 0);

                // Upsert a standalone customer master record — same collection/path
                // Sales writes to (companies/{id}/customers/{phone}), covered by a
                // dedicated public-write rule in firestore.rules since checkout is
                // an unauthenticated storefront. This way the customer's details
                // survive even if this order is later deleted — deleting an order
                // only ever removes the order doc itself, never the customer doc.
                const customerPhone = (billing.phone || fallbackPhone || "").replace(/\D/g, "").slice(-10);
                const customerIdentifier = customerPhone || billing.name?.trim();
                if (customerIdentifier) {
                    const customerRef = doc(db, 'companies', effectiveCompanyId!, 'customers', customerIdentifier);
                    const customerSnap = await transaction.get(customerRef);
                    const customerData: Record<string, any> = {
                        name: billing.name || leadData.name || "",
                        number: customerPhone || "",
                        companyId: effectiveCompanyId,
                        address: billing.address || "",
                        state: billing.state || "",
                        gstNumber: billing.gstin || "",
                        updatedAt: serverTimestamp(),
                        lastOrderAt: serverTimestamp(),
                    };
                    if (!customerSnap.exists() || !customerSnap.data()?.createdAt) {
                        customerData.createdAt = serverTimestamp();
                    }
                    Object.keys(customerData).forEach(key => {
                        if (customerData[key] === undefined) delete customerData[key];
                    });
                    transaction.set(customerRef, customerData, { merge: true });
                }

                transaction.set(newOrderDoc, {
                    orderId: invoice,
                    invoiceNumber: invoice,
                    status: 'Confirmed',
                    isLead: false,
                    userName: billing.name || leadData.name || "",
                    userLoginPhone: billing.phone || fallbackPhone || "",
                    totalAmount: orderTotals.total,
                    roundOff: orderTotals.roundOff,
                    totalTax: Number(orderTotals.tax.toFixed(2)),
                    baseAmount: Number(orderTotals.itemsBase.toFixed(2)),
                    manualDiscount: 0,
                    expenses: [],
                    gstScheme: scheme,
                    taxType: taxType,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    specialInstruction: specialInstruction || "",
                    items: orderItems,
                    billingDetails: billing,
                    shippingDetails: isSameAsShipping ? billing : shipping,
                    orderedBy: localStorage.getItem("upcoming_user_key"),
                });

                // 3. WRITE: Increment the counter
                transaction.update(settingsRef, {
                    currentVoucherNumber: increment(1),
                    updatedAt: serverTimestamp()
                });

                // 4. WRITE: Deduct the stock for each item (Using raw quantity)
                itemSnaps.forEach((snap, index) => {
                    if (snap.exists()) {
                        const currentStock = Number(snap.data().stock || 0);
                        const deductQty = Number(cartItems[index].quantity);

                        transaction.update(snap.ref, {
                            // 👇 FIX: Allow negative stock numbers
                            stock: currentStock - deductQty,
                            updatedAt: serverTimestamp()
                        });
                    }
                });

                return invoice;
            });

            // SUCCESS CLEANUP
            localStorage.removeItem('temp_cart');
            const upcomingUserKey = localStorage.getItem("upcoming_user_key");
            if (upcomingUserKey && effectiveCompanyId) {
                try {
                    const { deleteDoc, doc: firestoreDoc } = await import('firebase/firestore');
                    const draftRef = firestoreDoc(db, "companies", effectiveCompanyId, "Orders", `upcoming_${upcomingUserKey}`);
                    await deleteDoc(draftRef);
                } catch (err) {
                    console.warn("Could not delete upcoming draft:", err);
                }
            }
            localStorage.removeItem("upcoming_user_key");
            // localStorage.removeItem("leadSubmitted");
            // localStorage.removeItem("leadData");
            setPlacedOrderId(finalInvoiceNumber);
            setOrderSuccess(true);

            // Tell MyShop to decrease the stock in the UI (Zero Firebase Reads!)
            cartItems.forEach(item => {
                window.dispatchEvent(new CustomEvent('local_stock_update', {
                    detail: {
                        itemId: String(item.id),
                        delta: -Number(item.quantity)
                    }
                }));
            });

            setCartItems([]);

        } catch (e) {
            console.error("Critical Transaction Error:", e);
            alert("Failed to place order. No numbers were skipped.");
        } finally {
            setIsPlacing(false);
        }
    };

    return { isPlacing, orderSuccess, placedOrderId, placeOrder };
};
