import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  setSearchQuery: (value: string) => void; 
}

const SearchBar: React.FC<SearchBarProps> = ({ setSearchQuery }) => {
  const [localValue, setLocalValue] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(localValue);
    }, 500);
    return () => {
      clearTimeout(handler);
    };
  }, [localValue, setSearchQuery]);

  return (
    <div className="relative group max-w-md mx-auto w-full">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
      
      <input 
        type="text" 
        placeholder="Search products..." 
        value={localValue} 
        onChange={(e) => setLocalValue(e.target.value)} 
        className="w-full bg-white border border-gray-100 rounded-sm py-3.5 pl-11 pr-10 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-[#00A3E1]/10 transition-all" 
      />

      {/* Ek chota sa 'X' button taaki search clear kar sakein */}
      {localValue && (
        <button 
          onClick={() => setLocalValue('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};

export default SearchBar;