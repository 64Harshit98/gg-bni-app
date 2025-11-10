import React, { useEffect, useState, useMemo, type ReactNode } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/Firebase';
import { AuthContext, DatabaseContext } from './auth-context';
// Import ROLES from your enums
import { Permissions, ROLES } from '../enums'; 
import type { User } from '../Role/permission';
import Loading from '../Pages/Loading/Loading';
import { getFirestoreOperations } from '../lib/ItemsFirebase'; // Corrected path

interface AuthState {
  status: 'pending' | 'authenticated' | 'unauthenticated';
  user: User | null;
}

type DbOperationsType = ReturnType<typeof getFirestoreOperations> | null;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    status: 'pending',
    user: null,
  });
  const [dbOperations, setDbOperations] = useState<DbOperationsType>(null);

  useEffect(() => {
    // Listen for changes in Firebase auth state
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      try {
        if (firebaseUser) {
          // --- Multi-Tenant Authentication Flow ---

          // 1. Get the user's ID token to read their custom claims
          const idTokenResult = await firebaseUser.getIdTokenResult();
          const companyId = idTokenResult.claims.companyId as string | undefined;

          // 2. Check if the user has a companyId claim.
          if (!companyId) {
            console.error("Auth Error: User is authenticated but has no companyId claim.");
            setAuthState({ status: 'unauthenticated', user: null });
            setDbOperations(null);
            return; // Stop execution
          }

          // 3. Now that you have the companyId, build the CORRECT path to the user's profile
          const userDocRef = doc(db, 'companies', companyId, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const docData = userDoc.data();
            let permissions: Permissions[] = [];

            // --- THIS IS THE FIX ---
            // 4. Fetch role-based permissions from the CORRECT multi-tenant path
            if (docData.role) {
              // Use the new, secure path: companies/{companyId}/permissions/{role}
              const permissionDocRef = doc(db, 'companies', companyId, 'permissions', docData.role);
              const permissionDoc = await getDoc(permissionDocRef);
              
              if (permissionDoc.exists()) {
                permissions = permissionDoc.data().allowedPermissions || [];
              } else {
                console.warn(`No permission document found for role "${docData.role}" in company "${companyId}"`);
              }
            }
            // --- END OF FIX ---

            // 5. Construct the complete user object
            const userData: User = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || docData.name || 'Anonymous',
              role: docData.role,
              permissions: permissions, // Permissions are now correctly loaded
              companyId: companyId, // Use the trusted companyId from the token
            };
            
            // 6. Set state to authenticated
            setDbOperations(getFirestoreOperations(userData.companyId));
            setAuthState({ status: 'authenticated', user: userData });

          } else {
            console.error("User document not found at path:", userDocRef.path);
            setAuthState({ status: 'unauthenticated', user: null });
            setDbOperations(null);
          }
        } else {
          // No user is logged in
          setAuthState({ status: 'unauthenticated', user: null });
          setDbOperations(null);
        }
      } catch (error) {
        console.error("Error during authentication check:", error);
        setAuthState({ status: 'unauthenticated', user: null });
        setDbOperations(null);
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []); // Empty dependency array ensures this runs once on mount

  // Memoize the context value to prevent unnecessary re-renders
  const authValue = useMemo(() => ({
    currentUser: authState.user,
    loading: authState.status === 'pending',
    
    // --- FIX: Add special check for 'OWNER' role ---
    hasPermission: (permission: Permissions) => {
        // 1. If user is an Owner, they always have permission
        if (authState.user?.role === ROLES.OWNER) {
            return true;
        }
        // 2. Otherwise, check their permissions list
        return authState.user?.permissions?.includes(permission) ?? false;
    }
    // --- END OF FIX ---
    
  }), [authState]);

  // Show a loading screen while authentication is pending
  if (authState.status === 'pending') {
    return <Loading />;
  }

  // Provide the auth and database contexts to the rest of the app
  return (
    <AuthContext.Provider value={authValue}>
      <DatabaseContext.Provider value={dbOperations}>
        {children}
      </DatabaseContext.Provider>
    </AuthContext.Provider>
  );
};