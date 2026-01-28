import { useState, useEffect } from "react";
import { doc, getDoc } from 'firebase/firestore';
import { db } from "../../lib/Firebase";

export const useBusinessName = (companyId?: string) => { // <-- FIX: Added companyId
    const [businessName, setBusinessName] = useState<string>('');
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        // --- FIX: Wait for both userId AND companyId ---
        if (!companyId) {
            setLoading(false);
            return;
        }
        const fetchBusinessInfo = async () => {
            try { 
                // --- FIX: Use the correct multi-tenant path ---
                // (Assumes business_info doc ID is the companyId, as set in your Cloud Function)
                const docRef = doc(db, 'companies', companyId, 'business_info', companyId);
                const docSnap = await getDoc(docRef);
                setBusinessName(docSnap.exists() ? docSnap.data().businessName || 'Business' : 'Business');
            } catch (err) {
                console.error("Error fetching business name:", err);
                setBusinessName('Business');
            } finally {
                setLoading(false);
            }
        };
        fetchBusinessInfo();
    }, [companyId]); // <-- FIX: Add companyId dependency
    return { businessName, loading };
};