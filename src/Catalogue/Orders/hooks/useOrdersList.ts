import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import type { Order, OrderStatus } from '../orders.types';
import { ORDER_STATUSES, SAMPLE_ORDERS } from '../orders.types';
import { getDateRange } from '../../../lib/dateRange';
import { useOrdersData } from './useOrdersData';

const DATE_FILTERS = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 Days', value: 'last7' },
    { label: 'Last 30 Days', value: 'last30' },
    { label: 'Custom Range', value: 'custom' },
];

interface UseOrdersListParams {
    companyId?: string;
    isTutorialActive: boolean;
    tutorialStep: number;
}

// Owns status tab / date filter / search / payment filter / expand-collapse
// state for the orders list, and composes useOrdersData so the date filter
// can drive its live Firestore query.
export const useOrdersList = ({ companyId, isTutorialActive, tutorialStep }: UseOrdersListParams) => {
    const location = useLocation();

    const filterRef = useRef<HTMLDivElement>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    const [activeStatusTab, setActiveStatusTab] = useState<OrderStatus>(
        (location.state?.defaultStatus as OrderStatus) || 'Confirmed'
    );
    const [activeDateFilter, setActiveDateFilter] = useState<string>('today');
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [expandedorderId, setExpandedorderId] = useState<string | null>(null);
    const [paymentFilter, setPaymentFilter] = useState<'paid' | 'unpaid'>('unpaid');
    const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
    const [dateRange, setDateRange] = useState<{ start: Date | null, end: Date | null }>(() => {

        if (location.state?.startDate && location.state?.endDate) {

            const start = new Date(location.state.startDate);
            start.setHours(0, 0, 0, 0);

            const end = new Date(location.state.endDate);
            end.setHours(23, 59, 59, 999);

            return { start, end };
        }

        return {
            start: new Date(new Date().setHours(0, 0, 0, 0)),
            end: new Date(new Date().setHours(23, 59, 59, 999))
        };
    });

    const { Orders, loading: dataLoading, error } = useOrdersData(
        companyId,
        dateRange.start,
        dateRange.end
    );

    // When the tutorial reaches the "orders list" step, auto-expand a matching
    // sample order so the person actually sees the detail view, not a blank card.
    useEffect(() => {
        if (isTutorialActive && tutorialStep === 5) {
            const target = SAMPLE_ORDERS.find((o) => o.status === activeStatusTab);
            if (target) setExpandedorderId(target.id);
        }
    }, [tutorialStep, isTutorialActive, activeStatusTab]);

    const handleDateFilterSelect = (value: string) => {
        setActiveDateFilter(value);
        if (value !== 'custom') {
            const range = getDateRange(value);
            setDateRange(range);
            setIsFilterOpen(false);
        }
    };

    const handleApplyCustomDate = () => {
        if (customDateRange.start && customDateRange.end) {
            setDateRange({
                start: new Date(customDateRange.start),
                end: new Date(new Date(customDateRange.end).setHours(23, 59, 59))
            });
            setIsFilterOpen(false);
        }
    };

    const getDateDisplay = useMemo(() => {

        if (!dateRange.start || !dateRange.end) return '';

        const format = (d: Date) =>
            d.toLocaleDateString('en-GB');

        if (dateRange.start.toDateString() === dateRange.end.toDateString()) {
            return format(dateRange.start);
        }

        return `${format(dateRange.start)} to ${format(dateRange.end)}`;

    }, [dateRange]);

    useEffect(() => {
        if (location.state?.defaultStatus) {
            setActiveStatusTab(location.state.defaultStatus);
        }
    }, [location.state]);

    const statusCounts = useMemo(() => {
        return ORDER_STATUSES.reduce((acc, status) => {

            //  Completed = Completed + Paid
            if (status === "Completed") {
                acc[status] = Orders.filter(
                    o => o.status === "Completed" || o.status === "Paid"
                ).length;
            } else {
                acc[status] = Orders.filter(
                    o => o.status === status
                ).length;
            }

            return acc;
        }, {} as Record<string, number>);
    }, [Orders]);

    // 3. Simplified Filter (No toggle dependency)
    const filteredOrders = useMemo(() => {

        // While the tutorial is active, always show the sample orders filtered
        // by the current status tab, so every tutorial step has real-looking
        // cards to point at.
        if (isTutorialActive) {
            if (activeStatusTab === 'Completed') {
                return SAMPLE_ORDERS.filter((o) =>
                    paymentFilter === 'unpaid' ? o.status === 'Completed' : o.status === 'Paid'
                );
            }
            return SAMPLE_ORDERS.filter((o) => o.status === activeStatusTab);
        }

        let result = Orders
            .filter(order => {

                if (activeStatusTab === "Upcoming") {
                    if (order.status !== "Upcoming") return false;
                    // For lead/upcoming orders, only show if they have items
                    // For confirmed cart orders (isLead: false), always show
                    if (order.isLead) {
                        return (order.items?.length || 0) > 0;
                    }
                    return true;
                }

                //  COMPLETED TAB
                if (activeStatusTab === 'Completed') {
                    if (paymentFilter === 'unpaid') {
                        return order.status === 'Completed';
                    }
                    return order.status === 'Paid';
                }

                //  NORMAL TABS (Confirmed, Packed)
                return order.status === activeStatusTab;
            })

            .filter(order => {
                const q = searchQuery.toLowerCase();
                return (
                    order.orderId?.toLowerCase().includes(q) ||
                    order.userName?.toLowerCase().includes(q) ||
                    order.userLoginPhone?.toLowerCase().includes(q) ||
                    order.billingDetails?.phone?.toLowerCase().includes(q) ||
                    order.billingDetails?.name?.toLowerCase().includes(q) ||
                    order.shippingDetails?.phone?.toLowerCase().includes(q) ||
                    order.shippingDetails?.name?.toLowerCase().includes(q)
                );
            });

        //  Paid tab me latest order upar
        if (activeStatusTab === 'Completed' && paymentFilter === 'paid') {
            result = result.sort((a, b) => {
                const aTime = a.updatedAt
                    ? new Date(a.updatedAt).getTime()
                    : new Date(a.createdAt).getTime();

                const bTime = b.updatedAt
                    ? new Date(b.updatedAt).getTime()
                    : new Date(b.createdAt).getTime();

                return bTime - aTime;
            });
        }

        // Sort: latest first for all tabs
        return result.sort((a, b) => {
            const getTime = (o: Order) => {
                if (activeStatusTab === 'Upcoming') {
                    return new Date(o.createdAt).getTime();
                }
                return o.updatedAt
                    ? new Date(o.updatedAt).getTime()
                    : new Date(o.createdAt).getTime();
            };
            return getTime(b) - getTime(a);
        });

    }, [Orders, activeStatusTab, paymentFilter, searchQuery, isTutorialActive]);

    const handleOrderClick = (uiKey: string) => {
        setExpandedorderId(prevId => (prevId === uiKey ? null : uiKey));
    };

    return {
        Orders,
        dataLoading,
        error,

        filterRef,
        isFilterOpen,
        setIsFilterOpen,

        activeStatusTab,
        setActiveStatusTab,
        statusCounts,

        activeDateFilter,
        dateRange,
        customDateRange,
        setCustomDateRange,
        dateFilters: DATE_FILTERS,
        handleDateFilterSelect,
        handleApplyCustomDate,
        getDateDisplay,

        searchQuery,
        setSearchQuery,
        showSearch,
        setShowSearch,

        paymentFilter,
        setPaymentFilter,

        expandedorderId,
        handleOrderClick,

        filteredOrders,
    };
};
