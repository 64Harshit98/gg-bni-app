import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import { getFirestoreOperations } from '../../lib/ItemsFirebase';
import type { Item, ItemGroup } from '../../constants/models';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Spinner } from '../../constants/Spinner';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';

const UNASSIGNED_GROUP_NAME = 'Uncategorized';

const FilterSelect: React.FC<{
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}> = ({ label, value, onChange, children }) => (
  <div className="flex-1 min-w-0">
    <label className="block text-xs text-center font-medium text-gray-600 mb-1">
      {label}
    </label>
    <select
      value={value}
      onChange={onChange}
      className="w-full p-2 text-sm text-center bg-gray-50 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
    >
      {children}
    </select>
  </div>
);

const ItemListTable: React.FC<{
  items: Item[];
  sortConfig: { key: keyof Item; direction: 'asc' | 'desc' };
  onSort: (key: keyof Item) => void;
}> = ({ items, sortConfig, onSort }) => {
  const ASC_ICON = '∧'; // Up Arrow/Wedge for Ascending
  const DESC_ICON = '∨'; // Down Arrow/Vel for Descending

  const SortableHeader: React.FC<{ sortKey: keyof Item; children: React.ReactNode; className?: string }> = ({ sortKey, children, className }) => {
    const isSorted = sortConfig.key === sortKey;
    const directionIcon = sortConfig.direction === 'asc' ? ASC_ICON : DESC_ICON;
    return (
      <th className={`py-2 px-3 ${className || ''}`}>
        <button onClick={() => onSort(sortKey)} className="flex items-center gap-2 uppercase">
          {children}
          <span className="w-0">
            {isSorted ? (
              <span className="text-blue-600 text-xs">{directionIcon}</span>
            ) : (
              <span className="text-gray-400 hover:text-gray-600 text-xs inline-flex flex-col leading-3">
                <span>{ASC_ICON}</span> {/* Up arrow for unsorted state */}
                <span className="-mt-1">{DESC_ICON}</span>
              </span>
            )}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="bg-white p-2 rounded-lg shadow-md mt-2">
      <h2 className="text-lg font-semibold text-gray-700 mb-4">Filtered Items List</h2>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm text-center">
          <thead className="text-xs text-slate-500 bg-slate-100 sticky top-0">
            <tr>
              <SortableHeader sortKey="name">Item Name</SortableHeader>
              <th className="py-3 px-4 uppercase">Item Group</th>
              <SortableHeader sortKey="mrp" >MRP</SortableHeader>
              <SortableHeader sortKey="purchasePrice" >Cost Price</SortableHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300">
            {items.map(item => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="py-2 px-3 font-medium">{item.name}</td>
                <td className="py-2 px-3 text-slate-600">
                  {item.itemGroupId || UNASSIGNED_GROUP_NAME}
                </td>
                <td className="py-2 px-3 text-slate-600 text-right">₹{item.mrp?.toFixed(2) || '0.00'}</td>
                <td className="py-2 px-3 text-slate-600 text-right">₹{item.purchasePrice?.toFixed(2) || '0.00'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ItemReport: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();

  const firestoreApi = useMemo(() => {
    if (currentUser?.companyId) {
      return getFirestoreOperations(currentUser.companyId);
    }
    return null;
  }, [currentUser?.companyId]);

  const [items, setItems] = useState<Item[]>([]);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [itemGroupId, setItemGroupId] = useState<string>(''); // This will now store the group NAME
  const [appliedItemGroupId, setAppliedItemGroupId] = useState<string>(''); // This will also be a NAME
  const [sortConfig, setSortConfig] = useState<{ key: keyof Item; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [isListVisible, setIsListVisible] = useState(false);

  useEffect(() => {
    if (!firestoreApi) {
      setIsLoading(authLoading);
      return;
    }
    const fetchAllData = async () => {
      setIsLoading(true);
      try {
        const [fetchedItems, fetchedGroups] = await Promise.all([
          firestoreApi.getItems(),
          firestoreApi.getItemGroups(),
        ]);
        setItems(fetchedItems);
        setItemGroups(fetchedGroups);
      } catch (err) {
        setError('Failed to load item data.');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllData();
  }, [firestoreApi, authLoading]);

  const { filteredItems, summary } = useMemo(() => {
    // FIX: This logic now correctly compares group names.
    let newFilteredItems = items.filter(item => {
      // If 'All Groups' is selected, return true for all items.
      if (!appliedItemGroupId) {
        return true;
      }

      // Get the item's group name, defaulting to 'Uncategorized'.
      // Note: item.itemGroupId is assumed to hold the group name here.
      const itemGroupName = item.itemGroupId || UNASSIGNED_GROUP_NAME;

      // Compare the item's group name with the selected name.
      return itemGroupName === appliedItemGroupId;
    });

    // --- Sorting and Summary logic remains the same ---
    newFilteredItems.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const valA = a[key] ?? '';
      const valB = b[key] ?? '';

      if (typeof valA === 'string' && typeof valB === 'string') return valA.localeCompare(valB) * direction;
      if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * direction;
      return 0;
    });

    const totalItems = newFilteredItems.length;
    const totalMrp = newFilteredItems.reduce((sum, item) => sum + (item.mrp || 0), 0);
    const totalPurchasePrice = newFilteredItems.reduce((sum, item) => sum + (item.purchasePrice || 0), 0);
    const totalDiscount = newFilteredItems.reduce((sum, item) => sum + (item.discount || 0), 0);
    const averageMrp = totalItems > 0 ? totalMrp / totalItems : 0;
    const averagePurchasePrice = totalItems > 0 ? totalPurchasePrice / totalItems : 0;
    const averageDiscount = totalItems > 0 ? totalDiscount / totalItems : 0;
    const averageSalePrice = averageMrp * (1 - (averageDiscount / 100));
    const averageProfitMargin = averageSalePrice - averagePurchasePrice;
    const averageMarginPercentage = averageSalePrice > 0 ? (averageProfitMargin / averageSalePrice) * 100 : 0;

    return {
      filteredItems: newFilteredItems,
      summary: { totalItems, averageMrp, averagePurchasePrice, averageSalePrice, averageProfitMargin, averageMarginPercentage },
    };
  }, [appliedItemGroupId, sortConfig, items]);

  const handleApplyFilters = () => setAppliedItemGroupId(itemGroupId);

  const handleSort = (key: keyof Item) => {
    const direction = (sortConfig.key === key && sortConfig.direction === 'asc') ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  const downloadAsPdf = () => {
    const doc = new jsPDF();
    doc.text('Item Report', 14, 15);
    autoTable(doc, {
      startY: 20,
      head: [['Item Name', 'Item Group', 'MRP', 'Discount', 'Purchase Price']],
      body: filteredItems.map((item) => [
        item.name,
        item.itemGroupId || UNASSIGNED_GROUP_NAME, // Display the group name
        `₹${item.mrp?.toFixed(2) || 'N/A'}`,
        `${item.discount || 0}%`,
        `₹${item.purchasePrice?.toFixed(2) || 'N/A'}`,
      ]),
    });
    doc.save('item_report.pdf');
  };

  if (isLoading) return <Spinner />;
  if (error) return <div className="p-4 text-red-500 font-semibold text-center">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-2">
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">Item Report</h1>
        <button onClick={() => navigate(-1)} className="rounded-full bg-gray-200 p-2 text-gray-900 hover:bg-gray-300">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="bg-white p-2 rounded-lg mb-2">
        <h2 className="text-center font-semibold text-gray-700 mb-2">FILTERS</h2>
        <div className="flex space-x-3 items-end">
          <FilterSelect label="Item Group" value={itemGroupId} onChange={(e) => setItemGroupId(e.target.value)}>
            <option value="">All Groups</option>
            {/* FIX: The value of the option is now the group NAME */}
            {itemGroups.map((group) => (<option key={group.id} value={group.name}>{group.name}</option>))}
            {/* FIX: The value for uncategorized items is now its NAME */}
            <option value={UNASSIGNED_GROUP_NAME}>Uncategorized</option>
          </FilterSelect>
          <button onClick={handleApplyFilters} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 transition">Apply</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
        <CustomCard variant={CardVariant.Summary} title="Total Items" value={Math.round(summary.totalItems).toString()} />
        <CustomCard variant={CardVariant.Summary} title="Average MRP" value={`₹${Math.round(summary.averageMrp).toFixed(0)}`} />
        <CustomCard variant={CardVariant.Summary} title="Avg. Cost Price" value={`₹${Math.round(summary.averagePurchasePrice).toFixed(0)}`} />
        <CustomCard variant={CardVariant.Summary} title="Avg. Sale Price" value={`₹${Math.round(summary.averageSalePrice).toFixed(0)}`} />
        <CustomCard variant={CardVariant.Summary} title="Avg. Margin" value={`₹${Math.round(summary.averageProfitMargin).toFixed(0)}`} />
        <CustomCard variant={CardVariant.Summary} title="Avg. Margin %" value={`${Math.round(summary.averageMarginPercentage).toFixed(0)} %`} />
      </div>

      <div className="bg-white p-4 rounded-lg flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-700">Report Details</h2>
        <div className="flex items-center space-x-3">
          <button onClick={() => setIsListVisible(!isListVisible)} className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition">
            {isListVisible ? 'Hide List' : 'Show List'}
          </button>
          <button onClick={downloadAsPdf} disabled={filteredItems.length === 0} className="bg-blue-600 text-white font-semibold rounded-md py-2 px-4 shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            Download PDF
          </button>
        </div>
      </div>

      {isListVisible && <ItemListTable items={filteredItems} sortConfig={sortConfig} onSort={handleSort} />}
    </div>
  );
};

export default ItemReport;