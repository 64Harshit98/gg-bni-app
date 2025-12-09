import React from 'react';

export interface ReturnItemData {
    id: string;
    name: string;
    mrp?: number;
    quantity: number;
    unitPrice: number;
    [key: string]: any;
}

interface ReturnListItemProps {
    item: ReturnItemData;
    isSelected: boolean;
    onToggle: (id: string) => void;
    onQuantityChange: (id: string, newQty: number) => void;
    showMrp?: boolean; // Toggle displaying the crossed-out MRP
}

export const ReturnListItem: React.FC<ReturnListItemProps> = ({
    item,
    isSelected,
    onToggle,
    onQuantityChange,
    showMrp = true
}) => {
    return (
        <div
            className={`p-3 border rounded-sm flex items-center gap-3 transition-all ${isSelected ? 'bg-red-50 shadow-sm border-red-200' : 'bg-gray-50 border-gray-200'
                }`}
        >
            <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(item.id)}
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0 cursor-pointer"
            />

            <div className="flex-grow flex flex-col gap-2">
                <div>
                    <p className="font-semibold text-gray-800 text-sm leading-tight">
                        {item.name}
                    </p>
                    {showMrp && item.mrp !== undefined && (
                        <p className="text-xs text-gray-500">
                            MRP: <span className="line-through">₹{item.mrp.toFixed(2)}</span>
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-600">Qty:</label>
                        <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => onQuantityChange(item.id, Number(e.target.value))}
                            className="w-16 p-1 border border-gray-300 rounded text-center text-sm focus:outline-none focus:border-blue-500"
                            disabled={!isSelected}
                        />
                    </div>

                    <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-600">Price:</label>
                        <p className="w-20 text-center font-semibold p-1 border border-gray-300 rounded bg-white text-sm">
                            ₹{item.unitPrice.toFixed(2)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};