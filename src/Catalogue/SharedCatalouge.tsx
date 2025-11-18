import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getItemsByCompany,
  getItemGroupsByCompany,
} from '../lib/ItemsFirebase';
import type { Item, ItemGroup } from '../constants/models';
import { FiSearch, FiPackage, FiShoppingBag } from 'react-icons/fi';
import { Spinner } from '../constants/Spinner';
import { ROUTES } from '../constants/routes.constants';

const SharedCataloguePage: React.FC = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [companyName] = useState<string>('Catalogue'); // Optional: Fetch company name
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setError('Invalid catalogue link.');
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [fetchedItems, fetchedItemGroups] = await Promise.all([
          getItemsByCompany(companyId),
          getItemGroupsByCompany(companyId),
        ]);

        setItems(fetchedItems);

        const categoryNames = fetchedItemGroups.map(
          (group: ItemGroup) => group.name,
        );
        setCategories(['All', ...categoryNames]);
      } catch (err: any) {
        setError(err.message || 'Failed to load catalogue.');
        console.error('Fetch Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [companyId]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory =
        selectedCategory === 'All' || item.itemGroupId === selectedCategory;
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.barcode && item.barcode.includes(searchQuery));
      return matchesCategory && matchesSearch;
    });
  }, [items, selectedCategory, searchQuery]);

  const handleGoToOrderPage = () => {
    // navigate directly to the absolute orders route
    navigate(ROUTES.ORDERS);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner /> <span className="ml-2">Loading Catalogue...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-red-500 p-4">
        <p className="text-center mb-4">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 w-full">
      <div className="flex-shrink-0 p-4 bg-white shadow-sm flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">
          {companyName}
        </h1>
        <button
          onClick={handleGoToOrderPage}
          className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-sm hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
        >
          <FiShoppingBag size={16} /> Go to Order Page
        </button>
      </div>

      <div className="flex-shrink-0 p-2 bg-white border-b sticky top-0 z-10">
        <div className="relative mb-2">
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-3 pl-10 border rounded-lg text-sm md:text-base"
          />
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium rounded-full flex-shrink-0 transition-colors ${selectedCategory === category ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 md:p-4">
        <p className="text-xs md:text-sm text-gray-600 mb-3 px-2 md:px-0">
          Showing {filteredItems.length} items
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-lg shadow-sm overflow-hidden flex flex-col border border-gray-200 transition-shadow hover:shadow-md"
            >
              <div className="h-40 w-full">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gray-200 flex items-center justify-center text-gray-400">
                    <FiPackage className="h-12 w-12" />
                  </div>
                )}
              </div>

              <div className="p-3 md:p-4 flex-grow flex flex-col justify-between">
                <div>
                  <p className="font-semibold text-gray-800 break-words text-sm md:text-base line-clamp-2 h-10 md:h-12">
                    {item.name}
                  </p>
                  <p className="text-base md:text-lg font-bold text-gray-900 my-2">
                    ₹{item.mrp.toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={handleGoToOrderPage}
                  className="w-full bg-orange-500 text-white font-bold py-2 rounded-md hover:bg-orange-600 transition-colors mt-2 text-sm"
                >
                  Order Now
                </button>
              </div>
            </div>
          ))}
        </div>
        {filteredItems.length === 0 && !isLoading && (
          <div className="text-center text-gray-500 mt-10 p-4">
            <p>No items found matching your filters in this catalogue.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SharedCataloguePage;
