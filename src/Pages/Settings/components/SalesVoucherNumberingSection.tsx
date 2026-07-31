import { Hash } from 'lucide-react';

import { Button } from '../../../Components/ui/button';
import { Input } from '../../../Components/ui/input';
import { Label } from '../../../Components/ui/label';
import { Badge } from '../../../Components/ui/badge';
import { InfoTooltip } from '../../../Components/InfoToolTip';
import { SettingsSectionCard } from './SettingsSectionCard';
import type { SalesSettings } from '../SalesSetting';

export interface SalesVoucherNumberingSectionProps {
  settings: SalesSettings;
  onChange: (field: keyof SalesSettings, value: string | number | boolean) => void;
  onResetVoucher: () => void;
}

export function SalesVoucherNumberingSection({ settings, onChange, onResetVoucher }: SalesVoucherNumberingSectionProps) {
  return (
    <SettingsSectionCard
      icon={<Hash className="size-4" />}
      title="Voucher Numbering"
      description="Invoice naming, prefix and next number"
      action={
        <Button type="button" variant="outline" size="sm" onClick={onResetVoucher} className="text-destructive hover:text-destructive">
          Reset to Default
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Label htmlFor="voucher-name">Voucher Name</Label>
            <Badge variant="destructive" className="rounded-md px-1.5 py-0 text-[10px]">LOCKED</Badge>
            <InfoTooltip text="Internal document name for this transaction type." />
          </div>
          <Input id="voucher-name" value={settings.voucherName || 'Invoice'} disabled className="cursor-not-allowed select-none" />
        </div>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Label htmlFor="voucher-prefix">Voucher Prefix</Label>
            <InfoTooltip text="Letters added before invoice number (e.g., INV-1)." />
          </div>
          <Input
            id="voucher-prefix"
            value={settings.voucherPrefix || ''}
            onChange={(e) => onChange('voucherPrefix', e.target.value)}
            placeholder="e.g., INV"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Label htmlFor="current-number">Next Voucher Number</Label>
            <InfoTooltip text="Sequence number for next generated invoice." />
          </div>
          <Input
            id="current-number"
            type="number"
            value={settings.currentVoucherNumber ?? 1}
            onChange={(e) => onChange('currentVoucherNumber', e.target.value)}
            min={1}
            step={1}
          />
        </div>
      </div>
    </SettingsSectionCard>
  );
}
