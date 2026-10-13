import { db } from '../lib/Firebase';
import { doc, runTransaction, DocumentReference, getDoc } from 'firebase/firestore';

/**
 * Returns Indian Financial Year string for internal tracking only.
 * Not shown in the invoice number — just used to detect year change.
 */
export const getFinancialYear = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const month = date.getMonth(); // Jan=0 ... Apr=3
    if (month >= 3) {
        return `${year}-${String(year + 1).slice(-2)}`; // Apr-Dec
    } else {
        return `${year - 1}-${String(year).slice(-2)}`; // Jan-Mar
    }
};

interface CounterData {
    currentNumber: number;
    financialYear: string;
}
/**
 * Generates the next invoice number for a specific company.
 * @param companyId The ID of the company to get the counter for.
 */
export const peekNextInvoiceNumber = async (companyId: string): Promise<string> => {
    if (!companyId) throw new Error("A valid companyId must be provided.");

    const settingsRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');
    const counterRef = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');

    const [settingsSnap, counterSnap] = await Promise.all([
        getDoc(settingsRef),
        getDoc(counterRef)
    ]);

    const prefix = settingsSnap.exists() ? (settingsSnap.data().voucherPrefix || 'INV') : 'INV';
    const currentFY = getFinancialYear();

    let nextNumber = 1;
    if (counterSnap.exists()) {
        const data = counterSnap.data() as CounterData;
        // agar stored FY current FY se match nahi karti, naye saal ka counter 1 se start
        nextNumber = data.financialYear === currentFY ? (data.currentNumber || 1) : 1;
    }

    return `${prefix}-${nextNumber}`;
};

// 2. WRITE: Use this inside your handleSavePayment logic
export const incrementInvoiceCounter = async (companyId: string) => {
    const counterRef = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');
    const currentFY = getFinancialYear();

    await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);

        let nextNumber = 1;
        if (counterDoc.exists()) {
            const data = counterDoc.data() as CounterData;
            nextNumber = data.financialYear === currentFY ? (data.currentNumber || 1) : 1;
        }

        // merge:false zaroori hai warna purani financialYear field reh sakti hai
        transaction.set(
            counterRef,
            { currentNumber: nextNumber + 1, financialYear: currentFY },
            { merge: false }
        );
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
    const currentFY = getFinancialYear();

    let nextNumber = 1;
    if (counterSnap.exists()) {
        const data = counterSnap.data() as CounterData;
        nextNumber = data.financialYear === currentFY ? (data.currentNumber || 1) : 1;
    }

    return `${prefix}-${nextNumber}`;
};

// 2. WRITE: Call this ONLY inside createNewPurchase when saving
export const incrementPurchaseCounter = async (companyId: string) => {
    const counterRef = doc(db, 'companies', companyId, 'counters', 'purchaseCounter');
    const currentFY = getFinancialYear();

    await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);

        let nextNumber = 1;
        if (counterDoc.exists()) {
            const data = counterDoc.data() as CounterData;
            nextNumber = data.financialYear === currentFY ? (data.currentNumber || 1) : 1;
        }

        transaction.set(
            counterRef,
            { currentNumber: nextNumber + 1, financialYear: currentFY },
            { merge: false }
        );
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
    const currentFY = getFinancialYear();

    try {
        const newNumber = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let nextNumber = 1001;

            if (counterDoc.exists()) {
                const data = counterDoc.data() as CounterData;
                if (data.financialYear === currentFY) {
                    const current = data.currentNumber || 1000;
                    nextNumber = current + 1;
                }
                // FY badal gaya to nextNumber 1001 hi rahega (reset)
            }

            transaction.set(
                counterRef,
                { currentNumber: nextNumber, financialYear: currentFY },
                { merge: false }
            );
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