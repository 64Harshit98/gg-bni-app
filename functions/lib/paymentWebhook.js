"use strict";
/**
 * ICICI Bank Payment Gateway — Payment Advice webhook.
 *
 * ICICI's PG pushes a server-to-server "Payment Advice" POST whenever a
 * transaction's status changes (see "Chapter 8: Payment Advice" in ICICI's
 * Gateway Interface Specification). This is the async webhook: distinct from
 * the browser-redirect "Payment Response" (Chapter 7) that ICICI posts back
 * to `returnURL` when the customer's browser returns from checkout. Both use
 * the same parameter shape and the same secureHash scheme, so this handler
 * covers either if you point the relevant URL at it — but Payment Advice is
 * the one ICICI actually retries on non-200, which is what makes it a real
 * webhook rather than a one-shot redirect callback.
 *
 * IMPORTANT — read before deploying:
 * ICICI's secureHash is NOT a raw-body HMAC. Per "Hash Calculation" in their
 * spec: sort the response's field names alphabetically, concatenate the
 * corresponding values (skipping null/empty ones and secureHash itself) with
 * no separator, then HMAC-SHA256 that string with the merchant's shared key
 * and hex-encode it. This only holds for the default
 * application/x-www-form-urlencoded delivery (Hash Calc V1). If this
 * merchant account was onboarded for JSON-format advices instead, ICICI
 * sends Content-Type: application/json and the hash in a `securehash`
 * request header, computed differently (Hash Calc V2: HMAC over the raw
 * JSON body bytes) — that path is handled separately below. Confirm with
 * ICICI/your onboarding docs which format this merchant is configured for.
 *
 * This function assumes a `paymentOrders/{merchantTxnNo}` document already
 * exists, written when the sale was initiated (the initiateSale API call —
 * not implemented here). Because ICICI's merchantTxnNo can't hold a Firestore
 * path (alphanumeric only, 20 chars max), that lookup document is what maps
 * the transaction back to the tenant/invoice it belongs to — the same
 * pattern this codebase already uses for Razorpay orders
 * (`paymentOrders/{razorpayOrderId}` in functions/lib/index.js). Expected
 * shape:
 *   {
 *     targetCollection: string,  // top-level collection, allowlisted below
 *     targetDocId: string,       // doc within that collection to update
 *   }
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentWebhook = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const logger = __importStar(require("firebase-functions/logger"));
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
// The shared key ICICI issues per merchant (same key used to sign
// initiateSale requests) — set with:
//   firebase functions:secrets:set ICICI_PG_SECRET_KEY
const ICICI_SECRET_KEY = (0, params_1.defineSecret)("ICICI_PG_SECRET_KEY");
// Not secret — ICICI echoes this back in every response; used as a sanity
// check that the advice actually belongs to this merchant account.
const ICICI_MERCHANT_ID = (0, params_1.defineString)("ICICI_MERCHANT_ID");
// Top-level collections a paymentOrders lookup is allowed to point at.
// Defense in depth: the paymentOrders doc is written by our own code, but
// this still stops a corrupted/malicious paymentOrders record from steering
// a write at an arbitrary collection.
const ALLOWED_COLLECTIONS = new Set(["companies", "Invoices"]);
/** Hash Calc V1: sort field names, concatenate values, HMAC-SHA256, hex, lowercase. */
function computeSecureHashV1(fields, secretKey) {
    const concatenated = Object.keys(fields)
        .filter((key) => key !== "secureHash")
        .filter((key) => fields[key] !== null && fields[key] !== undefined && String(fields[key]) !== "")
        .sort()
        .map((key) => String(fields[key]))
        .join("");
    return crypto.createHmac("sha256", secretKey).update(concatenated, "ascii").digest("hex").toLowerCase();
}
function timingSafeEqualHex(a, b) {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length === 0 || bufA.length !== bufB.length)
        return false;
    return crypto.timingSafeEqual(bufA, bufB);
}
function verifySignature(req, secretKey) {
    var _a;
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("application/json")) {
        // Hash Calc V2: HMAC over the exact raw JSON bytes ICICI sent, hash
        // arrives in the `securehash` header (case-insensitive per spec).
        const headerHash = req.headers["securehash"];
        if (!headerHash || Array.isArray(headerHash))
            return false;
        const expected = crypto.createHmac("sha256", secretKey).update(req.rawBody).digest("hex").toLowerCase();
        return timingSafeEqualHex(expected, headerHash.toLowerCase());
    }
    // Hash Calc V1 (default): form-urlencoded body, secureHash is itself one
    // of the posted fields.
    const providedHash = (_a = req.body) === null || _a === void 0 ? void 0 : _a.secureHash;
    if (!providedHash || typeof providedHash !== "string")
        return false;
    const expected = computeSecureHashV1(req.body, secretKey);
    return timingSafeEqualHex(expected, providedHash.toLowerCase());
}
function parseAdvice(body) {
    var _a;
    const merchantTxnNo = body.merchantTxnNo;
    const txnID = body.txnID;
    if (!merchantTxnNo || !txnID)
        return null;
    const responseCode = String((_a = body.responseCode) !== null && _a !== void 0 ? _a : "");
    // "000" / "0000" = success. "R1000" = request initiated, not final
    // (mostly out-of-band UPI) — not actionable here, caller should no-op.
    // Anything else = failure.
    if (responseCode === "R1000")
        return null;
    const status = responseCode === "000" || responseCode === "0000" ? "success" : "failure";
    return {
        merchantTxnNo: String(merchantTxnNo),
        txnID: String(txnID),
        paymentID: body.paymentID != null ? String(body.paymentID) : null,
        status,
        amount: body.amount != null ? String(body.amount) : null,
    };
}
async function resolveTargetDoc(merchantTxnNo) {
    const orderSnap = await db.collection("paymentOrders").doc(merchantTxnNo).get();
    if (!orderSnap.exists)
        return null;
    const order = orderSnap.data();
    if (!order.targetCollection || !order.targetDocId)
        return null;
    if (!ALLOWED_COLLECTIONS.has(order.targetCollection))
        return null;
    return db.doc(`${order.targetCollection}/${order.targetDocId}`);
}
exports.paymentWebhook = (0, https_1.onRequest)({ secrets: [ICICI_SECRET_KEY], region: "us-central1" }, async (req, res) => {
    var _a;
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    if (!verifySignature(req, ICICI_SECRET_KEY.value())) {
        logger.warn("paymentWebhook: secureHash verification failed");
        res.status(400).send("Invalid signature");
        return;
    }
    const body = req.body;
    if (ICICI_MERCHANT_ID.value() && String((_a = body.merchantId) !== null && _a !== void 0 ? _a : "") !== ICICI_MERCHANT_ID.value()) {
        logger.warn("paymentWebhook: merchantId mismatch", { received: body.merchantId });
        res.status(400).send("Unknown merchant");
        return;
    }
    const advice = parseAdvice(body);
    if (!advice) {
        // Either malformed, or responseCode was R1000 (pending, not
        // actionable) — ack so ICICI doesn't retry a payload we don't
        // need to act on.
        logger.info("paymentWebhook: nothing to process", { body });
        res.status(200).send("OK");
        return;
    }
    const targetRef = await resolveTargetDoc(advice.merchantTxnNo);
    if (!targetRef) {
        logger.error("paymentWebhook: no paymentOrders record for merchantTxnNo", {
            merchantTxnNo: advice.merchantTxnNo,
        });
        res.status(400).send("Unknown reference");
        return;
    }
    // Idempotency: one doc per ICICI txnID, created in the same
    // transaction as the target update. A redelivered advice for a
    // txnID we've already processed is a no-op — still ack with 200.
    const idempotencyRef = db.collection("processedWebhookEvents").doc(advice.txnID);
    try {
        await db.runTransaction(async (tx) => {
            const idempotencySnap = await tx.get(idempotencyRef);
            if (idempotencySnap.exists) {
                logger.info("paymentWebhook: duplicate txnID, skipping", { txnID: advice.txnID });
                return;
            }
            tx.set(idempotencyRef, {
                merchantTxnNo: advice.merchantTxnNo,
                paymentID: advice.paymentID,
                status: advice.status,
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            tx.set(targetRef, {
                paymentStatus: advice.status,
                paymentId: advice.paymentID,
                icicTxnId: advice.txnID,
                ...(advice.amount !== null ? { paymentAmount: advice.amount } : {}),
                paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        });
        res.status(200).send("OK");
    }
    catch (error) {
        logger.error("paymentWebhook: failed to process advice", { error, txnID: advice.txnID });
        // 500 so ICICI's advice retry mechanism gets a chance to redeliver.
        res.status(500).send("Internal Error");
    }
});
//# sourceMappingURL=paymentWebhook.js.map