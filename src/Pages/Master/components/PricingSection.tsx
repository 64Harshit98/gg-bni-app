import * as React from 'react';
import { Percent } from 'lucide-react';
import { FormSectionHeader } from './FormSectionHeader';
import { FieldLabel } from './FieldLabel';
import { fieldInputClass, fieldHelperClass, blurOnWheel } from './formFieldStyles';

interface PricingSectionProps {
  unitLabel: string;
  itemMRP: string;
  onItemMRPChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  itemSalesPrice: string;
  onItemSalesPriceChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  itemPurchasePrice: string;
  onItemPurchasePriceChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  requirePurchasePrice?: boolean;
  itemDiscount: string;
  onItemDiscountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  requireSaleDiscount?: boolean;
  purchaseDiscount: string;
  onPurchaseDiscountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  requirePurchaseDiscount?: boolean;
  itemTax: string;
  onItemTaxChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  requireTax?: boolean;
  hsnCode: string;
  onHsnCodeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  requireHsnCode?: boolean;
}

/**
 * Everything money- and tax-related: MRP / sales / purchase pricing, the
 * discount pair, and GST/tax + HSN compliance fields.
 */
export const PricingSection: React.FC<PricingSectionProps> = ({
  unitLabel,
  itemMRP,
  onItemMRPChange,
  itemSalesPrice,
  onItemSalesPriceChange,
  itemPurchasePrice,
  onItemPurchasePriceChange,
  requirePurchasePrice,
  itemDiscount,
  onItemDiscountChange,
  requireSaleDiscount,
  purchaseDiscount,
  onPurchaseDiscountChange,
  requirePurchaseDiscount,
  itemTax,
  onItemTaxChange,
  requireTax,
  hsnCode,
  onHsnCodeChange,
  requireHsnCode,
}) => {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <FormSectionHeader
        icon={<Percent className="size-4" />}
        eyebrow="Step 2"
        title="Pricing & Tax"
        description="Set retail pricing, margins, discounts and applicable tax."
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel tooltip="Maximum Retail Price printed on the product.">
              {`MRP (${unitLabel})`}
            </FieldLabel>
            <input
              type="number"
              value={itemMRP}
              onWheel={blurOnWheel}
              onChange={onItemMRPChange}
              className={fieldInputClass}
              placeholder="0.00"
            />
            <p className={fieldHelperClass}>Required if Sale Price is empty</p>
          </div>
          <div>
            <FieldLabel required tooltip="The price you are selling this item for.">
              {`Sales Price (${unitLabel})`}
            </FieldLabel>
            <input
              type="number"
              value={itemSalesPrice}
              onWheel={blurOnWheel}
              onChange={onItemSalesPriceChange}
              className={fieldInputClass}
              placeholder="0.00"
            />
            <p className={fieldHelperClass}>Required if MRP is empty</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required={requirePurchasePrice} tooltip="The price you paid to acquire this item.">
              Purchase Price
            </FieldLabel>
            <input
              type="number"
              value={itemPurchasePrice}
              onChange={onItemPurchasePriceChange}
              className={fieldInputClass}
              placeholder="0.00"
            />
          </div>
          <div>
            <FieldLabel required={requireSaleDiscount} tooltip="Default discount percentage given to customers.">
              Sale Disc (%)
            </FieldLabel>
            <input
              type="number"
              value={itemDiscount}
              onWheel={blurOnWheel}
              onChange={onItemDiscountChange}
              className={fieldInputClass}
              placeholder="0"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required={requirePurchaseDiscount} tooltip="Discount percentage received from the supplier.">
              Purchase Disc (%)
            </FieldLabel>
            <input
              type="number"
              value={purchaseDiscount}
              onWheel={blurOnWheel}
              onChange={onPurchaseDiscountChange}
              className={fieldInputClass}
              placeholder="0"
            />
          </div>
          <div>
            <FieldLabel required={requireTax} tooltip="Applicable tax percentage for this item.">
              Tax (%)
            </FieldLabel>
            <input
              type="number"
              value={itemTax}
              onChange={onItemTaxChange}
              className={fieldInputClass}
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <FieldLabel required={requireHsnCode} tooltip="Harmonized System Nomenclature code for taxation.">
            HSN Code
          </FieldLabel>
          <input
            type="text"
            value={hsnCode}
            onChange={onHsnCodeChange}
            className={fieldInputClass}
            placeholder="e.g. 123456"
          />
        </div>
      </div>
    </div>
  );
};
