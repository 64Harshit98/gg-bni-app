import React, { useState, useEffect } from 'react';
import type { Item } from '../constants/models'; // Adjust path as needed
import { FiX, FiPackage, FiPlus, FiMinus, FiShoppingCart } from 'react-icons/fi';
import { Spinner } from '../constants/Spinner'; // Adjust path as needed

// --- Props ---
interface ItemDetailDrawerProps {
    item: Item | null;
    isOpen: boolean;
    onClose: () => void;
    onAddToCart: (item: Item, quantity: number) => void;
}

// --- Image preview component (from ItemEditDrawer) ---
const ImagePreview: React.FC<{ imageUrl: string | null; alt: string }> = ({ imageUrl, alt }) => {
    if (!imageUrl) {
        return (
            <div className="w-full h-40 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400">
                <FiPackage size={40} />
            </div>
        );
    }
    return (
        <img
            src={imageUrl}
            alt={alt}
            className="w-full h-40 object-cover rounded-lg border border-gray-300"
        />
    );
};

// --- Component ---
export const ItemDetailDrawer: React.FC<ItemDetailDrawerProps> = ({ item, isOpen, onClose, onAddToCart }) => {
    const [quantity, setQuantity] = useState(1);
    const [isAdding, setIsAdding] = useState(false);

    // Reset quantity to 1 when drawer opens
    useEffect(() => {
        if (isOpen) {
            setQuantity(1);
        }
    }, [isOpen, item]);

    if (!item) return null; // Don't render if no item is selected

    // --- Quantity Handlers ---
    const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        if (val > 0) {
            setQuantity(val);
        } else if (e.target.value === '') {
            setQuantity(NaN); // Allow empty input
        }
    };

    const increment = () => setQuantity(prev => (isNaN(prev) ? 1 : prev + 1));
    const decrement = () => setQuantity(prev => (isNaN(prev) || prev <= 1 ? 1 : prev - 1));

    // --- Add to Cart Handler ---
    const handleAddToCartClick = () => {
        setIsAdding(true);
        const finalQuantity = isNaN(quantity) ? 1 : quantity;
        onAddToCart(item, finalQuantity);

        // Give feedback to user before closing
        setTimeout(() => {
            setIsAdding(false);
            onClose();
        }, 500); // 0.5 second delay
    };

    // --- CSS Transition Classes (from ItemEditDrawer) ---
    const drawerClasses = isOpen
        ? 'translate-y-0 opacity-100'
        : 'translate-y-full opacity-0 pointer-events-none';
    const overlayClasses = isOpen
        ? 'opacity-100 bg-black/60'
        : 'opacity-0 bg-transparent pointer-events-none';

    // --- Render ---
    return (
        <div
            className={`fixed inset-0 z-40 flex justify-center items-end transition-opacity duration-300 ease-in-out ${overlayClasses}`}
            onClick={onClose}
        >
            <div
                className={`bg-white rounded-t-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden transform transition-all duration-300 ease-in-out ${drawerClasses}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header (styled like ItemEditDrawer) */}
                <div className="p-4 text-center relative border-b">
                    <div className="absolute left-1/2 top-2 -translate-x-1/2">
                        <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
                    </div>
                    <h2 className="text-lg font-semibold leading-none tracking-tight pt-4">
                        Item Details
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1 text-gray-500">
                        {item?.name || '...'}
                    </p>
                    <button
                        onClick={onClose}
                        className="absolute right-3 top-3 rounded-sm p-1 text-gray-500 hover:bg-gray-100 opacity-70"
                        aria-label="Close"
                    >
                        <FiX size={18} />
                    </button>
                </div>

                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">

                    {/* Image */}
                    <div>
                        <ImagePreview imageUrl={item.imageUrl || null} alt={item.name} />
                    </div>

                    {/* Price */}
                    <div>
                        <label className="text-sm font-medium text-gray-500">Price</label>
                        <p className="text-3xl font-bold text-gray-900">₹{item.mrp.toFixed(2)}</p>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-sm font-medium text-gray-500">Description</label>
                        <p className="text-base text-gray-700 mt-1">
                            {/* You can add a 'description' field to your Item model */}
                            {"No description available for this item."}
                        </p>
                    </div>

                </div>

                {/* Footer with Actions (styled like ItemEditDrawer) */}
                <div className="mt-auto border-t p-4 space-y-3">
                    {/* Quantity Input */}
                    <div className="flex items-center justify-between gap-4">
                        <label className="text-sm font-medium text-gray-700">Quantity:</label>
                        <div className="flex items-center gap-2 text-lg border border-gray-300 rounded-md">
                            <button onClick={decrement} disabled={isAdding} className="px-3 py-2 text-gray-700 rounded-l-md disabled:opacity-50"><FiMinus size={16} /></button>
                            <input
                                type="number"
                                value={isNaN(quantity) ? '' : quantity}
                                onChange={handleQuantityChange}
                                onBlur={() => { if (isNaN(quantity)) setQuantity(1) }}
                                className="font-bold text-gray-900 w-16 text-center text-base focus:outline-none disabled:bg-gray-100"
                                min="1"
                                disabled={isAdding}
                            />
                            <button onClick={increment} disabled={isAdding} className="px-3 py-2 text-gray-700 rounded-r-md disabled:opacity-50"><FiPlus size={16} /></button>
                        </div>
                    </div>

                    {/* Add to Cart Button */}
                    <button
                        onClick={handleAddToCartClick}
                        disabled={isAdding}
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-orange-500 text-white hover:bg-orange-600 h-10 px-4 py-2 w-full gap-2"
                    >
                        {isAdding ? <Spinner /> : <FiShoppingCart size={16} />}
                        {isAdding ? 'Adding...' : 'Add to Cart'}
                    </button>
                </div>
            </div>
        </div>
    );
};