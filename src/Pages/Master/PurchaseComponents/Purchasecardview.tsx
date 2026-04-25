import React,{useState} from 'react';
import { FiTrash2 } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes.constants';
import { IconScanCircle } from '../../../constants/Icons';
import SearchableItemInput from '../../../UseComponents/SearchIteminput';
import { GenericCartGrid } from '../../../Components/CardGrid';
import { State } from '../../../enums';
import type { SharedViewProps } from './Purchasetypes';

export interface PurchaseCardViewProps extends SharedViewProps {
  isCardImageView: boolean;
}

const PurchaseCardView: React.FC<PurchaseCardViewProps> = ({
  // Items & cart
  items,
  availableItems,
  cartEntries,
  itemGroupMap,
  // Handlers
  onAddItem,
  onQuantityChange,
  onDeleteItem,
  onClearCart,
  onItemSelected,
  onOpenEditDrawer,
  onScanBarcode,
  // UI state
  pageIsLoading,
  error,
  setModal,
  isCardImageView,
  // Footer / summary
  SummaryPanel,
  MobileFooter,
}) => {
  const navigate = useNavigate();
  const [cardSearchQuery, setCardSearchQuery] = useState<string>('');

  return (
    <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-0">
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="flex flex-col w-full md:w-3/4 h-full relative min-w-0 border-r border-gray-200 overflow-hidden">

          {/* Search bar */}
          <div className="flex-shrink-0 p-2 bg-white border-b pb-3">
            <div className="flex gap-2 items-end w-full">
              <div className="flex-grow">
                <SearchableItemInput
                  label="Search Item"
                  placeholder="Search by name or barcode..."
                  items={availableItems}
                  onItemSelected={onItemSelected}
                  onSearchChange={setCardSearchQuery}
                  isLoading={pageIsLoading}
                  error={error}
                  onAddItem={q => navigate(ROUTES.ITEM_ADD, { state: { prefillName: q } })}
                  disableDropdown={true}
                />
              </div>
              <button
                onClick={onScanBarcode}
                className="bg-transparent text-gray-700 p-3 border border-gray-700 rounded-sm font-semibold transition hover:bg-gray-800"
                title="Scan Barcode"
              >
                <IconScanCircle width={20} height={20} />
              </button>
            </div>
          </div>

          {/* Cart header */}
          <div className="pt-2 flex-shrink-0 grid grid-cols-3 items-center border-b pb-2 px-2">
            <div className="justify-self-start">
              <h3 className="text-gray-700 font-medium">Cart</h3>
            </div>
            <div />
            <div className="justify-self-end">
              {items.length > 0 && (
                <button
                  onClick={onClearCart}
                  className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 flex items-center gap-1"
                >
                  <FiTrash2 size={14} /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Card grid */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <GenericCartGrid
              items={availableItems}
              cartEntries={cartEntries}
              itemGroupMap={itemGroupMap}
              externalSearchQuery={cardSearchQuery}
              basePriceKey="purchasePrice"
              settings={{
                showImages: isCardImageView,
                hideMrp: false,
              }}
              State={State}
              setModal={setModal}
              onAddItem={onAddItem}
              onQuantityChange={onQuantityChange}
              onDeleteCartEntry={onDeleteItem}
              onEditItem={onOpenEditDrawer}
              onScanBarcode={onScanBarcode}
            />
          </div>

          <MobileFooter />
        </div>

        <SummaryPanel />
      </div>
    </div>
  );
};

export default PurchaseCardView;