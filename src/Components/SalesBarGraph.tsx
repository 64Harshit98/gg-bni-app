import React, { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { FiEyeOff } from 'react-icons/fi';
import { SlCard, SlCardHead, SegControl, EmptyState, inr } from './Dashboardprimitives';

interface SalesBarChartProps {
  isDataVisible: boolean;
  data: { name: string; sales: number; previousSales?: number; count?: number }[];
}

const DarkTip = ({ active, payload, label, mode }: any) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-sm bg-[#0f172b] px-3 py-1.5 text-center shadow-[0_10px_28px_rgba(21,48,140,0.14)]">
      <div className="text-[10px] text-white/80">{label}</div>
      <div className="text-[11px] font-semibold text-white">
        {mode === 'amount' ? `${inr(row.sales)} · ${row.bills} ${row.bills === 1 ? 'bill' : 'bills'}` : `${row.bills} ${row.bills === 1 ? 'bill' : 'bills'}`}
      </div>
    </div>
  );
};

export const SalesBarChartReport: React.FC<SalesBarChartProps> = ({ isDataVisible, data }) => {
  const [mode, setMode] = useState<'amount' | 'quantity'>('amount');

  const chartData = useMemo(
    () => data.map(i => ({ date: i.name, sales: i.sales, bills: i.count || 0 })),
    [data]
  );

  const head = (
    <SlCardHead
      title="Daily performance"
      subtitle={mode === 'amount' ? 'Sales amount per day' : 'Number of bills per day'}
      right={isDataVisible ? (
        <SegControl value={mode} onChange={setMode} options={[{ value: 'amount', label: 'Amount' }, { value: 'quantity', label: 'Qty' }]} />
      ) : undefined}
    />
  );

  if (!isDataVisible) {
    return (
      <SlCard className="h-full">
        {head}
        <div className="grid min-h-[150px] place-items-center rounded-sm bg-[#f5f7ff] md:min-h-[240px]"><EmptyState className="py-0" icon={<FiEyeOff />} title="Chart hidden" /></div>
      </SlCard>
    );
  }

  const key = mode === 'amount' ? 'sales' : 'bills';
  return (
    <SlCard className="h-full">
      {head}
      <div className="h-[200px] w-full md:h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#dfe6fb" strokeDasharray="3 4" />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#5b6b86', fontSize: 11 }} dy={8} />
            <YAxis
              axisLine={false} tickLine={false} tick={{ fill: '#5b6b86', fontSize: 11 }} allowDecimals={false}
              tickFormatter={(v: number) => {
                if (mode === 'quantity') return String(v);
                if (v === 0) return '₹0';
                return v >= 1000 ? `₹${(v / 1000).toFixed(1).replace('.0', '')}k` : `₹${v}`;
              }}
            />
            <Tooltip content={<DarkTip mode={mode} />} cursor={{ stroke: '#7a8aa3', strokeWidth: 1, strokeDasharray: '2 3' }} />
            <Area
              type="linear" dataKey={key} stroke="#155dfc" strokeWidth={2}
              fill="rgba(21,93,252,0.10)"
              dot={{ r: 3.5, fill: '#ffffff', stroke: '#155dfc', strokeWidth: 2 }}
              activeDot={{ r: 5, fill: '#155dfc', stroke: '#ffffff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </SlCard>
  );
};