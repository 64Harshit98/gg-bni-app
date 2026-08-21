import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';

// Matches whatever date range the Orders page's own filter currently
// resolves to — so the badge always agrees with "View All Requests", which
// now hands that same range to RequestPage.tsx instead of it resetting to
// its own default 'today' filter. Pass null/null for no bound (RequestPage's
// 'all' filter equivalent).
const isCreatedInRange = (createdAt: any, start: Date | null, end: Date | null): boolean => {
    if (!createdAt?.toDate) return false;
    if (!start && !end) return true;
    const itemDate: Date = createdAt.toDate();
    if (start && itemDate < start) return false;
    if (end && itemDate > end) return false;
    return true;
};

// Counts pending customer requests (bulk-quote/personalization/notify, or
// pending-approval users if the company requires approval) shown as a badge
// on the "Customer Requests" nav link. Moved verbatim from Orders.tsx, later
// extended to filter by the same date range as the Orders page instead of a
// fixed range, so the badge, the click-through, and the Requests page it
// lands on always agree with each other and with the Orders page's own
// active filter.
export const usePendingRequestCount = (
    companyId: string | undefined,
    startDate: Date | null = null,
    endDate: Date | null = null,
) => {
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

                    const inRangeCount = approvalSnap.docs.filter((d) => isCreatedInRange(d.data()?.createdAt, startDate, endDate)).length;
                    setPendingRequestCount(inRangeCount);

                } else {
                    // Note: Fetching entire collections here will still cost 1 read per document.
                    // If these collections get very large, consider maintaining a counter document instead.
                    const [notifySnap, bulkSnap, personalizationSnap] = await Promise.all([
                        getDocs(query(collection(db, "companies", companyId, "NotifyRequests"), limit(2000))),
                        getDocs(query(collection(db, "companies", companyId, "BulkQuoteRequests"), limit(2000))),
                        getDocs(query(collection(db, "companies", companyId, "PersonalizationRequests"), limit(2000))),
                    ]);

                    const inRangeNotifyDocs = notifySnap.docs.filter((d) => isCreatedInRange(d.data()?.createdAt, startDate, endDate));
                    const notifyPhones = new Set(
                        notifySnap.docs.map((d: any) =>
                            (d.data()?.customerNumber || "").replace(/\D/g, "")
                        )
                    );

                    const unmatchedPhones = new Set<string>();

                    bulkSnap.docs.forEach((d: any) => {
                        if (!isCreatedInRange(d.data()?.createdAt, startDate, endDate)) return;
                        const phone = (d.data()?.customerNumber || "").replace(/\D/g, "");
                        if (phone && !notifyPhones.has(phone)) unmatchedPhones.add(phone);
                    });

                    personalizationSnap.docs.forEach((d: any) => {
                        if (!isCreatedInRange(d.data()?.createdAt, startDate, endDate)) return;
                        const phone = (d.data()?.customerNumber || "").replace(/\D/g, "");
                        if (phone && !notifyPhones.has(phone)) unmatchedPhones.add(phone);
                    });

                    setPendingRequestCount(inRangeNotifyDocs.length + unmatchedPhones.size);
                }
            } catch (err) {
                console.error("Pending request fetch error:", err);
            }
        };

        fetchPendingRequests();
    }, [companyId, startDate?.getTime(), endDate?.getTime()]);

    return pendingRequestCount;
};
