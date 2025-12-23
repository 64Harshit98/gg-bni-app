import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import Loading from '../Pages/Loading/Loading';

export const RequireSubscription = () => {
    const { currentUser, loading } = useAuth();

    if (loading) return <Loading />;

    // LOCKOUT LOGIC:
    // If subscription is NOT active, redirect immediately to plans page.
    // The user cannot access any child route (Dashboard, Sales, etc.)
    if (!currentUser?.Subscription?.isActive) {
        return <Navigate to="/subscription" replace />;
    }

    return <Outlet />;
};