import { Truck } from 'lucide-react';

import { SettingsSectionCard } from './SettingsSectionCard';
import { SettingsToggleRow } from './SettingsToggleRow';
import type { SalesSettings } from '../SalesSetting';

export interface SalesOrderDeliverySectionProps {
  settings: SalesSettings;
  onCheckboxChange: (field: keyof SalesSettings, checked: boolean) => void;
}

export function SalesOrderDeliverySection({ settings, onCheckboxChange }: SalesOrderDeliverySectionProps) {
  return (
    <SettingsSectionCard icon={<Truck className="size-4" />} title="Order &amp; Delivery" description="Stock, dues and extra billing fields">
      <SettingsToggleRow
        id="allow-negative"
        label="Allow Negative Inventory Billing"
        description="Allow billing items even when stock is zero."
        tooltip="Allow selling items even if recorded stock is zero."
        checked={settings.allowNegativeStock ?? false}
        onChange={(checked) => onCheckboxChange('allowNegativeStock', checked)}
      />
      <SettingsToggleRow
        id="allow-due"
        label="Allow Due Billing"
        description="Allow partial or no payment billing (credit)."
        tooltip="Allow finalizing sales with pending amount."
        checked={settings.allowDueBilling ?? false}
        onChange={(checked) => onCheckboxChange('allowDueBilling', checked)}
      />
      <SettingsToggleRow
        id="enable-shipping"
        label="Enable Shipping Details"
        description="Allow shipping address and GST capture."
        tooltip="Allow capturing separate shipping address and GST for customers."
        checked={settings.enableShippingDetails ?? false}
        onChange={(checked) => onCheckboxChange('enableShippingDetails', checked)}
      />
      <SettingsToggleRow
        id="enable-expense"
        label="Enable Extra Expense"
        description="Allow additional charges like freight/packing."
        tooltip="Add extra charge to final bill."
        checked={settings.enableExtraExpense ?? false}
        onChange={(checked) => onCheckboxChange('enableExtraExpense', checked)}
      />
      <SettingsToggleRow
        id="enable-narration"
        label="Enable Narration / Remarks"
        description="Allow adding custom note in invoice."
        tooltip="Allow custom remarks on invoice."
        checked={settings.enableNarration ?? false}
        onChange={(checked) => onCheckboxChange('enableNarration', checked)}
      />
      <SettingsToggleRow
        id="enable-transport"
        label="Enable Transport Details"
        description="Allow capturing transport info like GR/RR No, vehicle number etc."
        tooltip="Show transport details option in payment drawer."
        checked={settings.enableTransportDetails ?? false}
        onChange={(checked) => onCheckboxChange('enableTransportDetails', checked)}
      />
    </SettingsSectionCard>
  );
}
