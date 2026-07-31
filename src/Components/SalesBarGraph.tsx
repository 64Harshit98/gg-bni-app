import React, { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { cn } from '../lib/utils';

interface SalesBarChartProps {
  isDataVisible: boolean;
  data: {
    name: string;
    sales: number;
    previousSales?: number;
    count?: number; // <-- Added this so TypeScript knows about the count
  }[];
}

export const SalesBarChartReport: React.FC<SalesBarChartProps> = ({ isDataVisible, data }) => {
  const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');

  // Map Data
  const chartData = useMemo(() => {
    const mappedData = data.map(item => ({
      date: item.name,
      sales: item.sales,
      previous: item.previousSales || 0,
      bills: item.count || 0
    }));

    // If only today data exists, prepend yesterday with zero values
    if (mappedData.length === 1) {
      const todayItem = mappedData[0];

      const parsedDate = new Date(todayItem.date);

      // Ensure valid date parsing before applying yesterday logic
      if (!isNaN(parsedDate.getTime())) {
        const yesterday = new Date(parsedDate);
        yesterday.setDate(yesterday.getDate() - 1);

        const yesterdayKey = yesterday.toLocaleDateString('en-CA');

        return [
          {
            date: yesterdayKey,
            sales: 0,
            previous: 0,
            bills: 0
          },
          todayItem
        ];
      }
    }

    return mappedData;
  }, [data]);

  // Custom Tooltip to match the clean look
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border p-2 rounded-lg shadow-sm text-sm">
          <p className="font-semibold mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2" style={{ color: entry.color }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
              <span>{entry.name}:</span>
              <span className="font-medium">
                {entry.name === 'Sales' || entry.name === 'Previous'
                  ? `₹${entry.value.toLocaleString()}`
                  : entry.value}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  if (!isDataVisible) {
    return (
      <Card className="h-full rounded-2xl border border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>Daily Performance</CardTitle>
        </CardHeader>
        <CardContent className="flex h-full min-h-[240px] flex-col items-center justify-center bg-muted rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mb-2">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" x2="22" y1="2" y2="22" />
          </svg>
          <p className="text-muted-foreground">Data is hidden</p>
        </CardContent>
      </Card>
    );
  }

  const strokeColor = viewMode === 'amount' ? 'var(--primary)' : 'var(--success)';

  return (
    <Card className="h-full flex flex-col gap-3 rounded-2xl border border-border/70 border-t-2 border-t-primary py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between px-4 pb-0">
        <div className="space-y-1">
          <CardTitle>Daily Performance</CardTitle>
          <CardDescription>
            {viewMode === 'amount' ? 'Sales amount' : 'Number of bills'}
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
        <div className="h-full w-full min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="salesAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />

              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                dy={10}
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                tickFormatter={(value) => {
                  if (viewMode === 'quantity') return value;
                  if (value === 0) return '₹0';
                  if (value >= 1000) return `₹${(value / 1000).toFixed(1).replace('.0', '')}k`;
                  return `₹${value}`;
                }}
              />

              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeDasharray: '4 4' }} />

              <Area
                type="linear"
                dataKey={viewMode === 'amount' ? 'sales' : 'bills'}
                name={viewMode === 'amount' ? 'Sales' : 'Bills'}
                stroke={strokeColor}
                strokeWidth={2}
                fill="url(#salesAreaFill)"
                dot={{ fill: 'var(--card)', stroke: strokeColor, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>

    </Card>
  );
};
