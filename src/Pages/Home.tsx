import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { AttendancePage } from '../Components/AttendaceCard';
import { SalesBarChartReport } from '../Components/SalesBarGraph';
import { SalesCard } from '../Components/SalesCard';
import { TopSoldItemsCard } from '../Components/TopFiveItemCard';
import { TopSalespersonCard } from '../Components/TopSalesCard';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions } from '../enums';
import { FilterControls, FilterProvider, useFilter } from '../Components/Filter';
import { PaymentChart } from '../Components/PaymentChart';
import { RestockAlertsCard } from '../Components/RestockItems';
import { Link, useLocation } from 'react-router-dom';
import { SiteItems } from '../routes/SiteRoutes';
import { TopEntitiesList } from '../Components/TopFiveEntities';
import { IconChevronDown, IconEye, IconEyeOff } from '../constants/Icons';

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
        const docRef = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists() && docSnap.data().businessName) {
          setBusinessName(docSnap.data().businessName);
        } else {
          const rootRef = doc(db, 'companies', currentUser.companyId);
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

const DashboardContent = () => {
  const { loading: authLoading } = useAuth();
  const { businessName, loading: nameLoading } = useBusinessName();

  const { filters } = useFilter();

  // --- FIX: Create Exact Timestamps (Just like SalesReport) ---
  const chartFilters = useMemo(() => {
    if (!filters.startDate || !filters.endDate) return null;

    const start = new Date(filters.startDate);
    start.setHours(0, 0, 0, 0); // Start of day

    const end = new Date(filters.endDate);
    end.setHours(23, 59, 59, 999); // End of day

    // Return object matching SalesReport structure: { start: number, end: number }
    return {
      start: start.getTime(),
      end: end.getTime()
    };
  }, [filters.startDate, filters.endDate]);
  // -------------------------------------------------------------

  const [isDataVisible, setIsDataVisible] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  const location = useLocation();
  const isLoading = authLoading || nameLoading;
  const { currentUser } = useAuth();
  // Logic: Check if user has the specific permission (Adjust logic based on your auth implementation)
  const hasCataloguePermission = currentUser?.permissions?.includes(Permissions.ViewCatalogue);

  const currentItem = SiteItems.find(item => item.to === location.pathname);
  const currentLabel = currentItem ? currentItem.label : 'Dashboard';

  return (
    <div className="flex min-h-screen w-full flex-col bg-gray-100">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-2 ">
        <div className="relative w-14 flex justify-start">
          <button
            // 2. Disable the button if no permission
            disabled={!hasCataloguePermission}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`
        flex min-w-20 items-center justify-between gap-2 rounded-sm border border-slate-400 p-2 text-sm font-medium text-slate-700 transition-colors
        
        ${!hasCataloguePermission
                ? 'opacity-50 cursor-not-allowed bg-gray-100' // Disabled Styles
                : 'hover:bg-slate-200 cursor-pointer'         // Active Styles
              }
      `}
            title={!hasCataloguePermission ? "You do not have permission" : "Change Page"}
          >
            <span className="font-medium">{currentLabel}</span>
            <IconChevronDown
              width={16}
              height={16}
              className={`transition-transform ${isMenuOpen ? 'rotate-180' : 'rotate-0'}`}
            />
          </button>

          {/* 4. Ensure menu only renders if open AND permission exists (Extra security) */}
          {isMenuOpen && hasCataloguePermission && (
            <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-300 rounded-md shadow-lg z-10">
              <ul className="py-1">
                {SiteItems.map(({ to, label }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      onClick={() => setIsMenuOpen(false)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-sm font-medium ${location.pathname === to
                        ? 'bg-gray-500 text-white'
                        : 'text-slate-700 hover:bg-gray-100'
                        }`}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>


        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">{isLoading ? 'Loading...' : businessName}</p>
        </div>

        <div className="w-14 flex justify-end">
          <ShowWrapper requiredPermission={Permissions.ViewHidebutton}>
            <button
              onClick={() => setIsDataVisible(!isDataVisible)}
              className="p-2 rounded-sm border border-slate-400 hover:bg-slate-200 transition-colors"
              title={isDataVisible ? 'Hide Data' : 'Show Data'}
            >
              {isDataVisible ? (
                <IconEye width={24} height={24} />
              ) : (
                <IconEyeOff width={24} height={24} />
              )}
            </button>
          </ShowWrapper>
        </div>
      </header>

      <main className="flex-grow overflow-y-auto p-2 sm:p-2">
        <div className="mx-auto max-w-7xl">
          <ShowWrapper requiredPermission={Permissions.ViewFilter}>
            <div className="mb-2">
              <FilterControls />
            </div>
          </ShowWrapper>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pb-30">
            <ShowWrapper requiredPermission={Permissions.ViewSalescard}>
              <SalesCard isDataVisible={isDataVisible} />
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewSalesbarchart}>
              <SalesBarChartReport isDataVisible={isDataVisible} />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewPaymentmethods}>
              {/* FIX: Pass the calculated 'chartFilters' which matches SalesReport format */}
              <PaymentChart
                isDataVisible={isDataVisible}
                type="sales"
                filters={chartFilters}
              />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewTopSoldItems} >
              <TopSoldItemsCard isDataVisible={isDataVisible} />
            </ShowWrapper>
            <ShowWrapper requiredPermission={Permissions.ViewTopSalesperson}>
              <TopSalespersonCard isDataVisible={isDataVisible} />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewTopCustomers}>
              {/* FIX: Use chartFilters here too for consistency */}
              <TopEntitiesList
                isDataVisible={isDataVisible}
                type="sales"
                filters={chartFilters}
                titleOverride="Top Customers"
              />
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

const Home = () => {
  return (
    <FilterProvider>
      <DashboardContent />
    </FilterProvider>
  );
};

export default Home;