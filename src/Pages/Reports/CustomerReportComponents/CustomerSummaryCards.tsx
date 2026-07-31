import { Users, Receipt, Wallet, TrendingUp } from 'lucide-react';
import { StatCard } from '../../../Components/ui/stat-card';
import { formatCurrency, formatNumber } from '../../../utils/formatters';
import type { CustomerReportSummary } from './customerReport.export';

interface CustomerSummaryCardsProps {
  summary: CustomerReportSummary;
}

export default function CustomerSummaryCards({ summary }: CustomerSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Total Customers"
        value={formatNumber(summary.totalCustomers)}
        icon={<Users />}
      />
      <StatCard
        label="Total Bills"
        value={formatNumber(summary.totalBills)}
        icon={<Receipt />}
        iconClassName="bg-info/10 text-info"
      />
      <StatCard
        label="Total Due"
        value={formatCurrency(summary.totalDue)}
        icon={<Wallet />}
        iconClassName="bg-destructive/10 text-destructive"
      />
      <StatCard
        label="Avg Sale / Customer"
        value={formatCurrency(Math.round(summary.averageSalePerCustomer))}
        icon={<TrendingUp />}
        iconClassName="bg-success/10 text-success"
      />
    </div>
  );
}
