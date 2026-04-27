import { useState } from 'react';

export interface UseSearchFilterReturn {
  searchQuery: string;
  showSearch: boolean;
  setSearchQuery: (v: string) => void;
  toggleSearch: () => void;
  clearSearch: () => void;
}

/**
 * Manages the search input visibility + query value.
 * Shared by Journal (invoice search) and OrdersPage (order search).
 *
 * Usage:
 * ```tsx
 * const { searchQuery, showSearch, toggleSearch } = useSearchFilter();
 * ```
 */
export const useSearchFilter = (): UseSearchFilterReturn => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const toggleSearch = () => {
    setShowSearch((prev) => {
      if (prev) setSearchQuery(''); // clear on hide
      return !prev;
    });
  };

  const clearSearch = () => {
    setSearchQuery('');
    setShowSearch(false);
  };

  return { searchQuery, showSearch, setSearchQuery, toggleSearch, clearSearch };
};
