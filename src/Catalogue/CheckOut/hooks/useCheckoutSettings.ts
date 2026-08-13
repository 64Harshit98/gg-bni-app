import { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import type { CatalogueSalesSettings } from '../checkOut.types';

// Owns the sales-settings fetch and the lead-approval-status live listener —
// moved verbatim from CheckOut.tsx's CartPage body (two separate effects,
// previously inline: the `fetchSalesSettings` effect and the AuthorizedUser
// `onSnapshot` effect keyed off the saved lead's phone number).
export const useCheckoutSettings = (effectiveCompanyId: string | null) => {
    const [salesSettings, setSalesSettings] = useState<CatalogueSalesSettings | null>(null);
    const [leadStatus, setLeadStatus] = useState<"approved" | "pending" | "declined" | null>(null);

    useEffect(() => {
        if (!effectiveCompanyId) return;

        const fetchSalesSettings = async () => {
            try {
                const ref = doc(
                    db,
                    "companies",
                    effectiveCompanyId,
                    "settings",
                    "catalogue-sales-settings"
                );

                const snap = await getDoc(ref);

                if (snap.exists()) {
                    setSalesSettings(snap.data() as CatalogueSalesSettings);
                } else {
                    setSalesSettings({ minimumOrderValue: 0 });
                }
            } catch (err) {
                console.error("Failed to load MOV:", err);
                setSalesSettings({ minimumOrderValue: 0 });
            }
        };

        fetchSalesSettings();
    }, [effectiveCompanyId]);

    useEffect(() => {
        if (!effectiveCompanyId) return;

        const leadData = JSON.parse(
            localStorage.getItem("leadData") || "{}"
        );

        const phone = (leadData.number || "")
            .replace(/\D/g, "")
            .trim();

        if (!phone) {
            setLeadStatus(null);
            return;
        }

        const q = query(
            collection(db, "companies", effectiveCompanyId, "AuthorizedUser"),
            where("customerNumber", "==", phone)
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            if (snap.empty) {
                setLeadStatus(null);
            } else {
                setLeadStatus(snap.docs[0].data().status || "pending");
            }
        });

        return () => unsubscribe();
    }, [effectiveCompanyId]);

    return { salesSettings, leadStatus };
};
