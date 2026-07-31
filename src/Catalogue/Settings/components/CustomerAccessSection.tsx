import React from 'react';
import { EyeOff, ShieldCheck } from 'lucide-react';

import type { CatalogueSalesSettings } from '../catalogueSalesSetting.types';
import { SettingsCard } from './SettingsCard';
import { ToggleRow } from './ToggleRow';

interface CustomerAccessSectionProps {
  settings: CatalogueSalesSettings;
  onToggle: (field: keyof CatalogueSalesSettings, checked: boolean) => void;
}

export const CustomerAccessSection: React.FC<CustomerAccessSectionProps> = ({ settings, onToggle }) => (
  <SettingsCard title="Customer Access" icon={<ShieldCheck className="size-4" />}>
    <ToggleRow
      id="hide-price"
      label="Hide Price from Customers"
      description="Prices will not be visible on the catalogue."
      checked={settings.hidePrice ?? false}
      onChange={(checked) => onToggle('hidePrice', checked)}
      tooltip="Completely hides item prices on the customer-facing catalogue."
      icon={<EyeOff className="size-[18px]" />}
    />
    <ToggleRow
      id="require-approval"
      label="Require Customer Approval"
      description="Customers must submit a request and be approved before they can view prices or add items to cart."
      checked={settings.requireApproval ?? false}
      onChange={(checked) => onToggle('requireApproval', checked)}
      tooltip="Enables an approval gate — customers fill a lead form and you manually approve or decline them."
      icon={<ShieldCheck className="size-[18px]" />}
    />
  </SettingsCard>
);
