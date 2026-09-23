import React, { useState, useRef, useEffect } from 'react';
import { FiX } from 'react-icons/fi';

interface VariantPickerProps {
  allItems: any[];
  selectedIds: string[];
  currentItemBarcode?: string;
  onChange: (ids: string[]) => void;
  activeTheme: any;
}

export const VariantPicker: React.FC<VariantPickerProps> = ({
  allItems,
  selectedIds,
  currentItemBarcode,
  onChange,
  activeTheme,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedItems = allItems.filter(i => selectedIds.includes(i.id));

  const suggestions = query.trim().length > 0
    ? allItems.filter(i =>
        !selectedIds.includes(i.id) &&
        i.barcode !== currentItemBarcode &&
        (i.name?.toLowerCase().includes(query.toLowerCase()) ||
         i.barcode?.includes(query))
      ).slice(0, 8)
    : [];

  const addVariant = (item: any) => {
    onChange([...selectedIds, item.id]);
    setQuery('');
    setIsOpen(false);
  };

  const removeVariant = (id: string) => {
    onChange(selectedIds.filter(v => v !== id));
  };

  return (
    <div ref={containerRef} className="space-y-2">
      {/* Selected chips */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map(item => (
            <span
              key={item.id}
              className="flex items-center gap-1 bg-gray-100 border border-gray-200 text-gray-700 text-xs font-semibold px-2 py-1 rounded-sm"
            >
              {item.imageUrl && (
                <img src={item.imageUrl} alt="" className="w-4 h-4 rounded-sm object-cover" />
              )}
              {item.name}
              <button
                type="button"
                onClick={() => removeVariant(item.id)}
                className="text-gray-400 hover:text-red-500 ml-1"
              >
                <FiX size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search item to add as variant..."
          className={`flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ${activeTheme.focusRing} focus:outline-none focus:ring-2`}
        />

        {isOpen && suggestions.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-sm shadow-lg mt-1 max-h-52 overflow-y-auto">
            {suggestions.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => addVariant(item)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left transition-colors"
              >
                {item.imageUrl
                  ? <img src={item.imageUrl} alt="" className="w-8 h-8 object-cover rounded-sm border border-gray-100 flex-shrink-0" />
                  : <div className="w-8 h-8 bg-gray-100 rounded-sm flex-shrink-0" />
                }
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">#{item.barcode} · ₹{item.salesPrice || item.mrp}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {isOpen && query.trim().length > 0 && suggestions.length === 0 && (
          <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-sm shadow-lg mt-1 px-3 py-2 text-xs text-gray-400">
            No items found
          </div>
        )}
      </div>
    </div>
  );
};