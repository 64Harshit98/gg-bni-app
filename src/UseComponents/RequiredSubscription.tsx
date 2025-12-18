import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { ROUTES } from '../constants/routes.constants';

export const RequireSubscription = () => {
    const { currentUser, loading } = useAuth();

    if (loading) return null; // Or a spinner

    // If plan is NOT active, force redirect to plans page
    if (!currentUser?.Subscription?.isActive) {
        return <Navigate to={ROUTES.SUBSCRIPTION_PAGE} replace />;
    }

    return <Outlet />;
};