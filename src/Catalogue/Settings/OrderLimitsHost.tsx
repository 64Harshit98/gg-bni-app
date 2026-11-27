import { useEffect, useState } from 'react';
import { LAYOUT_ACTION_EVENT, type LayoutAction } from '../../Components/layout/CommandPalette';
import { OrderLimitsModal } from './CatalogueOrderLimits';
import { useAuth } from '../../context/auth-context';
import { ROLES } from '../../enums';
import { Cata_Permissions } from '../enum/cata_permissions.enum';

export const OrderLimitsHost = () => {
    const [open, setOpen] = useState(false);
    const { currentUser, hasCataloguePermission } = useAuth();

    const canManage =
        currentUser?.role === ROLES.OWNER ||
        hasCataloguePermission(Cata_Permissions.ManageOrderLimit);

    useEffect(() => {
        if (!canManage) return;   // permission nahi hai to event sunna hi nahi
        const onAction = (e: Event) => {
            if ((e as CustomEvent<LayoutAction>).detail === 'order-limits') setOpen(true);
        };
        window.addEventListener(LAYOUT_ACTION_EVENT, onAction);
        return () => window.removeEventListener(LAYOUT_ACTION_EVENT, onAction);
    }, [canManage]);

    if (!canManage) return null;
    return <OrderLimitsModal open={open} onClose={() => setOpen(false)} />;
};