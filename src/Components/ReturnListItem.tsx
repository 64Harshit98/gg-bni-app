import React, { useState, useEffect } from 'react';
const FloatingInput = ({
  value,
  onChange,
  onBlur,
  locked,
  className,
  ...props
}: {
  value: string;
  onChange: (val: string) => void;
  onBlur: () => void;
  locked: boolean;
  className?: string;
  [key: string]: any;
}) => {
  const [localValue, setLocalValue] = useState<string>(value || '');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const incomingValue = value === null || value === undefined ? '' : String(value);
    if (!isFocused && incomingValue !== localValue) {
      setLocalValue(incomingValue);
    }
  }, [value, isFocused, localValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      setLocalValue(val);
      onChange(val);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={localValue}
      onChange={handleChange}
      onFocus={() => {
        if (!locked) {
          setIsFocused(true);
          setLocalValue('');
        }
      }}
      onBlur={() => {
        setIsFocused(false);
        setLocalValue(value || '');
        onBlur();
      }}
      readOnly={locked}
      autoComplete="off"
      className={`focus:outline-none bg-transparent ${locked ? 'text-gray-400' : ''} ${className || ''}`}
      {...props}
    />
  );
};
export interface ReturnItemData {
    id: string;
    name: string;
    mrp?: number;
    quantity: number;
    unitPrice: number;
    unitMultiplier?: number;
    unit?: string;
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
        <div className={`p-2 border rounded-sm flex flex-col gap-1 transition-all ${isSelected ? 'bg-red-50 shadow-sm border-red-200' : 'bg-gray-50 border-gray-200'
            }`}>
            {/* Checkbox + name on same row */}
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(item.id)}
                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0 cursor-pointer"
                />
                <p className="font-semibold text-gray-800 text-sm leading-tight">{item.name}</p>
                {item.unit && (
                    <span className="text-[10px] font-medium text-blue-600">({item.unit})</span>
                )}
            </div>

            {/* Rest of content, indented to align under name */}
            <div className="flex flex-col gap-1 overflow-visible">
                {showMrp && item.mrp !== undefined && (
                    <p className="text-xs text-gray-500">
                        MRP: <span className="line-through">₹{item.mrp.toFixed(2)}</span>
                    </p>
                )}

                {/* Qty + Price + Subtotal — no flex-wrap */}
                <div className="flex items-center gap-2 overflow-visible pt-0">
                    <div className="flex items-center border border-slate-300 rounded h-9 w-24 flex-shrink-0">
                        <button
                            onClick={() => {
                                const step = item.unitMultiplier || 1;
                                const moq = step;
                                const currentQty = item.quantity || step;
                                const nextQty = currentQty - step;
                                onQuantityChange(item.id, Math.max(moq, nextQty));
                            }}
                            disabled={item.quantity <= (item.unitMultiplier || 1) || !isSelected}
                            className="px-2 text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed text-lg leading-none flex items-center justify-center h-full w-8 border-r border-slate-300"
                        >−</button>
                        <div className="flex-1 h-full flex items-center justify-center">
                            <FloatingInput
                                label="Quantity"
                                value={String(item.quantity)}
                                onChange={(val) => {
                                    const num = parseFloat(val);
                                    onQuantityChange(item.id, isNaN(num) ? 0 : num);
                                }}
                                onBlur={() => {
                                    const stepSize = item.unitMultiplier || 1;
                                    if (!item.quantity || item.quantity <= 0) {
                                        onQuantityChange(item.id, stepSize);
                                    }
                                }}
                                locked={!isSelected}
                                className="w-full text-center text-sm font-semibold"
                            />
                        </div>
                        <button
                            onClick={() => {
                                const step = item.unitMultiplier || 1;
                                onQuantityChange(item.id, (item.quantity || step) + step);
                            }}
                            disabled={!isSelected}
                            className="px-2 text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed text-lg leading-none flex items-center justify-center h-full w-8 border-l border-slate-300"
                        >+</button>
                    </div>
                    <div className="relative w-24 flex-shrink-0">
                        <label className="absolute -top-1 left-3.5 bg-white px-1 text-[10px] text-gray-500 leading-none z-10">Price</label>
                        <div className="flex items-center border border-slate-300 rounded px-2 h-9 bg-gray-50">
                            <span className="text-xs text-gray-500 mr-1">₹</span>
                            <span className="w-full text-sm text-right text-gray-400">{item.unitPrice.toFixed(2)}</span>
                        </div>
                    </div>
                    <div className="relative w-24 flex-shrink-0 ml-auto">
                        <label className="absolute -top-1 left-3.5 bg-white px-1 text-[10px] text-gray-500 leading-none z-10">Subtotal</label>
                        <div className="flex items-center border border-slate-300 rounded px-2 h-9 bg-gray-50">
                            <span className="text-xs text-gray-500 mr-1">₹</span>
                            <span className="w-full text-sm text-right text-gray-400">{(item.unitPrice * item.quantity).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};