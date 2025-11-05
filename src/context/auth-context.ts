import { createContext, useContext } from 'react';
import type { User } from '../Role/permission';
import { Permissions } from '../enums';

// Define the shape of your AuthContext
export interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  hasPermission: (permission: Permissions) => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);


export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

import { getFirestoreOperations } from '../lib/ItemsFirebase';

// This automatically gets the correct type for our operations object
type DbOperationsType = ReturnType<typeof getFirestoreOperations> | null;

export const DatabaseContext = createContext<DbOperationsType>(null);

/**
 * Custom hook to access the company-scoped database operations.
 * Must be used within a component wrapped by AuthProvider.
 */
export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within an AuthProvider');
  }
  return context;
};