import React from 'react';
import type { Item, PriceTier } from '../constants/models';
import { getAllTiers, getEffectivePriceInfo } from '../Pages/utils/pricingUtils';

interface TierPickerModalProps {
  item: Item | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: Item, tier: PriceTier) => void;
  hidePrice?: boolean; // for public catalogue when price is hidden
}

export const TierPickerModal: React.FC<TierPickerModalProps> = ({
  item,
  isOpen,
  onClose,
  onSelect,
  hidePrice = false,
}) => {
  if (!isOpen || !item) return null;

  const tiers = getAllTiers(item);

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-0 sm:px-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-sm rounded-sm sm:rounded-sm shadow-2xl p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-gray-800">Choose Option</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4 truncate">{item.name}</p>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {tiers.map((tier) => {
            const { salePrice, mrp, hasBothPrices } = getEffectivePriceInfo(tier);
            return (
              <button
                key={tier.id}
                onClick={() => {
                  onSelect(item, tier);
                  onClose();
                }}
                className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-sm hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-800">{tier.label}</p>
                  <p className="text-[10px] text-gray-400">
                    {tier.quantity} {item.unit === 'pkt' ? 'pcs' : (item.unit || 'pcs')} per unit
                  </p>
                </div>
                {!hidePrice && (
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">₹{salePrice}</p>
                    {hasBothPrices && (
                      <p className="text-[10px] text-gray-400 line-through">₹{mrp}</p>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};