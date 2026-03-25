import React, { useEffect, useState, useMemo, type ReactNode } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/Firebase';
import { AuthContext, DatabaseContext } from './auth-context';
import { Permissions, PLANS } from '../enums';
import type { User } from '../Role/permission';
import Loading from '../Pages/Loading/Loading';
import { getFirestoreOperations } from '../lib/ItemsFirebase';
import { getPackPermissions, normalizePlan } from './Plan';
import { getDefaultPermissions } from '../Pages/Settings/Permissionsetting';
import { getDefaultItemSettings } from '../Pages/Settings/ItemSetting';
import { getDefaultPurchaseSettings } from '../Pages/Settings/Purchasesetting';
import { getDefaultSalesSettings } from '../Pages/Settings/SalesSetting';

interface AuthState {
  status: 'pending' | 'authenticated' | 'unauthenticated';
  user: User | null;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({ status: 'pending', user: null });
  const [dbOperations, setDbOperations] = useState<any>(null);

  // --- INITIALIZE DEFAULTS ---
  const initializeDefaults = async (companyId: string) => {
    try {
      const settingsToCreate = [
        { id: 'sales-settings', generator: getDefaultSalesSettings },
        { id: 'purchase-settings', generator: getDefaultPurchaseSettings },
        { id: 'item-settings', generator: getDefaultItemSettings }
      ];

      for (const setting of settingsToCreate) {
        const docRef = doc(db, 'companies', companyId, 'settings', setting.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          console.log(`⚙️ Creating missing default setting: ${setting.id}`);
          await setDoc(docRef, setting.generator(companyId));
        }
      }
    } catch (err) {
      console.error("Setup Error:", err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      try {
        if (!firebaseUser) {
          setAuthState({ status: 'unauthenticated', user: null });
          return;
        }

        const idTokenResult = await firebaseUser.getIdTokenResult(true);
        const companyId = idTokenResult.claims.companyId as string | undefined;

        if (!companyId) {
          console.error("AUTH_ERROR: companyId missing from token claims.");
          setAuthState({ status: 'unauthenticated', user: null });
          return;
        }

        // Initialize missing settings silently
        await initializeDefaults(companyId);

        // Fetch user and company data
        const companyDocRef = doc(db, 'companies', companyId);
        const userDocRef = doc(db, 'companies', companyId, 'users', firebaseUser.uid);

        const [companyDoc, userDoc] = await Promise.all([
          getDoc(companyDocRef),
          getDoc(userDocRef)
        ]);

        if (!companyDoc.exists() || !userDoc.exists()) {
          console.error("AUTH_ERROR: Company or User document missing.");
          setAuthState({ status: 'unauthenticated', user: null });
          return;
        }

        const cData = companyDoc.data();
        const uData = userDoc.data();

        // --- 1. RESOLVE PLAN (TypeScript Safe) ---
        const rawPackFromDB = String(cData.pack || "").toLowerCase().trim();
        let resolvedPlan: PLANS = PLANS.POS_BASIC; // Default fallback

        if (rawPackFromDB === 'enterprise') {
          resolvedPlan = PLANS.ENTERPRISE;
        } else if (rawPackFromDB.includes('pro')) {
          resolvedPlan = PLANS.POS_PRO;
        } else {
          // Cast the result to the PLANS enum type to satisfy TypeScript
          resolvedPlan = normalizePlan(cData.pack) as PLANS;
        }

        // --- 2. RESOLVE PERMISSIONS (Crash-Proof) ---
        let rolePermissions: Permissions[] = [];

        if (uData.role) {
          const permDocRef = doc(db, 'companies', companyId, 'permissions', uData.role);
          const permSnap = await getDoc(permDocRef);

          if (permSnap.exists()) {
            const docData = permSnap.data();
            let customPerms = docData.allowedPermissions;

            // FIX: Handle Stringified Arrays (Matches your Settings page logic)
            if (typeof customPerms === 'string') {
              try {
                customPerms = JSON.parse(customPerms);
              } catch (e) {
                console.error("Failed to parse permissions string:", e);
                customPerms = [];
              }
            }

            // Ensure we actually have an array to work with
            if (Array.isArray(customPerms) && customPerms.length > 0) {
              rolePermissions = customPerms;
            } else {
              const defaultPerms = getDefaultPermissions(uData.role);
              rolePermissions = Array.isArray(defaultPerms) ? defaultPerms : [];
            }
          } else {
            // Document doesn't exist yet
            const defaultPerms = getDefaultPermissions(uData.role);
            rolePermissions = Array.isArray(defaultPerms) ? defaultPerms : [];
          }
        }

        // Filter role permissions against what the Subscription Plan actually allows
        const packAllowed = getPackPermissions(resolvedPlan) || [];
        const finalPermissions = rolePermissions.filter(p => packAllowed.includes(p));

        // --- 3. RESOLVE SUBSCRIPTION VALIDITY ---
        const rawExpiry = cData.expiryDate;
        const expiryDate = rawExpiry?.toDate ? rawExpiry.toDate() : new Date(rawExpiry);
        const isSubscriptionActive = cData.validity === 'active' && expiryDate > new Date();

        // --- 4. ASSEMBLE USER OBJECT ---
        const userData: User = {
          uid: firebaseUser.uid,
          name: uData.name || 'Anonymous',
          role: uData.role || 'Salesman',
          companyId: companyId,
          plan: resolvedPlan,
          isFirstLogin: uData.isFirstLogin === true,
          permissions: finalPermissions, // ONLY the allowed permissions are passed down!
          Subscription: {
            pack: String(resolvedPlan),
            isActive: isSubscriptionActive,
            expiryDate: expiryDate
          }
        };

        setDbOperations(getFirestoreOperations(companyId));
        setAuthState({ status: 'authenticated', user: userData });

      } catch (error) {
        console.error("AUTH_CRASH:", error);
        setAuthState({ status: 'unauthenticated', user: null });
      }
    });

    return () => unsubscribe();
  }, []);

  const authValue = useMemo(() => ({
    currentUser: authState.user,
    loading: authState.status === 'pending',
    // Strictly checks if the exact permission string exists in the user's array
    hasPermission: (perm: Permissions) => {
      if (!authState.user || !Array.isArray(authState.user.permissions)) return false;
      return authState.user.permissions.includes(perm);
    }
  }), [authState]);

  if (authState.status === 'pending') return <Loading />;

  return (
    <AuthContext.Provider value={authValue}>
      <DatabaseContext.Provider value={dbOperations}>
        {children}
      </DatabaseContext.Provider>
    </AuthContext.Provider>
  );
};