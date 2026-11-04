import { useMemo } from "react";
import { useNotifications } from "../../context/NotificationContext";

// Derives today's confirmed-order count from the shared recent-orders
// listener in NotificationContext instead of opening its own onSnapshot
// subscription on the Orders collection.
export const useConfirmedOrdersCount = (companyId?: string) => {
    const { recentOrders } = useNotifications();

    const count = useMemo(() => {
        if (!companyId) return 0;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        return recentOrders.filter((order) => {
            if (order.status !== "Confirmed" || !order.createdAt) return false;
            return order.createdAt >= todayStart && order.createdAt <= todayEnd;
        }).length;
    }, [recentOrders, companyId]);

    return count;
};
