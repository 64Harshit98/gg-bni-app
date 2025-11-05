import { db } from '../lib/Firebase';
import { doc, runTransaction, DocumentReference } from 'firebase/firestore';


export const companyId = async (): Promise<string> => {
    const counterRef: DocumentReference = doc(db, 'CompanyID', 'counter');

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

        return `CMP-${paddedNumber}`;

    } catch (error) {
        console.error("Error generating Company ID:", error);
        throw new Error("Could not generate a new Company ID.");
    }
};