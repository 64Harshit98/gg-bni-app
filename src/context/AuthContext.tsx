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
import { migrateCataPermissions, type Cata_Permissions } from '../Catalogue/enum/cata_permissions.enum';
import { getDefaultCataPermissions } from '../Catalogue/Settings/CataloguePermissionSetting';
import { isMerchantSubdomain } from '../lib/subdomain';

const AUTH_RESOLUTION_TIMEOUT_MS = 8000;

interface AuthState {
  status: 'pending' | 'authenticated' | 'unauthenticated';
  user: User | null;
}

// Provisions default Catalogue permission docs for EVERY role, not just
// whichever role happens to be logging in. `ensureCataPermissionsExist`
// below only ever creates a doc for the CURRENT user's own role, so a
// brand-new company only ever got `cata_permissions/Owner` — Manager and
// Salesman stayed missing until a user with that role actually logged in
// (or someone manually visited the Permissions settings page). Called once
// for the Owner's login below, since the Owner is the one who sets up a new
// company and should see all three roles' defaults ready immediately.
export const ensureAllCataPermissionsExist = async (companyId: string): Promise<void> => {
  await Promise.all(
    [ROLES.OWNER, ROLES.MANAGER, ROLES.SALESMAN].map((role) => ensureCataPermissionsExist(companyId, role))
  );
};

export const ensureCataPermissionsExist = async (companyId: string, role: string): Promise<Cata_Permissions[]> => {
  const cataDocRef = doc(db, 'companies', companyId, 'cata_permissions', role);
  const cataSnap = await getDoc(cataDocRef);

  // 1. If it exists, self-heal it: rewrite any renamed permission strings
  // (see migrateCataPermissions) AND auto-merge in any default catalogue
  // permission for this role that isn't saved yet (e.g. a new capability
  // added to the role's defaults after this doc was first created), instead
  // of requiring a manual Reset + Save on the Permission Setting page.
  if (cataSnap.exists()) {
    const { permissions: migrated, changed: renamed } = migrateCataPermissions(cataSnap.data().allowedPermissions);
    const defaults = getDefaultCataPermissions(role);
    const merged = Array.from(new Set([...migrated, ...defaults]));
    const changed = renamed || merged.length !== migrated.length;

    if (changed) {
      try {
        await setDoc(cataDocRef, { allowedPermissions: merged }, { merge: true });
      } catch (err) {
        console.error(`Failed to persist synced catalogue permissions for ${role}`, err);
      }
    }
    return merged;
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

      await Promise.all(settingsToCreate.map(async (setting) => {
        const docRef = doc(db, 'companies', companyId, 'settings', setting.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          console.log(`⚙️ Creating missing default setting: ${setting.id}`);
          await setDoc(docRef, setting.generator(companyId));
        }
      }));
    } catch (err) {
      console.error("Setup Error:", err);
    }
  };

  useEffect(() => {
    // `generation` guards against two overlapping onAuthStateChanged
    // callbacks racing each other (e.g. a stale/slow chain from a previous
    // firing finishing AFTER a newer one already committed a result) — only
    // the most recent callback's commit is allowed to win.
    let generation = 0;

    // Safety net: this ONLY guards against Firebase's own auth handshake
    // (onAuthStateChanged) never firing at all — a rare SDK/network-init
    // issue. It must NOT fire once we already know the real auth state,
    // because that used to force a false "unauthenticated" while the
    // (now much faster, but still async) Firestore lookup below was still
    // in flight — the app would flash logged-out, then the real result
    // would land seconds later and silently flip it back to logged-in.
    // That flip-flop was the "reload logs me out, then logs me back in
    // after ~10s" symptom.
    const startupTimeoutId = setTimeout(() => {
      if (generation === 0) {
        generation = 1;
        console.error('AUTH_TIMEOUT: onAuthStateChanged did not fire in time');
        setAuthState({ status: 'unauthenticated', user: null });
      }
    }, AUTH_RESOLUTION_TIMEOUT_MS);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      clearTimeout(startupTimeoutId);
      const myGeneration = ++generation;
      const commit = (state: AuthState) => {
        // A newer callback has already superseded this one — drop this
        // stale result instead of clobbering the newer (correct) state.
        if (myGeneration !== generation) return;
        setAuthState(state);
      };

      try {
        if (!firebaseUser) {
          commit({ status: 'unauthenticated', user: null });
          return;
        }

        // No forced refresh here: `true` would force a network round-trip to
        // reissue the ID token on every load even when the cached one is
        // still valid, which was the single biggest source of login latency.
        // Firebase already auto-refreshes tokens ~5min before expiry, and
        // custom-claim changes (role/companyId) require the client to call
        // getIdTokenResult(true) explicitly elsewhere after such a change.
        const idTokenResult = await firebaseUser.getIdTokenResult();
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
            corePermissions: [Permissions.ViewPartnerDashboard],
            cataloguePermissions: [],
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

        const companyDocRef = doc(db, 'companies', companyId!);
        const userDocRef = doc(db, 'companies', companyId!, 'users', firebaseUser.uid);

        // initializeDefaults doesn't gate on or feed into the company/user
        // doc reads below, so run it alongside them instead of before them.
        const [, companyDoc, userDoc] = await Promise.all([
          initializeDefaults(companyId!),
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
          // --- FETCH CORE PERMISSIONS + CATALOGUE PERMISSIONS IN PARALLEL ---
          // These two docs are independent, so run them concurrently instead
          // of stacking their round trips one after another.
          const permDocRef = doc(db, 'companies', companyId!, 'permissions', uData.role);
          const [permSnap, cataPerms] = await Promise.all([
            getDoc(permDocRef),
            ensureCataPermissionsExist(companyId!, uData.role),
          ]);

          let dbPerms: Permissions[] = [];

          if (permSnap.exists()) {
            const docData = permSnap.data();
            dbPerms = docData.allowedPermissions || [];

            if (typeof dbPerms === 'string') {
              try { dbPerms = JSON.parse(dbPerms); } catch { dbPerms = []; }
            }
          }

          rolePermissions = await syncCompanyPermissions(companyId!, uData.role, dbPerms, permSnap.exists());
          cataloguePermissions = cataPerms;
        }

        // --- FILTER CORE PERMISSIONS BY PLAN ---
        const packAllowed = getPackPermissions(resolvedPlan) || [];
        const finalCorePermissions = rolePermissions.filter(p => packAllowed.includes(p));
        // Owner is the one who sets up a new company — provision Manager/
        // Salesman defaults too while we're here, instead of leaving them
        // missing until a user with that role logs in for the first time.
        if (uData.role === ROLES.OWNER) {
          ensureAllCataPermissionsExist(companyId!).catch(err =>
            console.error('Failed to provision default catalogue permissions for all roles', err)
          );
        }
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
          corePermissions: finalCorePermissions,
          cataloguePermissions,
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
      clearTimeout(startupTimeoutId);
      unsubscribe();
    };
  }, []);

  // Expose these via your AuthContext
  const authValue = useMemo(() => ({
    // Assert that currentUser is the User type AND has a companyId
    currentUser: authState.user as (User & { companyId: string }) | null,
    hasPermission: (perm: Permissions) => {
      // Checks corePermissions specifically, NOT the merged `permissions`
      // array — Permissions and Cata_Permissions share some string values
      // (e.g. 'ManageItems'), so checking the merged array would let a
      // catalogue-only permission silently satisfy a core POS check.
      return !!authState.user?.corePermissions?.includes(perm);
    },
    hasCataloguePermission: (perm: Cata_Permissions) => {
      return !!authState.user?.cataloguePermissions?.includes(perm);
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