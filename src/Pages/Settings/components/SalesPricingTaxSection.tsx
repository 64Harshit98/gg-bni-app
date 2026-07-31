import { Percent } from 'lucide-react';

import { cn } from '../../../lib/utils';
import { Button } from '../../../Components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../Components/ui/select';
import { InfoTooltip } from '../../../Components/InfoToolTip';
import { SettingsSectionCard } from './SettingsSectionCard';
import { SettingsToggleRow } from './SettingsToggleRow';
import type { SalesSettings } from '../SalesSetting';

const GST_SCHEMES: { label: string; value: SalesSettings['gstScheme'] }[] = [
  { label: 'None', value: 'none' },
  { label: 'Regular GST', value: 'regular' },
  { label: 'Composition', value: 'composition' },
];

const ROUNDING_PRECISIONS = [0.01, 0.1, 0.5, 1, 5, 10];

export interface SalesPricingTaxSectionProps {
  settings: SalesSettings;
  onChange: (field: keyof SalesSettings, value: string | number | boolean) => void;
  onCheckboxChange: (field: keyof SalesSettings, checked: boolean) => void;
  onGstSchemeSelect: (scheme: 'regular' | 'composition') => void;
}

export function SalesPricingTaxSection({
  settings,
  onChange,
  onCheckboxChange,
  onGstSchemeSelect,
}: SalesPricingTaxSectionProps) {
  return (
    <SettingsSectionCard icon={<Percent className="size-4" />} title="Pricing &amp; Tax" description="GST scheme, rounding and discount rules">
      <div className="rounded-xl border border-border bg-muted/40 p-3">
        <div className="mb-2 flex items-center gap-2">
          <p className="text-sm font-semibold leading-5 text-foreground">GST Scheme</p>
          <InfoTooltip text="Select the applicable GST tax scheme for your business." />
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {GST_SCHEMES.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant={settings.gstScheme === opt.value ? 'default' : 'outline'}
              className="h-auto min-h-[42px] px-2 py-2 text-[11px] leading-tight whitespace-normal sm:text-sm"
              onClick={() => {
                if (opt.value && opt.value !== 'none' && settings.gstScheme === 'none') {
                  onGstSchemeSelect(opt.value as 'regular' | 'composition');
                } else {
                  onChange('gstScheme', opt.value ?? 'none');
                }
              }}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {settings.gstScheme === 'regular' && (
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-sm font-semibold leading-5 text-foreground">Tax Calculation</p>
            <InfoTooltip text="Choose if your item prices include or exclude GST." />
          </div>
          <Select value={settings.taxType || 'exclusive'} onValueChange={(value) => onChange('taxType', value)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exclusive">Tax Exclusive (Sales Price excludes GST)</SelectItem>
              <SelectItem value="inclusive">Tax Inclusive (Sales Price includes GST)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <SettingsToggleRow
        id="lock-tax"
        label="Lock Tax Mode"
        description="Prevent cashiers from changing the tax mode (view only)."
        tooltip="Prevent cashiers from modifying tax settings during checkout (Regular Scheme only)."
        checked={settings.lockTaxToggle ?? false}
        onChange={(checked) => onCheckboxChange('lockTaxToggle', checked)}
      />

      <SettingsToggleRow
        id="enable-rounding"
        label="Enable Rounding Off"
        description="Automatically round the individual item net price in the bill."
        tooltip="Round bill totals to selected precision."
        checked={settings.enableRounding ?? false}
        onChange={(checked) => onCheckboxChange('enableRounding', checked)}
      />

      {settings.enableRounding && (
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <p className="mb-2 text-xs font-semibold text-foreground">Rounding Precision</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {ROUNDING_PRECISIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onChange('roundingInterval', value)}
                className={cn(
                  'rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors',
                  Number(settings.roundingInterval ?? 1) === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:border-primary/40',
                )}
              >
                {value.toFixed(2)}
              </button>
            ))}
          </div>
        </div>
      )}

      <SettingsToggleRow
        id="item-discount"
        label="Enable Item-wise Discount"
        description="Allow discount per item."
        tooltip="Allow discounts to be applied to individual cart items."
        checked={settings.enableItemWiseDiscount ?? false}
        onChange={(checked) => onCheckboxChange('enableItemWiseDiscount', checked)}
      />
      <SettingsToggleRow
        id="item-discount-2"
        label="Enable Second Discount (Disc2)"
        description="Show a second discount field, applied on top of Disc1."
        tooltip="Adds a compounding second discount field (Disc2%) in the cart, on top of the existing item discount."
        checked={settings.enableDiscount2 ?? false}
        onChange={(checked) => onCheckboxChange('enableDiscount2', checked)}
        disabled={!settings.enableItemWiseDiscount}
      />
      <SettingsToggleRow
        id="lock-discount"
        label="Lock Discount Entry"
        description="Prevent editing discount in billing screen."
        tooltip="Stop staff from manually changing discounts during a sale."
        checked={settings.lockDiscountEntry ?? false}
        onChange={(checked) => onCheckboxChange('lockDiscountEntry', checked)}
      />
      <SettingsToggleRow
        id="lock-price"
        label="Lock Sale Price"
        description="Prevent editing sale price in billing screen."
        tooltip="Stop staff from manually altering item selling price."
        checked={settings.lockSalePriceEntry ?? false}
        onChange={(checked) => onCheckboxChange('lockSalePriceEntry', checked)}
      />
      <SettingsToggleRow
        id="hide-mrp"
        label="Hide MRP in Sales List"
        description="Hide the MRP column from POS item list."
        tooltip="Hide Maximum Retail Price column on sales screen."
        checked={settings.hideMrp ?? false}
        onChange={(checked) => onCheckboxChange('hideMrp', checked)}
      />
    </SettingsSectionCard>
  );
}
