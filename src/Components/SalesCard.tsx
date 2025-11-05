import React, { useState, useEffect, useMemo } from 'react';
// --- FIX: Import 'db' from firebase ---
import { db } from '../lib/Firebase';
import {
  collection,
  query,
  where,
  onSnapshot
} from 'firebase/firestore';
import type { FirestoreError } from 'firebase/firestore';
import { useAuth } from '../context/Auth-Context'; // <-- Uses the correct hook
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { useFilter } from './Filter';


/**
 * Custom hook to fetch and compare sales data for a specific company over two date ranges.
 */
const useSalesComparison = (companyId: string | undefined) => {
  const { filters } = useFilter();
  const [sales, setSales] = useState(0);
  const [comparisonSales, setComparisonSales] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !companyId || !filters.startDate || !filters.endDate) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // --- FIX: The global 'salesCollection' is removed ---

    // --- Main Date Range (from filter) ---
    const startDate = new Date(filters.startDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(filters.endDate);
    endDate.setHours(23, 59, 59, 999);

    // --- Comparison Date Range ---
    const dateDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
    const comparisonStartDate = new Date(startDate);
    comparisonStartDate.setDate(startDate.getDate() - (dateDiff + 1));
    const comparisonEndDate = new Date(startDate);
    comparisonEndDate.setDate(startDate.getDate() - 1);
    comparisonEndDate.setHours(23, 59, 59, 999);

    // --- FIX: Update queries to use the multi-tenant path ---
    const qSales = query(
      collection(db, 'companies', companyId, 'sales'), // Correct path
      // 'where('companyId', ...)' is no longer needed
      where('createdAt', '>=', startDate),
      where('createdAt', '<=', endDate)
      // Note: You may need to add orderBy back if you get an error
      // orderBy('createdAt', 'asc') 
    );

    const qComparison = query(
      collection(db, 'companies', companyId, 'sales'), // Correct path
      // 'where('companyId', ...)' is no longer needed
      where('createdAt', '>=', comparisonStartDate),
      where('createdAt', '<=', comparisonEndDate)
    );

    const unsubscribeSales = onSnapshot(qSales, (snapshot) => {
      let total = 0;
      snapshot.forEach((doc) => total += doc.data().totalAmount || 0);
      setSales(total);
      setLoading(false);
    }, (err: FirestoreError) => {
      console.error("Sales snapshot error: ", err);
      setError(`Failed to load sales data: ${err.message}`);
      setLoading(false);
    });

    const unsubscribeComparison = onSnapshot(qComparison, (snapshot) => {
      let total = 0;
      snapshot.forEach((doc) => total += doc.data().totalAmount || 0);
      setComparisonSales(total);
    }, (err: FirestoreError) => {
      console.error("Comparison sales snapshot error: ", err);
      // Don't set loading/error for the comparison, it's less critical
    });

    return () => {
      unsubscribeSales();
      unsubscribeComparison();
    };
  }, [companyId, filters]); // companyId is correctly in the dependency array

  return { sales, comparisonSales, loading, error };
};

interface SalesCardProps {
  isDataVisible: boolean;
}

export const SalesCard: React.FC<SalesCardProps> = ({ isDataVisible }) => {
  const { currentUser } = useAuth(); // This uses the hook from auth-context
  const { sales, comparisonSales, loading, error } = useSalesComparison(
    currentUser?.companyId,
  );

  const percentageChange = useMemo(() => {
    if (loading || error) return 0;
    if (comparisonSales === 0) {
      return sales > 0 ? 100 : 0;
    }
    return ((sales - comparisonSales) / comparisonSales) * 100;
  }, [sales, comparisonSales, loading, error]);

  const isPositive = percentageChange >= 0;

  return (
    <Card>
      <CardHeader className='-mb-4'>
        <CardTitle>Total Sales</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center text-gray-500">Loading...</div>
        ) : error ? (
          <div className="text-center text-red-500">{error}</div>
        ) : (
          <div className="text-center">
            <p className="text-4xl font-bold text-blue-600">
              {isDataVisible ? `₹${sales.toLocaleString('en-IN')}` : '₹ ******'}
            </p>
            <p className="text-md text-gray-500 mt-2">
              <span className={`font-bold ${isDataVisible ? (isPositive ? 'text-green-600' : 'text-red-600') : 'text-gray-500'}`}>
                {isDataVisible ? `${percentageChange.toFixed(1)}%` : '**.*%'}
              </span>{' '}
              vs. previous period
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};