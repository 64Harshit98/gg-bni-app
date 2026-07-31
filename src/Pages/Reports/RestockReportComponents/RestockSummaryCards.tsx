import { AlertTriangle, ShoppingCart, Wallet } from 'lucide-react';
import { StatCard } from '../../../Components/ui/stat-card';
import { formatCurrency, formatNumber } from '../../../utils/formatters';

interface RestockSummaryCardsProps {
  loading: boolean;
  totalItemsToRestock: number;
  outOfStockCount: number;
  estimatedCostToRestock: number;
}

export default function RestockSummaryCards({
  loading,
  totalItemsToRestock,
  outOfStockCount,
  estimatedCostToRestock,
}: RestockSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <StatCard
        label="Need to Restock"
        value={loading ? '-' : formatNumber(totalItemsToRestock)}
        icon={<ShoppingCart />}
        hint="Below restock quantity"
      />
      <StatCard
        label="Urgent – Order Now"
        value={loading ? '-' : formatNumber(outOfStockCount)}
        icon={<AlertTriangle />}
        iconClassName="bg-destructive/10 text-destructive"
        hint="Zero or negative inventory"
      />
      <StatCard
        label="Est. Restock Cost"
        value={loading ? '-' : formatCurrency(estimatedCostToRestock)}
        icon={<Wallet />}
        iconClassName="bg-success/10 text-success"
        className="col-span-2 md:col-span-1"
      />
    </div>
  );
}
