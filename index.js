import express from 'express';
import path from 'path';
import fs from 'fs'; // NEW: Import the file system module

const app = express();
const PORT = process.env.PORT || 8080;

const distPath = path.join(process.cwd(), 'dist');
const FUNCTIONS_BASE_URL = process.env.FUNCTIONS_BASE_URL;

// NEW: Read your real React HTML file once when the server boots
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

// Serve static files
app.use(express.static(distPath));

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

    // NEW: CRITICAL CACHE FIX. Tells the CDN "Keep a separate cache for Bots vs Humans"
    res.set('Vary', 'User-Agent');

    if (shouldAttemptPreview) {
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

            // NEW: We just generate the tags, not the whole HTML page
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

            // NEW: Inject the tags directly into the real React app's <head>!
            const finalHtml = indexHtmlTemplate.replace('</head>', `${metaTags}\n</head>`);

            res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
            return res.status(200).send(finalHtml);

        } catch (error) {
            console.error('Preview error:', error);
            // On failure, serve normal React app
            res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
            return res.status(200).send(indexHtmlTemplate);
        }
    }

    // Normal Human User - Serve normal React app
    res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
    return res.status(200).send(indexHtmlTemplate);
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});