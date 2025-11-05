const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * -----------------------------------------------------------------
 * FUNCTION 1: For NEW COMPANY SIGN-UP
 * (Used by your Signup.tsx page)
 * -----------------------------------------------------------------
 */
exports.registerCompanyAndUser = functions.https.onCall(async (data, context) => {
    const { email, password, name, phoneNumber, role, businessData } = data;

    // 1. Validation
    if (!email || !password || password.length < 6 || !name || !role) {
        throw new functions.https.HttpsError(
            "invalid-argument", "Email, full name, role, and a password of at least 6 characters are required."
        );
    }

    try {
        // 2. Generate New Company ID
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

        // 3. Create Auth User
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name,
        });

        // 4. Set Custom Claim with the NEW companyId
        await admin.auth().setCustomUserClaims(userRecord.uid, {
            companyId: newCompanyId,
            role: role,
        });

        // 5. Create Firestore Docs in the NEW company
        const userDocRef = db.doc(`companies/${newCompanyId}/users/${userRecord.uid}`);
        const businessInfoRef = db.doc(`companies/${newCompanyId}/business_info/${newCompanyId}`);

        const userProfile = {
            name: name,
            phoneNumber: phoneNumber || '',
            email: email,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            role: role,
            companyId: newCompanyId,
        };

        const finalBusinessData = {
            ...businessData,
            companyId: newCompanyId,
            ownerUID: userRecord.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // 6. Batch Write
        const batch = db.batch();
        batch.set(userDocRef, userProfile);
        batch.set(businessInfoRef, finalBusinessData);
        await batch.commit();

        // 7. Return success
        return { status: "success", userId: userRecord.uid, companyId: newCompanyId };

    } catch (error) {
        console.error("Error in registerCompanyAndUser:", error);
        if (error.code === 'auth/email-already-exists' || error.code === 'auth/email-already-in-use') {
            throw new functions.https.HttpsError("already-exists", "This email is already registered.");
        }
        throw new functions.https.HttpsError("internal", "Registration failed.");
    }
});


/**
 * -----------------------------------------------------------------
 * FUNCTION 2: For INVITING A NEW USER
 * (Used by your UserAdd.tsx page)
 * -----------------------------------------------------------------
 */
exports.inviteUserToCompany = functions.https.onCall(async (data, context) => {
    // 1. Check that the CALLER is authenticated and has a company.
    if (!context.auth || !context.auth.token.companyId) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "You must be an authenticated member of a company to add users."
        );
    }

    const { email, password, fullName, phoneNumber, role } = data;
    // --- THIS IS THE KEY ---
    // It gets the EXISTING companyId from the user making the request
    const companyId = context.auth.token.companyId;

    // 2. Validation
    if (!email || !password || password.length < 6 || !fullName || !role) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Email, full name, role, and a password of at least 6 characters are required."
        );
    }

    try {
        // 3. Create the new user in Firebase Auth
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: fullName,
        });

        // 4. Set the new user's Custom Claim to match the CALLER'S company
        await admin.auth().setCustomUserClaims(userRecord.uid, {
            companyId: companyId, // <-- Assigns user to EXISTING company
            role: role,
        });

        // 5. Create the new user's profile in the EXISTING company path
        const userProfile = {
            name: fullName,
            phoneNumber: phoneNumber || '',
            email: email,
            role: role,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            companyId: companyId,
        };

        const userDocRef = db.doc(`companies/${companyId}/users/${userRecord.uid}`);
        await userDocRef.set(userProfile);

        // 6. Return success
        return { status: "success", userId: userRecord.uid };

    } catch (error) {
        console.error("Error inviting user:", error);
        if (error.code === 'auth/email-already-exists' || error.code === 'auth/email-already-in-use') {
            throw new functions.https.HttpsError("already-exists", "This email is already registered.");
        }
        throw new functions.https.HttpsError("internal", "An unknown error occurred.");
    }
});