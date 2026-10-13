import { useState, useEffect, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';

// Moved verbatim from CheckOut.tsx (was the module-level `useBusinessName`
// hook, declared just above the CartPage component).
export const useBusinessName = (effectiveCompanyId?: string) => {
    const [businessName, setBusinessName] = useState<string>('');
    const [socialLinks, setSocialLinks] = useState<any>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!effectiveCompanyId) {
            setLoading(false);
            return;
        }
        const fetchBusinessInfo = async () => {
            try {
                const docRef = doc(db, 'companies', effectiveCompanyId, 'business_info', effectiveCompanyId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setBusinessName(data.businessName || 'Catalogue');
                    setSocialLinks(data);
                } else {
                    setBusinessName('Catalogue');
                }
            } catch (err) {
                setBusinessName('Catalogue');
            } finally {
                setLoading(false);
            }
        };
        fetchBusinessInfo();
    }, [effectiveCompanyId]);

    return { businessName, loading, socialLinks };
};

// Owns business-name + WhatsApp-link derivation — moved verbatim from
// CheckOut.tsx's CartPage body (the useBusinessName call + whatsappLink
// useMemo, previously inline).
export const useBusinessInfo = (effectiveCompanyId: string | null) => {
    const { businessName: companyName, socialLinks } = useBusinessName(effectiveCompanyId || "");

    const whatsappLink = useMemo(() => {
        const rawNumber = socialLinks?.whatsappNumber || socialLinks?.phoneNumber || '';
        const digits = rawNumber.replace(/\D/g, '');
        if (!digits) return null;
        const fullNumber = digits.length === 10 ? `91${digits}` : digits;
        const message = encodeURIComponent(`Hi, I'm interested in your products at ${companyName}.`);
        return `https://wa.me/${fullNumber}?text=${message}`;
    }, [socialLinks, companyName]);

    return { companyName, socialLinks, whatsappLink };
};
