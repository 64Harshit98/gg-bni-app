import React, { useState, useEffect } from 'react';
import { db } from '../lib/Firebase';
import { useAuth, useDatabase } from '../context/Auth-Context';
import { collection, query, onSnapshot, where, Timestamp, orderBy } from 'firebase/firestore'; // Added orderBy
import type { FirestoreError } from 'firebase/firestore';
import { Spinner } from '../constants/Spinner';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { useFilter } from './Filter';

// --- Interfaces ---
interface SaleDoc {
  salesmanId: string;
  totalAmount: number;
  companyId: string;
  createdAt: Timestamp;
}
interface TopSalesperson {
  name: string;
  billCount: number;
  totalAmount: number;
}

// --- Custom Hook to Fetch and Process Top Salespeople ---
const useTopSalespeople = () => {
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const { filters } = useFilter();

  const [topByAmount, setTopByAmount] = useState<TopSalesperson[]>([]);
  const [topByCount, setTopByCount] = useState<TopSalesperson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.companyId || !dbOperations || !filters.startDate || !filters.endDate) {
      setLoading(!currentUser || !dbOperations);
      return;
    }

    setLoading(true);
    setError(null); // Reset error on new fetch
    const start = new Date(filters.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(filters.endDate);
    end.setHours(23, 59, 59, 999);

    // --- FIX: Use the correct multi-tenant path ---
    const salesQuery = query(
      collection(db, 'companies', currentUser.companyId, 'sales'),
      // --- FIX: The 'companyId' where clause is no longer needed ---
      where('createdAt', '>=', start),
      where('createdAt', '<=', end),
      orderBy('createdAt', 'asc') // Add orderBy for consistent query
    );

    const unsubscribe = onSnapshot(salesQuery, async (snapshot) => {
      try {
        // This is correct, as dbOperations is already multi-tenant
        const salesmen = await dbOperations.getSalesmen();
        const salesmanMap = new Map(salesmen.map(s => [s.uid, s.name]));

        if (salesmanMap.size === 0) {
          setTopByAmount([]);
          setTopByCount([]);
          setLoading(false);
          return;
        }

        const stats = new Map<string, { billCount: number; totalAmount: number }>();
        snapshot.docs.forEach((doc) => {
          const sale = doc.data() as SaleDoc;
          if (sale.salesmanId && salesmanMap.has(sale.salesmanId)) {
            const currentStats = stats.get(sale.salesmanId) || { billCount: 0, totalAmount: 0 };
            stats.set(sale.salesmanId, {
              billCount: currentStats.billCount + 1,
              totalAmount: currentStats.totalAmount + (sale.totalAmount || 0),
            });
          }
        });

        const allSalespeople = Array.from(stats.entries()).map(([userId, { billCount, totalAmount }]) => ({
          name: salesmanMap.get(userId) || 'Unknown',
          billCount,
          totalAmount,
        }));

        // Sort by Total Amount for the 'Amount' view
        const sortedByAmount = [...allSalespeople].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 5);
        setTopByAmount(sortedByAmount);

        // Sort by Bill Count for the 'Quantity' view
        const sortedByCount = [...allSalespeople].sort((a, b) => b.billCount - a.billCount).slice(0, 5);
        setTopByCount(sortedByCount);

        setError(null);
      } catch (err) {
        console.error('Error processing sales data:', err);
        setError('Failed to process sales data.');
      } finally {
        setLoading(false);
      }
    }, (err: FirestoreError) => { // Specify type for err
      console.error('Error fetching sales:', err);
      setError(`Failed to load sales data: ${err.message}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser, dbOperations, filters]);

  return { topByAmount, topByCount, loading, error };
};

// --- Main Card Component ---
interface TopSalespersonCardProps {
  isDataVisible: boolean;
}

export const TopSalespersonCard: React.FC<TopSalespersonCardProps> = ({ isDataVisible }) => {
  const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');
  const { topByAmount, topByCount, loading, error } = useTopSalespeople();

  const renderContent = () => {
    if (loading) return <Spinner />;
    if (error) return <p className="text-center text-red-500">{error}</p>;
    if (!isDataVisible) {
      return (
        <div className="flex flex-col items-center justify-center text-center text-gray-500 py-8">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
          Data is hidden
        </div>
      );
    }

    const salespeopleToDisplay = viewMode === 'amount' ? topByAmount : topByCount;

    if (salespeopleToDisplay.length === 0) {
      return <p className="text-center text-gray-500 py-8">No sales data for this period.</p>;
    }

    return (
      <ul className="space-y-4">
        {salespeopleToDisplay.map((person, index) => (
          <li key={person.name + index} className="flex items-center">
            <div className="flex items-center w-3/5">
              <span className={`text-sm font-bold rounded-full h-6 w-6 flex items-center justify-center mr-3 flex-shrink-0 ${viewMode === 'amount' ? 'text-blue-600 bg-blue-100' : 'text-blue-600 bg-blue-100'}`}>{index + 1}</span>
              <span className="font-medium text-gray-700 truncate">{person.name}</span>
            </div>
            <div className="w-2/5 text-right">
              {viewMode === 'amount' ? (
                <span className="font-semibold text-gray-800">
                  {person.totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })}
                </span>
              ) : (
                <>
                  <span className="font-semibold text-gray-800">{person.billCount}</span>
                  <span className="text-xs text-gray-500 ml-1">sales</span>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Top 5 Salespeople</CardTitle>
        <div className="flex items-center p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setViewMode('amount')}
            className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'amount' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
          >
            Amt
          </button>
          <button
            onClick={() => setViewMode('quantity')}
            className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'quantity' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
          >
            Qty
          </button>
        </div>
      </CardHeader>
      <CardContent>{renderContent()}</CardContent>
    </Card>
  );
};