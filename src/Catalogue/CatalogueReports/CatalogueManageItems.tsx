import React, { useMemo, useState } from 'react';
import useItemReport from '../../Pages/Reports/ItemReportComponents/useItemReport';

import FilterSelect from '../../Pages/Reports/ItemReportComponents/FilterSelect';
import { Spinner } from '../../constants/Spinner';
import { IconClose, IconSearch } from '../../constants/Icons';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';

import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';

import type { Item } from '../../constants/models';
import BackButton from '../../Components/BackButton';
import { ROUTES } from '../../constants/indesx';

const UNASSIGNED_GROUP_NAME = 'Uncategorized';

type SortOption =
  | 'NAME_ASC'
  | 'NAME_DESC'
  | 'MRP_ASC'
  | 'MRP_DESC'
  | 'PURCHASE_ASC'
  | 'PURCHASE_DESC'
  | 'VALUE_ASC'
  | 'VALUE_DESC';

const ManageItems: React.FC = () => {

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
    deleteAllItems,
    deleteItemsByCategory,
  } = useItemReport();

  /* -------------------- STATE -------------------- */
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(
    null,
  );
  const [isConfirmingDeleteCategory, setIsConfirmingDeleteCategory] = useState(false);
  const [isConfirmingDeleteAll, setIsConfirmingDeleteAll] = useState(false);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [itemPendingDelete, setItemPendingDelete] = useState<Item | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null,);
  const [sortOption, setSortOption] = useState<SortOption>('NAME_ASC');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  /* -------------------- FILTER + SORT -------------------- */
  const filteredItems = useMemo(() => {
    let result = items.filter((item) => {
      if (!appliedItemGroupId) return true;
      return (item.itemGroupId || UNASSIGNED_GROUP_NAME) === appliedItemGroupId;
    });

    result = [...(result || [])].sort((a, b) => {
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
        case 'VALUE_ASC':
          return (a.purchasePrice * a.stock || 0) - (b.purchasePrice * b.stock || 0);
        case 'VALUE_DESC':
          return (b.purchasePrice * b.stock || 0) - (a.purchasePrice * a.stock || 0);
        default:
          return 0;
      }
    });

    // SEARCH (ITEM NAME)
    const trimmedQuery = searchQuery.toLowerCase().trim();

    if (trimmedQuery) {
      const searchTokens = trimmedQuery.split(/\s+/);

      result = result.filter((item) => {
        const name = item.name.toLowerCase();
        const barcode = item.barcode?.toLowerCase() || '';

        const matchesName = searchTokens.every(token =>
          name.includes(token)
        );

        const matchesBarcode = barcode.includes(trimmedQuery);

        return matchesName || matchesBarcode;
      });
    }

    return result;
  }, [items, appliedItemGroupId, sortOption, searchQuery]);

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
    if (!itemPendingDelete || !itemPendingDelete.id) return;
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
    <div className="flex flex-col h-full bg-muted w-full overflow-hidden">
      {/* -------- INFO / SUCCESS MODAL -------- */}
      {modal && (
        <Modal
          message={modal.message}
          type={modal.type}
          onClose={() => setModal(null)}
        />
      )}

      {/* -------------------- HEADER -------------------- */}
      <div className="flex items-center justify-between bg-card border-b px-4 py-3 shadow-sm">

        <BackButton />

        {/* TITLE */}
        <h1 className="text-xl font-bold text-foreground text-center flex-1">
          Manage Items
        </h1>

        <button onClick={() => setShowSearch(true)} className="p-2">
          <IconSearch />
        </button>

      </div>

      {showSearch && (
        <div className="flex justify-center px-3 py-2 bg-card border-b">
          <div className="flex items-center w-full max-w-md border-b-2 border-border focus-within:border-[#F97316]">

            <input
              type="text"
              placeholder="Search item..."
              className="flex-1 text-base p-2 outline-none bg-transparent text-center"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />

            <button
              onClick={() => {
                setSearchQuery('');
                setShowSearch(false);
              }}
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              <IconClose />
            </button>

          </div>
        </div>
      )}

      {/* -------------------- FILTERS -------------------- */}
      <div className="bg-card p-3 border-b flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground mb-0 text-center">
          FILTERS
        </h2>

        {/* --- Top Row: Dropdown & Apply --- */}
        <div className="flex flex-wrap gap-3 items-end">
          <FilterSelect
            label="Item Group"
            value={itemGroupId}
            onChange={(e) => setItemGroupId(e.target.value)}
          >
            <option value="">All Groups</option>
            {(itemGroups || []).map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
            <option value={UNASSIGNED_GROUP_NAME}>Uncategorized</option>
          </FilterSelect>

          <button
            onClick={applyFilters}
            className="px-5 py-2 bg-[#F97316] hover:bg-orange-700 text-white rounded-sm font-semibold transition"
          >
            Apply
          </button>
        </div>

        {/* --- Bottom Row: Delete Buttons --- */}
        <div className="flex flex-wrap gap-3 items-center">
          {appliedItemGroupId && appliedItemGroupId !== UNASSIGNED_GROUP_NAME && (
            <button
              onClick={() => setIsConfirmingDeleteCategory(true)}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-sm font-semibold hover:bg-red-200 transition text-sm"
            >
              Delete Category
            </button>
          )}

          <button
            onClick={() => setIsConfirmingDeleteAll(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-sm font-semibold hover:bg-red-700 transition text-sm ml-auto"
          >
            Delete Inventory
          </button>
        </div>
      </div>
      {/* -------------------- LIST TOGGLE + SORT -------------------- */}
      <div className="bg-card p-3 flex flex-wrap gap-2 justify-between items-center border-b">
        <h2 className="font-semibold text-foreground">Item List</h2>

        <div className="flex gap-2 items-center">
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="px-3 py-1.5 rounded-sm bg-muted text-sm font-medium focus:outline-none"
          >
            <option value="NAME_ASC">Name (A → Z)</option>
            <option value="NAME_DESC">Name (Z → A)</option>
            <option value="MRP_ASC">MRP (Low → High)</option>
            <option value="MRP_DESC">MRP (High → Low)</option>
            <option value="PURCHASE_ASC">Purchase (Low → High)</option>
            <option value="PURCHASE_DESC">Purchase (High → Low)</option>
            <option value="VALUE_ASC">Value (Low → High)</option>
            <option value="VALUE_DESC">Value (High → Low)</option>
          </select>

          <button
            onClick={() => setIsListVisible(!isListVisible)}
            className="px-4 py-1.5 bg-muted rounded-sm font-medium hover:bg-slate-300 transition"
          >
            {isListVisible ? 'Hide List' : 'Show List'}
          </button>
        </div>
      </div>

      {/* -------------------- ITEM LIST -------------------- */}
      {isListVisible && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {filteredItems.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No items found.</p>
          )}

          {filteredItems.map((item) => {
            const value = (item.stock || 0) * (item.purchasePrice || 0);
            const stock = item.stock || 0;

            return (
              <div
                key={item.id}
                className="bg-card rounded-lg shadow-sm px-3 py-3 space-y-2"
              >
                {/* ROW 1 */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => openEditDrawer(item)}
                    className="text-[#F97316] hover:text-orange-800"
                  >
                    <FiEdit2 size={18} />
                  </button>

                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-semibold text-foreground truncate">
                      {item.name}
                    </span>

                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-sm whitespace-nowrap ${getStockBadgeClasses(
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
                <div className="flex flex-wrap gap-8 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">MRP:</span> ₹
                    {item.mrp ?? 0}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Purchase:</span>{' '}
                    ₹{item.purchasePrice ?? 0}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Value:</span> ₹
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
        onSaveSuccess={() => { }}
        itemGroupRoute={`${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`}
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
      {isConfirmingDeleteCategory && (
        <Modal
          type={State.WARNING}
          message="Are you sure you want to delete ALL items in this category? This cannot be undone."
          onClose={() => setIsConfirmingDeleteCategory(false)}
          onConfirm={() => {
            deleteItemsByCategory(appliedItemGroupId);
            setIsConfirmingDeleteCategory(false);
          }}
          showConfirmButton={true}
        />
      )}

      {isConfirmingDeleteAll && (
        <Modal
          type={State.WARNING}
          message="DANGER: Are you sure you want to delete your ENTIRE inventory? This cannot be undone."
          onClose={() => setIsConfirmingDeleteAll(false)}
          onConfirm={() => {
            deleteAllItems();
            setIsConfirmingDeleteAll(false);
          }}
          showConfirmButton={true}
        />
      )}
    </div>
  );
};

export default ManageItems;
