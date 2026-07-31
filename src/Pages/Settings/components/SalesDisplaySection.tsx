import { Check, ArrowUpDown, Monitor } from 'lucide-react';

import { cn } from '../../../lib/utils';
import { Button } from '../../../Components/ui/button';
import { InfoTooltip } from '../../../Components/InfoToolTip';
import { ResetSettingsButton } from '../../../Components/ResetSettingsButton';
import { SettingsSectionCard } from './SettingsSectionCard';
import { SettingsToggleRow } from './SettingsToggleRow';
import type { SalesSettings } from '../SalesSetting';

export interface SalesDisplaySectionProps {
  settings: SalesSettings;
  defaultSettings: SalesSettings;
  onChange: (field: keyof SalesSettings, value: string | number | boolean) => void;
  onCheckboxChange: (field: keyof SalesSettings, checked: boolean) => void;
  onResetSettings: (defaults: SalesSettings) => void;
}

export function SalesDisplaySection({
  settings,
  defaultSettings,
  onChange,
  onCheckboxChange,
  onResetSettings,
}: SalesDisplaySectionProps) {
  return (
    <SettingsSectionCard
      icon={<Monitor className="size-4" />}
      title="Display Settings"
      description="Choose how the billing screen looks for your staff"
      action={<ResetSettingsButton<SalesSettings> defaults={defaultSettings} onReset={onResetSettings} />}
    >
      <div className="grid grid-cols-2 gap-3">
        {/* List View */}
        <div
          onClick={() => onChange('salesViewType', 'list')}
          className={cn(
            'relative flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 p-3 transition-all',
            settings.salesViewType === 'list'
              ? 'border-primary bg-primary/5 shadow-sm'
              : 'border-border bg-card hover:border-primary/40',
          )}
        >
          {settings.salesViewType === 'list' && (
            <div className="absolute top-2 right-2 rounded-full bg-primary p-0.5 text-primary-foreground">
              <Check size={12} />
            </div>
          )}
          <div className="flex h-20 w-full flex-col justify-center gap-1.5 rounded-lg border border-border bg-card p-2">
            <div className="h-1.5 w-3/4 rounded-full bg-muted-foreground/30" />
            <div className="h-1.5 w-full rounded-full bg-muted" />
            <div className="h-1.5 w-5/6 rounded-full bg-muted" />
            <div className="h-1.5 w-full rounded-full bg-muted" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">List View</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Desktop &amp; Barcodes</p>
          </div>
        </div>

        {/* Card View */}
        <div
          onClick={() => onChange('salesViewType', 'card')}
          className={cn(
            'relative flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 p-3 transition-all',
            settings.salesViewType === 'card'
              ? 'border-primary bg-primary/5 shadow-sm'
              : 'border-border bg-card hover:border-primary/40',
          )}
        >
          {settings.salesViewType === 'card' && (
            <div className="absolute top-2 right-2 rounded-full bg-primary p-0.5 text-primary-foreground">
              <Check size={12} />
            </div>
          )}
          <div className="grid h-20 w-full grid-cols-3 gap-1.5 rounded-lg border border-border bg-card p-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-md bg-muted" />
            ))}
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">Card View</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Touchscreens &amp; Tablets</p>
          </div>
        </div>
      </div>

      {/* Card photo sub-options — shown only when card view is selected */}
      {settings.salesViewType === 'card' && (
        <div className="border-r-2 border-l-2 border-border py-3 pr-4 pl-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Card Image Display</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { withPhoto: true, label: 'With Photo', desc: 'Shows product image' },
              { withPhoto: false, label: 'Without Photo', desc: 'Text-only compact' },
            ].map((opt) => {
              const active = !!settings.cardViewWithPhoto === opt.withPhoto;
              return (
                <div
                  key={opt.label}
                  onClick={() => onCheckboxChange('cardViewWithPhoto', opt.withPhoto)}
                  className={cn(
                    'relative flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-2 transition-all sm:flex-row sm:gap-3 sm:p-3',
                    active ? 'border-primary bg-card shadow-sm' : 'border-border bg-muted hover:border-primary/30',
                  )}
                >
                  {active && (
                    <div className="absolute top-2 right-2 rounded-full bg-primary p-0.5 text-primary-foreground">
                      <Check size={10} />
                    </div>
                  )}
                  <div className="grid h-10 w-full grid-cols-3 gap-1 rounded-md border border-border bg-muted p-1 sm:h-12 sm:w-26 sm:shrink-0">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex flex-col items-center gap-0.5">
                        <div className="aspect-square w-full rounded-sm bg-primary/20" />
                        <div className="h-1 w-full rounded-full bg-muted-foreground/30" />
                      </div>
                    ))}
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-foreground sm:text-sm">{opt.label}</p>
                    <p className="hidden text-xs text-muted-foreground sm:block">{opt.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <SettingsToggleRow
        id="salesman-billing"
        label="Enable Salesman-wise Billing"
        description="Track which salesman handled each bill."
        tooltip="Track which salesman handled each specific sale invoice."
        checked={settings.enableSalesmanSelection ?? false}
        onChange={(checked) => onCheckboxChange('enableSalesmanSelection', checked)}
      />

      <div className="rounded-xl border border-border bg-muted/40 p-3">
        <div className="mb-2 flex items-center gap-2">
          <ArrowUpDown size={16} className="text-primary" />
          <p className="text-sm font-semibold leading-5 text-foreground">Cart Item Sorting</p>
          <InfoTooltip text="Choose where newly scanned items appear in the cart." />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={settings.cartInsertionOrder === 'top' ? 'default' : 'outline'}
            onClick={() => onChange('cartInsertionOrder', 'top')}
          >
            Newest First
          </Button>
          <Button
            type="button"
            variant={settings.cartInsertionOrder === 'bottom' ? 'default' : 'outline'}
            onClick={() => onChange('cartInsertionOrder', 'bottom')}
          >
            Oldest First
          </Button>
        </div>
      </div>
    </SettingsSectionCard>
  );
}
