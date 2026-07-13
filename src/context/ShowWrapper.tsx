import React from 'react';
import { useAuth } from './auth-context';
import { Permissions } from '../enums';
import { Cata_Permissions } from '../Catalogue/enum/cata_permissions.enum';

interface WrapperProps {
    children: React.ReactNode;
    // Allow either permission type
    requiredPermission: Permissions | Cata_Permissions;
}

const ShowWrapper = ({ children, requiredPermission }: WrapperProps) => {
    const { hasPermission, hasCataloguePermission } = useAuth();

    // 1. Determine if the passed permission belongs to the Catalogue domain
    const isCataloguePerm = Object.values(Cata_Permissions).includes(requiredPermission as any);

    // 2. Perform the check using the appropriate function
    const isAuthorized = isCataloguePerm
        ? hasCataloguePermission(requiredPermission as Cata_Permissions)
        : hasPermission(requiredPermission as Permissions);

    // 3. Render children only if authorized
    if (!isAuthorized) {
        return null;
    }

    return <>{children}</>;
};

export default ShowWrapper;