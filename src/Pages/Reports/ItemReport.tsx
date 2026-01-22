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
import { CustomTable } from '../../Components/CustomTable';
import { IconClose } from '../../constants/Icons';
import { getItemColumns } from '../../constants/TableColoumns';

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

  const [itemGroupId, setItemGroupId] = useState<string>('');
  const [appliedItemGroupId, setAppliedItemGroupId] = useState<string>('');
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
    let newFilteredItems = items.filter(item => {
      if (!appliedItemGroupId) return true;
      const itemGroupName = item.itemGroupId || UNASSIGNED_GROUP_NAME;
      return itemGroupName === appliedItemGroupId;
    });

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
        item.itemGroupId || UNASSIGNED_GROUP_NAME,
        `₹${item.mrp?.toFixed(2) || 'N/A'}`,
        `${item.discount || 0}%`,
        `₹${item.purchasePrice?.toFixed(2) || 'N/A'}`,
      ]),
    });
    doc.save('item_report.pdf');
  };

const tableColumns = useMemo(() => getItemColumns(itemGroups), [itemGroups]);

  if (isLoading) return <Spinner />;
  if (error) return <div className="p-4 text-red-500 font-semibold text-center">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-2 mb-12">
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">Item Report</h1>
        <button onClick={() => navigate(-1)} className="rounded-full bg-gray-200 p-2 text-gray-900 hover:bg-gray-300">
          <IconClose width={20} height={20} />
        </button>
      </div>

      <div className="bg-white p-2 rounded-lg mb-2">
        <h2 className="text-center font-semibold text-gray-700 mb-2">FILTERS</h2>
        <div className="flex space-x-3 items-end">
          <FilterSelect label="Item Group" value={itemGroupId} onChange={(e) => setItemGroupId(e.target.value)}>
            <option value="">All Groups</option>
            {itemGroups.map((group) => (<option key={group.id} value={group.id}>{group.name}</option>))}
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

      {isListVisible && (
        <CustomTable<Item>
          data={filteredItems}
          columns={tableColumns}
          keyExtractor={(item) => item.id || Math.random()}
          sortConfig={sortConfig}
          onSort={handleSort}
        />
      )}
    </div>
  );
};

export default ItemReport;