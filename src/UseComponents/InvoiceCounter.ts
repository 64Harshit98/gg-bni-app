import { db } from '../lib/Firebase';
import { doc, runTransaction, DocumentReference } from 'firebase/firestore';

/**
 * Generates the next invoice number for a specific company.
 * @param companyId The ID of the company to get the counter for.
 */
export const generateNextInvoiceNumber = async (companyId: string): Promise<string> => {
    if (!companyId) throw new Error("A valid companyId must be provided.");

    const settingsRef: DocumentReference = doc(db, 'companies', companyId, 'settings', 'sales-settings');
    const counterRef: DocumentReference = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');

    try {
        return await runTransaction(db, async (transaction) => {
            // 1. Get Prefix from Settings
            const settingsDoc = await transaction.get(settingsRef);
            let prefix = 'INV';
            if (settingsDoc.exists() && settingsDoc.data().voucherPrefix !== undefined) {
                prefix = settingsDoc.data().voucherPrefix;
            }

            // 2. Get Sequence from Counter DB
            const counterDoc = await transaction.get(counterRef);
            let nextNumber = 1;
            if (counterDoc.exists() && counterDoc.data().currentNumber !== undefined) {
                nextNumber = counterDoc.data().currentNumber;
            }

            const finalVoucherNumber = `${prefix}-${nextNumber}`;

            // 3. Update ONLY the Counter DB
            transaction.set(counterRef, { currentNumber: nextNumber + 1 }, { merge: true });

            return finalVoucherNumber;
        });
    } catch (error) {
        console.error("Error generating invoice number:", error);
        throw new Error("Could not generate a new invoice number.");
    }
};

/**
 * Generates the next purchase invoice number for a specific company.
 * @param companyId The ID of the company to get the counter for.
 */
export const generateNextPurchaseNumber = async (companyId: string): Promise<string> => {
    if (!companyId) throw new Error("A valid companyId must be provided.");

    // Point to the purchase settings and purchase counter
    const settingsRef: DocumentReference = doc(db, 'companies', companyId, 'settings', 'purchase-settings');
    const counterRef: DocumentReference = doc(db, 'companies', companyId, 'counters', 'purchaseCounter');

    try {
        return await runTransaction(db, async (transaction) => {
            // 1. Get Prefix from Settings
            const settingsDoc = await transaction.get(settingsRef);
            let prefix = 'INV';
            if (settingsDoc.exists() && settingsDoc.data().voucherPrefix !== undefined) {
                prefix = settingsDoc.data().voucherPrefix;
            }

            // 2. Get Sequence from Counter DB
            const counterDoc = await transaction.get(counterRef);
            let nextNumber = 1;
            if (counterDoc.exists() && counterDoc.data().currentNumber !== undefined) {
                nextNumber = counterDoc.data().currentNumber;
            }

            const finalVoucherNumber = `${prefix}-${nextNumber}`;

            // 3. Increment the Counter DB automatically
            transaction.set(counterRef, { currentNumber: nextNumber + 1 }, { merge: true });

            return finalVoucherNumber;
        });
    } catch (error) {
        console.error("Error generating purchase number:", error);
        throw new Error("Could not generate a new purchase number.");
    }
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