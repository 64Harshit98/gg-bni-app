import React from 'react';
import { Percent } from 'lucide-react';

import { InfoTooltip } from '../../../Components/InfoToolTip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../Components/ui/select';
import { cn } from '../../../lib/utils';
import type { CatalogueSalesSettings } from '../catalogueSalesSetting.types';
import { SettingsCard } from './SettingsCard';
import { ToggleRow } from './ToggleRow';

const GST_SCHEME_OPTIONS: { label: string; value: NonNullable<CatalogueSalesSettings['gstScheme']> }[] = [
  { label: 'None', value: 'none' },
  { label: 'Regular GST', value: 'regular' },
  { label: 'Composition', value: 'composition' },
];

interface PricingTaxSectionProps {
  settings: CatalogueSalesSettings;
  onToggle: (field: keyof CatalogueSalesSettings, checked: boolean) => void;
  onTaxTypeChange: (value: string) => void;
  onGstSchemeSelect: (value: NonNullable<CatalogueSalesSettings['gstScheme']>) => void;
}

export const PricingTaxSection: React.FC<PricingTaxSectionProps> = ({
  settings,
  onToggle,
  onTaxTypeChange,
  onGstSchemeSelect,
}) => (
  <SettingsCard title="Pricing & Tax" icon={<Percent className="size-4" />}>
    <div className="space-y-3">
      <ToggleRow
        id="item-discount"
        label="Enable Item-wise Discount"
        description="Allow discount per item."
        checked={settings.enableItemWiseDiscount ?? false}
        onChange={(checked) => onToggle('enableItemWiseDiscount', checked)}
        tooltip="Allow discounts to be applied to individual cart items."
        icon={<Percent className="size-[18px]" />}
      />
      <ToggleRow
        id="item-discount-2"
        label="Enable Second Discount (Disc2)"
        description="Show a second discount field, applied on top of Disc1."
        checked={settings.enableDiscount2 ?? false}
        onChange={(checked) => onToggle('enableDiscount2', checked)}
        tooltip="Adds a compounding second discount field (Disc2%) in the order edit cart, on top of the existing item discount."
        icon={<Percent className="size-[18px]" />}
        disabled={!settings.enableItemWiseDiscount}
      />

      {/* GST Scheme */}
      <div className="rounded-xl border border-border bg-muted/40 p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <p className="text-sm font-semibold leading-5 text-foreground">GST Scheme</p>
          <InfoTooltip text="Select the applicable GST tax scheme for your business." />
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {GST_SCHEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onGstSchemeSelect(opt.value)}
              className={cn(
                'min-h-[42px] min-w-0 whitespace-normal break-words rounded-lg border px-2 py-2 text-center text-[11px] font-semibold leading-tight transition-colors sm:text-sm',
                settings.gstScheme === opt.value
                  ? 'border-transparent bg-gradient-brand text-white shadow-sm shadow-primary/20'
                  : 'border-border bg-card text-foreground hover:bg-accent',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tax Calculation — only for Regular GST */}
      {settings.gstScheme === 'regular' && (
        <div className="rounded-xl border border-border bg-muted/40 p-3.5">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-sm font-semibold leading-5 text-foreground">Tax Calculation</p>
            <InfoTooltip text="Choose if your item prices include or exclude GST." />
          </div>
          <Select value={settings.taxType || 'exclusive'} onValueChange={onTaxTypeChange}>
            <SelectTrigger className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exclusive">Tax Exclusive (Sales Price excludes GST)</SelectItem>
              <SelectItem value="inclusive">Tax Inclusive (Sales Price includes GST)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  </SettingsCard>
);
