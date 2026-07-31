import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { cn } from '../lib/utils';

interface TopItem {
  name: string;
  amount: number;
  quantity: number;
}

interface TopSoldItemsCardProps {
  isDataVisible: boolean;
  items: TopItem[];
}

export const TopSoldItemsCard: React.FC<TopSoldItemsCardProps> = ({
  isDataVisible,
  items,
}) => {
  const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');

  const sortedItems = useMemo(() => {
    if (!items || items.length === 0) return [];

    const sorted = [...items].sort((a, b) => {
      if (viewMode === 'amount') {
        return (b.amount || 0) - (a.amount || 0);
      } else {
        return (b.quantity || 0) - (a.quantity || 0);
      }
    });

    return sorted.slice(0, 5);
  }, [items, viewMode]);

  return (
    <Card className="gap-3 rounded-2xl border border-border/70 border-t-2 border-t-primary py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between px-4">
        <CardTitle className="text-sm font-semibold text-foreground">
          Top 5 Items
        </CardTitle>
        <div className="flex rounded-full border border-border bg-muted p-0.5">
          <button
            onClick={() => setViewMode('amount')}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium transition-all',
              viewMode === 'amount' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            Amt
          </button>
          <button
            onClick={() => setViewMode('quantity')}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium transition-all',
              viewMode === 'quantity' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            Qty
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-2.5 px-4">
        {isDataVisible ? (
          sortedItems.length > 0 ? (
            sortedItems.map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-gradient-brand flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm">
                    {index + 1}
                  </div>
                  <span
                    className="text-xs text-foreground truncate max-w-[200px]"
                    title={item.name}
                  >
                    {item.name}
                  </span>
                </div>
                <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                  {viewMode === 'amount'
                    ? `₹${item.amount.toLocaleString('en-IN')}`
                    : `${item.quantity} units`}
                </span>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No items sold</p>
            </div>
          )
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Data hidden
          </div>
        )}
      </CardContent>
    </Card>
  );
};
