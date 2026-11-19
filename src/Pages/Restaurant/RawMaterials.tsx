import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit2,
  FileSpreadsheet,
  Package,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react';
import BackButton from '../../Components/BackButton';
import { Modal } from '../../constants/Modal';
import { Spinner } from '../../constants/Spinner';
import { ROUTES } from '../../constants/routes.constants';
import { useAuth } from '../../context/auth-context';
import { useRestaurantData } from '../../context/RestaurantDataContext';
import { State } from '../../enums';
import {
  deleteRawMaterial,
  importRawMaterials,
  rawMaterialDeleteBlocker,
  updateRawMaterial,
} from '../../lib/restaurant/stockApi';
import {
  RAW_MATERIAL_COLUMNS,
  RAW_MATERIAL_EXAMPLE,
  isPetpoojaRawMaterialSheet,
  parsePetpoojaRawMaterialRows,
  parseRawMaterialRows,
  sheetRowsFromAoa,
} from '../../lib/restaurant/importSheet';
import { ExcelImportModal, type ImportPlan } from './components/ExcelImportModal';
import { downloadImportTemplate, readFirstSheet } from './components/excelImport';
import type { RawMaterial } from '../../lib/restaurant/types';
import {
  costPerPurchaseUnit,
  formatStock,
  round3,
} from '../../lib/restaurant/units';
import { useGodowns } from '../hooks/useStockTransfer';
import { RmFormModal, RmQuickAddModal } from './components/RmFormModal';

const PAGE_SIZE = 50;

const RawMaterialsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId || '';
  const { rawMaterials, categories, recipes, loading } = useRestaurantData();
  const { godowns } = useGodowns(companyId || undefined);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inline name edit
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditName, setInlineEditName] = useState('');

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RawMaterial | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Excel import: check the sheet against existing names, then save in batches
  const analyseImport = async (file: File): Promise<ImportPlan> => {
    const rows = sheetRowsFromAoa(await readFirstSheet(file), RAW_MATERIAL_COLUMNS);
    if (!rows) throw new Error('No "Name" column found. Use the template or a Petpooja raw-material export (first sheet).');
    if (rows.length === 0) throw new Error('The first sheet has no rows to import.');
    // Our template and Petpooja's export share one layout; files in the old template layout still work
    const { ready, issues } = isPetpoojaRawMaterialSheet(rows)
      ? parsePetpoojaRawMaterialRows(rows, rawMaterials)
      : parseRawMaterialRows(rows, rawMaterials);
    const noStock = ready.length > 0 && ready.every((r) => !r.openingStock);
    return {
      readyCount: ready.length,
      readyLabel: `${ready.length === 1 ? 'raw material' : 'raw materials'}${noStock ? ' (no opening stock in file, starts at 0)' : ''}`,
      issues,
      run: async (onProgress) => {
        const n = await importRawMaterials(companyId, ready, onProgress);
        return `${n} raw material${n === 1 ? '' : 's'} added${issues.length ? `, ${issues.length} skipped` : ''}.`;
      },
    };
  };
  const downloadTemplate = () =>
    downloadImportTemplate(
      'Sellar_Raw_Materials_Import.xlsx',
      'Raw materials',
      RAW_MATERIAL_COLUMNS,
      RAW_MATERIAL_EXAMPLE,
    );

  const [feedback, setFeedback] = useState<{
    isOpen: boolean;
    type: State;
    message: string;
  }>({ isOpen: false, type: State.INFO, message: '' });

  // Derive all category names (from saved categories + rawMaterials)
  const allCategories = useMemo(() => {
    const map = new Map<string, string>();
    map.set('general', 'General');
    categories.forEach((c) => {
      const n = c.name?.trim();
      if (n) map.set(n.toLowerCase(), n);
    });
    rawMaterials.forEach((rm) => {
      const n = rm.category?.trim();
      if (n && !map.has(n.toLowerCase())) map.set(n.toLowerCase(), n);
    });
    return [...map.values()].sort((a, b) => a.localeCompare(b));
  }, [categories, rawMaterials]);

  // Category counts for the horizontal tab strip (respecting name search if active)
  const searchQuery = (appliedSearch || searchInput).trim().toLowerCase();

  const searchMatchedMaterials = useMemo(() => {
    if (!searchQuery) return rawMaterials;
    return rawMaterials.filter(
      (rm) =>
        rm.name.toLowerCase().includes(searchQuery) ||
        (rm.category || '').toLowerCase().includes(searchQuery) ||
        (rm.subCategory || '').toLowerCase().includes(searchQuery) ||
        (rm.shortCode || '').toLowerCase().includes(searchQuery) ||
        (rm.brand || '').toLowerCase().includes(searchQuery),
    );
  }, [rawMaterials, searchQuery]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    searchMatchedMaterials.forEach((rm) => {
      const cat = (rm.category || 'General').trim();
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });
    return counts;
  }, [searchMatchedMaterials]);

  // Filtered and sorted materials
  const filteredMaterials = useMemo(() => {
    const list = searchMatchedMaterials.filter((rm) => {
      if (selectedCategory === 'ALL') return true;
      return (rm.category || 'General').trim().toLowerCase() === selectedCategory.toLowerCase();
    });
    return [...list].sort((a, b) => {
      if (!!a.favourite !== !!b.favourite) return a.favourite ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  }, [searchMatchedMaterials, selectedCategory]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory]);

  // Clean up selected IDs if items are deleted
  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set(rawMaterials.map((r) => r.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rawMaterials]);

  const totalPages = Math.max(1, Math.ceil(filteredMaterials.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredMaterials.slice(start, start + PAGE_SIZE);
  }, [filteredMaterials, currentPage]);

  const allPageSelected =
    pageItems.length > 0 && pageItems.every((rm) => selectedIds.has(rm.id));

  const toggleSelectAllPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageItems.forEach((rm) => next.delete(rm.id));
      } else {
        pageItems.forEach((rm) => next.add(rm.id));
      }
      return next;
    });
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(searchInput);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setSelectedCategory('ALL');
  };

  const startInlineEdit = (rm: RawMaterial) => {
    setInlineEditId(rm.id);
    setInlineEditName(rm.name);
  };

  const saveInlineName = async (rm: RawMaterial) => {
    const trimmed = inlineEditName.trim();
    setInlineEditId(null);
    if (!trimmed || trimmed === rm.name || !companyId) return;

    const dup = rawMaterials.find(
      (m) => m.id !== rm.id && m.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (dup) {
      setFeedback({
        isOpen: true,
        type: State.ERROR,
        message: `Another raw material named "${dup.name}" already exists.`,
      });
      return;
    }
    try {
      await updateRawMaterial(companyId, rm.id, { name: trimmed });
    } catch (e) {
      setFeedback({
        isOpen: true,
        type: State.ERROR,
        message: e instanceof Error ? e.message : 'Failed to rename raw material.',
      });
    }
  };

  const handleCategoryInlineChange = async (rm: RawMaterial, newCategory: string) => {
    if (!companyId || newCategory === rm.category) return;
    try {
      await updateRawMaterial(companyId, rm.id, { category: newCategory });
    } catch (e) {
      setFeedback({
        isOpen: true,
        type: State.ERROR,
        message: e instanceof Error ? e.message : 'Failed to update category.',
      });
    }
  };

  const handleToggleFavourite = async (rm: RawMaterial) => {
    if (!companyId) return;
    try {
      await updateRawMaterial(companyId, rm.id, { favourite: !rm.favourite });
    } catch (e) {
      console.error('Failed to update favourite', e);
    }
  };

  const handleToggleActive = async (rm: RawMaterial) => {
    if (!companyId) return;
    try {
      await updateRawMaterial(companyId, rm.id, { active: rm.active === false });
    } catch (e) {
      console.error('Failed to update active state', e);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !companyId) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      const blocker = await rawMaterialDeleteBlocker(companyId, target.id, recipes);
      if (blocker) {
        setFeedback({
          isOpen: true,
          type: State.ERROR,
          message: `Can't delete "${target.name}": ${blocker}. Mark it inactive instead.`,
        });
        return;
      }
      await deleteRawMaterial(companyId, target.id);
    } catch (e) {
      setFeedback({
        isOpen: true,
        type: State.ERROR,
        message: e instanceof Error ? e.message : 'Failed to delete raw material.',
      });
    }
  };

  const handleBulkDelete = async () => {
    if (!companyId || selectedIds.size === 0) return;
    setBulkDeleteConfirm(false);
    try {
      const ids = [...selectedIds];
      // Only delete the unused ones; the rest are reported (they should be marked inactive)
      const blockers = await Promise.all(ids.map((id) => rawMaterialDeleteBlocker(companyId, id, recipes)));
      const free = ids.filter((_, i) => !blockers[i]);
      const kept = ids.filter((_, i) => blockers[i]);
      await Promise.all(free.map((id) => deleteRawMaterial(companyId, id)));
      setSelectedIds(new Set(kept));
      if (kept.length > 0) {
        const names = kept.map((id) => rawMaterials.find((r) => r.id === id)?.name || id);
        setFeedback({
          isOpen: true,
          type: State.WARNING,
          message: `${free.length} deleted. ${kept.length} kept because they are used in recipes or have stock history: ${names.join(', ')}. Mark them inactive instead.`,
        });
      }
    } catch (e) {
      setFeedback({
        isOpen: true,
        type: State.ERROR,
        message: e instanceof Error ? e.message : 'Failed to delete selected items.',
      });
    }
  };

  const getStockBreakdown = (rm: RawMaterial) => {
    const kitchenQty = round3(Number(rm.stock) || 0);
    const godownMap = rm.godownStock || {};
    const godownLines: { name: string; qty: number }[] = [];
    let godownTotal = 0;

    Object.entries(godownMap).forEach(([gId, rawQty]) => {
      const q = round3(Number(rawQty) || 0);
      if (q !== 0) {
        godownTotal = round3(godownTotal + q);
        const found = godowns.find((g) => g.id === gId);
        godownLines.push({ name: found ? found.name : 'Godown', qty: q });
      }
    });

    const totalQty = round3(kitchenQty + godownTotal);
    const isOut = kitchenQty <= 0;
    const isLow =
      !isOut &&
      rm.restockLevel !== undefined &&
      rm.restockLevel > 0 &&
      kitchenQty <= rm.restockLevel;

    const tooltipParts = [`Kitchen: ${formatStock(rm, kitchenQty)}`];
    godownLines.forEach((g) => {
      tooltipParts.push(`${g.name}: ${formatStock(rm, g.qty)}`);
    });
    if (godownLines.length > 0) {
      tooltipParts.push(`Total: ${formatStock(rm, totalQty)}`);
    }

    return {
      kitchenQty,
      godownTotal,
      totalQty,
      godownLines,
      isOut,
      isLow,
      isAlert: isOut || isLow,
      tooltip: tooltipParts.join(' • '),
    };
  };

  return (
    <div className="min-h-screen bg-[#eef2ff] px-3 pb-24 pt-3 font-poppins text-[#0f172b] md:px-6 md:pb-10 md:pt-5">
      {feedback.isOpen && (
        <Modal
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback((p) => ({ ...p, isOpen: false }))}
          showConfirmButton={false}
        />
      )}

      {deleteTarget && (
        <Modal
          type={State.WARNING}
          message={`Delete raw material "${deleteTarget.name}"? Materials used in recipes or with stock history can't be deleted — mark them inactive instead.`}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
          showConfirmButton
        />
      )}

      {bulkDeleteConfirm && (
        <Modal
          type={State.WARNING}
          message={`Delete ${selectedIds.size} selected raw ${selectedIds.size === 1 ? 'material' : 'materials'}?`}
          onClose={() => setBulkDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
          showConfirmButton
        />
      )}

      <RmFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingMaterial(null);
        }}
        companyId={companyId}
        editingMaterial={editingMaterial}
        existingMaterials={rawMaterials}
        categories={allCategories}
      />

      <RmQuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        companyId={companyId}
        existingMaterials={rawMaterials}
        categories={allCategories}
      />

      <ExcelImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title="Import raw materials"
        hint="Use our template, or upload a Petpooja raw-material export as it is."
        onDownloadTemplate={downloadTemplate}
        analyse={analyseImport}
        issuesFileName="Sellar_Raw_Materials_Not_Imported.xlsx"
      />

      {/* HEADER */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <BackButton />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[#0f172b] md:text-xl">
                Raw Materials Management
              </h1>
              <span className="hidden rounded-sm bg-[#e6eeff] px-2 py-0.5 text-xs font-semibold text-[#155dfc] sm:inline-block">
                {rawMaterials.length} Ingredients
              </span>
            </div>
            <p className="text-xs text-[#5b6b86]">
              Manage kitchen ingredients, base units, packaging conversions & alert levels
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-3 py-2 text-xs font-semibold text-[#008236] shadow-xs transition hover:border-[#008236]"
          >
            <FileSpreadsheet size={14} />
            Import Excel
          </button>
          <button
            type="button"
            onClick={() => setIsQuickAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-[#155dfc] bg-white px-3 py-2 text-xs font-semibold text-[#155dfc] shadow-xs transition hover:bg-[#f5f7ff]"
          >
            <Sparkles size={14} />
            + Quick Add
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingMaterial(null);
              setIsFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-sm bg-[#155dfc] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1447e6]"
          >
            <Plus size={15} />
            + Create New
          </button>
          <button
            type="button"
            onClick={() => navigate(ROUTES.RECIPES)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-3 py-2 text-xs font-semibold text-[#0f172b] shadow-xs transition hover:border-[#155dfc] hover:text-[#155dfc]"
            title="Go to Recipes"
          >
            <span>Next step: Recipes</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {/* FILTER BAR */}
      <section className="mb-3 rounded-sm border border-[#dfe6fb] bg-white p-3 shadow-xs">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-col gap-2.5 sm:flex-row sm:items-center"
        >
          <div className="relative flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5b6b86]"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setAppliedSearch(e.target.value);
              }}
              placeholder="Search raw material by name..."
              className="w-full rounded-sm border border-[#dfe6fb] bg-white py-2 pl-9 pr-8 text-sm text-[#0f172b] outline-none transition placeholder:text-[#5b6b86]/70 focus:border-[#155dfc] focus:ring-2 focus:ring-blue-100"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setAppliedSearch('');
                }}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5b6b86] hover:text-[#0f172b]"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter by category"
              className="min-w-[160px] rounded-sm border border-[#dfe6fb] bg-white px-3 py-2 text-sm text-[#0f172b] outline-none transition focus:border-[#155dfc]"
            >
              <option value="ALL">All Categories</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="rounded-sm bg-[#155dfc] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1447e6]"
            >
              Search
            </button>
            <button
              type="button"
              onClick={handleClearFilters}
              className="rounded-sm border border-[#dfe6fb] bg-[#f5f7ff] px-3 py-2 text-xs font-semibold text-[#5b6b86] transition hover:bg-[#e6eeff] hover:text-[#0f172b]"
            >
              Clear
            </button>
          </div>
        </form>
      </section>

      {/* HORIZONTALLY SCROLLABLE CATEGORY TAB STRIP */}
      <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setSelectedCategory('ALL')}
          className={`inline-flex shrink-0 items-center gap-2 rounded-sm border px-3.5 py-2 text-xs font-semibold transition ${
            selectedCategory === 'ALL'
              ? 'border-[#155dfc] bg-[#155dfc] text-white shadow-xs'
              : 'border-[#dfe6fb] bg-white text-[#0f172b] hover:bg-[#f5f7ff]'
          }`}
        >
          <span>All categories</span>
          <span
            className={`rounded-sm px-1.5 py-0.5 text-[11px] font-bold ${
              selectedCategory === 'ALL'
                ? 'bg-white/20 text-white'
                : 'bg-[#e6eeff] text-[#155dfc]'
            }`}
          >
            {searchMatchedMaterials.length} Ingredients
          </span>
        </button>

        {allCategories.map((cat) => {
          const count = categoryCounts.get(cat) || 0;
          const isActive = selectedCategory.toLowerCase() === cat.toLowerCase();
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-sm border px-3 py-2 text-xs font-semibold transition ${
                isActive
                  ? 'border-[#155dfc] bg-[#155dfc] text-white shadow-xs'
                  : 'border-[#dfe6fb] bg-white text-[#5b6b86] hover:bg-[#f5f7ff] hover:text-[#0f172b]'
              }`}
            >
              <span>{cat}</span>
              <span
                className={`rounded-sm px-1.5 py-0.5 text-[11px] font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-[#5b6b86]'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* BULK SELECTION BAR */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-[#155dfc]/30 bg-[#e6eeff] px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 font-semibold text-[#0f172b]">
            <span>
              {selectedIds.size} {selectedIds.size === 1 ? 'ingredient' : 'ingredients'} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-[#155dfc] underline hover:text-[#1447e6]"
            >
              Clear selection
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBulkDeleteConfirm(true)}
              className="inline-flex items-center gap-1 rounded-sm bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              <Trash2 size={13} />
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <section className="overflow-hidden rounded-sm border border-[#dfe6fb] bg-white shadow-xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#5b6b86]">
            <Spinner className="h-7 w-7 text-[#155dfc]" />
            <p className="text-xs font-medium">Loading raw materials...</p>
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-sm bg-[#e6eeff] text-[#155dfc]">
              <Package size={24} />
            </span>
            <h2 className="text-sm font-bold text-[#0f172b]">
              {rawMaterials.length === 0
                ? 'No raw materials added yet'
                : 'No raw materials match your filters'}
            </h2>
            <p className="mt-1 max-w-md text-xs text-[#5b6b86]">
              {rawMaterials.length === 0
                ? 'Add your kitchen ingredients (e.g. Tomato, Burger Patty, Cheese Slice, Cooking Oil) to start building recipes and tracking stock.'
                : 'Try clearing the search query or switching to "All categories".'}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {rawMaterials.length === 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsImportOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-3.5 py-2 text-xs font-semibold text-[#008236] hover:border-[#008236]"
                  >
                    <FileSpreadsheet size={14} />
                    Import from Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsQuickAddOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-[#155dfc] bg-white px-3.5 py-2 text-xs font-semibold text-[#155dfc] hover:bg-[#f5f7ff]"
                  >
                    <Sparkles size={14} />
                    + Quick Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMaterial(null);
                      setIsFormOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-sm bg-[#155dfc] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1447e6]"
                  >
                    <Plus size={14} />
                    + Create New
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="rounded-sm bg-[#155dfc] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1447e6]"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* DESKTOP TABLE */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-[#dfe6fb] bg-[#f5f7ff] text-[11px] font-bold uppercase tracking-wider text-[#5b6b86]">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectAllPage}
                        aria-label="Select all on page"
                        className="h-4 w-4 cursor-pointer rounded-sm border-slate-300 text-[#155dfc] focus:ring-[#155dfc]"
                      />
                    </th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Current Stock</th>
                    <th className="px-4 py-3">Avg Cost</th>
                    <th className="px-4 py-3 text-center">Set As Favourite</th>
                    <th className="px-4 py-3 text-center">Active</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfe6fb]">
                  {pageItems.map((rm) => {
                    const isSelected = selectedIds.has(rm.id);
                    const stockInfo = getStockBreakdown(rm);
                    const avgInfo = costPerPurchaseUnit(rm);
                    const isEditingName = inlineEditId === rm.id;

                    return (
                      <tr
                        key={rm.id}
                        className={`transition ${
                          isSelected
                            ? 'bg-[#e6eeff]/50'
                            : rm.active === false
                              ? 'bg-slate-50/70 opacity-75'
                              : 'hover:bg-[#f8faff]'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(rm.id)}
                            aria-label={`Select ${rm.name}`}
                            className="h-4 w-4 cursor-pointer rounded-sm border-slate-300 text-[#155dfc] focus:ring-[#155dfc]"
                          />
                        </td>

                        {/* Name (inline editable) */}
                        <td className="px-4 py-3">
                          {isEditingName ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={inlineEditName}
                                onChange={(e) => setInlineEditName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveInlineName(rm);
                                  if (e.key === 'Escape') setInlineEditId(null);
                                }}
                                onBlur={() => saveInlineName(rm)}
                                autoFocus
                                className="w-48 rounded-sm border border-[#155dfc] bg-white px-2 py-1 text-sm font-semibold text-[#0f172b] outline-none"
                              />
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  saveInlineName(rm);
                                }}
                                className="rounded-sm bg-[#155dfc] p-1 text-white"
                                title="Save name"
                              >
                                <Check size={13} />
                              </button>
                            </div>
                          ) : (
                            <div className="group flex items-center gap-2">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => startInlineEdit(rm)}
                                    title="Click to rename inline"
                                    className="text-left font-semibold text-[#0f172b] hover:text-[#155dfc]"
                                  >
                                    {rm.name}
                                  </button>
                                  <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-[#5b6b86]">
                                    {rm.baseUnit}
                                  </span>
                                </div>
                                {rm.purchaseUnit && rm.purchaseUnit.factor > 0 && (
                                  <p className="text-[11px] text-[#5b6b86]">
                                    1 {rm.purchaseUnit.name} = {rm.purchaseUnit.factor} {rm.baseUnit}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Category (inline select) */}
                        <td className="px-4 py-3">
                          <select
                            value={rm.category || 'General'}
                            onChange={(e) => handleCategoryInlineChange(rm, e.target.value)}
                            aria-label={`Category for ${rm.name}`}
                            className="rounded-sm border border-[#dfe6fb] bg-white px-2.5 py-1 text-xs font-medium text-[#0f172b] outline-none transition hover:border-[#155dfc] focus:border-[#155dfc]"
                          >
                            {allCategories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Current stock */}
                        <td className="px-4 py-3" title={stockInfo.tooltip}>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-semibold ${
                                stockInfo.isAlert ? 'text-red-600' : 'text-[#0f172b]'
                              }`}
                            >
                              {formatStock(rm, stockInfo.kitchenQty)}
                            </span>
                            {stockInfo.isAlert && (
                              <span
                                className="inline-flex items-center gap-0.5 rounded-sm bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600"
                                title={
                                  stockInfo.isOut
                                    ? 'Out of stock in Kitchen'
                                    : `At or below restock alert (${formatStock(rm, rm.restockLevel || 0)})`
                                }
                              >
                                <AlertTriangle size={11} />
                                {stockInfo.isOut ? 'Out' : 'Low'}
                              </span>
                            )}
                          </div>
                          {stockInfo.godownLines.length > 0 && (
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#5b6b86]">
                              <Warehouse size={11} className="shrink-0 text-[#155dfc]" />
                              <span>
                                +{formatStock(rm, stockInfo.godownTotal)} in godowns (Total:{' '}
                                {formatStock(rm, stockInfo.totalQty)})
                              </span>
                            </p>
                          )}
                          {rm.restockLevel !== undefined && rm.restockLevel > 0 && (
                            <p className="text-[10px] text-[#5b6b86]">
                              Min alert: {formatStock(rm, rm.restockLevel)}
                            </p>
                          )}
                        </td>

                        {/* Avg Cost */}
                        <td className="px-4 py-3">
                          <span className="font-semibold text-[#0f172b]">
                            ₹{avgInfo.cost.toLocaleString('en-IN')} / {avgInfo.unit}
                          </span>
                          {rm.purchaseUnit && rm.purchaseUnit.factor > 0 && (
                            <p className="text-[11px] text-[#5b6b86]">
                              ₹{round3(rm.avgCost || 0)} / {rm.baseUnit}
                            </p>
                          )}
                        </td>

                        {/* Set As Favourite */}
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={!!rm.favourite}
                            onChange={() => handleToggleFavourite(rm)}
                            aria-label={`Set ${rm.name} as favourite`}
                            className="h-4 w-4 cursor-pointer rounded-sm border-slate-300 text-[#155dfc] focus:ring-[#155dfc]"
                          />
                        </td>

                        {/* Active */}
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={rm.active !== false}
                            onChange={() => handleToggleActive(rm)}
                            aria-label={`Toggle active for ${rm.name}`}
                            className="h-4 w-4 cursor-pointer rounded-sm border-slate-300 text-[#155dfc] focus:ring-[#155dfc]"
                          />
                        </td>

                        {/* Action */}
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMaterial(rm);
                                setIsFormOpen(true);
                              }}
                              title="Edit raw material"
                              className="rounded-sm p-1.5 text-[#5b6b86] transition hover:bg-[#e6eeff] hover:text-[#155dfc]"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(rm)}
                              title="Delete raw material"
                              className="rounded-sm p-1.5 text-[#5b6b86] transition hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS (< md) */}
            <div className="divide-y divide-[#dfe6fb] md:hidden">
              {pageItems.map((rm) => {
                const isSelected = selectedIds.has(rm.id);
                const stockInfo = getStockBreakdown(rm);
                const avgInfo = costPerPurchaseUnit(rm);

                return (
                  <div
                    key={rm.id}
                    className={`p-3.5 transition ${
                      isSelected
                        ? 'bg-[#e6eeff]/50'
                        : rm.active === false
                          ? 'bg-slate-50 opacity-75'
                          : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(rm.id)}
                          aria-label={`Select ${rm.name}`}
                          className="mt-1 h-4 w-4 rounded-sm border-slate-300 text-[#155dfc]"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-bold text-[#0f172b]">{rm.name}</span>
                            <span className="rounded-sm bg-[#e6eeff] px-1.5 py-0.5 text-[10px] font-bold text-[#155dfc]">
                              {rm.baseUnit}
                            </span>
                            {rm.favourite && (
                              <Star size={13} className="fill-amber-400 text-amber-500" />
                            )}
                          </div>
                          {rm.purchaseUnit && rm.purchaseUnit.factor > 0 && (
                            <p className="text-[11px] text-[#5b6b86]">
                              1 {rm.purchaseUnit.name} = {rm.purchaseUnit.factor} {rm.baseUnit}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMaterial(rm);
                            setIsFormOpen(true);
                          }}
                          className="rounded-sm p-1.5 text-[#5b6b86] hover:bg-[#e6eeff] hover:text-[#155dfc]"
                          aria-label={`Edit ${rm.name}`}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(rm)}
                          className="rounded-sm p-1.5 text-[#5b6b86] hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete ${rm.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-sm bg-[#f8faff] p-2.5 text-xs">
                      <div title={stockInfo.tooltip}>
                        <span className="block text-[10px] uppercase text-[#5b6b86]">
                          Current Stock
                        </span>
                        <span
                          className={`font-bold ${
                            stockInfo.isAlert ? 'text-red-600' : 'text-[#0f172b]'
                          }`}
                        >
                          {formatStock(rm, stockInfo.kitchenQty)}
                        </span>
                        {stockInfo.godownLines.length > 0 && (
                          <span className="block text-[10px] text-[#5b6b86]">
                            Total: {formatStock(rm, stockInfo.totalQty)}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase text-[#5b6b86]">Avg Cost</span>
                        <span className="font-bold text-[#0f172b]">
                          ₹{avgInfo.cost.toLocaleString('en-IN')} / {avgInfo.unit}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <select
                        value={rm.category || 'General'}
                        onChange={(e) => handleCategoryInlineChange(rm, e.target.value)}
                        aria-label={`Category for ${rm.name}`}
                        className="rounded-sm border border-[#dfe6fb] bg-white px-2 py-1 text-xs font-medium text-[#0f172b]"
                      >
                        {allCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-1.5 text-xs text-[#5b6b86]">
                          <input
                            type="checkbox"
                            checked={!!rm.favourite}
                            onChange={() => handleToggleFavourite(rm)}
                            className="h-3.5 w-3.5 rounded-sm border-slate-300 text-[#155dfc]"
                          />
                          Favourite
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-xs text-[#5b6b86]">
                          <input
                            type="checkbox"
                            checked={rm.active !== false}
                            onChange={() => handleToggleActive(rm)}
                            className="h-3.5 w-3.5 rounded-sm border-slate-300 text-[#155dfc]"
                          />
                          Active
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PAGINATION (50 / page) */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dfe6fb] bg-[#f8faff] px-4 py-3 text-xs text-[#5b6b86]">
              <span>
                Showing{' '}
                <strong className="text-[#0f172b]">
                  {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, filteredMaterials.length)}
                </strong>{' '}
                of <strong className="text-[#0f172b]">{filteredMaterials.length}</strong> ingredients
              </span>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-sm border border-[#dfe6fb] bg-white px-2.5 py-1 font-semibold text-[#0f172b] transition hover:bg-[#f5f7ff] disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                    Prev
                  </button>
                  <span className="px-2 font-semibold text-[#0f172b]">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-sm border border-[#dfe6fb] bg-white px-2.5 py-1 font-semibold text-[#0f172b] transition hover:bg-[#f5f7ff] disabled:opacity-40"
                  >
                    Next
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default RawMaterialsPage;
