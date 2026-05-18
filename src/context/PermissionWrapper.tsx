import { useAuth } from './auth-context';
import AccessDeniedPage from '../Pages/Unauthorized';
import { Navigate, Outlet, useMatches } from 'react-router-dom';
import { ROUTES } from '../constants/routes.constants';
import { Permissions, PLANS } from '../enums'; // Make sure to import PLANS

interface RouteHandle {
    isPublic?: boolean;
    requiredPermission?: Permissions | null;
}

const PermissionWrapper = () => {
    const { currentUser, hasPermission } = useAuth();
    const matches = useMatches();

    const routeConfig = matches[matches.length - 1]?.handle as RouteHandle | undefined;

    // --- THE SMART REDIRECT FOR PUBLIC PAGES (Like Login) ---
    if (routeConfig?.isPublic) {
        if (currentUser) {
            // 1. Identify if they are a Catalogue-Only user
            const isCatalogueOnly =
                currentUser.plan === PLANS.CATALOGUE_PRO;

            // 2. Sort them into the correct dashboard
            if (isCatalogueOnly) {
                return <Navigate to={ROUTES.CHOME} replace />;
            } else {
                return <Navigate to={ROUTES.HOME} replace />;
            }
        }
        // If not logged in, let them see the public page (Login, Signup, etc.)
        return <Outlet />;
    }

    // --- NON-PUBLIC ROUTES (Require Authentication) ---
    if (!currentUser) {
        return <Navigate to={ROUTES.LANDING} replace />;
    }

    if (routeConfig?.requiredPermission && !hasPermission(routeConfig.requiredPermission)) {
        return <AccessDeniedPage />;
    }

    return <Outlet />;
};

export default PermissionWrapper;