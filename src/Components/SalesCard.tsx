import React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { cn } from '../lib/utils';

interface SalesCardProps {
  isDataVisible: boolean;
  totalSales: number;
  percentageChange?: number;
}

export const SalesCard: React.FC<SalesCardProps> = ({
  isDataVisible,
  totalSales,
  percentageChange = 0,
}) => {
  const isPositive = percentageChange >= 0;

  return (
    <Card className="glow-primary bg-gradient-brand relative h-full gap-2 overflow-hidden border-0 py-4 text-white">
      {/* decorative light blooms */}
      <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-8 size-40 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,255,255,0.12),transparent_55%)]" />

      <CardHeader className="relative -mb-2">
        <CardTitle className="text-sm font-medium text-white/80">
          Total Sales
        </CardTitle>
      </CardHeader>
      <CardContent className="relative flex flex-1 flex-col items-center justify-center py-3">
        <p className="text-3xl font-bold tracking-tight tabular-nums drop-shadow-sm">
          {isDataVisible ? `₹${totalSales.toLocaleString('en-IN')}` : '₹ ••••••'}
        </p>
        <div className="mt-2 flex items-center gap-2 text-sm">
          {isDataVisible ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold backdrop-blur',
                isPositive ? 'bg-white/20 text-white' : 'bg-black/25 text-white',
              )}
            >
              {isPositive ? (
                <TrendingUp className="size-3.5" />
              ) : (
                <TrendingDown className="size-3.5" />
              )}
              {Math.abs(percentageChange).toFixed(1)}%
            </span>
          ) : (
            <span className="text-xs font-semibold text-white/70">••.•%</span>
          )}
          <span className="text-white/70">vs. previous period</span>
        </div>
      </CardContent>
    </Card>
  );
};
