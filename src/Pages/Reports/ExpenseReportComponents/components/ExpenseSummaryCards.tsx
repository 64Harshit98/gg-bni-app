import { Hash, Wallet } from 'lucide-react';

import { StatCard } from '../../../../Components/ui/stat-card';
import { formatCurrency, formatNumber } from '../../../../utils/formatters';

interface ExpenseSummaryCardsProps {
  total: number;
  count: number;
}

/** Top-of-page stat grid: total spend and entry count for the selected period. */
export function ExpenseSummaryCards({ total, count }: ExpenseSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard
        label="Total Expenses"
        value={formatCurrency(total)}
        icon={<Wallet />}
        iconClassName="bg-warning/15 text-warning-foreground dark:text-warning"
      />
      <StatCard
        label="Total Entries"
        value={formatNumber(count)}
        icon={<Hash />}
        iconClassName="bg-info/10 text-info"
      />
    </div>
  );
}
