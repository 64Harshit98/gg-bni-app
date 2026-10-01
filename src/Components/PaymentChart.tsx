import React from 'react';
import { FiEyeOff } from 'react-icons/fi';
import { SlCard, SlCardHead, EmptyState, inr } from './Dashboardprimitives';

interface PaymentMethod { name: string; amount: number; quantity: number; }

interface PaymentChartProps {
  isDataVisible: boolean;
  data: PaymentMethod[];
  unpaidAmount?: number;   // udhaar (sum of dueAmount) — shown as an amber row
}

export const PaymentChart: React.FC<PaymentChartProps> = ({ isDataVisible, data, unpaidAmount = 0 }) => {
  const whole = data.reduce((s, d) => s + d.amount, 0) + unpaidAmount;
  const pct = (n: number) => (whole > 0 ? (n / whole) * 100 : 0);

  const Row = ({ label, amount, showPct, warn }: { label: string; amount: number; showPct: boolean; warn?: boolean }) => (
    <div className="grid gap-1.5">
      <div className="flex justify-between text-[13px] text-[#0f172b]">
        <span>{label}</span>
        <span className="tabular-nums">
          <b className="font-semibold">{inr(amount)}</b>
          {showPct && <span className="ml-1 text-[#5b6b86]">{Math.round(pct(amount))}%</span>}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-[#f5f7ff]">
        <div className="h-full rounded-sm" style={{ width: `${pct(amount)}%`, background: warn ? '#bb4d00' : '#155dfc' }} />
      </div>
    </div>
  );

  return (
    <SlCard className="h-full">
      <SlCardHead title="Payment methods" subtitle="How customers paid" />
      {!isDataVisible ? (
        <EmptyState icon={<FiEyeOff />} title="Figures are hidden" />
      ) : data.length === 0 && unpaidAmount === 0 ? (
        <EmptyState icon={<FiEyeOff />} title="No payments yet" text="Payments show up here once you make a bill." />
      ) : (
        <div className="grid gap-[18px]">
          {data.map(m => <Row key={m.name} label={m.name} amount={m.amount} showPct />)}
          {unpaidAmount > 0 && <Row label="Udhaar (unpaid)" amount={unpaidAmount} showPct={false} warn />}
        </div>
      )}
    </SlCard>
  );
};