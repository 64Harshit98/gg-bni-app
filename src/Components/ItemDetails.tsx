import React, { useState } from 'react';
import type { Item } from '../constants/models';
import { FiX, FiPackage, FiPlus, FiMinus } from 'react-icons/fi';

interface ItemDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: Item | null;
  onAddToCart: (item: Item, quantity: number) => void;
}

export const ItemDetailDrawer: React.FC<ItemDetailDrawerProps> = ({
  isOpen,
  onClose,
  item,
  onAddToCart,
}) => {
  const [quantity, setQuantity] = useState(1);

  if (!item) return null;

  const handleAddToCart = () => {
    onAddToCart(item, quantity);
    onClose();
    setQuantity(1);
  };

  const incrementQuantity = () => setQuantity(prev => prev + 1);
  const decrementQuantity = () => setQuantity(prev => Math.max(1, prev - 1));

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      ></div>

      {/* Drawer */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-lg shadow-lg transform transition-transform ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '80vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Item Details</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <FiX size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Image */}
          <div className="w-full h-48 bg-gray-200 rounded-lg flex items-center justify-center mb-4">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <FiPackage size={48} className="text-gray-400" />
            )}
          </div>

          {/* Item Info */}
          <h3 className="text-xl font-bold mb-2">{item.name}</h3>
          <p className="text-2xl font-bold text-green-600 mb-4">₹{item.mrp.toFixed(2)}</p>

          {/* Description or other details */}
          <div className="mb-4">
            <p className="text-sm text-gray-600">
              Purchase Price: ₹{item.purchasePrice?.toFixed(2) || 'N/A'}
            </p>
            <p className="text-sm text-gray-600">
              Stock: {item.stock || 0}
            </p>
            {item.barcode && (
              <p className="text-sm text-gray-600">Barcode: {item.barcode}</p>
            )}
          </div>

          {/* Quantity Selector */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-lg font-medium">Quantity:</span>
            <div className="flex items-center border border-gray-300 rounded-lg">
              <button
                onClick={decrementQuantity}
                className="px-3 py-2 text-gray-600 hover:text-gray-800"
              >
                <FiMinus size={16} />
              </button>
              <span className="px-4 py-2 text-lg font-semibold">{quantity}</span>
              <button
                onClick={incrementQuantity}
                className="px-3 py-2 text-gray-600 hover:text-gray-800"
              >
                <FiPlus size={16} />
              </button>
            </div>
          </div>

          {/* Add to Cart Button */}
          <button
            onClick={handleAddToCart}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Add to Cart - ₹{(item.mrp * quantity).toFixed(2)}
          </button>
        </div>
      </div>
    </div>
  );
};
