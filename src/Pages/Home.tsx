import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
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
import { CACHE_DURATION } from '../lib/fetchDashboardData';
import useTutorial from '../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../Catalogue/hooks/useCompleteTutorial';


export interface SmartMetric { name: string; amount: number; quantity: number; }

interface DashboardData {
  totalSales: number;
  totalOrders: number;
  percentageChange: number;
  salesByDate: {
    name: string;
    sales: number;
    previousSales: number;
    count: number;
    qty?: number;
    quantity?: number;
    bills?: number;
    Bills?: number;
  }[];
  paymentMethods: SmartMetric[];
  topItems: SmartMetric[];
  topCustomers: SmartMetric[];
  topSalesmen: SmartMetric[];
  lastUpdated: number;
  cacheStart?: string;
  cacheEnd?: string;
}

const cleanString = (str: string) => {
  if (!str) return 'N/A';
  return str.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const parseNum = (val: any): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const clean = String(val).replace(/,/g, '').replace(/[^0-9.-]+/g, "");
  return Number(clean) || 0;
};

const getSafeDate = (val: any): Date | null => {
  if (!val) return null;
  if (val.toDate) return val.toDate();
  if (val.seconds) return new Date(val.seconds * 1000);
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  return null;
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
      } catch { } finally { setLoading(false); }
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

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
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

  const showBadge = daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0;
  const isUrgent = daysRemaining !== null && daysRemaining <= 2;
  const hasCataloguePermission = currentUser?.permissions?.includes(Permissions.ViewCatalogue);
  const currentItem = SiteItems.find(item => item.to === location.pathname);
  const currentLabel = currentItem ? currentItem.label : 'Dashboard';

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!currentUser?.companyId || !filters.startDate || !filters.endDate) {
      setLoading(false);
      return;
    }
    if (!forceRefresh) setLoading(true);
    const CACHE_KEY = `dashboard_cache_${currentUser.companyId}`;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!forceRefresh && cached) {
        const parsed = JSON.parse(cached);
        const isTimeValid = (Date.now() - parsed.lastUpdated < CACHE_DURATION);
        const isDateValid = parsed.cacheStart === filters.startDate && parsed.cacheEnd === filters.endDate;
        if (isTimeValid && isDateValid) { setData(parsed); setLoading(false); return; }
      }

      const start = new Date(filters.startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(filters.endDate); end.setHours(23, 59, 59, 999);
      const duration = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - duration);

      const salesRef = collection(db, 'companies', currentUser.companyId, 'sales');
      const usersRef = collection(db, 'companies', currentUser.companyId, 'users');
      const qSales = query(salesRef, where('createdAt', '>=', prevStart), where('createdAt', '<=', end), orderBy('createdAt', 'desc'));
      const [snapSales, snapUsers] = await Promise.all([getDocs(qSales), getDocs(usersRef)]);

      const currentSalesMap: Record<string, { amount: number, count: number }> = {};
      const paymentMap: Record<string, { amount: number, count: number }> = {};
      const itemMap: Record<string, { amount: number, count: number }> = {};
      const customerMap: Record<string, { amount: number, count: number }> = {};
      const salesmanMap: Record<string, { amount: number, count: number }> = {};
      let currentTotalSales = 0, currentOrderCount = 0, prevTotalSales = 0;

      const validSalesmen = new Set<string>();
      snapUsers.docs.forEach(doc => {
        const u = doc.data();
        if ((u.role || '').toLowerCase() === 'salesman' && u.name) validSalesmen.add(u.name.toLowerCase().trim());
      });

      snapSales.docs.forEach(doc => {
        const d = doc.data();
        const saleDate = getSafeDate(d.createdAt);
        if (!saleDate) return;
        const amount = parseNum(d.totalAmount || d.total || d.amount || d.grandTotal || 0);
        const offset = saleDate.getTimezoneOffset() * 60000;
        const dateKey = new Date(saleDate.getTime() - offset).toISOString().split('T')[0];
        if (!currentSalesMap[dateKey]) currentSalesMap[dateKey] = { amount: 0, count: 0 };
        currentSalesMap[dateKey].amount += amount;
        currentSalesMap[dateKey].count++;

        if (saleDate >= start && saleDate <= end) {
          currentTotalSales += amount;
          currentOrderCount++;
          if (d.paymentMethods && typeof d.paymentMethods === 'object') {
            const methods = Object.entries(d.paymentMethods).map(([key, val]) => ({ key: cleanString(key), amt: parseNum(val) })).filter(m => m.amt > 0);
            if (methods.length > 0) {
              const totalTendered = methods.reduce((sum, m) => sum + m.amt, 0);
              let change = totalTendered > amount ? totalTendered - amount : 0;
              methods.forEach(m => {
                let finalAmt = m.amt;
                if (change > 0 && m.key.toLowerCase() === 'cash') { const deduct = Math.min(finalAmt, change); finalAmt -= deduct; change -= deduct; }
                if (change > 0) { const deduct = Math.min(finalAmt, change); finalAmt -= deduct; change -= deduct; }
                if (finalAmt > 0) { if (!paymentMap[m.key]) paymentMap[m.key] = { amount: 0, count: 0 }; paymentMap[m.key].amount += finalAmt; paymentMap[m.key].count++; }
              });
            }
          }
          let cust = d.partyName || d.customerName || d.customer || 'N/A';
          if (typeof cust === 'object' && cust.name) cust = cust.name;
          if (!customerMap[cust]) customerMap[cust] = { amount: 0, count: 0 };
          customerMap[cust].amount += amount; customerMap[cust].count++;

          let sm = d.salesmanName || d.salesman || 'Admin';
          if (typeof sm === 'object' && sm.name) sm = sm.name;
          if (!salesmanMap[sm]) salesmanMap[sm] = { amount: 0, count: 0 };
          salesmanMap[sm].amount += amount; salesmanMap[sm].count++;

          if (Array.isArray(d.items)) {
            d.items.forEach((item: any) => {
              const name = item.name || item.itemName;
              if (name) {
                const qty = parseNum(item.quantity || item.qty || 1);
                let val = parseNum(item.finalPrice || item.totalAmount || item.total || item.amount);
                if (val === 0) { const price = parseNum(item.mrp || item.price || item.rate || item.sellingPrice || 0); val = price * qty; }
                if (!itemMap[name]) itemMap[name] = { amount: 0, count: 0 };
                itemMap[name].amount += val; itemMap[name].count += qty;
              }
            });
          }
        }
        if (saleDate >= prevStart && saleDate <= prevEnd) prevTotalSales += amount;
      });

      let percentageChange = 0;
      if (prevTotalSales > 0) percentageChange = ((currentTotalSales - prevTotalSales) / prevTotalSales) * 100;
      else if (currentTotalSales > 0) percentageChange = 100;

      const chartData = [];
      // FIX 1: Restored to prevStart so the chart has a starting dot to draw the line
      const itr = new Date(start);

      while (itr <= end) {
        const offset = itr.getTimezoneOffset() * 60000;
        const key = new Date(itr.getTime() - offset).toISOString().split('T')[0];
        const label = itr.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });

        const countVal = currentSalesMap[key]?.count || 0;

        chartData.push({
          name: label,
          sales: currentSalesMap[key]?.amount || 0,
          count: countVal,
          // FIX 2: Pass all possible variations of the count key to ensure the chart reads it
          quantity: countVal,
          qty: countVal,
          bills: countVal,
          Bills: countVal,
          previousSales: 0
        });

        itr.setDate(itr.getDate() + 1);
      }

      const toList = (map: any) => Object.entries(map).map(([name, v]: [string, any]) => ({ name, amount: v.amount, quantity: v.count })).sort((a, b) => b.amount - a.amount).slice(0, 5);
      const topSalesmen = Object.entries(salesmanMap).filter(([name]) => validSalesmen.has(name.toLowerCase().trim())).map(([name, v]: [string, any]) => ({ name, amount: v.amount, quantity: v.count })).sort((a, b) => b.amount - a.amount).slice(0, 5);

      const finalData = { totalSales: currentTotalSales, totalOrders: currentOrderCount, percentageChange, salesByDate: chartData, paymentMethods: toList(paymentMap), topItems: toList(itemMap), topCustomers: toList(customerMap), topSalesmen, lastUpdated: Date.now(), cacheStart: filters.startDate, cacheEnd: filters.endDate };
      setData(finalData);
      localStorage.setItem(CACHE_KEY, JSON.stringify(finalData));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [currentUser, filters]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const handleRefresh = () => fetchData(true);

  const formattedLastUpdated = useMemo(() => {
    if (!data?.lastUpdated) return 'Never';
    return new Date(data.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [data]);

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
    <div className="flex min-h-screen w-full flex-col bg-gray-100">
      {showBadge && (
        <div className={`w-full text-center py-2 text-sm font-bold text-white shadow-sm transition-colors duration-300 ${isUrgent ? 'bg-red-300' : 'bg-amber-200'}`}>
          <ShinyText text={`Subscription expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}.`} speed={4} delay={0} color="#030303" shineColor="#faf5f5" spread={100} direction="left" yoyo={false} pauseOnHover={false} disabled={false} />
          <Link to="/subscription" className="text-black ml-2 underline hover:text-gray-100">Renew Now</Link>
        </div>
      )}

      <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-2">
        {/* Step 1 — POS/Catalogue switch button */}
        <TutorialStep step={1} currentStep={tutorialStep} text="Use this menu to switch between POS and Catalogue views." onNext={() => next(2)} onSkip={skip} mobileArrowAlign="left" >
          <div ref={setTutorialRef(1)} className="relative inline-block">
            <button
              disabled={!hasCataloguePermission}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`flex w-20 items-center justify-between gap-2 rounded-sm border border-slate-400 p-2 text-sm font-medium text-slate-700 transition-colors ${!hasCataloguePermission ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'hover:bg-slate-200 cursor-pointer'}`}
            >
              <span className="font-medium">{currentLabel}</span>
              <IconChevronDown width={16} height={16} className={`transition-transform ${isMenuOpen ? 'rotate-180' : 'rotate-0'}`} />
            </button>
            {isMenuOpen && hasCataloguePermission && (
              <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-300 rounded-md shadow-lg z-10">
                <ul className="py-1">
                  {SiteItems.map(({ to, label }) => (
                    <li key={to}>
                      <Link to={to} onClick={() => setIsMenuOpen(false)} className={`flex w-full items-center gap-3 px-4 py-2 text-sm font-medium ${location.pathname === to ? 'bg-gray-500 text-white' : 'text-slate-700 hover:bg-gray-100'}`}>{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </TutorialStep>

        <div className="flex-1 text-center flex flex-col items-center justify-center">
          <h1 className="text-3xl font-bold text-slate-800 pl-8">Dashboard</h1>
          <p className="text-sm text-slate-500 pl-8">{nameLoading ? '...' : businessName}</p>
        </div>

        {/* Step 2 — Eye / hide button and Notification Bell */}
        <div className="flex items-center gap-3 justify-end">
          <div className="relative border border-slate-300 rounded-sm p-2 bg-gray-100 shadow-sm">
            <NotificationBell />
          </div>

          <ShowWrapper requiredPermission={Permissions.ViewHidebutton}>
            <TutorialStep step={2} currentStep={tutorialStep} text="Toggle this to show or hide sensitive sales figures." onNext={() => next(3)} onSkip={skip}>
              <button ref={setTutorialRef(2)} onClick={() => setIsDataVisible(!isDataVisible)} className="p-2 rounded-sm border border-slate-400 hover:bg-slate-200 transition-colors">
                {isDataVisible ? <IconEye width={24} height={24} /> : <IconEyeOff width={24} height={24} />}
              </button>
            </TutorialStep>
          </ShowWrapper>
        </div>
      </header>

      <main ref={mainRef} className="flex-grow overflow-y-auto p-2 sm:p-2 relative">
        <ShowWrapper requiredPermission={Permissions.ViewHidebutton}>
          <div className="flex justify-center gap-2">
            <p className="text-sm text-slate-500 flex items-center">Last Updated: {formattedLastUpdated}</p>
            <button onClick={handleRefresh} className={`p-1 rounded-full hover:bg-slate-200 text-slate-600 transition-all ${loading ? 'animate-spin' : ''}`}>
              {loading ? <FiLoader size={14} /> : <FiRefreshCw size={14} />}
            </button>
          </div>
        </ShowWrapper>

        <div className="mx-auto max-w-7xl relative">

          {/* Step 3 — Filter */}
          <ShowWrapper requiredPermission={Permissions.ViewFilter}>
            <TutorialStep step={3} currentStep={tutorialStep} text="Use these filters to select the date range for your dashboard data." onNext={() => next(4)} onSkip={skip}>
              <div ref={setTutorialRef(3)} className="mb-2">
                <FilterControls />
              </div>
            </TutorialStep>
          </ShowWrapper>

          {loading && !data ? (
            <div className="flex h-64 items-center justify-center text-slate-500"><FiLoader className="animate-spin mr-2" /> Loading Dashboard...</div>
          ) : (
            <>
              <div className="space-y-2 pb-30">

                {/* ── ROW 1: Sales Card + Daily Performance Bar Chart ── */}
                <div className="grid grid-cols-1 md:grid-cols-10 gap-2 items-stretch md:[direction:ltr]">
                  {/* Step 4 — Sales Card */}
                  <TutorialStep step={4} currentStep={tutorialStep} text="This is your Sales Card. It shows total sales and overall performance for the selected period." onNext={() => next(5)} onSkip={skip}>
                    <div ref={setTutorialRef(4)} className="order-1 h-full min-h-0 md:col-span-4 md:order-1">
                      <ShowWrapper requiredPermission={Permissions.ViewSalescard}>
                        <div className="h-full min-h-0 [&>*]:h-full">
                          <SalesCard isDataVisible={isDataVisible} totalSales={Math.ceil(data?.totalSales || 0)} percentageChange={data?.percentageChange || 0} />
                        </div>
                      </ShowWrapper>
                    </div>
                  </TutorialStep>

                  {/* Step 5 — Daily Performance Bar Chart */}
                  <TutorialStep step={5} currentStep={tutorialStep} text="This bar chart shows your daily sales performance over the selected date range." onNext={() => next(6)} onSkip={skip}>
                    <div ref={setTutorialRef(5)} className="order-2 h-full min-h-0 md:col-span-6 md:order-2">
                      <ShowWrapper requiredPermission={Permissions.ViewSalesbarchart}>
                        <div className="h-full min-h-0 [&>*]:h-full">
                          <SalesBarChartReport isDataVisible={isDataVisible} data={data?.salesByDate || []} />
                        </div>
                      </ShowWrapper>
                    </div>
                  </TutorialStep>
                </div>

                {/* ── ROW 2: Top 5 Items, Top Salesperson, Top Customers ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 items-stretch">
                  {/* Step 6 — Top 5 Items */}
                  <TutorialStep step={6} currentStep={tutorialStep} text="See your top 5 best-selling items by revenue for the selected period." onNext={() => next(7)} onSkip={skip}>
                    <div ref={setTutorialRef(6)} className="h-full [&>*]:h-full">
                      <ShowWrapper requiredPermission={Permissions.ViewTopSoldItems}>
                        <TopSoldItemsCard isDataVisible={isDataVisible} items={data?.topItems || []} />
                      </ShowWrapper>
                    </div>
                  </TutorialStep>

                  {/* Step 7 — Top Salesperson */}
                  <TutorialStep step={7} currentStep={tutorialStep} text="Track your top 5 performing salespeople ranked by total sales amount." onNext={() => next(8)} onSkip={skip}>
                    <div ref={setTutorialRef(7)} className="h-full [&>*]:h-full">
                      <ShowWrapper requiredPermission={Permissions.ViewTopSalesperson}>
                        <TopSalespersonCard isDataVisible={isDataVisible} salesmen={data?.topSalesmen || []} />
                      </ShowWrapper>
                    </div>
                  </TutorialStep>

                  {/* Step 8 — Top Customers */}
                  <TutorialStep step={8} currentStep={tutorialStep} text="Your top 5 customers by purchase value. Great for identifying your most loyal buyers." onNext={() => next(9)} onSkip={skip}>
                    <div ref={setTutorialRef(8)} className="h-full [&>*]:h-full">
                      <ShowWrapper requiredPermission={Permissions.ViewTopCustomers}>
                        <TopEntitiesList isDataVisible={isDataVisible} titleOverride="Top Customers" items={data?.topCustomers || []} />
                      </ShowWrapper>
                    </div>
                  </TutorialStep>
                </div>

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
                        <PaymentChart isDataVisible={isDataVisible} data={data?.paymentMethods || []} />
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