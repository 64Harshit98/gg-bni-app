import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

const trendVariants = cva(
  'inline-flex items-center gap-0.5 text-xs font-medium',
  {
    variants: {
      trend: {
        up: 'text-success',
        down: 'text-destructive',
        neutral: 'text-muted-foreground',
      },
    },
    defaultVariants: { trend: 'neutral' },
  },
);

interface StatCardProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof trendVariants> {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  iconClassName?: string;
  change?: React.ReactNode;
  hint?: React.ReactNode;
}

function StatCard({
  label,
  value,
  icon,
  iconClassName,
  change,
  trend,
  hint,
  className,
  ...props
}: StatCardProps) {
  return (
    <div
      data-slot="stat-card"
      className={cn(
        'bg-card text-card-foreground rounded-xl border p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30',
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        {icon ? (
          <div
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg [&>svg]:size-3.5',
              iconClassName ?? 'bg-primary/10 text-primary',
            )}
          >
            {icon}
          </div>
        ) : null}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="text-lg font-bold tracking-tight tabular-nums">{value}</span>
        {change ? <span className={cn(trendVariants({ trend }))}>{change}</span> : null}
      </div>
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

export { StatCard };
