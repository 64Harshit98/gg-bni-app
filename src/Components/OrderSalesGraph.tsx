import { useState, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, YAxis, XAxis, ResponsiveContainer, Tooltip } from 'recharts';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from './ui/card';
import { cn } from '../lib/utils';
import { useFilter } from './Filter';

interface ChartDataPoint {
    date: string;
    sales: number;
    bills: number;
}

// ── Props (data comes from HomePage, no internal fetch) ──────────────────────
interface OrderBarChartReportProps {
    isDataVisible: boolean;
    chartData: ChartDataPoint[];
    totalSales: number;
    totalBills: number;
    loading: boolean;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{ color?: string; value?: number }>;
    label?: string;
    viewMode: 'amount' | 'quantity';
}

function CustomTooltip({ active, payload, label, viewMode }: CustomTooltipProps) {
    if (active && payload && payload.length) {
        const point = payload[0];
        return (
            <div className="bg-card border border-border p-2 rounded-lg shadow-sm text-sm">
                <p className="font-semibold mb-1">
                    {label ? new Date(label).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' }) : ''}
                </p>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: point.color }} />
                    <span>{viewMode === 'amount' ? 'Sales' : 'Bills'}:</span>
                    <span className="font-medium">
                        {viewMode === 'amount' ? `₹${(point.value ?? 0).toLocaleString()}` : point.value}
                    </span>
                </div>
            </div>
        );
    }
    return null;
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

    const processedChartData = useMemo(() => {
        if (!filters.startDate || !filters.endDate) return chartData;

        const start = new Date(filters.startDate);
        const end = new Date(filters.endDate);

        const isTodayFilter =
            start.toDateString() === end.toDateString();

        if (!isTodayFilter) return chartData;

        const yesterday = new Date(start);
        yesterday.setDate(yesterday.getDate() - 1);

        const format = (d: Date) =>
            d.toLocaleDateString('en-CA');

        const yesterdayKey = format(yesterday);
        const todayKey = format(end);

        const map = new Map(chartData.map(item => [item.date, item]));

        return [
            map.get(yesterdayKey) || { date: yesterdayKey, sales: 0, bills: 0 },
            map.get(todayKey) || { date: todayKey, sales: 0, bills: 0 },
        ];

    }, [chartData, filters.startDate, filters.endDate]);

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

    const strokeColor = viewMode === 'amount' ? 'var(--primary)' : 'var(--success)';

    return (
        <Card className="h-full flex flex-col gap-3 rounded-2xl border border-border/70 border-t-2 border-t-primary py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between px-4 pb-0">
                <div>
                    <CardTitle>Daily Performance</CardTitle>
                    <CardDescription>
                        {viewMode === 'amount' ? 'Sales amount' : 'Number of bills'} {selectedPeriodText}
                    </CardDescription>
                </div>
                <div className="flex items-center rounded-full border border-border bg-muted p-0.5">
                    <button
                        onClick={() => setViewMode('amount')}
                        className={cn('rounded-full px-3 py-1 text-xs font-semibold transition-all', viewMode === 'amount' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                    >
                        Amt
                    </button>
                    <button
                        onClick={() => setViewMode('quantity')}
                        className={cn('rounded-full px-3 py-1 text-xs font-semibold transition-all', viewMode === 'quantity' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                    >
                        Qty
                    </button>
                </div>
            </CardHeader>
            <CardContent className="pl-0 pr-4 flex-1 min-h-0">
                {loading ? (
                    <div className="flex h-[200px] items-center justify-center" />
                ) : isDataVisible ? (
                    <div className="h-full w-full min-h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={processedChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="catalogueAreaFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={strokeColor} stopOpacity={0.32} />
                                        <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                    dy={8}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                    tickFormatter={(value) => (viewMode === 'amount' ? `₹${value / 1000}k` : value.toString())}
                                />
                                <Tooltip content={<CustomTooltip viewMode={viewMode} />} cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                <Area
                                    type="linear"
                                    dataKey={viewMode === 'amount' ? 'sales' : 'bills'}
                                    stroke={strokeColor}
                                    strokeWidth={2}
                                    fill="url(#catalogueAreaFill)"
                                    dot={{ fill: 'var(--card)', stroke: strokeColor, strokeWidth: 2, r: 4 }}
                                    activeDot={{ r: 6, strokeWidth: 2 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="flex h-[200px] w-full flex-col items-center justify-center rounded-lg bg-muted">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mb-2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                        <p className="text-muted-foreground text-sm">Data is hidden</p>
                    </div>
                )}
            </CardContent>
            <CardFooter className="flex-col items-start gap-2 px-4 text-sm">
                <div className="flex gap-2 leading-none font-medium">
                    Total {viewMode === 'amount' ? 'Sales' : 'Bills'}:
                    {isDataVisible ? (
                        viewMode === 'amount' ?
                            ` ₹${totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` :
                            ` ${totalBills} bills`
                    ) : (' ••••••')}
                </div>
            </CardFooter>
        </Card>
    );
}
