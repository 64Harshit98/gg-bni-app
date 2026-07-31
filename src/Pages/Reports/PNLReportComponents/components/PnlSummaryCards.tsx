import { IndianRupee, ReceiptText, Wallet, TrendingUp, TrendingDown, Percent } from 'lucide-react';

import { StatCard } from '../../../../Components/ui/stat-card';
import { formatCurrency } from '../../../../utils/formatters';
import type { PnlSummary } from '../pnlReport.downloads';

interface PnlSummaryCardsProps {
  summary: PnlSummary;
}

/** Top-of-page stat grid: sales, cost, expenses, and derived profit/margin. */
export function PnlSummaryCards({ summary }: PnlSummaryCardsProps) {
  const isProfitable = summary.grossProfit >= 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label="Total Sales"
        value={formatCurrency(summary.totalRevenue)}
        icon={<IndianRupee />}
        iconClassName="bg-info/10 text-info"
      />
      <StatCard
        label="Total Cost"
        value={formatCurrency(summary.totalCost)}
        icon={<ReceiptText />}
        iconClassName="bg-destructive/10 text-destructive"
      />
      <StatCard
        label="Expenses"
        value={formatCurrency(summary.totalExpenses ?? 0)}
        icon={<Wallet />}
        iconClassName="bg-warning/15 text-warning-foreground dark:text-warning"
      />
      <StatCard
        label="Profit / Loss"
        value={formatCurrency(summary.grossProfit)}
        icon={isProfitable ? <TrendingUp /> : <TrendingDown />}
        iconClassName={
          isProfitable
            ? 'bg-success/12 text-success'
            : 'bg-destructive/10 text-destructive'
        }
        trend={isProfitable ? 'up' : 'down'}
      />
      <StatCard
        label="Gross Profit %"
        value={`${Math.round(summary.grossProfitPercentage)}%`}
        icon={<Percent />}
        iconClassName={
          isProfitable
            ? 'bg-success/12 text-success'
            : 'bg-destructive/10 text-destructive'
        }
        trend={isProfitable ? 'up' : 'down'}
        className="col-span-2 md:col-span-1"
      />
    </div>
  );
}
