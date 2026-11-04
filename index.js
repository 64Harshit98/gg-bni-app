import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { getPublicHost, getMerchantSub, getCatalogueTarget } from './server/tenant.js';

const app = express();
const PORT = process.env.PORT || 8080;

const distPath = path.join(process.cwd(), 'dist');
const FUNCTIONS_BASE_URL = process.env.FUNCTIONS_BASE_URL;

// Read the shell once at boot for speed, but NEVER let it be cached
// downstream (browser/CDN) without revalidation — see setHtmlHeaders below.
// This in-memory copy is refreshed on every process restart/deploy; the
// Cache-Control policy is what prevents stale copies from lingering in
// browsers or at the CDN edge after a deploy changes the hashed filenames.
const indexHtmlTemplate = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');

const CRAWLER_USER_AGENTS = [
    'whatsapp', 'facebookexternalhit', 'facebot', 'twitterbot',
    'linkedinbot', 'telegrambot', 'slackbot', 'discordbot',
    'pinterest', 'skypeuripreview'
];

function isCrawlerRequest(userAgent) {
    if (!userAgent) return false;
    return CRAWLER_USER_AGENTS.some((bot) => userAgent.toLowerCase().includes(bot));
}

function isMetaScopedGoogleUa(userAgent) {
    if (!userAgent) return false;
    return userAgent.trim().toLowerCase() === 'google';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- /api/storefront: cached proxy to the getPublicStorefront function ---
// One HTTP response with everything the public catalogue needs for first
// paint (see getPublicStorefront in functions/lib/index.js). This layer
// keeps a small in-memory copy per tenant so most buyers never wait on the
// function at all, collapses concurrent cold requests for the same store
// into one upstream call, and keeps serving the last good copy for a while
// if the function is slow or down, so a hiccup upstream doesn't blank the
// storefront.
const STOREFRONT_FRESH_MS = 30 * 1000;
const STOREFRONT_STALE_MS = 10 * 60 * 1000;
const STOREFRONT_UPSTREAM_TIMEOUT_MS = 8000;
const STOREFRONT_CACHE_MAX = 100;
const storefrontCache = new Map(); // key -> { status, isJson, body, cacheControl, fetchedAt }
const storefrontInFlight = new Map(); // key -> Promise<entry>

async function fetchStorefrontUpstream(key) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STOREFRONT_UPSTREAM_TIMEOUT_MS);
    try {
        const response = await fetch(`${FUNCTIONS_BASE_URL}/getPublicStorefront?${key}`, {
            signal: controller.signal,
        });
        return {
            status: response.status,
            isJson: (response.headers.get('content-type') || '').includes('application/json'),
            body: await response.text(),
            cacheControl: response.headers.get('cache-control') || 'no-store',
            fetchedAt: Date.now(),
        };
    } finally {
        clearTimeout(timer);
    }
}

function rememberStorefront(key, entry) {
    storefrontCache.delete(key);
    if (storefrontCache.size >= STOREFRONT_CACHE_MAX) {
        storefrontCache.delete(storefrontCache.keys().next().value);
    }
    storefrontCache.set(key, entry);
}

function sendStorefront(res, entry, cacheState) {
    // A stale fallback copy must not be re-cached downstream by the CDN.
    res.set('Cache-Control', cacheState === 'STALE' ? 'no-store' : entry.cacheControl);
    res.set('X-Storefront-Cache', cacheState);
    return res.status(entry.status).type('application/json').send(entry.body);
}

function renderWithMeta({ type, title, description, image, url }) {
    const safeTitle = escapeHtml(title);
    const safeDescription = escapeHtml(description);
    const safeImage = escapeHtml(image || '');
    const safeUrl = escapeHtml(url);

    const metaTags = `
        <meta property="og:type" content="${type}" />
        <meta property="og:site_name" content="Sellar" />
        <meta property="og:title" content="${safeTitle}" />
        <meta property="og:description" content="${safeDescription}" />
        ${safeImage ? `<meta property="og:image" content="${safeImage}" />` : ''}
        <meta property="og:url" content="${safeUrl}" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="${safeTitle}" />
        <meta name="twitter:description" content="${safeDescription}" />
        ${safeImage ? `<meta name="twitter:image" content="${safeImage}" />` : ''}
    `;

    return indexHtmlTemplate
        .replace(/<title>.*?<\/title>/, `<title>${safeTitle}</title>`)
        .replace('</head>', `${metaTags}\n</head>`);
}

// The HTML shell is the pointer to whichever hashed JS/CSS bundle is
// currently valid — it must always be revalidated, never served stale from
// cache. `no-cache` still allows cheap conditional GETs (304s), it just
// forbids skipping the network entirely.
function setHtmlHeaders(res) {
    res.set('Cache-Control', 'no-cache');
}

// gzip/brotli for JS, CSS, JSON and HTML. Without it the JS bundles went out
// uncompressed (several MB) — on a slow mobile connection that alone kept
// the storefront on a blank screen for many seconds.
app.use(compression());

// Static assets are content-hashed by Vite (index-<hash>.js), so a changed
// file always gets a new name — safe to cache forever, and this is the
// inverse of the HTML policy above: assets long-cached, shell always fresh.
// `index: false` so "/" falls through to the catch-all below instead of
// express.static serving dist/index.html directly — otherwise the store's
// root link (acme.sellar.in/) never gets its link-preview tags, and the
// shell would also be sent with the 1y immutable cache headers.
app.use(express.static(distPath, { maxAge: '1y', immutable: true, index: false }));

app.get('/api/storefront', async (req, res) => {
    const hostSub = getMerchantSub(getPublicHost(req));
    const querySub = typeof req.query.sub === 'string' ? req.query.sub.toLowerCase() : null;
    const cId = typeof req.query.cId === 'string' ? req.query.cId : null;

    // On a merchant host the Host header decides the tenant — a request can
    // only ever get the store it was made on. A mismatching ?sub= is
    // rejected (rather than silently ignored) so a cache keyed on the URL
    // can never pair one store's URL with another store's data.
    if (hostSub && querySub && querySub !== hostSub) {
        res.set('Cache-Control', 'no-store');
        return res.status(400).json({ error: 'Store does not match host' });
    }

    const params = hostSub ? { sub: hostSub } : querySub ? { sub: querySub } : cId ? { cId } : null;
    if (!params) {
        res.set('Cache-Control', 'no-store');
        return res.status(400).json({ error: 'Missing sub or cId' });
    }
    if (!FUNCTIONS_BASE_URL) {
        console.error('Storefront error: FUNCTIONS_BASE_URL missing');
        res.set('Cache-Control', 'no-store');
        return res.status(503).json({ error: 'Storefront unavailable' });
    }

    const key = new URLSearchParams(params).toString();
    const cached = storefrontCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < STOREFRONT_FRESH_MS) {
        return sendStorefront(res, cached, 'HIT');
    }

    try {
        let pending = storefrontInFlight.get(key);
        if (!pending) {
            pending = fetchStorefrontUpstream(key).finally(() => storefrontInFlight.delete(key));
            storefrontInFlight.set(key, pending);
        }
        const entry = await pending;
        // Only a JSON answer is the function itself speaking. Anything else
        // (e.g. Google's HTML 404 page while the function isn't deployed)
        // must not be cached or passed on as "store not found" — fail
        // instead, so the client falls back to reading Firestore directly.
        if (entry.status >= 500 || !entry.isJson) {
            throw new Error(`getPublicStorefront returned ${entry.status}${entry.isJson ? '' : ' (non-JSON)'}`);
        }
        if (entry.status === 200 || entry.status === 404) rememberStorefront(key, entry);
        return sendStorefront(res, entry, 'MISS');
    } catch (error) {
        console.error('Storefront fetch error:', error);
        if (cached && Date.now() - cached.fetchedAt < STOREFRONT_STALE_MS) {
            return sendStorefront(res, cached, 'STALE');
        }
        res.set('Cache-Control', 'no-store');
        return res.status(502).json({ error: 'Storefront temporarily unavailable' });
    }
});

// Catch-all route
app.get(/.*/, async (req, res, next) => {

    // Asset check
    if (req.path.match(/\.(js|css|png|jpe?g|gif|ico|svg|json|woff2?)$/i)) {
        // A missing hashed chunk (an old build referenced by a stale tab)
        // must never be cached by the CDN, or the 404 could outlive the
        // reload that is meant to recover from it.
        res.set('Cache-Control', 'no-store');
        return res.status(404).send('Asset not found.');
    }

    const userAgent = req.get('User-Agent');
    const { product, itemId, cId, force } = req.query;

    const isMetaCrawler = isCrawlerRequest(userAgent) || isMetaScopedGoogleUa(userAgent);
    const shouldAttemptPreview = (isMetaCrawler || force === '1') && itemId && cId;

    if (shouldAttemptPreview) {
        // Vary: User-Agent is scoped to ONLY the bot/preview branch now.
        // Applying it to human traffic used to make the CDN keep a separate
        // cached copy per exact UA string, which fragmented the cache across
        // the huge number of distinct human UA strings and caused most
        // visitors to miss cache and hit the origin directly.
        res.set('Vary', 'User-Agent');

        try {
            if (!FUNCTIONS_BASE_URL) throw new Error('FUNCTIONS_BASE_URL missing');

            const fetchUrl = `${FUNCTIONS_BASE_URL}/getPublicItem?cId=${encodeURIComponent(cId)}&itemId=${encodeURIComponent(itemId)}`;
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`getPublicItem returned ${response.status}`);

            const item = await response.json();

            const effectiveImageUrl = req.query.testimg === '1'
                ? 'https://placehold.co/1200x630/F97316/FFFFFF.png?text=Test+Image'
                : item.imageUrl;

            setHtmlHeaders(res);
            return res.status(200).send(renderWithMeta({
                type: 'product',
                title: item.name || String(product) || 'Product',
                description: item.description || 'Check out this product',
                image: effectiveImageUrl,
                url: `https://${getPublicHost(req)}${req.originalUrl}`,
            }));

        } catch (error) {
            console.error('Preview error:', error);
            // On failure, serve normal React app
            setHtmlHeaders(res);
            return res.status(200).send(indexHtmlTemplate);
        }
    }

    // Whole-catalogue / single-category share links: show the merchant's
    // logo/name (or the category's image/name) instead of the Sellar default.
    const catalogueTarget = (isMetaCrawler || force === '1')
        ? getCatalogueTarget(getPublicHost(req), req.path)
        : null;

    if (catalogueTarget) {
        res.set('Vary', 'User-Agent');

        try {
            if (!FUNCTIONS_BASE_URL) throw new Error('FUNCTIONS_BASE_URL missing');

            const params = new URLSearchParams(catalogueTarget);
            const response = await fetch(`${FUNCTIONS_BASE_URL}/getPublicPreview?${params}`);
            if (!response.ok) throw new Error(`getPublicPreview returned ${response.status}`);

            const preview = await response.json();

            setHtmlHeaders(res);
            return res.status(200).send(renderWithMeta({
                type: 'website',
                title: preview.title,
                description: preview.description,
                image: preview.imageUrl,
                url: `https://${getPublicHost(req)}${req.originalUrl}`,
            }));
        } catch (error) {
            console.error('Catalogue preview error:', error);
            setHtmlHeaders(res);
            return res.status(200).send(indexHtmlTemplate);
        }
    }

    // Normal human user — no Vary header, one cached-but-always-revalidated
    // shell for everyone.
    setHtmlHeaders(res);
    return res.status(200).send(indexHtmlTemplate);
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});