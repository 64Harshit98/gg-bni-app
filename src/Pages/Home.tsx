import { useState, useEffect } from 'react';
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
import { FilterControls, FilterProvider } from '../Components/Filter';
import { PaymentChart } from '../Components/PaymentChart';
import { RestockAlertsCard } from '../Components/RestockItems';
import { Link } from 'react-router-dom';
import { SiteItems } from '../routes/SiteRoutes';


const useBusinessName = (userId?: string) => {
  const [businessName, setBusinessName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    const fetchBusinessInfo = async () => {
      try {
        const docRef = doc(db, 'business_info', userId);
        const docSnap = await getDoc(docRef);
        setBusinessName(docSnap.exists() ? docSnap.data().businessName || 'Business' : 'Business');
      } catch (err) {
        setBusinessName('Business');
      } finally {
        setLoading(false);
      }
    };
    fetchBusinessInfo();
  }, [userId]);
  return { businessName, loading };
};


const Home = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { businessName, loading: nameLoading } = useBusinessName(currentUser?.uid);
  const [isDataVisible, setIsDataVisible] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const isLoading = authLoading || nameLoading;
  const currentItem = SiteItems.find(item => item.to === location.pathname);
  const currentLabel = currentItem ? currentItem.label : "Menu";

  return (
    <FilterProvider>
      <div className="flex min-h-screen w-full flex-col bg-gray-100">

        <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-2 ">

          <div className="relative w-14 flex justify-start">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex min-w-20 items-center justify-between gap-2 rounded-sm border border-slate-400 p-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors" // Adjusted min-w and gap
              title="Change Page"
            >
              <span className="font-medium">{currentLabel}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${isMenuOpen ? 'rotate-180' : 'rotate-0'}`}
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            {isMenuOpen && (
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
            <ShowWrapper requiredPermission={Permissions.ViewSalescard}>
              <button
                onClick={() => setIsDataVisible(!isDataVisible)}
                className="p-2 rounded-sm border border-slate-400 hover:bg-slate-200 transition-colors"
                title={isDataVisible ? 'Hide Data' : 'Show Data'}
              >
                {isDataVisible ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                )}
              </button>
            </ShowWrapper>
          </div>
        </header>

        <main className="flex-grow overflow-y-auto p-2 sm:p-2">
          <div className="mx-auto max-w-7xl">
            <ShowWrapper requiredPermission={Permissions.ViewSalescard}>
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
              <ShowWrapper requiredPermission={Permissions.ViewSalescard}>
                <PaymentChart isDataVisible={isDataVisible} />
              </ShowWrapper>
              <ShowWrapper requiredPermission={Permissions.ViewTopSoldItems} >
                <TopSoldItemsCard isDataVisible={isDataVisible} />
              </ShowWrapper>
              <ShowWrapper requiredPermission={Permissions.ViewSalescard}>
                <TopSalespersonCard isDataVisible={isDataVisible} />
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
    </FilterProvider>
  );
};

export default Home;