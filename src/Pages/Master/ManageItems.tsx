import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useItemReport from '../Reports/ItemReportComponents/useItemReport';

import FilterSelect from '../Reports/ItemReportComponents/FilterSelect';
import { Spinner } from '../../constants/Spinner';
import { IconClose } from '../../constants/Icons';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';

import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';

import type { Item } from '../../constants/models';

const UNASSIGNED_GROUP_NAME = 'Uncategorized';

type SortOption =
  | 'NAME_ASC'
  | 'NAME_DESC'
  | 'MRP_ASC'
  | 'MRP_DESC'
  | 'PURCHASE_ASC'
  | 'PURCHASE_DESC';

const ManageItems: React.FC = () => {
  const navigate = useNavigate();

  const {
    items,
    itemGroups,
    itemGroupId,
    appliedItemGroupId,
    setItemGroupId,
    setAppliedItemGroupId,
    isListVisible,
    setIsListVisible,
    isLoading,
    deleteItem,
  } = useItemReport();

  /* -------------------- STATE -------------------- */
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(
    null,
  );
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [itemPendingDelete, setItemPendingDelete] = useState<Item | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(
    null,
  );

  const [sortOption, setSortOption] = useState<SortOption>('NAME_ASC');

  /* -------------------- FILTER + SORT -------------------- */
  const filteredItems = useMemo(() => {
    let result = items.filter((item) => {
      if (!appliedItemGroupId) return true;
      return (item.itemGroupId || UNASSIGNED_GROUP_NAME) === appliedItemGroupId;
    });

    result = [...result].sort((a, b) => {
      switch (sortOption) {
        case 'NAME_ASC':
          return a.name.localeCompare(b.name);
        case 'NAME_DESC':
          return b.name.localeCompare(a.name);
        case 'MRP_ASC':
          return (a.mrp || 0) - (b.mrp || 0);
        case 'MRP_DESC':
          return (b.mrp || 0) - (a.mrp || 0);
        case 'PURCHASE_ASC':
          return (a.purchasePrice || 0) - (b.purchasePrice || 0);
        case 'PURCHASE_DESC':
          return (b.purchasePrice || 0) - (a.purchasePrice || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [items, appliedItemGroupId, sortOption]);

  const applyFilters = () => {
    setAppliedItemGroupId(itemGroupId);
  };

  /* -------------------- HANDLERS -------------------- */
  const openEditDrawer = (item: Item) => {
    setSelectedItemForEdit(item);
    setIsEditDrawerOpen(true);
  };

  const closeEditDrawer = () => {
    setIsEditDrawerOpen(false);
    setTimeout(() => setSelectedItemForEdit(null), 250);
  };

  const confirmDelete = async () => {
    if (!itemPendingDelete) return;
    try {
      await deleteItem(itemPendingDelete.id);
      setModal({ message: 'Item deleted successfully', type: State.SUCCESS });
    } catch {
      setModal({ message: 'Failed to delete item', type: State.ERROR });
    } finally {
      setItemPendingDelete(null);
      setTimeout(() => setModal(null), 1500);
    }
  };

  const getStockBadgeClasses = (stock: number) => {
    if (stock === 0) return 'bg-red-100 text-red-700';
    if (stock < 10) return 'bg-blue-100 text-blue-700';
    return 'bg-green-100 text-green-700';
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden">
      {/* -------- INFO / SUCCESS MODAL -------- */}
      {modal && (
        <Modal
          message={modal.message}
          type={modal.type}
          onClose={() => setModal(null)}
        />
      )}

      {/* -------------------- HEADER -------------------- */}
      <div className="flex items-center justify-between bg-white border-b px-4 py-3 shadow-sm">
        <h1 className="text-xl font-bold text-gray-800 text-center flex-1">
          Manage Items
        </h1>
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full bg-gray-200 hover:bg-gray-300"
        >
          <IconClose width={20} height={20} />
        </button>
      </div>

      {/* -------------------- FILTERS -------------------- */}
      <div className="bg-white p-3 border-b">
        <h2 className="text-sm font-semibold text-gray-700 mb-2 text-center">
          FILTERS
        </h2>

        <div className="flex flex-wrap gap-3 items-end">
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
            onClick={applyFilters}
            className="px-5 py-2 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 transition"
          >
            Apply
          </button>
        </div>
      </div>

      {/* -------------------- LIST TOGGLE + SORT -------------------- */}
      <div className="bg-white p-3 flex flex-wrap gap-2 justify-between items-center border-b">
        <h2 className="font-semibold text-gray-700">Item List</h2>

        <div className="flex gap-2 items-center">
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="px-3 py-1.5 rounded-md bg-slate-200 text-sm font-medium focus:outline-none"
          >
            <option value="NAME_ASC">Name (A → Z)</option>
            <option value="NAME_DESC">Name (Z → A)</option>
            <option value="MRP_ASC">MRP (Low → High)</option>
            <option value="MRP_DESC">MRP (High → Low)</option>
            <option value="PURCHASE_ASC">Purchase (Low → High)</option>
            <option value="PURCHASE_DESC">Purchase (High → Low)</option>
          </select>

          <button
            onClick={() => setIsListVisible(!isListVisible)}
            className="px-4 py-1.5 bg-slate-200 rounded-md font-medium hover:bg-slate-300 transition"
          >
            {isListVisible ? 'Hide List' : 'Show List'}
          </button>
        </div>
      </div>

      {/* -------------------- ITEM LIST -------------------- */}
      {isListVisible && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {filteredItems.length === 0 && (
            <p className="text-center text-gray-500 py-8">No items found.</p>
          )}

          {filteredItems.map((item) => {
            const value = (item.stock || 0) * (item.purchasePrice || 0);
            const stock = item.stock || 0;

            return (
              <div
                key={item.id}
                className="bg-white rounded-lg shadow-sm px-3 py-3 space-y-2"
              >
                {/* ROW 1 */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => openEditDrawer(item)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <FiEdit2 size={18} />
                  </button>

                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-semibold text-gray-800 truncate">
                      {item.name}
                    </span>

                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${getStockBadgeClasses(
                        stock,
                      )}`}
                    >
                      {stock === 0 ? 'Out of stock' : `${stock} in stock`}
                    </span>
                  </div>

                  <button
                    onClick={() => setItemPendingDelete(item)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <FiTrash2 size={18} />
                  </button>
                </div>

                {/* ROW 2 */}
                <div className="flex flex-wrap gap-8 text-sm text-gray-600">
                  <div>
                    <span className="font-medium text-gray-700">MRP:</span> ₹
                    {item.mrp ?? 0}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Purchase:</span>{' '}
                    ₹{item.purchasePrice ?? 0}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Value:</span> ₹
                    {value}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* -------------------- EDIT DRAWER -------------------- */}
      <ItemEditDrawer
        item={selectedItemForEdit}
        isOpen={isEditDrawerOpen}
        onClose={closeEditDrawer}
        onSaveSuccess={() => {}}
      />

      {/* -------------------- DELETE CONFIRM MODAL -------------------- */}
      {itemPendingDelete && (
        <Modal
          type={State.WARNING}
          message={`Are you sure you want to delete "${itemPendingDelete.name}"?`}
          onClose={() => setItemPendingDelete(null)}
          onConfirm={confirmDelete}
          showConfirmButton={true}
        />
      )}
    </div>
  );
};

export default ManageItems;
