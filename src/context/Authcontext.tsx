import React, { useEffect, useState, useMemo, type ReactNode } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../lib/Firebase';
import { AuthContext, DatabaseContext } from './auth-context';
import { Permissions, PLANS } from '../enums';
import type { User } from '../Role/permission';
import Loading from '../Pages/Loading/Loading';
import { getFirestoreOperations } from '../lib/ItemsFirebase';
import { getDefaultPermissions } from '../Pages/Settings/Permissionsetting';
import { getPackPermissions } from '../context/Plan';

interface AuthState {
  status: 'pending' | 'authenticated' | 'unauthenticated';
  user: User | null;
}

const TRIAL_DURATION_DAYS = 28;
const TRIAL_PLAN = PLANS.PRO;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({ status: 'pending', user: null });
  const [dbOperations, setDbOperations] = useState<any>(null);

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

          // ---------------------------------------------------------
          // 1. FETCH COMPANY & CHECK SUBSCRIPTION
          // ---------------------------------------------------------
          const companyDocRef = doc(db, 'companies', companyId);
          const companyDoc = await getDoc(companyDocRef);

          let currentPack = PLANS.BASIC;
          let isSubscriptionActive = false;
          let expiryDate: Date | undefined = undefined;

          if (companyDoc.exists()) {
            const cData = companyDoc.data();
            const pack = cData.pack;

            if (cData.expiryDate) {
              expiryDate = cData.expiryDate instanceof Timestamp
                ? cData.expiryDate.toDate()
                : new Date(cData.expiryDate);
            }

            const now = new Date();

            // === [LOGIC 1] AUTO-TRIAL FOR NEW USERS ===
            if (!expiryDate) {
              console.log("First Login detected: Starting Auto-Trial.");
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
              // === [LOGIC 2] EXISTING USER CHECK ===
              const validityStatus = cData.validity || 'inactive';

              if (validityStatus === 'active' && expiryDate > now) {
                // Plan is VALID
                currentPack = pack ;
                isSubscriptionActive = true;
              } else {
                // Plan is EXPIRED
                console.warn("Subscription expired.");

                // [CRITICAL CHANGE]
                // Do NOT downgrade to BASIC. Keep the expired pack name.
                // This allows the UI to say "Your PRO plan has expired".
                currentPack = pack;

                // Ensure this is FALSE. This triggers the redirect.
                isSubscriptionActive = false;
              }
            }
          }

          // ---------------------------------------------------------
          // 2. FETCH USER PERMISSIONS
          // ---------------------------------------------------------
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

            // ---------------------------------------------------------
            // 3. APPLY RESTRICTIONS
            // ---------------------------------------------------------
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
                isActive: isSubscriptionActive, // <--- This determines the Redirect
                expiryDate: expiryDate ?? undefined
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