import React from 'react';
import { BellRing, EyeOff, PackageX } from 'lucide-react';

import type { CatalogueSalesSettings } from '../catalogueSalesSetting.types';
import { SettingsCard } from './SettingsCard';
import { ToggleRow } from './ToggleRow';

interface InventoryStockSectionProps {
  settings: CatalogueSalesSettings;
  onToggle: (field: keyof CatalogueSalesSettings, checked: boolean) => void;
}

export const InventoryStockSection: React.FC<InventoryStockSectionProps> = ({ settings, onToggle }) => (
  <SettingsCard title="Inventory & Stock" icon={<PackageX className="size-4" />}>
    <ToggleRow
      id="allow-negative-inventory"
      label="Allow Negative Inventory"
      description="Allow orders even when stock is zero."
      checked={settings.allowNegativeInventory}
      onChange={(checked) => onToggle('allowNegativeInventory', checked)}
      tooltip="Permit catalogue orders for items with no recorded stock."
      icon={<PackageX className="size-[18px]" />}
    />

    <ToggleRow
      id="hide-out-of-stock-items"
      label="Hide Out of Stock Items"
      description="Hide Out of Stock Items."
      checked={settings.hideOutOfStock ?? false}
      onChange={(checked) => onToggle('hideOutOfStock', checked)}
      tooltip="Hide Out Of Stock Items from Customers."
      icon={<EyeOff className="size-[18px]" />}
    />

    <ToggleRow
      id="enable-out-of-stock-notification"
      label="Enable 'Notify Me' Button"
      description="Show a 'Notify Me' button on out-of-stock products so customers can request restock alerts."
      checked={settings.enableOutOfStockNotification ?? false}
      onChange={(checked) => onToggle('enableOutOfStockNotification', checked)}
      tooltip="When enabled, customers will see a 'Notify Me' button instead of 'Add to Cart' for out-of-stock items. Their requests appear in the Pre-Order Requests page."
      icon={<BellRing className="size-[18px]" />}
    />
  </SettingsCard>
);
