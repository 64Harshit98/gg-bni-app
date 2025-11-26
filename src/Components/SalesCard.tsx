import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/Firebase';
import {
  collection,
  query,
  where,
  onSnapshot
} from 'firebase/firestore';
import type { FirestoreError } from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
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

    // --- Main Date Range (from filter) ---
    const startDate = new Date(filters.startDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(filters.endDate);
    endDate.setHours(23, 59, 59, 999);

    // --- Comparison Date Range FIX ---

    // Calculate the length of the current period in milliseconds.
    const periodLengthMs = endDate.getTime() - startDate.getTime();

    // Comparison End Date: The millisecond before the current period began.
    const comparisonEndDateMs = startDate.getTime() - 1;
    const comparisonEndDate = new Date(comparisonEndDateMs);

    // Comparison Start Date: Subtract the full period length from the comparison end point.
    const comparisonStartDate = new Date(comparisonEndDateMs - periodLengthMs);
    // Ensure it starts exactly at 00:00:00 of its start day (optional, but good practice)
    comparisonStartDate.setHours(0, 0, 0, 0);

    // --- Update queries to use the multi-tenant path ---
    const qSales = query(
      collection(db, 'companies', companyId, 'sales'),
      where('createdAt', '>=', startDate),
      where('createdAt', '<=', endDate)
    );

    const qComparison = query(
      collection(db, 'companies', companyId, 'sales'),
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
    });

    return () => {
      unsubscribeSales();
      unsubscribeComparison();
    };
  }, [companyId, filters]);

  return { sales, comparisonSales, loading, error };
};

interface SalesCardProps {
  isDataVisible: boolean;
}

export const SalesCard: React.FC<SalesCardProps> = ({ isDataVisible }) => {
  const { currentUser } = useAuth();
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