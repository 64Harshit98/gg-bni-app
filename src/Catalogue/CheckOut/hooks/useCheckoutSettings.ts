import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import type { CatalogueSalesSettings } from '../checkOut.types';
import { readLeadData } from '../../storefront/buyerStorage';

// Owns the checkout sales settings and the lead-approval-status live
// listener (AuthorizedUser `onSnapshot`, keyed off the saved lead's phone
// number). The settings doc arrives with the storefront bundle (see
// useDomainResolution) instead of a separate getDoc here; a store without
// one still gets no minimum order value, as before.
export const useCheckoutSettings = (
    effectiveCompanyId: string | null,
    storefrontSettings: CatalogueSalesSettings | null | undefined
) => {
    const salesSettings = useMemo<CatalogueSalesSettings | null>(() => {
        if (!effectiveCompanyId) return null;
        return storefrontSettings ?? { minimumOrderValue: 0 };
    }, [effectiveCompanyId, storefrontSettings]);
    const [leadStatus, setLeadStatus] = useState<"approved" | "pending" | "declined" | null>(null);

    useEffect(() => {
        if (!effectiveCompanyId) return;

        const leadData = readLeadData();

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
        }, (error) => {
            console.error("Realtime approval error:", error);
            setLeadStatus(null);
        });

        return () => unsubscribe();
    }, [effectiveCompanyId]);

    return { salesSettings, leadStatus };
};
