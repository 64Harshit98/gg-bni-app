import express from 'express';
import path from 'path';
import fs from 'fs';

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

// The HTML shell is the pointer to whichever hashed JS/CSS bundle is
// currently valid — it must always be revalidated, never served stale from
// cache. `no-cache` still allows cheap conditional GETs (304s), it just
// forbids skipping the network entirely.
function setHtmlHeaders(res) {
    res.set('Cache-Control', 'no-cache');
}

// Static assets are content-hashed by Vite (index-<hash>.js), so a changed
// file always gets a new name — safe to cache forever, and this is the
// inverse of the HTML policy above: assets long-cached, shell always fresh.
app.use(express.static(distPath, { maxAge: '1y', immutable: true }));

// Catch-all route
app.get(/.*/, async (req, res, next) => {

    // Asset check
    if (req.path.match(/\.(js|css|png|jpe?g|gif|ico|svg|json|woff2?)$/i)) {
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
            const safeTitle = escapeHtml(item.name || String(product) || 'Product');
            const safeDescription = escapeHtml(item.description || 'Check out this product');
            const safeImage = escapeHtml(effectiveImageUrl || '');
            const safeUrl = escapeHtml(`https://${req.get('host')}${req.originalUrl}`);

            const metaTags = `
                <meta property="og:type" content="product" />
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

            const finalHtml = indexHtmlTemplate.replace('</head>', `${metaTags}\n</head>`);

            setHtmlHeaders(res);
            return res.status(200).send(finalHtml);

        } catch (error) {
            console.error('Preview error:', error);
            // On failure, serve normal React app
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