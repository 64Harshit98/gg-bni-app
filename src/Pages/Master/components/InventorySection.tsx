import * as React from 'react';
import { Boxes } from 'lucide-react';
import { FormSectionHeader } from './FormSectionHeader';
import { FieldLabel } from './FieldLabel';
import { fieldInputClass, fieldInputBaseClass, blurOnWheel } from './formFieldStyles';

const UNIT_OPTIONS = [
  { value: 'pcs', label: 'Pieces (1 pcs)' },
  { value: 'box', label: 'Box(10 pcs)' },
  { value: 'pkt', label: 'Packet (Custom)' },
  { value: 'doz', label: 'Dozen (12 pcs)' },
  { value: 'qt', label: 'Quintal(100 pcs)' },
  { value: 'ton', label: 'Ton(1000 pcs)' },
];

interface InventorySectionProps {
  itemAmount: string;
  onItemAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  requireStock?: boolean;
  restockQuantity: string;
  onRestockQuantityChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  requireRestockQuantity?: boolean;
  moq: string;
  onMoqChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  requireMoq?: boolean;
  itemUnit: string;
  onItemUnitChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  requireUnit?: boolean;
  packetSize: string;
  onPacketSizeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Stock levels and the unit-of-sale configuration (pieces/box/dozen/etc,
 * including the custom "packet size" follow-up field).
 */
export const InventorySection: React.FC<InventorySectionProps> = ({
  itemAmount,
  onItemAmountChange,
  requireStock,
  restockQuantity,
  onRestockQuantityChange,
  requireRestockQuantity,
  moq,
  onMoqChange,
  requireMoq,
  itemUnit,
  onItemUnitChange,
  requireUnit,
  packetSize,
  onPacketSizeChange,
}) => {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <FormSectionHeader
        icon={<Boxes className="size-4" />}
        eyebrow="Step 3"
        title="Inventory & Stock"
        description="Opening stock, reorder thresholds and how the item is sold."
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required={requireStock} tooltip="Current available quantity in your inventory.">
              Stock
            </FieldLabel>
            <input
              type="number"
              value={itemAmount}
              onWheel={blurOnWheel}
              onChange={onItemAmountChange}
              className={fieldInputClass}
              placeholder="0"
            />
          </div>
          <div>
            <FieldLabel required={requireRestockQuantity} tooltip="Minimum stock level to trigger a reorder alert.">
              Restock Level
            </FieldLabel>
            <input
              type="number"
              onWheel={blurOnWheel}
              value={restockQuantity}
              onChange={onRestockQuantityChange}
              className={fieldInputClass}
              placeholder="0"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required={requireMoq} tooltip="Minimum Item Quantity to be ordered.">
              MOQ
            </FieldLabel>
            <input
              type="number"
              value={moq}
              onWheel={blurOnWheel}
              onChange={onMoqChange}
              className={fieldInputClass}
              placeholder="1"
            />
          </div>
          <div>
            <FieldLabel required={requireUnit} tooltip="Measurement unit (e.g., pieces, box, kg).">
              Unit
            </FieldLabel>
            <div className="flex gap-2">
              <select
                value={itemUnit}
                onChange={onItemUnitChange}
                className={`${fieldInputBaseClass} ${itemUnit === 'pkt' ? 'w-1/2' : 'w-full'}`}
              >
                {UNIT_OPTIONS.filter((u) => u.value !== '').map((unit) => (
                  <option key={unit.value} value={unit.value}>{unit.label}</option>
                ))}
              </select>
              {itemUnit === 'pkt' && (
                <input
                  type="number"
                  value={packetSize}
                  onChange={onPacketSizeChange}
                  className={`${fieldInputBaseClass} w-1/2`}
                  placeholder="Qty per pkt"
                  min="1"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
