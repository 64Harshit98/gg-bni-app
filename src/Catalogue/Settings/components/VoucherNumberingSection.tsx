import React from 'react';
import { Hash } from 'lucide-react';

import { InfoTooltip } from '../../../Components/InfoToolTip';
import { Input } from '../../../Components/ui/input';
import { Label } from '../../../Components/ui/label';
import type { CatalogueSalesSettings } from '../catalogueSalesSetting.types';
import { SettingsCard } from './SettingsCard';

interface VoucherNumberingSectionProps {
  settings: CatalogueSalesSettings;
  onChange: (field: keyof CatalogueSalesSettings, value: string | number) => void;
}

export const VoucherNumberingSection: React.FC<VoucherNumberingSectionProps> = ({ settings, onChange }) => (
  <SettingsCard title="Voucher Numbering" icon={<Hash className="size-4" />}>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Label htmlFor="voucher-prefix" className="text-sm font-medium text-foreground">
            Voucher Prefix
          </Label>
          <InfoTooltip text="Letters added before the order number (e.g., ORD-1)." />
        </div>
        <Input
          type="text"
          id="voucher-prefix"
          value={settings.voucherPrefix || ''}
          onChange={(e) => onChange('voucherPrefix', e.target.value)}
          placeholder="e.g., ORD-"
        />
      </div>
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Label htmlFor="current-number" className="text-sm font-medium text-foreground">
            Next Voucher Number
          </Label>
          <InfoTooltip text="Sequence number for the next generated order." />
        </div>
        <Input
          type="number"
          id="current-number"
          value={settings.currentVoucherNumber ?? 1}
          onChange={(e) => onChange('currentVoucherNumber', e.target.value)}
          min="1"
          step="1"
        />
      </div>
    </div>
  </SettingsCard>
);
