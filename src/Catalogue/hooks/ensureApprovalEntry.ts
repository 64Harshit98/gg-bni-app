import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/Firebase";

/**
 * Ensures a pending AuthorizedUser entry exists for this customer.
 * Called whenever a customer raises a notify/bulk/query request,
 * regardless of whether requireApproval is currently enabled.
 * This way, if the seller enables approval later, this customer
 * already shows up in the Approval Requests list (pending).
 */
export const ensurePendingApprovalEntry = async (
    companyId: string,
    customerName: string,
    customerNumber: string
) => {
    if (!companyId || !customerNumber) return;

    try {
        const authorizedRef = collection(db, "companies", companyId, "AuthorizedUser");
        const q = query(authorizedRef, where("customerNumber", "==", customerNumber));
        const snap = await getDocs(q);

        // Already exists (pending/approved/declined) — don't touch it
        if (!snap.empty) return;

        // No entry yet — create one as pending
        const newDocRef = doc(authorizedRef); // auto-id
        await setDoc(newDocRef, {
            customerName: customerName || "Guest User",
            customerNumber,
            type: "approval",
            status: "pending",
            businessCard: "Placeholder",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    } catch (err) {
        console.error("ensurePendingApprovalEntry error:", err);
    }
};