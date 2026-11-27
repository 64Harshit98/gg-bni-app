import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

const CACHE_KEY = 'superAdminDashboardCache_v1';

interface DashboardCache {
  fetchedAt: string; // ISO timestamp
  companies: CompanyData[];
}

const readCache = (): DashboardCache | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardCache;
    if (!parsed?.fetchedAt || !Array.isArray(parsed.companies)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeCache = (cache: DashboardCache) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('Failed to save super admin cache:', err);
  }
};

export interface CompanyData {
  id: string;
  companyName: string;
  status: 'active' | 'inactive' | 'expired' | 'trial' | 'near_expiry';
  todayOrders: number;
  todaySales: number;
  lastBillDate: string | null;
}

type SortKey = keyof Omit<CompanyData, 'id'>;
type SortDirection = 'asc' | 'desc';
type ActivityBucket = 'today' | 'week' | 'month' | 'dormant' | 'never';
type StatusFilter = 'all' | 'active' | 'near_expiry' | 'trial' | 'expired';

export default function SuperAdminBillingActivity() {
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchCompaniesAndMetrics = useCallback(async (hasExistingData: boolean) => {
    if (hasExistingData) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const soonMs = 7 * 24 * 60 * 60 * 1000; // 7 Days in milliseconds

    try {
      const companiesRef = collection(db, 'companies');
      const companiesSnapshot = await getDocs(companiesRef);

      const companyPromises = companiesSnapshot.docs.map(async (companyDoc) => {
        const companyData = companyDoc.data();
        const companyId = companyDoc.id;

        let todayOrdersCount = 0;
        let todaySalesCount = 0;
        let latestActivityDate: Date | null = null;

        // --- Real-Time Status Calculation ---
        let calculatedStatus: CompanyData['status'] = 'inactive';

        if (companyData.validity === 'inactive') {
          // Manual override always wins
          calculatedStatus = 'inactive';
        } else {
          const exp = companyData.expiryDate
            ? (companyData.expiryDate.toDate ? companyData.expiryDate.toDate() : new Date(companyData.expiryDate))
            : null;

          if (companyData.pack === 'free' || companyData.pack === 'trial') {
            calculatedStatus = 'trial';
          } else if (!exp || exp.getTime() < now.getTime()) {
            calculatedStatus = 'expired';
          } else if (exp.getTime() - now.getTime() <= soonMs) {
            calculatedStatus = 'near_expiry';
          } else {
            calculatedStatus = 'active';
          }
        }

        const processDocumentDate = (docData: any, isSalesDoc: boolean) => {
          let docDateObj: Date | null = null;
          if (docData.createdAt?.toDate) {
            docDateObj = docData.createdAt.toDate();
          } else if (docData.date) {
            docDateObj = new Date(docData.date);
          }

          if (docDateObj) {
            if (!latestActivityDate || docDateObj > latestActivityDate) {
              latestActivityDate = docDateObj;
            }

            const docDateReset = new Date(docDateObj);
            docDateReset.setHours(0, 0, 0, 0);

            if (docDateReset.getTime() === todayStart.getTime()) {
              if (isSalesDoc) {
                todaySalesCount += 1;
              } else {
                todayOrdersCount += 1;
              }
            }
          }
        };

        try {
          const ordersRef = collection(db, 'companies', companyId, 'Orders');
          const ordersSnapshot = await getDocs(ordersRef);
          ordersSnapshot.forEach((doc) => processDocumentDate(doc.data(), false));

          const salesRef = collection(db, 'companies', companyId, 'sales');
          const salesSnapshot = await getDocs(salesRef);
          salesSnapshot.forEach((doc) => processDocumentDate(doc.data(), true));

        } catch (subErr) {
          console.error(`Failed to fetch subcollections for company ${companyId}:`, subErr);
        }

        return {
          id: companyId,
          companyName: companyData.name || 'Unknown Company',
          status: calculatedStatus,
          todayOrders: todayOrdersCount,
          todaySales: todaySalesCount,
          lastBillDate: latestActivityDate ? (latestActivityDate as Date).toISOString() : null,
        };
      });

      const fetchedData = await Promise.all(companyPromises);
      const fetchedTime = new Date().toISOString();
      setCompanies(fetchedData);
      setFetchedAt(fetchedTime);
      writeCache({ fetchedAt: fetchedTime, companies: fetchedData });
    } catch (err) {
      console.error("Error fetching data from Firestore:", err);
      // Keep showing cached data if a refresh fails
      if (!hasExistingData) {
        setError("Failed to load dashboard data. Please check your database connection.");
      } else {
        alert("Refresh failed. Showing previously saved data.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Load from local cache first; only hit Firestore if nothing is saved yet
  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setCompanies(cached.companies);
      setFetchedAt(cached.fetchedAt);
      setIsLoading(false);
    } else {
      fetchCompaniesAndMetrics(false);
    }
  }, [fetchCompaniesAndMetrics]);

  // --- Date helpers ---
  const DAY_MS = 24 * 60 * 60 * 1000;

  const getActivityBucket = (dateString: string | null): ActivityBucket => {
    if (!dateString) return 'never';
    const d = new Date(dateString);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (d >= startOfToday) return 'today';
    const ageMs = Date.now() - d.getTime();
    if (ageMs <= 7 * DAY_MS) return 'week';
    if (ageMs <= 30 * DAY_MS) return 'month';
    return 'dormant';
  };

  const formatRelative = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const diffMs = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
    const years = Math.floor(days / 365);
    return `${years} year${years > 1 ? 's' : ''} ago`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No bills yet';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const formatNumber = (num: number) => new Intl.NumberFormat('en-IN').format(num);

  // --- Filters ---
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activityFilter, setActivityFilter] = useState<ActivityBucket | 'all'>('all');

  const matchesStatus = (c: CompanyData, f: StatusFilter) => {
    if (f === 'all') return true;
    if (f === 'expired') return c.status === 'expired' || c.status === 'inactive';
    return c.status === f;
  };

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter(c =>
      (!q || c.companyName.toLowerCase().includes(q)) &&
      matchesStatus(c, statusFilter) &&
      (activityFilter === 'all' || getActivityBucket(c.lastBillDate) === activityFilter)
    );
  }, [companies, search, statusFilter, activityFilter]);

  // --- Sorting Logic ---
  const sortedCompanies = useMemo(() => {
    const sortableItems = [...filteredCompanies];
    // Default: most recent billing activity first
    const config = sortConfig ?? { key: 'lastBillDate' as SortKey, direction: 'desc' as SortDirection };
    sortableItems.sort((a, b) => {
      let aValue = a[config.key] as any;
      let bValue = b[config.key] as any;

      if (config.key === 'lastBillDate') {
        aValue = aValue ? new Date(aValue as string).getTime() : 0;
        bValue = bValue ? new Date(bValue as string).getTime() : 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return config.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return config.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sortableItems;
  }, [filteredCompanies, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    const active = sortConfig ? sortConfig.key === columnKey : columnKey === 'lastBillDate';
    const dir = sortConfig ? sortConfig.direction : 'desc';
    if (!active) return <span className="ml-1 text-gray-300">↕</span>;
    return <span className="ml-1 text-blue-500">{dir === 'asc' ? '↑' : '↓'}</span>;
  };

  // --- Aggregates ---
  const statusCounts = useMemo(() => ({
    all: companies.length,
    active: companies.filter(c => c.status === 'active').length,
    near_expiry: companies.filter(c => c.status === 'near_expiry').length,
    trial: companies.filter(c => c.status === 'trial').length,
    expired: companies.filter(c => c.status === 'expired' || c.status === 'inactive').length,
  }), [companies]);

  const activityCounts = useMemo(() => {
    const counts: Record<ActivityBucket, number> = { today: 0, week: 0, month: 0, dormant: 0, never: 0 };
    companies.forEach(c => { counts[getActivityBucket(c.lastBillDate)] += 1; });
    return counts;
  }, [companies]);

  // Only count companies that are actively allowed to use the platform right now
  const validCompaniesCount = statusCounts.active + statusCounts.near_expiry + statusCounts.trial;
  const globalTodayOrders = companies.reduce((acc, curr) => acc + curr.todayOrders, 0);
  const globalTodaySales = companies.reduce((acc, curr) => acc + curr.todaySales, 0);

  const isStaleDay = fetchedAt ? new Date(fetchedAt).toDateString() !== new Date().toDateString() : false;
  const hasFilters = search.trim() !== '' || statusFilter !== 'all' || activityFilter !== 'all';

  // --- UI pieces ---
  const STATUS_META: Record<CompanyData['status'], { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-green-50 text-green-700 border-green-200' },
    near_expiry: { label: 'Expiring Soon', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    trial: { label: 'Trial', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    expired: { label: 'Expired', className: 'bg-red-50 text-red-700 border-red-200' },
    inactive: { label: 'Inactive', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  };

  const ACTIVITY_META: Record<ActivityBucket, { label: string; dot: string; text: string }> = {
    today: { label: 'Billed today', dot: 'bg-green-500', text: 'text-green-700' },
    week: { label: 'Last 7 days', dot: 'bg-blue-500', text: 'text-blue-700' },
    month: { label: 'Last 30 days', dot: 'bg-amber-500', text: 'text-amber-700' },
    dormant: { label: '30+ days idle', dot: 'bg-red-500', text: 'text-red-700' },
    never: { label: 'Never billed', dot: 'bg-gray-300', text: 'text-gray-500' },
  };

  const renderStatusBadge = (status: CompanyData['status']) => {
    const meta = STATUS_META[status] ?? STATUS_META.expired;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-bold uppercase tracking-wide border ${meta.className}`}>
        {meta.label}
      </span>
    );
  };

  const renderLastBill = (dateString: string | null) => {
    const meta = ACTIVITY_META[getActivityBucket(dateString)];
    return (
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${meta.dot}`} />
        <div>
          <div className={`font-semibold ${meta.text}`}>{formatRelative(dateString)}</div>
          {dateString && <div className="text-xs text-gray-400">{formatDate(dateString)}</div>}
        </div>
      </div>
    );
  };

  const renderCount = (n: number) => (
    <span className={n > 0 ? 'font-bold text-gray-900' : 'text-gray-300'}>{formatNumber(n)}</span>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50 text-gray-500">
        <div className="animate-pulse text-lg font-medium">Fetching Orders & Sales...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="bg-red-50 text-red-600 p-4 rounded-sm border border-red-200">{error}</div>
      </div>
    );
  }

  const statusChips: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'near_expiry', label: 'Expiring Soon' },
    { key: 'trial', label: 'Trial' },
    { key: 'expired', label: 'Expired' },
  ];

  const activityOrder: ActivityBucket[] = ['today', 'week', 'month', 'dormant', 'never'];

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Super Admin Overview</h1>
            {fetchedAt && (
              <p className="text-sm text-gray-500 mt-1">
                Last updated <span className="font-semibold text-gray-700">{formatRelative(fetchedAt)}</span>
                <span className="text-gray-400"> · {formatDate(fetchedAt)}</span>
              </p>
            )}
          </div>
          <button
            onClick={() => fetchCompaniesAndMetrics(true)}
            disabled={isRefreshing}
            className="self-start sm:self-auto px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-sm shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </header>

        {isStaleDay && (
          <div className="bg-orange-50 border border-orange-200 text-orange-800 text-sm px-4 py-3 rounded-sm">
            This data was saved on <span className="font-semibold">{new Date(fetchedAt!).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>.
            "Today" figures refer to that day. Refresh to see the latest numbers.
          </div>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 border border-gray-200 rounded-sm shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Companies</h3>
            <p className="text-3xl font-black text-gray-800 mt-2">{formatNumber(companies.length)}</p>
            <p className="text-xs text-gray-500 mt-1">{formatNumber(validCompaniesCount)} with valid subscription</p>
          </div>
          <div className="bg-white p-5 border border-gray-200 rounded-sm shadow-sm">
            <h3 className="text-xs font-bold text-green-600 uppercase tracking-widest">Billed Today</h3>
            <p className="text-3xl font-black text-gray-800 mt-2">{formatNumber(activityCounts.today)}</p>
            <p className="text-xs text-gray-500 mt-1">companies active today</p>
          </div>
          <div className="bg-white p-5 border border-gray-200 rounded-sm shadow-sm">
            <h3 className="text-xs font-bold text-blue-500 uppercase tracking-widest">Today's Orders</h3>
            <p className="text-3xl font-black text-gray-800 mt-2">{formatNumber(globalTodayOrders)}</p>
          </div>
          <div className="bg-white p-5 border border-gray-200 rounded-sm shadow-sm">
            <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Today's Sales</h3>
            <p className="text-3xl font-black text-gray-800 mt-2">{formatNumber(globalTodaySales)}</p>
          </div>
        </section>

        {/* Activity breakdown by last bill date */}
        <section className="bg-white border border-gray-200 rounded-sm shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Billing Activity</h2>
            <span className="text-xs text-gray-400">by last bill date · click to filter</span>
          </div>
          {companies.length > 0 && (
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 mb-4">
              {activityOrder.map(b => activityCounts[b] > 0 && (
                <div key={b} className={ACTIVITY_META[b].dot} style={{ width: `${(activityCounts[b] / companies.length) * 100}%` }} />
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {activityOrder.map(b => {
              const selected = activityFilter === b;
              return (
                <button
                  key={b}
                  onClick={() => setActivityFilter(selected ? 'all' : b)}
                  className={`text-left px-3 py-2 rounded-sm border transition-colors ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className={`h-2 w-2 rounded-full ${ACTIVITY_META[b].dot}`} />
                    {ACTIVITY_META[b].label}
                  </div>
                  <div className="text-xl font-bold text-gray-800 mt-0.5">{formatNumber(activityCounts[b])}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Tenant directory */}
        <section className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-800">
                Tenant Directory
                <span className="ml-2 text-sm font-medium text-gray-400">
                  {hasFilters ? `${sortedCompanies.length} of ${companies.length}` : companies.length}
                </span>
              </h2>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search company..."
                className="w-full sm:w-64 px-3 py-2 text-sm border border-gray-300 rounded-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {statusChips.map(chip => {
                const selected = statusFilter === chip.key;
                return (
                  <button
                    key={chip.key}
                    onClick={() => setStatusFilter(chip.key)}
                    className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${selected ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'}`}
                  >
                    {chip.label} <span className={selected ? 'text-gray-300' : 'text-gray-400'}>{statusCounts[chip.key]}</span>
                  </button>
                );
              })}
              {hasFilters && (
                <button
                  onClick={() => { setSearch(''); setStatusFilter('all'); setActivityFilter('all'); }}
                  className="ml-auto text-xs font-semibold text-blue-600 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200 select-none">
                  <th className="px-6 py-3 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => requestSort('companyName')}>
                    Company <SortIcon columnKey="companyName" />
                  </th>
                  <th className="px-6 py-3 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => requestSort('status')}>
                    Status <SortIcon columnKey="status" />
                  </th>
                  <th className="px-6 py-3 font-semibold text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort('todayOrders')}>
                    Orders Today <SortIcon columnKey="todayOrders" />
                  </th>
                  <th className="px-6 py-3 font-semibold text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort('todaySales')}>
                    Sales Today <SortIcon columnKey="todaySales" />
                  </th>
                  <th className="px-6 py-3 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => requestSort('lastBillDate')}>
                    Last Bill <SortIcon columnKey="lastBillDate" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {sortedCompanies.map((company) => (
                  <tr key={company.id} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-3">
                      <div className="font-semibold text-gray-900">{company.companyName}</div>
                      <div className="text-[11px] text-gray-400 font-mono">{company.id}</div>
                    </td>
                    <td className="px-6 py-3">{renderStatusBadge(company.status)}</td>
                    <td className="px-6 py-3 text-right">{renderCount(company.todayOrders)}</td>
                    <td className="px-6 py-3 text-right">{renderCount(company.todaySales)}</td>
                    <td className="px-6 py-3">{renderLastBill(company.lastBillDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {sortedCompanies.map((company) => (
              <div key={company.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-gray-900">{company.companyName}</div>
                  {renderStatusBadge(company.status)}
                </div>
                <div className="flex items-end justify-between gap-2 text-sm">
                  {renderLastBill(company.lastBillDate)}
                  <div className="text-right text-xs text-gray-500 shrink-0">
                    <div>Orders {renderCount(company.todayOrders)}</div>
                    <div>Sales {renderCount(company.todaySales)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {sortedCompanies.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-400 font-medium">
              {companies.length === 0 ? 'No companies found in the database.' : 'No companies match the current filters.'}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
