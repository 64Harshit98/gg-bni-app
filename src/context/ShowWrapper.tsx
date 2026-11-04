import React from 'react';
import { useAuth } from './auth-context';
import { Permissions } from '../enums';
import { Cata_Permissions } from '../Catalogue/enum/cata_permissions.enum';

interface WrapperProps {
    children: React.ReactNode;
    requiredPermission: Permissions | Cata_Permissions;
    mode?: 'hide' | 'disable';
}

const ShowWrapper = ({ children, requiredPermission, mode = 'hide' }: WrapperProps) => {
    const { hasPermission, hasCataloguePermission } = useAuth();

    const isCataloguePerm = Object.values(Cata_Permissions).includes(requiredPermission as any);

    const isAuthorized = isCataloguePerm
        ? hasCataloguePermission(requiredPermission as Cata_Permissions)
        : hasPermission(requiredPermission as Permissions);

    if (!isAuthorized) {
        if (mode === 'disable' && React.isValidElement(children)) {
            const child = children as React.ReactElement<any>;
            const disabledClasses = 'opacity-40 grayscale pointer-events-none select-none';

            const existingClassName = child.props.className;
            const mergedClassName =
                typeof existingClassName === 'function'
                    ? (state: any) => `${existingClassName(state) ?? ''} ${disabledClasses}`.trim()
                    : `${existingClassName ?? ''} ${disabledClasses}`.trim();

            return React.cloneElement(child, {
                className: mergedClassName,
                onClick: (e: React.MouseEvent) => e.preventDefault(),
                tabIndex: -1,
                'aria-disabled': true,
                title: "You don't have permission to access this",
            });
        }
        if (mode === 'disable') {
            // Fallback agar children single valid element na ho (rare case)
            return (
                <span className="opacity-40 grayscale pointer-events-none select-none contents">
                    {children}
                </span>
            );
        }
        return null;
    }

    return <>{children}</>;
};

export default ShowWrapper;