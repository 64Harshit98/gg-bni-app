import { useMemo } from 'react';
import type { StorefrontBusinessInfo } from '../../storefront/storefrontClient';

// Owns business-name + WhatsApp-link derivation for the checkout page. The
// business_info doc itself now arrives with the storefront bundle (see
// useDomainResolution) instead of a separate getDoc here.
export const useBusinessInfo = (businessInfo: StorefrontBusinessInfo | null | undefined) => {
    const companyName = businessInfo?.businessName || 'Catalogue';
    const socialLinks = useMemo<StorefrontBusinessInfo>(() => businessInfo ?? {}, [businessInfo]);

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
