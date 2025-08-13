import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';

// Define the shape of your AuthContext
export interface AuthContextType {
  currentUser: User | null;
  loading: boolean; // To indicate if auth state is still loading
}

// Create the context
export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

// Custom hook to use the AuthContext
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
