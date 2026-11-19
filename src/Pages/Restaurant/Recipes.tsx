import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChefHat,
  ChevronDown,
  ChevronRight,
  Copy,
  FileSpreadsheet,
  IndianRupee,
  Layers,
  Package,
  Save,
  Search,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import BackButton from '../../Components/BackButton';
import { Modal } from '../../constants/Modal';
import {
  resolveAddOnGroups,
  type AddOnOption,
  type Item,
} from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
import { Spinner } from '../../constants/Spinner';
import { useAuth } from '../../context/auth-context';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import { useRestaurantData } from '../../context/RestaurantDataContext';
import { State } from '../../enums';
import { useAddOnTemplates } from '../../lib/addOnTemplates';
import { portionsLeft, recipeCost } from '../../lib/restaurant/consumption';
import { createRawMaterial, deleteRecipe, saveRecipe, saveRecipesBulk } from '../../lib/restaurant/stockApi';
import type { Recipe, RecipeLine } from '../../lib/restaurant/types';
import {
  RECIPE_COLUMNS,
  RECIPE_EXAMPLE,
  parseRecipeRows,
  sheetRowsFromAoa,
} from '../../lib/restaurant/importSheet';
import { ExcelImportModal, type ImportPlan } from './components/ExcelImportModal';
import { downloadImportTemplate, readFirstSheet } from './components/excelImport';
import { RecipeIngredientTable } from './components/RecipeIngredientTable';
import { RmQuickAddModal } from './components/RmFormModal';

type RecipeFilter = 'all' | 'set' | 'missing';

interface ResolvedAddOnOption {
  option: AddOnOption;
  groupId: string;
  groupName: string;
}

const hasAnyRecipeContent = (recipe?: Recipe): boolean => {
  if (!recipe) return false;
  if (recipe.ingredients && recipe.ingredients.some((l) => l.rawMaterialId && Number(l.qty) > 0)) {
    return true;
  }
  return Object.values(recipe.addOnRecipes || {}).some(
    (lines) => lines && lines.some((l) => l.rawMaterialId && Number(l.qty) > 0),
  );
};

const serializeDraft = (
  ingredients: RecipeLine[],
  addOnRecipes: Record<string, RecipeLine[]>,
): string => {
  const cleanLines = (list: RecipeLine[]) =>
    list
      .filter((l) => l.rawMaterialId)
      .map((l) => ({
        rawMaterialId: l.rawMaterialId,
        qty: Number(l.qty) || 0,
        unit: l.unit,
      }));

  const cleanedAddOns: Record<string, RecipeLine[]> = {};
  Object.keys(addOnRecipes)
    .sort()
    .forEach((k) => {
      const cl = cleanLines(addOnRecipes[k] || []);
      if (cl.length > 0) cleanedAddOns[k] = cl;
    });

  return JSON.stringify({
    ingredients: cleanLines(ingredients),
    addOnRecipes: cleanedAddOns,
  });
};

const RecipesPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId || '';

  const {
    rawMaterials,
    rawMaterialMap,
    categories,
    recipes,
    recipeMap,
    loading: restaurantLoading,
  } = useRestaurantData();

  const { items, itemsLoading, itemGroups } = useCatalogueData();
  const { templates: addOnLibrary } = useAddOnTemplates(companyId || undefined);

  // Left panel filters
  const [itemSearch, setItemSearch] = useState('');
  const [recipeFilter, setRecipeFilter] = useState<RecipeFilter>('all');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [mobileShowEditor, setMobileShowEditor] = useState(false);

  // Editor draft state
  const [draftIngredients, setDraftIngredients] = useState<RecipeLine[]>([]);
  const [draftAddOnRecipes, setDraftAddOnRecipes] = useState<Record<string, RecipeLine[]>>({});
  const [expandedAddOnIds, setExpandedAddOnIds] = useState<Set<string>>(new Set());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccessBanner, setSaveSuccessBanner] = useState(false);

  // Modals & confirmations
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const quickAddCallbackRef = useRef<((rmId: string, baseUnit: string) => void) | null>(null);

  const [pendingSwitchItemId, setPendingSwitchItemId] = useState<string | null>(null);
  const [pendingMobileBack, setPendingMobileBack] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySearch, setCopySearch] = useState('');

  const [feedback, setFeedback] = useState<{
    isOpen: boolean;
    type: State;
    message: string;
  }>({ isOpen: false, type: State.INFO, message: '' });

  // ---------------- Excel import ----------------
  const [isImportOpen, setIsImportOpen] = useState(false);

  const importableItems = useMemo(
    () => items.filter((it): it is Item & { id: string } => !it.isDeleted && typeof it.id === 'string' && !!it.id),
    [items],
  );
  const addOnsOfItem = useCallback(
    (item: Item) => {
      const seen = new Set<string>();
      const out: { id: string; name: string }[] = [];
      resolveAddOnGroups(item, addOnLibrary, { items }).forEach((g) =>
        g.options.forEach((o) => {
          if (!seen.has(o.id)) {
            seen.add(o.id);
            out.push({ id: o.id, name: o.name });
          }
        }),
      );
      return out;
    },
    [addOnLibrary, items],
  );

  const analyseRecipeImport = async (file: File): Promise<ImportPlan> => {
    const rows = sheetRowsFromAoa(await readFirstSheet(file), RECIPE_COLUMNS);
    if (!rows) throw new Error('No "Item Name" column found. Use the template (first sheet, header row with Item Name, Raw Material, Qty…).');
    if (rows.length === 0) throw new Error('The first sheet has no rows to import.');
    const itemById = new Map(importableItems.map((it) => [it.id, it]));
    const { recipes: toSave, issues, lineCount } = parseRecipeRows(rows, {
      items: importableItems.map((it) => ({ id: it.id, name: it.name, barcode: it.barcode })),
      addOnsOf: (id) => {
        const it = itemById.get(id);
        return it ? addOnsOfItem(it) : [];
      },
      rawMaterials,
      recipes: recipeMap,
    });
    const replacing = toSave.filter((r) => hasAnyRecipeContent(recipeMap.get(r.itemId))).length;
    return {
      readyCount: toSave.length,
      readyLabel: `${toSave.length === 1 ? 'recipe' : 'recipes'} (${lineCount} ingredient lines${replacing ? `, ${replacing} replace saved ones` : ''})`,
      issues,
      run: async (onProgress) => {
        const n = await saveRecipesBulk(companyId, toSave, onProgress);
        return `${n} recipe${n === 1 ? '' : 's'} saved${issues.length ? `, ${issues.length} rows skipped` : ''}.`;
      },
    };
  };

  const downloadRecipeTemplate = () => {
    // Reference sheets so names can be copied exactly
    const menuRows: (string | number)[][] = [['Item Name', 'Add-on', 'Recipe now']];
    [...importableItems]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .forEach((it) => {
        const rec = recipeMap.get(it.id);
        menuRows.push([it.name, '', rec?.ingredients?.length ? 'Set' : 'Missing']);
        addOnsOfItem(it).forEach((o) => menuRows.push([it.name, o.name, rec?.addOnRecipes?.[o.id]?.length ? 'Set' : 'Missing']));
      });
    const rmRows: (string | number)[][] = [['Raw Material', 'Base Unit', 'Other units', 'Category']];
    [...rawMaterials]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((r) => {
        const other = [r.baseUnit === 'GRM' ? 'KG' : r.baseUnit === 'ML' ? 'LTR' : 'DOZEN', r.purchaseUnit?.name]
          .filter(Boolean)
          .join(', ');
        rmRows.push([r.name, r.baseUnit, other, r.category]);
      });
    downloadImportTemplate('Sellar_Recipes_Import.xlsx', 'Recipes', RECIPE_COLUMNS, RECIPE_EXAMPLE, [
      { name: 'Your menu items', rows: menuRows, widths: [30, 22, 12] },
      { name: 'Your raw materials', rows: rmRows, widths: [28, 10, 16, 18] },
    ]);
  };

  // Derive all raw material categories for Quick Add modal
  const allRmCategories = useMemo(() => {
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

  // Item group ID -> name map
  const groupNameMap = useMemo(() => {
    const map = new Map<string, string>();
    itemGroups.forEach((g) => {
      if (g.id) map.set(g.id, g.name);
    });
    return map;
  }, [itemGroups]);

  const getItemGroupLabel = useCallback(
    (item: Item): string => {
      if (item.itemGroupId && groupNameMap.has(item.itemGroupId)) {
        return groupNameMap.get(item.itemGroupId)!;
      }
      if (Array.isArray(item.itemGroupIds) && item.itemGroupIds.length > 0) {
        const names = item.itemGroupIds
          .map((id) => groupNameMap.get(id))
          .filter((n): n is string => !!n);
        if (names.length > 0) return names.join(', ');
      }
      return item.category || '';
    },
    [groupNameMap],
  );

  // Active menu items
  const menuItems = useMemo(() => {
    return items
      .filter((it): it is Item & { id: string } => !it.isDeleted && typeof it.id === 'string' && !!it.id)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [items]);

  // Counts for filter chips
  const filterCounts = useMemo(() => {
    let setCount = 0;
    let missingCount = 0;
    menuItems.forEach((it) => {
      if (hasAnyRecipeContent(recipeMap.get(it.id))) setCount += 1;
      else missingCount += 1;
    });
    return {
      all: menuItems.length,
      set: setCount,
      missing: missingCount,
    };
  }, [menuItems, recipeMap]);

  // Filtered menu items
  const filteredMenuItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return menuItems.filter((it) => {
      const isSet = hasAnyRecipeContent(recipeMap.get(it.id));
      if (recipeFilter === 'set' && !isSet) return false;
      if (recipeFilter === 'missing' && isSet) return false;
      if (!q) return true;
      const groupName = getItemGroupLabel(it).toLowerCase();
      return (
        it.name.toLowerCase().includes(q) ||
        (it.barcode || '').toLowerCase().includes(q) ||
        groupName.includes(q)
      );
    });
  }, [menuItems, recipeMap, recipeFilter, itemSearch, getItemGroupLabel]);

  const selectedItem = useMemo(
    () => menuItems.find((it) => it.id === selectedItemId) || null,
    [menuItems, selectedItemId],
  );

  // Auto-select first item on desktop when loaded
  useEffect(() => {
    if (!selectedItemId && menuItems.length > 0) {
      setSelectedItemId(menuItems[0].id);
    }
  }, [menuItems, selectedItemId]);

  // Load recipe into draft when selectedItemId changes
  const savedRecipeForSelected = selectedItemId ? recipeMap.get(selectedItemId) : undefined;

  useEffect(() => {
    setValidationError(null);
    setSaveSuccessBanner(false);
    if (!selectedItemId) {
      setDraftIngredients([]);
      setDraftAddOnRecipes({});
      setExpandedAddOnIds(new Set());
      return;
    }
    if (savedRecipeForSelected) {
      setDraftIngredients(
        (savedRecipeForSelected.ingredients || []).map((l) => ({ ...l })),
      );
      const addOnsCopy: Record<string, RecipeLine[]> = {};
      Object.entries(savedRecipeForSelected.addOnRecipes || {}).forEach(([optId, lines]) => {
        addOnsCopy[optId] = (lines || []).map((l) => ({ ...l }));
      });
      setDraftAddOnRecipes(addOnsCopy);
    } else {
      setDraftIngredients([]);
      setDraftAddOnRecipes({});
    }
    setExpandedAddOnIds(new Set());
  }, [selectedItemId, savedRecipeForSelected]);

  // Check if current draft has unsaved changes compared to savedRecipeForSelected
  const isDirty = useMemo(() => {
    if (!selectedItemId) return false;
    const savedSnap = serializeDraft(
      savedRecipeForSelected?.ingredients || [],
      savedRecipeForSelected?.addOnRecipes || {},
    );
    const currentSnap = serializeDraft(draftIngredients, draftAddOnRecipes);
    return savedSnap !== currentSnap;
  }, [selectedItemId, savedRecipeForSelected, draftIngredients, draftAddOnRecipes]);

  // Resolve add-on options for the selected menu item
  const resolvedAddOnOptions: ResolvedAddOnOption[] = useMemo(() => {
    if (!selectedItem) return [];
    const groups = resolveAddOnGroups(selectedItem, addOnLibrary, { items });
    const seen = new Set<string>();
    const list: ResolvedAddOnOption[] = [];
    groups.forEach((g) => {
      g.options.forEach((opt) => {
        if (!seen.has(opt.id)) {
          seen.add(opt.id);
          list.push({
            option: opt,
            groupId: g.id,
            groupName: g.name,
          });
        }
      });
    });
    return list;
  }, [selectedItem, addOnLibrary, items]);

  // Live metrics for main recipe
  const validDraftIngredients = useMemo(
    () => draftIngredients.filter((l) => l.rawMaterialId && Number(l.qty) > 0),
    [draftIngredients],
  );

  const liveMainCost = useMemo(
    () => recipeCost(validDraftIngredients, rawMaterialMap),
    [validDraftIngredients, rawMaterialMap],
  );

  const livePortionsLeft = useMemo(
    () => portionsLeft(validDraftIngredients, rawMaterialMap),
    [validDraftIngredients, rawMaterialMap],
  );

  // Switch item handler with unsaved changes guard
  const handleSelectItem = (itemId: string) => {
    if (itemId === selectedItemId) {
      setMobileShowEditor(true);
      return;
    }
    if (isDirty) {
      setPendingSwitchItemId(itemId);
      return;
    }
    setSelectedItemId(itemId);
    setMobileShowEditor(true);
  };

  const handleMobileBack = () => {
    if (isDirty) {
      setPendingMobileBack(true);
      return;
    }
    setMobileShowEditor(false);
  };

  const toggleAddOnAccordion = (optionId: string) => {
    setExpandedAddOnIds((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  };

  const handleAddOnLinesChange = (optionId: string, lines: RecipeLine[]) => {
    setDraftAddOnRecipes((prev) => ({
      ...prev,
      [optionId]: lines,
    }));
  };

  // Validate a single table's lines; returns an error message or null
  const validateLines = (lines: RecipeLine[], label: string): string | null => {
    const seen = new Set<string>();
    for (const line of lines) {
      if (!line.rawMaterialId) continue;
      const rmName = rawMaterialMap.get(line.rawMaterialId)?.name || 'selected ingredient';
      if (!(Number(line.qty) > 0)) {
        return `In ${label}: quantity for "${rmName}" must be greater than 0.`;
      }
      if (seen.has(line.rawMaterialId)) {
        return `In ${label}: duplicate raw material "${rmName}". Combine quantities into a single row.`;
      }
      seen.add(line.rawMaterialId);
    }
    return null;
  };

  const handleOneToOneRecipe = async () => {
    if (!selectedItem || !companyId) return;
    setValidationError(null);
    try {
      const targetName = selectedItem.name.trim().toLowerCase();
      let existing = rawMaterials.find((r) => r.name.trim().toLowerCase() === targetName);
      let rmId = existing?.id;
      let rmUnit = existing?.baseUnit || 'PC';
      if (!rmId) {
        rmId = await createRawMaterial(companyId, {
          name: selectedItem.name.trim(),
          category: getItemGroupLabel(selectedItem) || 'Packaged Goods',
          baseUnit: 'PC',
          openingCost: Number(selectedItem.purchasePrice) || 0,
        });
        rmUnit = 'PC';
      }
      setDraftIngredients([{ rawMaterialId: rmId, qty: 1, unit: rmUnit }]);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Could not set 1:1 recipe.');
    }
  };

  const handleSaveRecipe = async () => {
    if (!selectedItem || !companyId) return;
    setValidationError(null);
    setSaveSuccessBanner(false);

    // 1. Validate main recipe table
    const mainErr = validateLines(draftIngredients, `recipe for "${selectedItem.name}"`);
    if (mainErr) {
      setValidationError(mainErr);
      return;
    }

    // 2. Validate every add-on option table
    for (const [optId, lines] of Object.entries(draftAddOnRecipes)) {
      const optName =
        resolvedAddOnOptions.find((x) => x.option.id === optId)?.option.name || 'Add-on';
      const err = validateLines(lines, `"Recipe For ${optName}"`);
      if (err) {
        setValidationError(err);
        setExpandedAddOnIds((prev) => new Set(prev).add(optId));
        return;
      }
    }

    const cleanedMain = draftIngredients
      .filter((l) => l.rawMaterialId && Number(l.qty) > 0)
      .map((l) => ({
        rawMaterialId: l.rawMaterialId,
        qty: Number(l.qty),
        unit: l.unit,
      }));

    const cleanedAddOns: Record<string, RecipeLine[]> = {};
    Object.entries(draftAddOnRecipes).forEach(([optId, lines]) => {
      const kept = (lines || [])
        .filter((l) => l.rawMaterialId && Number(l.qty) > 0)
        .map((l) => ({
          rawMaterialId: l.rawMaterialId,
          qty: Number(l.qty),
          unit: l.unit,
        }));
      if (kept.length > 0) {
        cleanedAddOns[optId] = kept;
      }
    });

    const isEmpty = cleanedMain.length === 0 && Object.keys(cleanedAddOns).length === 0;

    setSaving(true);
    try {
      if (isEmpty) {
        await deleteRecipe(companyId, selectedItem.id);
      } else {
        await saveRecipe(companyId, {
          id: selectedItem.id,
          itemId: selectedItem.id,
          itemName: selectedItem.name,
          ingredients: cleanedMain,
          addOnRecipes: cleanedAddOns,
        });
      }
      setDraftIngredients(cleanedMain);
      setDraftAddOnRecipes(cleanedAddOns);
      setSaveSuccessBanner(true);
      setTimeout(() => setSaveSuccessBanner(false), 3000);
    } catch (e) {
      setFeedback({
        isOpen: true,
        type: State.ERROR,
        message: e instanceof Error ? e.message : 'Failed to save recipe.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmClearRecipe = async () => {
    if (!selectedItem || !companyId) return;
    setConfirmClearOpen(false);
    setSaving(true);
    try {
      await deleteRecipe(companyId, selectedItem.id);
      setDraftIngredients([]);
      setDraftAddOnRecipes({});
      setValidationError(null);
    } catch (e) {
      setFeedback({
        isOpen: true,
        type: State.ERROR,
        message: e instanceof Error ? e.message : 'Failed to clear recipe.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyFromRecipe = (sourceRecipe: Recipe) => {
    setDraftIngredients((sourceRecipe.ingredients || []).map((l) => ({ ...l })));
    // Also copy matching add-on option recipes if the current item offers the same option IDs
    const validOptionIds = new Set(resolvedAddOnOptions.map((o) => o.option.id));
    const nextAddOns: Record<string, RecipeLine[]> = { ...draftAddOnRecipes };
    Object.entries(sourceRecipe.addOnRecipes || {}).forEach(([optId, lines]) => {
      if (validOptionIds.has(optId) && lines && lines.length > 0) {
        nextAddOns[optId] = lines.map((l) => ({ ...l }));
      }
    });
    setDraftAddOnRecipes(nextAddOns);
    setCopyModalOpen(false);
    setCopySearch('');
  };

  const copyableRecipes = useMemo(() => {
    const q = copySearch.trim().toLowerCase();
    return recipes
      .filter(
        (r) =>
          r.itemId !== selectedItemId &&
          hasAnyRecipeContent(r) &&
          (!q || (r.itemName || '').toLowerCase().includes(q)),
      )
      .sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''));
  }, [recipes, selectedItemId, copySearch]);

  const pageLoading = restaurantLoading || itemsLoading;

  return (
    <div className="min-h-screen bg-[#eef2ff] px-3 pb-20 pt-3 font-poppins text-[#0f172b] md:px-6 md:pb-10 md:pt-5">
      {feedback.isOpen && (
        <Modal
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback((p) => ({ ...p, isOpen: false }))}
          showConfirmButton={false}
        />
      )}

      {confirmClearOpen && selectedItem && (
        <Modal
          type={State.WARNING}
          message={`Clear the entire recipe (including add-on recipes) for "${selectedItem.name}"?`}
          onClose={() => setConfirmClearOpen(false)}
          onConfirm={handleConfirmClearRecipe}
          showConfirmButton
        />
      )}

      {pendingSwitchItemId && (
        <Modal
          type={State.WARNING}
          message={`You have unsaved changes to the recipe for "${selectedItem?.name || 'this item'}". Discard changes and switch items?`}
          onClose={() => setPendingSwitchItemId(null)}
          onConfirm={() => {
            const nextId = pendingSwitchItemId;
            setPendingSwitchItemId(null);
            setSelectedItemId(nextId);
            setMobileShowEditor(true);
          }}
          showConfirmButton
        />
      )}

      {pendingMobileBack && (
        <Modal
          type={State.WARNING}
          message="You have unsaved recipe changes. Discard changes and go back?"
          onClose={() => setPendingMobileBack(false)}
          onConfirm={() => {
            setPendingMobileBack(false);
            setMobileShowEditor(false);
          }}
          showConfirmButton
        />
      )}

      <RmQuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => {
          setIsQuickAddOpen(false);
          quickAddCallbackRef.current = null;
        }}
        companyId={companyId}
        existingMaterials={rawMaterials}
        categories={allRmCategories}
        onCreated={(created) => {
          quickAddCallbackRef.current?.(created.id, created.baseUnit);
          quickAddCallbackRef.current = null;
        }}
      />

      {/* COPY RECIPE MODAL */}
      {copyModalOpen && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/50 p-3">
          <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-sm border border-[#dfe6fb] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#dfe6fb] bg-[#f5f7ff] px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-[#0f172b]">Copy Recipe From Another Item</h3>
                <p className="text-[11px] text-[#5b6b86]">
                  Replaces current draft ingredients for {selectedItem?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCopyModalOpen(false)}
                className="rounded-sm p-1 text-[#5b6b86] hover:bg-[#e6eeff] hover:text-[#0f172b]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="border-b border-[#dfe6fb] p-3">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5b6b86]"
                />
                <input
                  type="text"
                  value={copySearch}
                  onChange={(e) => setCopySearch(e.target.value)}
                  placeholder="Search item with recipe..."
                  autoFocus
                  className="w-full rounded-sm border border-[#dfe6fb] bg-white py-1.5 pl-8 pr-3 text-xs text-[#0f172b] outline-none focus:border-[#155dfc]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#dfe6fb]">
              {copyableRecipes.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-[#5b6b86]">
                  No other items have a saved recipe yet.
                </div>
              ) : (
                copyableRecipes.map((r) => (
                  <button
                    key={r.itemId}
                    type="button"
                    onClick={() => handleCopyFromRecipe(r)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs transition hover:bg-[#f5f7ff]"
                  >
                    <div>
                      <span className="font-semibold text-[#0f172b]">{r.itemName}</span>
                      <span className="block text-[11px] text-[#5b6b86]">
                        {r.ingredients?.length || 0} ingredients • Cost: ₹
                        {recipeCost(r.ingredients || [], rawMaterialMap).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <span className="rounded-sm bg-[#e6eeff] px-2 py-1 text-[11px] font-semibold text-[#155dfc]">
                      Copy
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ExcelImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title="Import recipes"
        hint="One row per ingredient. Items in the file get their recipe replaced; others stay as they are."
        onDownloadTemplate={downloadRecipeTemplate}
        analyse={analyseRecipeImport}
        issuesFileName="Sellar_Recipes_Not_Imported.xlsx"
      />

      {/* PAGE HEADER */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <BackButton />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[#0f172b] md:text-xl">Recipe Management</h1>
              <span className="hidden rounded-sm bg-[#e6eeff] px-2 py-0.5 text-xs font-semibold text-[#155dfc] sm:inline-block">
                {filterCounts.set} / {filterCounts.all} Set
              </span>
            </div>
            <p className="text-xs text-[#5b6b86]">
              Map menu items & add-ons to raw materials for automatic kitchen stock deduction
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-3 py-2 text-xs font-semibold text-[#008236] shadow-2xs transition hover:border-[#008236]"
          >
            <FileSpreadsheet size={14} />
            Import Excel
          </button>
          <button
            type="button"
            onClick={() => navigate(ROUTES.RAW_MATERIALS)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-3 py-2 text-xs font-semibold text-[#0f172b] shadow-2xs transition hover:border-[#155dfc] hover:text-[#155dfc]"
          >
            <Package size={14} className="text-[#155dfc]" />
            Raw Materials ({rawMaterials.length})
          </button>
          <button
            type="button"
            onClick={() => {
              quickAddCallbackRef.current = null;
              setIsQuickAddOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-sm border border-[#155dfc] bg-white px-3 py-2 text-xs font-semibold text-[#155dfc] shadow-2xs transition hover:bg-[#f5f7ff]"
          >
            <Sparkles size={14} />
            + Add New Raw-Material
          </button>
        </div>
      </header>

      {pageLoading ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-sm border border-[#dfe6fb] bg-white py-20 text-[#5b6b86]">
          <Spinner className="h-7 w-7 text-[#155dfc]" />
          <p className="text-xs font-medium">Loading menu items and recipes...</p>
        </div>
      ) : menuItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-sm border border-[#dfe6fb] bg-white px-6 py-16 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-sm bg-[#e6eeff] text-[#155dfc]">
            <Utensils size={24} />
          </span>
          <h2 className="text-sm font-bold text-[#0f172b]">No menu items found</h2>
          <p className="mt-1 max-w-md text-xs text-[#5b6b86]">
            Add your sellable menu items first, then return here to set up their raw material recipes.
          </p>
          <button
            type="button"
            onClick={() => navigate(ROUTES.ITEM_ADD)}
            className="mt-4 rounded-sm bg-[#155dfc] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1447e6]"
          >
            Go to Add Item
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr]">
          {/* LEFT COLUMN: SEARCHABLE MENU ITEM LIST */}
          <aside
            className={`flex flex-col overflow-hidden rounded-sm border border-[#dfe6fb] bg-white shadow-xs ${
              mobileShowEditor ? 'hidden md:flex' : 'flex'
            } md:max-h-[calc(100vh-135px)]`}
          >
            {/* Search & Filter chips */}
            <div className="space-y-2.5 border-b border-[#dfe6fb] bg-[#f8faff] p-3">
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5b6b86]"
                />
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Search menu item or group..."
                  className="w-full rounded-sm border border-[#dfe6fb] bg-white py-2 pl-9 pr-8 text-xs text-[#0f172b] outline-none transition focus:border-[#155dfc]"
                />
                {itemSearch && (
                  <button
                    type="button"
                    onClick={() => setItemSearch('')}
                    aria-label="Clear item search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5b6b86] hover:text-[#0f172b]"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Filter Chips: All / Recipe set / Recipe missing */}
              <div className="grid grid-cols-3 gap-1 rounded-sm bg-[#eef2ff] p-1">
                {(
                  [
                    { key: 'all', label: 'All', count: filterCounts.all },
                    { key: 'set', label: 'Recipe set', count: filterCounts.set },
                    { key: 'missing', label: 'Missing', count: filterCounts.missing },
                  ] as const
                ).map((chip) => {
                  const active = recipeFilter === chip.key;
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => setRecipeFilter(chip.key)}
                      className={`rounded-sm px-2 py-1.5 text-[11px] font-semibold transition ${
                        active
                          ? 'bg-[#155dfc] text-white shadow-2xs'
                          : 'text-[#5b6b86] hover:bg-white hover:text-[#0f172b]'
                      }`}
                    >
                      {chip.label} ({chip.count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Item list */}
            <div className="flex-1 divide-y divide-[#dfe6fb] overflow-y-auto">
              {filteredMenuItems.length === 0 ? (
                <div className="px-4 py-10 text-center text-xs text-[#5b6b86]">
                  No menu items match this filter.
                </div>
              ) : (
                filteredMenuItems.map((it) => {
                  const rec = recipeMap.get(it.id);
                  const isSet = hasAnyRecipeContent(rec);
                  const ingCount = rec?.ingredients?.filter((l) => l.rawMaterialId).length || 0;
                  const addOnSetCount = Object.values(rec?.addOnRecipes || {}).filter(
                    (l) => l && l.length > 0,
                  ).length;
                  const isSelected = it.id === selectedItemId;
                  const groupName = getItemGroupLabel(it);

                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => handleSelectItem(it.id)}
                      className={`flex w-full items-start justify-between gap-2 px-3.5 py-3 text-left transition ${
                        isSelected
                          ? 'border-l-4 border-l-[#155dfc] bg-[#e6eeff]/60'
                          : 'hover:bg-[#f8faff]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-[#0f172b]">{it.name}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#5b6b86]">
                          {groupName && <span className="truncate">{groupName}</span>}
                          {groupName && <span>•</span>}
                          <span>₹{Number(it.salesPrice || it.mrp || 0).toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {isSet ? (
                          <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                            <Check size={10} />
                            Recipe set
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-sm bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                            Missing
                          </span>
                        )}
                        {(ingCount > 0 || addOnSetCount > 0) && (
                          <span className="text-[10px] text-[#5b6b86]">
                            {ingCount > 0 ? `${ingCount} ing` : ''}
                            {ingCount > 0 && addOnSetCount > 0 ? ' + ' : ''}
                            {addOnSetCount > 0 ? `${addOnSetCount} add-on` : ''}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* RIGHT COLUMN: RECIPE EDITOR */}
          <main
            className={`flex flex-col gap-4 ${
              mobileShowEditor ? 'flex' : 'hidden md:flex'
            }`}
          >
            {!selectedItem ? (
              <div className="flex flex-col items-center justify-center rounded-sm border border-[#dfe6fb] bg-white py-16 text-center">
                <ChefHat size={28} className="mb-2 text-[#155dfc]" />
                <p className="text-sm font-semibold text-[#0f172b]">
                  Select a menu item on the left to edit its recipe
                </p>
              </div>
            ) : (
              <>
                {/* Mobile back bar */}
                <div className="flex items-center justify-between md:hidden">
                  <button
                    type="button"
                    onClick={handleMobileBack}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-3 py-1.5 text-xs font-semibold text-[#0f172b] shadow-2xs"
                  >
                    <ArrowLeft size={14} />
                    Back to menu items
                  </button>
                  {isDirty && (
                    <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      Unsaved changes
                    </span>
                  )}
                </div>

                {/* ITEM RECIPE CARD */}
                <section className="rounded-sm border border-[#dfe6fb] bg-white shadow-xs">
                  {/* Editor Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#dfe6fb] bg-[#f8faff] px-4 py-3.5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-[#e6eeff] text-[#155dfc]">
                          <ChefHat size={16} />
                        </span>
                        <h2 className="text-base font-bold text-[#0f172b]">
                          Recipe For {selectedItem.name}
                        </h2>
                        {getItemGroupLabel(selectedItem) && (
                          <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-[#5b6b86]">
                            {getItemGroupLabel(selectedItem)}
                          </span>
                        )}
                        {isDirty && (
                          <span className="hidden rounded-sm bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 md:inline-block">
                            Unsaved changes
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[#5b6b86]">
                        Selling Price: ₹
                        {Number(selectedItem.salesPrice || selectedItem.mrp || 0).toLocaleString(
                          'en-IN',
                        )}{' '}
                        • Raw materials below are deducted from Kitchen stock per 1 portion sold
                      </p>
                    </div>

                    {/* Live Cost per portion & Portions left in stock */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="rounded-sm border border-[#dfe6fb] bg-white px-3 py-1.5">
                        <span className="block text-[10px] font-semibold uppercase text-[#5b6b86]">
                          Cost per portion
                        </span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-bold text-[#0f172b]">
                            ₹{liveMainCost.toLocaleString('en-IN')}
                          </span>
                          {Number(selectedItem.salesPrice) > 0 && liveMainCost > 0 && (
                            <span className="text-[10px] font-semibold text-[#155dfc]">
                              ({Math.round((liveMainCost / Number(selectedItem.salesPrice)) * 100)}%
                              food cost)
                            </span>
                          )}
                        </div>
                      </div>

                      {Number.isFinite(livePortionsLeft) && (
                        <div
                          className={`rounded-sm border px-3 py-1.5 ${
                            livePortionsLeft <= 0
                              ? 'border-red-200 bg-red-50 text-red-700'
                              : livePortionsLeft <= 5
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          <span className="block text-[10px] font-semibold uppercase">
                            Portions left in stock
                          </span>
                          <span className="text-sm font-bold">
                            {livePortionsLeft.toLocaleString('en-IN')}{' '}
                            {livePortionsLeft === 1 ? 'portion' : 'portions'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Toolbar: Copy / Clear / Save */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dfe6fb] px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCopyModalOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#5b6b86] transition hover:border-[#155dfc] hover:text-[#155dfc]"
                      >
                        <Copy size={13} />
                        Copy from another item
                      </button>

                      <button
                        type="button"
                        onClick={handleOneToOneRecipe}
                        title="Create or link a matching PC raw material and set 1:1 recipe (for packaged items like Coke 250ml)"
                        className="inline-flex items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#155dfc] transition hover:border-[#155dfc] hover:bg-[#f5f7ff]"
                      >
                        <Package size={13} />
                        1:1 Packaged Recipe
                      </button>

                      {(hasAnyRecipeContent(savedRecipeForSelected) ||
                        draftIngredients.length > 0 ||
                        Object.keys(draftAddOnRecipes).length > 0) && (
                        <button
                          type="button"
                          onClick={() => setConfirmClearOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-sm border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                        >
                          <Trash2 size={13} />
                          Clear recipe
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSaveRecipe}
                      className="inline-flex items-center gap-1.5 rounded-sm bg-[#155dfc] px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1447e6] disabled:opacity-50"
                    >
                      <Save size={14} />
                      {saving ? 'Saving...' : 'Save / Preserve'}
                    </button>
                  </div>

                  {/* Validation / Success messages */}
                  {validationError && (
                    <div className="mx-4 mt-3 flex items-center gap-2 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{validationError}</span>
                    </div>
                  )}

                  {saveSuccessBanner && (
                    <div className="mx-4 mt-3 flex items-center gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                      <Check size={15} className="shrink-0" />
                      <span>Recipe saved for {selectedItem.name}.</span>
                    </div>
                  )}

                  {/* Main Ingredient Table */}
                  <div className="p-4">
                    <RecipeIngredientTable
                      lines={draftIngredients}
                      onChange={setDraftIngredients}
                      rawMaterials={rawMaterials}
                      rawMaterialMap={rawMaterialMap}
                      onRequestQuickAdd={(cb) => {
                        quickAddCallbackRef.current = cb;
                        setIsQuickAddOpen(true);
                      }}
                      addRowLabel="+ Add Row"
                      emptyText={`No base ingredients added for "${selectedItem.name}". Click "+ Add Row" to add raw materials.`}
                    />
                  </div>
                </section>

                {/* ADDON'S RECIPE FOR <ITEM> */}
                <section className="rounded-sm border border-[#dfe6fb] bg-white shadow-xs">
                  <div className="flex items-center justify-between border-b border-[#dfe6fb] bg-[#f8faff] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-[#e6eeff] text-[#155dfc]">
                        <Layers size={15} />
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-[#0f172b]">
                          Addon&apos;s Recipe For {selectedItem.name}
                        </h3>
                        <p className="text-[11px] text-[#5b6b86]">
                          Configure raw materials consumed when a customer picks an add-on with this item
                        </p>
                      </div>
                    </div>
                    <span className="rounded-sm bg-[#e6eeff] px-2 py-0.5 text-xs font-semibold text-[#155dfc]">
                      {resolvedAddOnOptions.length}{' '}
                      {resolvedAddOnOptions.length === 1 ? 'Add-on' : 'Add-ons'}
                    </span>
                  </div>

                  {resolvedAddOnOptions.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-[#5b6b86]">
                      No add-on options are linked to <strong>{selectedItem.name}</strong>. Attach add-on
                      groups to this item in Item Groups / Edit Item to configure add-on recipes here.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#dfe6fb]">
                      {resolvedAddOnOptions.map(({ option, groupName }) => {
                        const isExpanded = expandedAddOnIds.has(option.id);
                        const optionLines = draftAddOnRecipes[option.id] || [];
                        const validOptionLines = optionLines.filter(
                          (l) => l.rawMaterialId && Number(l.qty) > 0,
                        );
                        const isOptionSet = validOptionLines.length > 0;
                        const optionCost = recipeCost(validOptionLines, rawMaterialMap);

                        return (
                          <div key={option.id} className="bg-white">
                            <button
                              type="button"
                              onClick={() => toggleAddOnAccordion(option.id)}
                              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#f8faff]"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {isExpanded ? (
                                  <ChevronDown size={16} className="shrink-0 text-[#155dfc]" />
                                ) : (
                                  <ChevronRight size={16} className="shrink-0 text-[#5b6b86]" />
                                )}
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-[#0f172b]">
                                    Recipe For {option.name}
                                  </span>
                                  <span className="ml-2 rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-[#5b6b86]">
                                    {groupName}
                                  </span>
                                  {Number(option.price) > 0 && (
                                    <span className="ml-1.5 text-[11px] text-[#5b6b86]">
                                      (+₹{Number(option.price).toLocaleString('en-IN')})
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                {isOptionSet ? (
                                  <>
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5b6b86]">
                                      <IndianRupee size={11} />
                                      Cost: ₹{optionCost.toLocaleString('en-IN')}
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                      <Check size={10} />
                                      Recipe set ({validOptionLines.length})
                                    </span>
                                  </>
                                ) : (
                                  <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-[#5b6b86]">
                                    No recipe
                                  </span>
                                )}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="border-t border-[#dfe6fb] bg-[#fbfcff] px-4 py-3.5">
                                <RecipeIngredientTable
                                  lines={optionLines}
                                  onChange={(next) => handleAddOnLinesChange(option.id, next)}
                                  rawMaterials={rawMaterials}
                                  rawMaterialMap={rawMaterialMap}
                                  onRequestQuickAdd={(cb) => {
                                    quickAddCallbackRef.current = cb;
                                    setIsQuickAddOpen(true);
                                  }}
                                  addRowLabel="+ Add Ingredient"
                                  emptyText={`No ingredients configured for "${option.name}". Click "+ Add Ingredient" to add raw materials.`}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Bottom Save bar */}
                  <div className="flex items-center justify-end gap-2.5 border-t border-[#dfe6fb] bg-[#f8faff] px-4 py-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSaveRecipe}
                      className="inline-flex items-center gap-1.5 rounded-sm bg-[#155dfc] px-5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1447e6] disabled:opacity-50"
                    >
                      <Save size={14} />
                      {saving ? 'Saving...' : 'Save / Preserve'}
                    </button>
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
};

export default RecipesPage;
