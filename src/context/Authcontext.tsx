import React, { useEffect, useState, useMemo, type ReactNode } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/Firebase';
import { AuthContext, DatabaseContext } from './auth-context';
import { Permissions } from '../enums';
import type { User } from '../Role/permission';
import Loading from '../Pages/Loading/Loading';
import { getFirestoreOperations } from '../lib/ItemsFirebase';

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
            // This user is authenticated but not part of a company.
            // This is an error state in a multi-tenant app.
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

            // 4. Fetch role-based permissions (this path is global and correct)
            let permissions: Permissions[] = [];
            if (docData.role) {
              const permissionDocRef = doc(db, 'permissions', docData.role);
              const permissionDoc = await getDoc(permissionDocRef);
              if (permissionDoc.exists()) {
                permissions = permissionDoc.data().allowedPermissions || [];
              }
            }

            // 5. Construct the complete user object
            const userData: User = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || docData.name || 'Anonymous',
              role: docData.role,
              permissions: permissions,
              companyId: companyId, // Use the trusted companyId from the token
            };

            // 6. Set state to authenticated
            setDbOperations(getFirestoreOperations(userData.companyId));
            setAuthState({ status: 'authenticated', user: userData });

          } else {
            // This error means the user has a claim but no matching Firestore document.
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
        // This will catch Firestore permission errors or other network issues.
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
    hasPermission: (permission: Permissions) => authState.user?.permissions?.includes(permission) ?? false,
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