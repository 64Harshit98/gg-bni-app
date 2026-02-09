import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc
} from 'firebase/firestore';
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
import { RestockAlertsCard } from '../Components/RestockItems';
import { TopEntitiesList } from '../Components/TopFiveEntities';


export interface SmartMetric {
  name: string;
  amount: number;
  quantity: number;
}

interface DashboardData {
  totalSales: number;
  totalOrders: number;
  percentageChange: number;
  salesByDate: { name: string; sales: number; previousSales: number; count: number }[];
  paymentMethods: SmartMetric[];
  topItems: SmartMetric[];
  topCustomers: SmartMetric[];
  topSalesmen: SmartMetric[];
  lastUpdated: number;
  cacheStart?: string;
  cacheEnd?: string;
}

const CACHE_DURATION = 60 * 60 * 1000;

const cleanString = (str: string) => {
  if (!str) return 'N/A';
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
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

const DashboardContent = () => {
  const { currentUser } = useAuth();
  const { businessName, loading: nameLoading } = useBusinessName();
  const { filters } = useFilter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDataVisible, setIsDataVisible] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

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

        if (isTimeValid && isDateValid) {
          console.log(`Using Cached Data for ${currentUser.companyId}`);
          setData(parsed);
          setLoading(false);
          return;
        }
      }

      console.log(`Fetching Fresh Data for ${currentUser.companyId}...`);

      const start = new Date(filters.startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(filters.endDate); end.setHours(23, 59, 59, 999);

      const duration = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - duration);

      const salesRef = collection(db, 'companies', currentUser.companyId, 'sales');
      const usersRef = collection(db, 'companies', currentUser.companyId, 'users');

      const qSales = query(
        salesRef,
        where('createdAt', '>=', prevStart),
        where('createdAt', '<=', end),
        orderBy('createdAt', 'desc')
      );

      const [snapSales, snapUsers] = await Promise.all([
        getDocs(qSales), getDocs(usersRef)
      ]);

      const currentSalesMap: Record<string, { amount: number, count: number }> = {};
      const paymentMap: Record<string, { amount: number, count: number }> = {};
      const itemMap: Record<string, { amount: number, count: number }> = {};
      const customerMap: Record<string, { amount: number, count: number }> = {};
      const salesmanMap: Record<string, { amount: number, count: number }> = {};

      let currentTotalSales = 0;
      let currentOrderCount = 0;
      let prevTotalSales = 0;

      const validSalesmen = new Set<string>();
      snapUsers.docs.forEach(doc => {
        const u = doc.data();
        const role = (u.role || '').toLowerCase();
        if (role === 'salesman') {
          if (u.name) validSalesmen.add(u.name.toLowerCase().trim());
        }
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

          let methodFound = false;
          if (d.paymentMethods && typeof d.paymentMethods === 'object') {
            Object.entries(d.paymentMethods).forEach(([key, val]) => {
              const amt = parseNum(val);
              if (amt > 0) {
                const clean = cleanString(key);
                if (!paymentMap[clean]) paymentMap[clean] = { amount: 0, count: 0 };
                paymentMap[clean].amount += amt;
                paymentMap[clean].count++;
                methodFound = true;
              }
            });
          }
          if (!methodFound) {
            const m = d.paymentMethod || d.paymentMode;
            const clean = cleanString(m);
            if (!paymentMap[clean]) paymentMap[clean] = { amount: 0, count: 0 };
            paymentMap[clean].amount += amount;
            paymentMap[clean].count++;
          }

          let cust = d.partyName || d.customerName || d.customer || 'N/A';
          if (typeof cust === 'object' && cust.name) cust = cust.name;
          if (!customerMap[cust]) customerMap[cust] = { amount: 0, count: 0 };
          customerMap[cust].amount += amount;
          customerMap[cust].count++;

          let sm = d.salesmanName || d.salesman || 'Admin';
          if (typeof sm === 'object' && sm.name) sm = sm.name;
          if (!salesmanMap[sm]) salesmanMap[sm] = { amount: 0, count: 0 };
          salesmanMap[sm].amount += amount;
          salesmanMap[sm].count++;

          if (Array.isArray(d.items)) {
            d.items.forEach((item: any) => {
              const name = item.name || item.itemName;
              if (name) {
                const qty = parseNum(item.quantity || item.qty || 1);

                let val = parseNum(item.finalPrice || item.totalAmount || item.total || item.amount);

                if (val === 0) {
                  const price = parseNum(item.mrp || item.price || item.rate || item.sellingPrice || 0);
                  val = price * qty;
                }

                if (!itemMap[name]) itemMap[name] = { amount: 0, count: 0 };
                itemMap[name].amount += val;
                itemMap[name].count += qty;
              }
            });
          }
        }

        if (saleDate >= prevStart && saleDate <= prevEnd) {
          prevTotalSales += amount;
        }
      });

      let percentageChange = 0;
      if (prevTotalSales > 0) percentageChange = ((currentTotalSales - prevTotalSales) / prevTotalSales) * 100;
      else if (currentTotalSales > 0) percentageChange = 100;

      const chartData = [];
      const itr = new Date(prevStart);
      while (itr <= end) {
        const offset = itr.getTimezoneOffset() * 60000;
        const key = new Date(itr.getTime() - offset).toISOString().split('T')[0];
        const label = itr.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });

        chartData.push({
          name: label,
          sales: currentSalesMap[key]?.amount || 0,
          count: currentSalesMap[key]?.count || 0,
          previousSales: 0
        });

        itr.setDate(itr.getDate() + 1);
      }

      const toList = (map: any) => Object.entries(map)
        .map(([name, v]: [string, any]) => ({ name, amount: v.amount, quantity: v.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      const topSalesmen = Object.entries(salesmanMap)
        .filter(([name]) => validSalesmen.has(name.toLowerCase().trim()))
        .map(([name, v]: [string, any]) => ({ name, amount: v.amount, quantity: v.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      const finalData = {
        totalSales: currentTotalSales,
        totalOrders: currentOrderCount,
        percentageChange,
        salesByDate: chartData,
        paymentMethods: toList(paymentMap),
        topItems: toList(itemMap),
        topCustomers: toList(customerMap),
        topSalesmen,
        lastUpdated: Date.now(),
        cacheStart: filters.startDate,
        cacheEnd: filters.endDate
      };

      setData(finalData);
      localStorage.setItem(CACHE_KEY, JSON.stringify(finalData));

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentUser, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => fetchData(true);

  const formattedLastUpdated = useMemo(() => {
    if (!data?.lastUpdated) return 'Never';
    return new Date(data.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [data]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-gray-100">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-2">
        <div className="relative w-14 flex justify-start">
          <button disabled={!hasCataloguePermission} onClick={() => setIsMenuOpen(!isMenuOpen)} className={`flex min-w-20 items-center justify-between gap-2 rounded-sm border border-slate-400 p-2 text-sm font-medium text-slate-700 transition-colors ${!hasCataloguePermission ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'hover:bg-slate-200 cursor-pointer'}`}>
            <span className="font-medium">{currentLabel}</span>
            <IconChevronDown width={16} height={16} className={`transition-transform ${isMenuOpen ? 'rotate-180' : 'rotate-0'}`} />
          </button>
          {isMenuOpen && hasCataloguePermission && (
            <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-300 rounded-md shadow-lg z-10">
              <ul className="py-1">
                {SiteItems.map(({ to, label }) => (
                  <li key={to}><Link to={to} onClick={() => setIsMenuOpen(false)} className={`flex w-full items-center gap-3 px-4 py-2 text-sm font-medium ${location.pathname === to ? 'bg-gray-500 text-white' : 'text-slate-700 hover:bg-gray-100'}`}>{label}</Link></li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="flex-1 text-center flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">{nameLoading ? '...' : businessName}</p>
        </div>
        <div className="w-14 flex justify-end">
          <ShowWrapper requiredPermission={Permissions.ViewHidebutton}>
            <button onClick={() => setIsDataVisible(!isDataVisible)} className="p-2 rounded-sm border border-slate-400 hover:bg-slate-200 transition-colors">
              {isDataVisible ? <IconEye width={24} height={24} /> : <IconEyeOff width={24} height={24} />}
            </button>
          </ShowWrapper>
        </div>
      </header>

      <main className="flex-grow overflow-y-auto p-2 sm:p-2">
        <ShowWrapper requiredPermission={Permissions.ViewHidebutton}>
          <div className="flex justify-center gap-2">
            <p className="text-sm text-slate-500 flex items-center">Last Updated: {formattedLastUpdated}</p>
            <button onClick={handleRefresh} className={`p-1 rounded-full hover:bg-slate-200 text-slate-600 transition-all ${loading ? 'animate-spin' : ''}`}>
              {loading ? <FiLoader size={14} /> : <FiRefreshCw size={14} />}
            </button>
          </div>
        </ShowWrapper>

        <div className="mx-auto max-w-7xl">
          <ShowWrapper requiredPermission={Permissions.ViewFilter}><div className="mb-2"><FilterControls /></div></ShowWrapper>

          {loading && !data ? (
            <div className="flex h-64 items-center justify-center text-slate-500"><FiLoader className="animate-spin mr-2" /> Loading Dashboard...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pb-30">
              <ShowWrapper requiredPermission={Permissions.ViewSalescard}>
                <SalesCard isDataVisible={isDataVisible} totalSales={Math.ceil(data?.totalSales || 0)} percentageChange={data?.percentageChange || 0} />
              </ShowWrapper>
              <ShowWrapper requiredPermission={Permissions.ViewSalesbarchart}>
                <SalesBarChartReport isDataVisible={isDataVisible} data={data?.salesByDate || []} />
              </ShowWrapper>
              <ShowWrapper requiredPermission={Permissions.ViewPaymentmethods}>
                <PaymentChart isDataVisible={isDataVisible} data={data?.paymentMethods || []} />
              </ShowWrapper>
              <ShowWrapper requiredPermission={Permissions.ViewTopSoldItems}>
                <TopSoldItemsCard isDataVisible={isDataVisible} items={data?.topItems || []} />
              </ShowWrapper>
              <ShowWrapper requiredPermission={Permissions.ViewTopSalesperson}>
                <TopSalespersonCard isDataVisible={isDataVisible} salesmen={data?.topSalesmen || []} />
              </ShowWrapper>
              <ShowWrapper requiredPermission={Permissions.ViewTopCustomers}>
                <TopEntitiesList isDataVisible={isDataVisible} titleOverride="Top Customers" items={data?.topCustomers || []} />
              </ShowWrapper>
              <ShowWrapper requiredPermission={Permissions.ViewAttendance}><AttendancePage /></ShowWrapper>
              <ShowWrapper requiredPermission={Permissions.Viewrestockcard}><RestockAlertsCard /></ShowWrapper>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const Home = () => (<FilterProvider><DashboardContent /></FilterProvider>);
export default Home;