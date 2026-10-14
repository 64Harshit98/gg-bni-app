// src/Components/SearchableItemInput.tsx

import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { Item } from '../constants/models';
import { FiSearch, FiX, FiBox } from 'react-icons/fi';

interface SearchableItemInputProps {
    items: Item[];
    onItemSelected: (item: Item) => void;
    label?: string;
    placeholder?: string;
    isLoading?: boolean;
    error?: string | null;
    onAddItem?: (searchQuery: String) => void;
    selectedCategory?: string;
    onCategoryChange?: (category: string) => void;
    categories?: string[];
    itemGroupMap?: Record<string, string>;
    onSearchChange?: (query: string) => void;
}

const THROTTLE_DELAY = 500;

const SearchableItemInput: React.FC<SearchableItemInputProps> = ({
    items,
    onItemSelected,
    placeholder = "Scan or search item...",
    isLoading = false,
    error = null,
    onAddItem,
    selectedCategory = 'All',
    onCategoryChange,
    categories = [],
    itemGroupMap = {},
    onSearchChange,
}) => {
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [throttledQuery, setThrottledQuery] = useState<string>('');
    const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
    const [activeIndex, setActiveIndex] = useState<number>(-1);

    // Refs
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null); // Ref for the scrollable list
    const lastRun = useRef<number>(Date.now());

    // --- THROTTLE LOGIC ---
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

    // --- CLICK OUTSIDE TO CLOSE ---
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
                setActiveIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- "/" FOCUSES THE SEARCH FIELD (matches the shortcut hint shown in the field) ---
    useEffect(() => {
        const handleSlash = (e: KeyboardEvent) => {
            if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
            const el = e.target as HTMLElement | null;
            const tag = el?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
            e.preventDefault();
            inputRef.current?.focus();
        };
        document.addEventListener('keydown', handleSlash);
        return () => document.removeEventListener('keydown', handleSlash);
    }, []);

    // --- FILTER & SORT LOGIC ---
    const filteredItems = useMemo(() => {
        const trimmedQuery = throttledQuery.toLowerCase().trim();
        if (!trimmedQuery) return [];

        const searchTokens = trimmedQuery.split(/\s+/);

        const categoryFilteredItems = selectedCategory === 'All'
            ? items
            : items.filter(item => (item.itemGroupId || 'Others') === selectedCategory);

        const matches = categoryFilteredItems.filter(item => {
            const lowerName = item.name.toLowerCase();
            const lowerBarcode = item.barcode ? item.barcode.toLowerCase() : '';
            const categoryName = (itemGroupMap[(item.itemGroupId || '')] || '').toLowerCase();
            const matchesName = searchTokens.every(token => lowerName.includes(token));
            const matchesBarcode = lowerBarcode.includes(trimmedQuery);
            const matchesCategory = categoryName.includes(trimmedQuery);
            return matchesName || matchesBarcode || matchesCategory;
        });

        return matches.sort((a, b) => {
            const lowerA = a.name.toLowerCase();
            const lowerB = b.name.toLowerCase();
            const aStartsWith = lowerA.startsWith(trimmedQuery);
            const bStartsWith = lowerB.startsWith(trimmedQuery);
            if (aStartsWith && !bStartsWith) return -1;
            if (!aStartsWith && bStartsWith) return 1;
            return lowerA.localeCompare(lowerB);
        });
    }, [items, throttledQuery, selectedCategory, itemGroupMap]);

    // --- AUTO SCROLL LOGIC ---
    useEffect(() => {
        if (isDropdownOpen && activeIndex >= 0 && listRef.current) {
            // Find the HTML element corresponding to the active index
            const activeItemElement = listRef.current.children[activeIndex] as HTMLElement;

            if (activeItemElement) {
                // Scroll to the element smoothly
                activeItemElement.scrollIntoView({
                    block: 'nearest', // 'nearest' ensures it doesn't jump if already visible
                    behavior: 'smooth'
                });
            }
        }
    }, [activeIndex, isDropdownOpen]);


    const handleSelect = (item: Item) => {
        onItemSelected(item);
        setSearchQuery('');
        setThrottledQuery('');
        onSearchChange?.('');
        setIsDropdownOpen(false);
        setActiveIndex(-1);
    };

    const handleClear = () => {
        setSearchQuery('');
        setThrottledQuery('');
        onSearchChange?.('');
        inputRef.current?.focus();
        setIsDropdownOpen(false);
    };

    // --- KEYBOARD NAVIGATION ---
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isDropdownOpen) {
            if (e.key === 'ArrowDown' && searchQuery) {
                setIsDropdownOpen(true);
            }
            // Add a check here in case the dropdown is closed but they scan anyway
            if (e.key === 'Enter' && searchQuery.trim()) {
                e.preventDefault();
                const exactMatch = items.find(
                    item => item.barcode && item.barcode.toLowerCase() === searchQuery.trim().toLowerCase()
                );
                if (exactMatch) {
                    handleSelect(exactMatch);
                }
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev < filteredItems.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();

            // 1. FIRST check for an exact barcode match from the scanner
            const trimmedQuery = searchQuery.trim();
            if (trimmedQuery) {
                const exactMatch = items.find(
                    item => item.barcode && item.barcode.toLowerCase() === trimmedQuery.toLowerCase()
                );

                if (exactMatch) {
                    handleSelect(exactMatch);
                    return; // Stop execution here since we found the exact item
                }
            }

            // 2. Fallback: If no exact match, select the highlighted item from the dropdown
            if (activeIndex >= 0 && activeIndex < filteredItems.length) {
                handleSelect(filteredItems[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            setIsDropdownOpen(false);
        }
    };

    return (
        <div className="relative w-full group" ref={dropdownRef}>
            {categories.length > 1 && onCategoryChange && (
                <div className="flex gap-1.5 overflow-x-auto pb-1.5 mb-1.5 scrollbar-none">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            type="button"
                            onClick={() => onCategoryChange(cat)}
                            className={`px-3 py-1 rounded-sm text-xs whitespace-nowrap border flex-shrink-0 transition ${selectedCategory === cat
                                ? 'bg-[#155dfc] text-white border-[#155dfc]'
                                : 'bg-[#ffffff] text-[#45556c] border-[#7a8aa3] hover:bg-[#f5f7ff]'
                                }`}
                        >
                            {cat === 'All' ? 'All' : itemGroupMap[cat] || cat}
                        </button>
                    ))}
                </div>
            )}
            {/* INPUT CONTAINER */}
            <div className="relative flex items-center">
                <div className="absolute left-3.5 text-[#5b6b86] pointer-events-none">
                    <FiSearch size={18} />
                </div>

                <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        onSearchChange?.(e.target.value);
                        setIsDropdownOpen(true);
                        setActiveIndex(-1);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className={`w-full h-12 md:h-[52px] pl-11 pr-11 bg-[#ffffff] border border-[#7a8aa3] rounded-sm
                               focus:border-[#155dfc] focus:ring-4 focus:ring-[#e6eeff] outline-none transition-all
                               text-[15px] text-[#0f172b] placeholder:text-[#5b6b86] font-medium
                               ${error ? '!border-[#d5000c] focus:ring-[#ffeef0]' : ''}`}
                    autoComplete="off"
                />

                {searchQuery ? (
                    <button
                        type="button"
                        onClick={handleClear}
                        aria-label="Clear search"
                        className="absolute right-3 text-[#5b6b86] hover:text-[#0f172b] hover:bg-[#f5f7ff] p-1 rounded-sm transition-colors"
                    >
                        <FiX size={16} />
                    </button>
                ) : (
                    <span
                        aria-hidden="true"
                        className="hidden md:inline-block absolute right-3 pointer-events-none text-[11px] leading-[18px] font-medium text-[#5b6b86] border border-[#dfe6fb] rounded px-1.5 bg-[#ffffff]"
                    >
                        /
                    </span>
                )}
            </div>

            {/* FLOATING DROPDOWN */}
            {isDropdownOpen && searchQuery && (
                <div
                    ref={listRef} // Attached Ref here for scrolling
                    className="absolute top-full left-0 right-0 z-50 mt-2 bg-[#ffffff] border border-[#dfe6fb] rounded-sm [box-shadow:0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] max-h-72 overflow-y-auto overflow-x-hidden scroll-smooth"
                >

                    {isLoading ? (
                        <div className="p-4 flex items-center justify-center text-[#45556c] gap-2 text-sm">
                            <div className="w-4 h-4 border-2 border-[#155dfc] border-t-transparent rounded-sm animate-spin"></div>
                            <span>Loading inventory...</span>
                        </div>
                    ) : error ? (
                        <div className="p-4 text-center text-[#d5000c] bg-[#ffeef0] text-sm font-medium">{error}</div>
                    ) : (
                        <>
                            {filteredItems.length === 0 ? (
                                <div className='flex flex-col'>
                                    <div className="p-6 text-center text-[#45556c] text-sm flex flex-col items-center">
                                        <FiBox size={24} className="mb-2 text-[#5b6b86]" />
                                        <span>No items found for "{searchQuery}"</span>
                                    </div>
                                    {onAddItem && (
                                        <button
                                            onMouseDown={(e) => {
                                                e.preventDefault(); // prevents input blur closing dropdown before click fires
                                                onAddItem(searchQuery);
                                            }}
                                            className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-[#155dfc] hover:bg-[#e6eeff] border-t border-[#dfe6fb] transition-colors w-full"
                                        >
                                            <span className="text-lg leading-none">+</span>
                                            Add new item "{searchQuery}"
                                        </button>
                                    )}
                                </div>
                            ) : (
                                filteredItems.slice(0, 50).map((item, index) => {
                                    const isSelected = index === activeIndex;
                                    const stock = item.stock || (item as any).Stock || 0;
                                    const stockColor = stock <= 0
                                        ? 'text-[#d5000c] bg-[#ffeef0]'
                                        : stock < 10
                                            ? 'text-[#bb4d00] bg-[#fff3dd]'
                                            : 'text-[#008236] bg-[#e9faef]';
                                    const categoryName = itemGroupMap[(item.itemGroupId || '')] || '';
                                    const trimmedQ = throttledQuery.toLowerCase().trim();
                                    return (
                                        <div
                                            key={item.id}
                                            onMouseEnter={() => setActiveIndex(index)}
                                            onClick={() => handleSelect(item)}
                                            className={`px-4 py-3 cursor-pointer border-b border-[#dfe6fb] last:border-0 transition-colors duration-150 flex justify-between items-center
                                                ${isSelected ? 'bg-[#e6eeff]' : 'hover:bg-[#f5f7ff]'}
                                            `}
                                        >
                                            {/* Left: Name & Barcode */}
                                            <div className="flex flex-col min-w-0 pr-4">
                                                <span className="text-sm font-semibold text-[#0f172b] truncate">
                                                    {item.name}
                                                </span>
                                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                    {item.barcode && (
                                                        <span className="text-xs text-[#5b6b86] font-mono">
                                                            {item.barcode}
                                                        </span>
                                                    )}
                                                    {categoryName && (
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${categoryName.toLowerCase().includes(trimmedQ)
                                                            ? 'bg-[#e6eeff] text-[#155dfc]'
                                                            : 'bg-[#f5f7ff] text-[#45556c]'
                                                            }`}>
                                                            {categoryName}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Right: Price & Stock Badge */}
                                            <div className="flex flex-col items-end flex-shrink-0 gap-1">
                                                <span className="text-sm font-semibold text-[#0f172b] tabular-nums">
                                                    ₹{Number(item.mrp || item.salesPrice || 0).toFixed(2)}
                                                </span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${stockColor}`}>
                                                    {stock} in stock
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </>
                    )
                    }
                </div>
            )}
        </div>
    );
};

export default SearchableItemInput;