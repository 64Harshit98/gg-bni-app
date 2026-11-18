import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Warehouse,
  ArrowRightLeft,
  Clock,
  Minus,
} from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import { useRestaurantData } from '../../context/RestaurantDataContext';
import { useGodowns, SHOP_ID } from '../hooks/useStockTransfer';
import {
  KITCHEN_ID,
  KITCHEN_NAME,
  MOVEMENT_LABEL,
  type RawMaterial,
  type StockLedgerEntry,
  type StockMovementType,
} from '../../lib/restaurant/types';
import {
  defaultPurchaseUnitName,
  formatStock,
  round3,
  toBase,
  unitCostOf,
  unitsOf,
} from '../../lib/restaurant/units';
import { recipeCost } from '../../lib/restaurant/consumption';
import {
  applyMovements,
  fetchLedgerSince,
  transferRawMaterials,
  type MovementInput,
} from '../../lib/restaurant/stockApi';
import type { Item } from '../../constants/models';
import BackButton from '../../Components/BackButton';
import { RpRawMaterialSelect } from './components/RpRawMaterialSelect';
import { SeMenuItemSelect } from './components/SeMenuItemSelect';

type EntryTabType = 'wastage' | 'excess' | 'shortage' | 'loss' | 'production' | 'transfer';
type WastageMode = 'rawMaterial' | 'item';

interface RawMaterialEntryRow {
  rowId: string;
  rawMaterialId: string;
  quantity: string;
  unit: string;
  description: string;
}

interface MenuItemWastageRow {
  rowId: string;
  itemId: string;
  itemName: string;
  quantity: string;
  description: string;
}

const TABS: { id: EntryTabType; label: string; sign: 'add' | 'sub' | 'transfer' }[] = [
  { id: 'wastage', label: 'Wastage', sign: 'sub' },
  { id: 'excess', label: 'Excess', sign: 'add' },
  { id: 'shortage', label: 'Shortage', sign: 'sub' },
  { id: 'loss', label: 'Normal loss', sign: 'sub' },
  { id: 'production', label: 'Production', sign: 'add' },
  { id: 'transfer', label: 'Transfer', sign: 'transfer' },
];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const getTodayStr = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const combineDateWithCurrentTime = (dateStr: string): number => {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date();
    d.setFullYear(year, month, day);
    return d.getTime();
  }
  return Date.now();
};

const createBlankRawRow = (): RawMaterialEntryRow => ({
  rowId: crypto.randomUUID(),
  rawMaterialId: '',
  quantity: '',
  unit: '',
  description: '',
});

const createBlankItemRow = (): MenuItemWastageRow => ({
  rowId: crypto.randomUUID(),
  itemId: '',
  itemName: '',
  quantity: '',
  description: '',
});

const INPUT_CLS =
  'h-9 w-full rounded-sm border border-[#dfe6fb] bg-white px-2.5 text-xs font-medium text-[#0f172b] placeholder:text-[#5b6b86] focus:border-[#155dfc] focus:outline-none focus:ring-2 focus:ring-[#155dfc]/20';
const READONLY_CLS =
  'h-9 w-full rounded-sm border border-[#dfe6fb] bg-[#f8faff] px-2.5 text-xs font-semibold text-[#5b6b86] tabular-nums focus:outline-none cursor-not-allowed';

const StockEntry: React.FC = () => {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId || '';

  const { rawMaterials, rawMaterialMap, recipeMap, loading: restaurantLoading } =
    useRestaurantData();
  const { items: menuItems } = useCatalogueData();
  const { godowns } = useGodowns(companyId || undefined);

  // Active tab & mode
  const [activeTab, setActiveTab] = useState<EntryTabType>('wastage');
  const [wastageMode, setWastageMode] = useState<WastageMode>('rawMaterial');
  const [entryDate, setEntryDate] = useState<string>(getTodayStr);

  // Location state (for manual movements & transfer)
  const [locationId, setLocationId] = useState<string>(KITCHEN_ID);
  const [fromLocationId, setFromLocationId] = useState<string>(KITCHEN_ID);
  const [toLocationId, setToLocationId] = useState<string>('');

  // Rows state
  const [rawRows, setRawRows] = useState<RawMaterialEntryRow[]>(() => [createBlankRawRow()]);
  const [itemRows, setItemRows] = useState<MenuItemWastageRow[]>(() => [createBlankItemRow()]);

  // Recent ledger entries (last 30 days)
  const [ledgerEntries, setLedgerEntries] = useState<StockLedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Feedback
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const locationOptions = useMemo(() => {
    const activeGodowns = godowns
      .filter((g) => g.isActive !== false)
      .map((g) => ({ id: g.id, name: g.name }));
    return [{ id: KITCHEN_ID, name: KITCHEN_NAME }, ...activeGodowns];
  }, [godowns]);

  // Default `toLocationId` to first active godown when available
  useEffect(() => {
    if (!toLocationId && locationOptions.length > 1) {
      const firstOther = locationOptions.find((l) => l.id !== fromLocationId);
      if (firstOther) setToLocationId(firstOther.id);
    }
  }, [locationOptions, fromLocationId, toLocationId]);

  const getLocationName = useCallback(
    (locId: string): string => {
      if (locId === KITCHEN_ID || locId === SHOP_ID) return KITCHEN_NAME;
      return locationOptions.find((l) => l.id === locId)?.name || KITCHEN_NAME;
    },
    [locationOptions],
  );

  // Load recent ledger entries (last 30 days)
  const refreshLedger = useCallback(async () => {
    if (!companyId) return;
    setLoadingLedger(true);
    try {
      const sinceMs = Date.now() - THIRTY_DAYS_MS;
      const rows = await fetchLedgerSince(companyId, sinceMs);
      setLedgerEntries(rows);
    } catch (err) {
      console.error('Failed to fetch recent stock ledger entries:', err);
    } finally {
      setLoadingLedger(false);
    }
  }, [companyId]);

  useEffect(() => {
    refreshLedger();
  }, [refreshLedger]);

  // Reset alerts when switching tabs
  const handleTabSwitch = (tab: EntryTabType) => {
    setActiveTab(tab);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  // Computed raw material rows with Average Purchase Price (per entered unit) & Amount
  const computedRawRows = useMemo(() => {
    return rawRows.map((row) => {
      const rm = rawMaterialMap.get(row.rawMaterialId);
      const unitList = rm ? unitsOf(rm) : [];
      const unitName = row.unit || (rm ? defaultPurchaseUnitName(rm) : '');
      const unitDef = unitList.find(
        (u) => u.name.toLowerCase() === unitName.trim().toLowerCase(),
      );
      const factor = unitDef && unitDef.factor > 0 ? unitDef.factor : 1;
      const qty = Math.max(0, Number(row.quantity) || 0);
      const baseQty = rm ? toBase(rm, qty, unitName) : round3(qty);
      const avgPricePerUnit = rm ? round3(unitCostOf(rm) * factor) : 0;
      const amount = round2(qty * avgPricePerUnit);

      const stockLocId = activeTab === 'transfer' ? fromLocationId : locationId;
      const availableBaseStock = rm
        ? stockLocId === KITCHEN_ID
          ? Number(rm.stock) || 0
          : Number(rm.godownStock?.[stockLocId]) || 0
        : 0;

      return {
        ...row,
        rm,
        unitList,
        unitName,
        factor,
        qty,
        baseQty,
        avgPricePerUnit,
        amount,
        availableBaseStock,
      };
    });
  }, [rawRows, rawMaterialMap, activeTab, fromLocationId, locationId]);

  // Computed menu item rows for Wastage -> Item mode
  const computedItemRows = useMemo(() => {
    return itemRows.map((row) => {
      const recipe = row.itemId ? recipeMap.get(row.itemId) : undefined;
      const hasRecipe = Boolean(recipe && recipe.ingredients.length > 0);
      const qty = Math.max(0, Number(row.quantity) || 0);
      const costPerPortion =
        hasRecipe && recipe ? recipeCost(recipe.ingredients, rawMaterialMap) : 0;
      const amount = round2(qty * costPerPortion);

      const ingredientSummary =
        hasRecipe && recipe
          ? recipe.ingredients
              .map((ing) => {
                const rm = rawMaterialMap.get(ing.rawMaterialId);
                const totalIngQty = round3((Number(ing.qty) || 0) * (qty || 1));
                return rm ? `${rm.name}: ${totalIngQty} ${ing.unit}` : null;
              })
              .filter(Boolean)
              .join(', ')
          : '';

      return {
        ...row,
        recipe,
        hasRecipe,
        qty,
        costPerPortion,
        amount,
        ingredientSummary,
      };
    });
  }, [itemRows, recipeMap, rawMaterialMap]);

  // Total amount of current form
  const totalFormAmount = useMemo(() => {
    if (activeTab === 'wastage' && wastageMode === 'item') {
      return round2(computedItemRows.reduce((s, r) => s + r.amount, 0));
    }
    return round2(computedRawRows.reduce((s, r) => s + r.amount, 0));
  }, [activeTab, wastageMode, computedItemRows, computedRawRows]);

  // Filtered recent entries for the active tab (last 30 days)
  const filteredRecentEntries = useMemo(() => {
    return ledgerEntries
      .filter((entry) => {
        if (entry.type !== activeTab) return false;
        // For Transfer show only the negative/outgoing leg
        if (activeTab === 'transfer') return Number(entry.qty) < 0;
        return true;
      })
      .sort((a, b) => (b.date || b.createdAt || 0) - (a.date || a.createdAt || 0));
  }, [ledgerEntries, activeTab]);

  // Row handlers for Raw Material rows
  const handleSelectRawMaterial = (rowId: string, rm: RawMaterial) => {
    const defUnit = defaultPurchaseUnitName(rm);
    setRawRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId ? { ...r, rawMaterialId: rm.id, unit: defUnit } : r,
      ),
    );
  };

  const handleRawRowField = (
    rowId: string,
    field: 'quantity' | 'unit' | 'description',
    value: string,
  ) => {
    setRawRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, [field]: value } : r)),
    );
  };

  const handleAddRawRow = () => {
    setRawRows((prev) => [...prev, createBlankRawRow()]);
  };

  const handleRemoveLastRawRow = () => {
    setRawRows((prev) => (prev.length > 1 ? prev.slice(0, -1) : [createBlankRawRow()]));
  };

  const handleDeleteRawRow = (rowId: string) => {
    setRawRows((prev) =>
      prev.length > 1 ? prev.filter((r) => r.rowId !== rowId) : [createBlankRawRow()],
    );
  };

  // Row handlers for Menu Item Wastage rows
  const handleSelectMenuItem = (rowId: string, item: Item) => {
    setItemRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? { ...r, itemId: item.id || '', itemName: item.name }
          : r,
      ),
    );
  };

  const handleItemRowField = (
    rowId: string,
    field: 'quantity' | 'description',
    value: string,
  ) => {
    setItemRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, [field]: value } : r)),
    );
  };

  const handleAddItemRow = () => {
    setItemRows((prev) => [...prev, createBlankItemRow()]);
  };

  const handleRemoveLastItemRow = () => {
    setItemRows((prev) => (prev.length > 1 ? prev.slice(0, -1) : [createBlankItemRow()]));
  };

  const handleDeleteItemRow = (rowId: string) => {
    setItemRows((prev) =>
      prev.length > 1 ? prev.filter((r) => r.rowId !== rowId) : [createBlankItemRow()],
    );
  };

  // Save handler
  const handleSave = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!companyId) {
      setErrorMsg('Company session is missing.');
      return;
    }

    const entryDateMs = combineDateWithCurrentTime(entryDate);

    // 1. Wastage -> Item mode
    if (activeTab === 'wastage' && wastageMode === 'item') {
      const filled = computedItemRows.filter((r) => r.itemId || r.quantity || r.description);
      if (filled.length === 0) {
        setErrorMsg('Please select at least one menu item and enter quantity.');
        return;
      }

      const movements: MovementInput[] = [];
      const locName = getLocationName(locationId);

      for (let i = 0; i < filled.length; i++) {
        const row = filled[i];
        if (!row.itemId) {
          setErrorMsg(`Row #${i + 1}: Please select a menu item.`);
          return;
        }
        if (row.qty <= 0) {
          setErrorMsg(`Row #${i + 1} (${row.itemName}): Quantity must be greater than 0.`);
          return;
        }
        const recipe = recipeMap.get(row.itemId);
        if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
          setErrorMsg(
            `Row #${i + 1}: Menu item "${row.itemName}" has no recipe configured. Please add a recipe for this item first.`,
          );
          return;
        }

        for (const ing of recipe.ingredients) {
          const rm = rawMaterialMap.get(ing.rawMaterialId);
          if (!rm) {
            setErrorMsg(
              `Row #${i + 1} (${row.itemName}): Recipe ingredient no longer exists in raw materials.`,
            );
            return;
          }
          const baseQty = round3(toBase(rm, ing.qty, ing.unit) * row.qty);
          if (baseQty <= 0) continue;

          movements.push({
            rawMaterialId: rm.id,
            rawMaterialName: rm.name,
            type: 'wastage',
            qty: -baseQty,
            locationId,
            locationName: locName,
            date: entryDateMs,
            refType: 'manual',
            unitCost: unitCostOf(rm),
            note: row.description.trim()
              ? `${row.itemName} (×${row.qty}): ${row.description.trim()}`
              : `Item wastage: ${row.itemName} (×${row.qty})`,
          });
        }
      }

      if (movements.length === 0) {
        setErrorMsg('No valid recipe ingredient quantities found to deduct.');
        return;
      }

      setSaving(true);
      try {
        await applyMovements(companyId, movements);
        setItemRows([createBlankItemRow()]);
        setSuccessMsg('Item wastage recorded and raw material stock updated!');
        await refreshLedger();
        setTimeout(() => setSuccessMsg(null), 3500);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to save item wastage.');
      } finally {
        setSaving(false);
      }
      return;
    }

    // 2. Transfer tab
    if (activeTab === 'transfer') {
      if (!fromLocationId || !toLocationId) {
        setErrorMsg('Please select both From and To locations.');
        return;
      }
      if (fromLocationId === toLocationId) {
        setErrorMsg('Source (From) and destination (To) locations cannot be the same.');
        return;
      }

      const filled = computedRawRows.filter((r) => r.rawMaterialId || r.quantity || r.description);
      if (filled.length === 0) {
        setErrorMsg('Please add at least one raw material to transfer.');
        return;
      }

      const aggregated = new Map<
        string,
        { rawMaterialId: string; rawMaterialName: string; qty: number; notes: string[] }
      >();

      for (let i = 0; i < filled.length; i++) {
        const row = filled[i];
        if (!row.rawMaterialId || !row.rm) {
          setErrorMsg(`Row #${i + 1}: Please select a raw material.`);
          return;
        }
        if (row.qty <= 0 || row.baseQty <= 0) {
          setErrorMsg(`Row #${i + 1} (${row.rm.name}): Quantity must be greater than 0.`);
          return;
        }
        const prev = aggregated.get(row.rm.id);
        if (prev) {
          prev.qty = round3(prev.qty + row.baseQty);
          if (row.description.trim()) prev.notes.push(row.description.trim());
        } else {
          aggregated.set(row.rm.id, {
            rawMaterialId: row.rm.id,
            rawMaterialName: row.rm.name,
            qty: row.baseQty,
            notes: row.description.trim() ? [row.description.trim()] : [],
          });
        }
      }

      const fromName = getLocationName(fromLocationId);
      const toName = getLocationName(toLocationId);
      const combinedNote = [...aggregated.values()]
        .flatMap((x) => x.notes)
        .filter(Boolean)
        .join('; ');

      setSaving(true);
      try {
        await transferRawMaterials(companyId, {
          items: [...aggregated.values()].map((x) => ({
            rawMaterialId: x.rawMaterialId,
            rawMaterialName: x.rawMaterialName,
            qty: x.qty,
          })),
          from: { id: fromLocationId, name: fromName },
          to: { id: toLocationId, name: toName },
          date: entryDateMs,
          note: combinedNote || `Transfer: ${fromName} → ${toName}`,
        });
        setRawRows([createBlankRawRow()]);
        setSuccessMsg(`Stock transferred from ${fromName} to ${toName}!`);
        await refreshLedger();
        setTimeout(() => setSuccessMsg(null), 3500);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to transfer stock.');
      } finally {
        setSaving(false);
      }
      return;
    }

    // 3. Raw Material movements: wastage | excess | shortage | loss | production
    const filled = computedRawRows.filter((r) => r.rawMaterialId || r.quantity || r.description);
    if (filled.length === 0) {
      setErrorMsg('Please select at least one raw material and enter a quantity.');
      return;
    }

    const isAddition = activeTab === 'excess' || activeTab === 'production';
    const movementType: StockMovementType = activeTab;
    const locName = getLocationName(locationId);
    const movements: MovementInput[] = [];

    for (let i = 0; i < filled.length; i++) {
      const row = filled[i];
      if (!row.rawMaterialId || !row.rm) {
        setErrorMsg(`Row #${i + 1}: Please select a raw material.`);
        return;
      }
      if (row.qty <= 0 || row.baseQty <= 0) {
        setErrorMsg(`Row #${i + 1} (${row.rm.name}): Quantity must be greater than 0.`);
        return;
      }

      const signedBaseQty = isAddition ? row.baseQty : -row.baseQty;
      movements.push({
        rawMaterialId: row.rm.id,
        rawMaterialName: row.rm.name,
        type: movementType,
        qty: signedBaseQty,
        locationId,
        locationName: locName,
        date: entryDateMs,
        refType: 'manual',
        unitCost: unitCostOf(row.rm),
        note: row.description.trim() || undefined,
      });
    }

    setSaving(true);
    try {
      await applyMovements(companyId, movements);
      setRawRows([createBlankRawRow()]);
      setSuccessMsg(`${MOVEMENT_LABEL[movementType]} entry saved!`);
      await refreshLedger();
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save stock entry.');
    } finally {
      setSaving(false);
    }
  };

  const activeTabMeta = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="min-h-screen bg-[#eef2ff] pb-24 font-poppins text-[#0f172b]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 border-b border-[#dfe6fb] bg-white/95 backdrop-blur px-4 py-3 shadow-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BackButton />
            <div>
              <h1 className="text-base sm:text-lg font-bold text-[#0f172b]">
                Add {activeTabMeta.label} Details
              </h1>
              <p className="text-xs text-[#5b6b86]">
                Record manual stock adjustments, wastage, production & location transfers
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || restaurantLoading}
            className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-[#155dfc] px-4 text-xs font-semibold text-white hover:bg-[#1447e6] disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Save size={15} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-3 sm:px-4 pt-4 space-y-4">
        {/* Tabs Bar */}
        <div className="flex overflow-x-auto rounded-sm border border-[#dfe6fb] bg-white p-1 shadow-xs gap-1">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabSwitch(tab.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#155dfc] text-white shadow-xs'
                    : 'text-[#5b6b86] hover:bg-[#eef2ff] hover:text-[#0f172b]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : tab.sign === 'add'
                        ? 'bg-emerald-50 text-emerald-700'
                        : tab.sign === 'sub'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-[#eef2ff] text-[#155dfc]'
                  }`}
                >
                  {tab.sign === 'add' ? '+IN' : tab.sign === 'sub' ? '-OUT' : '⇄'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="flex items-start gap-2.5 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2.5 rounded-sm border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Entry Form Card */}
        <div className="rounded-sm border border-[#dfe6fb] bg-white shadow-xs">
          {/* Controls Strip (Date, Wastage For radio, Location / From-To) */}
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#dfe6fb] bg-[#f8faff] p-4">
            <div className="flex flex-wrap items-end gap-4">
              {/* Date Picker */}
              <div className="w-44">
                <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                  <Calendar size={12} />
                  Date *
                </label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>

              {/* Wastage For radio (only on Wastage tab) */}
              {activeTab === 'wastage' && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                    Wastage for
                  </label>
                  <div className="flex h-9 items-center gap-4 rounded-sm border border-[#dfe6fb] bg-white px-3">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0f172b] cursor-pointer">
                      <input
                        type="radio"
                        name="wastageFor"
                        checked={wastageMode === 'rawMaterial'}
                        onChange={() => {
                          setWastageMode('rawMaterial');
                          setErrorMsg(null);
                        }}
                        className="h-3.5 w-3.5 accent-[#155dfc]"
                      />
                      Raw Material
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0f172b] cursor-pointer">
                      <input
                        type="radio"
                        name="wastageFor"
                        checked={wastageMode === 'item'}
                        onChange={() => {
                          setWastageMode('item');
                          setErrorMsg(null);
                        }}
                        className="h-3.5 w-3.5 accent-[#155dfc]"
                      />
                      Item
                    </label>
                  </div>
                </div>
              )}

              {/* Location Select (Wastage, Excess, Shortage, Normal loss, Production) */}
              {activeTab !== 'transfer' && (
                <div className="w-52">
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                    <Warehouse size={12} />
                    Location *
                  </label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className={INPUT_CLS}
                  >
                    {locationOptions.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* From / To Selects (Transfer tab) */}
              {activeTab === 'transfer' && (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-48">
                    <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                      <Warehouse size={12} />
                      From Location *
                    </label>
                    <select
                      value={fromLocationId}
                      onChange={(e) => setFromLocationId(e.target.value)}
                      className={INPUT_CLS}
                    >
                      {locationOptions.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex h-9 items-center justify-center text-[#155dfc]">
                    <ArrowRightLeft size={16} />
                  </div>

                  <div className="w-48">
                    <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                      <Warehouse size={12} />
                      To Location *
                    </label>
                    <select
                      value={toLocationId}
                      onChange={(e) => setToLocationId(e.target.value)}
                      className={INPUT_CLS}
                    >
                      <option value="">Select destination</option>
                      {locationOptions.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons: + Add New / Remove */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={
                  activeTab === 'wastage' && wastageMode === 'item'
                    ? handleAddItemRow
                    : handleAddRawRow
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-[#155dfc] px-3 text-xs font-semibold text-white hover:bg-[#1447e6] transition-colors cursor-pointer"
              >
                <Plus size={14} />
                + Add New
              </button>
              <button
                type="button"
                onClick={
                  activeTab === 'wastage' && wastageMode === 'item'
                    ? handleRemoveLastItemRow
                    : handleRemoveLastRawRow
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Minus size={14} />
                Remove
              </button>
            </div>
          </div>

          {/* TABLE BODY: Wastage -> Item mode */}
          {activeTab === 'wastage' && wastageMode === 'item' ? (
            <div>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-visible">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#dfe6fb] bg-[#f8faff] text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                      <th className="py-2.5 pl-4 pr-2 w-10">#</th>
                      <th className="py-2.5 px-2 min-w-[240px]">Item *</th>
                      <th className="py-2.5 px-2 w-36">Quantity (Portions) *</th>
                      <th className="py-2.5 px-2 w-44">Average Recipe Price</th>
                      <th className="py-2.5 px-2 w-36">Amount</th>
                      <th className="py-2.5 px-2 min-w-[200px]">Description</th>
                      <th className="py-2.5 pl-2 pr-4 w-12 text-center">Del</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#dfe6fb]">
                    {computedItemRows.map((row, idx) => (
                      <tr key={row.rowId} className="align-top hover:bg-[#f8faff]/60">
                        <td className="py-3 pl-4 pr-2 text-xs font-semibold text-[#5b6b86]">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-2">
                          <SeMenuItemSelect
                            items={menuItems}
                            recipeMap={recipeMap}
                            rawMaterialMap={rawMaterialMap}
                            value={row.itemId}
                            onChange={(item) => handleSelectMenuItem(row.rowId, item)}
                          />
                          {row.itemId && !row.hasRecipe && (
                            <div className="mt-1 text-[11px] font-medium text-red-600">
                              No recipe configured for this item
                            </div>
                          )}
                          {row.ingredientSummary && (
                            <div className="mt-1 text-[11px] text-[#5b6b86]">
                              Deducts: {row.ingredientSummary}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={row.quantity}
                            onChange={(e) =>
                              handleItemRowField(row.rowId, 'quantity', e.target.value)
                            }
                            placeholder="Portions"
                            className={INPUT_CLS}
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="text"
                            readOnly
                            value={
                              row.itemId && row.hasRecipe
                                ? `₹${row.costPerPortion.toFixed(2)} / portion`
                                : '—'
                            }
                            className={READONLY_CLS}
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="text"
                            readOnly
                            value={`₹${row.amount.toFixed(2)}`}
                            className={READONLY_CLS}
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) =>
                              handleItemRowField(row.rowId, 'description', e.target.value)
                            }
                            placeholder="Reason / Description"
                            className={INPUT_CLS}
                          />
                        </td>
                        <td className="py-2.5 pl-2 pr-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteItemRow(row.rowId)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-[#5b6b86] hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked Cards */}
              <div className="md:hidden divide-y divide-[#dfe6fb]">
                {computedItemRows.map((row, idx) => (
                  <div key={row.rowId} className="p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#5b6b86]">#{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteItemRow(row.rowId)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-[#5b6b86] hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                        Menu Item *
                      </label>
                      <SeMenuItemSelect
                        items={menuItems}
                        recipeMap={recipeMap}
                        rawMaterialMap={rawMaterialMap}
                        value={row.itemId}
                        onChange={(item) => handleSelectMenuItem(row.rowId, item)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                          Qty (Portions) *
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={row.quantity}
                          onChange={(e) =>
                            handleItemRowField(row.rowId, 'quantity', e.target.value)
                          }
                          className={INPUT_CLS}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                          Amount
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={`₹${row.amount.toFixed(2)}`}
                          className={READONLY_CLS}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) =>
                          handleItemRowField(row.rowId, 'description', e.target.value)
                        }
                        placeholder="Description"
                        className={INPUT_CLS}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* TABLE BODY: Raw Material mode (Wastage, Excess, Shortage, Normal loss, Production, Transfer) */
            <div>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-visible">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#dfe6fb] bg-[#f8faff] text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                      <th className="py-2.5 pl-4 pr-2 w-10">#</th>
                      <th className="py-2.5 px-2 min-w-[240px]">Raw Material *</th>
                      <th className="py-2.5 px-2 w-32">Quantity *</th>
                      <th className="py-2.5 px-2 w-32">Unit *</th>
                      <th className="py-2.5 px-2 w-44">Average Purchase Price</th>
                      <th className="py-2.5 px-2 w-32">Amount</th>
                      <th className="py-2.5 px-2 min-w-[180px]">Description</th>
                      <th className="py-2.5 pl-2 pr-4 w-12 text-center">Del</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#dfe6fb]">
                    {computedRawRows.map((row, idx) => (
                      <tr key={row.rowId} className="align-top hover:bg-[#f8faff]/60">
                        <td className="py-3 pl-4 pr-2 text-xs font-semibold text-[#5b6b86]">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-2">
                          <RpRawMaterialSelect
                            rawMaterials={rawMaterials}
                            value={row.rawMaterialId}
                            locationId={activeTab === 'transfer' ? fromLocationId : locationId}
                            onChange={(rm) => handleSelectRawMaterial(row.rowId, rm)}
                          />
                          {row.rm && (
                            <div className="mt-0.5 text-[10px] text-[#5b6b86]">
                              In stock: {formatStock(row.rm, row.availableBaseStock)}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={row.quantity}
                            onChange={(e) =>
                              handleRawRowField(row.rowId, 'quantity', e.target.value)
                            }
                            placeholder="Enter Qty"
                            className={INPUT_CLS}
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <select
                            value={row.unitName}
                            disabled={!row.rm}
                            onChange={(e) =>
                              handleRawRowField(row.rowId, 'unit', e.target.value)
                            }
                            className={`${INPUT_CLS} disabled:bg-slate-50`}
                          >
                            {!row.rm && <option value="">Select Unit</option>}
                            {row.unitList.map((u) => (
                              <option key={u.name} value={u.name}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="text"
                            readOnly
                            value={
                              row.rm
                                ? `₹${row.avgPricePerUnit.toFixed(2)} / ${row.unitName}`
                                : 'Average Purchase Price'
                            }
                            className={READONLY_CLS}
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="text"
                            readOnly
                            value={row.rm ? `₹${row.amount.toFixed(2)}` : 'Amount'}
                            className={READONLY_CLS}
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) =>
                              handleRawRowField(row.rowId, 'description', e.target.value)
                            }
                            placeholder="Description"
                            className={INPUT_CLS}
                          />
                        </td>
                        <td className="py-2.5 pl-2 pr-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRawRow(row.rowId)}
                            title="Delete row"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-[#5b6b86] hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked Cards */}
              <div className="md:hidden divide-y divide-[#dfe6fb]">
                {computedRawRows.map((row, idx) => (
                  <div key={row.rowId} className="p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#5b6b86]">#{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteRawRow(row.rowId)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-[#5b6b86] hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                        Raw Material *
                      </label>
                      <RpRawMaterialSelect
                        rawMaterials={rawMaterials}
                        value={row.rawMaterialId}
                        locationId={activeTab === 'transfer' ? fromLocationId : locationId}
                        onChange={(rm) => handleSelectRawMaterial(row.rowId, rm)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                          Quantity *
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={row.quantity}
                          onChange={(e) =>
                            handleRawRowField(row.rowId, 'quantity', e.target.value)
                          }
                          className={INPUT_CLS}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                          Unit *
                        </label>
                        <select
                          value={row.unitName}
                          disabled={!row.rm}
                          onChange={(e) => handleRawRowField(row.rowId, 'unit', e.target.value)}
                          className={INPUT_CLS}
                        >
                          {!row.rm && <option value="">Unit</option>}
                          {row.unitList.map((u) => (
                            <option key={u.name} value={u.name}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                          Avg Purchase Price
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={row.rm ? `₹${row.avgPricePerUnit.toFixed(2)}` : '—'}
                          className={READONLY_CLS}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                          Amount
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={row.rm ? `₹${row.amount.toFixed(2)}` : '—'}
                          className={READONLY_CLS}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) =>
                          handleRawRowField(row.rowId, 'description', e.target.value)
                        }
                        placeholder="Description"
                        className={INPUT_CLS}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Bar inside Form Card */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dfe6fb] bg-[#f8faff] px-4 py-3">
            <div className="text-xs font-semibold text-[#0f172b]">
              Total Estimated Value:{' '}
              <span className="text-sm font-bold text-[#155dfc] tabular-nums">
                ₹{totalFormAmount.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setRawRows([createBlankRawRow()]);
                  setItemRows([createBlankItemRow()]);
                  setErrorMsg(null);
                }}
                className="h-9 rounded-sm border border-[#dfe6fb] bg-white px-3.5 text-xs font-medium text-[#0f172b] hover:bg-[#eef2ff]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || restaurantLoading}
                className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-[#155dfc] px-4 text-xs font-semibold text-white hover:bg-[#1447e6] disabled:opacity-50 cursor-pointer"
              >
                <Save size={15} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>

        {/* Recent Entries (Last 30 Days) for Active Tab */}
        <div className="rounded-sm border border-[#dfe6fb] bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-[#dfe6fb] px-4 py-3">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-[#155dfc]" />
              <div>
                <h2 className="text-sm font-semibold text-[#0f172b]">
                  Recent {activeTabMeta.label} Entries (Last 30 Days)
                </h2>
                <p className="text-[11px] text-[#5b6b86]">
                  {filteredRecentEntries.length} record
                  {filteredRecentEntries.length === 1 ? '' : 's'} found
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={refreshLedger}
              disabled={loadingLedger}
              className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-2.5 text-xs font-medium text-[#0f172b] hover:bg-[#eef2ff] disabled:opacity-50"
            >
              <RefreshCw size={13} className={loadingLedger ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {filteredRecentEntries.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[#5b6b86]">
              {loadingLedger
                ? 'Loading recent entries...'
                : `No ${activeTabMeta.label.toLowerCase()} entries recorded in the last 30 days.`}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#dfe6fb] bg-[#f8faff] text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                    <th className="py-2.5 pl-4 pr-2">Date</th>
                    <th className="py-2.5 px-2">Raw Material</th>
                    <th className="py-2.5 px-2">Location</th>
                    <th className="py-2.5 px-2 text-right">Quantity</th>
                    <th className="py-2.5 px-2 text-right">Value (₹)</th>
                    <th className="py-2.5 pl-2 pr-4">Note / Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfe6fb] text-xs">
                  {filteredRecentEntries.map((entry, idx) => {
                    const rm = rawMaterialMap.get(entry.rawMaterialId);
                    const absQty = Math.abs(Number(entry.qty) || 0);
                    const formattedQty = rm
                      ? formatStock(rm, absQty)
                      : `${round3(absQty)}`;
                    const unitCost = Number(entry.unitCost ?? rm?.avgCost ?? 0) || 0;
                    const value = round2(absQty * unitCost);
                    const dateStr = new Date(entry.date || entry.createdAt || Date.now()).toLocaleDateString(
                      'en-IN',
                      { day: '2-digit', month: 'short', year: 'numeric' },
                    );
                    const isPositive = Number(entry.qty) > 0;

                    return (
                      <tr key={entry.id || idx} className="hover:bg-[#f8faff]">
                        <td className="py-2.5 pl-4 pr-2 whitespace-nowrap text-[#5b6b86] tabular-nums">
                          {dateStr}
                        </td>
                        <td className="py-2.5 px-2 font-semibold text-[#0f172b]">
                          {entry.rawMaterialName || rm?.name || entry.rawMaterialId}
                        </td>
                        <td className="py-2.5 px-2 text-[#5b6b86]">
                          {entry.locationName || getLocationName(entry.locationId)}
                        </td>
                        <td
                          className={`py-2.5 px-2 text-right font-semibold tabular-nums ${
                            isPositive ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {isPositive ? '+' : '-'}
                          {formattedQty}
                        </td>
                        <td className="py-2.5 px-2 text-right font-medium text-[#0f172b] tabular-nums">
                          ₹{value.toFixed(2)}
                        </td>
                        <td className="py-2.5 pl-2 pr-4 text-[#5b6b86]">
                          {entry.note || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockEntry;
