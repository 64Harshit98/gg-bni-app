import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { ROUTES } from '../constants/routes.constants';
import { useAuth } from '../context/auth-context';
import Loading from '../Pages/Loading/Loading';
import { PLANS } from '../enums';

interface AppGuardProps {
    requiredPlans?: string[];
}

const AppGuard: React.FC<AppGuardProps> = ({ requiredPlans = [] }) => {
    const { currentUser, loading } = useAuth();
    const location = useLocation();

    if (loading) return <Loading />;

    if (!currentUser) {
        return <Navigate to={ROUTES.LANDING} state={{ from: location }} replace />;
    }

    if (currentUser.isFirstLogin) {
        return <Navigate to={ROUTES.SHOP_SETUP} replace />;
    }
    const hasPlanAccess =
        requiredPlans.length === 0 ||
        (currentUser?.plan && (
            requiredPlans.includes(currentUser.plan) ||
            (currentUser.plan === "enterprise" && requiredPlans.includes(PLANS.ENTERPRISE))
        ));
    if (!hasPlanAccess) {
        return <Navigate to={ROUTES.SUBSCRIPTION_PAGE} replace />;
    }

    return <Outlet />;
};

export default AppGuard;