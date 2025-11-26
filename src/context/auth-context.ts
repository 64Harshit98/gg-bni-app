import { createContext, useContext } from 'react';
import type { User } from '../Role/permission';
import { Permissions } from '../enums';
import { getFirestoreOperations } from '../lib/ItemsFirebase'; // Corrected path

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

// This automatically gets the correct type for our operations object
type DbOperationsType = ReturnType<typeof getFirestoreOperations> | null;

export const DatabaseContext = createContext<DbOperationsType>(null);

/**
 * Custom hook to access the company-scoped database operations.
 * Must be used within a component wrapped by AuthProvider.
 */
export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  // Note: It's okay for this to be null while auth is loading
  // Components using it must check if it's null, as they already do.
  return context;
};