import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';

// Counts pending customer requests (bulk-quote/personalization/notify, or
// pending-approval users if the company requires approval) shown as a badge
// on the "Customer Requests" nav link. Moved verbatim from Orders.tsx.
export const usePendingRequestCount = (companyId: string | undefined) => {
    const [pendingRequestCount, setPendingRequestCount] = useState(0);

    useEffect(() => {
        if (!companyId) return;

        const fetchPendingRequests = async () => {
            try {
                // 1. Fetch settings
                const settingsSnap = await getDoc(
                    doc(db, "companies", companyId, "settings", "catalogue-sales-settings")
                );

                const requireApproval = settingsSnap.exists()
                    ? settingsSnap.data()?.requireApproval === true
                    : false;

                if (requireApproval) {
                    // 🚀 OPTIMIZATION: Query only 'pending' users on the server side
                    const pendingQuery = query(
                        collection(db, "companies", companyId, "AuthorizedUser"),
                        where("status", "==", "pending")
                    );

                    const approvalSnap = await getDocs(pendingQuery);

                    // .size is slightly more efficient than .docs.length
                    setPendingRequestCount(approvalSnap.size);

                } else {
                    // Note: Fetching entire collections here will still cost 1 read per document.
                    // If these collections get very large, consider maintaining a counter document instead.
                    const [notifySnap, bulkSnap, personalizationSnap] = await Promise.all([
                        getDocs(collection(db, "companies", companyId, "NotifyRequests")),
                        getDocs(collection(db, "companies", companyId, "BulkQuoteRequests")),
                        getDocs(collection(db, "companies", companyId, "PersonalizationRequests")),
                    ]);

                    const notifyPhones = new Set(
                        notifySnap.docs.map((d: any) =>
                            (d.data()?.customerNumber || "").replace(/\D/g, "")
                        )
                    );

                    const unmatchedPhones = new Set<string>();

                    bulkSnap.docs.forEach((d: any) => {
                        const phone = (d.data()?.customerNumber || "").replace(/\D/g, "");
                        if (phone && !notifyPhones.has(phone)) unmatchedPhones.add(phone);
                    });

                    personalizationSnap.docs.forEach((d: any) => {
                        const phone = (d.data()?.customerNumber || "").replace(/\D/g, "");
                        if (phone && !notifyPhones.has(phone)) unmatchedPhones.add(phone);
                    });

                    setPendingRequestCount(notifySnap.size + unmatchedPhones.size);
                }
            } catch (err) {
                console.error("Pending request fetch error:", err);
            }
        };

        fetchPendingRequests();
    }, [companyId]);

    return pendingRequestCount;
};
