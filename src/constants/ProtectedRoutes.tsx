// src/components/ProtectedRoute.tsx

import React from 'react'; // Ensure React is imported
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { ROUTES } from '../constants/routes.constants';
import { Spinner } from '../Components/ui/spinner';

// Update ProtectedRouteProps interface
interface ProtectedRouteProps {
  redirectPath?: string; // Optional path to redirect to if not authenticated
  children?: React.ReactNode; // <--- ADD THIS LINE
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  redirectPath = ROUTES.LANDING,
  children,
}) => {
  // <--- ALSO ADD 'children' to destructuring
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Spinner size="xl" />
        <p className="text-sm font-medium">Loading authentication...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to={redirectPath} replace />;
  }

  // If user is logged in, render the children passed to ProtectedRoute
  return <>{children}</>; // <--- RENDER CHILDREN HERE INSTEAD OF <Outlet />
};

export default ProtectedRoute;
