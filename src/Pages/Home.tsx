// src/Pages/Home.tsx
import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { SalesBarChartReport } from '../Components/SBGraph';
import { SalesCard } from '../Components/SCard';
import { TopSoldItemsCard } from '../Components/TFCard';
import { TopSalespersonCard } from '../Components/TSCard';

// --- Custom Hook to Fetch Business Name ---
const useBusinessName = (userId?: string) => {
  const [businessName, setBusinessName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchBusinessInfo = async () => {
      try {
        const docRef = doc(db, 'business_info', userId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setBusinessName(docSnap.data().businessName || 'Dashboard');
        } else {
          // If no business info is found, default to "Dashboard"
          setBusinessName('Dashboard');
        }
      } catch (err) {
        console.error("Error fetching business info:", err);
        setError("Failed to load business name.");
        setBusinessName('Dashboard'); // Fallback on error
      } finally {
        setLoading(false);
      }
    };

    fetchBusinessInfo();
  }, [userId]);

  return { businessName, loading, error };
};


const Home = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { businessName, loading: nameLoading } = useBusinessName(currentUser?.uid);

  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-slate-100 shadow-sm">
      {/* Top Bar */}
      <div className="flex flex-shrink-0 items-center justify-center border-b border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-800">
          {authLoading || nameLoading ? 'Dashboard' : businessName}
        </h1>
      </div>
      <div className="flex-grow overflow-y-auto p-4 sm:p-6">
        {/* Flex container for the cards */}
        <div className="flex w-full flex-wrap items-start justify-center gap-4 mb-6">
          {/* Wrapper for Sales Card */}
          <div className="flex-1 min-w-[280px]">
            <SalesCard />
          </div>
          {/* Wrapper for Purchase Card */}
          {/* <div className="flex-1 min-w-0">
            <PurchaseCard />
          </div> */}
        </div>
        <div className="mb-6">
          <SalesBarChartReport />
        </div>
        {/* Flex container for the bottom cards */}
        <div className="flex w-full flex-wrap items-start justify-center gap-6 mb-6">
          <div className="flex-1 min-w-[280px]">
            <TopSoldItemsCard />
          </div>
          <div className="flex-1 min-w-[280px]">
            <TopSalespersonCard />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;