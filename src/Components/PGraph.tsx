import { useState, useEffect } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "./ui/chart";
import type { ChartConfig } from "./ui/chart";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs, Timestamp, orderBy } from "firebase/firestore";
import { useAuth } from "../context/Authcontext";

// Define a type for your fetched sales data
interface SaleRecord {
  totalAmount: number;
  createdAt: { toDate: () => Date };
}

// Define the structure for the chart data
interface ChartData {
  date: string;
  Purchase: number;
}

const chartConfig = {
  Purchase: {
    label: "Purchase Amount",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function PurchaseBarChartReport() {
  const { currentUser } = useAuth();
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterRange, setFilterRange] = useState("7days"); // New state for filter

  useEffect(() => {
    const fetchPurchaseData = async () => {
      if (!currentUser) {
        setIsLoading(false);
        setError("Please log in to view purchase data.");
        return;
      }

      setIsLoading(true);
      setError(null);
      
      const now = new Date();
      let startTimestamp;

      // Calculate the start date based on the filter
      switch (filterRange) {
        case "today":
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          startTimestamp = Timestamp.fromDate(today);
          break;
        case "7days":
          const sevenDaysAgo = new Date(now);
          sevenDaysAgo.setDate(now.getDate() - 7);
          startTimestamp = Timestamp.fromDate(sevenDaysAgo);
          break;
        case "14days":
          const fourteenDaysAgo = new Date(now);
          fourteenDaysAgo.setDate(now.getDate() - 14);
          startTimestamp = Timestamp.fromDate(fourteenDaysAgo);
          break;
        case "month":
          const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          startTimestamp = Timestamp.fromDate(oneMonthAgo);
          break;
        default:
          startTimestamp = Timestamp.fromDate(new Date());
          break;
      }

      try {
        const PurchaseCollection = collection(db, "purchases");
        const PurchaseQuery = query(
          PurchaseCollection,
          where("userId", "==", currentUser.uid),
          where("createdAt", ">=", startTimestamp),
          orderBy("createdAt", "asc")
        );

        const querySnapshot = await getDocs(PurchaseQuery);
        const fetchedPurchases: SaleRecord[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data() as SaleRecord;
          fetchedPurchases.push(data);
        });

        // Group purchase data by date
        const purchasesByDate: { [key: string]: number } = {};
        fetchedPurchases.forEach((purchase) => {
          const date = purchase.createdAt.toDate().toLocaleDateString('en-US');
          if (!purchasesByDate[date]) {
            purchasesByDate[date] = 0;
          }
          purchasesByDate[date] += purchase.totalAmount;
        });

        // Convert grouped data into the chartData format
        const newChartData: ChartData[] = Object.keys(purchasesByDate).map((date) => ({
          date,
          Purchase: purchasesByDate[date],
        }));

        newChartData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        setChartData(newChartData);
        setIsLoading(false);

      } catch (err) {
        console.error("Error fetching purchase data:", err);
        setError("Failed to fetch purchase data. Please try again.");
        setIsLoading(false);
      }
    };

    fetchPurchaseData();
  }, [currentUser, filterRange]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-[350px] items-center justify-center">
          <p className="text-gray-500">Loading purchase data...</p>
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
        <CardTitle>Daily Purchase Chart</CardTitle>
        <CardDescription>Purchase amount for the selected period</CardDescription>
        <div className="flex gap-2 pt-2">
            <button
                onClick={() => setFilterRange("today")}
                className={`px-3 py-1 rounded-md text-sm transition ${
                    filterRange === "today" ? "bg-blue-500 text-white" : "bg-gray-200 hover:bg-gray-300"
                }`}
            >
                Today
            </button>
            <button
                onClick={() => setFilterRange("7days")}
                className={`px-3 py-1 rounded-md text-sm transition ${
                    filterRange === "7days" ? "bg-blue-500 text-white" : "bg-gray-200 hover:bg-gray-300"
                }`}
            >
                7 Days
            </button>
            <button
                onClick={() => setFilterRange("14days")}
                className={`px-3 py-1 rounded-md text-sm transition ${
                    filterRange === "14days" ? "bg-blue-500 text-white" : "bg-gray-200 hover:bg-gray-300"
                }`}
            >
                14 Days
            </button>
            <button
                onClick={() => setFilterRange("month")}
                className={`px-3 py-1 rounded-md text-sm transition ${
                    filterRange === "month" ? "bg-blue-500 text-white" : "bg-gray-200 hover:bg-gray-300"
                }`}
            >
                Month
            </button>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart
            accessibilityLayer
            data={chartData}
            margin={{
              top: 20,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Bar dataKey="Purchase" fill="var(--color-Purchase)" radius={8}>
              <LabelList
                position="top"
                offset={12}
                className="fill-foreground"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Total purchases for this period: ₹{chartData.reduce((sum, data) => sum + data.Purchase, 0).toFixed(2)}
        </div>
        <div className="text-muted-foreground leading-none">
          Showing purchase data grouped by day for the selected period.
        </div>
      </CardFooter>
    </Card>
  );
}