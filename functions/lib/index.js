const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * -----------------------------------------------------------------
 * FUNCTION: REGISTER COMPANY AND USER
 * Saves: 
 * 1. Plan -> Root (companies/{id})
 * 2. Settings -> Subcollection (companies/{id}/settings/sales-settings)
 * 3. Info -> Subcollection (companies/{id}/business_info/{id})
 * -----------------------------------------------------------------
 */
exports.registerCompanyAndUser = functions.https.onCall(async (data, context) => {
    // 1. Destructure all incoming data
    const { 
        email, password, name, phoneNumber, role, 
        businessData, 
        planDetails, 
        salesSettings // <--- New parameter
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
        
        // NEW: Reference for Sales Settings
        const salesSettingsRef = db.doc(`companies/${newCompanyId}/settings/sales-settings`);

        // 7. Prepare Data Payloads

        // A. Root Data (Plan & Validity)
        const companyRootData = {
            name: businessData.businessName || name,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            ownerUID: userRecord.uid,
            ownerPhoneNumber: phoneNumber || '',
            
            // Plan Info
            pack: planDetails?.pack || "pro",
            validity: planDetails?.validity || "active",
            expiryDate: planDetails?.expiryDate 
                ? admin.firestore.Timestamp.fromDate(new Date(planDetails.expiryDate)) 
                : null,
            isTrial: !!planDetails?.isTrial
        };

        // B. Sales Settings Data (Clean & Defaulted)
        const finalSalesSettings = {
            ...salesSettings,
            companyId: newCompanyId,
            settingType: 'sales', // Important for filtering later
            // Defaults
            enableRounding: salesSettings?.enableRounding ?? true,
            roundingInterval: salesSettings?.roundingInterval ?? 1,
            taxType: salesSettings?.taxType || 'exclusive',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // C. Business Info Data (Name, Address, etc.)
        const finalBusinessData = {
            ...businessData,
            companyId: newCompanyId,
            ownerUID: userRecord.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // D. User Profile Data
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
        batch.set(salesSettingsRef, finalSalesSettings); // <--- Writes the settings

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