import React, { type ReactNode } from 'react';
import { AuthContext, type AuthContextType } from './auth-context';

// The public storefront on a merchant subdomain (<sub>.sellar.in) is always
// an anonymous visitor: Firebase Auth state is stored per-origin, and the
// subdomain storefront has no login route, so a signed-in session can never
// exist on that origin. Supplying a fixed anonymous context (instead of the
// full AuthProvider) keeps the auth handshake, IndexedDB persistence and the
// company/permission Firestore reads off the storefront's critical path,
// while components that call useAuth() (e.g. StorePage) keep working.
const ANONYMOUS_AUTH: AuthContextType = {
  currentUser: null,
  loading: false,
  hasPermission: () => false,
  hasCataloguePermission: () => false,
};

export const StorefrontAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => (
  <AuthContext.Provider value={ANONYMOUS_AUTH}>{children}</AuthContext.Provider>
);

export default StorefrontAuthProvider;
