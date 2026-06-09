import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { db } from '../lib/Firebase';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { FilterControls, FilterProvider, useFilter } from '../Components/Filter';
import { Permissions } from '../enums';
import { SiteItems } from '../routes/SiteRoutes';
import { OrderTimeline } from '../Components/OrderTimeline';
import { CompletedSalesCard } from '../Components/CatalougeSales';
// import { RestockAlertsCard } from '../Components/RestockItems';
import { TopSoldItemsCard } from '../Components/TopFiveOrder';
import { OrderBarChartReport } from '../Components/OrderSalesGraph';
import { IconChevronDown } from '../constants/Icons';
import { FiRefreshCw, FiLoader } from 'react-icons/fi';
import { fetchDashboardData, CACHE_DURATION } from '../lib/fetchDashboardData';
import ShinyText from '../Components/ShinyText';
import type { WithCacheMeta } from '../lib/fetchDashboardData';
import NotificationBell from '../Components/NotificationBell';


// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface TopItem {
    id: string;
    name: string;
    totalQuantity: number;
    totalAmount: number;
}

export interface ChartDataPoint {
    date: string;
    sales: number;
    bills: number;
}

export interface CatalogueDashboardData {
    totalSalesAmount: number;
    totalSalesCount: number;
    chartData: ChartDataPoint[];
    topByQuantity: TopItem[];
    topByAmount: TopItem[];
    orderCounts: Record<string, number>;
}

// ─── Business Name Hook ───────────────────────────────────────────────────────

const useBusinessName = (userId?: string, companyId?: string) => {
    const [businessName, setBusinessName] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Wait for both userId and companyId to be available
        if (!userId || !companyId) { setLoading(false); return; }

        const fetchBusinessInfo = async () => {
            try {
                const docRef = doc(db, 'companies', companyId, 'business_info', companyId);
                const docSnap = await getDoc(docRef);
                setBusinessName(docSnap.exists() ? docSnap.data().businessName || 'Business' : 'Business');
            } catch {
                setBusinessName('Business');
                setBusinessName('Business');
            } finally {
                setLoading(false);
            }
        };

        fetchBusinessInfo();
    }, [userId, companyId]);

    return { businessName, loading };
};

// ─── Inner Dashboard Component ────────────────────────────────────────────────
const HomePageContent: React.FC = () => {
    const location = useLocation();
    const { currentUser, loading: authLoading } = useAuth();
    const { filters } = useFilter();
    const { businessName, loading: nameLoading } = useBusinessName(currentUser?.uid, currentUser?.companyId);

    // Expiry date state and effect
    const [expiryDate, setExpiryDate] = useState<any>(null);

    useEffect(() => {
        const fetchExpiry = async () => {
            if (!currentUser?.companyId) return;
            try {
                const ref = doc(db, 'companies', currentUser.companyId);
                const snap = await getDoc(ref);
                if (snap.exists()) {
                    setExpiryDate(snap.data().expiryDate);
                }
            } catch (e) {
                console.error('Error fetching expiry date:', e);
            }
        };
        fetchExpiry();
    }, [currentUser?.companyId]);

    const hasCataloguePermission = currentUser?.permissions?.includes(Permissions.ViewCatalogue);
    const [isDataVisible, setIsDataVisible] = useState<boolean>(false);
    const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
    const currentItem = SiteItems.find(item => item.to === location.pathname);
    const currentLabel = currentItem ? currentItem.label : 'Menu';
    const isHeaderLoading = authLoading || nameLoading;

    const [data, setData] = useState<WithCacheMeta<CatalogueDashboardData> | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async (forceRefresh = false) => {
        if (!currentUser?.companyId || !filters.startDate || !filters.endDate) {
            setLoading(false);
            return;
        }
        if (!forceRefresh) setLoading(true);
        try {
            const result = await fetchDashboardData<CatalogueDashboardData>({
                companyId: currentUser.companyId,
                startDate: filters.startDate,
                endDate: filters.endDate,
                cacheKey: `catalogue_cache_${currentUser.companyId}`,
                forceRefresh,
                transform: (snap, start, end) => {
                    let totalSalesAmount = 0;
                    let totalSalesCount = 0;
                    const salesByDate: Record<string, { sales: number; bills: number }> = {};
                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                        salesByDate[d.toLocaleDateString('en-CA')] = { sales: 0, bills: 0 };
                    }
                    const itemStats = new Map<string, { name: string; totalQuantity: number; totalAmount: number }>();
                    const orderCounts: Record<string, number> = {
                        Upcoming: 0, Confirmed: 0, Packed: 0, Completed: 0,
                    };

                    snap.forEach(docSnap => {
                        const o = docSnap.data();
                        const status: string = o.status || 'Upcoming';
                        const dateKey: string = (o.createdAt as Timestamp).toDate().toLocaleDateString('en-CA');

                        // 1. Update order journey counts
                        const timelineStatus = status === 'Paid' ? 'Completed' : status;
                        if (timelineStatus in orderCounts) {
                            orderCounts[timelineStatus] = (orderCounts[timelineStatus] || 0) + 1;
                        }

                        // 2. Calculate Total Sales Amount irrespective of status
                        // Note: Using o.totalAmount here so even unpaid/upcoming orders show their value. 
                        // If you only want actual cash received, change this back to (o.paidAmount || 0) - (o.refundAmount || 0)
                        // 2. Calculate Total Sales Amount irrespective of status
                        let effectiveAmount = 0;

                        if (Array.isArray(o.items) && o.items.length > 0) {
                            // Dynamically calculate the total from items for absolute accuracy
                            const itemsTotal = o.items.reduce((sum: number, item: any) => {
                                return sum + ((item.finalPrice || 0) * (item.quantity || 0));
                            }, 0);

                            // Apply any order-level discounts as a percentage
                            const discountPercent = Number(o.discount) || 0;
                            effectiveAmount = itemsTotal - (itemsTotal * (discountPercent / 100));
                        } else {
                            // Fallback if no items exist
                            effectiveAmount = Number(o.totalAmount) || Number(o.grandTotal) || 0;
                        }

                        totalSalesAmount += effectiveAmount;
                        totalSalesCount += 1;

                        if (salesByDate[dateKey]) {
                            salesByDate[dateKey].sales += effectiveAmount;
                            salesByDate[dateKey].bills += 1;
                        }

                        // 3. Calculate Item Stats irrespective of status
                        if (Array.isArray(o.items)) {
                            o.items.forEach((item: any) => {
                                if (!item.id || !item.name) return;
                                const cur = itemStats.get(item.id) || { name: item.name, totalQuantity: 0, totalAmount: 0 };
                                itemStats.set(item.id, {
                                    name: item.name,
                                    totalQuantity: cur.totalQuantity + (item.quantity || 0),
                                    totalAmount: cur.totalAmount + ((item.finalPrice || 0) * (item.quantity || 0)),
                                });
                            });
                        }
                    });

                    const chartData: ChartDataPoint[] = Object.entries(salesByDate).map(([date, v]) => ({
                        date, sales: v.sales, bills: v.bills,
                    }));
                    const allItems: TopItem[] = Array.from(itemStats.entries()).map(([id, v]) => ({ id, ...v }));
                    const topByQuantity = [...allItems].sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, 5);
                    const topByAmount = [...allItems].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 5);

                    return { totalSalesAmount, totalSalesCount, chartData, topByQuantity, topByAmount, orderCounts };
                },
            });
            setData(result);

        } catch (e) {
            console.error('Catalogue dashboard fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [currentUser, filters]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        const interval = setInterval(() => fetchData(true), CACHE_DURATION);
        return () => clearInterval(interval);
    }, [fetchData]);

    // Manual refresh: bypass cache and fetch latest data immediately
    const handleRefresh = () => fetchData(true);

    // Helper functions for expiry
    const isExpiringSoon = (expiry: any) => {
        if (!expiry) return false;
        const d = expiry.toDate ? expiry.toDate() : new Date(expiry);
        const diff = d.getTime() - new Date().getTime();
        return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000;
    };

    const getDaysLeft = (expiry: any) => {
        if (!expiry) return null;
        const d = expiry.toDate ? expiry.toDate() : new Date(expiry);
        const diff = d.getTime() - new Date().getTime();
        if (diff <= 0) return 0;
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    const daysLeft = (getDaysLeft(expiryDate) ?? 0);
    const soon = isExpiringSoon(expiryDate);
    const isUrgent = daysLeft <= 2;

    // Format the last-updated timestamp for display in the header
    const formattedLastUpdated = useMemo(() => {
        if (!data?.lastUpdated) return 'Never';
        return new Date(data.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, [data]);

    return (
        <div className="flex min-h-screen w-full flex-col bg-gray-100 mb-16">

            {soon && (
                <div className={`w-full text-center py-2 text-sm font-bold text-white shadow-sm transition-colors duration-300 ${isUrgent ? 'bg-red-300' : 'bg-amber-200'}`}>
                    <ShinyText
                        text={` Subscription expires ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`}
                        speed={4}
                        delay={0}
                        color="#030303"
                        shineColor="#faf5f5"
                        spread={100}
                        direction="left"
                        yoyo={false}
                        pauseOnHover={false}
                        disabled={false}
                    />
                    <Link to="/subscription" className="text-black ml-2 underline hover:text-gray-100">Renew Now</Link>
                </div>
            )}

            {/* ── Header ──────────────────────────────────────────────────── */}
            <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-2">

                {/* Left: page navigation dropdown */}
                <div className="relative flex justify-start">
                    <button
                        disabled={!hasCataloguePermission}
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className={`flex min-w-20 items-center justify-between rounded-sm border border-slate-400 p-2 text-sm font-medium text-slate-700 transition-colors whitespace-nowrap
                            ${!hasCataloguePermission ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'hover:bg-slate-200 cursor-pointer'}`}
                    >
                        <span className="font-medium">{currentLabel}</span>
                        <IconChevronDown width={16} height={16} className={`transition-transform ${isMenuOpen ? 'rotate-180' : 'rotate-0'}`} />
                    </button>

                    {isMenuOpen && hasCataloguePermission && (
                        <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-300 rounded-md shadow-lg z-10">
                            <ul className="py-1">
                                {SiteItems.map(({ to, label }) => (
                                    <li key={to}>
                                        <Link
                                            to={to}
                                            onClick={() => setIsMenuOpen(false)}
                                            className={`flex w-full items-center gap-3 px-4 py-2 text-sm font-medium
                                                ${location.pathname === to ? 'bg-gray-500 text-white' : 'text-slate-700 hover:bg-gray-100'}`}
                                        >
                                            {label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Center: dashboard title and business name */}
                <div className="flex-1 text-center flex flex-col items-center justify-center">
                    <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
                    <p className="text-sm text-slate-500">{isHeaderLoading ? '...' : businessName}</p>
                </div>

                {/* Right: Notification bell + toggle button */}
                <div className="w-28 flex justify-end items-center gap-2">
                    <div className="border border-slate-300 rounded-sm bg-gray-100 shadow-sm">
                        <NotificationBell />
                    </div>
                    <button
                        onClick={() => setIsDataVisible(!isDataVisible)}
                        className="p-2 rounded-sm border border-slate-400 hover:bg-slate-200 transition-colors"
                        title={isDataVisible ? 'Hide Data' : 'Show Data'}
                    >
                        {isDataVisible ? (
                            // Eye open — data is currently visible
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                        ) : (
                            // Eye closed — data is currently hidden
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                        )}
                    </button>
                </div>
            </header>

            {/* ── Main Content ─────────────────────────────────────────────── */}
            <main className="flex-grow overflow-y-auto p-2">

                {/* Refresh bar: shows when data was last fetched + manual refresh button */}
                <div className="flex justify-center gap-2 mb-2">
                    <p className="text-sm text-slate-500 flex items-center">
                        Last Updated: {formattedLastUpdated}
                    </p>
                    <button
                        onClick={handleRefresh}
                        className={`p-1 rounded-full hover:bg-slate-200 text-slate-600 transition-all ${loading ? 'animate-spin' : ''}`}
                    >
                        {loading ? <FiLoader size={14} /> : <FiRefreshCw size={14} />}
                    </button>
                </div>

                <div className="mx-auto max-w-7xl relative">

                    {/* Date Filter — matches POS (mb-2 inside max-w-7xl) */}
                    <div className="mb-2">
                        <FilterControls />
                    </div>

                    {/* Full-page loader shown only on the very first load */}
                    {loading && !data ? (
                        <div className="flex h-64 items-center justify-center text-slate-500">
                            <FiLoader className="animate-spin mr-2" /> Loading Dashboard...
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">

                            {/* ── Row 1+2: Completed Sales + Order Journey — side by side ── */}
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <CompletedSalesCard
                                    isDataVisible={isDataVisible}
                                    totalSalesAmount={data?.totalSalesAmount ?? 0}
                                    totalSalesCount={data?.totalSalesCount ?? 0}
                                    loading={loading}
                                />
                                <OrderTimeline
                                    isDataVisible={isDataVisible}
                                    orderCounts={data?.orderCounts ?? {}}
                                    loading={loading}
                                />
                            </div>

                            {/* ── Row 3: Three equal columns ──────────────── */}
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">

                                <OrderBarChartReport
                                    isDataVisible={isDataVisible}
                                    chartData={data?.chartData ?? []}
                                    totalSales={data?.totalSalesAmount ?? 0}
                                    totalBills={data?.totalSalesCount ?? 0}
                                    loading={loading}
                                />

                                <TopSoldItemsCard
                                    isDataVisible={isDataVisible}
                                    topByQuantity={data?.topByQuantity ?? []}
                                    topByAmount={data?.topByAmount ?? []}
                                    loading={loading}
                                />

                                {/* Coming Soon placeholder */}
                                <div className="relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm opacity-70 cursor-not-allowed flex items-center justify-center min-h-[160px]">
                                    <span className="absolute top-2 right-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                                        Coming Soon
                                    </span>
                                    <div className="text-center">
                                        <h3 className="text-lg font-semibold text-gray-500">Restock Alerts</h3>
                                        <p className="text-sm text-gray-400">Feature under development</p>
                                    </div>
                                </div>

                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

// FilterProvider wraps HomePageContent so that useFilter() works inside it.
const HomePage: React.FC = () => (
    <FilterProvider>
        <HomePageContent />
    </FilterProvider>
);

export default HomePage;