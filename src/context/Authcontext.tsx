import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { auth } from '../lib/firebase';
// Import the context and hook from the new file
import { AuthContext } from './auth-context.ts';

// AuthProvider component to wrap your application
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Initially true

  useEffect(() => {
    // Firebase listener for auth state changes
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      setLoading(false); // Auth state has been loaded
    });

    // Cleanup subscription on unmount
    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    loading,
  };

  // Render children only after auth state has been determined
  return (
    <AuthContext.Provider value={value}>
      {!loading && children} {/* Render children only when not loading */}
    </AuthContext.Provider>
  );
};
