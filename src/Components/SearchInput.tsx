import React from 'react';
import { IconClose, IconSearch } from '../constants/Icons';

interface SearchInputProps {
  /** Whether the search bar is currently visible. */
  showSearch: boolean;
  /** Current search query. */
  value: string;
  onChange: (v: string) => void;
  /** Toggle show/hide and clear on hide. */
  onToggle: () => void;
  placeholder?: string;
  /** Extra classes on the outer wrapper. */
  className?: string;
}

/**
 * Search icon button + slide-in text input.
 * Renders identically in Journal and OrdersPage.
 *
 * Usage:
 * ```tsx
 * <SearchInput
 *   showSearch={search.showSearch}
 *   value={search.searchQuery}
 *   onChange={search.setSearchQuery}
 *   onToggle={search.toggleSearch}
 *   placeholder="Search by Invoice, Name, or Phone..."
 * />
 * ```
 */
export const SearchInput: React.FC<SearchInputProps> = ({
  showSearch,
  value,
  onChange,
  onToggle,
  placeholder = 'Search...',
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <button
        onClick={onToggle}
        className="text-slate-500 hover:text-slate-800 transition-colors"
        aria-label={showSearch ? 'Close search' : 'Open search'}
      >
        {showSearch ? <IconClose /> : <IconSearch />}
      </button>

      {showSearch && (
        <div className="mt-1 w-full max-w-md px-4">
          <input
            type="text"
            placeholder={placeholder}
            className="w-full text-base font-light p-1 border-b-2 border-slate-300 focus:border-slate-800 outline-none transition-colors bg-transparent"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
          />
        </div>
      )}
    </div>
  );
};
