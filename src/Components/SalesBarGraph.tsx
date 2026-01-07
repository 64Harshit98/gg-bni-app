import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/Firebase';
import {
  collection,
  query,
  where,
  getAggregateFromServer,
  sum,
  count,
  Timestamp
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { useDashboard } from '../context/DashboardContext';
import { useFilter } from './Filter';
import { Line, LineChart, CartesianGrid, YAxis, XAxis } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';
import type { ChartConfig } from './ui/chart';

// --- Interfaces ---
interface ChartData {
  date: string;
  sales: number;
  bills: number;
  label: string;
}

const chartConfig = {
  sales: {
    label: 'Sales',
    color: '#3b82f6',
  },
  bills: {
    label: 'Bills',
    color: '#3b82f6',
  },
} satisfies ChartConfig;

/**
 * Helper Hook for the "Yesterday Dot" (Visual Padding)
 */
const usePaddingDayStats = (companyId: string | undefined, targetDate: Date | null) => {
  const [stats, setStats] = useState<{ sales: number, bills: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!db || !companyId || !targetDate) {
      setStats(null);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const fetchPadding = async () => {
      try {
        const start = new Date(targetDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(targetDate);
        end.setHours(23, 59, 59, 999);

        const q = query(
          collection(db, 'companies', companyId, 'sales'),
          where('createdAt', '>=', Timestamp.fromDate(start)),
          where('createdAt', '<=', Timestamp.fromDate(end))
        );

        const snapshot = await getAggregateFromServer(q, {
          sales: sum('totalAmount'),
          bills: count()
        });

        if (isMounted) {
          setStats({
            sales: snapshot.data().sales || 0,
            bills: snapshot.data().bills || 0
          });
        }
      } catch (e) {
        console.error("Padding fetch failed", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPadding();
    return () => { isMounted = false; };
  }, [companyId, targetDate ? targetDate.toISOString() : null]);

  return { stats, loading };
};

interface SalesBarChartReportProps {
  isDataVisible: boolean;
}

export function SalesBarChartReport({
  isDataVisible,
}: SalesBarChartReportProps) {
  const { currentUser } = useAuth();
  const { filters } = useFilter();
  const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');

  // 1. Get Global Data
  const { salesData, loading: dashboardLoading } = useDashboard();

  // 2. Padding Logic
  const paddingDate = useMemo(() => {
    if (!filters.startDate || !filters.endDate) return null;
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);

    if (start.toDateString() === end.toDateString()) {
      const yesterday = new Date(start);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }
    return null;
  }, [filters.startDate, filters.endDate]);

  const { stats: paddingStats, loading: paddingLoading } = usePaddingDayStats(currentUser?.companyId, paddingDate);

  // 3. Process Data
  const chartData = useMemo(() => {
    if (!filters.startDate || !filters.endDate) return [];

    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);

    const dataMap = new Map<string, ChartData>();
    const getKey = (d: Date) => d.toLocaleDateString('en-CA');

    let current = new Date(start);
    while (current <= end) {
      dataMap.set(getKey(current), {
        date: getKey(current),
        label: current.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        sales: 0,
        bills: 0
      });
      current.setDate(current.getDate() + 1);
    }

    if (salesData) {
      salesData.forEach(sale => {
        const saleDate = sale.createdAt.toDate();
        const key = getKey(saleDate);
        const entry = dataMap.get(key);
        if (entry) {
          entry.sales += sale.totalAmount || 0;
          entry.bills += 1;
        }
      });
    }

    let results = Array.from(dataMap.values());

    if (paddingDate && paddingStats) {
      const padKey = getKey(paddingDate);
      results.unshift({
        date: padKey,
        label: paddingDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        sales: paddingStats.sales,
        bills: paddingStats.bills
      });
    }

    return results;
  }, [salesData, filters.startDate, filters.endDate, paddingDate, paddingStats]);

  // 4. Calculate Total
  const { totalSales, totalBills } = useMemo(() => {
    if (!salesData) return { totalSales: 0, totalBills: 0 };
    return salesData.reduce(
      (acc, sale) => {
        acc.totalSales += sale.totalAmount || 0;
        acc.totalBills += 1;
        return acc;
      },
      { totalSales: 0, totalBills: 0 }
    );
  }, [salesData]);

  const isLoading = dashboardLoading || paddingLoading;

  const selectedPeriodText = useMemo(() => {
    if (!filters.startDate || !filters.endDate) return 'for the selected period';
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'numeric', year: '2-digit' };
    const start = new Date(filters.startDate).toLocaleDateString('en-IN', options);
    const end = new Date(filters.endDate).toLocaleDateString('en-IN', options);
    return start === end ? `for ${start}` : `from ${start} to ${end}`;
  }, [filters.startDate, filters.endDate]);

  return (
    <Card>
      {/* Header always visible */}
      <CardHeader className="flex flex-row items-center justify-between -mb-6">
        <div className="mb-2">
          <CardTitle>Daily Performance</CardTitle>
          <CardDescription>
            {viewMode === 'amount' ? 'Sales amount' : 'Number of bills'}{' '}
            {selectedPeriodText}
          </CardDescription>
        </div>
        <div className="flex items-center p-1 bg-gray-100 rounded-lg">
          <button onClick={() => setViewMode('amount')} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'amount' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>Amt</button>
          <button onClick={() => setViewMode('quantity')} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'quantity' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>Qty</button>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-gray-400">Loading daily stats...</div>
        ) : !isDataVisible ? (
          // --- HIDDEN STATE (Replaces Chart) ---
          <div className="flex h-[260px] w-full flex-col items-center justify-center rounded-lg bg-gray-50 border border-gray-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300 mb-2">
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <line x1="2" x2="22" y1="2" y2="22" />
            </svg>
            <p className="text-gray-400 font-medium">Data Hidden</p>
          </div>
        ) : (
          // --- VISIBLE STATE (Shows Chart) ---
          <ChartContainer config={chartConfig} className="h-[260px] w-full">
            <LineChart data={chartData} margin={{ top: 30, left: 10, right: 10, bottom: 10 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} minTickGap={32} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => viewMode === 'amount' ? `₹${value / 1000}k` : value.toString()} />
              <Line dataKey={viewMode === 'amount' ? 'sales' : 'bills'} type="monotone" stroke={viewMode === 'amount' ? chartConfig.sales.color : chartConfig.bills.color} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>

      {/* Footer always visible */}
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Total {viewMode === 'amount' ? 'Sales' : 'Bills'}:
          {isDataVisible
            ? viewMode === 'amount'
              ? ` ₹${totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
              : ` ${totalBills} bills`
            : ' ******'}
        </div>
      </CardFooter>
    </Card>
  );
}