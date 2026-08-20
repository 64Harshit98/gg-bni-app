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

// Initialize Vision API Client
const client = new vision.ImageAnnotatorClient();

exports.scanSmartInvoice = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to scan documents.');
    }

    const { imageBase64 } = data;
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

        // textAnnotations[0] is the full block of text (which is jumbled).
        // Index 1 onwards contains every individual word on the page with exact X/Y coordinates.
        const words = result.textAnnotations.slice(1);

        const rows = [];
        const Y_TOLERANCE = 14; // pixels of vertical wiggle room to handle slight camera tilt

        words.forEach(wordObj => {
            // Safe fallback to prevent the 500 error we saw earlier
            const vertices = wordObj.boundingPoly && wordObj.boundingPoly.vertices;
            if (!vertices || vertices.length < 4) return;

            const text = wordObj.description;

            // Safe coordinate extraction
            const y0 = vertices[0].y || 0;
            const y2 = vertices[2].y || 0;
            const x0 = vertices[0].x || 0;
            const x2 = vertices[2].x || 0;

            // Find the physical center of the word
            const yCenter = (y0 + y2) / 2;
            const xCenter = (x0 + x2) / 2;

            let addedToRow = false;

            // Loop through existing rows. If it's on the same vertical level, add it to the row!
            for (let row of rows) {
                if (Math.abs(row.yCenter - yCenter) <= Y_TOLERANCE) {
                    row.items.push({ text, x: xCenter });
                    // Slightly adjust the row's center average as we add more words
                    row.yCenter = ((row.yCenter * (row.items.length - 1)) + yCenter) / row.items.length;
                    addedToRow = true;
                    break;
                }
            }

            // If it doesn't fit in an existing row, create a new one
            if (!addedToRow) {
                rows.push({ yCenter: yCenter, items: [{ text, x: xCenter }] });
            }
        });

        // 1. Sort all rows top-to-bottom on the page
        rows.sort((a, b) => a.yCenter - b.yCenter);

        // 2. Sort words within each row left-to-right, then join them with spaces
        const finalLines = rows.map(row => {
            row.items.sort((a, b) => a.x - b.x);
            return row.items.map(i => i.text).join(' ');
        });

        // Combine all the mathematically perfect rows back into a single text block
        const perfectlyFormattedText = finalLines.join('\n');

        console.log("GLOBAL RECONSTRUCTION:\n", perfectlyFormattedText);

        return {
            success: true,
            text: perfectlyFormattedText
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
        const newExpiryDate = new Date(baseDate);
        newExpiryDate.setDate(newExpiryDate.getDate() + planDays);
        newExpiryDate.setHours(23, 59, 59, 999);

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
                    const refNewExpiry = new Date(refBaseDate);
                    refNewExpiry.setDate(refNewExpiry.getDate() + 30);
                    refNewExpiry.setHours(23, 59, 59, 999);

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

        const trialDate = new Date();
        trialDate.setDate(trialDate.getDate() + 3);
        trialDate.setHours(23, 59, 59, 999);

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
            const newExpiryDate = new Date(baseDate);
            newExpiryDate.setDate(newExpiryDate.getDate() + freshOrder.planDays);
            newExpiryDate.setHours(23, 59, 59, 999);

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
                    const refNewExpiry = new Date(refBaseDate);
                    refNewExpiry.setDate(refNewExpiry.getDate() + 30);
                    refNewExpiry.setHours(23, 59, 59, 999);
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