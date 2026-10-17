import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
//import { Link } from 'react-router-dom';
import { db } from '../lib/Firebase';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { DateChips, FilterProvider, useFilter } from '../Components/Filter';
//import { Permissions } from '../enums';
//import { SiteItems } from '../routes/SiteRoutes';
import { OrderTimeline } from '../Components/OrderTimeline';
// import { RestockAlertsCard } from '../Components/RestockItems';
import { CatalogueKpiRow } from '../Components/Cataloguekpirow';
import { CatalogueSalesByWeek } from '../Components/OrderSalesGraph';
import { CatalogueTopItems } from '../Components/TopFiveOrder';
import { CatalogueRestockSoon } from '../Components/RestockItems';
import { Ico, ICONS } from '../Components/ui/Catalogueui';
//import { IconChevronDown } from '../constants/Icons';
import { FiRefreshCw, FiLoader, FiShare2 } from 'react-icons/fi';
import { fetchDashboardData, CACHE_DURATION } from '../lib/fetchDashboardData';
//import ShinyText from '../Components/ShinyText';
import type { WithCacheMeta } from '../lib/fetchDashboardData';
//import NotificationBell from '../Components/NotificationBell';
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
const getSampleChartData = (): ChartDataPoint[] => {
    const sales = [4200, 5600, 3100, 6800, 4900, 7200, 4700];
    const bills = [10, 13, 8, 16, 12, 17, 8];
    const today = new Date();

    return sales.map((amount, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (sales.length - 1 - i)); // last 7 days ending today
        return {
            date: d.toLocaleDateString('en-CA'), // matches YYYY-MM-DD key used elsewhere
            sales: amount,
            bills: bills[i],
        };
    });
};
const SAMPLE_CATALOGUE_DATA: CatalogueDashboardData = {
    totalSalesAmount: 36500,
    totalSalesCount: 84,
    chartData: getSampleChartData(),
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

    // Tell the layout strip which step is active (step 1 is rendered there now)
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('tutorial_step_change', { detail: { step: tutorialStep } }));
    }, [tutorialStep]);

    // Reset the layout's tutorial when leaving this page
    useEffect(() => {
        return () => {
            window.dispatchEvent(new CustomEvent('tutorial_step_change', { detail: { step: 0 } }));
        };
    }, []);

    // Next / Skip pressed on the layout's switcher tutorial (step 1)
    useEffect(() => {
        const onNext = () => next(2);
        const onSkip = () => skip();
        window.addEventListener('tutorial_switcher_next', onNext);
        window.addEventListener('tutorial_switcher_skip', onSkip);
        return () => {
            window.removeEventListener('tutorial_switcher_next', onNext);
            window.removeEventListener('tutorial_switcher_skip', onSkip);
        };
    }, [currentUser]);

    // Same link CatalogueLayout shares: custom subdomain if set, else /catalogue/:companyId
    const [storeLink, setStoreLink] = useState(`${window.location.origin}/catalogue/${currentUser?.companyId}`);

    useEffect(() => {
        const fetchStoreLink = async () => {
            if (!currentUser?.companyId) return;
            try {
                const snap = await getDoc(doc(db, 'companies', currentUser.companyId));
                const subdomain = snap.exists() ? snap.data().subdomain : null;
                if (subdomain) setStoreLink(`https://${subdomain}.sellar.in`);
            } catch (e) {
                console.error('Error fetching store link:', e);
            }
        };
        fetchStoreLink();
    }, [currentUser?.companyId]);

    const [isDataVisible, setIsDataVisible] = useState<boolean>(false);
    const isHeaderLoading = authLoading || nameLoading;

    const [data, setData] = useState<WithCacheMeta<CatalogueDashboardData> | null>(null);
    const [loading, setLoading] = useState(true);

    const sampleData = useMemo(
        () => ({ ...SAMPLE_CATALOGUE_DATA, chartData: getSampleChartData() }),
        []
    );
    const displayData = isTutorialActive ? sampleData : data;
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
                        // Read the total exactly as it was saved on the order (checkout/edit
                        // time), same as OrderCard — never recomputed from the company's
                        // *current* tax settings, which can drift from what was true when the
                        // bill was actually made.
                        if (status === 'Upcoming') return;
                        const effectiveAmount = Number(o.totalAmount) || Number(o.grandTotal) || 0;

                        totalSalesAmount += effectiveAmount;
                        totalSalesCount += 1;

                        if (salesByDate[dateKey]) {
                            salesByDate[dateKey].sales += effectiveAmount;
                            salesByDate[dateKey].bills += 1;
                        }

                        // 3. Calculate Item Stats irrespective of status
                        // Uses item.finalPrice as saved at checkout/edit time — the
                        // tax-INCLUSIVE line total, matching the order's displayed total
                        // (Order.totalAmount) and the "Completed Sales" figure above.
                        if (Array.isArray(o.items)) {
                            o.items.forEach((item: any) => {
                                // Group by the stable catalog product id (itemId), not item.id —
                                // items added to an order via the edit modal get a fresh random
                                // item.id each time (see useOrderEditor.ts's addSelectedItemToOrder),
                                // so keying by item.id alone was splitting one product's totals
                                // across multiple entries instead of summing them.
                                const key = item.itemId || item.id;
                                if (!key || !item.name) return;
                                const quantity = Number(item.quantity || 0);
                                const finalPrice = Number(item.finalPrice ?? item.taxableAmount ?? 0);
                                const cur = itemStats.get(key) || { name: item.name, totalQuantity: 0, totalAmount: 0 };
                                itemStats.set(key, {
                                    name: item.name,
                                    totalQuantity: cur.totalQuantity + quantity,
                                    totalAmount: cur.totalAmount + finalPrice,
                                });
                            });
                        }
                    });

                    const chartData: ChartDataPoint[] = Object.entries(salesByDate).map(([date, v]) => ({
                        date, sales: v.sales, bills: v.bills,
                    }));
                    const allItems: TopItem[] = Array.from(itemStats.entries()).map(([id, v]) => ({
                        id,
                        ...v,
                        totalAmount: Math.round(v.totalAmount),
                    }));
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

    // Share catalogue: opens the same popup as the layout's Share button
    const handleShareCatalogue = () => {
        window.dispatchEvent(new CustomEvent('open-catalogue-share', { detail: { link: storeLink } }));
    };

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
        <div className="flex min-h-screen w-full flex-col bg-[#fff5ec] mb-16">

            {/* ── Page head: title + "Updated" line on the left, hide-figures on the right ── */}
            <header className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-3 px-4 pt-5 pb-4 md:px-6">
                <div className="min-w-0 flex-1 md:min-w-[260px]">
                    <h1 className="m-0 text-xl font-semibold leading-8 tracking-tight text-slate-900 sm:text-2xl">Dashboard</h1>
                    <p className="m-0 flex flex-wrap items-center text-[13px] text-slate-600">
                        <span>{isHeaderLoading ? '...' : businessName} · Catalogue</span>
                        <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueFilter}>
                            <span className="ml-1 inline-flex items-center">
                                · Updated {formattedLastUpdated}
                                <button
                                    onClick={handleRefresh}
                                    aria-label="Refresh"
                                    className={`ml-1 inline-grid h-8 w-8 place-items-center rounded-sm text-slate-600 transition-colors hover:bg-[#fff8f2] hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 ${loading ? 'animate-spin' : ''}`}
                                >
                                    {loading ? <FiLoader size={14} /> : <FiRefreshCw size={14} />}
                                </button>
                            </span>
                        </ShowWrapper>
                    </p>
                </div>

                <div className="flex items-center gap-2 md:ml-auto">
                    {/* <ShowWrapper requiredPermission={Cata_Permissions.ViewNotification}>
                        <div className="hidden sm:flex border border-slate-300 rounded-sm bg-gray-100 shadow-sm">
                            <NotificationBell />
                        </div>
                    </ShowWrapper> */}
                    <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueHidebutton}>
                        <TutorialStep step={2} currentStep={tutorialStep} text="Toggle this to show or hide sensitive sales figures." onNext={() => next(3)} onSkip={skip}>
                            <button
                                onClick={() => setIsDataVisible(!isDataVisible)}
                                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-slate-400 bg-white px-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-[#fff8f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 sm:px-4"
                                title={isDataVisible ? 'Hide Data' : 'Show Data'}
                                aria-label={isDataVisible ? 'Hide figures' : 'Show figures'}
                            >
                                <Ico d={isDataVisible ? ICONS.eye : ICONS.eyeOff} size={16} />
                                <span className="hidden sm:inline">{isDataVisible ? 'Hide figures' : 'Show figures'}</span>
                            </button>
                        </TutorialStep>
                    </ShowWrapper>

                    {/* Share catalogue — primary on desktop, icon-only on mobile */}
                    <button
                        onClick={handleShareCatalogue}
                        aria-label="Share catalogue"
                        className="inline-flex h-10 w-10 items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-slate-400 bg-white text-sm font-medium text-slate-900 transition-colors hover:bg-[#fff8f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 md:w-auto md:border-transparent md:bg-orange-700 md:px-4 md:text-white md:hover:bg-orange-800"
                    >
                        <FiShare2 size={16} />
                        <span className="hidden md:inline">Share catalogue</span>
                    </button>
                </div>
            </header>

            {/* ── Main Content ─────────────────────────────────────────────── */}
            <main ref={mainRef} className="flex-grow overflow-y-auto px-4 md:px-6">
                <div className="mx-auto max-w-7xl relative">

                    {/* Date filter chips (no Apply button) */}
                    <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueFilter}>
                        <TutorialStep step={3} currentStep={tutorialStep} text="Use these filters to select the date range for your dashboard data." onNext={() => next(4)} onSkip={skip}>
                            <div ref={setTutorialRef(3)} className="mb-3 md:mb-5">
                                <DateChips compare={false} />
                            </div>
                        </TutorialStep>
                    </ShowWrapper>

                    {/* Full-page loader shown only on the very first load */}
                    {(loading && !data && !isTutorialActive) ? (
                        <div className="flex h-64 items-center justify-center text-slate-500">
                            <FiLoader className="animate-spin mr-2" /> Loading Dashboard...
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4 sm:gap-5 pb-5">

                            {/* ── KPI tiles ── */}
                            <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueSalesbarchart}>
                                <TutorialStep step={4} currentStep={tutorialStep} text="This shows your total completed sales for the selected period." onNext={() => next(5)} onSkip={skip}>
                                    <div ref={setTutorialRef(4)}>
                                        <CatalogueKpiRow
                                            isDataVisible={effectiveDataVisible}
                                            totalSalesAmount={displayData?.totalSalesAmount ?? 0}
                                            totalSalesCount={displayData?.totalSalesCount ?? 0}
                                            orderCounts={displayData?.orderCounts ?? {}}
                                            loading={loading}
                                        />
                                    </div>
                                </TutorialStep>
                            </ShowWrapper>

                            {/* ── Order journey (full width) ── */}
                            <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueOrders}>
                                <TutorialStep step={5} currentStep={tutorialStep} text="Track your order journey from upcoming to completed." onNext={() => next(6)} onSkip={skip}>
                                    <div ref={setTutorialRef(5)}>
                                        <OrderTimeline
                                            isDataVisible={effectiveDataVisible}
                                            orderCounts={displayData?.orderCounts ?? {}}
                                            loading={loading}
                                        />
                                    </div>
                                </TutorialStep>
                            </ShowWrapper>

                            {/* ── Sales by week · Top items · Restock (soon) ── */}
                            <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr]">
                                <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueSalesbarchart}>
                                    <TutorialStep step={6} currentStep={tutorialStep} text="This chart shows your sales performance over the selected date range." onNext={() => next(7)} onSkip={skip}>
                                        <div ref={setTutorialRef(6)} className="h-full [&>*]:h-full md:col-span-2 xl:col-span-1">
                                            <CatalogueSalesByWeek
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
                                            <CatalogueTopItems
                                                isDataVisible={effectiveDataVisible}
                                                topByQuantity={displayData?.topByQuantity ?? []}
                                                topByAmount={displayData?.topByAmount ?? []}
                                                loading={loading}
                                            />
                                        </div>
                                    </ShowWrapper>
                                </TutorialStep>

                                <CatalogueRestockSoon />
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