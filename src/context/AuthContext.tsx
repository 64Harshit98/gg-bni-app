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
          setAuthState({ status: 'unauthenticated', user: null });
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
              setAuthState({ status: 'unauthenticated', user: null });
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
          setAuthState({ status: 'authenticated', user: partnerUser });
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
          setAuthState({ status: 'unauthenticated', user: null });
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

        if (uData.role) {
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
        }

        const packAllowed = getPackPermissions(resolvedPlan) || [];
        const finalPermissions = rolePermissions.filter(p => packAllowed.includes(p));

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
          permissions: finalPermissions,
          Subscription: {
            pack: String(resolvedPlan),
            isActive: isSubscriptionActive,
            expiryDate: expiryDate
          }
        };

        setDbOperations(getFirestoreOperations(companyId!));
        setAuthState({ status: 'authenticated', user: userData });

      } catch (error) {
        console.error("AUTH_CRASH:", error);
        setAuthState({ status: 'unauthenticated', user: null });
      }
    });

    return () => unsubscribe();
  }, []);
  const authValue = useMemo(() => ({
    currentUser: authState.user as (User & { companyId: string }) | null,
    loading: authState.status === 'pending',
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