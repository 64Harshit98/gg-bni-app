import { Printer } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { InfoTooltip } from '../../../Components/InfoToolTip';
import { SettingsCard } from './SettingsCard';
import { ToggleRow } from './ToggleRow';
import type { BillSettingsData } from '../../../services/settings/catalogueBillSetting.service';

interface BillPrintPreferencesSectionProps {
  printFormat: NonNullable<BillSettingsData['printFormat']>;
  onPrintFormatChange: (value: NonNullable<BillSettingsData['printFormat']>) => void;
  enableTriplicate: boolean;
  onToggleTriplicate: (checked: boolean) => void;
  discountDisplayFormat: NonNullable<BillSettingsData['discountDisplayFormat']>;
  onDiscountDisplayFormatChange: (value: NonNullable<BillSettingsData['discountDisplayFormat']>) => void;
}

const PRINT_FORMATS: { value: 'A4' | 'A5'; label: string; description: string }[] = [
  { value: 'A4', label: 'A4 Size', description: 'Standard full-page invoice layout.' },
  { value: 'A5', label: 'A5 Size', description: 'Half-page compact invoice layout.' },
];

const DISCOUNT_FORMATS: { value: 'amount' | 'percentage'; label: string }[] = [
  { value: 'amount', label: 'Amount (₹)' },
  { value: 'percentage', label: 'Percentage (%)' },
];

/** Bill print format, triplicate printing, and discount display preferences. */
export function BillPrintPreferencesSection({
  printFormat,
  onPrintFormatChange,
  enableTriplicate,
  onToggleTriplicate,
  discountDisplayFormat,
  onDiscountDisplayFormatChange,
}: BillPrintPreferencesSectionProps) {
  return (
    <SettingsCard title="Print Preferences" icon={<Printer className="size-4" />}>
      <p className="-mt-2 text-xs text-muted-foreground">Choose your default bill format.</p>

      <div className="flex flex-col gap-4 sm:flex-row">
        {PRINT_FORMATS.map((format) => (
          <label
            key={format.value}
            className={cn(
              'flex flex-1 cursor-pointer items-center rounded-xl border p-4 transition-colors',
              printFormat === format.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted',
            )}
          >
            <input
              type="radio"
              name="printFormat"
              value={format.value}
              checked={printFormat === format.value}
              onChange={() => onPrintFormatChange(format.value)}
              className="h-4 w-4 border-border text-primary focus:ring-primary"
            />
            <div className="ml-3">
              <span className="block text-sm font-medium text-foreground">{format.label}</span>
              <span className="block text-xs text-muted-foreground">{format.description}</span>
            </div>
          </label>
        ))}
      </div>

      <ToggleRow
        id="enable-triplicate"
        label="Print Triplicate"
        description='When enabled, "Bill + Duplicate" prints 3 copies (1 Original + 2 Duplicate).'
        checked={enableTriplicate}
        onChange={onToggleTriplicate}
      />

      <div className="rounded-xl border border-border bg-muted/40 p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <p className="text-sm leading-5 font-semibold text-foreground">Discount Display on Bill</p>
          <InfoTooltip text="Choose how the Disc1 + Disc2 column is shown on the printed/PDF bill." />
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          {DISCOUNT_FORMATS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onDiscountDisplayFormatChange(opt.value)}
              className={cn(
                'min-h-[42px] min-w-0 rounded-lg border px-2 py-2 text-center text-[11px] leading-tight font-semibold break-words whitespace-normal transition-colors sm:text-sm',
                discountDisplayFormat === opt.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-muted',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </SettingsCard>
  );
}
