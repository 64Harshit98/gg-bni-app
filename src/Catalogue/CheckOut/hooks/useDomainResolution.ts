import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';

// Owns subdomain → companyId resolution — moved verbatim from CheckOut.tsx
// (was the hostname/subdomain parsing + the resolveDomain effect, previously
// inline in the CartPage component body).
export const useDomainResolution = (pathId: string | undefined) => {
    const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(null);
    const [domainResolveError, setDomainResolveError] = useState(false);
    const [isResolvingDomain, setIsResolvingDomain] = useState(true);

    const hostname = window.location.hostname;
    const parts = hostname.split('.');

    const subdomain = useMemo(() => {
        return (
            parts.length >= 3 &&
            !['www', 'app'].includes(parts[0].toLowerCase()) &&
            !hostname.includes('localhost')
        ) ? parts[0] : null;
    }, [hostname, parts]);

    useEffect(() => {
        const resolveDomain = async () => {
            if (subdomain) {
                try {
                    const companiesRef = collection(db, 'companies');
                    const q = query(companiesRef, where('domainAliases', 'array-contains', subdomain));
                    const snap = await getDocs(q);

                    if (!snap.empty) {
                        const companyDoc = snap.docs[0];
                        const data = companyDoc.data();

                        // Redirect logic: Preserve the pathname so they stay on the Cart page!
                        if (data.subdomain && data.subdomain !== subdomain) {
                            window.location.replace(`https://${data.subdomain}.sellar.in${window.location.pathname}`);
                            return;
                        }

                        setResolvedCompanyId(companyDoc.id);
                    } else {
                        setDomainResolveError(true);
                    }
                } catch (error) {
                    console.error("Error resolving subdomain:", error);
                    setDomainResolveError(true);
                }
            } else if (pathId) {
                setResolvedCompanyId(pathId);
            } else {
                setDomainResolveError(true);
            }
            setIsResolvingDomain(false);
        };

        resolveDomain();
    }, [subdomain, pathId]);

    const effectiveCompanyId = resolvedCompanyId;

    return { subdomain, effectiveCompanyId, domainResolveError, isResolvingDomain };
};
