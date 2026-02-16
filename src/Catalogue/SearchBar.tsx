import React, { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps<T> {
  items?: T[];
  onSelectItem?: (item: T) => void;
  setSearchQuery: (value: string) => void;
  placeholder?: string;
}

const SearchBar = <T extends { id?: string; name: string }>({
  items,
  onSelectItem,
  setSearchQuery,
  placeholder = "Search..."
}: SearchBarProps<T>) => {
  const [localValue, setLocalValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredItems = useMemo(() => {
    if (!items || !localValue.trim()) return [];

    return items.filter(item =>
      item.name.toLowerCase().includes(localValue.toLowerCase())
    );
  }, [localValue, items]);

  const handleChange = (value: string) => {
    setLocalValue(value);
    setSearchQuery(value);
    setShowDropdown(true);
  };

  return (
    <div className="relative max-w-md mx-auto w-full">
      <Search
        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
        size={16}
      />

      <input
        type="text"
        placeholder={placeholder}
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full bg-white border border-gray-100 rounded-sm py-3.5 pl-11 pr-10 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-[#00A3E1]/10 transition-all"
      />

      {localValue && (
        <button
          onClick={() => {
            setLocalValue('');
            setSearchQuery('');
            setShowDropdown(false);
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      )}

      {items && onSelectItem && showDropdown && filteredItems.length > 0 && (
        <div className="absolute w-full mt-1 bg-white border border-gray-200 rounded-sm shadow-lg max-h-60 overflow-y-auto z-[200]">
          {filteredItems.map(item => (
            <div
              key={item.id}
              onClick={() => {
                onSelectItem(item);
                setLocalValue(item.name);
                setShowDropdown(false);
              }}
              className="px-4 py-2 text-sm cursor-pointer hover:bg-gray-100"
            >
              {item.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
