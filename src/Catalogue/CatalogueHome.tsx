import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { db } from '../lib/Firebase';
import { doc, getDoc, collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { FilterControls, FilterProvider, useFilter } from '../Components/Filter';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions } from '../enums';
import { SiteItems } from '../routes/SiteRoutes';
import { OrderTimeline } from '../Components/OrderTimeline';
import { CompletedSalesCard } from '../Components/CatalougeSales';
// import { RestockAlertsCard } from '../Components/RestockItems';
import { TopSoldItemsCard } from '../Components/TopFiveOrder';
import { OrderBarChartReport } from '../Components/OrderSalesGraph';
import { IconChevronDown } from '../constants/Icons';
import { FiRefreshCw, FiLoader } from 'react-icons/fi';

// Cache duration: 1 hour in milliseconds — same constant as POS Home
const CACHE_DURATION = 60 * 60 * 1000;
 
// ─── Shared Types ─────────────────────────────────────────────────────────────
// Exported so child components can import instead of defining their own duplicates
 
export interface TopItem {
    id: string;
    name: string;
    totalQuantity: number;
    totalAmount: number;
}
 
export interface ChartDataPoint {
    date: string;   // YYYY-MM-DD format (en-CA locale)
    sales: number;  // total sale amount for that day
    bills: number;  // number of completed orders for that day
}
 
// Shape of data stored in localStorage and passed down to all child components
export interface CatalogueDashboardData {
    totalSalesAmount: number;       // used by CompletedSalesCard
    totalSalesCount: number;        // used by CompletedSalesCard
    chartData: ChartDataPoint[];    // used by OrderBarChartReport
    topByQuantity: TopItem[];       // used by TopSoldItemsCard
    topByAmount: TopItem[];         // used by TopSoldItemsCard
    orderCounts: Record<string, number>; // used by OrderTimeline (counts only, not full Order objects)
    lastUpdated: number;            // timestamp of last Firestore fetch
    cacheStart: string;             // filter start date at time of fetch
    cacheEnd: string;               // filter end date at time of fetch
}
 
// ─── Business Name Hook ───────────────────────────────────────────────────────
// Fetches business name once on mount. Kept separate from main data hook
// so it doesn't interfere with the dashboard caching logic.
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
                setBusinessName('Business'); // Fallback on error
            } finally {
                setLoading(false);
            }
        };
 
        fetchBusinessInfo();
    }, [userId, companyId]);
 
    return { businessName, loading };
};
 
// ─── Inner Dashboard Component ────────────────────────────────────────────────
// Separated from the exported component so FilterProvider can wrap it below.
// This is required because useFilter() must be called inside a FilterProvider.
const HomePageContent: React.FC = () => {
    const location = useLocation();
    const { currentUser, loading: authLoading } = useAuth();
    const { filters } = useFilter(); // Read selected date range from FilterProvider context
    const { businessName, loading: nameLoading } = useBusinessName(currentUser?.uid, currentUser?.companyId);
 
    const hasCataloguePermission = currentUser?.permissions?.includes(Permissions.ViewCatalogue);
    const [isDataVisible, setIsDataVisible] = useState<boolean>(false);
    const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
    const currentItem = SiteItems.find(item => item.to === location.pathname);
    const currentLabel = currentItem ? currentItem.label : 'Menu';
    const isHeaderLoading = authLoading || nameLoading;
 
    // Single source of truth for all dashboard data
    // All child components read from this state via props
    const [data, setData] = useState<CatalogueDashboardData | null>(null);
    const [loading, setLoading] = useState(true);
 
    // ── Main data fetch — mirrors POS Home's fetchData pattern exactly ────────
    //
    // Flow:
    //   1. Check localStorage for valid cached data
    //   2. If cache hit → use it, skip Firestore (0 reads)
    //   3. If cache miss → run 1 Firestore query, process in-memory, save to cache
    const fetchData = useCallback(async (forceRefresh = false) => {
 
        // Guard: do nothing until user and filter dates are available
        if (!currentUser?.companyId || !filters.startDate || !filters.endDate) {
            setLoading(false);
            return;
        }
 
        // Per-company cache key prevents data leakage between different logged-in users
        const CACHE_KEY = `catalogue_cache_${currentUser.companyId}`;
 
        if (!forceRefresh) setLoading(true);
 
        try {
            // ── Step 1: Try reading from localStorage cache ───────────────────
            const cached = localStorage.getItem(CACHE_KEY);
            if (!forceRefresh && cached) {
                const parsed: CatalogueDashboardData = JSON.parse(cached);
 
                // Cache is valid only if:
                //   a) It was fetched within the last CACHE_DURATION (1 hour)
                //   b) The date range matches the currently selected filters
                const timeOk = Date.now() - parsed.lastUpdated < CACHE_DURATION;
                const dateOk = parsed.cacheStart === filters.startDate && parsed.cacheEnd === filters.endDate;
 
                if (timeOk && dateOk) {
                    setData(parsed);
                    setLoading(false);
                    return; // Cache hit — no Firestore read needed
                }
            }
 
            // ── Step 2: Fetch from Firestore (cache miss or forced refresh) ───
            const start = new Date(filters.startDate); start.setHours(0, 0, 0, 0);
            const end   = new Date(filters.endDate);   end.setHours(23, 59, 59, 999);
 
            // Single query with no status filter — fetch ALL orders in the date range.
            // Status-based filtering is done in-memory below to avoid multiple queries.
            const snap = await getDocs(query(
                collection(db, 'companies', currentUser.companyId, 'Orders'),
                where('createdAt', '>=', Timestamp.fromDate(start)),
                where('createdAt', '<=', Timestamp.fromDate(end)),
                orderBy('createdAt', 'asc')
            ));
 
            // ── Step 3: Process all documents in a single loop ─────────────────
            // One pass generates data for all 4 child components simultaneously.
            // No additional Firestore calls needed.
 
            let totalSalesAmount = 0;
            let totalSalesCount  = 0;
 
            // Pre-fill every date in the range with zero so chart has no gaps
            const salesByDate: Record<string, { sales: number; bills: number }> = {};
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                salesByDate[d.toLocaleDateString('en-CA')] = { sales: 0, bills: 0 };
            }
 
            // Accumulates quantity and revenue per item across all completed orders
            const itemStats = new Map<string, { name: string; totalQuantity: number; totalAmount: number }>();
 
            // Order counts per status — OrderTimeline only needs these numbers, not full objects
            const orderCounts: Record<string, number> = {
                Upcoming: 0, Confirmed: 0, Packed: 0, Completed: 0,
            };
 
            snap.forEach(docSnap => {
                const o      = docSnap.data();
                const status: string = o.status || 'Upcoming';
                const amount: number = o.totalAmount || 0;
                const dateKey: string = (o.createdAt as Timestamp).toDate().toLocaleDateString('en-CA');
 
                // For OrderTimeline:
                // Treat 'Paid' as 'Completed' — matches original OrderTimeline grouping logic
                const timelineStatus = status === 'Paid' ? 'Completed' : status;
                if (timelineStatus in orderCounts) {
                    orderCounts[timelineStatus] = (orderCounts[timelineStatus] || 0) + 1;
                }
 
                // For CompletedSalesCard and OrderBarChartReport:
                // Only Completed and Paid orders count toward sales totals
                if (status === 'Completed' || status === 'Paid') {
                    totalSalesAmount += amount;
                    totalSalesCount  += 1;
                    if (salesByDate[dateKey]) {
                        salesByDate[dateKey].sales += amount;
                        salesByDate[dateKey].bills += 1;
                    }
                }
 
                // For TopSoldItemsCard:
                // Only Completed orders (not Paid) — matches original component's query
                if (status === 'Completed' && Array.isArray(o.items)) {
                    o.items.forEach((item: any) => {
                        if (!item.id || !item.name) return; // Skip malformed items
 
                        const cur = itemStats.get(item.id) || { name: item.name, totalQuantity: 0, totalAmount: 0 };
                        itemStats.set(item.id, {
                            name: item.name,
                            totalQuantity: cur.totalQuantity + (item.quantity || 0),
                            totalAmount:   cur.totalAmount   + ((item.mrp || 0) * (item.quantity || 0)),
                        });
                    });
                }
            });
 
            // ── Step 4: Build final data structures ───────────────────────────
 
            // Convert date map to array for Recharts LineChart
            const chartData: ChartDataPoint[] = Object.entries(salesByDate).map(([date, v]) => ({
                date, sales: v.sales, bills: v.bills,
            }));
 
            // Sort all items by each metric, keep top 5
            const allItems: TopItem[] = Array.from(itemStats.entries()).map(([id, v]) => ({ id, ...v }));
            const topByQuantity = [...allItems].sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, 5);
            const topByAmount   = [...allItems].sort((a, b) => b.totalAmount   - a.totalAmount  ).slice(0, 5);
 
            const finalData: CatalogueDashboardData = {
                totalSalesAmount,
                totalSalesCount,
                chartData,
                topByQuantity,
                topByAmount,
                orderCounts,
                lastUpdated: Date.now(),     // timestamp for cache validation
                cacheStart:  filters.startDate,
                cacheEnd:    filters.endDate,
            };
 
            setData(finalData);
 
            // ── Step 5: Save to localStorage for future visits within 1 hour ──
            localStorage.setItem(CACHE_KEY, JSON.stringify(finalData));
 
        } catch (e) {
            console.error('Catalogue dashboard fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [currentUser, filters]); // Re-run whenever user or date filters change
 
    // Trigger fetch on mount and whenever filters (date range) change
    useEffect(() => { fetchData(); }, [fetchData]);
 
    // Auto-refresh every 1 hour — same CACHE_DURATION as POS Home.
    // Forces a fresh Firestore fetch after the cache window expires,
    // even if the user keeps the page open without manually refreshing.
    useEffect(() => {
        const interval = setInterval(() => fetchData(true), CACHE_DURATION);
        return () => clearInterval(interval); // Cleanup to prevent memory leaks on unmount
    }, [fetchData]);
 
    // Manual refresh: bypass cache and fetch latest data immediately
    const handleRefresh = () => fetchData(true);
 
    // Format the last-updated timestamp for display in the header
    const formattedLastUpdated = useMemo(() => {
        if (!data?.lastUpdated) return 'Never';
        return new Date(data.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, [data]);
 
    return (
        <div className="flex min-h-screen w-full flex-col bg-gray-100 mb-16">
 
            {/* ── Header ──────────────────────────────────────────────────── */}
            <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-2">
 
                {/* Left: page navigation dropdown */}
                <div className="relative flex justify-start">
                    <button
                        disabled={!hasCataloguePermission}
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className={`flex min-w-28 items-center justify-between gap-2 rounded-sm border border-slate-400 p-2 text-sm font-medium text-slate-700 transition-colors whitespace-nowrap
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
                <div className="flex-1 text-center">
                    <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
                    <p className="text-sm text-slate-500">{isHeaderLoading ? 'Loading...' : businessName}</p>
                </div>
 
                {/* Right: toggle button to show or hide sensitive data values */}
                <div className="w-14 flex justify-end">
                    <ShowWrapper requiredPermission={Permissions.ViewSalescard}>
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
                    </ShowWrapper>
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
 
                {/* Full-page loader shown only on the very first load (before any data exists) */}
                {loading && !data ? (
                    <div className="flex h-64 items-center justify-center text-slate-500">
                        <FiLoader className="animate-spin mr-2" /> Loading Dashboard...
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
 
                        {/* FilterControls manages its own state inside FilterProvider — no props needed */}
                        <FilterControls />
 
                        {/* All cards below receive pre-processed props from the single fetchData call.
                            None of them make their own Firestore requests.
                            The ?? fallbacks ensure safe rendering before data loads. */}
 
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
 
                        {/* Placeholder card for the upcoming Restock Alerts feature */}
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
                )}
            </main>
        </div>
    );
};
 
// FilterProvider wraps HomePageContent so that useFilter() works inside it.
// HomePageContent is a separate component specifically to enable this pattern.
const HomePage: React.FC = () => (
    <FilterProvider>
        <HomePageContent />
    </FilterProvider>
);
 
export default HomePage;