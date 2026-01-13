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

    // REAL-TIME UPDATE LOGIC: Jab bhi +/- dabega, cart update hoga
    const updateQuantity = (newQty: number) => {
        if (newQty < 1) return;
        setQuantity(newQty);
        onAddToCart(item, newQty, true); // true matlab drawer se sync ho raha hai
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
            <div
                className={`fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            <div
                className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-[32px] z-[110] p-5 shadow-2xl transition-transform duration-300 ease-out max-w-[450px] mx-auto ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
            >
                <div className="flex justify-between items-center mb-4">
                    <div className="w-10 h-1 bg-gray-100 rounded-full" />
                    <button onClick={onClose} className="p-1.5 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex gap-4 mb-5">
                    <div className="w-24 h-24 bg-[#F8FAFC] rounded-xl overflow-hidden border border-gray-50 shrink-0">
                        {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-300">
                                <ShoppingCart size={32} />
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <h3 className="text-sm text-[#1A3B5D] font-black uppercase tracking-tight truncate">
                            {item.name}
                        </h3>
                        <p className="text-sm font-black text-[#00A3E1] mt-1">
                            ₹{item.mrp.toFixed(2)}
                        </p>
                        <p className="text-[9px] text-gray-500 line-clamp-2 mt-1 font-medium italic">
                            {item.barcode ? `Barcode: ${item.barcode}` : 'Premium Quality Product'}
                        </p>
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-50 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                            Select Quantity
                        </span>
                        <div className="flex items-center border border-gray-100 rounded-xl overflow-hidden bg-gray-50">
                            <button
                                onClick={() => updateQuantity(quantity - 1)}
                                className="p-2 text-gray-400 hover:text-[#00A3E1] transition-colors"
                            >
                                <Minus size={14} />
                            </button>
                            <span className="w-8 text-center font-black text-[#1A3B5D] text-xs">
                                {quantity}
                            </span>
                            <button
                                onClick={() => updateQuantity(quantity + 1)}
                                className="p-2 text-gray-400 hover:text-[#00A3E1] transition-colors"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={handleAddToCartClick}
                        disabled={isAdding}
                        className="w-full bg-[#00A3E1] text-white py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-70"
                    >
                        {isAdding ? <Spinner /> : <ShoppingCart size={14} />}
                        {isAdding ? 'Adding...' : 'Add to Cart'}
                    </button>
                </div>
            </div>
        </>
    );
};