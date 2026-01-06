import React, { useState, useRef, useEffect } from 'react';
import type { Item } from '../constants/models';
import { FiSearch, FiX, FiBox } from 'react-icons/fi';

interface SearchableDebouncedInputProps {
  onSearch: (query: string) => Promise<Item[]>;
  onItemSelected: (item: Item) => void;
  placeholder?: string;
  isLoading?: boolean;
  error?: string | null;
}

const THROTTLE_DELAY = 500;

const SearchableDebouncedInput: React.FC<SearchableDebouncedInputProps> = ({
  onSearch,
  onItemSelected,
  placeholder = 'Search items...',
  isLoading = false,
  error = null,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [throttledQuery, setThrottledQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastRun = useRef<number>(Date.now());

  // Throttle logic
  useEffect(() => {
    const now = Date.now();
    const timeElapsed = now - lastRun.current;

    if (timeElapsed >= THROTTLE_DELAY) {
      setThrottledQuery(searchQuery);
      lastRun.current = now;
    } else {
      const remainingTime = THROTTLE_DELAY - timeElapsed;
      const timer = setTimeout(() => {
        setThrottledQuery(searchQuery);
        lastRun.current = Date.now();
      }, remainingTime);
      return () => clearTimeout(timer);
    }
  }, [searchQuery]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search logic
  useEffect(() => {
    const performSearch = async () => {
      if (!throttledQuery.trim()) {
        setFilteredItems([]);
        return;
      }
      setSearchLoading(true);
      try {
        const results = await onSearch(throttledQuery);
        setFilteredItems(results);
      } catch (err) {
        console.error('Search error:', err);
        setFilteredItems([]);
      } finally {
        setSearchLoading(false);
      }
    };
    performSearch();
  }, [throttledQuery, onSearch]);

  const handleSelect = (item: Item) => {
    onItemSelected(item);
    setSearchQuery('');
    setThrottledQuery('');
    setIsDropdownOpen(false);
    setActiveIndex(-1);
  };

  const handleClear = () => {
    setSearchQuery('');
    setThrottledQuery('');
    inputRef.current?.focus();
    setIsDropdownOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isDropdownOpen) {
      if (e.key === 'ArrowDown' && searchQuery) {
        setIsDropdownOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev < filteredItems.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredItems.length) {
        handleSelect(filteredItems[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  return (
    <div className="relative w-full group" ref={dropdownRef}>
      {/* INPUT CONTAINER */}
      <div className="relative flex items-center">
        <div className="absolute left-3 text-gray-400 pointer-events-none">
          <FiSearch size={18} />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsDropdownOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsDropdownOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full pl-10 pr-10 py-3 bg-white border border-gray-300 rounded-sm shadow-sm
                               focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all
                               text-gray-800 placeholder-gray-400 font-medium
                               ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : ''}`}
          autoComplete="off"
        />

        {searchQuery && (
          <button
            onClick={handleClear}
            className="absolute right-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-full transition-colors"
          >
            <FiX size={16} />
          </button>
        )}
      </div>

      {/* FLOATING DROPDOWN */}
      {isDropdownOpen && searchQuery && (
        <div
          ref={listRef}
          className="absolute top-full left-0 right-0 z-50 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 overflow-y-auto overflow-x-hidden scroll-smooth"
        >
          {isLoading || searchLoading ? (
            <div className="p-4 flex items-center justify-center text-gray-500 gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Loading...</span>
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-500 bg-red-50 text-sm font-medium">
              {error}
            </div>
          ) : (
            <>
              {filteredItems.length === 0 ? (
                <div className="p-6 text-center text-gray-500 flex flex-col items-center">
                  <FiBox size={24} className="mb-2 text-gray-300" />
                  <span>No items found for "{searchQuery}"</span>
                </div>
              ) : (
                filteredItems.map((item, index) => {
                  const isSelected = index === activeIndex;
                  const stock = item.stock || 0;
                  const stockColor =
                    stock <= 0
                      ? 'text-red-600 bg-red-50'
                      : stock < 10
                        ? 'text-orange-600 bg-orange-50'
                        : 'text-green-700 bg-green-50';

                  return (
                    <div
                      key={item.id}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => handleSelect(item)}
                      className={`px-4 py-3 cursor-pointer border-b border-gray-50 last:border-0 transition-colors duration-150 flex justify-between items-center
                                                ${isSelected ? 'bg-blue-100' : 'hover:bg-gray-50'}
                                            `}
                    >
                      {/* Left: Name & Barcode */}
                      <div className="flex flex-col min-w-0 pr-4">
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {item.name}
                        </span>
                        {item.barcode && (
                          <span className="text-xs text-gray-400 font-mono mt-0.5">
                            {item.barcode}
                          </span>
                        )}
                      </div>

                      {/* Right: Price & Stock Badge */}
                      <div className="flex flex-col items-end flex-shrink-0 gap-1">
                        <span className="text-sm font-bold text-gray-900">
                          ₹{item.mrp.toFixed(2)}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${stockColor}`}
                        >
                          {stock} in stock
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableDebouncedInput;
