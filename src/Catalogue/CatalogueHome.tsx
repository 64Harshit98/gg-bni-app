import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { db } from '../lib/Firebase';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
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
import { Spinner } from '../Components/ui/spinner';
import { fetchDashboardData, CACHE_DURATION } from '../lib/fetchDashboardData';
import ShinyText from '../Components/ShinyText';
import type { WithCacheMeta } from '../lib/fetchDashboardData';
import NotificationBell from '../Components/NotificationBell';
import { TutorialStep } from '../Components/TutorialStep';
import useTutorial from '../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../Catalogue/hooks/useCompleteTutorial';
import ShowWrapper from '../context/ShowWrapper';
import { Cata_Permissions } from '../Catalogue/enum/cata_permissions.enum';


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
// AFTER
const SAMPLE_CATALOGUE_DATA: CatalogueDashboardData = {
    totalSalesAmount: 36500,
    totalSalesCount: 84,
    chartData: [
        { date: '2026-07-01', sales: 4200, bills: 10 },
        { date: '2026-07-02', sales: 5600, bills: 13 },
        { date: '2026-07-03', sales: 3100, bills: 8 },
        { date: '2026-07-04', sales: 6800, bills: 16 },
        { date: '2026-07-05', sales: 4900, bills: 12 },
        { date: '2026-07-06', sales: 7200, bills: 17 },
        { date: '2026-07-07', sales: 4700, bills: 8 },
    ],
    topByQuantity: [
        { id: 'sample-1', name: 'Sample Item A', totalQuantity: 42, totalAmount: 8400 },
        { id: 'sample-2', name: 'Sample Item B', totalQuantity: 31, totalAmount: 6200 },
        { id: 'sample-3', name: 'Sample Item C', totalQuantity: 24, totalAmount: 4800 },
        { id: 'sample-4', name: 'Sample Item D', totalQuantity: 18, totalAmount: 3600 },
        { id: 'sample-5', name: 'Sample Item E', totalQuantity: 12, totalAmount: 2400 },
    ],
    topByAmount: [
        { id: 'sample-1', name: 'Sample Item A', totalQuantity: 42, totalAmount: 8400 },
        { id: 'sample-2', name: 'Sample Item B', totalQuantity: 31, totalAmount: 6200 },
        { id: 'sample-3', name: 'Sample Item C', totalQuantity: 24, totalAmount: 4800 },
        { id: 'sample-4', name: 'Sample Item D', totalQuantity: 18, totalAmount: 3600 },
        { id: 'sample-5', name: 'Sample Item E', totalQuantity: 12, totalAmount: 2400 },
    ],
    orderCounts: {
        Upcoming: 6,
        Confirmed: 10,
        Packed: 5,
        Completed: 63,
    },
};

// Total tutorial steps
const TOTAL_STEPS = 7;

// ─── Inner Dashboard Component ────────────────────────────────────────────────
const HomePageContent: React.FC = () => {
    const location = useLocation();
    const { currentUser, loading: authLoading } = useAuth();
    const { filters } = useFilter();
    const { businessName, loading: nameLoading } = useBusinessName(currentUser?.uid, currentUser?.companyId);

    const [tutorialStep, setTutorialStep] = useState(0);
    const isTutorialActive = tutorialStep > 0 && tutorialStep <= TOTAL_STEPS;

    // ─── Refs for autoscroll ──────────────────────────────────────────────────
    const tutorialRefs = useRef<(HTMLElement | null)[]>([]);
    const mainRef = useRef<HTMLElement | null>(null);

    const setTutorialRef = (index: number) => (el: HTMLElement | null) => {
        tutorialRefs.current[index] = el;
    };

    useEffect(() => {
        if (tutorialStep === 0) return;
        const el = tutorialRefs.current[tutorialStep];
        if (!el) return;
        if (tutorialStep <= 2) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [tutorialStep]);
    // ─────────────────────────────────────────────────────────────────────────

    const next = (n: number) => setTutorialStep(n <= TOTAL_STEPS ? n : 0);
    const skip = () => {
        completeTutorial(currentUser, 'catalogueTutorialDone', setTutorialStep);
    };

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

    const displayData = isTutorialActive ? SAMPLE_CATALOGUE_DATA : data;
    const effectiveDataVisible = isTutorialActive ? true : isDataVisible;

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
                        if (status === 'Upcoming') return;
                        let effectiveAmount = 0;

                        if (Array.isArray(o.items) && o.items.length > 0) {
                            // Dynamically calculate the total from items for absolute accuracy
                            const itemsTotal = o.items.reduce((sum: number, item: any) => {
                                return sum + ((item.finalPrice || 0));
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
                                    totalAmount: cur.totalAmount + ((item.finalPrice || 0)),
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
    useTutorial(currentUser, setTutorialStep, 'catalogueTutorialDone');

    useEffect(() => {
        const checkTutorial = async () => {
            if (!currentUser?.companyId) return;
            const docRef = doc(db, 'companies', currentUser.companyId, 'settings', 'tutorial');
            const snap = await getDoc(docRef);
            const done = snap.exists() && snap.data()?.catalogueTutorialDone;
            if (!done) setTutorialStep(1);
        };
        checkTutorial();
    }, [currentUser]);

    return (
        <div className="aurora relative flex min-h-screen w-full flex-col bg-background mb-16">

            {soon && (
                <div className={`w-full text-center py-2 text-sm font-bold shadow-sm transition-colors duration-300 ${isUrgent ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground'}`}>
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
                    <Link to="/subscription" className="ml-2 underline underline-offset-2 hover:opacity-80">Renew Now</Link>
                </div>
            )}

            {/* ── Header ──────────────────────────────────────────────────── */}
            <header className="glass sticky top-0 z-20 mx-3 mt-3 flex flex-wrap flex-shrink-0 items-center justify-between gap-3 rounded-2xl p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    {/* Left: page navigation dropdown */}
                    <TutorialStep step={1} currentStep={tutorialStep} text="Use this menu to switch between POS and Catalogue views." onNext={() => next(2)} onSkip={skip} mobileArrowAlign="left">
                        <div ref={setTutorialRef(1)} className="relative inline-block">
                            <button
                                disabled={!hasCataloguePermission}
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                className={`flex min-w-20 items-center justify-between gap-2 rounded-xl border border-border p-2 text-sm font-medium text-foreground transition-colors whitespace-nowrap
                                ${!hasCataloguePermission ? 'opacity-50 cursor-not-allowed bg-muted' : 'hover:bg-accent cursor-pointer'}`}
                            >
                                <span className="font-medium">{currentLabel}</span>
                                <IconChevronDown width={16} height={16} className={`transition-transform ${isMenuOpen ? 'rotate-180' : 'rotate-0'}`} />
                            </button>

                            {isMenuOpen && hasCataloguePermission && (
                                <div className="glass absolute top-full left-0 mt-2 w-56 rounded-xl shadow-lg z-10 overflow-hidden">
                                    <ul className="py-1">
                                        {SiteItems.map(({ to, label }) => (
                                            <li key={to}>
                                                <Link
                                                    to={to}
                                                    onClick={() => setIsMenuOpen(false)}
                                                    className={`flex w-full items-center gap-3 px-4 py-2 text-sm font-medium
                                                    ${location.pathname === to ? 'bg-gradient-brand text-white' : 'text-foreground hover:bg-accent'}`}
                                                >
                                                    {label}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </TutorialStep>

                    {/* Filter */}
                    <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueFilter}>
                        <TutorialStep step={3} currentStep={tutorialStep} text="Use these filters to select the date range for your dashboard data." onNext={() => next(4)} onSkip={skip}>
                            <div ref={setTutorialRef(3)}>
                                <FilterControls />
                            </div>
                        </TutorialStep>
                    </ShowWrapper>
                </div>

                {/* Center: dashboard title and business name */}
                <div className="flex-1 text-center flex flex-col items-center justify-center">
                    <h1 className="text-gradient text-2xl font-bold">Dashboard</h1>
                    <p className="text-sm text-muted-foreground">{isHeaderLoading ? '...' : businessName}</p>
                </div>

                {/* Right: Last updated + Notification bell + toggle button */}
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueFilter}>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
                            Last updated: {formattedLastUpdated}
                            <button onClick={handleRefresh} className={`text-muted-foreground hover:text-primary transition-all ${loading ? 'animate-spin' : ''}`}>
                                {loading ? <FiLoader size={13} /> : <FiRefreshCw size={13} />}
                            </button>
                        </span>
                    </ShowWrapper>
                    <ShowWrapper requiredPermission={Cata_Permissions.ViewNotification}>
                        <div className="relative flex items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                            <NotificationBell />
                        </div>
                    </ShowWrapper>
                    <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueHidebutton}>
                        <TutorialStep step={2} currentStep={tutorialStep} text="Toggle this to show or hide sensitive sales figures." onNext={() => next(3)} onSkip={skip}>
                            <button
                                onClick={() => setIsDataVisible(!isDataVisible)}
                                className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                                title={isDataVisible ? 'Hide Data' : 'Show Data'}
                            >
                                {isDataVisible ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                                )}
                            </button>
                        </TutorialStep>
                    </ShowWrapper>
                </div>
            </header>

            {/* ── Main Content ─────────────────────────────────────────────── */}
            <main ref={mainRef} className="flex-grow overflow-y-auto p-3">
                <div className="mx-auto max-w-none relative">
                    {/* Full-page loader shown only on the very first load */}
                    {(loading && !data && !isTutorialActive) ? (
                        <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
                            <Spinner size="sm" /> Loading Dashboard...
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">

                            {/* ── Row 1+2: Completed Sales + Order Journey — side by side ── */}
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueSalesbarchart}>
                                    <TutorialStep step={4} currentStep={tutorialStep} text="This shows your total completed sales for the selected period." onNext={() => next(5)} onSkip={skip}>
                                        <div ref={setTutorialRef(4)} className="h-full [&>*]:h-full">
                                            <CompletedSalesCard
                                                isDataVisible={effectiveDataVisible}
                                                totalSalesAmount={displayData?.totalSalesAmount ?? 0}
                                                totalSalesCount={displayData?.totalSalesCount ?? 0}
                                                loading={loading}
                                            />
                                        </div>
                                    </TutorialStep>
                                </ShowWrapper>
                                <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueOrders}>
                                    <TutorialStep step={5} currentStep={tutorialStep} text="Track your order journey from upcoming to completed." onNext={() => next(6)} onSkip={skip}>
                                        <div ref={setTutorialRef(5)} className="h-full [&>*]:h-full">
                                            <OrderTimeline
                                                isDataVisible={effectiveDataVisible}
                                                orderCounts={displayData?.orderCounts ?? {}}
                                                loading={loading}
                                            />
                                        </div>
                                    </TutorialStep>
                                </ShowWrapper>
                            </div>

                            {/* ── Row 3: Three equal columns ──────────────── */}
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueSalesbarchart}>
                                    <TutorialStep step={6} currentStep={tutorialStep} text="This bar chart shows your order sales performance over the selected date range." onNext={() => next(7)} onSkip={skip}>
                                        <div ref={setTutorialRef(6)} className="h-full [&>*]:h-full">
                                            <OrderBarChartReport
                                                isDataVisible={effectiveDataVisible}
                                                chartData={displayData?.chartData ?? []}
                                                totalSales={displayData?.totalSalesAmount ?? 0}
                                                totalBills={displayData?.totalSalesCount ?? 0}
                                                loading={loading}
                                            />
                                        </div>
                                    </TutorialStep>
                                </ShowWrapper>
                                <TutorialStep
                                    step={7}
                                    currentStep={tutorialStep}
                                    isLast={true}
                                    text="See your top selling items by quantity and amount."
                                    onNext={async () => {
                                        if (!currentUser?.companyId) return;
                                        await setDoc(
                                            doc(db, 'companies', currentUser.companyId, 'settings', 'tutorial'),
                                            { catalogueTutorialDone: true },
                                            { merge: true }
                                        );
                                        setTutorialStep(0);
                                        window.dispatchEvent(new Event("catalogue_tutorial_done"));
                                    }}
                                    onSkip={skip}
                                >
                                    <ShowWrapper requiredPermission={Cata_Permissions.ViewTopSoldItems}>
                                        <div ref={setTutorialRef(7)} className="h-full [&>*]:h-full">
                                            <TopSoldItemsCard
                                                isDataVisible={effectiveDataVisible}
                                                topByQuantity={displayData?.topByQuantity ?? []}
                                                topByAmount={displayData?.topByAmount ?? []}
                                                loading={loading}
                                            />
                                        </div>
                                    </ShowWrapper>
                                </TutorialStep>

                                {/* Coming Soon placeholder */}
                                <div className="relative flex min-h-[160px] cursor-not-allowed items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/60 p-4 shadow-sm">
                                    <span className="absolute top-3 right-3 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                                        Coming Soon
                                    </span>
                                    <div className="text-center">
                                        <h3 className="text-sm font-semibold text-muted-foreground">Restock Alerts</h3>
                                        <p className="text-xs text-muted-foreground">Feature under development</p>
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