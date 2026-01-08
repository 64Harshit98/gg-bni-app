import React, { useState, useEffect } from 'react';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import type { FirestoreError } from 'firebase/firestore';
import {
  Search,
  AlertTriangle,
  ShoppingCart,
  ArrowUpDown,
  PackageX,
  Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { IconClose } from '../../constants/Icons';

interface ItemDoc {
  id: string;
  name: string;
  amount: number;
  stock: number;
  restockQuantity: number;
  companyId: string;
  supplier?: string;
  unitCost?: number;
}

const RestockReportPage: React.FC = () => {
  const { currentUser } = useAuth();

  const navigate = useNavigate();
  const [inventoryItems, setInventoryItems] = useState<ItemDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!currentUser?.companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // 1. Filter at the SOURCE
    // TODO: add is isRestockNeeded field to optimize query this will be of type boolean
    const itemsQuery = query(
      collection(db, 'companies', currentUser.companyId, 'items'),
      where('stock', '<=', 3),
    );

    const unsubscribe = onSnapshot(
      itemsQuery,
      (snapshot) => {
        // 2. Only the items that need restocking enter this function
        const filteredItems = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            }) as ItemDoc,
        );

        // 3. Keep your custom sorting
        filteredItems.sort(
          (a, b) =>
            (a.stock || 0) -
            a.restockQuantity -
            ((b.stock || 0) - b.restockQuantity),
        );

        setInventoryItems(filteredItems);
        setLoading(false);
      },
      (err: FirestoreError) => {
        console.error('Error fetching items for restock report:', err);
        setError(`Failed to load restock report: ${err.message}`);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser?.companyId]);

  const displayedItems = inventoryItems.filter((item) => {
    return item.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const totalItemsToRestock = displayedItems.length;
  const outOfStockCount = displayedItems.filter(
    (i) => (i.stock || 0) <= 0,
  ).length;

  const estimatedCostToRestock = displayedItems.reduce((acc, item) => {
    const currentStock = item.stock || 0;
    const quantityNeeded = item.restockQuantity - currentStock;
    const cost = item.unitCost || 0;
    return acc + quantityNeeded * cost;
  }, 0);

  const getStatusBadge = (stock: number) => {
    if (stock <= 0) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
          <PackageX size={12} className="mr-1" /> Out of Stock
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
        <AlertTriangle size={12} className="mr-1" /> Low Stock
      </span>
    );
  };

  if (error) {
    return <div className="p-8 text-center text-red-600">{error}</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans text-gray-800">
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Restock Report
        </h1>
        <button onClick={() => navigate(-1)} className="p-2">
          <IconClose width={20} height={20} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">
              Items to Restock
            </p>
            <h3 className="text-2xl font-bold text-gray-900 mt-1">
              {loading ? '-' : totalItemsToRestock}
            </h3>
          </div>
          <div className="p-3 bg-blue-50 rounded-full text-blue-600">
            <ShoppingCart size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">
              Critical (Out of Stock)
            </p>
            <h3 className="text-2xl font-bold text-red-600 mt-1">
              {loading ? '-' : outOfStockCount}
            </h3>
          </div>
          <div className="p-3 bg-red-50 rounded-full text-red-600">
            <AlertTriangle size={24} />
          </div>
        </div>
      </div>
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-gray-500">Est. Restock Cost</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-1">
            {loading ? '-' : `$${estimatedCostToRestock.toLocaleString()}`}
          </h3>
        </div>
        <div className="p-3 bg-green-50 rounded-full text-green-600">
          <span className="text-xl font-bold">$</span>
        </div>
      </div>

      <div className="bg-white p-4 rounded-t-xl border-b border-gray-200 shadow-sm">
        <div className="relative w-full">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-b-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold">Product Name</th>
                <th className="p-4 font-semibold text-center">
                  <div className="flex items-center justify-center gap-1 cursor-pointer hover:text-gray-700">
                    Stock Level <ArrowUpDown size={14} />
                  </div>
                </th>
                <th className="p-4 font-semibold text-center">
                  Restock Threshold
                </th>
                <th className="p-4 font-semibold text-center">Deficit</th>
                <th className="p-4 font-semibold text-center">Status</th>
                <th className="p-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2
                        className="animate-spin text-blue-600"
                        size={32}
                      />
                      <p>Loading inventory...</p>
                    </div>
                  </td>
                </tr>
              ) : displayedItems.length > 0 ? (
                displayedItems.map((item) => {
                  const currentStock = item.stock || 0;
                  const deficit = item.restockQuantity - currentStock;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="p-4">
                        <div className="font-medium text-gray-900">
                          {item.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          ID: {item.id.slice(0, 8)}...
                        </div>
                      </td>
                      <td className="p-4 text-center font-medium">
                        <span
                          className={`${currentStock === 0 ? 'text-red-600' : 'text-gray-900'}`}
                        >
                          {currentStock}
                        </span>
                      </td>
                      <td className="p-4 text-center text-sm text-gray-500">
                        {item.restockQuantity}
                      </td>
                      <td className="p-4 text-center text-sm font-medium text-red-600">
                        -{deficit}
                      </td>
                      <td className="p-4 text-center">
                        {getStatusBadge(currentStock)}
                      </td>
                      <td className="p-4 text-right">
                        <button className="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline">
                          Order
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No items currently need restocking. Good job! 👍
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
          <div>Showing {displayedItems.length} items</div>
          <div className="flex gap-2">
            <button
              className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
              disabled
            >
              Prev
            </button>
            <button
              className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
              disabled
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RestockReportPage;
