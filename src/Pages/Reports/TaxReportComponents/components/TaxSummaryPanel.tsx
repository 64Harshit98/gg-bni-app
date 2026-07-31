import { Landmark, Receipt, ShieldCheck } from 'lucide-react';

import { cn } from '../../../../lib/utils';
import { StatCard } from '../../../../Components/ui/stat-card';
import { formatCurrency } from '../../../../utils/formatters';
import type { GstScheme } from '../../../../services/reports/taxReport.service';
import type { TaxReportMetrics } from '../taxReportExport.utils';

interface TaxSummaryPanelProps {
  metrics: TaxReportMetrics;
  gstScheme: GstScheme;
}

/** SUMMARY tab: turnover, input credit / blocked ITC, and net liability payable. */
export function TaxSummaryPanel({ metrics, gstScheme }: TaxSummaryPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <StatCard
        label="Sales Turnover"
        value={formatCurrency(metrics.salesTurnover)}
        icon={<Receipt />}
        iconClassName="bg-info/10 text-info"
      />
      {gstScheme !== 'None' && (
        <StatCard
          label={gstScheme === 'Composition' ? 'ITC (Blocked)' : 'Input Credit'}
          value={formatCurrency(metrics.totalItc)}
          icon={<ShieldCheck />}
          iconClassName={cn(gstScheme === 'Composition' && 'opacity-40', 'bg-primary/10 text-primary')}
        />
      )}
      {gstScheme !== 'None' && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-success/20 bg-success/8 p-4">
          <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-success">
            <Landmark className="size-3.5" /> Net Liability Payable
          </span>
          <span className="mt-1 text-2xl font-black text-success">
            {formatCurrency(Math.max(0, metrics.netPayable))}
          </span>
        </div>
      )}
    </div>
  );
}
