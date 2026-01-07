import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/auth-context';

// --- 1. Import Contexts ---
import { DashboardProvider, useDashboard } from '../context/DashboardContext';
import { FilterProvider, FilterControls } from '../Components/Filter';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions } from '../enums';

// --- 2. Import Components ---
import { AttendancePage } from '../Components/AttendaceCard';
import { SalesBarChartReport } from '../Components/SalesBarGraph';
import { SalesCard } from '../Components/SalesCard';
import { TopSoldItemsCard } from '../Components/TopFiveItemCard';
import { TopSalespersonCard } from '../Components/TopSalesCard';
import { PaymentChart } from '../Components/PaymentChart';
import { RestockAlertsCard } from '../Components/RestockItems';
import { TopEntitiesList } from '../Components/TopFiveEntities';

// --- 3. Import Routing & Icons ---
import { Link, useLocation } from 'react-router-dom';
import { SiteItems } from '../routes/SiteRoutes';
import { IconChevronDown, IconEye, IconEyeOff } from '../constants/Icons';
import { FiRefreshCw } from 'react-icons/fi'; // Make sure to install react-icons or use your own IconRefresh

// --- Helper Hook: Fetch Business Name ---
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
        if (docSnap.exists() && docSnap.data().businessName) {
          setBusinessName(docSnap.data().businessName);
        } else {
          const rootRef = doc(db, 'companies', currentUser.companyId!);
          const rootSnap = await getDoc(rootRef);
          setBusinessName(rootSnap.exists() ? rootSnap.data().businessName || 'Business' : 'Business');
        }
      } catch (err) {
        console.error("Error fetching business name:", err);
        setBusinessName('Business');
      } finally {
        setLoading(false);
      }
    };
    fetchBusinessInfo();
  }, [currentUser]);

  return { businessName, loading };
};

// --- Internal Component: The Actual Dashboard UI ---
const DashboardContent = () => {
  const { loading: authLoading } = useAuth();
  const { businessName, loading: nameLoading } = useBusinessName();

  // A. Access Global Dashboard State
  const {
    lastUpdated,
    refreshDashboard,
    loading: dashboardLoading
  } = useDashboard();

  const [isDataVisible, setIsDataVisible] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const location = useLocation();
  const { currentUser } = useAuth();

  // Permissions & Routing Logic
  const hasCataloguePermission = currentUser?.permissions?.includes(Permissions.ViewCatalogue);
  const currentItem = SiteItems.find(item => item.to === location.pathname);
  const currentLabel = currentItem ? currentItem.label : 'Dashboard';
  const isLoading = authLoading || nameLoading;

  // B. Format the "Last Updated" Time
  const formattedLastUpdated = useMemo(() => {
    if (!lastUpdated) return 'Never';
    return lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [lastUpdated]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-gray-100">
      {/* --- HEADER --- */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-2 ">

        {/* Left: Page Selector */}
        <div className="relative w-14 flex justify-start">
          <button
            disabled={!hasCataloguePermission}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`flex min-w-20 items-center justify-between gap-2 rounded-sm border border-slate-400 p-2 text-sm font-medium text-slate-700 transition-colors ${!hasCataloguePermission ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'hover:bg-slate-200 cursor-pointer'}`}
            title={!hasCataloguePermission ? "You do not have permission" : "Change Page"}
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

        {/* Center: Title & Global Refresh */}
        <div className="flex-1 text-center flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-slate-500">
              {isLoading ? 'Loading...' : businessName}
            </p>
          </div>
        </div>

        {/* Right: Hide Data Toggle */}
        <div className="w-14 flex justify-end">
          <ShowWrapper requiredPermission={Permissions.ViewHidebutton}>
            <button
              onClick={() => setIsDataVisible(!isDataVisible)}
              className="p-2 rounded-sm border border-slate-400 hover:bg-slate-200 transition-colors"
              title={isDataVisible ? 'Hide Data' : 'Show Data'}
            >
              {isDataVisible ? <IconEye width={24} height={24} /> : <IconEyeOff width={24} height={24} />}
            </button>
          </ShowWrapper>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-grow overflow-y-auto p-2 sm:p-2">
        <div className="flex justify-center gap-2 mt-1">
          <p className="text-xs text-slate-500">
            Updated: {formattedLastUpdated}
          </p>
          <button
            onClick={refreshDashboard}
            disabled={dashboardLoading}
            className={`p-1 rounded-full hover:bg-slate-200 text-slate-600 transition-all ${dashboardLoading ? 'animate-spin opacity-50' : ''}`}
            title="Reload Data"
          >
            <FiRefreshCw size={14} />
          </button>
        </div>
        <div className="mx-auto max-w-7xl">
          <ShowWrapper requiredPermission={Permissions.ViewFilter}>
            <div className="mb-2">
              <FilterControls />
            </div>
          </ShowWrapper>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pb-30">
            {/* NOTE: Ensure these child components (SalesCard, etc.) 
               are updated to use `useDashboard()` internally if you want 
               them to share the global data.
            */}
            <ShowWrapper requiredPermission={Permissions.ViewSalescard}>
              <SalesCard isDataVisible={isDataVisible} />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewSalesbarchart}>
              <SalesBarChartReport isDataVisible={isDataVisible} />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewPaymentmethods}>
              <PaymentChart isDataVisible={isDataVisible} type="sales" filters={null} />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewTopSoldItems} >
              <TopSoldItemsCard isDataVisible={isDataVisible} />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewTopSalesperson}>
              <TopSalespersonCard isDataVisible={isDataVisible} />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewTopCustomers}>
              <TopEntitiesList isDataVisible={isDataVisible} type="sales" filters={null} titleOverride="Top Customers" />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewAttendance} >
              <AttendancePage />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.Viewrestockcard}>
              <RestockAlertsCard />
            </ShowWrapper>
          </div>
        </div>
      </main>
    </div>
  );
}

// --- MAIN EXPORT ---
const Home = () => {
  return (
    // 1. FilterProvider is the Parent (provides date context)
    <FilterProvider>
      {/* 2. DashboardProvider is the Child (consumes dates, provides data) */}
      <DashboardProvider>
        <DashboardContent />
      </DashboardProvider>
    </FilterProvider>
  );
};

export default Home;