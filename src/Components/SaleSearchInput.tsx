import React, { useRef, useEffect } from 'react';
import type { Order } from '../Pages/Orders';


interface SaleSearchInputProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  isDropdownOpen: boolean;
  setIsDropdownOpen: (open: boolean) => void;
  filteredSales: Order[];
  selectedSale: Order | null;
  onSelectSale: (sale: Order) => void;
  onClear: () => void;
}

export const SaleSearchInput: React.FC<SaleSearchInputProps> = ({
  searchQuery, onSearchChange,
  isDropdownOpen, setIsDropdownOpen,
  filteredSales, selectedSale,
  onSelectSale, onClear,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setIsDropdownOpen]);

  return (
    <div className="bg-white p-2 rounded-sm shadow-md mb-4 border border-gray-200">
      <div className="relative" ref={dropdownRef}>
        <label htmlFor="search-sale" className="block text-sm font-medium mb-1 text-gray-700">
          Search Original Sale
        </label>
        <div className="flex gap-2">
          <input
            id="search-sale"
            type="text"
            value={searchQuery}
            onChange={e => {
              let value = e.target.value;
              if (/^\d*$/.test(value)) value = value.slice(0, 10);
              onSearchChange(value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            placeholder={selectedSale ? `(${selectedSale.orderId})` : 'Invoice, Name or Phone...'}
            className="flex-grow p-2 border rounded-sm focus:ring-2 focus:ring-[#F97316] outline-none"
            autoComplete="off"
            readOnly={!!selectedSale}
          />
          {selectedSale && (
            <button
              onClick={onClear}
              className="px-3 bg-gray-200 text-gray-700 font-semibold rounded-sm whitespace-nowrap hover:bg-gray-300"
            >
              Clear
            </button>
          )}
        </div>

        {isDropdownOpen && !selectedSale && (
          <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-sm shadow-lg max-h-60 overflow-y-auto">
            {filteredSales.map(sale => {
              const calculatedAmount = (sale.items || []).reduce(
                (sum: number, item: any) =>
                  sum + Number(item.finalPrice ?? item.amount ?? (item.salesPrice || item.mrp || 0) * (item.quantity || 0)),
                0
              );
              return (
                <div
                  key={sale.id}
                  className="p-3 cursor-pointer hover:bg-gray-100 border-b border-gray-50 last:border-0"
                  onClick={() => onSelectSale(sale)}
                >
                  <p className="font-semibold text-sm">
                    {sale.userName}{' '}
                    <span className="text-gray-500 font-normal">({sale.orderId || 'N/A'})</span>
                  </p>
                  <p className="text-xs text-gray-500">Amount: ₹{calculatedAmount.toFixed(2)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
