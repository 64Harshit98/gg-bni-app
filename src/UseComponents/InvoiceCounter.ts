import { db } from '../lib/firebase';
import { doc, runTransaction, DocumentReference } from 'firebase/firestore';

/**
 * Generates the next invoice number for a specific company.
 * @param companyId The ID of the company to get the counter for.
 */
export const generateNextInvoiceNumber = async (companyId: string): Promise<string> => {
    if (!companyId) {
        throw new Error("A valid companyId must be provided.");
    }

    // --- FIX: Use the multi-tenant path ---
    const counterRef: DocumentReference = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');

    try {
        const newNumber = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let nextNumber = 1001;

            if (counterDoc.exists()) {
                const current = counterDoc.data()?.currentNumber || 1000;
                nextNumber = current + 1;
            }

            // Set the new counter value
            transaction.set(counterRef, { currentNumber: nextNumber }, { merge: true });
            return nextNumber;
        });

        const paddedNumber = String(newNumber).padStart(4, '0');
        return `INV-${paddedNumber}`;

    } catch (error) {
        console.error("Error generating invoice number:", error);
        throw new Error("Could not generate a new invoice number.");
    }
};

/**
 * Generates the next purchase invoice number for a specific company.
 * @param companyId The ID of the company to get the counter for.
 */
export const PurchaseInvoiceNumber = async (companyId: string): Promise<string> => {
    if (!companyId) {
        throw new Error("A valid companyId must be provided.");
    }

    // --- FIX: Use the multi-tenant path ---
    // Note: Your original path was 'counter' (singular), I've kept it here.
    // You may want to standardize on 'counters' (plural).
    const counterRef: DocumentReference = doc(db, 'companies', companyId, 'counter', 'purchaseInvoice');

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
        return `PUR-${paddedNumber}`; // e.g., PUR-1001

    } catch (error) {
        console.error("Error generating purchase invoice number:", error);
        throw new Error("Could not generate a new purchase invoice number.");
    }
};