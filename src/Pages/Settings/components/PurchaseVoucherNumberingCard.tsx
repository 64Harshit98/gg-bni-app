import * as React from 'react';
import { Hash, RotateCcw } from 'lucide-react';
import { Input } from '../../../Components/ui/input';
import { Label } from '../../../Components/ui/label';
import { Button } from '../../../Components/ui/button';
import { InfoTooltip } from '../../../Components/InfoToolTip';
import { SettingsSectionCard } from './SettingsSectionCard';

interface PurchaseVoucherNumberingCardProps {
  voucherName: string;
  voucherPrefix: string;
  currentVoucherNumber: number;
  onVoucherPrefixChange: (value: string) => void;
  onCurrentVoucherNumberChange: (value: string) => void;
  onResetClick: () => void;
}

/** Voucher name (locked), prefix, and next-number fields for purchase invoices. */
export const PurchaseVoucherNumberingCard: React.FC<PurchaseVoucherNumberingCardProps> = ({
  voucherName,
  voucherPrefix,
  currentVoucherNumber,
  onVoucherPrefixChange,
  onCurrentVoucherNumberChange,
  onResetClick,
}) => (
  <SettingsSectionCard
    icon={<Hash className="size-4" />}
    title="Voucher Numbering"
    description="Controls how purchase invoice numbers are generated."
    action={
      <Button type="button" variant="outline" size="sm" onClick={onResetClick} className="gap-1.5 text-destructive hover:text-destructive">
        <RotateCcw className="size-3.5" />
        Reset to Default
      </Button>
    }
  >
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Label htmlFor="voucher-name">Voucher Name</Label>
          <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">LOCKED</span>
          <InfoTooltip text="Internal document name for this transaction type." />
        </div>
        <Input id="voucher-name" value={voucherName || 'Purchase'} disabled className="cursor-not-allowed select-none" />
      </div>
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Label htmlFor="voucher-prefix">Voucher Prefix</Label>
          <InfoTooltip text="Letters added before the purchase invoice number (e.g., PUR-)." />
        </div>
        <Input
          id="voucher-prefix"
          value={voucherPrefix || ''}
          onChange={(e) => onVoucherPrefixChange(e.target.value)}
          placeholder="e.g., PRC"
        />
      </div>
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Label htmlFor="current-number">Next Voucher Number</Label>
          <InfoTooltip text="The sequence number for the next recorded purchase." />
        </div>
        <Input
          id="current-number"
          type="number"
          min={1}
          step={1}
          value={currentVoucherNumber ?? 1000}
          onChange={(e) => onCurrentVoucherNumberChange(e.target.value)}
        />
      </div>
    </div>
  </SettingsSectionCard>
);
