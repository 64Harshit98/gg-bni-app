import React, { useState, useEffect } from 'react';
import type { Item } from '../constants/models';
import { X, ShoppingCart, Plus, Minus } from 'lucide-react';
import { Spinner } from '../constants/Spinner';
import type { CatalogueSalesSettings } from '../Catalogue/Settings/CatalogueSalesSetting'
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { FiPackage } from 'react-icons/fi';

// --- ADDED: The exact same price logic from SharedProduct.tsx ---
const getEffectivePriceInfo = (item: Item) => {
    const mrp = Number(item.mrp || 0);
    const itemSalesPrice = Number(item.salesPrice || 0);
    const presetDiscount = Number((item as any).discount || 0);

    let salePrice = 0;
    let calculatedDiscount = 0;

    if (mrp > 0 && itemSalesPrice > 0) {
        // Case 1: Both exist. Ignore DB discount. Calculate diff.
        salePrice = itemSalesPrice;
        calculatedDiscount = ((mrp - itemSalesPrice) / mrp) * 100;
    } else if (itemSalesPrice > 0) {
        // Case 2: Only Sales Price exists. Apply DB discount.
        calculatedDiscount = presetDiscount;
        salePrice = itemSalesPrice * (1 - (presetDiscount / 100));
    } else if (mrp > 0) {
        // Case 3: Only MRP exists. Apply DB discount.
        calculatedDiscount = presetDiscount;
        salePrice = mrp * (1 - (presetDiscount / 100));
    }

    // Round to 2 decimal places to ensure clean UI numbers
    salePrice = Math.round((salePrice + Number.EPSILON) * 100) / 100;

    return {
        mrp,
        salePrice,
        discountPercent: Math.round(calculatedDiscount),
        hasDiscount: calculatedDiscount > 0,
        hasBothPrices: mrp > 0 && salePrice > 0 && salePrice < mrp
    };
};
// ----------------------------------------------------------------

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
    companyId?: string;
    onVariantSelect?: (item: Item) => void;
    variantGroupIds?: string[];
    onNotifyRequest?: (item: Item) => void;
    notified?: boolean;
}

export const ItemDetailDrawer: React.FC<ItemDetailDrawerProps> = ({
    item,
    isOpen,
    onClose,
    onUpdateQuantity,
    onAddToCart,
    catalogueSettings,
    initialQuantity = 0,
    companyId,
    onVariantSelect,
    variantGroupIds = [],
    isCustomerApproved = false,
    onNotifyRequest,
    notified = false,
}) => {
    const [quantity, setQuantity] = useState(initialQuantity || 0);
    const [isAdding, setIsAdding] = useState(false);
    const [variantItems, setVariantItems] = useState<Item[]>([]);
    const [variantLoading, setVariantLoading] = useState(false);
    const [imageBroken, setImageBroken] = useState(false);
    const [brokenVariantIds, setBrokenVariantIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen) {
            setQuantity(initialQuantity || 0);
        }
    }, [isOpen, initialQuantity]);
    // reset broken-image flags whenever a different item opens in the drawer
    useEffect(() => {
        setImageBroken(false);
        setBrokenVariantIds(new Set());
    }, [item?.id]);

    useEffect(() => {
        const fetchVariants = async () => {
            const idsToFetch = variantGroupIds.filter(id => String(id) !== String(item?.id));
            if (!isOpen || !item || !companyId || !idsToFetch.length) {
                setVariantItems([]);
                return;
            }
            setVariantLoading(true);
            try {
                const results: Item[] = [];
                for (const id of idsToFetch) {
                    const snap = await getDoc(doc(db, 'companies', companyId, 'items', id));
                    if (snap.exists()) results.push({ id: snap.id, ...snap.data() } as Item);
                }
                setVariantItems(results);
            } catch (e) {
                console.error('Failed to load variants', e);
            } finally {
                setVariantLoading(false);
            }
        };
        fetchVariants();
    }, [isOpen, item?.id, companyId, variantGroupIds]);

    if (!item) return null;

    const multiplier = (item as any).unitMultiplier || 1;
    const unitLabel = `(${multiplier} pcs)`;
    const priceMode = catalogueSettings?.priceDisplayMode || 'both';

    // --- UPDATED: Use the synchronized pricing logic ---
    const { mrp, salePrice, discountPercent, hasDiscount, hasBothPrices } = getEffectivePriceInfo(item);

    const hidePriceEnabled = catalogueSettings?.hidePrice === true;
    const approvalEnabled = catalogueSettings?.requireApproval === true;
    const shouldHidePrice = hidePriceEnabled || (approvalEnabled && !isCustomerApproved);

    const showDiscountBadge =
        !hidePriceEnabled &&
        catalogueSettings?.showDiscountBadge &&
        priceMode !== 'mrp' &&
        hasDiscount;

    // Must match the card's check exactly (SharedProduct.tsx): a MISSING
    // allowNegativeInventory setting defaults to "don't allow negative stock",
    // same as the card's `!catalogueSettings?.allowNegativeInventory`. The
    // previous `=== false` strict check treated an unset/undefined setting as
    // "negative inventory allowed", so this drawer showed an active "Add to
    // Cart" for an item the card correctly flagged out of stock.
    const isActuallyOutOfStock = (item.stock || 0) <= 0;
    const isOutOfStock = !catalogueSettings?.allowNegativeInventory && isActuallyOutOfStock;
    const showNotifyButton = catalogueSettings?.enableOutOfStockNotification && isActuallyOutOfStock;

    const updateQuantity = (delta: number) => {
        const newQty = quantity + delta;
        if (newQty <= 0) {
            setQuantity(0);
            onUpdateQuantity(item.id!, -quantity);
            return;
        }
        setQuantity(newQty);
        onUpdateQuantity(item.id!, delta);
    };

    const handleAddToCartClick = () => {
        setIsAdding(true);
        onAddToCart(item);
        setQuantity(1);
        setTimeout(() => setIsAdding(false), 300);
    };

    return (
        <>
            <div
                className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            <div
                className={`fixed bottom-0 left-0 right-0 h-[85vh] max-h-[95vh] bg-white z-[1000] transition-transform duration-500 ease-out max-w-[450px] mx-auto rounded-sm overflow-hidden shadow-2xl ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
            >
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
                    <div className="w-full flex-[0.9] bg-gray-100 overflow-hidden relative">
                        {item.imageUrl && !imageBroken ? (
                            <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-full h-full object-contain"
                                onError={() => setImageBroken(true)}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                                <FiPackage size={48} />
                            </div>
                        )}
                        {showDiscountBadge && (
                            <div className="absolute top-4 right-4 bg-[#F97316] text-white px-2 py-0.5 rounded-sm text-[11px] font-black uppercase tracking-tight shadow-md">
                                {discountPercent}% OFF
                            </div>
                        )}
                    </div>

                    <div className="p-5">
                        <div className="text-left mb-4">
                            <p className="text-[15px] text-gray-900 truncate font-bold">{item.name}</p>
                            {!shouldHidePrice && <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Price</h4>}

                            <div className="flex items-center justify-between mt-1">
                                {!shouldHidePrice && (
                                    <div className="flex items-center gap-2">
                                        {priceMode === 'mrp' && (
                                            <p className="text-xl font-black text-gray-900">
                                                ₹{mrp}
                                                <span className="text-xs text-gray-500 ml-1 font-semibold">{unitLabel}</span>
                                            </p>
                                        )}

                                        {priceMode === 'salePrice' && (
                                            <p className="text-xl font-black text-[#F97316]">
                                                ₹{salePrice}
                                                <span className="text-xs text-gray-500 ml-1 font-semibold">{unitLabel}</span>
                                            </p>
                                        )}

                                        {priceMode === 'both' && hasBothPrices ? (
                                            <>
                                                <p className="text-sm font-bold text-gray-400 line-through">
                                                    ₹{mrp}
                                                </p>
                                                <p className="text-xl font-black text-[#F97316]">
                                                    ₹{salePrice}
                                                    <span className="text-xs text-gray-500 ml-1 font-semibold">{unitLabel}</span>
                                                </p>
                                            </>
                                        ) : priceMode === 'both' ? (
                                            <p className="text-xl font-black text-[#F97316]">
                                                ₹{salePrice}
                                                <span className="text-xs text-gray-500 ml-1 font-semibold">{unitLabel}</span>
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
                        </div>

                        <div className="mt-3">
                            <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Description</h4>
                            <p className="text-xs text-gray-600 leading-snug font-medium mt-1">
                                {item.description ? item.description : 'No description available for this item.'}
                            </p>
                        </div>

                        {(variantLoading || variantItems.length > 0) && (
                            <div className="mt-3">
                                <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Variants</h4>
                                {variantLoading ? (
                                    <div className="flex gap-2">
                                        {[1, 2, 3].map(n => (
                                            <div key={n} className="w-16 h-20 bg-gray-100 rounded-sm animate-pulse flex-shrink-0" />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                                        {[...variantItems.filter(v => String(v.id) !== String(item.id)), item]
                                            .sort((a, b) => variantGroupIds.indexOf(String(a.id)) - variantGroupIds.indexOf(String(b.id)))
                                            .map(v => {
                                                const isSelected = String(v.id) === String(item.id);
                                                // --- UPDATED: Also apply price calculation to variants ---
                                                const vPriceInfo = getEffectivePriceInfo(v);

                                                return (
                                                    <button
                                                        key={v.id}
                                                        onClick={() => !isSelected && onVariantSelect?.(v)}
                                                        className={`flex-shrink-0 flex flex-col items-center gap-1 p-1.5 rounded-sm border-2 transition-all active:scale-95 ${isSelected
                                                            ? 'border-[#F97316] bg-[#F97316]/5 text-[#F97316]'
                                                            : 'border-gray-200 bg-white text-gray-700 hover:border-[#F97316] hover:bg-[#F97316]/5'
                                                            }`}
                                                    >
                                                        {v.imageUrl && !brokenVariantIds.has(String(v.id))
                                                            ? (
                                                                <img
                                                                    src={v.imageUrl}
                                                                    alt={v.name}
                                                                    className="w-10 h-10 object-cover rounded-sm"
                                                                    onError={() => {
                                                                        setBrokenVariantIds(prev => {
                                                                            if (prev.has(String(v.id))) return prev;
                                                                            const next = new Set(prev);
                                                                            next.add(String(v.id));
                                                                            return next;
                                                                        });
                                                                    }}
                                                                />
                                                            )
                                                            : (
                                                                <div className={`w-10 h-10 rounded-sm flex items-center justify-center ${isSelected ? 'bg-orange-100' : 'bg-gray-100'}`}>
                                                                    <FiPackage size={16} className="text-gray-300" />
                                                                </div>
                                                            )
                                                        }
                                                        <span className="text-[9px] font-black max-w-[52px] truncate text-center leading-tight">{v.name}</span>
                                                        {!shouldHidePrice && (
                                                            <span className={`text-[9px] font-bold ${isSelected ? 'text-[#F97316]' : 'text-gray-500'}`}>
                                                                ₹{vPriceInfo.salePrice}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })
                                        }
                                    </div>
                                )}
                            </div>
                        )}

                        {!isOutOfStock && quantity > 0 ? (
                            <div className="flex items-center justify-between py-3 border-t border-gray-100 mb-1 mt-4">
                                <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                                    Quantity:
                                </span>
                                <div className="flex items-center border border-gray-200 rounded-sm p-0.5">
                                    <button
                                        onClick={() => updateQuantity(-1)}
                                        className="p-1.5 text-gray-500 hover:text-[#F97316]"
                                    >
                                        <Minus size={16} />
                                    </button>
                                    <span className="w-10 text-center font-black text-gray-900 text-base">
                                        {quantity}
                                    </span>
                                    <button
                                        onClick={() => updateQuantity(1)}
                                        className="p-1.5 text-gray-500 hover:text-[#F97316]"
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                            </div>
                        ) : showNotifyButton ? (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!notified) onNotifyRequest?.(item);
                                }}
                                className={`w-full py-3.5 rounded-sm font-black text-[10px] uppercase tracking-[0.2em] shadow-lg flex items-center justify-center gap-2 active:scale-[0.97] transition-all mt-4 mb-4 ${notified
                                    ? "bg-green-600 text-white cursor-default"
                                    : "bg-orange-400 text-white"
                                    }`}
                            >
                                {notified ? '✓ We will notify you' : '🔔 Notify Me'}
                            </button>
                        ) : (
                            <button
                                disabled={isOutOfStock}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddToCartClick();
                                }}
                                className={`w-full py-3.5 rounded-sm font-black text-[10px] uppercase tracking-[0.2em] shadow-lg flex items-center justify-center gap-2 active:scale-[0.97] transition-all mt-4 mb-4 ${isOutOfStock
                                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                    : "bg-[#F97316] text-white shadow-blue-200"
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