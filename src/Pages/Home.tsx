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

interface InventoryItem {
  id: string;
  name: string;
  stock?: number;
  restockQuantity: number;
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
  restockItems: InventoryItem[];
  lastUpdated: number;
}

const CACHE_KEY = 'dashboard_full_cache';
const CACHE_DURATION = 60 * 60 * 1000;

const cleanString = (str: string) => {
  if (!str) return 'Unknown';
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

const useBusinessName = () => {
  const [businessName, setBusinessName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser?.companyId) {
      setLoading(false);
      return;
    }
    const fetchBusinessInfo = async () => {
      try {
        const docRef = doc(db, 'companies', currentUser.companyId!, 'business_info', currentUser.companyId!);
        const docSnap = await getDoc(docRef);
        setBusinessName(docSnap.exists() ? docSnap.data().businessName : 'Business');
      } catch (err) {
        console.error("Error fetching business name:", err);
      } finally {
        setLoading(false);
      }
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDataVisible, setIsDataVisible] = useState(true);
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

    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!forceRefresh && cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.lastUpdated < CACHE_DURATION) {
          console.log("Using Cached Dashboard Data");
          setData(parsed);
          setLoading(false);
          return;
        }
      }

      console.log("Fetching Fresh Dashboard Data...");

      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);

      const duration = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - duration);

      const salesRef = collection(db, 'companies', currentUser.companyId, 'sales');
      const itemsRef = collection(db, 'companies', currentUser.companyId, 'items');
      const usersRef = collection(db, 'companies', currentUser.companyId, 'users');

      const qCurrent = query(salesRef, where('createdAt', '>=', start), where('createdAt', '<=', end), orderBy('createdAt', 'asc'));
      const qPrevious = query(salesRef, where('createdAt', '>=', prevStart), where('createdAt', '<=', prevEnd), orderBy('createdAt', 'asc'));
      const qItems = query(itemsRef);
      const qUsers = query(usersRef);

      const [snapCurrent, snapPrev, snapItems, snapUsers] = await Promise.all([
        getDocs(qCurrent),
        getDocs(qPrevious),
        getDocs(qItems),
        getDocs(qUsers)
      ]);

      const validSalesmen = new Set<string>();
      snapUsers.docs.forEach(doc => {
        const u = doc.data();
        const role = (u.role || '').toLowerCase();
        if (role.includes('sales')) {
          if (u.name) validSalesmen.add(u.name.toLowerCase().trim());
        }
      });

      const currentSalesMap: Record<string, { amount: number, count: number }> = {};
      const prevSalesMap: Record<string, number> = {};
      const paymentMap: Record<string, { amount: number, count: number }> = {};
      const itemMap: Record<string, { amount: number, count: number }> = {};
      const customerMap: Record<string, { amount: number, count: number }> = {};
      const salesmanMap: Record<string, { amount: number, count: number }> = {};

      let currentTotalSales = 0;
      let currentOrderCount = 0;

      snapCurrent.docs.forEach(doc => {
        const d = doc.data();

        let docTotal = 0;
        let methodFound = false;

        if (d.paymentMethods && typeof d.paymentMethods === 'object') {
          Object.entries(d.paymentMethods).forEach(([method, amt]: [string, any]) => {
            const val = parseNum(amt);
            if (val > 0) {
              docTotal += val;
              const clean = cleanString(method);
              if (!paymentMap[clean]) paymentMap[clean] = { amount: 0, count: 0 };
              paymentMap[clean].amount += val;
              paymentMap[clean].count += 1;
              methodFound = true;
            }
          });
        }

        if (!methodFound) {
          docTotal = parseNum(d.totalAmount || d.total || d.amount || d.grandTotal || d.finalAmount || d.balance || 0);
          const rawMethod = d.paymentMethod || d.paymentMode || d.paymentType || d.type || d.mode || 'Unknown';
          const clean = cleanString(rawMethod);
          if (!paymentMap[clean]) paymentMap[clean] = { amount: 0, count: 0 };
          paymentMap[clean].amount += docTotal;
          paymentMap[clean].count += 1;
        }

        currentTotalSales += docTotal;
        currentOrderCount++;

        let dateKey = 'Unknown';
        if (d.createdAt?.toDate) {
          dateKey = d.createdAt.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
        }
        if (!currentSalesMap[dateKey]) currentSalesMap[dateKey] = { amount: 0, count: 0 };
        currentSalesMap[dateKey].amount += docTotal;
        currentSalesMap[dateKey].count += 1;

        if (d.items && Array.isArray(d.items)) {
          d.items.forEach((item: any) => {
            if (typeof item === 'object' && item.name) {
              const qty = parseNum(item.quantity || item.qty || item.count || item.pieces);
              const price = parseNum(item.price || item.rate || item.mrp || item.sellingPrice || item.unitPrice || item.amount);
              let total = parseNum(item.total || item.totalAmount || item.finalAmount || item.itemTotal || item.amount);

              if (total === 0 && price > 0 && qty > 0) total = price * qty;

              if (!itemMap[item.name]) itemMap[item.name] = { amount: 0, count: 0 };
              itemMap[item.name].count += qty;
              itemMap[item.name].amount += total;
            }
          });
        }

        let cust = d.customerName || d.customer || d.clientName || d.partyName || d.billingName || d.buyerName;
        if (typeof cust === 'object' && cust?.name) cust = cust.name;
        if (!cust || cust.trim() === '') cust = 'Unknown';
        if (!customerMap[cust]) customerMap[cust] = { amount: 0, count: 0 };
        customerMap[cust].amount += docTotal;
        customerMap[cust].count += 1;

        let sm = d.salesmanName || d.salesman || d.sellerName || d.user || 'Admin';
        if (typeof sm === 'object' && sm?.name) sm = sm.name;
        if (!salesmanMap[sm]) salesmanMap[sm] = { amount: 0, count: 0 };
        salesmanMap[sm].amount += docTotal;
        salesmanMap[sm].count += 1;
      });

      let prevTotalSales = 0;
      snapPrev.docs.forEach(doc => {
        const d = doc.data();
        const amt = parseNum(d.totalAmount || d.total || d.amount || d.grandTotal);
        prevTotalSales += amt;

        if (d.createdAt?.toDate) {
          const pDate = d.createdAt.toDate();
          const diffTime = pDate.getTime() - prevStart.getTime();
          const daysDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          const matchDate = new Date(start.getTime() + (daysDiff * (1000 * 60 * 60 * 24)));
          const label = matchDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
          prevSalesMap[label] = (prevSalesMap[label] || 0) + amt;
        }
      });

      let percentageChange = 0;
      if (prevTotalSales > 0) percentageChange = ((currentTotalSales - prevTotalSales) / prevTotalSales) * 100;
      else if (currentTotalSales > 0) percentageChange = 100;

      const chartData = [];
      const itr = new Date(start);
      while (itr <= end) {
        const label = itr.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
        chartData.push({
          name: label,
          sales: currentSalesMap[label]?.amount || 0,
          count: currentSalesMap[label]?.count || 0,
          previousSales: prevSalesMap[label] || 0
        });
        itr.setDate(itr.getDate() + 1);
      }

      const toList = (map: any) => Object.entries(map)
        .map(([name, val]: [string, any]) => ({ name, amount: val.amount, quantity: val.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      let topSalesmen = Object.entries(salesmanMap)
        .filter(([name]) => validSalesmen.has(name.toLowerCase().trim()))
        .map(([name, val]) => ({ name, amount: val.amount, quantity: val.count }));

      if (topSalesmen.length === 0 && Object.keys(salesmanMap).length > 0) {
        topSalesmen = Object.entries(salesmanMap)
          .map(([name, val]) => ({ name, amount: val.amount, quantity: val.count }));
      }
      topSalesmen = topSalesmen.sort((a, b) => b.amount - a.amount).slice(0, 5);

      const restockList = snapItems.docs
        .map(doc => {
          const d = doc.data();
          return { id: doc.id, name: d.name, stock: parseNum(d.stock), restockQuantity: parseNum(d.restockQuantity) };
        })
        .filter(i => i.restockQuantity > 0 && i.stock <= i.restockQuantity)
        .sort((a, b) => (a.stock - a.restockQuantity) - (b.stock - b.restockQuantity));

      const finalData = {
        totalSales: currentTotalSales,
        totalOrders: currentOrderCount,
        percentageChange,
        salesByDate: chartData,
        paymentMethods: toList(paymentMap),
        topItems: toList(itemMap),
        topCustomers: toList(customerMap),
        topSalesmen: topSalesmen,
        restockItems: restockList,
        lastUpdated: Date.now()
      };

      setData(finalData);
      localStorage.setItem(CACHE_KEY, JSON.stringify(finalData));

    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [currentUser, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    fetchData(true);
  };

  const formattedLastUpdated = useMemo(() => {
    if (!data?.lastUpdated) return 'Never';
    return new Date(data.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [data]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-gray-100">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-2">
        <div className="relative w-14 flex justify-start">
          <button
            disabled={!hasCataloguePermission}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`flex min-w-20 items-center justify-between gap-2 rounded-sm border border-slate-400 p-2 text-sm font-medium text-slate-700 transition-colors ${!hasCataloguePermission ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'hover:bg-slate-200 cursor-pointer'}`}
          >
            <span className="font-medium">{currentLabel}</span>
            <IconChevronDown width={16} height={16} className={`transition-transform ${isMenuOpen ? 'rotate-180' : 'rotate-0'}`} />
          </button>

          {isMenuOpen && hasCataloguePermission && (
            <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-300 rounded-md shadow-lg z-10">
              <ul className="py-1">
                {SiteItems.map(({ to, label }) => (
                  <li key={to}>
                    <Link to={to} onClick={() => setIsMenuOpen(false)} className={`flex w-full items-center gap-3 px-4 py-2 text-sm font-medium ${location.pathname === to ? 'bg-gray-500 text-white' : 'text-slate-700 hover:bg-gray-100'}`}>
                      {label}
                    </Link>
                  </li>
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
        <div className="flex justify-center gap-2 mt-1 mb-4">
          <p className="text-sm text-slate-500 flex items-center">Last Updated: {formattedLastUpdated}</p>
          <button onClick={handleRefresh} className={`p-1 rounded-full hover:bg-slate-200 text-slate-600 transition-all ${isRefreshing ? 'animate-spin' : ''}`}>
            {isRefreshing ? <FiLoader size={14} /> : <FiRefreshCw size={14} />}
          </button>
        </div>

        <div className="mx-auto max-w-7xl">
          <ShowWrapper requiredPermission={Permissions.ViewFilter}><div className="mb-2"><FilterControls /></div></ShowWrapper>

          {loading ? (
            <div className="flex h-64 items-center justify-center text-slate-500"><FiLoader className="animate-spin mr-2" /> Loading...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pb-30">
              <ShowWrapper requiredPermission={Permissions.ViewSalescard}>
                <SalesCard isDataVisible={isDataVisible} totalSales={data?.totalSales || 0} percentageChange={data?.percentageChange || 0} />
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