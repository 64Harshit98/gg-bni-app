import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
// Import the initialized db instance, not the entire SDK
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/auth-context';
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';

// --- Reusable Spinner Component ---
const Spinner: React.FC<{ size?: string }> = ({ size = 'h-8 w-8' }) => (
  <svg
    className={`animate-spin text-blue-600 ${size}`}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    ></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
  </svg>
);

// --- Data Types ---
interface Transaction {
  id: string;
  totalAmount: number;
  createdAt: Date;
}

interface PnlSummary {
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
}

// --- Custom Hook for P&L Data ---
const usePnlReport = (userId: string | undefined) => {
  const [sales, setSales] = useState<Transaction[]>([]);
  const [purchases, setPurchases] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const salesCollectionRef = collection(db, 'sales');
    const purchasesCollectionRef = collection(db, 'purchases');

    const qSales = query(salesCollectionRef, where('userId', '==', userId));
    const qPurchases = query(
      purchasesCollectionRef,
      where('userId', '==', userId),
    );

    const unsubscribeSales = onSnapshot(
      qSales,
      (snapshot) => {
        const fetchedSales = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            totalAmount: data.totalAmount || 0,
            createdAt:
              data.createdAt instanceof Timestamp
                ? data.createdAt.toDate()
                : new Date(),
          };
        });
        setSales(fetchedSales);
      },
      (err) => {
        console.error('Sales fetch error:', err);
        setError('Failed to fetch sales data.');
      },
    );

    const unsubscribePurchases = onSnapshot(
      qPurchases,
      (snapshot) => {
        const fetchedPurchases = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            totalAmount: data.totalAmount || 0,
            createdAt:
              data.createdAt instanceof Timestamp
                ? data.createdAt.toDate()
                : new Date(),
          };
        });
        setPurchases(fetchedPurchases);
      },
      (err) => {
        console.error('Purchases fetch error:', err);
        setError('Failed to fetch purchases data.');
      },
    );

    // Set loading to false after initial listeners are set up
    setLoading(false);

    return () => {
      unsubscribeSales();
      unsubscribePurchases();
    };
  }, [userId]);

  return { sales, purchases, loading, error };
};

// --- Main P&L Report Component ---
const PnlReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const {
    sales,
    purchases,
    loading: dataLoading,
    error,
  } = usePnlReport(currentUser?.uid);

  // State for date filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Memoized calculation for P&L
  const pnlSummary: PnlSummary = useMemo(() => {
    const startTimestamp = startDate
      ? new Date(startDate).setHours(0, 0, 0, 0)
      : 0;
    const endTimestamp = endDate
      ? new Date(endDate).setHours(23, 59, 59, 999)
      : Infinity;

    const filteredSales = sales.filter(
      (s) =>
        s.createdAt.getTime() >= startTimestamp &&
        s.createdAt.getTime() <= endTimestamp,
    );
    const filteredPurchases = purchases.filter(
      (p) =>
        p.createdAt.getTime() >= startTimestamp &&
        p.createdAt.getTime() <= endTimestamp,
    );

    const totalRevenue = filteredSales.reduce(
      (sum, sale) => sum + sale.totalAmount,
      0,
    );
    const totalCost = filteredPurchases.reduce(
      (sum, purchase) => sum + purchase.totalAmount,
      0,
    );
    const netProfit = totalRevenue - totalCost;

    return { totalRevenue, totalCost, netProfit };
  }, [sales, purchases, startDate, endDate]);

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
  };

  if (authLoading || dataLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
        <Spinner />
        <p className="mt-2 text-sm text-gray-500">Loading Report...</p>
      </div>
    );
  }

  if (error) {
    return <div className="text-center p-8 text-red-500">Error: {error}</div>;
  }

  if (!currentUser) {
    navigate('/login');
    return null;
  }

  return (
    <div className="container mx-auto p-4 md:p-8 font-sans">
      <div className="flex items-center text-center justify-between pb-4 border-b border-gray-200 mb-6">
        <h1 className="flex-1 text-2xl text-center sm:text-3xl font-bold text-gray-800">
          Profit & Loss Report
        </h1>
        <button
          onClick={() => navigate(-1)}
          className="rounded-full bg-gray-200 p-2 text-gray-700 transition hover:bg-gray-300"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Filter Panel */}
        <div className="w-full lg:w-1/4 bg-white rounded-lg shadow-md p-6 h-fit">
          <h3 className="text-xl font-semibold mb-4 border-b pb-2">Filters</h3>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="startDate"
                className="block text-sm font-medium text-gray-600 mb-1"
              >
                From Date
              </label>
              <input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="endDate"
                className="block text-sm font-medium text-gray-600 mb-1"
              >
                To Date
              </label>
              <input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleClearFilters}
              className="w-full bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors mt-2"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* P&L Summary */}
        <div className="w-full lg:w-3/4 flex flex-col gap-4">
          <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <span className="text-lg font-medium text-green-700">
                Total Revenue
              </span>
              <span className="text-2xl font-bold text-green-600">
                ₹{pnlSummary.totalRevenue.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex justify-between items-center border-b pb-3">
              <span className="text-lg font-medium text-red-700">
                Total Costs
              </span>
              <span className="text-2xl font-bold text-red-600">
                ₹{pnlSummary.totalCost.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-xl font-bold text-gray-800">
                Net Profit / Loss
              </span>
              <span
                className={`text-3xl font-bold ${pnlSummary.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}
              >
                ₹{pnlSummary.netProfit.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PnlReportPage;
