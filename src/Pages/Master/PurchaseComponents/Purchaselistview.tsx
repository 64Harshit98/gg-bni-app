import React from 'react';
import { FiTrash2 } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes.constants';
import { IconScanCircle } from '../../../constants/Icons';
import SearchableItemInput from '../../../UseComponents/SearchIteminput';
import { GenericCartList } from '../../../Components/CartItem';
import { State } from '../../../enums';
import type { SharedViewProps } from './Purchasetypes';

const PurchaseListView: React.FC<SharedViewProps> = ({
    // Items & cart
    items,
    availableItems,
    cartItemsAdapter,
    // Handlers
    onItemSelected,
    onOpenEditDrawer,
    onDeleteItem,
    onClearCart,
    onDiscountChange,
    onPriceChange,
    onPriceBlur,
    onQuantityChange,
    onScanBarcode,
    // UI state
    pageIsLoading,
    error,
    setModal,
    // Footer / summary
    SummaryPanel,
    MobileFooter,
    categories,
    itemGroupMap,
}) => {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden">
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                <div className="flex flex-col w-full md:w-3/4 h-full relative min-w-0 border-r border-gray-200">

                    {/* Search bar */}
                    <div className="flex-shrink-0 p-2 bg-white border-b mt-2 rounded-sm md:mt-0">
                        <div className="flex gap-2 items-end">
                            <div className="flex-grow">
                                <SearchableItemInput
                                    label="Search & Add Item"
                                    placeholder="Search by name or barcode..."
                                    items={availableItems}
                                    onItemSelected={onItemSelected}
                                    isLoading={pageIsLoading}
                                    error={error}
                                    onAddItem={q => navigate(ROUTES.ITEM_ADD, { state: { prefillName: q } })}
                                    categories={categories}
                                    itemGroupMap={itemGroupMap}
                                />
                            </div>
                            <button
                                onClick={onScanBarcode}
                                className="p-3 bg-gray-700 text-white rounded-md font-semibold transition hover:bg-gray-800"
                                title="Scan Barcode"
                            >
                                <IconScanCircle width={20} height={20} />
                            </button>
                        </div>
                    </div>

                    {/* Cart area */}
                    <div className="flex-1 flex flex-col bg-gray-100 overflow-y-hidden md:border-r border-gray-200">

                        {/* Cart header row */}
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
                                        <FiTrash2 /> Clear
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex-shrink-0 grid grid-cols-2 px-2 py-1 border-b border-gray-100" />

                        {/* List */}
                        <div className="flex flex-col gap-2">
                            <GenericCartList
                                items={cartItemsAdapter}
                                availableItems={availableItems}
                                basePriceKey="mrp"
                                priceLabel="MRP"
                                settings={{
                                    enableRounding: false,
                                    roundingInterval: 0,
                                    enableItemWiseDiscount: true,
                                    lockDiscount: false,
                                    lockPrice: false,
                                }}
                                applyRounding={val => val}
                                State={State}
                                setModal={setModal}
                                onOpenEditDrawer={onOpenEditDrawer}
                                onDeleteItem={onDeleteItem}
                                onDiscountChange={onDiscountChange}
                                onCustomPriceChange={onPriceChange}
                                onCustomPriceBlur={onPriceBlur}
                                onQuantityChange={onQuantityChange}
                            />
                        </div>
                    </div>

                    <MobileFooter />
                </div>

                <SummaryPanel />
            </div>
        </div>
    );
};

export default PurchaseListView;