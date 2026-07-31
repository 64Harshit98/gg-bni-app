import React from 'react';
import { ClipboardList, Receipt, Truck } from 'lucide-react';

import { InfoTooltip } from '../../../Components/InfoToolTip';
import { Input } from '../../../Components/ui/input';
import { Label } from '../../../Components/ui/label';
import type { CatalogueSalesSettings } from '../catalogueSalesSetting.types';
import { SettingsCard } from './SettingsCard';
import { ToggleRow } from './ToggleRow';

interface OrderDeliverySectionProps {
  settings: CatalogueSalesSettings;
  onChange: (field: keyof CatalogueSalesSettings, value: string | number) => void;
  onToggle: (field: keyof CatalogueSalesSettings, checked: boolean) => void;
}

export const OrderDeliverySection: React.FC<OrderDeliverySectionProps> = ({ settings, onChange, onToggle }) => (
  <SettingsCard title="Order & Delivery" icon={<ClipboardList className="size-4" />}>
    <div className="rounded-xl border border-border bg-muted/40 p-3.5">
      <div className="mb-1 flex items-center gap-2">
        <Receipt className="size-4 text-primary" />
        <Label htmlFor="min-order" className="text-sm font-semibold text-foreground">
          Minimum Order Value (₹)
        </Label>
        <InfoTooltip text="Customer cannot place an order below this amount." />
      </div>
      <Input
        id="min-order"
        type="number"
        min="0"
        value={settings.minimumOrderValue === 0 ? '' : settings.minimumOrderValue}
        onChange={(e) => onChange('minimumOrderValue', e.target.value)}
        className="mt-2"
        placeholder="0 (no minimum)"
      />
      <p className="mt-1.5 text-xs text-muted-foreground">Leave blank or 0 to disable minimum order.</p>
    </div>

    <ToggleRow
      id="enable-transport-details"
      label="Enable Transport Details"
      description="Show transport details fields (transporter name, GR/RR No, vehicle no, etc.) on the order edit screen."
      checked={settings.enableTransportDetails ?? false}
      onChange={(checked) => onToggle('enableTransportDetails', checked)}
      tooltip="Allows adding transport/logistics information to each order."
      icon={<Truck className="size-[18px]" />}
    />
  </SettingsCard>
);
