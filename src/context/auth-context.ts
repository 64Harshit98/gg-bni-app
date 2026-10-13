import { createContext, useContext } from 'react';
import type { User } from '../Role/permission';
import { Permissions } from '../enums';
import { getFirestoreOperations } from '../lib/ItemsFirebase'; // Corrected path
import { Cata_Permissions } from '../Catalogue/enum/cata_permissions.enum';

export type StrictContextUser = Omit<User, 'companyId'> & { companyId: string };

export interface AuthContextType {
  currentUser: StrictContextUser | null;
  loading: boolean;
  hasPermission: (perm: Permissions) => boolean;
  hasCataloguePermission: (perm: Cata_Permissions) => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context as AuthContextType;
};

type DbOperationsType = ReturnType<typeof getFirestoreOperations> | null;

export const DatabaseContext = createContext<DbOperationsType>(null);
export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  return context;
};