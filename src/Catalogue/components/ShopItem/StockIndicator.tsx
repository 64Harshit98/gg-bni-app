import { Badge } from '../../../Components/ui/badge';

interface StockIndicatorProps {
  stock: number;
}

/** Small pill showing current stock, colored by semantic status (success/warning/destructive). */
export function StockIndicator({ stock }: StockIndicatorProps) {
  const variant = stock <= 0 ? 'destructive' : stock <= 10 ? 'warning' : 'success';

  return (
    <Badge variant={variant} className="text-[9px] font-black uppercase tracking-tight whitespace-nowrap">
      {stock} IN STOCK
    </Badge>
  );
}
