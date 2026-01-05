import React, { useEffect, useState, useMemo, type ReactNode } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../lib/Firebase';
import { AuthContext, DatabaseContext } from './auth-context';
import { Permissions, PLANS } from '../enums';
import type { User } from '../Role/permission';
import Loading from '../Pages/Loading/Loading';
import { getFirestoreOperations } from '../lib/ItemsFirebase';
import { getPackPermissions } from './Plan';

// --- Existing Import ---
import { getDefaultPermissions } from '../Pages/Settings/Permissionsetting';

// --- NEW IMPORTS (Ensure these paths match your file structure) ---
import { getDefaultItemSettings } from '../Pages/Settings/ItemSetting';
import { getDefaultPurchaseSettings } from '../Pages/Settings/Purchasesetting';
import { getDefaultSalesSettings } from '../Pages/Settings/SalesSetting';

interface AuthState {
  status: 'pending' | 'authenticated' | 'unauthenticated';
  user: User | null;
}

// CONFIGURATION
const TRIAL_DURATION_DAYS = 28;
const TRIAL_PLAN = PLANS.PRO;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({ status: 'pending', user: null });
  const [dbOperations, setDbOperations] = useState<any>(null);

  // ==========================================
  // HELPER: Initialize Defaults (Run once on login)
  // ==========================================
  const initializeCompanySettings = async (companyId: string) => {
    try {
      // Define the checks to run in parallel
      const checks = [
        {
          id: 'sales-settings',
          generator: getDefaultSalesSettings,
          name: 'Sales'
        },
        {
          id: 'purchase-settings',
          generator: getDefaultPurchaseSettings,
          name: 'Purchase'
        },
        {
          id: 'item-settings',
          generator: getDefaultItemSettings,
          name: 'Item'
        }
        // Note: 'permissions' is handled dynamically in your existing logic below, 
        // but you could add it here if you wanted a static 'permissions-settings' doc.
      ];

      // Run all checks in parallel
      await Promise.all(checks.map(async (check) => {
        const docRef = doc(db, 'companies', companyId, 'settings', check.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          console.log(`⚙️ Creating default ${check.name} settings for ${companyId}...`);
          const defaultData = check.generator(companyId);
          await setDoc(docRef, defaultData);
        }
      }));

    } catch (error) {
      console.error("Error initializing company settings:", error);
      // We don't block login on error, but we log it
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      try {
        if (firebaseUser) {
          const idTokenResult = await firebaseUser.getIdTokenResult(true);
          const companyId = idTokenResult.claims.companyId as string | undefined;

          if (!companyId) {
            setAuthState({ status: 'unauthenticated', user: null });
            return;
          }

          // 0. INITIALIZE SETTINGS (Before loading user app)
          // This ensures settings exist before any page tries to fetch them
          await initializeCompanySettings(companyId);

          // 1. FETCH COMPANY & CHECK SUBSCRIPTION
          const companyDocRef = doc(db, 'companies', companyId);
          const companyDoc = await getDoc(companyDocRef);

          let currentPack = PLANS.BASIC;
          let isSubscriptionActive = false;
          let expiryDate: Date | undefined = undefined;

          if (companyDoc.exists()) {
            const cData = companyDoc.data();
            const pack = cData.pack || PLANS.BASIC;

            // [FIX] Robust Date Parsing
            if (cData.expiryDate) {
              if (typeof cData.expiryDate.toDate === 'function') {
                expiryDate = cData.expiryDate.toDate();
              } else {
                expiryDate = new Date(cData.expiryDate);
              }
            }

            const now = new Date();

            // === SCENARIO A: NEW COMPANY (Start Trial) ===
            if (!expiryDate) {
              console.log("No expiry found. Starting Trial...");

              const trialDate = new Date();
              trialDate.setDate(trialDate.getDate() + TRIAL_DURATION_DAYS);
              trialDate.setHours(23, 59, 59);

              await setDoc(companyDocRef, {
                pack: TRIAL_PLAN,
                validity: 'active',
                expiryDate: Timestamp.fromDate(trialDate),
                isTrial: true
              }, { merge: true });

              currentPack = TRIAL_PLAN;
              isSubscriptionActive = true;
              expiryDate = trialDate;

            } else {
              // === SCENARIO B: EXISTING USER (Check Expiry) ===
              const validityStatus = cData.validity || 'inactive';

              // Ensure expiryDate is valid before comparing
              if (validityStatus === 'active' && expiryDate && expiryDate > now) {
                currentPack = pack;
                isSubscriptionActive = true;
              } else {
                console.warn("Plan Expired. Locking user out.");
                currentPack = pack;
                isSubscriptionActive = false;
              }
            }
          }

          // 2. FETCH USER PERMISSIONS
          const userDocRef = doc(db, 'companies', companyId, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const docData = userDoc.data();
            let rolePermissions: Permissions[] = [];

            if (docData.role) {
              const permissionDocRef = doc(db, 'companies', companyId, 'permissions', docData.role);
              const permissionDoc = await getDoc(permissionDocRef);

              if (permissionDoc.exists()) {
                rolePermissions = permissionDoc.data().allowedPermissions || [];
              } else {
                rolePermissions = getDefaultPermissions(docData.role);
              }
            }

            // 3. APPLY RESTRICTIONS
            const packAllowedPermissions = getPackPermissions(currentPack);
            const finalPermissions = rolePermissions.filter(p =>
              packAllowedPermissions.includes(p)
            );

            const userData: User = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || docData.name || 'Anonymous',
              role: docData.role,
              permissions: finalPermissions,
              companyId: companyId,
              Subscription: {
                pack: currentPack,
                isActive: isSubscriptionActive,
                expiryDate: expiryDate
              }
            };

            setDbOperations(getFirestoreOperations(userData.companyId));
            setAuthState({ status: 'authenticated', user: userData });

          } else {
            setAuthState({ status: 'unauthenticated', user: null });
          }
        } else {
          setAuthState({ status: 'unauthenticated', user: null });
        }
      } catch (error) {
        console.error("Auth Error:", error);
        setAuthState({ status: 'unauthenticated', user: null });
      }
    });

    return () => unsubscribe();
  }, []);

  const authValue = useMemo(() => ({
    currentUser: authState.user,
    loading: authState.status === 'pending',
    hasPermission: (permission: Permissions) => {
      return authState.user?.permissions?.includes(permission) ?? false;
    }
  }), [authState]);

  if (authState.status === 'pending') {
    return <Loading />;
  }

  return (
    <AuthContext.Provider value={authValue}>
      <DatabaseContext.Provider value={dbOperations}>
        {children}
      </DatabaseContext.Provider>
    </AuthContext.Provider>
  );
};