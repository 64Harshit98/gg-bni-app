    import React, { useState, useEffect } from 'react';
    import type { Item } from '../constants/models';
    import { X, ShoppingCart, Plus, Minus } from 'lucide-react';
    import { Spinner } from '../constants/Spinner';

    interface ItemDetailDrawerProps {
        item: Item | null;
        isOpen: boolean;
        onClose: () => void;
        onAddToCart: (item: Item, quantity: number, isFromDrawer?: boolean) => void;
        initialQuantity?: number;
    }

    export const ItemDetailDrawer: React.FC<ItemDetailDrawerProps> = ({ item, isOpen, onClose, onAddToCart, initialQuantity = 1 }) => {
        const [quantity, setQuantity] = useState(initialQuantity > 0 ? initialQuantity : 1);
        const [isAdding, setIsAdding] = useState(false);

        useEffect(() => {
            if (isOpen) {
                setQuantity(initialQuantity > 0 ? initialQuantity : 1);
            }
        }, [isOpen, initialQuantity]);

        if (!item) return null;

        const updateQuantity = (newQty: number) => {
            if (newQty < 1) return;
            setQuantity(newQty);
            onAddToCart(item, newQty, true); 
        };

        const handleAddToCartClick = () => {
            setIsAdding(true);
            onAddToCart(item, quantity, true); 
            
            setTimeout(() => {
                setIsAdding(false);
                onClose();
            }, 500);
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
                    className={`fixed bottom-0 left-0 right-0 bg-white z-[110] transition-transform duration-500 ease-out max-w-[450px] mx-auto rounded-sm overflow-hidden shadow-2xl ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
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

                    <div className="max-h-[75vh]">
                        {/* 1. IMAGE - Reduced Height to save vertical space */}
                        <div className="w-full h-48 bg-gray-100 overflow-hidden">
                            {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                    <ShoppingCart size={48} strokeWidth={1} />
                                </div>
                            )}
                        </div>

                        <div className="p-5">
                            {/* 2. PRICE & DESCRIPTION - Compact spacing */}
                            <div className="text-left mb-4">
                                <p className="text-[15px] text-gray-900 truncate font-bold">{item.name}</p>
                                <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Price</h4>
                                <p className="text-xl font-black text-gray-900 leading-none mt-1">
                                    ₹{item.mrp.toFixed(2)}
                                </p>
                                
                                <div className="mt-3">
                                    <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Description</h4>
                                    <p className="text-xs text-gray-600 leading-snug font-medium mt-1">
                                        {item.description ? item.description : 'No description available for this item.'}
                                    </p>
                                </div>
                            </div>

                            {/* 3. QUANTITY SECTION - Tightened padding */}
                            <div className="flex items-center justify-between py-3 border-t border-gray-100 mb-1">
                                <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">Quantity:</span>
                                <div className="flex items-center border border-gray-200 rounded-sm p-0.5">
                                    <button
                                        onClick={() => updateQuantity(quantity - 1)}
                                        className="p-1.5 text-gray-500 hover:text-[#00A3E1]"
                                    >
                                        <Minus size={16} />
                                    </button>
                                    <span className="w-10 text-center font-black text-gray-900 text-base">
                                        {quantity}
                                    </span>
                                    <button
                                        onClick={() => updateQuantity(quantity + 1)}
                                        className="p-1.5 text-gray-500 hover:text-[#00A3E1]"
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* 4. FULL WIDTH BUTTON */}
                            <button
                                onClick={handleAddToCartClick}
                                disabled={isAdding}
                                className="w-full bg-[#00A3E1] text-white py-3.5 rounded-sm font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-blue-200 flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-70 mb-4"
                            >
                                {isAdding ? <Spinner /> : <ShoppingCart size={16} />}
                                {isAdding ? 'Adding...' : 'Add to Cart'}
                            </button>
                        </div>
                    </div>
                </div>
            </>
        );
    };