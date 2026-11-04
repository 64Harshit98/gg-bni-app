import { useAuth } from './auth-context';
import AccessDeniedPage from '../Pages/Unauthorized';
import { Navigate, Outlet, useMatches } from 'react-router-dom';
import { ROUTES } from '../constants/routes.constants';
import { Permissions, PLANS, ROLES } from '../enums';
import { Cata_Permissions } from '../Catalogue/enum/cata_permissions.enum';

interface RouteHandle {
    isPublic?: boolean;
    requiredPermission?: Permissions | Cata_Permissions | null;
}

const PermissionWrapper = () => {
    const { currentUser, hasPermission, hasCataloguePermission } = useAuth();
    const matches = useMatches();

    const routeConfig = matches[matches.length - 1]?.handle as RouteHandle | undefined;

    // 1. PUBLIC ROUTES: Smart Redirect
    if (routeConfig?.isPublic) {
        if (currentUser) {
            if (currentUser.role === ROLES.AGENT || currentUser.role === ROLES.AGENCY) {
                return <Navigate to={ROUTES.PARTNER_DASHBOARD || '/partner-dashboard'} replace />;
            }

            const isCatalogueOnly = currentUser.plan === PLANS.CATALOGUE_PRO || currentUser.plan === PLANS.CALC_CATALOG;
            return <Navigate to={isCatalogueOnly ? ROUTES.CHOME : ROUTES.HOME} replace />;
        }
        return <Outlet />;
    }

    // 2. PROTECTED ROUTES: Auth Check
    if (!currentUser) {
        return <Navigate to={ROUTES.LANDING} replace />;
    }

    // 3. PROTECTED ROUTES: Permission Check
    if (routeConfig?.requiredPermission) {
        const required = routeConfig.requiredPermission;

        // Check which domain the permission belongs to
        const isCataloguePerm = Object.values(Cata_Permissions).includes(required as any);

        const isAuthorized = isCataloguePerm
            ? hasCataloguePermission(required as Cata_Permissions)
            : hasPermission(required as Permissions);

        if (!isAuthorized) {
            return <AccessDeniedPage />;
        }
    }

    return <Outlet />;
};

export default PermissionWrapper;