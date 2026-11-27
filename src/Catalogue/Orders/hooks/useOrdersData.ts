import { useEffect, useMemo, useState } from 'react';
import type { Order } from '../orders.types';
import { ensureOrdersRange, subscribeOrders, type OrdersSnapshot } from '../ordersSync';

const EMPTY: OrdersSnapshot = { orders: [], ready: false, error: null, windowStart: 0 };

// Orders created in [startDate, endDate], served from the shared local
// replica in ordersSync.ts (IndexedDB + a delta listener) instead of a fresh
// Firestore query per mount / per filter change. Upcoming orders follow the
// same createdAt range, as before.
export const useOrdersData = (
    companyId?: string,
    startDate?: Date | null,
    endDate?: Date | null
) => {
    const [snapshot, setSnapshot] = useState<OrdersSnapshot>(EMPTY);
    const [rangeError, setRangeError] = useState<string | null>(null);

    useEffect(() => {
        setSnapshot(EMPTY);
        if (!companyId) return;
        return subscribeOrders(companyId, (next) => setSnapshot(next));
    }, [companyId]);

    const startMs = startDate ? startDate.getTime() : null;
    const endMs = endDate ? endDate.getTime() : null;

    // A range older than the cached window reads just the missing days, once.
    useEffect(() => {
        if (!companyId || startMs === null) return;
        setRangeError(null);
        ensureOrdersRange(companyId, startMs).catch((err) => {
            console.error('Failed to load older orders', err);
            setRangeError('Failed to load orders');
        });
    }, [companyId, startMs]);

    const Orders = useMemo<Order[]>(() => {
        if (startMs === null || endMs === null) return snapshot.orders;
        return snapshot.orders.filter((o) => {
            const t = o.createdAt.getTime();
            return t >= startMs && t <= endMs;
        });
    }, [snapshot.orders, startMs, endMs]);

    const rangeCovered = startMs === null || startMs >= snapshot.windowStart;
    // A live-sync hiccup with cached orders on hand keeps showing them.
    const error = (snapshot.orders.length ? null : snapshot.error) || rangeError;
    const loading = !!companyId && !error && (!snapshot.ready || !rangeCovered);

    return { Orders, loading, error };
};
