import { getSubdomain } from '../../../lib/subdomain';
import { useStorefront } from '../../storefront/useStorefront';

// Owns subdomain → companyId resolution for the checkout page, on top of the
// shared storefront loader (see storefront/storefrontClient.ts). Buyers
// usually arrive here from the catalogue or a category, which already loaded
// the same store this session, so this normally resolves instantly. An old
// subdomain alias is redirected to the current one, keeping the pathname so
// they stay on the Cart page.
export const useDomainResolution = (pathId: string | undefined) => {
    const { status, data, retry } = useStorefront(pathId);

    return {
        subdomain: getSubdomain(),
        effectiveCompanyId: data?.companyId ?? null,
        storefront: data,
        domainResolveError: status === 'not-found',
        loadError: status === 'error',
        isResolvingDomain: status === 'loading',
        retry,
    };
};
