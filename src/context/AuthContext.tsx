import React, { useEffect, useState, useMemo, type ReactNode } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/Firebase';
import { AuthContext, DatabaseContext } from './auth-context';
import { Permissions, PLANS, ROLES } from '../enums';
import type { User } from '../Role/permission';
import Loading from '../Pages/Loading/Loading';
import { getFirestoreOperations } from '../lib/ItemsFirebase';
import { getPackPermissions, normalizePlan } from './Plan';
import { getDefaultItemSettings } from '../Pages/Settings/ItemSetting';
import { getDefaultPurchaseSettings } from '../Pages/Settings/Purchasesetting';
import { getDefaultSalesSettings } from '../Pages/Settings/SalesSetting';
import { getDefaultCatalogueSalesSettings } from '../Catalogue/Settings/CatalogueSalesSetting';
import { syncCompanyPermissions } from '../context/Permissions';
import type { Cata_Permissions } from '../Catalogue/enum/cata_permissions.enum';
import { getDefaultCataPermissions } from '../Catalogue/Settings/CataloguePermissionSetting';
import { isMerchantSubdomain } from '../lib/subdomain';

const AUTH_RESOLUTION_TIMEOUT_MS = 8000;

interface AuthState {
  status: 'pending' | 'authenticated' | 'unauthenticated';
  user: User | null;
}

export const ensureCataPermissionsExist = async (companyId: string, role: string): Promise<Cata_Permissions[]> => {
  const cataDocRef = doc(db, 'companies', companyId, 'cata_permissions', role);
  const cataSnap = await getDoc(cataDocRef);

  // 1. If it exists, return the database values
  if (cataSnap.exists()) {
    return cataSnap.data().allowedPermissions || [];
  }

  // 2. If it DOES NOT exist, generate defaults
  console.log(`[System] Initializing default Catalogue permissions for ${role}`);
  const defaultPerms = getDefaultCataPermissions(role);

  // 3. Save them to Firestore instantly
  try {
    await setDoc(cataDocRef, {
      allowedPermissions: defaultPerms,
      role: role,
      companyId: companyId
    }, { merge: true });

    return defaultPerms;
  } catch (error) {
    console.error("Failed to auto-save default catalogue permissions", error);

    // Return defaults anyway so the user's UI doesn't crash if network fails
    return defaultPerms;
  }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({ status: 'pending', user: null });
  const [dbOperations, setDbOperations] = useState<any>(null);

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
    let settled = false;

    // Safety net: if Firebase's auth handshake (or the Firestore chain below) stalls,
    // don't leave the whole app stuck behind the pending/loading gate forever.
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.error('AUTH_TIMEOUT: onAuthStateChanged did not resolve in time');
        setAuthState({ status: 'unauthenticated', user: null });
      }
    }, AUTH_RESOLUTION_TIMEOUT_MS);

    const commit = (state: AuthState) => {
      settled = true;
      clearTimeout(timeoutId);
      setAuthState(state);
    };

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      try {
        if (!firebaseUser) {
          commit({ status: 'unauthenticated', user: null });
          return;
        }

        const idTokenResult = await firebaseUser.getIdTokenResult(true);
        let companyId = idTokenResult.claims.companyId as string | undefined;
        let userRole = idTokenResult.claims.role as ROLES;

        // 1. Trust the token claims first
        let isPartner = userRole === ROLES.AGENT || userRole === ROLES.AGENCY;
        let agentData: any = null;

        // ========================================================
        // 2. THE MAGIC FIX: Safe Fallback Check
        // ========================================================
        if (!isPartner) {
          try {
            // Check if they are secretly an agent missing custom claims
            const fallbackAgentRef = doc(db, 'agents', firebaseUser.uid);
            const fallbackAgentSnap = await getDoc(fallbackAgentRef);

            if (fallbackAgentSnap.exists()) {
              isPartner = true;
              agentData = fallbackAgentSnap.data();
              userRole = agentData.role || ROLES.AGENT;
            }
          } catch (fallbackError) {
            // 🛑 SILENTLY IGNORE THIS ERROR! 🛑
            // Standard Owners will get "Permission Denied" here because they 
            // aren't allowed to read the agents collection. That is perfectly fine!
            // We swallow the error so they can continue to the logic below.
          }
        }

        // 3. Safely reject users with no clear home
        if (!companyId && !isPartner) {
          console.error("AUTH_ERROR: User lacks companyId and is not marked as a partner.");
          commit({ status: 'unauthenticated', user: null });
          return;
        }

        // ========================================================
        // 4. PARTNER LOGIN FLOW
        // ========================================================
        if (isPartner) {
          // If the fallback didn't grab the data, fetch it now to get their Name
          if (!agentData) {
            const agentDocRef = doc(db, 'agents', firebaseUser.uid);
            const agentSnap = await getDoc(agentDocRef);
            if (agentSnap.exists()) {
              agentData = agentSnap.data();
            } else {
              console.error("AUTH_ERROR: Partner document missing from database.");
              commit({ status: 'unauthenticated', user: null });
              return;
            }
          }

          const partnerUser: User = {
            uid: firebaseUser.uid,
            name: agentData.name || firebaseUser.displayName || 'Partner',
            role: userRole,
            // FIX: Give them a TRUTHY string so your layout wrappers don't crash!
            companyId: "PARTNER_ACCOUNT",
            plan: PLANS.POS_BASIC,
            isFirstLogin: false,
            permissions: [Permissions.ViewPartnerDashboard],
            Subscription: {
              pack: 'Partner',
              isActive: true,
              expiryDate: new Date('2099-01-01')
            }
          };

          setDbOperations(null);
          commit({ status: 'authenticated', user: partnerUser });
          return;
        }

        // ========================================================
        // 5. EXISTING COMPANY LOGIC (Owners & Staff)
        // ========================================================

        await initializeDefaults(companyId!);

        const companyDocRef = doc(db, 'companies', companyId!);
        const userDocRef = doc(db, 'companies', companyId!, 'users', firebaseUser.uid);

        const [companyDoc, userDoc] = await Promise.all([
          getDoc(companyDocRef),
          getDoc(userDocRef)
        ]);

        if (!companyDoc.exists() || !userDoc.exists()) {
          console.error("AUTH_ERROR: Company or User document missing.");
          commit({ status: 'unauthenticated', user: null });
          return;
        }

        const cData = companyDoc.data();
        const uData = userDoc.data();

        // --- RESOLVE PLAN ---
        const rawPackFromDB = String(cData.pack || "").toLowerCase().trim();
        let resolvedPlan: PLANS = PLANS.POS_BASIC;

        if (rawPackFromDB === 'enterprise') {
          resolvedPlan = PLANS.ENTERPRISE;
        } else {
          resolvedPlan = normalizePlan(cData.pack) as PLANS;
        }

        // --- RESOLVE PERMISSIONS ---
        let rolePermissions: Permissions[] = [];
        let cataloguePermissions: Cata_Permissions[] = []; // 👈 1. Create a variable for catalogue perms

        if (uData.role) {
          // --- FETCH CORE PERMISSIONS ---
          const permDocRef = doc(db, 'companies', companyId!, 'permissions', uData.role);
          const permSnap = await getDoc(permDocRef);

          let dbPerms: Permissions[] = [];

          if (permSnap.exists()) {
            const docData = permSnap.data();
            dbPerms = docData.allowedPermissions || [];

            if (typeof dbPerms === 'string') {
              try { dbPerms = JSON.parse(dbPerms); } catch { dbPerms = []; }
            }
          }

          rolePermissions = await syncCompanyPermissions(companyId!, uData.role, dbPerms);

          // --- FETCH CATALOGUE PERMISSIONS (THIS WAS MISSING) ---
          const cataDocRef = doc(db, 'companies', companyId!, 'cata_permissions', uData.role);
          const cataSnap = await getDoc(cataDocRef);

          if (cataSnap.exists()) {
            cataloguePermissions = cataSnap.data().allowedPermissions || [];
          }
        }

        // --- FILTER CORE PERMISSIONS BY PLAN ---
        const packAllowed = getPackPermissions(resolvedPlan) || [];
        const finalCorePermissions = rolePermissions.filter(p => packAllowed.includes(p));
        cataloguePermissions = await ensureCataPermissionsExist(companyId!, uData.role);
        // --- MERGE BOTH SETS OF PERMISSIONS ---
        const finalPermissions = [...finalCorePermissions, ...cataloguePermissions] as any[];

        const rawExpiry = cData.expiryDate;
        const expiryDate = rawExpiry?.toDate ? rawExpiry.toDate() : new Date(rawExpiry);
        const isSubscriptionActive = cData.validity === 'active' && expiryDate > new Date();

        // --- ASSEMBLE USER OBJECT ---
        const userData: User = {
          uid: firebaseUser.uid,
          name: uData.name || 'Anonymous',
          role: uData.role || 'Salesman',
          companyId: companyId!,
          plan: resolvedPlan,
          isFirstLogin: uData.isFirstLogin === true,
          permissions: finalPermissions, // 👈 2. Now includes Catalogue Permissions!
          Subscription: {
            pack: String(resolvedPlan),
            isActive: isSubscriptionActive,
            expiryDate: expiryDate
          }
        };

        setDbOperations(getFirestoreOperations(companyId!));
        commit({ status: 'authenticated', user: userData });

      } catch (error) {
        console.error("AUTH_CRASH:", error);
        commit({ status: 'unauthenticated', user: null });
      }
    });

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  // Expose these via your AuthContext
  const authValue = useMemo(() => ({
    // Assert that currentUser is the User type AND has a companyId
    currentUser: authState.user as (User & { companyId: string }) | null,
    hasPermission: (perm: Permissions) => {
      // Ensure you return a boolean, not boolean | undefined
      return !!authState.user?.permissions.includes(perm);
    },
    hasCataloguePermission: (perm: Cata_Permissions) => {
      return !!authState.user?.permissions.includes(perm);
    },
    loading: authState.status === 'pending',
  }), [authState]);

  // The public catalog/checkout routes don't need Firebase auth to render.
  // Never block them behind auth resolution -- currentUser will simply
  // update in the background once/if it resolves.
  if (authState.status === 'pending' && !isMerchantSubdomain()) return <Loading />;

  return (
    <AuthContext.Provider value={authValue}>
      <DatabaseContext.Provider value={dbOperations}>
        {children}
      </DatabaseContext.Provider>
    </AuthContext.Provider>
  );
};