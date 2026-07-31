import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { useAuth } from '../context/auth-context';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions } from '../enums';
import { SiteItems } from '../routes/SiteRoutes';
import { IconChevronDown, IconEye, IconEyeOff } from '../constants/Icons';
import { FiRefreshCw, FiLoader } from 'react-icons/fi';
import { FilterProvider, FilterControls, useFilter } from '../Components/Filter';
import { AttendancePage } from '../Components/AttendaceCard';
import { SalesBarChartReport } from '../Components/SalesBarGraph';
import { SalesCard } from '../Components/SalesCard';
import { TopSoldItemsCard } from '../Components/TopFiveItemCard';
import { TopSalespersonCard } from '../Components/TopSalesCard';
import { PaymentChart } from '../Components/PaymentChart';
import { TopEntitiesList } from '../Components/TopFiveEntities';
import { TutorialStep } from '../Components/TutorialStep';
import ShinyText from '../Components/ShinyText';
import NotificationBell from '../Components/NotificationBell';
import { Skeleton } from '../Components/ui/skeleton';
import { StatCard } from '../Components/ui/stat-card';
import { Receipt, Wallet, TrendingUp } from 'lucide-react';
import { useDashboard } from '../features/dashboard';
import type { DashboardData } from '../features/dashboard';
import useTutorial from '../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../Catalogue/hooks/useCompleteTutorial';



const SAMPLE_DASHBOARD_DATA: DashboardData = {
  totalSales: 48250,
  totalOrders: 132,
  percentageChange: 12.4,
  salesByDate: [
    { name: '01/07', sales: 5200, previousSales: 0, count: 14, qty: 14, quantity: 14, bills: 14, Bills: 14 },
    { name: '02/07', sales: 7100, previousSales: 0, count: 19, qty: 19, quantity: 19, bills: 19, Bills: 19 },
    { name: '03/07', sales: 4300, previousSales: 0, count: 11, qty: 11, quantity: 11, bills: 11, Bills: 11 },
    { name: '04/07', sales: 8900, previousSales: 0, count: 23, qty: 23, quantity: 23, bills: 23, Bills: 23 },
    { name: '05/07', sales: 6400, previousSales: 0, count: 17, qty: 17, quantity: 17, bills: 17, Bills: 17 },
    { name: '06/07', sales: 9800, previousSales: 0, count: 26, qty: 26, quantity: 26, bills: 26, Bills: 26 },
    { name: '07/07', sales: 6550, previousSales: 0, count: 18, qty: 18, quantity: 18, bills: 18, Bills: 18 },
  ],
  paymentMethods: [
    { name: 'Cash', amount: 21000, quantity: 58 },
    { name: 'Card', amount: 15250, quantity: 41 },
    { name: 'UPI', amount: 12000, quantity: 33 },
  ],
  topItems: [
    { name: 'Sample Item A', amount: 9800, quantity: 45 },
    { name: 'Sample Item B', amount: 7600, quantity: 32 },
    { name: 'Sample Item C', amount: 6200, quantity: 28 },
    { name: 'Sample Item D', amount: 5100, quantity: 21 },
    { name: 'Sample Item E', amount: 4300, quantity: 18 },
  ],
  topCustomers: [
    { name: 'Sample Customer 1', amount: 8200, quantity: 12 },
    { name: 'Sample Customer 2', amount: 6900, quantity: 9 },
    { name: 'Sample Customer 3', amount: 5400, quantity: 7 },
    { name: 'Sample Customer 4', amount: 4100, quantity: 6 },
    { name: 'Sample Customer 5', amount: 3300, quantity: 5 },
  ],
  topSalesmen: [
    { name: 'Sample Salesperson 1', amount: 15200, quantity: 40 },
    { name: 'Sample Salesperson 2', amount: 11800, quantity: 31 },
    { name: 'Sample Salesperson 3', amount: 9400, quantity: 24 },
  ],
  lastUpdated: Date.now(),
};
const useBusinessName = () => {
  const [businessName, setBusinessName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser?.companyId) { setLoading(false); return; }
    const fetchBusinessInfo = async () => {
      try {
        const docRef = doc(db, 'companies', currentUser.companyId!, 'business_info', currentUser.companyId!);
        const docSnap = await getDoc(docRef);
        setBusinessName(docSnap.exists() ? docSnap.data().businessName : 'Business');
      } catch { /* ignore */ } finally { setLoading(false); }
    };
    fetchBusinessInfo();
  }, [currentUser]);
  return { businessName, loading };
};

// Total tutorial steps
const TOTAL_STEPS = 9;

const DashboardContent = () => {
  const { currentUser } = useAuth();
  const { businessName, loading: nameLoading } = useBusinessName();
  const { filters } = useFilter();

  const { data, isLoading: loading, isFetching, refetch, dataUpdatedAt } =
    useDashboard(currentUser?.companyId, filters.startDate, filters.endDate);
  const [isDataVisible, setIsDataVisible] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const location = useLocation();

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
    completeTutorial(currentUser, 'dashboardTutorialDone', setTutorialStep);
  };

  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);

  useEffect(() => {
    const fetchExpiry = async () => {
      if (!currentUser?.companyId) return;
      const ref = doc(db, 'companies', currentUser.companyId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const expiry = snap.data().expiryDate;
        if (!expiry) return;
        const d = expiry.toDate ? expiry.toDate() : new Date(expiry);
        const diff = d.getTime() - new Date().getTime();
        setDaysRemaining(Math.ceil(diff / (1000 * 60 * 60 * 24)));
      }
    };
    fetchExpiry();
  }, [currentUser?.companyId]);
  const isTutorialActive = tutorialStep > 0 && tutorialStep <= TOTAL_STEPS;
  const displayData = isTutorialActive ? SAMPLE_DASHBOARD_DATA : data;
  const effectiveDataVisible = isTutorialActive ? true : isDataVisible;
  const showBadge = daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0;
  const isUrgent = daysRemaining !== null && daysRemaining <= 2;
  const hasCataloguePermission = currentUser?.permissions?.includes(Permissions.ViewCatalogue);
  const currentItem = SiteItems.find(item => item.to === location.pathname);
  const currentLabel = currentItem ? currentItem.label : 'Dashboard';

  const handleRefresh = () => {
    void refetch();
  };

  const formattedLastUpdated = useMemo(() => {
    if (!dataUpdatedAt) return 'Never';
    return new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [dataUpdatedAt]);

  useTutorial(currentUser, setTutorialStep, 'dashboardTutorialDone');

  useEffect(() => {
    const checkTutorial = async () => {
      if (!currentUser?.companyId) return;
      const docRef = doc(db, 'companies', currentUser.companyId, 'settings', 'tutorial');
      const snap = await getDoc(docRef);
      const done = snap.exists() && snap.data()?.dashboardTutorialDone;
      if (!done) setTutorialStep(1);
    };
    checkTutorial();
  }, [currentUser]);

  return (
    <div className="aurora relative flex min-h-screen w-full flex-col bg-background">
      {showBadge && (
        <div className={`w-full text-center py-2 text-sm font-bold shadow-sm transition-colors duration-300 ${isUrgent ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground'}`}>
          <ShinyText text={`Subscription expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}.`} speed={4} delay={0} color="#030303" shineColor="#faf5f5" spread={100} direction="left" yoyo={false} pauseOnHover={false} disabled={false} />
          <Link to="/subscription" className="ml-2 underline underline-offset-2 hover:opacity-80">Renew Now</Link>
        </div>
      )}

      <header className="glass sticky top-0 z-20 mx-3 mt-3 flex flex-wrap flex-shrink-0 items-center justify-between gap-3 rounded-2xl p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Step 1 — POS/Catalogue switch button */}
          <TutorialStep step={1} currentStep={tutorialStep} text="Use this menu to switch between POS and Catalogue views." onNext={() => next(2)} onSkip={skip} mobileArrowAlign="left" >
            <div ref={setTutorialRef(1)} className="relative inline-block">
              <button
                disabled={!hasCataloguePermission}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className={`flex w-20 items-center justify-between gap-2 rounded-xl border border-border p-2 text-sm font-medium text-foreground transition-colors ${!hasCataloguePermission ? 'opacity-50 cursor-not-allowed bg-muted' : 'hover:bg-accent cursor-pointer'}`}
              >
                <span className="font-medium">{currentLabel}</span>
                <IconChevronDown width={16} height={16} className={`transition-transform ${isMenuOpen ? 'rotate-180' : 'rotate-0'}`} />
              </button>
              {isMenuOpen && hasCataloguePermission && (
                <div className="glass absolute top-full left-0 mt-2 w-56 rounded-xl shadow-lg z-10 overflow-hidden">
                  <ul className="py-1">
                    {SiteItems.map(({ to, label }) => (
                      <li key={to}>
                        <Link to={to} onClick={() => setIsMenuOpen(false)} className={`flex w-full items-center gap-3 px-4 py-2 text-sm font-medium ${location.pathname === to ? 'bg-gradient-brand text-white' : 'text-foreground hover:bg-accent'}`}>{label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </TutorialStep>

          {/* Step 3 — Filter */}
          <ShowWrapper requiredPermission={Permissions.ViewFilter}>
            <TutorialStep step={3} currentStep={tutorialStep} text="Use these filters to select the date range for your dashboard data." onNext={() => next(4)} onSkip={skip}>
              <div ref={setTutorialRef(3)}>
                <FilterControls />
              </div>
            </TutorialStep>
          </ShowWrapper>
        </div>

        <div className="flex-1 text-center flex flex-col items-center justify-center">
          <h1 className="text-gradient text-2xl font-bold pl-8">Dashboard</h1>
          <p className="text-sm text-muted-foreground pl-8">{nameLoading ? '...' : businessName}</p>
        </div>

        {/* Step 2 — Eye / hide button and Notification Bell */}
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <ShowWrapper requiredPermission={Permissions.ViewHidebutton}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
              Last updated: {formattedLastUpdated}
              <button onClick={handleRefresh} className={`text-muted-foreground hover:text-primary transition-all ${isFetching ? 'animate-spin' : ''}`}>
                {isFetching ? <FiLoader size={13} /> : <FiRefreshCw size={13} />}
              </button>
            </span>
          </ShowWrapper>
          <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
            <div className="relative flex items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
              <NotificationBell />
            </div>
          </ShowWrapper>
          <ShowWrapper requiredPermission={Permissions.ViewHidebutton}>
            <TutorialStep step={2} currentStep={tutorialStep} text="Toggle this to show or hide sensitive sales figures." onNext={() => next(3)} onSkip={skip}>
              <button ref={setTutorialRef(2)} onClick={() => setIsDataVisible(!isDataVisible)} className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                {isDataVisible ? <IconEye width={20} height={20} /> : <IconEyeOff width={20} height={20} />}
              </button>
            </TutorialStep>
          </ShowWrapper>
        </div>
      </header>

      <main ref={mainRef} className="flex-grow overflow-y-auto p-3 relative">
        <div className="mx-auto max-w-none relative">

          {(loading && !data && !isTutorialActive) ? (
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-10 gap-2">
                <Skeleton className="h-40 rounded-xl md:col-span-4" />
                <Skeleton className="h-40 rounded-xl md:col-span-6" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                <Skeleton className="h-56 rounded-xl" />
                <Skeleton className="h-56 rounded-xl" />
                <Skeleton className="h-56 rounded-xl" />
              </div>
              <Skeleton className="h-40 rounded-xl md:w-2/5" />
            </div>
          ) : (
            <>
              <div className="space-y-2 pb-30 animate-in fade-in-0 slide-in-from-bottom-3 duration-500">

                {/* ── KPI overview strip ── */}
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  <StatCard
                    label="Total Orders"
                    value={effectiveDataVisible ? (displayData?.totalOrders ?? 0).toLocaleString('en-IN') : '••••'}
                    icon={<Receipt />}
                    iconClassName="bg-primary/15 text-primary"
                  />
                  <StatCard
                    label="Avg Order Value"
                    value={effectiveDataVisible ? `₹${(displayData && displayData.totalOrders > 0 ? Math.round(displayData.totalSales / displayData.totalOrders) : 0).toLocaleString('en-IN')}` : '₹ ••••'}
                    icon={<Wallet />}
                    iconClassName="bg-info/15 text-info"
                  />
                  <StatCard
                    label="Growth"
                    value={effectiveDataVisible ? `${(displayData?.percentageChange ?? 0) >= 0 ? '+' : ''}${(displayData?.percentageChange ?? 0).toFixed(1)}%` : '••.•%'}
                    icon={<TrendingUp />}
                    iconClassName="bg-success/15 text-success"
                    className="col-span-2 md:col-span-1"
                  />
                </div>

                {/* ── ROW 1: Sales Card + Daily Performance Bar Chart ── */}
                <div className="grid grid-cols-1 md:grid-cols-10 gap-2 items-stretch md:[direction:ltr]">
                  {/* Step 4 — Sales Card */}
                  <TutorialStep step={4} currentStep={tutorialStep} text="This is your Sales Card. It shows total sales and overall performance for the selected period." onNext={() => next(5)} onSkip={skip}>
                    <div ref={setTutorialRef(4)} className="order-1 h-full min-h-0 md:col-span-4 md:order-1">
                      <ShowWrapper requiredPermission={Permissions.ViewSalescard}>
                        <div className="h-full min-h-0 [&>*]:h-full">
                          <SalesCard isDataVisible={effectiveDataVisible} totalSales={Math.ceil(displayData?.totalSales || 0)} percentageChange={displayData?.percentageChange || 0} />
                        </div>
                      </ShowWrapper>
                    </div>
                  </TutorialStep>

                  {/* Step 5 — Daily Performance Bar Chart */}
                  <TutorialStep step={5} currentStep={tutorialStep} text="This bar chart shows your daily sales performance over the selected date range." onNext={() => next(6)} onSkip={skip}>
                    <div ref={setTutorialRef(5)} className="order-2 h-full min-h-0 md:col-span-6 md:order-2">
                      <ShowWrapper requiredPermission={Permissions.ViewSalesbarchart}>
                        <div className="h-full min-h-0 [&>*]:h-full">
                          <SalesBarChartReport isDataVisible={effectiveDataVisible} data={displayData?.salesByDate || []} />
                        </div>
                      </ShowWrapper>
                    </div>
                  </TutorialStep>
                </div>

                <h2 className="flex items-center gap-2 px-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span className="bg-gradient-brand inline-block size-1.5 rounded-full" />Top performers</h2>

                {/* ── ROW 2: Top 5 Items, Top Salesperson, Top Customers ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 items-stretch">
                  {/* Step 6 — Top 5 Items */}
                  <TutorialStep step={6} currentStep={tutorialStep} text="See your top 5 best-selling items by revenue for the selected period." onNext={() => next(7)} onSkip={skip}>
                    <div ref={setTutorialRef(6)} className="h-full [&>*]:h-full">
                      <ShowWrapper requiredPermission={Permissions.ViewTopSoldItems}>
                        <TopSoldItemsCard isDataVisible={effectiveDataVisible} items={displayData?.topItems || []} />
                      </ShowWrapper>
                    </div>
                  </TutorialStep>

                  {/* Step 7 — Top Salesperson */}
                  <TutorialStep step={7} currentStep={tutorialStep} text="Track your top 5 performing salespeople ranked by total sales amount." onNext={() => next(8)} onSkip={skip}>
                    <div ref={setTutorialRef(7)} className="h-full [&>*]:h-full">
                      <ShowWrapper requiredPermission={Permissions.ViewTopSalesperson}>
                        <TopSalespersonCard isDataVisible={effectiveDataVisible} salesmen={displayData?.topSalesmen || []} />
                      </ShowWrapper>
                    </div>
                  </TutorialStep>

                  {/* Step 8 — Top Customers */}
                  <TutorialStep step={8} currentStep={tutorialStep} text="Your top 5 customers by purchase value. Great for identifying your most loyal buyers." onNext={() => next(9)} onSkip={skip}>
                    <div ref={setTutorialRef(8)} className="h-full [&>*]:h-full">
                      <ShowWrapper requiredPermission={Permissions.ViewTopCustomers}>
                        <TopEntitiesList isDataVisible={effectiveDataVisible} titleOverride="Top Customers" items={displayData?.topCustomers || []} />
                      </ShowWrapper>
                    </div>
                  </TutorialStep>
                </div>

                <h2 className="flex items-center gap-2 px-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span className="bg-gradient-brand inline-block size-1.5 rounded-full" />Payments</h2>

                {/* ── ROW 3: Payment Methods (full width) ── */}
                <TutorialStep
                  step={9}
                  currentStep={tutorialStep}
                  isLast={window.innerWidth >= 768}
                  text="This chart breaks down sales by payment method — cash, card, UPI, etc."
                  onNext={async () => {
                    if (!currentUser?.companyId) return;
                    await setDoc(
                      doc(db, 'companies', currentUser.companyId, 'settings', 'tutorial'),
                      { dashboardTutorialDone: true },
                      { merge: true }
                    );
                    setTutorialStep(0);
                    window.dispatchEvent(new Event("dashboard_tutorial_done"));
                  }}
                  onSkip={skip}
                >
                  <div ref={setTutorialRef(9)} className="grid grid-cols-1 md:grid-cols-10 gap-2">
                    <div className="md:col-span-4">
                      <ShowWrapper requiredPermission={Permissions.ViewPaymentmethods}>
                        <PaymentChart isDataVisible={effectiveDataVisible} data={displayData?.paymentMethods || []} />
                      </ShowWrapper>
                    </div>
                  </div>
                </TutorialStep>

                <ShowWrapper requiredPermission={Permissions.ViewAttendance}><AttendancePage /></ShowWrapper>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

const Home = () => (<FilterProvider><DashboardContent /></FilterProvider>);
export default Home;