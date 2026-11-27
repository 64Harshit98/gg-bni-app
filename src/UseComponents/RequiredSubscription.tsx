import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { ROUTES } from '../constants/routes.constants';
import { PLANS } from '../enums';

export const RequireSubscription = () => {
    const { currentUser, loading } = useAuth();
    const location = useLocation();

    if (loading) return null;

    const subData = (currentUser as any)?.subscription || (currentUser as any)?.Subscription || currentUser;
    const isPlanActive = subData?.validity === 'active' || subData?.isActive === true;

    // 1. Group the plans so we know exactly WHO this user is
    const isCatalogueOnly =
        currentUser?.plan === PLANS.CATALOGUE_PRO;
    const isPosOrEnterprise =
        currentUser?.plan === PLANS.ENTERPRISE ||
        currentUser?.plan === PLANS.POS_PRO ||
        currentUser?.plan === PLANS.POS_BASIC || currentUser?.plan === PLANS.CALC_CATALOG;

    // 2. Validate if they have ANY active plan
    const hasActivePlan = isPlanActive && (isPosOrEnterprise || isCatalogueOnly);

    // 3. No Plan? Send to Subscription Page.
    if (!hasActivePlan) {
        if (location.pathname !== ROUTES.SUBSCRIPTION_PAGE) {
            return <Navigate to={ROUTES.SUBSCRIPTION_PAGE} replace />;
        }
    }

    // 4. SMART ROUTING: Auto-Redirect based on Plan type
    if (hasActivePlan) {
        // Scenario A: They are on the subscription page but have an active plan
        if (location.pathname === ROUTES.SUBSCRIPTION_PAGE) {
            if (isCatalogueOnly) {
                return <Navigate to={ROUTES.CHOME} replace />; // Send to Catalogue
            }
            return <Navigate to="/" replace />; // Send to POS
        }

        // Scenario B: Catalogue user tries to load the POS Main Dashboard ("/")
        if (isCatalogueOnly && location.pathname === '/') {
            return <Navigate to={ROUTES.CHOME} replace />;
        }
    }

    return <Outlet />;
};