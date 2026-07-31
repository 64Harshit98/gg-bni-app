import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '../../../lib/utils';

/**
 * Native `<select>` wrapper, restyled to match the app's design system.
 *
 * NOTE: the prop contract (value / onChange(ChangeEvent) / `<option>`
 * children) is intentionally unchanged. This component is imported by many
 * pages outside this refactor's scope (CatalogueCustomerReport,
 * CatalogueTaxReport, CatalogueSoldReport, CataloguePartyLedger,
 * SuperAdminSupportTicket, WebsiteLeads, TaxReport, CustomerReport,
 * PartyLedger, PNLReport) which all rely on the native-select/children API —
 * changing it would break those call sites. Only the visual layer is
 * modernized here.
 */
export default function FilterSelect({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 flex-1', className)}>
      {label && (
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          className="w-full appearance-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground shadow-xs transition-colors outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}
