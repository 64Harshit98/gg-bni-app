import React from 'react';
import { FiFileText, FiShoppingBag, FiBarChart2, FiClock, FiArrowUp, FiArrowDown } from 'react-icons/fi';
import { SlCard, IconChip, inr, MASK } from './Dashboardprimitives';

interface KpiRowProps {
  isDataVisible: boolean;
  totalSales: number;
  salesChangePct: number;
  bills: number;
  billsChange: number;      // absolute difference vs previous period
  avgBill: number;
  avgChangePct: number;
  unpaidAmount: number;
  unpaidBills: number;
  periodLabel: string;      // e.g. "vs previous 7 days"
  periodName?: string;      // e.g. "7 days" (mobile hero label)
}

const Delta: React.FC<{ value: number; suffix?: string; visible: boolean }> = ({ value, suffix = '', visible }) => {
  if (!visible) return <span className="text-xs font-semibold text-[#5b6b86]">Hidden</span>;
  if (Math.abs(value) < 0.05) return <span className="text-xs font-semibold text-[#5b6b86]">No change</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-[#008236]' : 'text-[#d5000c]'}`}>
      {up ? <FiArrowUp size={14} /> : <FiArrowDown size={14} />}
      {Math.abs(value).toFixed(suffix === '%' ? 0 : 0)}{suffix}
    </span>
  );
};

const Tile: React.FC<{
  label: string; chip: React.ReactNode; value: string; hero?: boolean; footer: React.ReactNode;
}> = ({ label, chip, value, hero, footer }) => (
  <SlCard className="flex flex-col gap-1">
    <div className="mb-1 flex items-center gap-3 text-[13px] font-medium text-[#45556c]">{chip}{label}</div>
    <div className={`font-semibold tracking-[-0.02em] tabular-nums ${hero ? 'text-[32px] leading-10 text-[#155dfc]' : 'text-[28px] leading-9 text-[#0f172b]'}`}>
      {value}
    </div>
    <div className="flex items-center gap-1.5">{footer}</div>
  </SlCard>
);

const Mini: React.FC<{ label: string; value: string; warn?: boolean }> = ({ label, value, warn }) => (
  <div className="text-[11px] text-[#5b6b86]">
    {label}
    <b className={`block text-[15px] font-semibold tabular-nums ${warn ? 'text-[#bb4d00]' : 'text-[#0f172b]'}`}>{value}</b>
  </div>
);

export const KpiRow: React.FC<KpiRowProps> = (p) => {
  const v = p.isDataVisible;
  const cap = <span className="text-xs text-[#5b6b86]">{p.periodLabel}</span>;
  return (
    <>
      {/* Mobile: one hero card, the other three KPIs as a mini row */}
      <div className="md:hidden">
        <SlCard>
          <div className="flex flex-col gap-1">
            <div className="mb-1 flex items-center gap-3 text-[13px] font-medium text-[#45556c]">
              <IconChip tone="blue"><FiFileText /></IconChip>
              Total sales{p.periodName ? ` · ${p.periodName}` : ''}
            </div>
            <div className="text-[32px] font-semibold leading-10 tracking-[-0.02em] tabular-nums text-[#155dfc]">
              {v ? inr(p.totalSales) : MASK}
            </div>
            {v ? (
              <div className="flex items-center gap-1.5"><Delta visible={v} value={p.salesChangePct} suffix="%" />{cap}</div>
            ) : (
              <div className="text-xs text-[#5b6b86]">Figures hidden — tap the eye to show</div>
            )}
          </div>
          <div className="mt-3.5 grid grid-cols-3 border-t border-[#dfe6fb] pt-3">
            <Mini label="Bills" value={v ? String(p.bills) : '••'} />
            <Mini label="Avg bill" value={v ? inr(p.avgBill) : '₹ •••'} />
            <Mini label="Unpaid" warn value={v ? inr(p.unpaidAmount) : '₹ •••'} />
          </div>
        </SlCard>
      </div>

      {/* Desktop / tablet: four tiles */}
      <div className="hidden gap-5 md:grid md:grid-cols-2 lg:grid-cols-4">
        <Tile
          hero label="Total sales" chip={<IconChip tone="blue"><FiFileText /></IconChip>}
          value={v ? inr(p.totalSales) : MASK}
          footer={<><Delta visible={v} value={p.salesChangePct} suffix="%" />{cap}</>}
        />
        <Tile
          label="Bills" chip={<IconChip tone="magenta"><FiShoppingBag /></IconChip>}
          value={v ? String(p.bills) : '••••'}
          footer={<><Delta visible={v} value={p.billsChange} />{cap}</>}
        />
        <Tile
          label="Average bill" chip={<IconChip tone="green"><FiBarChart2 /></IconChip>}
          value={v ? inr(p.avgBill) : MASK}
          footer={<><Delta visible={v} value={p.avgChangePct} suffix="%" />{cap}</>}
        />
        <Tile
          label="Unpaid (udhaar)" chip={<IconChip tone="amber"><FiClock /></IconChip>}
          value={v ? inr(p.unpaidAmount) : MASK}
          footer={
            v
              ? <><span className="text-xs font-semibold text-[#5b6b86]">{p.unpaidBills} {p.unpaidBills === 1 ? 'bill' : 'bills'}</span><span className="text-xs text-[#5b6b86]">to collect</span></>
              : <span className="text-xs font-semibold text-[#5b6b86]">Hidden</span>
          }
        />
      </div>
    </>
  );
};