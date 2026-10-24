import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Copy,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  ScanLine,
  Trash2,
  X,
} from 'lucide-react';
import useItemReport from '../../Pages/Reports/ItemReportComponents/useItemReport';
import { getFirestoreOperations } from '../../lib/ItemsFirebase';
import { Spinner } from '../../constants/Spinner';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { useAuth } from '../../context/auth-context';
import {
  ITEM_ISSUES,
  hasItemIssue,
  totalStock,
  type ItemIssue,
} from '../../Pages/Reports/ItemReportComponents/itemIssues';
import BackButton from '../../Components/BackButton';
import { ROUTES } from '../../constants/indesx';

import type { Item } from '../../constants/models';

const UNASSIGNED_GROUP_NAME = 'Uncategorized';
const PAGE_SIZE = 100;

type ItemFilter = ItemIssue | 'lowStock';
type SortKey = 'name' | 'stock' | 'mrp' | 'purchasePrice' | 'value';

const FILTER_CHIPS: { value: ItemFilter; label: string }[] = [
  ...ITEM_ISSUES.map((i) => ({ value: i.value, label: i.value === 'noCost' ? 'No cost' : i.label })),
  { value: 'lowStock', label: 'Low stock' },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'name:desc', label: 'Name Z–A' },
  { value: 'stock:asc', label: 'Lowest stock' },
  { value: 'stock:desc', label: 'Highest stock' },
  { value: 'mrp:desc', label: 'MRP high → low' },
  { value: 'mrp:asc', label: 'MRP low → high' },
  { value: 'purchasePrice:desc', label: 'Purchase high → low' },
  { value: 'purchasePrice:asc', label: 'Purchase low → high' },
  { value: 'value:desc', label: 'Value high → low' },
  { value: 'value:asc', label: 'Value low → high' },
];

const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inrRound = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// Same rule as the Restock report: in stock, but below the reorder quantity.
const isLowStock = (item: Item, stock: number) =>
  stock > 0 && Number(item.restockQuantity) > 0 && stock < Number(item.restockQuantity);

const ManageItems: React.FC = () => {
  const { currentUser } = useAuth();

  const {
    items,
    itemGroups,
    appliedItemGroupId,
    setItemGroupId,
    setAppliedItemGroupId,
    isLoading,
    deleteItem,
    deleteAllItems,
    deleteItemsByCategory,
  } = useItemReport();

  /* -------------------- STATE -------------------- */
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [itemPendingDelete, setItemPendingDelete] = useState<Item | null>(null);
  const [isConfirmingDeleteCategory, setIsConfirmingDeleteCategory] = useState(false);
  const [isConfirmingDeleteAll, setIsConfirmingDeleteAll] = useState(false);
  const [deleteAllText, setDeleteAllText] = useState('');
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ItemFilter | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  /* -------------------- FILTER + SORT -------------------- */
  // Items store their group by id or (after a rename) by name.
  const groupOf = (item: Pick<Item, 'itemGroupId'>) =>
    itemGroups.find((g) => g.id === item.itemGroupId || g.name === item.itemGroupId);
  const groupName = (item: Item) => groupOf(item)?.name || item.itemGroupId || UNASSIGNED_GROUP_NAME;

  const rows = useMemo(
    () =>
      items.map((item) => {
        const stock = totalStock(item);
        return { item, stock, value: stock > 0 ? stock * (Number(item.purchasePrice) || 0) : 0 };
      }),
    [items],
  );

  // Search + group: drives the chip counts.
  const baseRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/) : [];
    const selectedGroup = itemGroups.find((g) => g.id === appliedItemGroupId);
    return rows.filter(({ item }) => {
      if (q) {
        const name = (item.name || '').toLowerCase();
        const barcode = String(item.barcode || '').toLowerCase();
        const matches = tokens.every((t) => name.includes(t)) || barcode.includes(q);
        if (!matches) return false;
      }
      if (!appliedItemGroupId) return true;
      // "Uncategorized" catches unassigned AND orphaned items
      if (appliedItemGroupId === UNASSIGNED_GROUP_NAME) {
        return !item.itemGroupId || item.itemGroupId === UNASSIGNED_GROUP_NAME || !groupOf(item);
      }
      return item.itemGroupId === appliedItemGroupId || (!!selectedGroup && item.itemGroupId === selectedGroup.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, searchQuery, appliedItemGroupId, itemGroups]);

  const matchesFilter = (row: (typeof rows)[number], filter: ItemFilter) =>
    filter === 'lowStock' ? isLowStock(row.item, row.stock) : hasItemIssue(row.item, filter, row.stock);

  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        FILTER_CHIPS.map(({ value }) => [value, baseRows.filter((r) => matchesFilter(r, value)).length]),
      ) as Record<ItemFilter, number>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseRows],
  );

  const filteredRows = useMemo(() => {
    const list = activeFilter ? baseRows.filter((r) => matchesFilter(r, activeFilter)) : [...baseRows];
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortConfig.key) {
        case 'name':
          return (a.item.name || '').localeCompare(b.item.name || '', undefined, { numeric: true }) * dir;
        case 'stock':
          return (a.stock - b.stock) * dir;
        case 'value':
          return (a.value - b.value) * dir;
        default:
          return ((Number(a.item[sortConfig.key]) || 0) - (Number(b.item[sortConfig.key]) || 0)) * dir;
      }
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows, activeFilter, sortConfig]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [baseRows, activeFilter, sortConfig]);

  /* -------------------- HANDLERS -------------------- */
  const handleGroupChange = (value: string) => {
    setItemGroupId(value);
    setAppliedItemGroupId(value);
  };

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : 'asc') : key === 'name' ? 'asc' : 'desc',
    }));
  };

  const openEditDrawer = (item: Item) => {
    setRowMenuId(null);
    setSelectedItemForEdit(item);
    setIsEditDrawerOpen(true);
  };

  const closeEditDrawer = () => {
    setIsEditDrawerOpen(false);
    setTimeout(() => setSelectedItemForEdit(null), 250);
  };

  // Copies the item as a new one (no barcode, no stock — both must be its own)
  // and opens it in the edit drawer so the user can adjust it straight away.
  const duplicateItem = async (item: Item) => {
    setRowMenuId(null);
    if (!currentUser?.companyId) return;
    try {
      const copy: Record<string, unknown> = {
        ...item,
        name: `${item.name} (copy)`,
        barcode: '',
        stock: 0,
        godownStock: {},
      };
      ['id', 'createdAt', 'updatedAt', 'companyId', 'isDeleted'].forEach((key) => delete copy[key]);
      const newId = await getFirestoreOperations(currentUser.companyId).createItem(
        copy as Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'companyId'>,
      );
      openEditDrawer({ ...(copy as unknown as Item), id: newId });
    } catch (err) {
      console.error('Failed to duplicate item:', err);
      setModal({ message: 'Failed to duplicate item', type: State.ERROR });
    }
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

  const closeDeleteAll = () => {
    setIsConfirmingDeleteAll(false);
    setDeleteAllText('');
  };

  if (isLoading) return <Spinner />;

  const selectedGroupLabel =
    appliedItemGroupId === UNASSIGNED_GROUP_NAME
      ? UNASSIGNED_GROUP_NAME
      : itemGroups.find((g) => g.id === appliedItemGroupId)?.name;
  const canDeleteGroup = !!appliedItemGroupId && appliedItemGroupId !== UNASSIGNED_GROUP_NAME;
  const visibleRows = filteredRows.slice(0, visibleCount);

  const renderStockBadge = (item: Item, stock: number) => {
    const low = isLowStock(item, stock);
    const cls =
      stock <= 0 ? 'bg-red-50 text-red-700' : low ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700';
    const text =
      stock === 0
        ? 'Out of stock'
        : low
          ? `${stock.toLocaleString('en-IN')} · low`
          : `${stock.toLocaleString('en-IN')} in stock`;
    return (
      <span className={`inline-block whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-semibold ${cls}`}>
        {text}
      </span>
    );
  };

  const renderSortHeader = (label: string, key: SortKey, align: 'left' | 'right' = 'left') => {
    const isActive = sortConfig.key === key;
    const Icon = !isActive ? ArrowUpDown : sortConfig.direction === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <button
          onClick={() => handleSort(key)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-orange-800 ${align === 'right' ? 'flex-row-reverse' : ''}`}
        >
          {label}
          <Icon size={11} className={isActive ? 'opacity-100' : 'opacity-40'} />
        </button>
      </th>
    );
  };

  const renderRowMenu = (item: Item, key: string) => (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setRowMenuId((id) => (id === key ? null : key));
        }}
        aria-label="More actions"
        className="rounded-sm p-1.5 text-slate-500 transition hover:bg-orange-50"
      >
        <MoreHorizontal size={16} />
      </button>
      {rowMenuId === key && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={(e) => {
              e.stopPropagation();
              setRowMenuId(null);
            }}
          />
          <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-sm border border-[#f6e1d0] bg-white p-1 shadow-lg">
            <button
              onClick={(e) => { e.stopPropagation(); openEditDrawer(item); }}
              className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-[#fff8f2]"
            >
              <Pencil size={14} /> Edit
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); duplicateItem(item); }}
              className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-[#fff8f2]"
            >
              <Copy size={14} /> Duplicate
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setRowMenuId(null); setItemPendingDelete(item); }}
              className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );

  const chips = FILTER_CHIPS.map(({ value, label }) => {
    const active = activeFilter === value;
    const count = filterCounts[value];
    const isIssue = value !== 'lowStock';
    return (
      <button
        key={value}
        onClick={() => setActiveFilter(active ? null : value)}
        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border px-2.5 py-1.5 text-xs font-medium transition ${
          active
            ? 'border-[#F97316] bg-[#F97316] text-white'
            : 'border-slate-300 bg-white text-slate-700 hover:border-orange-300'
        }`}
      >
        {isIssue && <AlertTriangle size={12} className={active ? 'text-white' : 'text-amber-500'} />}
        {label}
        {count > 0 && <span className={active ? 'text-white/80' : 'text-slate-400'}>{count}</span>}
      </button>
    );
  });

  return (
    <div className="flex min-h-full w-full flex-col bg-[#fff5ec] font-poppins">
      {/* -------- INFO / SUCCESS MODAL -------- */}
      {modal && <Modal message={modal.message} type={modal.type} onClose={() => setModal(null)} />}

      {/* -------------------- HEADER -------------------- */}
      <div className="relative flex flex-shrink-0 items-center gap-3 border-b border-[#f6e1d0] bg-white p-4 shadow-sm">
        <BackButton />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <h1 className="m-0 text-lg font-bold text-slate-900 md:text-xl">Manage items</h1>
            <span className="hidden text-xs text-slate-500 md:inline">
              {items.length.toLocaleString('en-IN')} items · edit, price and remove
            </span>
          </div>
          <p className="m-0 text-xs text-slate-500 md:hidden">{items.length.toLocaleString('en-IN')} items</p>
        </div>

        {/* Page menu: destructive actions live here, behind a confirmation */}
        <div className="relative shrink-0">
          <button
            onClick={() => setPageMenuOpen((o) => !o)}
            aria-label="More actions"
            className="rounded-sm p-2 text-slate-600 transition hover:bg-orange-50"
          >
            <MoreHorizontal size={20} />
          </button>
          {pageMenuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setPageMenuOpen(false)} />
              <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-sm border border-[#f6e1d0] bg-white p-1 shadow-lg">
                {canDeleteGroup && (
                  <button
                    onClick={() => { setPageMenuOpen(false); setIsConfirmingDeleteCategory(true); }}
                    className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} /> Delete all items in “{selectedGroupLabel}”
                  </button>
                )}
                <button
                  onClick={() => { setPageMenuOpen(false); setIsConfirmingDeleteAll(true); }}
                  className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} /> Delete all items
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 px-3 pb-20 pt-4 md:px-6 md:pb-8 md:pt-5">
        {/* -------------------- FILTERS -------------------- */}
        <div className="mb-3 flex flex-col gap-2.5 md:flex-row md:items-center">
          <div className="relative md:w-72">
            <ScanLine size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or barcode, or scan"
              className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-600 focus:ring-2 focus:ring-orange-100"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 md:contents">
            <div className="relative md:w-44">
              <LayoutGrid size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={appliedItemGroupId}
                onChange={(e) => handleGroupChange(e.target.value)}
                className="w-full appearance-none rounded-sm border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 outline-none transition hover:border-slate-400 focus:border-orange-600"
              >
                <option value="">All groups</option>
                {itemGroups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
                <option value={UNASSIGNED_GROUP_NAME}>Uncategorized</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>

            {/* Sort — right on desktop, next to the group on mobile */}
            <div className="relative md:order-last md:ml-auto md:w-44">
              <select
                value={`${sortConfig.key}:${sortConfig.direction}`}
                onChange={(e) => {
                  const [key, direction] = e.target.value.split(':') as [SortKey, 'asc' | 'desc'];
                  setSortConfig({ key, direction });
                }}
                className="w-full appearance-none rounded-sm border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none transition hover:border-slate-400 focus:border-orange-600"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] md:overflow-visible [&::-webkit-scrollbar]:hidden">
            {chips}
          </div>
        </div>

        {/* -------------------- ITEM LIST -------------------- */}
        <section className="rounded-sm border border-[#f6e1d0] bg-white shadow-sm">
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-t-sm md:block">
            <table className="w-full text-sm">
              <thead className="bg-[#fff8f2] text-[11px] text-orange-700">
                <tr>
                  {renderSortHeader('Item', 'name')}
                  {renderSortHeader('Stock', 'stock')}
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Group</th>
                  {renderSortHeader('MRP', 'mrp', 'right')}
                  {renderSortHeader('Purchase price', 'purchasePrice', 'right')}
                  {renderSortHeader('Stock value', 'value', 'right')}
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                      No items found. Clear the filters, or add an item.
                    </td>
                  </tr>
                )}
                {visibleRows.map(({ item, stock, value }) => {
                  const key = item.id || item.name;
                  return (
                    <tr
                      key={key}
                      onClick={() => openEditDrawer(item)}
                      className="cursor-pointer border-t border-[#f6e1d0] transition hover:bg-[#fff8f2]"
                    >
                      <td className="px-4 py-3">
                        <p className="m-0 font-semibold text-slate-900">{item.name}</p>
                        {item.barcode && <p className="m-0 text-xs text-slate-500">{item.barcode}</p>}
                      </td>
                      <td className="px-4 py-3">{renderStockBadge(item, stock)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block whitespace-nowrap rounded-sm bg-orange-50 px-1.5 py-0.5 text-[11px] text-orange-800">
                          {groupName(item)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {Number(item.mrp) > 0 ? (
                          <span className="text-slate-700">{inr(item.mrp)}</span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600">No MRP</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {Number(item.purchasePrice) > 0 ? (
                          <span className="text-slate-700">{inr(item.purchasePrice)}</span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600">No cost</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                        {value > 0 ? inrRound(value) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditDrawer(item); }}
                            aria-label="Edit item"
                            className="rounded-sm p-1.5 text-[#F97316] transition hover:bg-orange-50 hover:text-orange-800"
                          >
                            <Pencil size={14} />
                          </button>
                          {renderRowMenu(item, `d-${key}`)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <ul className="m-0 list-none p-0 md:hidden">
            {filteredRows.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-slate-500">
                No items found. Clear the filters, or add an item.
              </li>
            )}
            {visibleRows.map(({ item, stock, value }, idx) => {
              const key = item.id || item.name;
              const hasMrp = Number(item.mrp) > 0;
              const hasCost = Number(item.purchasePrice) > 0;
              return (
                <li
                  key={key}
                  onClick={() => openEditDrawer(item)}
                  className={`flex cursor-pointer items-start gap-2 px-4 py-3 active:bg-[#fff8f2] ${idx > 0 ? 'border-t border-[#f6e1d0]' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="m-0 min-w-0 text-sm font-semibold text-slate-900">{item.name}</p>
                      {renderStockBadge(item, stock)}
                    </div>
                    <p className="m-0 mt-0.5 truncate text-xs text-slate-500">
                      {[item.barcode, groupName(item)].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-slate-600">
                      {hasMrp ? <span>MRP {inr(item.mrp)}</span> : <span className="font-medium text-amber-600">No MRP</span>}
                      <span className="text-slate-400">·</span>
                      {hasCost ? <span>Purchase {inr(item.purchasePrice)}</span> : <span className="font-medium text-amber-600">No cost</span>}
                      <span className="text-slate-400">·</span>
                      <span>Value {value > 0 ? inrRound(value) : '—'}</span>
                    </div>
                  </div>
                  {renderRowMenu(item, `m-${key}`)}
                </li>
              );
            })}
          </ul>

          {/* Footer */}
          {filteredRows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-sm border-t border-[#f6e1d0] bg-[#fff8f2] px-4 py-2.5 text-xs text-slate-500">
              <span>
                Showing {visibleRows.length.toLocaleString('en-IN')} of {baseRows.length.toLocaleString('en-IN')}
                <span className="hidden md:inline"> · click a row to edit</span>
              </span>
              <div className="flex items-center gap-3">
                {visibleRows.length < filteredRows.length && (
                  <button
                    onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:border-orange-300"
                  >
                    Show {Math.min(PAGE_SIZE, filteredRows.length - visibleRows.length)} more
                  </button>
                )}
                <span className="hidden md:inline">Stock value = stock × purchase price</span>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* -------------------- EDIT DRAWER -------------------- */}
      <ItemEditDrawer
        item={selectedItemForEdit}
        isOpen={isEditDrawerOpen}
        onClose={closeEditDrawer}
        onSaveSuccess={() => { }}
        itemGroupRoute={`${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`}
      />

      {/* -------------------- DELETE CONFIRMATIONS -------------------- */}
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
          message={`Are you sure you want to delete ALL items in "${selectedGroupLabel}"? This cannot be undone.`}
          onClose={() => setIsConfirmingDeleteCategory(false)}
          onConfirm={() => {
            deleteItemsByCategory(appliedItemGroupId);
            setIsConfirmingDeleteCategory(false);
          }}
          showConfirmButton={true}
        />
      )}

      {/* Deleting the whole inventory needs the word DELETE typed first */}
      {isConfirmingDeleteAll && (
        <div
          className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 px-4"
          onClick={closeDeleteAll}
        >
          <div
            className="w-full max-w-sm rounded-sm bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2 text-red-600">
              <AlertTriangle size={18} />
              <h2 className="m-0 text-base font-bold">Delete all items?</h2>
            </div>
            <p className="m-0 text-sm text-slate-600">
              This permanently deletes all <strong>{items.length.toLocaleString('en-IN')} items</strong> and every
              item group. It can't be undone.
            </p>
            <label className="mt-4 block text-xs font-medium text-slate-600">
              Type <span className="font-mono font-bold text-slate-900">DELETE</span> to confirm
              <input
                type="text"
                value={deleteAllText}
                onChange={(e) => setDeleteAllText(e.target.value)}
                autoFocus
                className="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={closeDeleteAll}
                className="rounded-sm border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteAllItems();
                  closeDeleteAll();
                }}
                disabled={deleteAllText.trim() !== 'DELETE'}
                className="rounded-sm bg-red-600 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageItems;