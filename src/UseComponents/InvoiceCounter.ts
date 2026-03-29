import { db } from '../lib/Firebase';
import { doc, runTransaction, DocumentReference, getDoc } from 'firebase/firestore';

/**
 * Generates the next invoice number for a specific company.
 * @param companyId The ID of the company to get the counter for.
 */
export const peekNextInvoiceNumber = async (companyId: string): Promise<string> => {
    if (!companyId) throw new Error("A valid companyId must be provided.");

    const settingsRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');
    const counterRef = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');

    // Simple getDocs (no transaction, no writes)
    const [settingsSnap, counterSnap] = await Promise.all([
        getDoc(settingsRef),
        getDoc(counterRef)
    ]);

    const prefix = settingsSnap.exists() ? (settingsSnap.data().voucherPrefix || 'INV') : 'INV';
    const nextNumber = counterSnap.exists() ? (counterSnap.data().currentNumber || 1) : 1;

    return `${prefix}-${nextNumber}`;
};

// 2. WRITE: Use this inside your handleSavePayment logic
export const incrementInvoiceCounter = async (companyId: string) => {
    const counterRef = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');
    await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const nextNumber = counterDoc.exists() ? (counterDoc.data().currentNumber || 1) : 1;
        transaction.set(counterRef, { currentNumber: nextNumber + 1 }, { merge: true });
    });
};

/**
 * Generates the next purchase invoice number for a specific company.
 * @param companyId The ID of the company to get the counter for.
 */
// 1. READ ONLY: Use this for the useEffect/Frontend display
export const peekNextPurchaseNumber = async (companyId: string): Promise<string> => {
    const settingsRef = doc(db, 'companies', companyId, 'settings', 'purchase-settings');
    const counterRef = doc(db, 'companies', companyId, 'counters', 'purchaseCounter');

    const [settingsSnap, counterSnap] = await Promise.all([
        getDoc(settingsRef),
        getDoc(counterRef)
    ]);

    const prefix = settingsSnap.exists() ? (settingsSnap.data().voucherPrefix || 'INV') : 'INV';
    const nextNumber = counterSnap.exists() ? (counterSnap.data().currentNumber || 1) : 1;

    return `${prefix}-${nextNumber}`;
};

// 2. WRITE: Call this ONLY inside createNewPurchase when saving
export const incrementPurchaseCounter = async (companyId: string) => {
    const counterRef = doc(db, 'companies', companyId, 'counters', 'purchaseCounter');
    await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const nextNumber = counterDoc.exists() ? (counterDoc.data().currentNumber || 1) : 1;
        transaction.set(counterRef, { currentNumber: nextNumber + 1 }, { merge: true });
    });
};
export const OrderInvoiceNumber = async (companyId: string): Promise<string> => {
    if (!companyId) {
        throw new Error("A valid companyId must be provided.");
    }

    // --- FIX: Use the multi-tenant path ---
    // Note: Your original path was 'counter' (singular), I've kept it here.
    // You may want to standardize on 'counters' (plural).
    const counterRef: DocumentReference = doc(db, 'companies', companyId, 'counters', 'orderInvoice');

    try {
        const newNumber = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let nextNumber = 1001;

            if (counterDoc.exists()) {
                const current = counterDoc.data()?.currentNumber || 1000;
                nextNumber = current + 1;
            }

            transaction.set(counterRef, { currentNumber: nextNumber }, { merge: true });
            return nextNumber;
        });

        const paddedNumber = String(newNumber).padStart(4, '0');
        // --- FIX: Recommend changing prefix to distinguish from sales invoices ---
        return `ORD-${paddedNumber}`; // e.g., ORD-1001

    } catch (error) {
        console.error("Error generating order invoice number:", error);
        throw new Error("Could not generate a new order invoice number.");
    }
};