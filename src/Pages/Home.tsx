// src/Pages/Home.tsx
import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/auth-context';

import { SalesBarChartReport } from '../Components/SBGraph';
import { SalesCard } from '../Components/SCard';
import { TopSoldItemsCard } from '../Components/TFCard';
import { TopSalespersonCard } from '../Components/TSCard';

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

  const isLoading = authLoading || nameLoading;

  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-slate-100 shadow-sm">
      {/* Top Bar */}
      {/* FIX: The top bar is restructured for perfect centering */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white p-4 shadow-sm">
        {/* 1. Invisible placeholder on the left to balance the button */}
        <div className="w-8"></div>

        {/* 2. Centered title block */}
        <div className="flex flex-col text-center">
          <h1 className="text-2xl font-bold text-slate-800">
            Dashboard
          </h1>
          <p className="text-slate-500 text-sm">
            {isLoading ? 'Loading...' : ` ${businessName}`}
          </p>
        </div>

        {/* 3. Button on the right */}
        <button
          onClick={() => setIsDataVisible(!isDataVisible)}
          className="p-2 rounded-full hover:bg-slate-200 transition-colors"
          title={isDataVisible ? 'Hide Data' : 'Show Data'}
        >
          {isDataVisible ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
          )}
        </button>
      </div>

      <div className="flex-grow overflow-y-auto p-4 sm:p-6">
        <div className="flex w-full items-start justify-center gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <SalesCard isDataVisible={isDataVisible} />
          </div>
        </div>
        <div className="mb-6">
          <SalesBarChartReport isDataVisible={isDataVisible} />
        </div>
        <div className="flex w-full flex-wrap items-start justify-center gap-6 mb-6">
          <div className="flex-1 min-w-[280px]">
            <TopSoldItemsCard isDataVisible={isDataVisible} />
          </div>
          <div className="flex-1 min-w-[280px]">
            <TopSalespersonCard isDataVisible={isDataVisible} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;