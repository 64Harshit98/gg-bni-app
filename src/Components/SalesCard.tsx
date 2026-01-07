import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/Firebase';
import {
  collection,
  query,
  where,
  getAggregateFromServer,
  sum
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { useDashboard } from '../context/DashboardContext'; // 1. Import Global Context
import { useFilter } from './Filter';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';

/**
 * Helper Hook: Only fetches the PREVIOUS period data.
 * The Current period data comes from the Global Dashboard Context.
 */
const usePreviousPeriodSales = (companyId: string | undefined) => {
  const { filters } = useFilter();
  const [comparisonSales, setComparisonSales] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !companyId || !filters.startDate || !filters.endDate) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const fetchPreviousSales = async () => {
      try {
        // --- Calculate Previous Date Range ---
        const startDate = new Date(filters.startDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);

        const periodLengthMs = endDate.getTime() - startDate.getTime();
        const comparisonEndDateMs = startDate.getTime() - 1;
        const comparisonEndDate = new Date(comparisonEndDateMs);
        const comparisonStartDate = new Date(comparisonEndDateMs - periodLengthMs);
        comparisonStartDate.setHours(0, 0, 0, 0);

        // --- Fetch ONLY the previous period (Cost: 1 Read) ---
        const salesCollection = collection(db, 'companies', companyId, 'sales');
        const qComparison = query(
          salesCollection,
          where('createdAt', '>=', comparisonStartDate),
          where('createdAt', '<=', comparisonEndDate)
        );

        const snapshot = await getAggregateFromServer(qComparison, {
          total: sum('totalAmount')
        });

        if (isMounted) {
          setComparisonSales(snapshot.data().total || 0);
        }
      } catch (err) {
        console.error("Error fetching comparison sales:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPreviousSales();

    return () => { isMounted = false; };
  }, [companyId, filters.startDate, filters.endDate]);

  return { comparisonSales, loading };
};


// --- Main Component ---
interface SalesCardProps {
  isDataVisible: boolean;
}

export const SalesCard: React.FC<SalesCardProps> = ({ isDataVisible }) => {
  const { currentUser } = useAuth();

  // 1. Get Current Sales from Global State (Instant, 0 Reads)
  const { salesData, loading: dashboardLoading } = useDashboard();

  // 2. Get Previous Sales from local optimized fetch (1 Read)
  const { comparisonSales, loading: comparisonLoading } = usePreviousPeriodSales(currentUser?.companyId);

  // 3. Calculate Current Total from Global Data
  const currentSales = useMemo(() => {
    if (!salesData) return 0;
    return salesData.reduce((acc, sale) => acc + (sale.totalAmount || 0), 0);
  }, [salesData]);

  // Combined Loading State
  const isLoading = dashboardLoading || comparisonLoading;

  // 4. Calculate Percentage
  const percentageChange = useMemo(() => {
    if (isLoading) return 0;
    if (comparisonSales === 0) return currentSales > 0 ? 100 : 0;
    return ((currentSales - comparisonSales) / comparisonSales) * 100;
  }, [currentSales, comparisonSales, isLoading]);

  const isPositive = percentageChange >= 0;

  return (
    <Card>
      <CardHeader className='-mb-4'>
        <CardTitle>Total Sales</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center text-gray-500">Loading...</div>
        ) : (
          <div className="text-center">
            <p className="text-4xl font-bold text-blue-600">
              {isDataVisible ? `₹${currentSales.toLocaleString('en-IN')}` : '₹ ******'}
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