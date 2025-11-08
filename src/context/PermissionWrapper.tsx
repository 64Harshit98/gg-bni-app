import { useAuth } from './auth-context';
import AccessDeniedPage from '../Pages/Unauthorized';
import { Navigate, Outlet, useMatches } from 'react-router-dom';
import { ROUTES } from '../constants/routes.constants';
import { Permissions } from '../enums';

interface RouteHandle {
    isPublic?: boolean;
    requiredPermission?: Permissions | null;
}

const PermissionWrapper = () => {
    const { currentUser, hasPermission } = useAuth();
    const matches = useMatches();

    const routeConfig = matches[matches.length - 1]?.handle as RouteHandle | undefined;

    if (routeConfig?.isPublic) {
        return currentUser ? <Navigate to={ROUTES.HOME} replace /> : <Outlet />;
    }

    if (!currentUser) {
        return <Navigate to={ROUTES.LANDING} replace />;
    }

    if (routeConfig?.requiredPermission && !hasPermission(routeConfig.requiredPermission)) {
        return <AccessDeniedPage />;
    }

    return <Outlet />;
};

export default PermissionWrapper;