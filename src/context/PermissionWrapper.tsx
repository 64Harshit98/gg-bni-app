import React from 'react';
import { useAuth } from '../context/auth-context'; // Or your new hook path
import Loading from '../Pages/Loading/Loading';
import AccessDeniedPage from '../Pages/Unauthorized';
import { Permissions } from '../enums';

const PermissionWrapper = ({ children, requiredPermission }: { children: React.ReactNode, requiredPermission: Permissions }) => {
    // ✅ Get hasPermission from the hook
    const { currentUser, loading, hasPermission } = useAuth();

    if (loading) {
        return <Loading />;
    }

    // ✅ Use the hasPermission function for the check
    if (!currentUser || !hasPermission(requiredPermission)) {
        return <AccessDeniedPage />;
    }

    return <>{children}</>;
};

export default PermissionWrapper;