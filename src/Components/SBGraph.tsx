import { useState, useEffect } from 'react';
import { useAuth } from '../context/auth-context';
import { db } from '../lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import { Line, LineChart, CartesianGrid, LabelList, XAxis } from 'recharts';
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

// --- Type Definitions ---
interface SaleRecord {
  totalAmount: number;
  createdAt: { toDate: () => Date };
}
interface ChartData {
  date: string;
  sales: number;
}
const chartConfig = {
  sales: {
    label: 'Sales Amount',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

interface SalesBarChartReportProps {
  isDataVisible: boolean;
}

export function SalesBarChartReport({ isDataVisible }: SalesBarChartReportProps) {
  const { currentUser } = useAuth();
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterRange, setFilterRange] = useState('7days');

  useEffect(() => {
    const fetchSalesData = async () => {
      if (!currentUser) {
        setIsLoading(false);
        setError('Please log in to view sales data.');
        return;
      }
      setIsLoading(true);
      setError(null);
      const now = new Date();
      let startTimestamp;
      switch (filterRange) {
        case 'today': {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          startTimestamp = Timestamp.fromDate(today);
          break;
        }
        case '7days': {
          const sevenDaysAgo = new Date(now);
          sevenDaysAgo.setDate(now.getDate() - 7);
          startTimestamp = Timestamp.fromDate(sevenDaysAgo);
          break;
        }
        case '14days': {
          const fourteenDaysAgo = new Date(now);
          fourteenDaysAgo.setDate(now.getDate() - 14);
          startTimestamp = Timestamp.fromDate(fourteenDaysAgo);
          break;
        }
        case 'month': {
          const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          startTimestamp = Timestamp.fromDate(oneMonthAgo);
          break;
        }
        default:
          startTimestamp = Timestamp.fromDate(new Date());
          break;
      }
      try {
        const salesCollection = collection(db, 'sales');
        const salesQuery = query(
          salesCollection,
          where('userId', '==', currentUser.uid),
          where('createdAt', '>=', startTimestamp),
          orderBy('createdAt', 'asc'),
        );
        const querySnapshot = await getDocs(salesQuery);
        const fetchedSales: SaleRecord[] = [];
        querySnapshot.forEach((doc) => {
          fetchedSales.push(doc.data() as SaleRecord);
        });
        const salesByDate: { [key: string]: number } = {};
        fetchedSales.forEach((sale) => {
          const date = sale.createdAt.toDate().toLocaleDateString('en-US');
          if (!salesByDate[date]) {
            salesByDate[date] = 0;
          }
          salesByDate[date] += sale.totalAmount;
        });
        const newChartData: ChartData[] = Object.keys(salesByDate).map((date) => ({
          date,
          sales: salesByDate[date],
        }));
        newChartData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setChartData(newChartData);
      } catch (err) {
        console.error('Error fetching sales data:', err);
        setError('Failed to fetch sales data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSalesData();
  }, [currentUser, filterRange]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-[350px] items-center justify-center">
          <p className="text-gray-500">Loading sales data...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex h-[350px] items-center justify-center">
          <p className="text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Daily Sales Chart</CardTitle>
        <CardDescription>Sales amount for the selected period</CardDescription>
        <div className="flex gap-2 pt-2">
          {['today', '7days', '14days', 'month'].map((range) => (
            <button
              key={range}
              onClick={() => setFilterRange(range)}
              className={`px-3 py-1 rounded-md text-sm transition ${filterRange === range
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 hover:bg-gray-300'
                }`}
            >
              {range.charAt(0).toUpperCase() + range.slice(1).replace('days', ' Days')}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isDataVisible ? (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <LineChart accessibilityLayer data={chartData} margin={{ top: 30 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) =>
                  new Date(value).toLocaleDateString('en-US', {
                    day: 'numeric',
                    month: 'short',
                  })
                }
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Line
                dataKey="sales"
                type="monotone"
                stroke="var(--color-sales)"
                strokeWidth={2}
                dot={{ r: 4 }}
              >
                <LabelList
                  position="top"
                  offset={12}
                  className="fill-foreground"
                  fontSize={12}
                  formatter={(value: number) => `₹${value.toLocaleString()}`}
                />
              </Line>
            </LineChart>
          </ChartContainer>
        ) : (
          <div className="flex h-[250px] w-full flex-col items-center justify-center rounded-lg bg-gray-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 mb-2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
            <p className="text-gray-500">Data is hidden</p>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Total sales for this period:
          {isDataVisible ? (
            ` ₹${chartData.reduce((sum, data) => sum + data.sales, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          ) : (
            ' ₹ ******'
          )}
        </div>
        <div className="text-muted-foreground leading-none">
          Showing sales data grouped by day for the selected period.
        </div>
      </CardFooter>
    </Card>
  );
}