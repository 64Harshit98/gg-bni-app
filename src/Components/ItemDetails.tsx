import React, { useState, useEffect } from 'react';
import type { Item } from '../constants/models';
import { X, ShoppingCart, Plus, Minus } from 'lucide-react';
import { Spinner } from '../constants/Spinner';
import type { CatalogueSalesSettings } from '../Catalogue/Settings/CatalogueSalesSetting'

interface ItemDetailDrawerProps {
    item: Item | null;
    isOpen: boolean;
    onClose: () => void;
    onUpdateQuantity: (itemId: string, delta: number) => void;
    onAddToCart: (item: Item) => void;
    initialQuantity?: number;
    catalogueSettings?: CatalogueSalesSettings | null;
    isCustomerApproved?: boolean;
    onRequireLead?: () => void;
}

export const ItemDetailDrawer: React.FC<ItemDetailDrawerProps> = ({
    item,
    isOpen,
    onClose,
    onUpdateQuantity,
    onAddToCart,
    catalogueSettings,
    initialQuantity = 0,
    // isCustomerApproved = true,
    // onRequireLead
}) => {
    const [quantity, setQuantity] = useState(initialQuantity || 0);
    const [isAdding, setIsAdding] = useState(false);
    useEffect(() => {
        if (isOpen) {
            setQuantity(initialQuantity || 0);
        }
    }, [isOpen, initialQuantity]);

    if (!item) return null;
    const multiplier = (item as any).unitMultiplier || 1;
    const unitLabel = `(${multiplier} pcs)`;
    const priceMode = catalogueSettings?.priceDisplayMode || 'both';
    const baseSalePrice = item.salesPrice || item.mrp;
    const salePrice = baseSalePrice * multiplier;
    const mrp = (item.mrp || 0) * multiplier;
    const hasBothPrices =
        item.salesPrice &&
        item.mrp &&
        item.salesPrice < item.mrp;
    const hidePriceEnabled = catalogueSettings?.hidePrice === true;
    const shouldHidePrice = hidePriceEnabled;

    //  discount logic
    const hasDiscount = salePrice < mrp;

   const discountPercent = mrp && hasDiscount ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;
    const showDiscountBadge =
        !hidePriceEnabled &&
        catalogueSettings?.showDiscountBadge &&
        priceMode !== 'mrp' &&
        hasDiscount;
    const isOutOfStock =
        catalogueSettings?.allowNegativeInventory === false &&
        (item.stock || 0) <= 0;

    // const disableAddToCart = catalogueSettings?.enableOutOfStockNotification || isOutOfStock;
    const updateQuantity = (delta: number) => {
        const newQty = quantity + delta;

        // agar 0 ho gaya → cart se remove
        if (newQty <= 0) {
            setQuantity(0);
            onUpdateQuantity(item.id!, -quantity); // remove completely
            return;
        }

        setQuantity(newQty);
        onUpdateQuantity(item.id!, delta);
    };

    const handleAddToCartClick = () => {
        // if (!isCustomerApproved) {
        //     onRequireLead?.();
        //     return;
        // }

        setIsAdding(true);

        onAddToCart(item);

        setQuantity(1);   // important

        setTimeout(() => {
            setIsAdding(false);
        }, 300);
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            {/* Main Drawer */}
            <div
                className={`fixed bottom-0 left-0 right-0 h-[85vh] max-h-[95vh] bg-white z-[110] transition-transform duration-500 ease-out max-w-[450px] mx-auto rounded-sm overflow-hidden shadow-2xl ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
            >
                {/* --- HEADER SECTION --- */}
                <div className="text-center py-3 border-b border-gray-100 relative">
                    <div className="w-10 h-1 bg-gray-200 rounded-sm mx-auto mb-1.5" />
                    <h2 className="text-base font-bold text-gray-900 leading-tight">Item Details</h2>

                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-1 border border-gray-100 rounded-sm text-gray-400 hover:bg-gray-50"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="flex flex-col h-full">
                    {/* 1. IMAGE - Reduced Height to save vertical space */}
                    <div className="w-full flex-[0.9] bg-gray-100 overflow-hidden">
                        {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                                <ShoppingCart size={48} strokeWidth={1} />
                            </div>
                        )}
                        {showDiscountBadge && (
                            <div className="absolute top-16 right-2 bg-red-500 text-white px-2 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-tight shadow-md">
                                {discountPercent}% OFF
                            </div>
                        )}
                    </div>

                    <div className="p-5">
                        {/* 2. PRICE & DESCRIPTION - Compact spacing */}
                        <div className="text-left mb-4">
                            <p className="text-[15px] text-gray-900 truncate font-bold">{item.name}</p>
                            {!shouldHidePrice && <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Price</h4>}
                            <div className="flex items-center justify-between mt-1">
                                {!shouldHidePrice && (
                                    <div className="flex items-center gap-2">
                                        {priceMode === 'mrp' && (
                                            <p className="text-xl font-black text-gray-900">
                                                ₹{mrp}
                                                <span className="text-xs text-gray-500 ml-1 font-semibold">
                                                    {unitLabel}
                                                </span>
                                            </p>
                                        )}

                                        {priceMode === 'salePrice' && (
                                            <p className="text-xl font-black text-[#00A3E1]">
                                                ₹{salePrice}
                                                <span className="text-xs text-gray-500 ml-1 font-semibold">
                                                    {unitLabel}
                                                </span>
                                            </p>
                                        )}

                                        {priceMode === 'both' && hasBothPrices ? (
                                            <>
                                                <p className="text-sm font-bold text-gray-400 line-through">
                                                    ₹{mrp}
                                                </p>
                                                <p className="text-xl font-black text-[#00A3E1]">
                                                    ₹{salePrice}
                                                    <span className="text-xs text-gray-500 ml-1 font-semibold">
                                                        {unitLabel}
                                                    </span>
                                                </p>
                                            </>
                                        ) : priceMode === 'both' ? (
                                            <p className="text-xl font-black text-[#00A3E1]">
                                                ₹{salePrice}
                                                <span className="text-xs text-gray-500 ml-1 font-semibold">
                                                    {unitLabel}
                                                </span>
                                            </p>
                                        ) : null}
                                    </div>

                                )}
                                {shouldHidePrice && (
                                    <p className="text-sm font-semibold text-gray-600 mt-1">
                                        {unitLabel}
                                    </p>
                                )}
                            </div>

                            <div className="mt-3">
                                <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Description</h4>
                                <p className="text-xs text-gray-600 leading-snug font-medium mt-1">
                                    {item.description ? item.description : 'No description available for this item.'}
                                </p>
                            </div>
                        </div>

                        {/* 3. QUANTITY SECTION - Tightened padding */}
                        {!isOutOfStock && quantity > 0 ? (
                            <div className="flex items-center justify-between py-3 border-t border-gray-100 mb-1">
                                <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                                    Quantity:
                                </span>

                                <div className="flex items-center border border-gray-200 rounded-sm p-0.5">
                                    <button
                                        onClick={() => updateQuantity(-1)}
                                        className="p-1.5 text-gray-500 hover:text-[#00A3E1]"
                                    >
                                        <Minus size={16} />
                                    </button>

                                    <span className="w-10 text-center font-black text-gray-900 text-base">
                                        {quantity}
                                    </span>

                                    <button
                                        onClick={() => updateQuantity(1)}
                                        className="p-1.5 text-gray-500 hover:text-[#00A3E1]"
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                disabled={isOutOfStock}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddToCartClick();
                                }}
                                className={`w-full py-3.5 rounded-sm font-black text-[10px] uppercase tracking-[0.2em] shadow-lg flex items-center justify-center gap-2 active:scale-[0.97] transition-all mb-4 ${isOutOfStock
                                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                    : "bg-[#00A3E1] text-white shadow-blue-200"
                                    }`}
                            >
                                {isAdding ? <Spinner /> : <ShoppingCart size={16} />}
                                {isOutOfStock ? "Out of Stock" : isAdding ? "Adding..." : "Add to Cart"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};