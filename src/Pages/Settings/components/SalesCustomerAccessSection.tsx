import { ShieldCheck } from 'lucide-react';

import { SettingsSectionCard } from './SettingsSectionCard';
import { SettingsToggleRow } from './SettingsToggleRow';
import type { SalesSettings } from '../SalesSetting';

export interface SalesCustomerAccessSectionProps {
  settings: SalesSettings;
  onCheckboxChange: (field: keyof SalesSettings, checked: boolean) => void;
}

export function SalesCustomerAccessSection({ settings, onCheckboxChange }: SalesCustomerAccessSectionProps) {
  return (
    <SettingsSectionCard icon={<ShieldCheck className="size-4" />} title="Customer Access" description="Customer info requirements at checkout">
      <SettingsToggleRow
        id="req-customer-info"
        label="Enable Customer Info"
        description="Enable and disable customer info during payment."
        tooltip="Toggles the customer information capture section during checkout."
        checked={settings.enableCustomerInfoToggle ?? false}
        onChange={(checked) => onCheckboxChange('enableCustomerInfoToggle', checked)}
      />
      <SettingsToggleRow
        id="req-customer"
        label="Require Customer Name"
        description="Force customer name before save."
        tooltip="Force entering customer name before saving invoice."
        checked={settings.requireCustomerName ?? false}
        onChange={(checked) => onCheckboxChange('requireCustomerName', checked)}
      />
      <SettingsToggleRow
        id="req-mobile"
        label="Require Customer Mobile"
        description="Force customer mobile before save."
        tooltip="Force entering customer mobile before saving invoice."
        checked={settings.requireCustomerMobile ?? false}
        onChange={(checked) => onCheckboxChange('requireCustomerMobile', checked)}
      />
    </SettingsSectionCard>
  );
}
