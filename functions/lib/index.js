const axios = require("axios");
const cors = require("cors")({ origin: true }); // Allows your frontend to talk to this function
const SUPER_ADMIN_UIDS = [
    "6vwZ1HRqX7VSnh5KP4JW0TKeuZm2",
    "1AKioGfop8PmHhry6uXOz8Rw6qT2"
];
const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

exports.fetchInvoiceData = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }

    const { companyId, orderId } = data;
    if (!companyId || !orderId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing params.");
    }

    try {
        // 1. Fetch Order
        const orderRef = db.collection("companies").doc(companyId).collection("Orders").doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) throw new functions.https.HttpsError("not-found", "Order not found");
        const orderData = orderSnap.data();

        // 2. Fetch Images securely without CORS
        const processedItems = await Promise.all((orderData.items || []).map(async (item, index) => {
            let base64Image = "";
            if (item.imageUrl) {
                try {
                    const response = await fetch(item.imageUrl);
                    const arrayBuffer = await response.arrayBuffer();
                    // Detect PNG vs JPEG
                    const mimeType = item.imageUrl.includes('.png') ? 'image/png' : 'image/jpeg';
                    base64Image = `data:${mimeType};base64,` + Buffer.from(arrayBuffer).toString('base64');
                } catch (err) {
                    console.error(`Image fetch failed for ${item.id}`);
                }
            }

            return {
                ...item,
                sno: index + 1,
                imageBase64: base64Image // We attach the safe base64 string!
            };
        }));

        // Return the clean data to the frontend
        return {
            success: true,
            orderData: {
                ...orderData,
                items: processedItems
            }
        };

    } catch (error) {
        console.error("Data Fetch Error:", error);
        throw new functions.https.HttpsError("internal", "Failed to fetch invoice data");
    }
});


exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
    // 1. Verify the requester is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    }

    const { targetUid, companyId } = data;

    // 2. IMPORTANT: Verify the requester has permission to delete users!
    // (Check their custom claims, or query their role in Firestore to ensure they are an OWNER)

    try {
        // 3. Delete from Firebase Auth
        await admin.auth().deleteUser(targetUid);

        // 4. Delete from Firestore
        await admin.firestore()
            .collection('companies').doc(companyId)
            .collection('users').doc(targetUid)
            .delete();

        return { success: true, message: 'User completely deleted.' };
    } catch (error) {
        console.error("Error deleting user:", error);
        throw new functions.https.HttpsError('internal', 'Failed to delete user.');
    }
});


exports.deleteCompanyData = functions.https.onCall(async (data, context) => {
    // 1. Security Check: Check if the caller's UID is in the allowed array
    if (!context.auth || !SUPER_ADMIN_UIDS.includes(context.auth.uid)) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only Super Admins can perform this action.'
        );
    }

    const { companyId } = data;
    if (!companyId) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'The function must be called with a valid companyId.'
        );
    }

    const db = admin.firestore();
    const auth = admin.auth();

    try {
        // 2. Fetch all users in the company's subcollection
        const usersSnapshot = await db.collection(`companies/${companyId}/users`).get();

        // 3. Delete each user from Firebase Authentication
        const deleteAuthPromises = [];
        usersSnapshot.forEach((doc) => {
            const uid = doc.id; // Assuming the user doc ID matches their Auth UID

            // We catch individual errors so one missing Auth user doesn't crash the whole process
            const deletePromise = auth.deleteUser(uid).catch((err) => {
                console.warn(`Could not delete Auth user ${uid} (may already be deleted):`, err.message);
            });
            deleteAuthPromises.push(deletePromise);
        });

        await Promise.all(deleteAuthPromises);

        // 4. Recursively delete the company document and ALL subcollections (users, settings, etc.)
        const companyRef = db.doc(`companies/${companyId}`);
        await db.recursiveDelete(companyRef);

        return {
            success: true,
            message: `Company ${companyId} and ${deleteAuthPromises.length} associated user(s) successfully deleted.`
        };

    } catch (error) {
        console.error("Error deleting company:", error);
        throw new functions.https.HttpsError(
            'internal',
            'An error occurred while deleting the company.',
            error
        );
    }
});

exports.botmasterProxy = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            // req.url contains everything after the function name (e.g., /api/v1/?action=send)
            const targetUrl = `https://api.botmastersender.com${req.url}`;

            // Forward the exact request to BotMaster
            const response = await axios({
                method: req.method,
                url: targetUrl,
                data: req.body,
                headers: {
                    "Content-Type": "application/json"
                }
            });

            // Send BotMaster's response back to your React app
            res.status(response.status).send(response.data);

        } catch (error) {
            console.error("Proxy Error:", error.message);
            if (error.response) {
                res.status(error.response.status).send(error.response.data);
            } else {
                res.status(500).send({ error: "Cloud Function Proxy failed." });
            }
        }
    });
});
exports.getPublicCatalogue = functions.https.onRequest(async (req, res) => {
    // 1. Extract the subdomain (e.g., 'mahesh-kirana' from 'mahesh-kirana.sellar.in')
    const host = req.hostname;
    const slug = host.split('.')[0];

    // 2. Safety Check: Don't process main app or reserved words
    if (['app', 'www', 'api', 'admin'].includes(slug)) {
        res.status(404).send("Not a merchant subdomain");
        return;
    }

    try {
        // 3. Fetch the 'Bundle' document (One read for the whole store)
        const storeDoc = await admin.firestore().collection("public_catalogues").doc(slug).get();

        if (!storeDoc.exists) {
            res.status(404).send("Store not found");
            return;
        }

        /** * 4. THE MONEY SAVER: CDN Caching
         * public: Allow caching by Google's CDN
         * max-age: Browser caches for 60 seconds
         * s-maxage: Google CDN caches for 3600 seconds (1 hour)
         * stale-while-revalidate: Serve old data for 10 mins while fetching fresh in background
         */
        res.set('Cache-Control', 'public, max-age=60, s-maxage=3600, stale-while-revalidate=600');

        res.status(200).json(storeDoc.data());
    } catch (error) {
        console.error("Error fetching catalogue:", error);
        res.status(500).send("Internal Server Error");
    }
});

exports.autoAwardUserReferralCredit = functions.firestore
    .document('companies/{newCompanyId}')
    .onCreate(async (snap, context) => {
        const newCompanyData = snap.data();
        const referral = newCompanyData.referralDetails;

        // 1. Did they use a referral code?
        if (!referral || !referral.referrerId) return null;

        try {
            // 2. Check if the referrer is another COMPANY (not an Agent)
            const referrerRef = db.collection('companies').doc(referral.referrerId);
            const referrerSnap = await referrerRef.get();

            // If the ID belongs to an Agent, stop here. The Agent Commission function handles that!
            if (!referrerSnap.exists) return null;

            // 3. It IS a company! Give them +1 Credit
            await referrerRef.update({
                referralCredits: admin.firestore.FieldValue.increment(1)
            });

            // 4. Create a "Receipt" in the new creditLedger collection
            await db.collection('creditLedger').add({
                referrerId: referral.referrerId,
                referrerName: referrerSnap.data().name || 'Unknown User',
                referredCompanyId: snap.id,
                referredCompanyName: newCompanyData.name || 'New Business',
                type: 'Earned', // 'Earned' means they got a credit. 'Claimed' means you gave them a free month.
                date: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`Awarded 1 Credit to ${referrerSnap.data().name} for referring ${newCompanyData.name}`);
            return true;

        } catch (error) {
            console.error("Error awarding user credit:", error);
            return null;
        }
    });

exports.autoCalculateCommissionOnExtension = functions.firestore
    .document('companies/{companyId}')
    .onUpdate(async (change, context) => {
        const beforeData = change.before.data();
        const afterData = change.after.data();

        // 1. Did the expiry date actually increase?
        const oldExpiry = beforeData.expiryDate?.toDate() || new Date(0);
        const newExpiry = afterData.expiryDate?.toDate() || new Date(0);
        if (newExpiry <= oldExpiry) return null;

        // 2. Is the new expiry date >= 1 year after creation?
        const createdAt = afterData.createdAt?.toDate();
        if (!createdAt) return null;

        const oneYearFromCreation = new Date(createdAt);
        oneYearFromCreation.setDate(oneYearFromCreation.getDate() + 365);
        if (newExpiry < oneYearFromCreation) return null;

        // 3. Was this company referred by an Agent or Agency?
        const referral = afterData.referralDetails;
        if (!referral || !referral.referrerId) return null;

        // 4. Cooldown Check to prevent double-paying
        const lastPaid = afterData.lastCommissionPaidAt?.toDate() || new Date(0);
        const timeSinceLastPay = new Date() - lastPaid;
        if (timeSinceLastPay < 24 * 60 * 60 * 1000) return null;

        try {
            // 5. FETCH THE AGENT TO FIND THEIR TIER
            const agentRef = db.doc(`agents/${referral.referrerId}`);
            const agentSnap = await agentRef.get();
            if (!agentSnap.exists) return null;

            const agentData = agentSnap.data();
            const tier = String(agentData.tier || 'bronze').toLowerCase(); // defaults to bronze

            // 6. IS THIS A RENEWAL OR A FIRST TIME SALE?
            // If they already have a lastCommissionPaidAt timestamp from the past, it's a renewal!
            const isRenewal = !!beforeData.lastCommissionPaidAt;

            // 7. GET THE PLAN PRICE
            let planPrice = 0;
            const pack = String(afterData.pack || "").toLowerCase();

            if (pack === 'enterprise') planPrice = 7999;
            else if (pack.includes('pro')) planPrice = 2999;
            else if (pack.includes('basic')) planPrice = 1199;
            else if (pack.includes('catalog')) planPrice = 4999;

            // 8. APPLY THE COMMISSION RATES FROM YOUR TABLE
            let commissionRate = 0;

            if (isRenewal) {
                // Renewal Rates: 10% | 15% | 20% | 25%
                const renewalRates = { bronze: 0.10, silver: 0.15, gold: 0.20, platinum: 0.25 };
                commissionRate = renewalRates[tier] || 0.10;
            } else {
                // Base Pack Rates: 30% | 40% | 50% | 60%
                const baseRates = { bronze: 0.30, silver: 0.40, gold: 0.50, platinum: 0.60 };
                commissionRate = baseRates[tier] || 0.30;
            }

            const commissionAmount = planPrice * commissionRate;

            if (commissionAmount <= 0) return null;

            // 9. UPDATE DATABASE
            const companyRef = change.after.ref;
            const newCommissionRef = db.collection('commissions').doc();
            const batch = db.batch();

            // Add money to Agent
            batch.update(agentRef, {
                unpaidBalance: admin.firestore.FieldValue.increment(commissionAmount),
                totalEarned: admin.firestore.FieldValue.increment(commissionAmount)
            });

            // Tag the company
            batch.update(companyRef, {
                lastCommissionPaidAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Save receipt
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
            console.log(`Paid ₹${commissionAmount} (${tier} tier, ${isRenewal ? 'Renewal' : 'New'}) to ${referral.referrerId}`);
            return true;

        } catch (error) {
            console.error("Error auto-calculating commission:", error);
            return null;
        }
    });

exports.approveManualPayment = functions.https.onCall(async (data, context) => {
    // 1. Security: Only an Admin should be able to call this!
    // (Ensure you have a way to verify the caller is you/an admin)
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }

    const { companyId, amountPaid, planDays } = data;

    if (!companyId || amountPaid === undefined || !planDays) {
        throw new functions.https.HttpsError("invalid-argument", "Missing payment details.");
    }

    try {
        const companyRef = db.doc(`companies/${companyId}`);
        const companySnap = await companyRef.get();

        if (!companySnap.exists) {
            throw new functions.https.HttpsError("not-found", "Company not found.");
        }

        const companyData = companySnap.data();
        const batch = db.batch();

        // --- 1. UPDATE THE PAYING COMPANY'S SUBSCRIPTION ---
        // Calculate new expiry date (from today, or add to existing if not expired)
        const currentExpiry = companyData.expiryDate?.toDate() || new Date();
        const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();

        const newExpiryDate = new Date(baseDate);
        newExpiryDate.setDate(newExpiryDate.getDate() + planDays);

        batch.update(companyRef, {
            expiryDate: admin.firestore.Timestamp.fromDate(newExpiryDate),
            isTrial: false,
            validity: "active"
        });

        // --- 2. CHECK FOR REFERRAL AND DISTRIBUTE REWARD ---
        const referral = companyData.referralDetails;

        // Only pay commission if they actually paid money and have a valid referrer
        if (referral && referral.referrerId && amountPaid > 0) {

            if (referral.referrerType === 'agent' || referral.referrerType === 'agency') {
                // Calculate 10% Commission
                const commissionAmount = amountPaid * 0.10;
                const agentRef = db.doc(`agents/${referral.referrerId}`);

                // Use FieldValue.increment to safely add to the existing balance
                batch.update(agentRef, {
                    unpaidBalance: admin.firestore.FieldValue.increment(commissionAmount),
                    totalEarned: admin.firestore.FieldValue.increment(commissionAmount)
                });

            } else if (referral.referrerType === 'company') {
                // Reward a referring company with 30 free days
                const referrerCompanyRef = db.doc(`companies/${referral.referrerId}`);
                const referrerSnap = await referrerCompanyRef.get();

                if (referrerSnap.exists()) {
                    const refData = referrerSnap.data();
                    const refCurrentExpiry = refData.expiryDate?.toDate() || new Date();
                    const refBaseDate = refCurrentExpiry > new Date() ? refCurrentExpiry : new Date();

                    const refNewExpiry = new Date(refBaseDate);
                    refNewExpiry.setDate(refNewExpiry.getDate() + 30); // 30 Days Free

                    batch.update(referrerCompanyRef, {
                        expiryDate: admin.firestore.Timestamp.fromDate(refNewExpiry)
                    });
                }
            }
        }

        // Execute all database updates at the exact same time
        await batch.commit();

        return { status: "success", message: "Payment approved and rewards distributed." };

    } catch (error) {
        console.error("Error approving payment:", error);
        throw new functions.https.HttpsError("internal", "Failed to process payment and rewards.");
    }
});

exports.registerAgentProfile = functions.https.onCall(async (data, context) => {
    const { email, password, name, phoneNumber, isAgency } = data;

    if (!email || !password || !name) {
        throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    try {
        const role = isAgency ? "agency" : "agent";

        // 1. Generate their permanent referral code
        const ownReferralCode = await generateUniqueReferralCode(name, phoneNumber);

        // 2. Create Auth User
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name,
        });

        // 3. Set Custom Claims (Crucial for login routing)
        await admin.auth().setCustomUserClaims(userRecord.uid, {
            role: role,
        });

        // 4. Prepare Document Payloads
        const agentRef = db.doc(`agents/${userRecord.uid}`);
        const referralRef = db.doc(`referrals/${ownReferralCode}`);

        const agentData = {
            name: name,
            email: email,
            phoneNumber: phoneNumber || '',
            role: role,
            isAgency: isAgency,
            ownReferralCode: ownReferralCode,
            unpaidBalance: 0,
            totalEarned: 0,
            minPayoutLimit: 500, // Fixed ₹500 minimum limit
            upiId: "", // Will be collected on first withdrawal
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const referralData = {
            ownerId: userRecord.uid,
            type: role,
            usageCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // 5. Atomic Batch Write
        const batch = db.batch();
        batch.set(agentRef, agentData);
        batch.set(referralRef, referralData);
        await batch.commit();

        return { status: "success", uid: userRecord.uid, role: role };

    } catch (error) {
        console.error("Error in registerAgentProfile:", error);
        if (error.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError("already-exists", "Email already in use.");
        }
        throw new functions.https.HttpsError("internal", "Registration failed.");
    }
});

exports.generateMyReferralCode = functions.https.onCall(async (data, context) => {
    // 1. Security: Ensure user is logged in
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in.");
    }

    const { companyId } = data;
    if (!companyId) {
        throw new functions.https.HttpsError("invalid-argument", "Company ID is required.");
    }

    try {
        const companyRef = db.doc(`companies/${companyId}`);
        const companySnap = await companyRef.get();

        if (!companySnap.exists) {
            throw new functions.https.HttpsError("not-found", "Company not found.");
        }

        const companyData = companySnap.data();

        // 2. Prevent overwriting if they already have a code
        if (companyData.ownReferralCode) {
            return { status: "exists", referralCode: companyData.ownReferralCode };
        }

        // 3. Security: Ensure only the Owner can generate it
        if (companyData.ownerUID !== context.auth.uid) {
            throw new functions.https.HttpsError("permission-denied", "Only the owner can generate this code.");
        }

        // --- THE FIX: Fetch the Owner's Name from the users subcollection ---
        const userRef = db.doc(`companies/${companyId}/users/${companyData.ownerUID}`);
        const userSnap = await userRef.get();

        // Default to "USER" just in case the document is missing, but grab the real name if it exists
        const ownerName = userSnap.exists ? userSnap.data().name : "USER";
        // ------------------------------------------------------------------

        // 4. Generate the code using the OWNER'S name, not the company name
        const ownReferralCode = await generateUniqueReferralCode(
            ownerName,
            companyData.ownerPhoneNumber
        );

        // 5. Save to the database via Batch
        const newReferralRef = db.doc(`referrals/${ownReferralCode}`);
        const batch = db.batch();

        // Update the legacy company document
        batch.update(companyRef, { ownReferralCode: ownReferralCode });

        // Create the global referral document
        batch.set(newReferralRef, {
            ownerId: companyId,
            type: "company",
            usageCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();

        return { status: "success", referralCode: ownReferralCode };

    } catch (error) {
        console.error("Error generating referral code:", error);
        throw new functions.https.HttpsError("internal", "Could not generate code.");
    }
});
// --- Helper function to generate the permanent code ---
async function generateUniqueReferralCode(name, phoneNumber) {
    // Clean inputs: Remove spaces/special characters
    const cleanName = (name || "USER").replace(/[^a-zA-Z]/g, '').toUpperCase();
    const cleanPhone = (phoneNumber || "0000").replace(/\D/g, '');

    // Primary Logic: First 4 of Name (padded with X) + Last 4 of Phone
    const prefix = cleanName.padEnd(4, 'X').substring(0, 4);
    const suffixPrimary = cleanPhone.slice(-4).padStart(4, '0');

    let code = `${prefix}${suffixPrimary}`;
    let docRef = db.doc(`referrals/${code}`);
    let docSnap = await docRef.get();

    // If it's unique, return it immediately
    if (!docSnap.exists) return code;

    // Fallback Logic: First 4 of Name + First 4 of Phone
    const suffixSecondary = cleanPhone.substring(0, 4).padEnd(4, '0');
    code = `${prefix}${suffixSecondary}`;
    docRef = db.doc(`referrals/${code}`);
    docSnap = await docRef.get();

    if (!docSnap.exists) return code;

    // Ultimate Edge Case: Append random numbers if both are taken
    return `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
}

exports.registerCompanyAndUser = functions.https.onCall(async (data, context) => {
    // 1. Destructure incoming data (Notice we expect referralCode as a string now)
    const {
        email, password, name, phoneNumber, role,
        businessData,
        planDetails,
        salesSettings,
        catalogueSalesSettings,
        referralCode // <--- Catching the string code here
    } = data;

    // 2. Basic Validation
    if (!email || !password || password.length < 6 || !name || !role) {
        throw new functions.https.HttpsError(
            "invalid-argument", "Email, full name, role, and a password of at least 6 characters are required."
        );
    }

    try {
        // ========================================================
        // 🚨 SECURE REFERRAL CODE LOOKUP (Runs as Admin!)
        // ========================================================
        let referralDetails = null;

        if (referralCode) {
            const cleanCode = referralCode.trim().toUpperCase();

            // Check Agents collection first
            const agentQuery = await db.collection('agents').where('ownReferralCode', '==', cleanCode).get();

            if (!agentQuery.empty) {
                referralDetails = {
                    referrerId: agentQuery.docs[0].id,
                    code: cleanCode,
                    type: 'agent'
                };
            } else {
                // Check Companies collection next
                const compQuery = await db.collection('companies').where('ownReferralCode', '==', cleanCode).get();

                if (!compQuery.empty) {
                    referralDetails = {
                        referrerId: compQuery.docs[0].id,
                        code: cleanCode,
                        type: 'company'
                    };
                } else {
                    // Code is fake/invalid! Throw an error to stop registration
                    throw new functions.https.HttpsError("invalid-argument", "The referral code you entered is invalid.");
                }
            }
        }
        // ========================================================

        // 3. Generate Company ID 
        const counterRef = db.doc("CompanyID/counter");
        const newNumber = await db.runTransaction(async (t) => {
            const counterDoc = await t.get(counterRef);
            let nextNumber = 1001;
            if (counterDoc.exists) {
                const current = counterDoc.data()?.currentNumber || 1000;
                nextNumber = current + 1;
            }
            t.set(counterRef, { currentNumber: nextNumber }, { merge: true });
            return nextNumber;
        });

        const paddedNumber = String(newNumber).padStart(4, "0");
        const newCompanyId = `CMP-${paddedNumber}`;

        // 4. Create Authentication User
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name,
        });

        // 5. Set Custom Claims 
        await admin.auth().setCustomUserClaims(userRecord.uid, {
            companyId: newCompanyId,
            role: role,
        });

        // 6. Define Firestore Document References
        const companyRootRef = db.doc(`companies/${newCompanyId}`);
        const userDocRef = db.doc(`companies/${newCompanyId}/users/${userRecord.uid}`);
        const businessInfoRef = db.doc(`companies/${newCompanyId}/business_info/${newCompanyId}`);
        const salesSettingsRef = db.doc(`companies/${newCompanyId}/settings/sales-settings`);
        const catalogueSettingsRef = db.doc(`companies/${newCompanyId}/settings/catalogue-sales-settings`);

        // 7. Prepare Data Payloads
        const trialDate = new Date();
        trialDate.setDate(trialDate.getDate() + 7);
        trialDate.setUTCHours(18, 29, 59, 999);

        // A. Root Data (Saving the looked-up referral details here)
        const companyRootData = {
            name: businessData.businessName || name,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            ownerUID: userRecord.uid,
            ownerPhoneNumber: phoneNumber || '',
            pack: "enterprise",
            validity: "active",
            expiryDate: admin.firestore.Timestamp.fromDate(trialDate),
            isTrial: true,
            referralDetails: referralDetails // <--- Saved safely!
        };

        // B. Business Info Data 
        const finalBusinessData = {
            ...businessData,
            companyId: newCompanyId,
            ownerUID: userRecord.uid,
            phoneNumber: phoneNumber || "",
            email: email || "",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const defaultSalesSettings = {
            settingType: 'sales',
            enableRounding: true,
            roundingInterval: 1,
            taxType: 'exclusive',
            enableItemWiseDiscount: true,
            allowDueBilling: true,
            requireCustomerName: false,
            requireCustomerMobile: false,
            salesViewType: 'list',
        };

        const defaultCatalogueSettings = {
            settingType: 'catalogueSales',
            allowNegativeInventory: true,
            enableOutOfStockNotification: false,
            priceDisplayMode: 'both',
            showDiscountBadge: true,
            defaultCartQuantity: 1,
            allowQuantityDecreaseToZero: false,
            enableLeadPopup: false,
            minimumOrderValue: 0,
            voucherPrefix: 'ORD-',
            currentVoucherNumber: 1,
            copyVoucherAfterSaving: false,
            gstScheme: 'none',
            taxType: 'inclusive',
            lockTaxToggle: false,
            enableRounding: true,
            roundingInterval: 1,
            enforceExactMRP: false,
            hidePrice: false,
            cartInsertionOrder: 'top',
            requireApproval: false,
            enableItemWiseDiscount: false,
            hideOutOfStock: false
        };

        const finalSalesSettings = {
            ...defaultSalesSettings,
            ...(salesSettings || {}),
            companyId: newCompanyId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const finalCatalogueSettings = {
            ...defaultCatalogueSettings,
            ...(catalogueSalesSettings || {}),
            companyId: newCompanyId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const userProfile = {
            name: name,
            phoneNumber: phoneNumber || '',
            email: email,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            role: role,
            companyId: newCompanyId,
        };

        // 8. Execute Atomic Batch Write
        const batch = db.batch();
        batch.set(companyRootRef, companyRootData);
        batch.set(userDocRef, userProfile);
        batch.set(businessInfoRef, finalBusinessData);
        batch.set(salesSettingsRef, finalSalesSettings);
        batch.set(catalogueSettingsRef, finalCatalogueSettings);

        await batch.commit();

        return { status: "success", userId: userRecord.uid, companyId: newCompanyId };

    } catch (error) {
        console.error("Error in registerCompanyAndUser:", error);

        // Pass the invalid code error back to the frontend cleanly
        if (error.message === "The referral code you entered is invalid.") {
            throw new functions.https.HttpsError("invalid-argument", error.message);
        }

        if (error.code === 'auth/email-already-exists' || error.code === 'auth/email-already-in-use') {
            throw new functions.https.HttpsError("already-exists", "This email is already registered.");
        }
        throw new functions.https.HttpsError("internal", "Registration failed.");
    }
});
exports.inviteUserToCompany = functions.https.onCall(async (data, context) => {
    // (Keep existing invite logic same as before)
    if (!context.auth || !context.auth.token.companyId) {
        throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const { email, password, fullName, phoneNumber, role } = data;
    const companyId = context.auth.token.companyId;

    if (!email || !password || !fullName || !role) {
        throw new functions.https.HttpsError("invalid-argument", "Missing fields.");
    }

    try {
        const userRecord = await admin.auth().createUser({ email, password, displayName: fullName });
        await admin.auth().setCustomUserClaims(userRecord.uid, { companyId, role });

        const userDocRef = db.doc(`companies/${companyId}/users/${userRecord.uid}`);
        await userDocRef.set({
            name: fullName, phoneNumber: phoneNumber || '', email, role,
            createdAt: admin.firestore.FieldValue.serverTimestamp(), companyId
        });

        return { status: "success", userId: userRecord.uid };
    } catch (error) {
        throw new functions.https.HttpsError("internal", error.message);
    }
});