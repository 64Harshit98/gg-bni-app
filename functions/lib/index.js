const axios = require("axios");
const cors = require("cors")({ origin: true }); // Allows your frontend to talk to this function
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
        const orderRef = db.collection("companies").doc(companyId).collection("Orders").doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) throw new functions.https.HttpsError("not-found", "Order not found");
        const orderData = orderSnap.data();

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

            return {
                ...item,
                sno: index + 1,
                imageBase64: base64Image
            };
        }));

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
exports.registerCompanyAndUser = functions.https.onCall(async (data, context) => {
    // 1. Destructure all incoming data (salesSettings completely removed)
    const {
        email, password, name, phoneNumber, role,
        businessData,
        planDetails
    } = data;

    // 2. Basic Validation
    if (!email || !password || password.length < 6 || !name || !role) {
        throw new functions.https.HttpsError(
            "invalid-argument", "Email, full name, role, and a password of at least 6 characters are required."
        );
    }

    try {
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

        // 7. Prepare Data Payloads
        const trialDate = new Date();
        trialDate.setDate(trialDate.getDate() + 7);
        trialDate.setUTCHours(18, 29, 59, 999); // Exactly 23:59:59 IST

        // A. Root Data (Plan & Validity)
        const companyRootData = {
            name: businessData.businessName || name,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            ownerUID: userRecord.uid,
            ownerPhoneNumber: phoneNumber || '',

            // Plan Info (Forced to 7-Day Trial)
            pack: "enterprise",
            validity: "active",
            expiryDate: admin.firestore.Timestamp.fromDate(trialDate),
            isTrial: true
        };

        // B. Business Info Data (Name, Address, etc.)
        const finalBusinessData = {
            ...businessData,
            companyId: newCompanyId,
            ownerUID: userRecord.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // C. User Profile Data
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

        // Note: salesSettings batch write has been removed!

        await batch.commit();

        return { status: "success", userId: userRecord.uid, companyId: newCompanyId };

    } catch (error) {
        console.error("Error in registerCompanyAndUser:", error);
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