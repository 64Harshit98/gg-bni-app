import React from 'react';
import type { Item } from '../../../constants/models';

interface DuplicateItemPromptModalProps {
    duplicateOrderItemPrompt: { item: Item; existingCount: number };
    setDuplicateOrderItemPrompt: (v: { item: Item; existingCount: number } | null) => void;
    handleIncreaseExistingOrderItemQuantity: () => void;
    handleAddOrderItemAsNew: () => void;
}

// "Item Already in Order" guard shown when adding an item that's already a
// line in the order being edited — restored after being dropped during the
// Orders.tsx refactor extraction.
export const DuplicateItemPromptModal: React.FC<DuplicateItemPromptModalProps> = ({
    duplicateOrderItemPrompt,
    setDuplicateOrderItemPrompt,
    handleIncreaseExistingOrderItemQuantity,
    handleAddOrderItemAsNew,
}) => {
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2500] p-4">
            <div className="bg-white rounded-sm shadow-2xl p-6 w-full max-w-sm text-center">
                <div className="mx-auto mb-4 w-12 h-12 rounded-sm flex items-center justify-center bg-blue-100">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-1">Item Already in Order</h3>
                <p className="text-sm text-gray-600 mb-6">
                    "<span className="font-medium">{duplicateOrderItemPrompt.item.name}</span>" is already in this order
                    {duplicateOrderItemPrompt.existingCount > 1 ? ` (${duplicateOrderItemPrompt.existingCount} times)` : ''}.
                    What would you like to do?
                </p>
                <div className="flex flex-col gap-2">
                    <button
                        onClick={handleIncreaseExistingOrderItemQuantity}
                        className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-sm font-semibold hover:bg-blue-700 transition-colors"
                    >
                        Increase Quantity
                    </button>
                    <button
                        onClick={handleAddOrderItemAsNew}
                        className="w-full bg-gray-200 text-gray-800 py-2.5 px-4 rounded-sm font-semibold hover:bg-gray-300 transition-colors"
                    >
                        Add as New Item
                    </button>
                    <button
                        onClick={() => setDuplicateOrderItemPrompt(null)}
                        className="w-full text-xs font-medium text-gray-400 hover:text-gray-600 mt-1"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};
