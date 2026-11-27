// Tenant resolution for the App Hosting server (index.js): which merchant
// store a request is for, worked out from the Host header and the path.
// Kept free of Express/server state so it can be unit-tested on its own.

// App Hosting sits behind a proxy: `Host` is the internal Cloud Run address
// (newapp-<n>.<region>.run.app), the domain the visitor actually used
// (e.g. acme.sellar.in) arrives in X-Forwarded-Host.
export function getPublicHost(req) {
    const forwarded = req.get('x-forwarded-host');
    return (forwarded ? forwarded.split(',')[0].trim() : req.get('host')) || '';
}

// The merchant slug a storefront host belongs to (acme.sellar.in -> "acme"),
// or null for the platform's own hosts (app./www.) and anything that isn't
// *.sellar.in. Single source for both the link-preview tags and
// /api/storefront.
export function getMerchantSub(host) {
    const hostname = (host || '').split(':')[0].toLowerCase();
    if (!hostname.endsWith('.sellar.in')) return null;
    const sub = hostname.split('.')[0];
    return sub === 'www' || sub === 'app' ? null : sub;
}

// Works out which store (and optionally which category) a catalogue share
// link points at. Mirrors the client routes in src/routes/storefrontRoutes.tsx
// and src/routes/routes.tsx:
//   <sub>.sellar.in/                  -> whole catalogue
//   <sub>.sellar.in/<categorySlug>    -> category
//   /catalogue/<companyId>            -> whole catalogue (legacy)
//   /<companyId>/<categorySlug>       -> category (legacy)
// Returns null for anything else so non-catalogue pages keep the default shell.
export function getCatalogueTarget(host, pathname) {
    let segments;
    try {
        segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
        return null;
    }

    const sub = getMerchantSub(host);
    if (sub) {
        if (segments.length === 0) return { sub };
        if (segments.length === 1 && segments[0] !== 'checkout') return { sub, cat: segments[0] };
        return null;
    }

    if (segments.length === 2 && segments[0] === 'catalogue') return { cId: segments[1] };
    if (segments.length === 2 && segments[0] !== 'checkout' && segments[0] !== 'download-bill') {
        return { cId: segments[0], cat: segments[1] };
    }
    return null;
}
