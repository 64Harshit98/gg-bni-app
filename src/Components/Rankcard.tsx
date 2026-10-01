import React, { useMemo, useState } from 'react';
import { SlCard, SlCardHead, SegControl, EmptyState, inr, MASK } from './Dashboardprimitives';

export interface RankItem { name: string; amount: number; quantity: number; }

interface RankCardProps {
  title: string;
  items: RankItem[];
  isDataVisible: boolean;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyText: string;
  emptyAction?: { label: string; to: string; icon?: React.ReactNode; permission?: any };
}

export const RankCard: React.FC<RankCardProps> = ({ title, items, isDataVisible, emptyIcon, emptyTitle, emptyText, emptyAction }) => {
  const [mode, setMode] = useState<'amount' | 'quantity'>('amount');

  const top = useMemo(
    () => [...(items || [])].sort((a, b) => (b[mode] || 0) - (a[mode] || 0)).slice(0, 5),
    [items, mode]
  );

  return (
    <SlCard className="h-full">
      <SlCardHead
        title={title}
        right={<SegControl value={mode} onChange={setMode} options={[{ value: 'amount', label: 'Amt' }, { value: 'quantity', label: 'Qty' }]} />}
      />
      {top.length === 0 ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} text={emptyText} action={emptyAction} />
      ) : (
        <ol className="m-0 list-none p-0">
          {top.map((it, i) => (
            <li key={`${it.name}-${i}`} className="flex items-center gap-3 border-b border-[#dfe6fb] py-2.5 text-sm text-[#0f172b] last:border-b-0">
              <span className="h-6 w-6 flex-none rounded-sm bg-[#e6eeff] text-center text-xs font-semibold leading-6 text-[#155dfc]">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate" title={it.name}>{it.name}</span>
              <span className="font-medium tabular-nums">
                {!isDataVisible ? MASK : mode === 'amount' ? inr(it.amount) : it.quantity}
              </span>
            </li>
          ))}
        </ol>
      )}
    </SlCard>
  );
};