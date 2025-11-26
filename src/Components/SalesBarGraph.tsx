import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/Firebase';
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { Line, LineChart, CartesianGrid, YAxis } from 'recharts';
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
import { useFilter } from './Filter';

// --- Interfaces ---
interface SaleRecord {
  totalAmount: number;
  createdAt: { toDate: () => Date };
  companyId: string;
}
interface ChartData {
  date: string;
  sales: number;
  bills: number; // To store the count of bills
}

// --- Chart Configuration ---
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

interface SalesBarChartReportProps {
  isDataVisible: boolean;
}

export function SalesBarChartReport({
  isDataVisible,
}: SalesBarChartReportProps) {
  const { currentUser } = useAuth();
  const { filters } = useFilter();
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');

  useEffect(() => {
    const fetchSalesData = async () => {
      if (!currentUser?.companyId || !filters.startDate || !filters.endDate) {
        setIsLoading(false);
        setChartData([]);
        return;
      }
      setIsLoading(true);
      setError(null);

      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);

      try {
        // --- FIX: Use the correct multi-tenant path ---
        const salesQuery = query(
          collection(db, 'companies', currentUser.companyId, 'sales'),
          // --- FIX: The 'companyId' where clause is no longer needed ---
          where('createdAt', '>=', Timestamp.fromDate(start)),
          where('createdAt', '<=', Timestamp.fromDate(end)),
          orderBy('createdAt', 'asc'),
        );
        const querySnapshot = await getDocs(salesQuery);

        // This object will now store both sales and bill counts
        const salesByDate: { [key: string]: { sales: number; bills: number } } =
          {};

        // Initialize all dates in the range with 0 sales and 0 bills
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateKey = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
          salesByDate[dateKey] = { sales: 0, bills: 0 };
        }

        querySnapshot.forEach((doc) => {
          const sale = doc.data() as SaleRecord;
          const dateKey = sale.createdAt.toDate().toLocaleDateString('en-CA');
          if (salesByDate[dateKey]) {
            salesByDate[dateKey].sales += sale.totalAmount;
            salesByDate[dateKey].bills += 1;
          }
        });

        const newChartData: ChartData[] = Object.keys(salesByDate).map(
          (date) => ({
            date,
            sales: salesByDate[date].sales,
            bills: salesByDate[date].bills,
          }),
        );

        setChartData(newChartData);
      } catch (err) {
        console.error('Error fetching sales data:', err);
        setError('Failed to fetch sales data.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSalesData();
  }, [currentUser, filters]); // currentUser dependency is correct

  const { totalSales, totalBills } = useMemo(() => {
    return chartData.reduce(
      (acc, data) => {
        acc.totalSales += data.sales;
        acc.totalBills += data.bills;
        return acc;
      },
      { totalSales: 0, totalBills: 0 },
    );
  }, [chartData]);

  const selectedPeriodText = useMemo(() => {
    if (!filters.startDate || !filters.endDate) {
      return 'for the selected period';
    }
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'numeric',
      year: '2-digit',
    };
    const startDate = new Date(filters.startDate).toLocaleDateString(
      'en-IN',
      options,
    );
    const endDate = new Date(filters.endDate).toLocaleDateString(
      'en-IN',
      options,
    );

    if (startDate === endDate) {
      return `for ${startDate}`;
    }
    return `from ${startDate} to ${endDate}`;
  }, [filters.startDate, filters.endDate]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between -mb-6">
        <div className="mb-2">
          <CardTitle>Daily Performance</CardTitle>
          <CardDescription>
            {viewMode === 'amount' ? 'Sales amount' : 'Number of bills'}{' '}
            {selectedPeriodText}
          </CardDescription>
        </div>
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
      <CardContent>
        {isLoading ? (
          <div className="flex h-[260px] items-center justify-center"></div>
        ) : error ? (
          <div className="flex h-[260px] items-center justify-center text-center">
            <p className="text-red-500">{error}</p>
          </div>
        ) : isDataVisible ? (
          <ChartContainer config={chartConfig} className="h-[260px] w-full">
            <LineChart
              data={chartData}
              margin={{ top: 30, left: -15, right: 12, bottom: 10 }}
            >
              <CartesianGrid vertical={false} />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <YAxis
                stroke="#888888"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  viewMode === 'amount' ? `₹${value / 1000}k` : value.toString()
                }
              />
              <Line
                dataKey={viewMode === 'amount' ? 'sales' : 'bills'}
                type="monotone"
                stroke={
                  viewMode === 'amount'
                    ? chartConfig.sales.color
                    : chartConfig.bills.color
                }
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <div className="flex h-[250px] w-full flex-col items-center justify-center rounded-lg bg-gray-100">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-400 mb-2"
            >
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <line x1="2" x2="22" y1="2" y2="22" />
            </svg>
            <p className="text-gray-500">Data is hidden</p>
          </div>
        )}
      </CardContent>
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
