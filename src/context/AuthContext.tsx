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
import { getDefaultItemSettings } from '../Pages/Settings/ItemSetting';
import { getDefaultPurchaseSettings } from '../Pages/Settings/Purchasesetting';
import { getDefaultSalesSettings } from '../Pages/Settings/SalesSetting';
import { getDefaultCatalogueSalesSettings } from '../Catalogue/Settings/CatalogueSalesSetting';
import { syncCompanyPermissions } from '../context/Permissions';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import { setUser, clearUser, setPending, toSerializableUser } from '../store/authSlice';

interface AuthState {
  status: 'pending' | 'authenticated' | 'unauthenticated';
  user: User | null;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({ status: 'pending', user: null });
  const [dbOperations, setDbOperations] = useState<any>(null);
  const dispatch = useDispatch<AppDispatch>();

  // --- INITIALIZE DEFAULTS ---
  const initializeDefaults = async (companyId: string) => {
    try {
      const settingsToCreate = [
        { id: 'sales-settings', generator: getDefaultSalesSettings },
        { id: 'purchase-settings', generator: getDefaultPurchaseSettings },
        { id: 'item-settings', generator: getDefaultItemSettings },
        { id: 'catalogue-sales-settings', generator: getDefaultCatalogueSalesSettings }
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
          dispatch(clearUser());
          return;
        }

        dispatch(setPending());

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

          let dbPerms: Permissions[] = [];

          if (permSnap.exists()) {
            const docData = permSnap.data();
            dbPerms = docData.allowedPermissions || [];

            if (typeof dbPerms === 'string') {
              try { dbPerms = JSON.parse(dbPerms); } catch { dbPerms = []; }
            }
          }

          // --- NEW: AUTO-SYNC LOGIC ---
          // This runs every time a user logs in. 
          // It compares code-defaults with db-perms and updates DB if needed.
          rolePermissions = await syncCompanyPermissions(companyId, uData.role, dbPerms);
          // ----------------------------
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
        dispatch(setUser(toSerializableUser(userData)));

      } catch (error) {
        console.error("AUTH_CRASH:", error);
        setAuthState({ status: 'unauthenticated', user: null });
        dispatch(clearUser());
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