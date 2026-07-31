import React, { useEffect, useMemo, useState } from 'react';
import useItemReport from '../Reports/ItemReportComponents/useItemReport';

import FilterSelect from '../Reports/ItemReportComponents/FilterSelect';
import { Spinner } from '../../Components/ui/spinner';
import { Button } from '../../Components/ui/button';
import { Input } from '../../Components/ui/input';
import { EmptyState } from '../../Components/ui/empty-state';
import { ConfirmDialog } from '../../Components/ui/confirm-dialog';
import { Pagination } from '../../Components/ui/pagination';
import { usePagination } from '../../hooks/usePagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../Components/ui/table';
import BackButton from '../../Components/BackButton';
import {
  Boxes,
  Search,
  X,
  Pencil,
  Trash2,
  PackageX,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

import { ItemEditDrawer } from '../../Components/ItemDrawer';

import type { Item } from '../../constants/models';

const UNASSIGNED_GROUP_NAME = 'Uncategorized';
const PAGE_SIZE = 20;

type SortOption =
  | 'NAME_ASC'
  | 'NAME_DESC'
  | 'MRP_ASC'
  | 'MRP_DESC'
  | 'PURCHASE_ASC'
  | 'PURCHASE_DESC'
  | 'VALUE_ASC'
  | 'VALUE_DESC';

const getStockBadgeClasses = (stock: number) => {
  if (stock === 0) return 'bg-destructive/12 text-destructive';
  if (stock < 10) return 'bg-warning/15 text-warning-foreground dark:text-warning';
  return 'bg-success/12 text-success';
};

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
  const [isDeletingItem, setIsDeletingItem] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [sortOption, setSortOption] = useState<SortOption>('NAME_ASC');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  /* -------------------- FILTER + SORT -------------------- */
  const filteredItems = useMemo(() => {
    // 1. Create a quick lookup list of all currently valid category IDs
    const validGroupIds = new Set(itemGroups.map((group) => group.id));

    let result = items.filter((item) => {
      // Search logic
      const matchesSearch =
        !searchQuery ||
        (item.name && item.name.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      // If no category filter is applied, show everything
      if (!appliedItemGroupId) return true;

      // If "Uncategorized" is selected, catch all unassigned AND orphaned items
      if (appliedItemGroupId === UNASSIGNED_GROUP_NAME) {
        return (
          !item.itemGroupId ||
          item.itemGroupId === UNASSIGNED_GROUP_NAME ||
          !validGroupIds.has(item.itemGroupId)
        );
      }

      // If a specific, valid category is selected
      return item.itemGroupId === appliedItemGroupId;
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
        case 'VALUE_ASC':
          return (a.purchasePrice * a.stock || 0) - (b.purchasePrice * b.stock || 0);
        case 'VALUE_DESC':
          return (b.purchasePrice * b.stock || 0) - (a.purchasePrice * a.stock || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [items, itemGroups, appliedItemGroupId, sortOption, searchQuery]);

  const { currentPage, totalPages, goToPage, pageItems } = usePagination<Item>({
    totalItems: filteredItems.length,
    pageSize: PAGE_SIZE,
  });

  useEffect(() => {
    goToPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedItemGroupId, sortOption, searchQuery]);

  const visibleItems = pageItems(filteredItems);

  const applyFilters = () => {
    setAppliedItemGroupId(itemGroupId);
  };

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 2500);
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
    setIsDeletingItem(true);
    try {
      await deleteItem(itemPendingDelete.id);
      showFeedback('success', 'Item deleted successfully');
    } catch {
      showFeedback('error', 'Failed to delete item');
    } finally {
      setIsDeletingItem(false);
      setItemPendingDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2">
        <Spinner />
        <p className="text-muted-foreground">Loading items...</p>
      </div>
    );
  }

  return (
    <div className="aurora flex h-full w-full flex-col overflow-hidden bg-muted">
      {/* -------------------- HEADER -------------------- */}
      <header className="glass mx-3 mt-3 flex flex-shrink-0 flex-col gap-3 rounded-2xl p-3 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.6_0.22_330)] p-[3px] shadow-sm shadow-primary/20">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-gradient-brand text-white">
              <Boxes className="size-4" />
            </span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
              Manage <span className="text-gradient">Items</span>
            </h1>
            <p className="text-xs text-muted-foreground">View, filter and clean up your inventory</p>
          </div>
        </div>
        <button
          onClick={() => setShowSearch((prev) => !prev)}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Toggle search"
        >
          {showSearch ? <X className="size-4" /> : <Search className="size-4" />}
        </button>
      </header>

      {showSearch && (
        <div className="mx-3 mt-3 flex justify-center">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by item name..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      )}

      <main className="w-full flex-grow overflow-y-auto p-3 sm:p-4">
        {feedback && (
          <div
            className={`mb-3 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${feedback.type === 'success'
              ? 'border-success/20 bg-success/10 text-success'
              : 'border-destructive/20 bg-destructive/10 text-destructive'
              }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <AlertTriangle className="size-4 shrink-0" />
            )}
            <p>{feedback.message}</p>
          </div>
        )}

        {/* -------------------- FILTERS -------------------- */}
        <div className="mb-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Filters</h2>

          <div className="flex flex-wrap items-end gap-3">
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

            <Button onClick={applyFilters} className="bg-gradient-brand text-white shadow-md shadow-primary/20 hover:opacity-90">
              Apply
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {appliedItemGroupId && appliedItemGroupId !== UNASSIGNED_GROUP_NAME && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsConfirmingDeleteCategory(true)}
                className="gap-1.5 border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15"
              >
                <Trash2 className="size-3.5" />
                Delete Category
              </Button>
            )}

            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsConfirmingDeleteAll(true)}
              className="ml-auto gap-1.5"
            >
              <Trash2 className="size-3.5" />
              Delete Inventory
            </Button>
          </div>
        </div>

        {/* -------------------- LIST TOGGLE + SORT -------------------- */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3 shadow-xs">
          <h2 className="text-sm font-semibold text-foreground">
            Item List <span className="text-xs font-normal text-muted-foreground">({filteredItems.length})</span>
          </h2>

          <div className="flex items-center gap-2">
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="rounded-lg border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground focus:outline-none"
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

            <Button variant="secondary" size="sm" onClick={() => setIsListVisible(!isListVisible)}>
              {isListVisible ? 'Hide List' : 'Show List'}
            </Button>
          </div>
        </div>

        {/* -------------------- ITEM LIST -------------------- */}
        {isListVisible && (
          filteredItems.length === 0 ? (
            <EmptyState icon={<PackageX />} title="No items found" description="Try adjusting your filters or search query." />
          ) : (
            <div className="flex flex-col gap-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>MRP</TableHead>
                    <TableHead>Purchase</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((item) => {
                    const stock = item.stock || 0;
                    const value = stock * (item.purchasePrice || 0);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-normal font-medium text-foreground">{item.name}</TableCell>
                        <TableCell>
                          <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${getStockBadgeClasses(stock)}`}>
                            {stock === 0 ? 'Out of stock' : `${stock} in stock`}
                          </span>
                        </TableCell>
                        <TableCell>₹{item.mrp ?? 0}</TableCell>
                        <TableCell>₹{item.purchasePrice ?? 0}</TableCell>
                        <TableCell>₹{value}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditDrawer(item)}
                              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              aria-label={`Edit ${item.name}`}
                            >
                              <Pencil className="size-4" />
                            </button>
                            <button
                              onClick={() => setItemPendingDelete(item)}
                              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Delete ${item.name}`}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={goToPage}
                  totalItems={filteredItems.length}
                  pageSize={PAGE_SIZE}
                />
              )}
            </div>
          )
        )}
      </main>

      {/* -------------------- EDIT DRAWER -------------------- */}
      <ItemEditDrawer
        item={selectedItemForEdit}
        isOpen={isEditDrawerOpen}
        onClose={closeEditDrawer}
        onSaveSuccess={() => { }}
      />

      {/* -------------------- DELETE CONFIRM DIALOGS -------------------- */}
      <ConfirmDialog
        open={itemPendingDelete !== null}
        onOpenChange={(open) => { if (!open) setItemPendingDelete(null); }}
        title={`Delete "${itemPendingDelete?.name}"?`}
        description="Are you sure you want to delete this item? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={isDeletingItem}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={isConfirmingDeleteCategory}
        onOpenChange={setIsConfirmingDeleteCategory}
        title="Delete category?"
        description="Are you sure you want to delete ALL items in this category? This cannot be undone."
        confirmLabel="Delete Category"
        variant="destructive"
        onConfirm={() => {
          deleteItemsByCategory(appliedItemGroupId);
          setIsConfirmingDeleteCategory(false);
        }}
      />

      <ConfirmDialog
        open={isConfirmingDeleteAll}
        onOpenChange={setIsConfirmingDeleteAll}
        title="Delete entire inventory?"
        description="DANGER: Are you sure you want to delete your ENTIRE inventory? This cannot be undone."
        confirmLabel="Delete Everything"
        variant="destructive"
        onConfirm={() => {
          deleteAllItems();
          setIsConfirmingDeleteAll(false);
        }}
      />
    </div>
  );
};

export default ManageItems;
