import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs, doc, getDoc, setDoc, limit } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { useAuth } from '../context/auth-context';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions } from '../enums';
import { ROUTES } from '../constants/routes.constants';
import { FiRefreshCw, FiLoader, FiEye, FiEyeOff, FiPlus } from 'react-icons/fi';
import { FilterProvider, DateChips, useFilter } from '../Components/Filter';
import { AttendancePage } from '../Components/AttendaceCard';
import { SalesBarChartReport } from '../Components/SalesBarGraph';
import { KpiRow } from '../Components/Kpicards';
import { TopSoldItemsCard } from '../Components/TopFiveItemCard';
import { TopSalespersonCard } from '../Components/TopSalesCard';
import { PaymentChart } from '../Components/PaymentChart';
import { TopEntitiesList } from '../Components/TopFiveEntities';
import { TutorialStep } from '../Components/TutorialStep';
import { CACHE_DURATION } from '../lib/fetchDashboardData';
import useTutorial from '../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../Catalogue/hooks/useCompleteTutorial';

const NEW_SALE_ROUTE = ROUTES.SALES;
const ADD_USER_ROUTE = ROUTES.USER_ADD;

export interface SmartMetric { name: string; amount: number; quantity: number; }

interface DashboardData {
  totalSales: number;
  totalOrders: number;
  percentageChange: number;
  ordersChange: number;
  avgBill: number;
  avgChange: number;
  unpaidAmount: number;
  unpaidBills: number;
  salesByDate: { name: string; sales: number; previousSales: number; count: number; qty?: number; quantity?: number; bills?: number; Bills?: number; }[];
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

const SAMPLE_DASHBOARD_DATA: DashboardData = {
  totalSales: 48250,
  totalOrders: 132,
  percentageChange: 12.4,
  ordersChange: 9,
  avgBill: 366,
  avgChange: 3,
  unpaidAmount: 6350,
  unpaidBills: 8,
  salesByDate: [
    { name: '01 Jul', sales: 5200, previousSales: 0, count: 14 },
    { name: '02 Jul', sales: 7100, previousSales: 0, count: 19 },
    { name: '03 Jul', sales: 4300, previousSales: 0, count: 11 },
    { name: '04 Jul', sales: 8900, previousSales: 0, count: 23 },
    { name: '05 Jul', sales: 6400, previousSales: 0, count: 17 },
    { name: '06 Jul', sales: 9800, previousSales: 0, count: 26 },
    { name: '07 Jul', sales: 6550, previousSales: 0, count: 18 },
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
      } catch { } finally { setLoading(false); }
    };
    fetchBusinessInfo();
  }, [currentUser]);
  return { businessName, loading };
};

const TOTAL_STEPS = 9;

/*  Tutorial order (matches the new card placement)
    1 layout switcher · 2 Hide figures · 3 date filter · 4 KPI row
    5 Daily performance · 6 Payment methods
    7 Top items · 8 Top salespeople · 9 Top customers (last)          */

const DashboardContent = () => {
  const { currentUser } = useAuth();
  const { businessName, loading: nameLoading } = useBusinessName();
  const { filters } = useFilter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDataVisible, setIsDataVisible] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);

  const tutorialRefs = useRef<(HTMLElement | null)[]>([]);
  const mainRef = useRef<HTMLElement | null>(null);
  const setTutorialRef = (index: number) => (el: HTMLElement | null) => { tutorialRefs.current[index] = el; };

  useEffect(() => {
    if (tutorialStep === 0) return;
    const el = tutorialRefs.current[tutorialStep];
    if (!el) return;
    if (tutorialStep <= 2) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [tutorialStep]);

  const next = (n: number) => setTutorialStep(n <= TOTAL_STEPS ? n : 0);
  const skip = () => { completeTutorial(currentUser, 'dashboardTutorialDone', setTutorialStep); };

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('tutorial_step_change', { detail: { step: tutorialStep } }));
  }, [tutorialStep]);

  useEffect(() => {
    return () => { window.dispatchEvent(new CustomEvent('tutorial_step_change', { detail: { step: 0 } })); };
  }, []);

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

  const isTutorialActive = tutorialStep > 0 && tutorialStep <= TOTAL_STEPS;
  const displayData = isTutorialActive ? SAMPLE_DASHBOARD_DATA : data;
  const effectiveDataVisible = isTutorialActive ? true : isDataVisible;

  // "vs previous 7 days" caption for the KPI tiles
  const { periodLabel, periodName } = useMemo(() => {
    if (!filters.startDate || !filters.endDate) return { periodLabel: 'vs previous period', periodName: '' };
    const s = new Date(filters.startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(filters.endDate); e.setHours(0, 0, 0, 0);
    const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
    return {
      periodLabel: days === 1 ? 'vs previous day' : `vs previous ${days} days`,
      periodName: filters.filterType === 'today' ? 'Today' : filters.filterType === 'yesterday' ? 'Yesterday' : days === 1 ? '1 day' : `${days} days`,
    };
  }, [filters.startDate, filters.endDate, filters.filterType]);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!currentUser?.companyId || !filters.startDate || !filters.endDate) { setLoading(false); return; }
    if (!forceRefresh) setLoading(true);
    const CACHE_KEY = `dashboard_cache_v3_${currentUser.companyId}`; // v3: KPI + udhaar fields added
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
      const qUsers = query(usersRef, limit(1000));
      const [snapSales, snapUsers] = await Promise.all([getDocs(qSales), getDocs(qUsers)]);

      const currentSalesMap: Record<string, { amount: number, count: number }> = {};
      const paymentMap: Record<string, { amount: number, count: number }> = {};
      const itemMap: Record<string, { amount: number, count: number, latestName: string }> = {};
      const customerMap: Record<string, { amount: number, count: number }> = {};
      const salesmanMap: Record<string, { amount: number, count: number }> = {};
      let currentTotalSales = 0, currentOrderCount = 0, prevTotalSales = 0, prevOrderCount = 0;
      let unpaidAmount = 0, unpaidBills = 0;

      const validSalesmen = new Map<string, string>();
      snapUsers.docs.forEach(doc => {
        const u = doc.data();
        const role = String(u.role || '').toLowerCase().trim();
        const isSalesRole = role.includes('sales') || role === 'salesman' || role === 'sales person' || role === 'manager';
        if (!isSalesRole) return;
        const displayName = u.name || u.fullName || u.displayName || u.username || u.userName || 'Unknown Salesperson';
        validSalesmen.set(doc.id, displayName);
        [u.name, u.fullName, u.displayName, u.username, u.userName]
          .map((n: any) => String(n || '').trim().toLowerCase())
          .filter(Boolean)
          .forEach((name: string) => validSalesmen.set(name, displayName));
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

          // Udhaar — sale docs carry `dueAmount`
          const due = parseNum(d.dueAmount);
          if (due > 0) { unpaidAmount += due; unpaidBills++; }

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

          let cust = d.partyName || d.customerName || d.customer || 'Walk-in';
          if (typeof cust === 'object' && cust.name) cust = cust.name;
          if (String(cust).trim().toUpperCase() === 'N/A') cust = 'Walk-in';
          if (!customerMap[cust]) customerMap[cust] = { amount: 0, count: 0 };
          customerMap[cust].amount += amount; customerMap[cust].count++;

          let sm = d.salesmanName || d.salesman || d.salesmanId || 'Admin';
          if (typeof sm === 'object' && sm.name) sm = sm.name;
          const smStr = String(sm);
          const resolvedName = validSalesmen.get(smStr) || validSalesmen.get(smStr.toLowerCase().trim());
          if (resolvedName) {
            if (!salesmanMap[resolvedName]) salesmanMap[resolvedName] = { amount: 0, count: 0 };
            salesmanMap[resolvedName].amount += amount;
            salesmanMap[resolvedName].count++;
          }

          if (Array.isArray(d.items)) {
            d.items.forEach((item: any) => {
              const name = item.name || item.itemName;
              if (!name) return;
              // Group by normalized name (ids aren't populated consistently across entry paths)
              const key = String(name).trim().toLowerCase();
              const qty = parseNum(item.quantity || item.qty || 1);
              let val = parseNum(item.finalPrice || item.totalAmount || item.total || item.amount);
              if (val === 0) { const price = parseNum(item.mrp || item.price || item.rate || item.sellingPrice || 0); val = price * qty; }
              if (!itemMap[key]) itemMap[key] = { amount: 0, count: 0, latestName: name };
              itemMap[key].amount += val; itemMap[key].count += qty;
            });
          }
        }
        if (saleDate >= prevStart && saleDate <= prevEnd) { prevTotalSales += amount; prevOrderCount++; }
      });

      let percentageChange = 0;
      if (prevTotalSales > 0) percentageChange = ((currentTotalSales - prevTotalSales) / prevTotalSales) * 100;
      else if (currentTotalSales > 0) percentageChange = 100;

      const avgBill = currentOrderCount > 0 ? currentTotalSales / currentOrderCount : 0;
      const prevAvg = prevOrderCount > 0 ? prevTotalSales / prevOrderCount : 0;
      let avgChange = 0;
      if (prevAvg > 0) avgChange = ((avgBill - prevAvg) / prevAvg) * 100;
      else if (avgBill > 0) avgChange = 100;
      const ordersChange = currentOrderCount - prevOrderCount;

      const chartData = [];
      const itr = new Date(start);
      itr.setDate(itr.getDate() - 1);
      while (itr <= end) {
        const offset = itr.getTimezoneOffset() * 60000;
        const key = new Date(itr.getTime() - offset).toISOString().split('T')[0];
        const label = itr.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); // "26 Sep"
        const countVal = currentSalesMap[key]?.count || 0;
        chartData.push({
          name: label, sales: currentSalesMap[key]?.amount || 0, count: countVal,
          quantity: countVal, qty: countVal, bills: countVal, Bills: countVal, previousSales: 0,
        });
        itr.setDate(itr.getDate() + 1);
      }

      const toList = (map: any) => Object.entries(map).map(([key, v]: [string, any]) => ({ name: v.latestName ?? key, amount: v.amount, quantity: v.count })).sort((a, b) => b.amount - a.amount).slice(0, 5);
      // Not sliced: RankCard picks its own top 5 by Amt OR Qty
      const toFullList = (map: any) => Object.entries(map).map(([key, v]: [string, any]) => ({ name: v.latestName ?? key, amount: v.amount, quantity: v.count }));
      const topSalesmen = Object.entries(salesmanMap)
        .map(([name, v]: [string, any]) => ({ name, amount: v.amount, quantity: v.count }))
        .sort((a, b) => b.amount - a.amount).slice(0, 5);

      const finalData: DashboardData = {
        totalSales: currentTotalSales, totalOrders: currentOrderCount, percentageChange,
        ordersChange, avgBill, avgChange, unpaidAmount, unpaidBills,
        salesByDate: chartData, paymentMethods: toList(paymentMap), topItems: toFullList(itemMap),
        topCustomers: toList(customerMap), topSalesmen, lastUpdated: Date.now(),
        cacheStart: filters.startDate, cacheEnd: filters.endDate,
      };
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
    <div className="flex min-h-screen w-full flex-col bg-[#eef2ff] text-[#0f172b]">
      {/* ── Header: title left · Hide figures right (same row on mobile, icon only) ── */}
      <header className="flex flex-shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-4 md:px-6 md:pb-4 md:pt-5">
        <div className="min-w-0">
          <h1 className="m-0 text-xl font-semibold leading-7 md:text-2xl md:leading-8 md:tracking-[-0.01em]">Dashboard</h1>
          <p className="m-0 flex items-center gap-1 text-xs text-[#45556c] md:text-[13px]">
            <span className="truncate">{nameLoading ? '...' : businessName} · Updated {formattedLastUpdated}</span>
            <ShowWrapper requiredPermission={Permissions.ViewHidebutton}>
              <button
                onClick={handleRefresh}
                aria-label="Refresh"
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#45556c] transition-colors hover:bg-[#f5f7ff] hover:text-[#0f172b] ${loading ? 'animate-spin' : ''}`}
              >
                {loading ? <FiLoader size={16} /> : <FiRefreshCw size={16} />}
              </button>
            </ShowWrapper>
          </p>
        </div>

        <div className="flex flex-none items-center gap-2">
          {/* Step 2 — Hide / Show figures */}
          <ShowWrapper requiredPermission={Permissions.ViewHidebutton}>
            <TutorialStep step={2} currentStep={tutorialStep} text="Toggle this to show or hide sensitive sales figures." onNext={() => next(3)} onSkip={skip}>
              <button
                ref={setTutorialRef(2)}
                onClick={() => setIsDataVisible(!isDataVisible)}
                aria-label={isDataVisible ? 'Hide figures' : 'Show figures'}
                aria-pressed={!isDataVisible}
                className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-lg border border-[#7a8aa3] bg-white text-sm font-medium text-[#0f172b] transition-colors hover:bg-[#f5f7ff] md:w-auto md:px-4"
              >
                {isDataVisible ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                <span className="hidden md:inline">{isDataVisible ? 'Hide figures' : 'Show figures'}</span>
              </button>
            </TutorialStep>
          </ShowWrapper>
          {/* New sale — desktop only (mobile uses the bottom-nav quick add) */}
          <ShowWrapper requiredPermission={Permissions.CreateSales}>
            <Link
              to={NEW_SALE_ROUTE}
              className="hidden h-10 items-center gap-2 rounded-lg bg-[#155dfc] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1447e6] md:inline-flex"
            >
              <FiPlus size={16} /> New sale
            </Link>
          </ShowWrapper>
        </div>
      </header>

      <main ref={mainRef} className="relative flex-grow overflow-y-auto px-4 pb-24 md:px-6 md:pb-6">
        <div className="relative mx-auto max-w-7xl">

          {/* Step 3 — Date filter */}
          <ShowWrapper requiredPermission={Permissions.ViewFilter}>
            <TutorialStep step={3} currentStep={tutorialStep} text="Use these filters to select the date range for your dashboard data." onNext={() => next(4)} onSkip={skip}>
              <div ref={setTutorialRef(3)} className="mb-3 md:mb-5">
                <DateChips />
              </div>
            </TutorialStep>
          </ShowWrapper>

          {(loading && !data && !isTutorialActive) ? (
            <div className="flex h-64 items-center justify-center text-[#45556c]"><FiLoader className="mr-2 animate-spin" /> Loading Dashboard...</div>
          ) : (
            <div className="flex flex-col gap-3 md:gap-5">

              {/* ── ROW 1: KPI tiles (Total sales · Bills · Average bill · Unpaid) ── */}
              {/* Step 4 */}
              <TutorialStep step={4} currentStep={tutorialStep} text="These tiles show total sales, bills, average bill and unpaid udhaar for the selected period." onNext={() => next(5)} onSkip={skip}>
                <div ref={setTutorialRef(4)}>
                  <ShowWrapper requiredPermission={Permissions.ViewSalescard}>
                    <KpiRow
                      isDataVisible={effectiveDataVisible}
                      totalSales={Math.ceil(displayData?.totalSales || 0)}
                      salesChangePct={displayData?.percentageChange || 0}
                      bills={displayData?.totalOrders || 0}
                      billsChange={displayData?.ordersChange || 0}
                      avgBill={displayData?.avgBill || 0}
                      avgChangePct={displayData?.avgChange || 0}
                      unpaidAmount={displayData?.unpaidAmount || 0}
                      unpaidBills={displayData?.unpaidBills || 0}
                      periodLabel={periodLabel}
                      periodName={periodName}
                    />
                  </ShowWrapper>
                </div>
              </TutorialStep>

              {/* ── ROW 2: Daily performance (2/3) + Payment methods (1/3) ── */}
              <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-3 md:gap-5">
                {/* Step 5 */}
                <TutorialStep step={5} currentStep={tutorialStep} text="This chart shows your daily sales performance over the selected date range." onNext={() => next(6)} onSkip={skip}>
                  <div ref={setTutorialRef(5)} className="order-1 h-full min-h-0 md:col-span-2">
                    <ShowWrapper requiredPermission={Permissions.ViewSalesbarchart}>
                      <div className="h-full min-h-0 [&>*]:h-full">
                        <SalesBarChartReport isDataVisible={effectiveDataVisible} data={displayData?.salesByDate || []} />
                      </div>
                    </ShowWrapper>
                  </div>
                </TutorialStep>

                {/* Step 6 */}
                <TutorialStep step={6} currentStep={tutorialStep} text="This card breaks down sales by payment method — cash, card, UPI — and shows unpaid udhaar." onNext={() => next(7)} onSkip={skip}>
                  <div ref={setTutorialRef(6)} className="order-2 h-full min-h-0 md:col-span-1">
                    <ShowWrapper requiredPermission={Permissions.ViewPaymentmethods}>
                      <div className="h-full min-h-0 [&>*]:h-full">
                        <PaymentChart isDataVisible={effectiveDataVisible} data={displayData?.paymentMethods || []} unpaidAmount={displayData?.unpaidAmount || 0} />
                      </div>
                    </ShowWrapper>
                  </div>
                </TutorialStep>
              </div>

              {/* ── ROW 3: Top items · Top salespeople · Top customers ── */}
              <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
                {/* Step 7 */}
                <TutorialStep step={7} currentStep={tutorialStep} text="See your top 5 best-selling items for the selected period. Switch between amount and quantity." onNext={() => next(8)} onSkip={skip}>
                  <div ref={setTutorialRef(7)} className="h-full [&>*]:h-full">
                    <ShowWrapper requiredPermission={Permissions.ViewTopSoldItems}>
                      <TopSoldItemsCard isDataVisible={effectiveDataVisible} items={displayData?.topItems || []} />
                    </ShowWrapper>
                  </div>
                </TutorialStep>

                {/* Step 8 */}
                <TutorialStep step={8} currentStep={tutorialStep} text="Track your top 5 performing salespeople ranked by total sales amount." onNext={() => next(9)} onSkip={skip}>
                  <div ref={setTutorialRef(8)} className="h-full [&>*]:h-full">
                    <ShowWrapper requiredPermission={Permissions.ViewTopSalesperson}>
                      <TopSalespersonCard isDataVisible={effectiveDataVisible} salesmen={displayData?.topSalesmen || []} addUserRoute={ADD_USER_ROUTE} />
                    </ShowWrapper>
                  </div>
                </TutorialStep>

                {/* Step 9 — last step */}
                <TutorialStep
                  step={9}
                  currentStep={tutorialStep}
                  isLast={window.innerWidth >= 768}
                  text="Your top 5 customers by purchase value. Great for identifying your most loyal buyers."
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
                  <div ref={setTutorialRef(9)} className="h-full [&>*]:h-full">
                    <ShowWrapper requiredPermission={Permissions.ViewTopCustomers}>
                      <TopEntitiesList isDataVisible={effectiveDataVisible} titleOverride="Top customers" items={displayData?.topCustomers || []} />
                    </ShowWrapper>
                  </div>
                </TutorialStep>
              </div>

              <ShowWrapper requiredPermission={Permissions.ViewAttendance}><AttendancePage /></ShowWrapper>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const Home = () => (<FilterProvider><DashboardContent /></FilterProvider>);
export default Home;