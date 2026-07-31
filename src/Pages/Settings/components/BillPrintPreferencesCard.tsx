import * as React from 'react';
import { Printer, FileText, Receipt, Copy } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { SettingsSectionCard } from './SettingsSectionCard';
import { SettingsToggleRow } from './SettingsToggleRow';
import { InfoTooltip } from '../../../Components/InfoToolTip';
import type { BillSettingsData } from '../../../services/settings/billSetting.service';

type PrintFormat = NonNullable<BillSettingsData['printFormat']>;
type DiscountFormat = NonNullable<BillSettingsData['discountDisplayFormat']>;

const PRINT_FORMATS: { value: PrintFormat; icon: React.ReactNode; label: string; description: string }[] = [
  { value: 'A4', icon: <FileText className="size-5" />, label: 'A4 Size', description: 'Standard full-page invoice layout.' },
  { value: 'A5', icon: <FileText className="size-5" />, label: 'A5 Size', description: 'Half-page compact invoice layout.' },
  { value: 'THERMAL58', icon: <Receipt className="size-5" />, label: '2-Inch Thermal', description: '58mm continuous receipt layout.' },
];

const DISCOUNT_FORMATS: { value: DiscountFormat; label: string }[] = [
  { value: 'amount', label: 'Amount (₹)' },
  { value: 'percentage', label: 'Percentage (%)' },
];

interface BillPrintPreferencesCardProps {
  printFormat: PrintFormat;
  onPrintFormatChange: (value: PrintFormat) => void;
  enableTriplicate: boolean;
  onTriplicateChange: (value: boolean) => void;
  discountDisplayFormat: DiscountFormat;
  onDiscountFormatChange: (value: DiscountFormat) => void;
}

/** Print format, triplicate printing, and discount-display preferences for the bill. */
export const BillPrintPreferencesCard: React.FC<BillPrintPreferencesCardProps> = ({
  printFormat,
  onPrintFormatChange,
  enableTriplicate,
  onTriplicateChange,
  discountDisplayFormat,
  onDiscountFormatChange,
}) => (
  <SettingsSectionCard
    icon={<Printer className="size-4" />}
    title="Print Preferences"
    description="Choose your default bill format."
  >
    <div className="flex flex-col gap-3 sm:flex-row">
      {PRINT_FORMATS.map((format) => (
        <label
          key={format.value}
          className={cn(
            'flex flex-1 cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors',
            printFormat === format.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
          )}
        >
          <input
            type="radio"
            name="printFormat"
            value={format.value}
            checked={printFormat === format.value}
            onChange={() => onPrintFormatChange(format.value)}
            className="sr-only"
          />
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg',
              printFormat === format.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            {format.icon}
          </span>
          <div>
            <span className="block text-sm font-medium text-foreground">{format.label}</span>
            <span className="block text-xs text-muted-foreground">{format.description}</span>
          </div>
        </label>
      ))}
    </div>

    <SettingsToggleRow
      id="enable-triplicate"
      label="Print Triplicate Copies"
      description='When enabled, "Print (Bill + Duplicate)" prints 1 original + 2 "DUPLICATE" stamped copies instead of 1.'
      checked={enableTriplicate}
      onChange={onTriplicateChange}
    />

    <div className="rounded-xl border border-border bg-muted/40 p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <Copy className="size-3.5 text-muted-foreground" />
        <p className="text-sm font-semibold leading-5 text-foreground">Discount Display on Bill</p>
        <InfoTooltip text="Choose how the Disc1 + Disc2 column is shown on the printed/PDF bill." />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {DISCOUNT_FORMATS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onDiscountFormatChange(opt.value)}
            className={cn(
              'min-h-[42px] min-w-0 rounded-lg border px-2 py-2 text-center text-sm font-semibold leading-tight transition-colors',
              (discountDisplayFormat ?? 'amount') === opt.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-accent',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>

    {printFormat === 'THERMAL58' && (
      <p className="text-xs font-medium text-warning-foreground dark:text-warning">
        Note: Signatures are not displayed on 2-Inch Thermal receipts.
      </p>
    )}
  </SettingsSectionCard>
);
