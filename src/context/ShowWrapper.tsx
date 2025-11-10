import React from 'react';
import { useAuth } from './auth-context';
import { Permissions } from '../enums';

interface WrapperProps {
    children: React.ReactNode;
    requiredPermission: Permissions;
}

const ShowWrapper = ({ children, requiredPermission }: WrapperProps) => {
    const { hasPermission } = useAuth();

    if (!hasPermission(requiredPermission)) {
        return null;
    }

    return <>{children}</>;
};

export default ShowWrapper;