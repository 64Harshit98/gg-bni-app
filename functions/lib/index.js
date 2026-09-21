const vision = require('@google-cloud/vision');
const axios = require("axios");
const cors = require("cors")({ origin: true });
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const Razorpay = require("razorpay");

const SUPER_ADMIN_UIDS = [
    "6vwZ1HRqX7VSnh5KP4JW0TKeuZm2",
    "1AKioGfop8PmHhry6uXOz8Rw6qT2"
];

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// IST is UTC+5:30. Cloud Functions run in UTC, so naive `Date.setHours(23,59,59,999)`
// sets end-of-day in the *server's* local time (UTC), not the end of the IST calendar
// day a user actually sees — this silently added ~5.5 hours (rounding a partial day
// up to a whole extra day in "days remaining" displays) and expired subscriptions at
// an odd early-morning IST time instead of midnight.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
// Returns the UTC instant corresponding to 23:59:59.999 IST, `addDays` days after
// `baseDate`'s IST calendar date.
function istEndOfDay(baseDate, addDays) {
    const baseIST = new Date(baseDate.getTime() + IST_OFFSET_MS);
    const y = baseIST.getUTCFullYear();
    const m = baseIST.getUTCMonth();
    const d = baseIST.getUTCDate();
    return new Date(Date.UTC(y, m, d + addDays, 23, 59, 59, 999) - IST_OFFSET_MS);
}

// Initialize Vision API Client
const client = new vision.ImageAnnotatorClient();

// ============================================================================
//  COORDINATE-BASED INVOICE TABLE READER
// ============================================================================

// Matched against the WHOLE text of a header cell ("Sale Price", "Bill Disc.", "GST Amt"),
// never single words. A header cell that matches nothing becomes an 'OTHER' column: it still
// gets its own band, so its numbers can't leak into a neighbouring column.
// To support a new bill format, usually all you do is add a synonym here.
const HEADER_DICTIONARY = [
    ['OTHER', /^(BILL\s*DISC(OUNT)?|DISC(OUNT)?\s*(AMT|AMOUNT|VALUE)|SUB\s*TOTAL|TAXABLE(\s*(VALUE|AMT|AMOUNT))?)$/],
    ['SLNO', /^(S\s*N|S\s*NO|SL\s*NO|SR\s*NO|SI\s*NO|SNO|SL|SR|NO|#)$/],
    ['DESCRIPTION', /^(DESCRIPTION(\s*OF\s*(GOODS|SERVICES))?|PARTICULARS?|ITEMS?(\s*(NAME|DESCRIPTION|DETAILS))?|NAME|PRODUCTS?(\s*NAME)?|SERVICES?|GOODS)$/],
    ['HSN', /^(HSN|SAC)(\s*\/\s*(HSN|SAC))?(\s*(NO|CODE))?$/],
    ['QTY', /^(QTY|QUANTITY|QNTY)$/],
    ['UNIT', /^(UNIT|UNITS|UOM)$/],
    ['RATE', /^(RATE|PRICE|SALES?\s*(PRICE|RATE)|UNIT\s*(PRICE|RATE)|SELLING\s*PRICE|(RATE|PRICE)\s*\/\s*UNIT)$/],
    ['MRP', /^MRP$/],
    ['DISCOUNT', /^(DISC(OUNT)?|DIS)\s*%?$/],
    ['TAX', /^(TAX|GST|VAT|IGST|CGST|SGST)(\s*(%|RATE|AMT|AMOUNT))?$/],
    ['AMOUNT', /^(AMOUNT|AMT|TOTAL|NET\s*(AMT|AMOUNT)|LINE\s*TOTAL|TOTAL\s*(AMT|AMOUNT))$/],
];

// Rows that end the item table (only trusted when the row has no serial number)
const SUMMARY_ROW =
    /^(SUB\s*)?TOTAL\b|^GRAND\s*TOTAL|^TAXABLE|^ROUND(ED)?\s*OFF|^AMOUNT\s*(IN\s*WORDS|PAYABLE|PAID)|^BALANCE|^NET\s*(PAYABLE|AMOUNT)/i;

const UNIT_WORD = /^(PCS?|NOS?|KGS?|GMS?|GRAMS?|MTRS?|METERS?|DZ|DOZEN|BAGS?|BTLS?|BOTTLES?|EA|EACH|UNITS?|ROLLS?|TABS?|STRIPS?|BOX(ES)?|PKTS?|PACKETS?|PACK|SETS?|LTRS?|LITERS?|LITRES?|L|ML|QTL|QUINTAL|TONS?|TONNES?|CTN|CARTONS?|BUNDLES?|PAIRS?|SQFT|SQM|FT)$/i;

const round2 = (n) => Math.round(n * 100) / 100;
const normHeader = (s) => s.toUpperCase().replace(/[.:,]/g, '').replace(/\s+/g, ' ').trim();
const classifyHeader = (text) => {
    const t = normHeader(text);
    const hit = HEADER_DICTIONARY.find(([, re]) => re.test(t));
    return hit ? hit[0] : null;
};
// "( No Prices )" -> "(No Prices)"
const cleanName = (s) => (s || '').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+/g, ' ').trim();

// OCR l / I / | -> 1 is fixed ONLY inside number-like tokens, so "Bottle" never becomes "Bott1e".
function parseNumberToken(tok) {
    let t = tok.replace(/[₹,%]/g, '').replace(/^Rs\.?/i, '');
    if (/^[0-9lI|.]+$/.test(t)) t = t.replace(/[lI|]/g, '1');
    return /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
}
function firstNumber(str) {
    for (const tok of String(str || '').split(/\s+/)) {
        const n = parseNumberToken(tok);
        if (n !== null) return n;
    }
    return 0;
}

// Unit comes from the Unit column, or from the Qty cell ("1 Pcs"); default PCS.
function pickUnit(unitText, qtyText) {
    const tokens = `${unitText || ''} ${qtyText || ''}`
        .split(/\s+/).map(t => t.replace(/[^A-Za-z]/g, '')).filter(Boolean);
    const known = tokens.find(t => UNIT_WORD.test(t));
    if (known) return known.toUpperCase();
    const custom = String(unitText || '').replace(/[^A-Za-z ]/g, '').trim();
    return custom ? custom.toUpperCase() : 'PCS';
}

// Effective discount so that qty x rate x (1 - d) equals the bill's own Amount.
// If the bill charges GST per line, Amount includes tax, so we use the explicit Discount % instead.
function resolveDiscount({ quantity, rate, amount, explicit, hasTax }) {
    const valid = (d) => Number.isFinite(d) && d >= 0 && d <= 95;
    if (hasTax) return valid(explicit) ? explicit : 0;
    if (rate > 0 && quantity > 0 && amount > 0) {
        const effective = round2((1 - amount / (quantity * rate)) * 100);
        if (valid(effective)) return effective;
    }
    return valid(explicit) ? explicit : 0;
}

// ---- Step 1: words with real geometry, de-skewed, watermark removed ---------
function extractWords(annotations) {
    const raw = [];
    for (const a of annotations) {
        const v = a.boundingPoly && a.boundingPoly.vertices;
        if (!v || v.length < 4) continue;
        const p = v.map(pt => ({ x: pt.x || 0, y: pt.y || 0 }));
        raw.push({ text: a.description, p, angle: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) });
    }
    if (!raw.length) return [];

    const angles = raw.map(w => w.angle).sort((a, b) => a - b);
    const tilt = angles[Math.floor(angles.length / 2)];
    const cos = Math.cos(-tilt), sin = Math.sin(-tilt);
    const rot = (pt) => ({ x: pt.x * cos - pt.y * sin, y: pt.x * sin + pt.y * cos });
    const MAX_DEVIATION = (20 * Math.PI) / 180;

    return raw
        .filter(w => Math.abs(w.angle - tilt) < MAX_DEVIATION)
        .map(w => {
            const q = w.p.map(rot);
            const xs = q.map(pt => pt.x), ys = q.map(pt => pt.y);
            const left = Math.min(...xs), right = Math.max(...xs);
            const top = Math.min(...ys), bottom = Math.max(...ys);
            return { text: w.text, left, right, top, bottom, x: (left + right) / 2, y: (top + bottom) / 2, h: bottom - top };
        });
}

// ---- Step 2: visual lines. Sorted by Y first (order-independent), tolerance scales with text size
function clusterIntoLines(words) {
    const hs = words.map(w => w.h).sort((a, b) => a - b);
    const medH = hs[Math.floor(hs.length / 2)] || 10;
    // Tighter tolerance: a single row's own words vary in Y by only a small fraction of
    // the row height, but on compact bills (small row spacing) two full rows can sit close
    // enough that a loose tolerance merges them into one line and silently drops an item.
    const tol = medH * 0.4;
    const lines = [];
    [...words].sort((a, b) => a.y - b.y).forEach(w => {
        const last = lines[lines.length - 1];
        if (last && Math.abs(last.y - w.y) <= tol) {
            last.items.push(w);
            last.y = last.items.reduce((s, i) => s + i.y, 0) / last.items.length;
        } else {
            lines.push({ y: w.y, items: [w] });
        }
    });
    lines.forEach(l => l.items.sort((a, b) => a.x - b.x));
    return { lines, medH };
}

// ---- Step 3: header row -> columns -------------------------------------------
function readHeaderCells(words, medH) {
    const sorted = [...words].sort((a, b) => a.left - b.left);
    const groups = [];
    sorted.forEach(w => {
        const g = groups[groups.length - 1];
        if (g && w.left - g.right <= medH * 0.7) {
            g.words.push(w);
            g.right = Math.max(g.right, w.right);
        } else {
            groups.push({ words: [w], left: w.left, right: w.right });
        }
    });

    const cells = [];
    groups.forEach(g => {
        g.words.sort((a, b) => (Math.abs(a.y - b.y) > medH * 0.6 ? a.y - b.y : a.x - b.x));
        const text = g.words.map(w => w.text).join(' ');
        const key = classifyHeader(text);
        const parts = g.words.map(w => classifyHeader(w.text));
        if (!key && g.words.length > 1 && parts.every(Boolean)) {
            g.words.forEach((w, i) => cells.push({ key: parts[i], text: w.text, left: w.left, right: w.right }));
        } else {
            cells.push({ key: key || 'OTHER', text, left: g.left, right: g.right });
        }
    });
    return cells.sort((a, b) => a.left - b.left);
}

function buildBands(cells, medH) {
    const cuts = [];
    for (let i = 0; i < cells.length - 1; i++) {
        const a = cells[i], b = cells[i + 1];
        if (a.key === 'DESCRIPTION') cuts.push(b.left - medH * 0.4);
        else if (b.key === 'DESCRIPTION') cuts.push(a.right + medH * 0.4);
        else cuts.push((a.right + b.left) / 2);
    }
    return cells.map((c, i) => ({
        key: c.key,
        pct: /%/.test(c.text),
        xStart: i === 0 ? -Infinity : cuts[i - 1],
        xEnd: i === cells.length - 1 ? Infinity : cuts[i],
    }));
}

function findHeader(lines, medH) {
    const attempt = (words) => {
        const cells = readHeaderCells(words, medH);
        const keys = new Set(cells.map(c => c.key));
        const known = [...keys].filter(k => k !== 'OTHER').length;
        return keys.has('QTY') && keys.has('AMOUNT') && known >= 4 ? cells : null;
    };
    for (let i = 0; i < lines.length; i++) {
        let cells = attempt(lines[i].items);
        let endIndex = i;
        if (!cells && lines[i + 1] && lines[i + 1].y - lines[i].y <= medH * 2.5) {
            cells = attempt([...lines[i].items, ...lines[i + 1].items]);
            endIndex = i + 1;
        }
        if (cells) return { bands: buildBands(cells, medH), endIndex };
    }
    return null;
}

function mapWordsToBands(words, bands) {
    const perBand = bands.map(() => []);
    words.forEach(w => {
        const i = bands.findIndex(b => w.x >= b.xStart && w.x < b.xEnd);
        if (i >= 0) perBand[i].push(w.text);
    });
    const out = {};
    bands.forEach((b, i) => {
        const text = perBand[i].join(' ').trim();
        if (!(b.key in out) || b.key === 'AMOUNT') out[b.key] = text;
        else if (b.key === 'TAX') out[b.key] += ' ' + text;
    });
    return out;
}

// ---- Step 4: item rows --------------------------------------------------------
function buildItems(lines, endIndex, bands, medH) {
    const serialBand = bands.some(b => b.key === 'SLNO');
    let body = lines.slice(endIndex + 1).map(line => {
        const own = mapWordsToBands(line.items, bands);
        const text = line.items.map(w => w.text).join(' ');
        const hasSerial = serialBand && firstNumber(own.SLNO) > 0;
        const summary = SUMMARY_ROW.test((own.DESCRIPTION || text).trim()) && !hasSerial;
        const qty = firstNumber(own.QTY);
        const amount = firstNumber(own.AMOUNT);
        return { line, own, qty, amount, summary, primary: !summary && qty > 0 && amount > 0 };
    });

    // Safety check: if a "line" carries more than one Amount-shaped number, two real
    // table rows got merged into one line — log it loudly instead of silently losing an item.
    body.forEach(r => {
        const amountTokens = (r.own.AMOUNT || '').split(/\s+/).filter(t => /\d/.test(t));
        if (amountTokens.length > 1) {
            console.warn('SUSPECTED MERGED ROWS (two items collapsed into one line):', r.own);
        }
    });

    const firstPrimary = body.findIndex(r => r.primary);
    if (firstPrimary < 0) return [];
    const stop = body.findIndex((r, i) => i > firstPrimary && r.summary);
    if (stop >= 0) body = body.slice(0, stop);

    const primaries = body.filter(r => r.primary);
    const gaps = primaries.slice(1).map((r, i) => r.line.y - primaries[i].line.y).sort((a, b) => a - b);
    const pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)] : medH * 4;
    const maxDist = pitch * 0.75;

    primaries.forEach(p => { p.lines = [p.line]; });
    body.filter(r => !r.primary).forEach(orphan => {
        let best = null, bestD = Infinity;
        primaries.forEach(p => {
            const d = Math.abs(p.line.y - orphan.line.y);
            if (d < bestD) { best = p; bestD = d; }
        });
        if (best && bestD <= maxDist) best.lines.push(orphan.line);
    });

    const discBand = bands.find(b => b.key === 'DISCOUNT');
    return primaries.map(p => {
        const full = mapWordsToBands(p.lines.sort((a, b) => a.y - b.y).flatMap(l => l.items), bands);
        const own = p.own;

        let rate = firstNumber(own.RATE) || firstNumber(own.MRP);
        if (!rate) rate = round2(p.amount / p.qty);

        const rawDisc = own.DISCOUNT || '';
        const isPct = /%/.test(rawDisc) || (discBand && discBand.pct);
        const explicit = isPct ? firstNumber(rawDisc) : NaN;
        const hasTax = firstNumber(own.TAX) > 0;

        return {
            name: cleanName(full.DESCRIPTION) || 'Unknown Item',
            quantity: p.qty,
            unit: pickUnit(full.UNIT, own.QTY),
            purchasePrice: rate,
            discountPercentage: resolveDiscount({ quantity: p.qty, rate, amount: p.amount, explicit, hasTax }),
            totalAmount: p.amount,
        };
    });
}

exports.scanSmartInvoice = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to scan documents.');
    }

    const { imageBase64, previousBands } = data;
    if (!imageBase64) {
        throw new functions.https.HttpsError('invalid-argument', 'No image data provided.');
    }

    try {
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

        const request = {
            image: { content: cleanBase64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        };

        const [result] = await client.annotateImage(request);

        // If nothing was found, return early
        if (!result.textAnnotations || result.textAnnotations.length === 0) {
            return { success: true, text: '' };
        }

        // words with geometry: de-skewed, diagonal watermark text removed
        const words = extractWords(result.textAnnotations.slice(1));
        const { lines, medH } = clusterIntoLines(words);

        const perfectlyFormattedText = lines
            .map(l => l.items.map(w => w.text).join(' '))
            .join('\n');
        console.log("GLOBAL RECONSTRUCTION:\n", perfectlyFormattedText);

                let structuredItems = [];
        let bandsUsed = null;
        const header = findHeader(lines, medH);
        if (header) {
            console.log("HEADER COLUMNS:", header.bands.map(b => b.key).join(' | '));
            structuredItems = buildItems(lines, header.endIndex, header.bands, medH);
            bandsUsed = header.bands;
            console.log("STRUCTURED ITEMS (coordinate-based):", structuredItems);
        } else if (Array.isArray(previousBands) && previousBands.length > 0) {
            // Continuation page: this page's own header row wasn't detected (repeated
            // headers are the most common thing OCR mangles), so reuse the previous
            // page's column layout instead of dropping every item on this page.
            // endIndex -1 means "no header row to skip" -- every clustered line here
            // is treated as a potential item row.
            console.log("No header row detected on this page -- reusing previous page's column layout.");
            structuredItems = buildItems(lines, -1, previousBands, medH);
            bandsUsed = previousBands;
            console.log("STRUCTURED ITEMS (via reused header):", structuredItems);
        } else {
            console.log("No header row detected: frontend fallback patterns will run on `text`.");
        }

        return {
            success: true,
            text: perfectlyFormattedText,
            items: structuredItems,
            bands: bandsUsed
        };

    } catch (error) {
        console.error("Cloud Vision API Error:", error);
        throw new functions.https.HttpsError('internal', 'Failed to process the document via Cloud Vision.');
    }
});
exports.fetchInvoiceData = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");

    const { companyId, orderId } = data;
    if (!companyId || !orderId) throw new functions.https.HttpsError("invalid-argument", "Missing params.");

    try {
        const orderRef = db.collection("companies").doc(companyId).collection("Orders").doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) throw new functions.https.HttpsError("not-found", "Order not found");
        const orderData = orderSnap.data() || {};

        const processedItems = await Promise.all((orderData.items || []).map(async (item, index) => {
            let base64Image = "";
            if (item.imageUrl) {
                try {
                    const response = await fetch(item.imageUrl);
                    const arrayBuffer = await response.arrayBuffer();
                    const mimeType = item.imageUrl.includes('.png') ? 'image/png' : 'image/jpeg';
                    base64Image = `data:${mimeType};base64,` + Buffer.from(arrayBuffer).toString('base64');
                } catch (err) {
                    console.error(`Image fetch failed for ${item.id}`);
                }
            }
            return { ...item, sno: index + 1, imageBase64: base64Image };
        }));

        return { success: true, orderData: { ...orderData, items: processedItems } };
    } catch (error) {
        console.error("Data Fetch Error:", error);
        throw new functions.https.HttpsError("internal", "Failed to fetch invoice data");
    }
});

exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    const { targetUid, companyId } = data;
    try {
        await admin.auth().deleteUser(targetUid);
        await db.collection('companies').doc(companyId).collection('users').doc(targetUid).delete();
        return { success: true, message: 'User completely deleted.' };
    } catch (error) {
        console.error("Error deleting user:", error);
        throw new functions.https.HttpsError('internal', 'Failed to delete user.');
    }
});

exports.deleteCompanyData = functions.https.onCall(async (data, context) => {
    if (!context.auth || !SUPER_ADMIN_UIDS.includes(context.auth.uid)) {
        throw new functions.https.HttpsError('permission-denied', 'Only Super Admins can perform this action.');
    }
    const { companyId } = data;
    if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');

    try {
        const usersSnapshot = await db.collection(`companies/${companyId}/users`).get();
        const deleteAuthPromises = [];

        usersSnapshot.forEach((doc) => {
            const uid = doc.id;
            const deletePromise = admin.auth().deleteUser(uid).catch((err) => {
                console.warn(`Could not delete Auth user ${uid}:`, err.message);
            });
            deleteAuthPromises.push(deletePromise);
        });

        await Promise.all(deleteAuthPromises);
        await db.recursiveDelete(db.doc(`companies/${companyId}`));

        return { success: true, message: `Company ${companyId} deleted.` };
    } catch (error) {
        console.error("Error deleting company:", error);
        throw new functions.https.HttpsError('internal', 'An error occurred while deleting the company.');
    }
});

exports.botmasterProxy = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            const targetUrl = `https://api.botmastersender.com${req.url}`;
            const response = await axios({
                method: req.method,
                url: targetUrl,
                data: req.body,
                headers: { "Content-Type": "application/json" }
            });
            res.status(response.status).send(response.data);
        } catch (error) {
            console.error("Proxy Error:", error.message);
            if (error.response) res.status(error.response.status).send(error.response.data);
            else res.status(500).send({ error: "Cloud Function Proxy failed." });
        }
    });
});

exports.snaptoProxy = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            const targetUrl = `https://app.snapto.ai${req.url}`;
            const response = await axios({
                method: req.method,
                url: targetUrl,
                data: req.body,
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": req.headers["x-api-key"],
                }
            });
            res.status(response.status).send(response.data);
        } catch (error) {
            console.error("Snapto Proxy Error:", error.message);
            if (error.response) res.status(error.response.status).send(error.response.data);
            else res.status(500).send({ error: "Cloud Function Proxy failed." });
        }
    });
});

// ─── WhatsApp: Sellar-managed tiers (self-serve Snapto + Sellar shared number) ───
// Both tiers now send through this one function so no company ever holds a
// Snapto API key client-side. Which credential set to use is resolved here,
// server-side, from companies/{companyId}/whatsappStatus/current.activeTier.
const WHATSAPP_TEMPLATE_FIELD_BY_TYPE = {
    invoice: 'templateName',
    order: 'templateName',
    reminder: 'reminderTemplateName',
    stockAlert: 'stockAlertTemplateName',
};

exports.sendCompanyWhatsappMessage = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.token.companyId) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    }
    const companyId = context.auth.token.companyId;
    const { to, messageType, fileUrl, templateVariables, refCollection, refId } = data;

    if (!to) throw new functions.https.HttpsError('invalid-argument', 'Missing recipient number.');
    const templateField = WHATSAPP_TEMPLATE_FIELD_BY_TYPE[messageType];
    if (!templateField) throw new functions.https.HttpsError('invalid-argument', 'Invalid messageType.');

    const statusRef = db.doc(`companies/${companyId}/whatsappStatus/current`);
    const statusSnap = await statusRef.get();
    const status = statusSnap.exists ? statusSnap.data() : {};
    const activeTier = status.activeTier;

    if (activeTier !== 'snapto' && activeTier !== 'sellar') {
        throw new functions.https.HttpsError('failed-precondition', 'WhatsApp is not connected for this company.');
    }
    if (!status.active) {
        throw new functions.https.HttpsError('failed-precondition', 'WhatsApp sending is currently inactive for this company.');
    }

    let credentials;
    if (activeTier === 'snapto') {
        const configSnap = await db.doc(`adminWhatsappConfig/${companyId}`).get();
        if (!configSnap.exists) {
            throw new functions.https.HttpsError('failed-precondition', 'WhatsApp is not configured for this company.');
        }
        const config = configSnap.data();
        credentials = {
            apiKey: config.snaptoApiKey,
            language: config.language || 'en',
            templateName: config[templateField],
        };
    } else {
        // sellar — shared credential + per-company plan/quota enforcement
        const sharedSnap = await db.doc('sellarWhatsappSharedConfig/global').get();
        if (!sharedSnap.exists) {
            throw new functions.https.HttpsError('failed-precondition', 'Sellar WhatsApp is not configured yet.');
        }
        const shared = sharedSnap.data();

        const plan = status.sellarPlan;
        if (!plan || plan.status !== 'active') {
            throw new functions.https.HttpsError('failed-precondition', 'Your Sellar WhatsApp plan is not active.');
        }
        if (plan.expiresAt && plan.expiresAt.toDate && plan.expiresAt.toDate() < new Date()) {
            throw new functions.https.HttpsError('failed-precondition', 'Your Sellar WhatsApp plan has expired.');
        }
        if (plan.quotaTotal !== null && plan.quotaTotal !== undefined && (plan.quotaUsed || 0) >= plan.quotaTotal) {
            throw new functions.https.HttpsError('resource-exhausted', 'Your Sellar WhatsApp message quota is used up.');
        }

        credentials = {
            apiKey: shared.snaptoApiKey,
            language: shared.language || 'en',
            templateName: shared[templateField],
        };
    }

    if (!credentials.apiKey || !credentials.templateName) {
        throw new functions.https.HttpsError('failed-precondition', 'WhatsApp template is not configured for this message type.');
    }

    const logDocRef = db.collection(`companies/${companyId}/whatsappMessages`).doc();

    let sendResult;
    try {
        const response = await axios.post(
            'https://app.snapto.ai/api/v1/whatsapp/sendMessage',
            {
                templateName: credentials.templateName,
                language: credentials.language,
                to,
                ...(fileUrl ? { fileUrl } : {}),
                templateVariables: templateVariables || [],
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': credentials.apiKey,
                },
            }
        );
        sendResult = { waMessageId: (response.data && response.data.waMessageId) || null };
    } catch (err) {
        const errData = err.response && err.response.data;
        const errorDetail = (errData && (errData.detail || (errData.error && errData.error.message))) || err.message || 'Unknown error';

        await logDocRef.set({
            to, messageType, status: 'failed', tier: activeTier,
            waMessageId: null, errorDetail,
            refCollection: refCollection || null, refId: refId || null,
            sentByUid: context.auth.uid,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        throw new functions.https.HttpsError('internal', `Failed to send WhatsApp message: ${errorDetail}`);
    }

    // Atomically log the send + (for the metered Sellar tier only) burn one
    // unit of quota, so a log entry and a quota increment can never diverge.
    await db.runTransaction(async (tx) => {
        tx.set(logDocRef, {
            to, messageType, status: 'sent', tier: activeTier,
            waMessageId: sendResult.waMessageId,
            errorDetail: null,
            refCollection: refCollection || null, refId: refId || null,
            sentByUid: context.auth.uid,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (activeTier === 'sellar') {
            tx.update(statusRef, {
                'sellarPlan.quotaUsed': admin.firestore.FieldValue.increment(1),
            });
        }
    });

    return { success: true, waMessageId: sendResult.waMessageId };
});

// Super-admin write path for a single company's WhatsApp config — either
// their own Snapto credentials (tier 'snapto', admin-entered on their behalf)
// or their Sellar-shared-tier plan/quota assignment (tier 'sellar'). Writes
// the secret half (adminWhatsappConfig) and the client-readable status
// mirror (whatsappStatus/current) together so a company is never left
// half-activated.
exports.setCompanyWhatsappConfig = functions.https.onCall(async (data, context) => {
    if (!context.auth || !SUPER_ADMIN_UIDS.includes(context.auth.uid)) {
        throw new functions.https.HttpsError('permission-denied', 'Only Super Admins can perform this action.');
    }
    const {
        companyId, tier, active,
        snaptoApiKey, whatsappNumber, templateName, reminderTemplateName, stockAlertTemplateName, language,
        planId, quotaTotal, expiresAt,
    } = data;

    if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    if (!['snapto', 'sellar', 'none'].includes(tier)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid tier.');
    }

    const configRef = db.doc(`adminWhatsappConfig/${companyId}`);
    const statusRef = db.doc(`companies/${companyId}/whatsappStatus/current`);

    const configPayload = {
        tier,
        active: !!active,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedByUid: context.auth.uid,
    };
    const statusPayload = { activeTier: tier, active: !!active };

    if (tier === 'snapto') {
        Object.assign(configPayload, {
            snaptoApiKey: snaptoApiKey || '',
            whatsappNumber: whatsappNumber || '',
            templateName: templateName || '',
            reminderTemplateName: reminderTemplateName || '',
            stockAlertTemplateName: stockAlertTemplateName || '',
            language: language || 'en',
        });
        statusPayload.sellarPlan = null;
    } else if (tier === 'sellar') {
        const normalizedQuotaTotal = quotaTotal === null || quotaTotal === undefined ? null : Number(quotaTotal);
        const normalizedExpiresAt = expiresAt ? admin.firestore.Timestamp.fromDate(new Date(expiresAt)) : null;
        Object.assign(configPayload, { planId: planId || '', quotaTotal: normalizedQuotaTotal, expiresAt: normalizedExpiresAt });
        statusPayload.sellarPlan = {
            planId: planId || '',
            status: active ? 'active' : 'suspended',
            quotaTotal: normalizedQuotaTotal,
            expiresAt: normalizedExpiresAt,
        };
    }

    await db.runTransaction(async (tx) => {
        const [configSnap, statusSnap] = await Promise.all([tx.get(configRef), tx.get(statusRef)]);

        // Preserve existing quotaUsed across re-saves — this call edits the
        // plan/credentials, it should never silently reset usage back to 0.
        if (tier === 'sellar') {
            const existingUsed = (statusSnap.exists && statusSnap.data().sellarPlan && statusSnap.data().sellarPlan.quotaUsed) || 0;
            statusPayload.sellarPlan.quotaUsed = existingUsed;
            configPayload.quotaUsed = (configSnap.exists && configSnap.data().quotaUsed) || 0;
        }

        tx.set(configRef, configPayload, { merge: true });
        tx.set(statusRef, statusPayload, { merge: true });
    });

    return { success: true };
});

// Super-admin write path for the ONE shared Sellar WhatsApp credential used
// by every company on the 'sellar' tier.
exports.setSellarSharedWhatsappConfig = functions.https.onCall(async (data, context) => {
    if (!context.auth || !SUPER_ADMIN_UIDS.includes(context.auth.uid)) {
        throw new functions.https.HttpsError('permission-denied', 'Only Super Admins can perform this action.');
    }
    const { snaptoApiKey, whatsappNumber, templateName, reminderTemplateName, stockAlertTemplateName, language } = data;

    await db.doc('sellarWhatsappSharedConfig/global').set({
        snaptoApiKey: snaptoApiKey || '',
        whatsappNumber: whatsappNumber || '',
        templateName: templateName || '',
        reminderTemplateName: reminderTemplateName || '',
        stockAlertTemplateName: stockAlertTemplateName || '',
        language: language || 'en',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedByUid: context.auth.uid,
    }, { merge: true });

    return { success: true };
});

// One-off migration: carries forward any company that had already self-
// entered a Snapto key into settings/bill (the old self-serve Bill Settings
// UI, now removed) into the new admin-managed adminWhatsappConfig +
// whatsappStatus/current shape, so nobody's working connection silently
// breaks when the Bill Settings UI disappears. Safe to call more than once —
// only touches companies that still have a legacy snaptoApiKey field.
// Super-admin triggers this manually once (Firebase console's callable-
// function tester, or a temporary button); it is NOT wired to run on its own.
exports.migrateLegacySnaptoConfig = functions.https.onCall(async (data, context) => {
    if (!context.auth || !SUPER_ADMIN_UIDS.includes(context.auth.uid)) {
        throw new functions.https.HttpsError('permission-denied', 'Only Super Admins can perform this action.');
    }

    const companiesSnap = await db.collection('companies').get();
    const migratedCompanyIds = [];

    for (const companyDoc of companiesSnap.docs) {
        const companyId = companyDoc.id;
        const billSettingsSnap = await db.doc(`companies/${companyId}/settings/bill`).get();
        if (!billSettingsSnap.exists) continue;

        const billData = billSettingsSnap.data();
        if (!billData.snaptoApiKey || !billData.snaptoTemplateName) continue;

        const configRef = db.doc(`adminWhatsappConfig/${companyId}`);
        const statusRef = db.doc(`companies/${companyId}/whatsappStatus/current`);

        await db.runTransaction(async (tx) => {
            tx.set(configRef, {
                tier: 'snapto',
                active: true,
                snaptoApiKey: billData.snaptoApiKey,
                whatsappNumber: billData.whatsappNumber || '',
                templateName: billData.snaptoTemplateName || '',
                reminderTemplateName: billData.snaptoReminderTemplateName || '',
                stockAlertTemplateName: billData.snaptoStockAlertTemplateName || '',
                language: billData.snaptoLanguage || 'en',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedByUid: context.auth.uid,
                migratedFromBillSettings: true,
            }, { merge: true });
            tx.set(statusRef, {
                activeTier: 'snapto',
                active: true,
                sellarPlan: null,
            }, { merge: true });
        });

        migratedCompanyIds.push(companyId);
    }

    return { success: true, migratedCount: migratedCompanyIds.length, companyIds: migratedCompanyIds };
});

exports.getPublicCatalogue = functions.https.onRequest(async (req, res) => {
    const host = req.hostname;
    const slug = host.split('.')[0];

    if (['app', 'www', 'api', 'admin'].includes(slug)) {
        res.status(404).send("Not a merchant subdomain");
        return;
    }

    try {
        const storeDoc = await db.collection("public_catalogues").doc(slug).get();
        if (!storeDoc.exists) {
            res.status(404).send("Store not found");
            return;
        }
        res.set('Cache-Control', 'public, max-age=0, must-revalidate');
        res.status(200).json(storeDoc.data());
    } catch (error) {
        console.error("Error fetching catalogue:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Server-side, CDN-cacheable equivalent of getItemGroupsByCompany() +
// getItemsByCompany() (src/lib/ItemsFirebase.ts) for the public storefront
// pages (SharedCatalouge.tsx, SharedProduct.tsx). Those pages previously hit
// the Firestore client SDK directly on every anonymous page load with no
// caching at all; this puts the same reads behind Firebase Hosting's CDN so
// concurrent visitors within the cache window share one Firestore read
// instead of one each. Returns full item/group docs (not a stripped preview
// shape like getPublicItem) since the storefront needs full fields for
// cart/detail rendering.
exports.getPublicCatalogueItems = functions.https.onRequest(async (req, res) => {
    const { cId } = req.query;

    if (!cId) {
        res.status(400).json({ error: "Missing cId" });
        return;
    }

    try {
        const companyRef = db.collection("companies").doc(String(cId));

        const [itemsSnap, groupsSnap] = await Promise.all([
            companyRef.collection("items").where("isListed", "==", true).get(),
            companyRef.collection("itemGroups").get(),
        ]);

        const items = itemsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const itemGroups = groupsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        // Shorter CDN window than getPublicItem's (1hr) since a full catalogue
        // listing's stock/listed-status changes more often than one item's
        // preview card.
        res.set(
            "Cache-Control",
            "public, max-age=30, s-maxage=300, stale-while-revalidate=600"
        );
        res.status(200).json({ items, itemGroups });
    } catch (error) {
        console.error("Error fetching public catalogue items:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

exports.autoAwardUserReferralCredit = functions.firestore
    .document('companies/{newCompanyId}')
    .onCreate(async (snap) => {
        const newCompanyData = snap.data();
        const referral = newCompanyData.referralDetails;

        if (!referral || !referral.referrerId) return null;

        try {
            const referrerRef = db.collection('companies').doc(referral.referrerId);
            const referrerSnap = await referrerRef.get();

            if (!referrerSnap.exists) return null;

            await referrerRef.update({
                referralCredits: admin.firestore.FieldValue.increment(1)
            });

            await db.collection('creditLedger').add({
                referrerId: referral.referrerId,
                referrerName: referrerSnap.data()?.name || 'Unknown User',
                referredCompanyId: snap.id,
                referredCompanyName: newCompanyData.name || 'New Business',
                type: 'Earned',
                date: admin.firestore.FieldValue.serverTimestamp()
            });

            return true;
        } catch (error) {
            console.error("Error awarding user credit:", error);
            return null;
        }
    });

exports.autoCalculateCommissionOnExtension = functions.firestore
    .document('companies/{companyId}')
    .onUpdate(async (change) => {
        const beforeData = change.before.data();
        const afterData = change.after.data();

        const oldExpiry = beforeData.expiryDate?.toDate() || new Date(0);
        const newExpiry = afterData.expiryDate?.toDate() || new Date(0);
        if (newExpiry <= oldExpiry) return null;

        const createdAt = afterData.createdAt?.toDate();
        if (!createdAt) return null;

        const oneYearFromCreation = new Date(createdAt);
        oneYearFromCreation.setDate(oneYearFromCreation.getDate() + 365);
        if (newExpiry < oneYearFromCreation) return null;

        const referral = afterData.referralDetails;
        if (!referral || !referral.referrerId) return null;

        const lastPaid = afterData.lastCommissionPaidAt?.toDate() || new Date(0);
        const timeSinceLastPay = new Date().getTime() - lastPaid.getTime();
        if (timeSinceLastPay < 24 * 60 * 60 * 1000) return null;

        try {
            const agentRef = db.doc(`agents/${referral.referrerId}`);
            const agentSnap = await agentRef.get();
            if (!agentSnap.exists) return null;

            const agentData = agentSnap.data() || {};
            const tier = String(agentData.tier || 'bronze').toLowerCase();
            const isRenewal = !!beforeData.lastCommissionPaidAt;

            let planPrice = 0;
            const pack = String(afterData.pack || "").toLowerCase();

            if (pack === 'enterprise') planPrice = 7999;
            else if (pack.includes('pro')) planPrice = 2999;
            else if (pack.includes('basic')) planPrice = 1199;
            else if (pack.includes('catalog')) planPrice = 4999;

            let commissionRate = 0;
            if (isRenewal) {
                const renewalRates = { bronze: 0.10, silver: 0.15, gold: 0.20, platinum: 0.25 };
                commissionRate = renewalRates[tier] || 0.10;
            } else {
                const baseRates = { bronze: 0.30, silver: 0.40, gold: 0.50, platinum: 0.60 };
                commissionRate = baseRates[tier] || 0.30;
            }

            const commissionAmount = planPrice * commissionRate;
            if (commissionAmount <= 0) return null;

            const companyRef = change.after.ref;
            const newCommissionRef = db.collection('commissions').doc();
            const batch = db.batch();

            batch.update(agentRef, {
                unpaidBalance: admin.firestore.FieldValue.increment(commissionAmount),
                totalEarned: admin.firestore.FieldValue.increment(commissionAmount)
            });

            batch.update(companyRef, {
                lastCommissionPaidAt: admin.firestore.FieldValue.serverTimestamp()
            });

            batch.set(newCommissionRef, {
                agentId: referral.referrerId,
                companyId: change.after.id,
                companyName: afterData.name || 'Referred Business',
                amount: commissionAmount,
                type: isRenewal ? 'Renewal' : 'New Sale',
                tierApplied: tier,
                date: admin.firestore.FieldValue.serverTimestamp(),
                status: 'pending'
            });

            await batch.commit();
            return true;
        } catch (error) {
            console.error("Error auto-calculating commission:", error);
            return null;
        }
    });

exports.approveManualPayment = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");

    const { companyId, amountPaid, planDays } = data;
    if (!companyId || amountPaid === undefined || !planDays) {
        throw new functions.https.HttpsError("invalid-argument", "Missing payment details.");
    }

    try {
        const companyRef = db.doc(`companies/${companyId}`);
        const companySnap = await companyRef.get();
        if (!companySnap.exists) throw new functions.https.HttpsError("not-found", "Company not found.");

        const companyData = companySnap.data() || {};
        const batch = db.batch();

        const currentExpiry = companyData.expiryDate?.toDate() || new Date();
        const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
        const newExpiryDate = istEndOfDay(baseDate, planDays);

        batch.update(companyRef, {
            expiryDate: admin.firestore.Timestamp.fromDate(newExpiryDate),
            isTrial: false,
            validity: "active"
        });

        const referral = companyData.referralDetails;
        if (referral && referral.referrerId && amountPaid > 0) {
            if (referral.referrerType === 'agent' || referral.referrerType === 'agency') {
                const commissionAmount = amountPaid * 0.10;
                const agentRef = db.doc(`agents/${referral.referrerId}`);
                batch.update(agentRef, {
                    unpaidBalance: admin.firestore.FieldValue.increment(commissionAmount),
                    totalEarned: admin.firestore.FieldValue.increment(commissionAmount)
                });
            } else if (referral.referrerType === 'company') {
                const referrerCompanyRef = db.doc(`companies/${referral.referrerId}`);
                const referrerSnap = await referrerCompanyRef.get();
                if (referrerSnap.exists) {
                    const refData = referrerSnap.data() || {};
                    const refCurrentExpiry = refData.expiryDate?.toDate() || new Date();
                    const refBaseDate = refCurrentExpiry > new Date() ? refCurrentExpiry : new Date();
                    const refNewExpiry = istEndOfDay(refBaseDate, 30);

                    batch.update(referrerCompanyRef, {
                        expiryDate: admin.firestore.Timestamp.fromDate(refNewExpiry)
                    });
                }
            }
        }

        await batch.commit();
        return { status: "success", message: "Payment approved." };
    } catch (error) {
        console.error("Error approving payment:", error);
        throw new functions.https.HttpsError("internal", "Failed to process payment.");
    }
});

// Helper Function
async function generateUniqueReferralCode(name, phoneNumber) {
    const cleanName = (name || "USER").replace(/[^a-zA-Z]/g, '').toUpperCase();
    const cleanPhone = (phoneNumber || "0000").replace(/\D/g, '');

    const prefix = cleanName.padEnd(4, 'X').substring(0, 4);
    const suffixPrimary = cleanPhone.slice(-4).padStart(4, '0');

    let code = `${prefix}${suffixPrimary}`;
    let docRef = db.doc(`referrals/${code}`);
    let docSnap = await docRef.get();

    if (!docSnap.exists) return code;

    const suffixSecondary = cleanPhone.substring(0, 4).padEnd(4, '0');
    code = `${prefix}${suffixSecondary}`;
    docRef = db.doc(`referrals/${code}`);
    docSnap = await docRef.get();

    if (!docSnap.exists) return code;
    return `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
}

exports.registerAgentProfile = functions.https.onCall(async (data) => {
    const { email, password, name, phoneNumber, isAgency } = data;
    if (!email || !password || !name) throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");

    try {
        const role = isAgency ? "agency" : "agent";
        const ownReferralCode = await generateUniqueReferralCode(name, phoneNumber);

        const userRecord = await admin.auth().createUser({ email, password, displayName: name });
        await admin.auth().setCustomUserClaims(userRecord.uid, { role });

        const batch = db.batch();
        batch.set(db.doc(`agents/${userRecord.uid}`), {
            name, email, phoneNumber: phoneNumber || '', role, isAgency,
            ownReferralCode, unpaidBalance: 0, totalEarned: 0, minPayoutLimit: 500, upiId: "",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        batch.set(db.doc(`referrals/${ownReferralCode}`), {
            ownerId: userRecord.uid, type: role, usageCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        return { status: "success", uid: userRecord.uid, role };
    } catch (error) {
        if (error.code === 'auth/email-already-exists') throw new functions.https.HttpsError("already-exists", "Email already in use.");
        throw new functions.https.HttpsError("internal", "Registration failed.");
    }
});

exports.generateMyReferralCode = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    const { companyId } = data;
    if (!companyId) throw new functions.https.HttpsError("invalid-argument", "Company ID is required.");

    try {
        const companyRef = db.doc(`companies/${companyId}`);
        const companySnap = await companyRef.get();
        if (!companySnap.exists) throw new functions.https.HttpsError("not-found", "Company not found.");

        const companyData = companySnap.data() || {};
        if (companyData.ownReferralCode) return { status: "exists", referralCode: companyData.ownReferralCode };
        if (companyData.ownerUID !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Only owner can generate code.");

        const userSnap = await db.doc(`companies/${companyId}/users/${companyData.ownerUID}`).get();
        const ownerName = userSnap.exists ? userSnap.data()?.name : "USER";

        const ownReferralCode = await generateUniqueReferralCode(ownerName, companyData.ownerPhoneNumber);

        const batch = db.batch();
        batch.update(companyRef, { ownReferralCode });
        batch.set(db.doc(`referrals/${ownReferralCode}`), {
            ownerId: companyId, type: "company", usageCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();

        return { status: "success", referralCode: ownReferralCode };
    } catch (error) {
        throw new functions.https.HttpsError("internal", "Could not generate code.");
    }
});

exports.registerCompanyAndUser = functions.https.onCall(async (data) => {
    const { email, password, name, phoneNumber, role, businessData, salesSettings, catalogueSalesSettings, referralCode } = data;
    if (!email || !password || password.length < 6 || !name || !role) {
        throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    try {
        let referralDetails = null;
        if (referralCode) {
            const cleanCode = referralCode.trim().toUpperCase();
            const agentQuery = await db.collection('agents').where('ownReferralCode', '==', cleanCode).get();
            if (!agentQuery.empty) referralDetails = { referrerId: agentQuery.docs[0].id, code: cleanCode, type: 'agent' };
            else {
                const compQuery = await db.collection('companies').where('ownReferralCode', '==', cleanCode).get();
                if (!compQuery.empty) referralDetails = { referrerId: compQuery.docs[0].id, code: cleanCode, type: 'company' };
                else throw new functions.https.HttpsError("invalid-argument", "Invalid referral code.");
            }
        }

        const counterRef = db.doc("CompanyID/counter");
        const newNumber = await db.runTransaction(async (t) => {
            const counterDoc = await t.get(counterRef);
            const current = counterDoc.exists ? counterDoc.data()?.currentNumber : 1000;
            const nextNumber = current + 1;
            t.set(counterRef, { currentNumber: nextNumber }, { merge: true });
            return nextNumber;
        });

        const newCompanyId = `CMP-${String(newNumber).padStart(4, "0")}`;
        const userRecord = await admin.auth().createUser({ email, password, displayName: name });
        await admin.auth().setCustomUserClaims(userRecord.uid, { companyId: newCompanyId, role });

        const trialDate = istEndOfDay(new Date(), 3);

        const batch = db.batch();
        batch.set(db.doc(`companies/${newCompanyId}`), {
            name: businessData.businessName || name, createdAt: admin.firestore.FieldValue.serverTimestamp(),
            ownerUID: userRecord.uid, ownerPhoneNumber: phoneNumber || '', pack: "enterprise",
            validity: "active", expiryDate: admin.firestore.Timestamp.fromDate(trialDate), isTrial: true, referralDetails
        });
        batch.set(db.doc(`companies/${newCompanyId}/users/${userRecord.uid}`), {
            name, phoneNumber: phoneNumber || '', email, createdAt: admin.firestore.FieldValue.serverTimestamp(), role, companyId: newCompanyId
        });
        batch.set(db.doc(`companies/${newCompanyId}/business_info/${newCompanyId}`), {
            ...businessData, companyId: newCompanyId, ownerUID: userRecord.uid, phoneNumber: phoneNumber || "",
            email: email || "", createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        batch.set(db.doc(`companies/${newCompanyId}/settings/sales-settings`), {
            settingType: 'sales', companyId: newCompanyId, ...(salesSettings || {})
        });
        batch.set(db.doc(`companies/${newCompanyId}/settings/catalogue-sales-settings`), {
            settingType: 'catalogueSales', companyId: newCompanyId, ...(catalogueSalesSettings || {})
        });

        await batch.commit();
        return { status: "success", userId: userRecord.uid, companyId: newCompanyId };
    } catch (error) {
        if (error.message === "Invalid referral code.") throw new functions.https.HttpsError("invalid-argument", error.message);
        if (error.code === 'auth/email-already-exists') throw new functions.https.HttpsError("already-exists", "Email registered.");
        throw new functions.https.HttpsError("internal", "Registration failed.");
    }
});

exports.inviteUserToCompany = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.token.companyId) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    const { email, password, fullName, phoneNumber, role } = data;
    const companyId = context.auth.token.companyId;

    if (!email || !password || !fullName || !role) throw new functions.https.HttpsError("invalid-argument", "Missing fields.");

    try {
        const userRecord = await admin.auth().createUser({ email, password, displayName: fullName });
        await admin.auth().setCustomUserClaims(userRecord.uid, { companyId, role });

        await db.doc(`companies/${companyId}/users/${userRecord.uid}`).set({
            name: fullName, phoneNumber: phoneNumber || '', email, role,
            createdAt: admin.firestore.FieldValue.serverTimestamp(), companyId
        });

        return { status: "success", userId: userRecord.uid };
    } catch (error) {
        throw new functions.https.HttpsError("internal", error.message);
    }
});
exports.getPublicItem = functions
    .region("us-central1")
    .https.onRequest(async (req, res) => {
        const { cId, itemId } = req.query;

        if (!cId || !itemId) {
            res.status(400).json({ error: "Missing cId or itemId" });
            return;
        }

        try {
            const itemRef = db
                .collection("companies")
                .doc(String(cId))
                .collection("items")
                .doc(String(itemId));

            const itemSnap = await itemRef.get();

            if (!itemSnap.exists) {
                res.status(404).json({ error: "Item not found" });
                return;
            }

            const data = itemSnap.data();

            // Only expose what's needed for a preview card — never the full doc.
            const mrp = Number(data.mrp || 0);
            const salesPrice = Number(data.salesPrice || 0);
            const discount = Number(data.discount || 0);

            let salePrice = 0;
            if (mrp > 0 && salesPrice > 0) {
                salePrice = salesPrice;
            } else if (salesPrice > 0) {
                salePrice = salesPrice * (1 - discount / 100);
            } else if (mrp > 0) {
                salePrice = mrp * (1 - discount / 100);
            }
            salePrice = Math.round((salePrice + Number.EPSILON) * 100) / 100;

            const publicItem = {
                id: itemSnap.id,
                name: data.name || "Product",
                imageUrl: data.imageUrl || null,
                mrp,
                salePrice,
                isListed: data.isListed ?? false,
            };

            // Cache like getPublicCatalogue: short browser cache, longer CDN cache.
            res.set(
                "Cache-Control",
                "public, max-age=60, s-maxage=3600, stale-while-revalidate=600"
            );
            res.status(200).json(publicItem);
        } catch (error) {
            console.error("Error fetching public item:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

// =========================================================
// Razorpay Subscription Payments + Coupons
// =========================================================

// 365-day validity, INR, matches the yearly prices shown on SubscriptionPage.tsx
const PLAN_PRICING = {
    pos_basic: 999,
    pos_pro: 2999,
    catalogue_pro: 4999,
    enterprise: 7999,
};
const PLAN_DAYS = 365;
const TAX_RATE = 0.18; // 18% GST, applied on every plan after any coupon discount

// Applies GST to the post-discount amount. Rounded to the nearest rupee.
function applyTax(taxableAmount) {
    const taxAmount = Math.round(taxableAmount * TAX_RATE);
    return { taxableAmount, taxAmount, finalAmount: taxableAmount + taxAmount };
}

function getRazorpayInstance() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
        throw new functions.https.HttpsError("failed-precondition", "Payment gateway is not configured.");
    }
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// Read-only: looks up a coupon and computes the discount for a given plan/company, without writing anything.
async function resolveCoupon(codeRaw, planId, companyId, baseAmount) {
    const code = String(codeRaw || "").trim().toUpperCase();
    if (!code) return { valid: false, message: "Enter a coupon code." };

    const couponRef = db.doc(`coupons/${code}`);
    const couponSnap = await couponRef.get();
    if (!couponSnap.exists) return { valid: false, message: "Invalid coupon code." };

    const coupon = couponSnap.data();
    const now = new Date();

    if (coupon.isActive === false) return { valid: false, message: "This coupon is no longer active." };

    const validFrom = coupon.validFrom && coupon.validFrom.toDate ? coupon.validFrom.toDate() : null;
    if (validFrom && now < validFrom) return { valid: false, message: "This coupon is not active yet." };

    const validTill = coupon.validTill && coupon.validTill.toDate ? coupon.validTill.toDate() : null;
    if (validTill && now > validTill) return { valid: false, message: "This coupon has expired." };

    if (Array.isArray(coupon.applicablePlans) && coupon.applicablePlans.length > 0 && !coupon.applicablePlans.includes(planId)) {
        return { valid: false, message: "This coupon is not valid for the selected plan." };
    }

    if (typeof coupon.maxRedemptions === "number" && (coupon.redemptionCount || 0) >= coupon.maxRedemptions) {
        return { valid: false, message: "This coupon has reached its usage limit." };
    }

    if (typeof coupon.minAmount === "number" && baseAmount < coupon.minAmount) {
        return { valid: false, message: `This coupon requires a minimum order of ₹${coupon.minAmount}.` };
    }

    const redemptionRef = db.doc(`couponRedemptions/${code}_${companyId}`);
    const redemptionSnap = await redemptionRef.get();
    if (redemptionSnap.exists) return { valid: false, message: "You have already used this coupon." };

    let discountAmount = 0;
    if (coupon.discountType === "percent") {
        discountAmount = Math.round((baseAmount * Number(coupon.discountValue || 0)) / 100);
    } else {
        discountAmount = Math.round(Number(coupon.discountValue || 0));
    }
    discountAmount = Math.max(0, Math.min(discountAmount, baseAmount - 1));
    const taxableAmount = baseAmount - discountAmount;

    return { valid: true, message: "Coupon applied.", code, discountAmount, taxableAmount, couponRef, coupon };
}

exports.validateCoupon = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.token.companyId) {
        throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }
    const { code, planId } = data;
    const baseAmount = PLAN_PRICING[planId];
    if (!baseAmount) throw new functions.https.HttpsError("invalid-argument", "Unknown plan.");

    const result = await resolveCoupon(code, planId, context.auth.token.companyId, baseAmount);
    const discountAmount = result.valid ? result.discountAmount : 0;
    const tax = applyTax(result.valid ? result.taxableAmount : baseAmount);
    return {
        valid: result.valid,
        message: result.message,
        baseAmount,
        discountAmount,
        taxRate: TAX_RATE,
        taxAmount: tax.taxAmount,
        finalAmount: tax.finalAmount,
    };
});

exports.createRazorpayOrder = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.token.companyId) {
        throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }
    const { planId, couponCode } = data;
    const baseAmount = PLAN_PRICING[planId];
    if (!baseAmount) throw new functions.https.HttpsError("invalid-argument", "Unknown plan.");

    const companyId = context.auth.token.companyId;
    let taxableAmount = baseAmount;
    let discountAmount = 0;
    let appliedCode = null;

    if (couponCode) {
        const result = await resolveCoupon(couponCode, planId, companyId, baseAmount);
        if (!result.valid) throw new functions.https.HttpsError("failed-precondition", result.message);
        taxableAmount = result.taxableAmount;
        discountAmount = result.discountAmount;
        appliedCode = result.code;
    }

    const tax = applyTax(taxableAmount);

    try {
        const razorpay = getRazorpayInstance();
        const order = await razorpay.orders.create({
            amount: tax.finalAmount * 100,
            currency: "INR",
            receipt: `sub_${companyId}_${Date.now()}`,
            notes: { companyId, planId, couponCode: appliedCode || "" },
        });

        await db.doc(`paymentOrders/${order.id}`).set({
            companyId,
            uid: context.auth.uid,
            planId,
            planDays: PLAN_DAYS,
            baseAmount,
            discountAmount,
            taxRate: TAX_RATE,
            taxAmount: tax.taxAmount,
            finalAmount: tax.finalAmount,
            couponCode: appliedCode,
            status: "created",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
            orderId: order.id,
            amount: tax.finalAmount,
            baseAmount,
            discountAmount,
            taxAmount: tax.taxAmount,
            currency: "INR",
            keyId: process.env.RAZORPAY_KEY_ID,
        };
    } catch (error) {
        console.error("Error creating Razorpay order:", error);
        throw new functions.https.HttpsError("internal", "Failed to create payment order.");
    }
});

exports.verifyRazorpayPayment = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.token.companyId) {
        throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }
    const { orderId, paymentId, signature } = data;
    if (!orderId || !paymentId || !signature) {
        throw new functions.https.HttpsError("invalid-argument", "Missing payment verification details.");
    }

    const companyId = context.auth.token.companyId;
    const orderRef = db.doc(`paymentOrders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new functions.https.HttpsError("not-found", "Order not found.");

    const order = orderSnap.data();
    if (order.companyId !== companyId) {
        throw new functions.https.HttpsError("permission-denied", "This order does not belong to your company.");
    }
    if (order.status === "paid") {
        return { status: "success", message: "Payment already verified." };
    }

    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

    if (expectedSignature !== signature) {
        await orderRef.update({ status: "failed" });
        throw new functions.https.HttpsError("permission-denied", "Payment verification failed.");
    }

    try {
        await db.runTransaction(async (tx) => {
            const companyRef = db.doc(`companies/${companyId}`);

            // --- All reads first (Firestore transactions require every read before any write) ---
            const [companySnap, freshOrderSnap] = await Promise.all([tx.get(companyRef), tx.get(orderRef)]);
            if (!companySnap.exists) throw new functions.https.HttpsError("not-found", "Company not found.");
            const freshOrder = freshOrderSnap.data();
            if (freshOrder.status === "paid") return; // already processed by a concurrent call

            const companyData = companySnap.data() || {};
            const referral = companyData.referralDetails;

            let redemptionRef = null;
            let redemptionSnap = null;
            if (freshOrder.couponCode) {
                redemptionRef = db.doc(`couponRedemptions/${freshOrder.couponCode}_${companyId}`);
                redemptionSnap = await tx.get(redemptionRef);
            }

            let referrerCompanyRef = null;
            let referrerSnap = null;
            if (referral && referral.referrerId && freshOrder.finalAmount > 0 && referral.referrerType === "company") {
                referrerCompanyRef = db.doc(`companies/${referral.referrerId}`);
                referrerSnap = await tx.get(referrerCompanyRef);
            }

            // --- All writes after ---
            const currentExpiry = companyData.expiryDate && companyData.expiryDate.toDate ? companyData.expiryDate.toDate() : new Date();
            const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
            const newExpiryDate = istEndOfDay(baseDate, freshOrder.planDays);

            tx.update(companyRef, {
                expiryDate: admin.firestore.Timestamp.fromDate(newExpiryDate),
                pack: freshOrder.planId,
                validity: "active",
                isTrial: false,
            });

            tx.update(orderRef, {
                status: "paid",
                razorpayPaymentId: paymentId,
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            if (freshOrder.couponCode && redemptionRef && !redemptionSnap.exists) {
                const couponRef = db.doc(`coupons/${freshOrder.couponCode}`);
                tx.update(couponRef, { redemptionCount: admin.firestore.FieldValue.increment(1) });
                tx.set(redemptionRef, {
                    code: freshOrder.couponCode,
                    companyId,
                    orderId,
                    discountApplied: freshOrder.discountAmount,
                    redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }

            if (referral && referral.referrerId && freshOrder.finalAmount > 0) {
                if (referral.referrerType === "agent" || referral.referrerType === "agency") {
                    const commissionAmount = freshOrder.finalAmount * 0.10;
                    const agentRef = db.doc(`agents/${referral.referrerId}`);
                    tx.update(agentRef, {
                        unpaidBalance: admin.firestore.FieldValue.increment(commissionAmount),
                        totalEarned: admin.firestore.FieldValue.increment(commissionAmount),
                    });
                } else if (referrerCompanyRef && referrerSnap && referrerSnap.exists) {
                    const refData = referrerSnap.data() || {};
                    const refCurrentExpiry = refData.expiryDate && refData.expiryDate.toDate ? refData.expiryDate.toDate() : new Date();
                    const refBaseDate = refCurrentExpiry > new Date() ? refCurrentExpiry : new Date();
                    const refNewExpiry = istEndOfDay(refBaseDate, 30);
                    tx.update(referrerCompanyRef, {
                        expiryDate: admin.firestore.Timestamp.fromDate(refNewExpiry),
                    });
                }
            }
        });

        return { status: "success", message: "Payment verified and subscription activated." };
    } catch (error) {
        console.error("Error verifying Razorpay payment:", error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError("internal", "Failed to activate subscription.");
    }
});