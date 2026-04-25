import React from 'react';
import SearchableItemInput from '../UseComponents/SearchIteminput';
import { GenericCartList } from '../Components/CartItem';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { IconScanCircle } from '../constants/Icons';
import { applyRounding } from '../Pages/Master/SalesComponents/Salescalculations';
import { State } from '../enums';
import type { Item, SalesItem } from '../constants/models';
import type { OrderItem } from '../Catalogue/Orders';

interface ExchangeSectionProps {
  availableItems: OrderItem[];
  mappedExchangeItems: SalesItem[];
  catalogueSettings: any;
  isLoading: boolean;
  error: string | null;
  onItemSelected: (item: any) => void;
  onScanClick: () => void;
  onDeleteItem: (id: string) => void;
  onDiscountChange: (id: string, value: number | string) => void;
  onCustomPriceChange: (id: string, value: string) => void;
  onCustomPriceBlur: (id: string) => void;
  onQuantityChange: (id: string, qty: number) => void;
  setModal: (modal: { message: string; type: State } | null) => void;
  selectedItemForEdit: Item | null;
  isItemDrawerOpen: boolean;
  onOpenEditDrawer: (item: any) => void;
  onCloseEditDrawer: () => void;
  onSaveSuccess: (data: Partial<Item>) => void;
}

export const ExchangeSection: React.FC<ExchangeSectionProps> = ({
  availableItems, mappedExchangeItems, catalogueSettings,
  isLoading, error,
  onItemSelected, onScanClick,
  onDeleteItem, onDiscountChange, onCustomPriceChange, onCustomPriceBlur, onQuantityChange,
  setModal, selectedItemForEdit, isItemDrawerOpen, onOpenEditDrawer, onCloseEditDrawer, onSaveSuccess,
}) => (
  <>
    <div className="flex items-end gap-1 mb-3">
      <div className="flex-grow">
        <SearchableItemInput
          label="Add Exchange Item"
          placeholder="Search inventory..."
          items={availableItems.map((item: any) => ({ ...item, purchasePrice: item.purchasePrice ?? 0 }))}
          onItemSelected={onItemSelected}
          isLoading={isLoading}
          error={error}
        />
      </div>
      <button
        onClick={onScanClick}
        className="p-2.5 bg-gray-800 text-white rounded-sm"
      >
        <IconScanCircle width={20} height={20} />
      </button>
    </div>

    {mappedExchangeItems.length > 0 && (
      <div className="border rounded-sm overflow-hidden mt-4">
        <div className="bg-gray-50 px-3 py-2 border-b text-xs font-bold text-gray-500 uppercase">
          Exchange Cart
        </div>
        <div className="max-h-60 overflow-y-auto bg-gray-50">
          <GenericCartList<any>
            items={mappedExchangeItems}
            availableItems={availableItems as any}
            basePriceKey="mrp"
            priceLabel="MRP"
            settings={{
              enableRounding: false,
              roundingInterval: 1,
              enableItemWiseDiscount: catalogueSettings?.enableItemWiseDiscount ?? false,
              lockDiscount: false,
              lockPrice: false,
              hideMrp: false,
            }}
            applyRounding={applyRounding}
            State={State}
            setModal={setModal}
            onOpenEditDrawer={onOpenEditDrawer}
            onDeleteItem={onDeleteItem}
            onDiscountChange={onDiscountChange}
            onCustomPriceChange={onCustomPriceChange}
            onCustomPriceBlur={onCustomPriceBlur}
            onQuantityChange={onQuantityChange}
          />
        </div>
      </div>
    )}

    {isItemDrawerOpen && selectedItemForEdit && (
      <ItemEditDrawer
        item={selectedItemForEdit}
        isOpen={isItemDrawerOpen}
        onClose={onCloseEditDrawer}
        onSaveSuccess={onSaveSuccess}
        isCatalogue
      />
    )}
  </>
);
