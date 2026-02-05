import React, { useMemo } from 'react';
import useItemReport from '../Reports/ItemReportComponents/useItemReport';
import type { Item } from '../../constants/models';
import { useNavigate } from 'react-router-dom';

import { CustomTable } from '../../Components/CustomTable';
import { IconClose } from '../../constants/Icons';
import { getItemColumns } from '../../constants/TableColoumns';
import FilterSelect from '../Reports/ItemReportComponents/FilterSelect';
import { Spinner } from '../../constants/Spinner';

const UNASSIGNED_GROUP_NAME = 'Uncategorized';

const ManageItems: React.FC = () => {
  const navigate = useNavigate();

  const {
    items,
    itemGroups,
    itemGroupId,
    appliedItemGroupId,
    setItemGroupId,
    setAppliedItemGroupId,
    sortConfig,
    setSortConfig,
    isListVisible,
    setIsListVisible,
    isLoading,
  } = useItemReport();

  /* ---------- FILTER + SORT ---------- */
  const filteredItems = useMemo(() => {
    const list = items.filter((item) => {
      if (!appliedItemGroupId) return true;
      const groupName = item.itemGroupId || UNASSIGNED_GROUP_NAME;
      return groupName === appliedItemGroupId;
    });

    list.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const valA = a[key] ?? '';
      const valB = b[key] ?? '';

      if (typeof valA === 'string' && typeof valB === 'string')
        return valA.localeCompare(valB) * direction;
      if (typeof valA === 'number' && typeof valB === 'number')
        return (valA - valB) * direction;
      return 0;
    });

    return list;
  }, [items, appliedItemGroupId, sortConfig]);

  const handleApplyFilters = () => setAppliedItemGroupId(itemGroupId);

  const handleSort = (key: keyof Item) => {
    const direction =
      sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  const tableColumns = useMemo(() => getItemColumns(itemGroups), [itemGroups]);

  if (isLoading) return <Spinner />;

  return (
    <div className="min-h-screen bg-gray-50 p-2 mb-12">
      {/* HEADER */}
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Manage Items
        </h1>
        <button
          onClick={() => navigate(-1)}
          className="rounded-full bg-gray-200 p-2 hover:bg-gray-300"
        >
          <IconClose width={20} height={20} />
        </button>
      </div>

      {/* FILTERS */}
      <div className="bg-white p-2 rounded-lg mb-2">
        <h2 className="text-center font-semibold text-gray-700 mb-2">
          FILTERS
        </h2>

        <div className="flex space-x-3 items-end">
          <FilterSelect
            label="Item Group"
            value={itemGroupId}
            onChange={(e) => setItemGroupId(e.target.value)}
          >
            <option value="">All Groups</option>
            {itemGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
            <option value={UNASSIGNED_GROUP_NAME}>Uncategorized</option>
          </FilterSelect>

          <button
            onClick={handleApplyFilters}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition"
          >
            Apply
          </button>
        </div>
      </div>

      {/* LIST TOGGLE */}
      <div className="bg-white p-4 rounded-lg flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold text-gray-700">Item List</h2>

        <button
          onClick={() => setIsListVisible(!isListVisible)}
          className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition"
        >
          {isListVisible ? 'Hide List' : 'Show List'}
        </button>
      </div>

      {/* TABLE */}
      {isListVisible && (
        <CustomTable<Item>
          data={filteredItems}
          columns={tableColumns}
          keyExtractor={(item) => item.id || Math.random()}
          sortConfig={sortConfig}
          onSort={handleSort}
          emptyMessage="No items found."
        />
      )}
    </div>
  );
};

export default ManageItems;
