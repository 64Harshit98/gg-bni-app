import { useEffect, useState } from 'react';
import { LAYOUT_ACTION_EVENT, type LayoutAction } from '../../Components/layout/CommandPalette';
import { OrderLimitsModal } from './CatalogueOrderLimits';

/** Mount once inside CatalogueLayout. Opens when the 'order-limits' layout action fires. */
export const OrderLimitsHost = () => {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const onAction = (e: Event) => {
            if ((e as CustomEvent<LayoutAction>).detail === 'order-limits') setOpen(true);
        };
        window.addEventListener(LAYOUT_ACTION_EVENT, onAction);
        return () => window.removeEventListener(LAYOUT_ACTION_EVENT, onAction);
    }, []);
    return <OrderLimitsModal open={open} onClose={() => setOpen(false)} />;
};
export default OrderLimitsHost;