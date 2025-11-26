// src/Components/SearchableItemInput.tsx

import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { Item } from '../constants/models'; // Adjust the import path as needed

// --- Define Props for the Component ---
interface SearchableItemInputProps {
    items: Item[];
    onItemSelected: (item: Item) => void;
    label: string;
    placeholder?: string;
    isLoading?: boolean;
    error?: string | null;
}

// --- Main Searchable Item Input Component ---
const SearchableItemInput: React.FC<SearchableItemInputProps> = ({
    items,
    onItemSelected,
    placeholder = "Search...",
    isLoading = false,
    error = null
}) => {
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Effect to handle clicks outside the dropdown to close it
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- UPDATED SEARCH LOGIC ---
    // Memoized calculation for filtering items based on search query
    const filteredItems = useMemo(() => {
        const trimmedQuery = searchQuery.toLowerCase().trim();

        if (!trimmedQuery) return [];

        // 1. Split the query into individual words (tokens)
        // e.g., "red shirt" becomes ["red", "shirt"]
        const searchTokens = trimmedQuery.split(/\s+/);

        return items.filter(item => {
            const lowerName = item.name.toLowerCase();
            const lowerBarcode = item.barcode ? item.barcode.toLowerCase() : '';

            // 2. Check if EVERY word typed exists in the item name
            // This allows "shirt red" to find "Red Cotton Shirt"
            const matchesName = searchTokens.every(token => lowerName.includes(token));

            // 3. For barcodes, usually a direct match is preferred
            const matchesBarcode = lowerBarcode.includes(trimmedQuery);

            return matchesName || matchesBarcode;
        });
    }, [items, searchQuery]);

    // Handler for when a user selects an item from the dropdown
    const handleSelect = (item: Item) => {
        onItemSelected(item); // Pass the selected item to the parent
        setSearchQuery(''); // Clear the input field
        setIsDropdownOpen(false); // Close the dropdown
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                }}
                onFocus={() => setIsDropdownOpen(true)}
                placeholder={placeholder}
                className="w-full p-3 border border-gray-300 rounded-md focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                autoComplete="off"
            />
            {isDropdownOpen && searchQuery && (
                <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-52 overflow-y-auto">
                    {isLoading ? (
                        <div className="p-3 text-gray-500">Loading...</div>
                    ) : error ? (
                        <div className="p-3 text-red-600">{error}</div>
                    ) : filteredItems.length === 0 ? (
                        <div className="p-3 text-gray-500">No items found.</div>
                    ) : (
                        filteredItems.map(item => (
                            <div
                                key={item.id}
                                className="p-3 cursor-pointer border-b last:border-b-0 hover:bg-gray-100 flex justify-between items-center"
                                onClick={() => handleSelect(item)}
                            >
                                <span className="font-medium text-gray-800">{item.name}</span>
                                <span className="text-sm font-semibold text-blue-600">₹{item.mrp.toFixed(2)}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default SearchableItemInput;