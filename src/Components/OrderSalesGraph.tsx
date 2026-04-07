import { useState, useMemo } from 'react';
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
import { useFilter } from './Filter';
interface ChartDataPoint {
    date: string;
    sales: number;
    bills: number;
}

const chartConfig = {
    sales: { label: 'Sales', color: '#F97316' },
    bills: { label: 'Bills', color: '#F97316' },
} satisfies ChartConfig;

// ── Props (data comes from HomePage, no internal fetch) ──────────────────────
interface OrderBarChartReportProps {
    isDataVisible: boolean;
    chartData: ChartDataPoint[];
    totalSales: number;
    totalBills: number;
    loading: boolean;
}

export function OrderBarChartReport({
    isDataVisible,
    chartData,
    totalSales,
    totalBills,
    loading,
}: OrderBarChartReportProps) {
    const { filters } = useFilter();
    const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');

    const selectedPeriodText = useMemo(() => {
        if (!filters.startDate || !filters.endDate) {
            return 'for the selected period';
        }
        const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'numeric', year: '2-digit' };
        const startDate = new Date(filters.startDate).toLocaleDateString('en-IN', options);
        const endDate = new Date(filters.endDate).toLocaleDateString('en-IN', options);

        if (startDate === endDate) {
            return `for ${startDate}`;
        }
        return `from ${startDate} to ${endDate}`;
    }, [filters.startDate, filters.endDate]);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between -mb-6">
                <div>
                    <CardTitle>Daily Performance</CardTitle>
                    <CardDescription>
                        {viewMode === 'amount' ? 'Sales amount' : 'Number of bills'} {selectedPeriodText}
                    </CardDescription>
                </div>
                <div className="flex items-center p-1 bg-gray-100 rounded-lg">
                    <button
                        onClick={() => setViewMode('amount')}
                        className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'amount' ? 'bg-white text-[#F97316] shadow-sm' : 'text-gray-500'}`}
                    >
                        Amt
                    </button>
                    <button
                        onClick={() => setViewMode('quantity')}
                        className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'quantity' ? 'bg-white text-[#F97316] shadow-sm' : 'text-gray-500'}`}
                    >
                        Qty
                    </button>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? <div className="flex h-[260px] items-center justify-center"></div> :
                    isDataVisible ? (
                        <ChartContainer config={chartConfig} className="h-[260px] w-full">
                            {/* --- FIX: Changed to LineChart --- */}
                            <LineChart data={chartData} margin={{ top: 30, left: -10, right: 12, bottom: 10 }}>
                                <CartesianGrid vertical={false} />
                                <ChartTooltip
                                    cursor={{ stroke: '#ccc', strokeWidth: 1 }}
                                    content={
                                        <ChartTooltipContent
                                            labelFormatter={(label) =>
                                                new Date(label).toLocaleDateString('en-IN', {
                                                    day: '2-digit',
                                                    month: '2-digit',
                                                })
                                            }
                                        />
                                    }
                                />
                                <XAxis
                                    dataKey="date"
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    fontSize={10}
                                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                />
                                <YAxis
                                    stroke="#888888"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => viewMode === 'amount' ? `₹${value / 1000}k` : value.toString()}
                                />
                                {/* --- FIX: Changed to Line --- */}
                                <Line
                                    dataKey={viewMode === 'amount' ? 'sales' : 'bills'}
                                    type="monotone"
                                    stroke={viewMode === 'amount' ? chartConfig.sales.color : chartConfig.bills.color}
                                    strokeWidth={2}
                                    dot={{ r: 4 }}
                                />
                            </LineChart>
                        </ChartContainer>
                    ) : (
                        <div className="flex h-[250px] w-full flex-col items-center justify-center rounded-lg bg-white">
                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 mb-2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                            <p className="text-gray-500">Data is hidden</p>
                        </div>
                    )}
            </CardContent>
            <CardFooter className="flex-col items-start gap-2 text-sm">
                <div className="flex gap-2 leading-none font-medium">
                    Total {viewMode === 'amount' ? 'Sales' : 'Bills'}:
                    {isDataVisible ? (
                        viewMode === 'amount' ?
                            ` ₹${totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` :
                            ` ${totalBills} bills`
                    ) : (' ******')}
                </div>
            </CardFooter>
        </Card>
    );
}