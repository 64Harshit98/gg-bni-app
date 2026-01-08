import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
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

interface SalesBarChartProps {
  isDataVisible: boolean;
  data: {
    name: string;
    sales: number;
    previousSales?: number;
  }[];
}

export const SalesBarChartReport: React.FC<SalesBarChartProps> = ({ isDataVisible, data }) => {
  const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');

  // Map Data
  const chartData = useMemo(() => {
    return data.map(item => ({
      date: item.name,
      sales: item.sales,
      previous: item.previousSales || 0,
      bills: Math.ceil(item.sales / 1000)
    }));
  }, [data]);

  // Custom Tooltip to match the clean look
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 p-2 rounded-lg shadow-sm text-sm">
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
      <Card className="col-span-1 md:col-span-2">
        <CardHeader>
          <CardTitle>Daily Performance</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[300px] flex-col items-center justify-center bg-gray-50 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 mb-2">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" x2="22" y1="2" y2="22" />
          </svg>
          <p className="text-gray-500">Data is hidden</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="space-y-1">
          <CardTitle>Daily Performance</CardTitle>
          <CardDescription>
            {viewMode === 'amount' ? 'Sales amount' : 'Number of bills'}
          </CardDescription>
        </div>
        <div className="flex items-center p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setViewMode('amount')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${viewMode === 'amount' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Amt
          </button>
          <button
            onClick={() => setViewMode('quantity')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${viewMode === 'quantity' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Qty
          </button>
        </div>
      </CardHeader>

      <CardContent className="pl-0">
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="3 3" />

              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                dy={10}
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                tickFormatter={(value) => {
                  if (viewMode === 'quantity') return value;
                  if (value === 0) return '₹0';
                  if (value >= 1000) return `₹${(value / 1000).toFixed(1).replace('.0', '')}k`;
                  return `₹${value}`;
                }}
              />

              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '4 4' }} />

              {/* Previous Period Line (Dashed) */}
              {viewMode === 'amount' && (
                <Line
                  type="linear" // Matches the straight lines in your image
                  dataKey="previous"
                  name="Previous"
                  stroke="#9ca3af"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={{ r: 4, fill: '#9ca3af' }}
                />
              )}

              {/* Main Sales Line (Blue with White Dots) */}
              <Line
                type="linear" // Matches the straight lines in your image
                dataKey={viewMode === 'amount' ? 'sales' : 'bills'}
                name={viewMode === 'amount' ? 'Sales' : 'Bills'}
                stroke={viewMode === 'amount' ? '#3b82f6' : '#16a34a'}
                strokeWidth={2}
                // This creates the "White center, Blue border" dot look
                dot={{ fill: 'white', stroke: viewMode === 'amount' ? '#3b82f6' : '#16a34a', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>

    </Card>
  );
};