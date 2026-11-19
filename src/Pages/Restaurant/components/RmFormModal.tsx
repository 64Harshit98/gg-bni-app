import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Package, Plus, Star, Trash2, X } from 'lucide-react';
import {
  CLOSING_PERIODS,
  TAX_TYPES,
  type BaseUnit,
  type PurchaseUnit,
  type RawMaterial,
} from '../../../lib/restaurant/types';
import {
  BASE_UNITS,
  costPerBase,
  round3,
  toBase,
  unitsOf,
  fromBase,
} from '../../../lib/restaurant/units';
import {
  addRawMaterialCategory,
  createRawMaterial,
  updateRawMaterial,
} from '../../../lib/restaurant/stockApi';

// The create / edit form shows every column of the raw-material import file
// (RAW_MATERIAL_COLUMNS, Petpooja's layout), grouped into sections.

const UNIT_LABELS: Record<BaseUnit, string> = {
  GRM: 'GRM (Grams — converts with KG)',
  ML: 'ML (Millilitres — converts with LTR)',
  PC: 'PC (Pieces — converts with DOZEN)',
};

const INPUT =
  'w-full rounded-sm border border-[#dfe6fb] bg-white px-2.5 py-1.5 text-sm text-[#0f172b] outline-none transition focus:border-[#155dfc] focus:ring-2 focus:ring-blue-100 disabled:bg-[#f5f7ff] disabled:text-[#5b6b86]';
const UNIT_SELECT =
  'shrink-0 rounded-sm border border-[#dfe6fb] bg-[#f5f7ff] px-2 py-1.5 text-xs font-semibold text-[#0f172b] outline-none focus:border-[#155dfc]';
const CHECK = 'h-4 w-4 rounded-sm border-slate-300 text-[#155dfc] focus:ring-[#155dfc]';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

interface OtherUnitDraft {
  key: string;
  name: string;
  /** Base units in 1 of this unit. */
  factor: string;
}

/** Every field of the form, as typed. */
interface FormState {
  // basic
  name: string;
  category: string;
  subCategory: string;
  brand: string;
  shortCode: string;
  gtin: string;
  rank: string;
  description: string;
  // units
  baseUnit: BaseUnit;
  hasPackaging: boolean;
  pkgName: string;
  pkgFactor: string;
  otherUnits: OtherUnitDraft[];
  allowDecimal: boolean;
  // price & tax (prices typed per `priceUnit`)
  priceUnit: string;
  purchasePrice: string;
  /** Purchase price box was pre-filled from the average cost (none saved yet). */
  purchasePriceFromAvg: boolean;
  transferPrice: string;
  reconciliationPrice: string;
  taxType: string;
  taxRate: string;
  hsn: string;
  exciseDuty: string;
  // stock
  openingStock: string;
  openingUnit: string;
  restockLevel: string;
  restockUnit: string;
  parLevel: string;
  parUnit: string;
  normalLossPct: string;
  closingStockOn: string[];
  // expiry & status
  isExpiry: boolean;
  shelfLifeDays: string;
  favourite: boolean;
  exclusive: boolean;
  active: boolean;
}

const BLANK: FormState = {
  name: '', category: 'General', subCategory: '', brand: '', shortCode: '', gtin: '', rank: '', description: '',
  baseUnit: 'GRM', hasPackaging: false, pkgName: '', pkgFactor: '', otherUnits: [], allowDecimal: true,
  priceUnit: 'GRM', purchasePrice: '', purchasePriceFromAvg: false, transferPrice: '', reconciliationPrice: '', taxType: 'GST', taxRate: '', hsn: '', exciseDuty: '',
  openingStock: '', openingUnit: 'GRM', restockLevel: '', restockUnit: 'GRM', parLevel: '', parUnit: 'GRM', normalLossPct: '', closingStockOn: [],
  isExpiry: false, shelfLifeDays: '', favourite: false, exclusive: false, active: true,
};

const numText = (v?: number) => (v && v > 0 ? String(v) : '');
const newKey = () => Math.random().toString(36).slice(2);

/** Form state for an existing raw material (stored base-unit values shown in the saved units). */
const formOf = (rm: RawMaterial): FormState => {
  const units = unitsOf(rm).map((u) => u.name);
  const pkg = rm.purchaseUnit && rm.purchaseUnit.name.trim() && rm.purchaseUnit.factor > 0 ? rm.purchaseUnit : undefined;
  const def = pkg?.name || rm.baseUnit;
  const pick = (u?: string) => (u && units.includes(u) ? u : def);
  const restockUnit = pick(rm.restockUnit);
  const parUnit = pick(rm.parUnit);
  const perUnit = (perBase?: number) => (perBase && perBase > 0 ? String(round2(perBase * toBase(rm, 1, def))) : '');
  return {
    ...BLANK,
    name: rm.name,
    category: rm.category || 'General',
    subCategory: rm.subCategory || '',
    brand: rm.brand || '',
    shortCode: rm.shortCode || '',
    gtin: rm.gtin || '',
    rank: numText(rm.rank),
    description: rm.description || '',
    baseUnit: rm.baseUnit,
    hasPackaging: !!pkg,
    pkgName: pkg?.name || '',
    pkgFactor: pkg ? String(pkg.factor) : '',
    otherUnits: (rm.otherPurchaseUnits || []).map((u) => ({ key: newKey(), name: u.name, factor: String(u.factor) })),
    allowDecimal: rm.allowDecimal !== false,
    priceUnit: def,
    // Saved before "Purchase price" existed (old import / form): its price only went into the
    // average cost, so start from that instead of showing an empty box
    purchasePrice: perUnit(rm.purchasePrice ?? rm.avgCost),
    purchasePriceFromAvg: rm.purchasePrice === undefined && rm.avgCost > 0,
    transferPrice: perUnit(rm.transferPrice),
    reconciliationPrice: perUnit(rm.reconciliationPrice),
    taxType: rm.taxType || 'GST',
    taxRate: numText(rm.taxRate),
    hsn: rm.hsn || '',
    exciseDuty: numText(rm.exciseDuty),
    openingUnit: def,
    restockLevel: rm.restockLevel && rm.restockLevel > 0 ? String(fromBase(rm, rm.restockLevel, restockUnit)) : '',
    restockUnit,
    parLevel: rm.parLevel && rm.parLevel > 0 ? String(fromBase(rm, rm.parLevel, parUnit)) : '',
    parUnit,
    normalLossPct: numText(rm.normalLossPct),
    closingStockOn: rm.closingStockOn || [],
    isExpiry: !!rm.isExpiry || !!rm.shelfLifeDays,
    shelfLifeDays: numText(rm.shelfLifeDays),
    favourite: !!rm.favourite,
    exclusive: !!rm.exclusive,
    active: rm.active !== false,
  };
};

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="rounded-sm border border-[#dfe6fb]">
    <div className="border-b border-[#dfe6fb] bg-[#f8faff] px-3 py-2">
      <h3 className="text-xs font-bold text-[#0f172b]">{title}</h3>
      {hint && <p className="text-[11px] text-[#5b6b86]">{hint}</p>}
    </div>
    <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">{children}</div>
  </section>
);

const Field: React.FC<{ label: string; required?: boolean; wide?: boolean; children: React.ReactNode; note?: string }> = ({
  label,
  required,
  wide,
  children,
  note,
}) => (
  <div className={wide ? 'sm:col-span-2' : undefined}>
    <label className="mb-1 block text-[11px] font-semibold text-[#0f172b]">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {note && <p className="mt-1 text-[11px] text-[#5b6b86]">{note}</p>}
  </div>
);

export interface RmFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  editingMaterial?: RawMaterial | null;
  existingMaterials: RawMaterial[];
  categories: string[];
  onSaved?: (id: string) => void;
}

export const RmFormModal: React.FC<RmFormModalProps> = ({
  isOpen,
  onClose,
  companyId,
  editingMaterial,
  existingMaterials,
  categories,
  onSaved,
}) => {
  const isEdit = !!editingMaterial;

  const [f, setF] = useState<FormState>(BLANK);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const categoryOptions = useMemo(() => {
    const s = new Set<string>(['General', ...categories]);
    if (f.category.trim()) s.add(f.category.trim());
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [categories, f.category]);

  const currentPurchaseUnit: PurchaseUnit | undefined = useMemo(() => {
    const name = f.pkgName.trim();
    const factor = Number(f.pkgFactor);
    if (!f.hasPackaging || !name || !(factor > 0)) return undefined;
    return { name, factor: round3(factor) };
  }, [f.hasPackaging, f.pkgName, f.pkgFactor]);

  const validOtherUnits: PurchaseUnit[] = useMemo(
    () =>
      f.otherUnits
        .filter((u) => u.name.trim() && Number(u.factor) > 0)
        .map((u) => ({ name: u.name.trim(), factor: round3(Number(u.factor)) })),
    [f.otherUnits],
  );

  const unitSource = useMemo(
    () => ({ baseUnit: f.baseUnit, purchaseUnit: currentPurchaseUnit, otherPurchaseUnits: validOtherUnits }),
    [f.baseUnit, currentPurchaseUnit, validOtherUnits],
  );
  const availableUnits = useMemo(() => unitsOf(unitSource), [unitSource]);
  const defaultUnit = currentPurchaseUnit?.name || f.baseUnit;

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setIsAddingCategory(false);
    setNewCategoryName('');
    setF(editingMaterial ? formOf(editingMaterial) : { ...BLANK, category: categories[0] || 'General' });
  }, [isOpen, editingMaterial, categories]);

  // Keep every unit picker on a unit that still exists after base / packaging changes
  useEffect(() => {
    const names = availableUnits.map((u) => u.name);
    setF((s) => {
      const fix = (u: string, fallback: string) => (names.includes(u) ? u : fallback);
      const next = {
        ...s,
        openingUnit: fix(s.openingUnit, s.baseUnit),
        priceUnit: fix(s.priceUnit, defaultUnit),
        restockUnit: fix(s.restockUnit, defaultUnit),
        parUnit: fix(s.parUnit, defaultUnit),
      };
      return next.openingUnit === s.openingUnit && next.priceUnit === s.priceUnit && next.restockUnit === s.restockUnit && next.parUnit === s.parUnit
        ? s
        : next;
    });
  }, [availableUnits, defaultUnit]);

  if (!isOpen) return null;

  const unitOptions = (prefix = '') =>
    availableUnits.map((u) => (
      <option key={u.name} value={u.name}>
        {prefix}
        {u.name}
      </option>
    ));

  const handleAddCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    setSavingCategory(true);
    try {
      await addRawMaterialCategory(companyId, trimmed);
      set('category', trimmed);
      setNewCategoryName('');
      setIsAddingCategory(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add category.');
    } finally {
      setSavingCategory(false);
    }
  };

  const updateOther = (key: string, patch: Partial<OtherUnitDraft>) =>
    set('otherUnits', f.otherUnits.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const name = f.name.trim();
    if (!name) return setError('Raw material name is required.');
    const duplicate = existingMaterials.find(
      (m) => m.id !== editingMaterial?.id && m.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) return setError(`"${duplicate.name}" already exists. Raw material names must be unique.`);

    if (f.hasPackaging) {
      if (!f.pkgName.trim()) return setError('Enter the purchase unit name (e.g. pkt, box, tin) or untick it.');
      if (!(Number(f.pkgFactor) > 0)) return setError('Purchase unit conversion must be greater than 0.');
    }
    const seenUnits = new Set(unitsOf({ baseUnit: f.baseUnit, purchaseUnit: currentPurchaseUnit }).map((u) => u.name.toLowerCase()));
    for (const u of f.otherUnits) {
      const n = u.name.trim();
      if (!n && !u.factor.trim()) continue; // empty row
      if (!n) return setError('Each other purchase unit needs a name.');
      if (!(Number(u.factor) > 0)) return setError(`"${n}": enter how many ${f.baseUnit} it holds.`);
      if (seenUnits.has(n.toLowerCase())) return setError(`Unit "${n}" is already used for this raw material.`);
      seenUnits.add(n.toLowerCase());
    }

    const numbers: [string, string][] = [
      ['Purchase price', f.purchasePrice], ['Transfer price', f.transferPrice], ['Reconciliation price', f.reconciliationPrice],
      ['Tax %', f.taxRate], ['Excise duty', f.exciseDuty], ['Rank', f.rank], ['Opening stock', f.openingStock],
      ['Minimum stock level', f.restockLevel], ['At par stock level', f.parLevel], ['Normal loss %', f.normalLossPct],
      ['Best before days', f.shelfLifeDays],
    ];
    for (const [label, v] of numbers) {
      if (v.trim() && !(Number(v) >= 0)) return setError(`${label} must be a number (0 or more).`);
    }

    const qty = (v: string, unit: string) => (Number(v) > 0 ? toBase(unitSource, Number(v), unit) : 0);
    const price = (v: string) => (Number(v) > 0 ? costPerBase(unitSource, Number(v), f.priceUnit) : 0);
    const category = f.category.trim() || 'General';
    const purchasePrice = price(f.purchasePrice);

    // Blank text is saved as '' and blank numbers as 0 so editing can clear a field
    const details = {
      subCategory: f.subCategory.trim(),
      brand: f.brand.trim(),
      shortCode: f.shortCode.trim(),
      gtin: f.gtin.trim(),
      description: f.description.trim(),
      rank: Number(f.rank) || 0,
      hsn: f.hsn.trim(),
      taxType: f.taxType,
      taxRate: Number(f.taxRate) || 0,
      exciseDuty: Number(f.exciseDuty) || 0,
      purchasePrice,
      transferPrice: price(f.transferPrice),
      reconciliationPrice: price(f.reconciliationPrice),
      otherPurchaseUnits: validOtherUnits,
      parLevel: qty(f.parLevel, f.parUnit),
      restockUnit: f.restockUnit,
      parUnit: f.parUnit,
      normalLossPct: Number(f.normalLossPct) || 0,
      closingStockOn: f.closingStockOn,
      exclusive: f.exclusive,
      isExpiry: f.isExpiry,
      shelfLifeDays: f.isExpiry ? Math.round(Number(f.shelfLifeDays) || 0) : 0,
      allowDecimal: f.allowDecimal,
    };
    const restockLevel = qty(f.restockLevel, f.restockUnit);

    setSubmitting(true);
    try {
      if (!categories.some((c) => c.toLowerCase() === category.toLowerCase())) {
        await addRawMaterialCategory(companyId, category);
      }
      if (isEdit && editingMaterial) {
        await updateRawMaterial(companyId, editingMaterial.id, {
          name,
          category,
          purchaseUnit: currentPurchaseUnit ?? { name: '', factor: 0 },
          restockLevel,
          favourite: f.favourite,
          active: f.active,
          ...details,
        });
        onSaved?.(editingMaterial.id);
      } else {
        const id = await createRawMaterial(companyId, {
          name,
          category,
          baseUnit: f.baseUnit,
          purchaseUnit: currentPurchaseUnit,
          openingStock: qty(f.openingStock, f.openingUnit),
          // the purchase price is also the starting average cost
          openingCost: purchasePrice,
          restockLevel: restockLevel > 0 ? restockLevel : undefined,
          favourite: f.favourite,
          active: f.active,
          ...details,
        });
        onSaved?.(id);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save raw material.');
    } finally {
      setSubmitting(false);
    }
  };

  const previewOpening = Number(f.openingStock) > 0 ? toBase(unitSource, Number(f.openingStock), f.openingUnit) : 0;
  const perBasePreview = Number(f.purchasePrice) > 0 ? costPerBase(unitSource, Number(f.purchasePrice), f.priceUnit) : 0;
  const avgNow =
    isEdit && editingMaterial && editingMaterial.avgCost > 0
      ? round2(editingMaterial.avgCost * toBase(unitSource, 1, f.priceUnit))
      : 0;

  return createPortal(
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/50 p-3 font-poppins md:p-4">
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-sm border border-[#dfe6fb] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#dfe6fb] bg-[#f5f7ff] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#e6eeff] text-[#155dfc]">
              <Package size={18} />
            </span>
            <div>
              <h2 className="text-base font-bold text-[#0f172b]">
                {isEdit ? 'Edit Raw Material' : 'Create New Raw Material'}
              </h2>
              <p className="text-xs text-[#5b6b86]">
                {isEdit
                  ? 'Stock changes go through Stock Entry / Purchase; everything else can be edited here'
                  : 'Same fields as the Excel import. Only Name and Consumption Unit are required'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1.5 text-[#5b6b86] transition hover:bg-[#e6eeff] hover:text-[#0f172b]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error && (
              <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</div>
            )}

            {/* 1. Basic details */}
            <Section title="Basic details">
              <Field label="Name" required>
                <input
                  type="text"
                  value={f.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="e.g. Tomato, Burger Bun, Cheese Slice"
                  autoFocus
                  required
                  className={INPUT}
                />
              </Field>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-[#0f172b]">Category</label>
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory((v) => !v)}
                    className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#155dfc] hover:underline"
                  >
                    <Plus size={12} />
                    {isAddingCategory ? 'Cancel' : 'Add new'}
                  </button>
                </div>
                {isAddingCategory ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="New category name"
                      className={INPUT}
                    />
                    <button
                      type="button"
                      disabled={savingCategory || !newCategoryName.trim()}
                      onClick={handleAddCategory}
                      aria-label="Add category"
                      className="shrink-0 rounded-sm bg-[#155dfc] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1447e6] disabled:opacity-50"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <select value={f.category} onChange={(e) => set('category', e.target.value)} className={INPUT}>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <Field label="Sub category">
                <input type="text" value={f.subCategory} onChange={(e) => set('subCategory', e.target.value)} placeholder="e.g. Leafy, Frozen" className={INPUT} />
              </Field>
              <Field label="Brand">
                <input type="text" value={f.brand} onChange={(e) => set('brand', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Barcode / short code">
                <input type="text" value={f.shortCode} onChange={(e) => set('shortCode', e.target.value)} placeholder="For quick search" className={INPUT} />
              </Field>
              <Field label="GTIN">
                <input type="text" value={f.gtin} onChange={(e) => set('gtin', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Rank" note="Sort order, lower first">
                <input type="number" step="1" min="0" value={f.rank} onChange={(e) => set('rank', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Description" wide>
                <textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} className={`${INPUT} resize-none`} />
              </Field>
            </Section>

            {/* 2. Units */}
            <Section title="Units" hint="Stock is kept in the consumption unit; recipes use it too">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold text-[#0f172b]">
                  Consumption unit <span className="text-red-500">*</span>
                </label>
                {isEdit ? (
                  <div className="flex items-center gap-2 rounded-sm border border-[#dfe6fb] bg-[#f5f7ff] px-3 py-2 text-xs text-[#5b6b86]">
                    <span className="rounded-sm bg-[#e6eeff] px-2 py-0.5 font-bold text-[#155dfc]">{f.baseUnit}</span>
                    <span>Fixed after creation so existing stock & ledger stay consistent.</span>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {BASE_UNITS.map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => set('baseUnit', u)}
                          className={`flex flex-col items-start rounded-sm border px-3 py-2 text-left transition ${
                            f.baseUnit === u ? 'border-[#155dfc] bg-[#e6eeff]/60' : 'border-[#dfe6fb] bg-white hover:bg-[#f5f7ff]'
                          }`}
                        >
                          <span className="text-sm font-bold text-[#0f172b]">{u}</span>
                          <span className="text-[11px] leading-tight text-[#5b6b86]">
                            {u === 'GRM' ? 'Weight (KG/GRM)' : u === 'ML' ? 'Volume (LTR/ML)' : 'Count (PC/DOZEN)'}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-[#5b6b86]">{UNIT_LABELS[f.baseUnit]}</p>
                  </>
                )}
              </div>

              <div className="sm:col-span-2 rounded-sm border border-[#dfe6fb] bg-[#f8faff] p-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#0f172b]">
                  <input type="checkbox" checked={f.hasPackaging} onChange={(e) => set('hasPackaging', e.target.checked)} className={CHECK} />
                  Purchase unit (bought in packs, e.g. 1 pkt = 10 PC, 1 BOX = 1000 GRM)
                </label>
                {f.hasPackaging && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Purchase unit">
                      <input type="text" value={f.pkgName} onChange={(e) => set('pkgName', e.target.value)} placeholder="e.g. pkt, BOX, tin" className={INPUT} />
                    </Field>
                    <Field label={`Conversion qty (${f.baseUnit} in 1 purchase unit)`}>
                      <input type="number" step="any" min="0.001" value={f.pkgFactor} onChange={(e) => set('pkgFactor', e.target.value)} placeholder="e.g. 12" className={INPUT} />
                    </Field>
                    {currentPurchaseUnit && (
                      <p className="sm:col-span-2 text-[11px] font-medium text-[#155dfc]">
                        1 {currentPurchaseUnit.name} = {currentPurchaseUnit.factor} {f.baseUnit}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold text-[#0f172b]">Other purchase units</label>
                <div className="space-y-2">
                  {f.otherUnits.map((u) => (
                    <div key={u.key} className="flex items-center gap-2">
                      <span className="text-xs text-[#5b6b86]">1</span>
                      <input
                        type="text"
                        value={u.name}
                        onChange={(e) => updateOther(u.key, { name: e.target.value })}
                        placeholder="e.g. Case"
                        aria-label="Other purchase unit name"
                        className={`${INPUT} max-w-[140px]`}
                      />
                      <span className="text-xs text-[#5b6b86]">=</span>
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        value={u.factor}
                        onChange={(e) => updateOther(u.key, { factor: e.target.value })}
                        placeholder="Quantity"
                        aria-label="Quantity in consumption units"
                        className={`${INPUT} max-w-[120px]`}
                      />
                      <span className="text-xs font-semibold text-[#5b6b86]">{f.baseUnit}</span>
                      <button
                        type="button"
                        onClick={() => set('otherUnits', f.otherUnits.filter((x) => x.key !== u.key))}
                        aria-label="Remove unit"
                        className="rounded-sm p-1.5 text-[#5b6b86] hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => set('otherUnits', [...f.otherUnits, { key: newKey(), name: '', factor: '' }])}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#155dfc] hover:underline"
                  >
                    <Plus size={12} /> Add another buying unit
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#0f172b] sm:col-span-2">
                <input type="checkbox" checked={f.allowDecimal} onChange={(e) => set('allowDecimal', e.target.checked)} className={CHECK} />
                Allow decimal quantity (e.g. 1.5)
              </label>
            </Section>

            {/* 3. Price & tax */}
            <Section title="Price & tax">
              <Field label="Prices are per" wide note={isEdit && avgNow > 0 ? `Average cost now: ₹${avgNow} per ${f.priceUnit} (moves with purchases)` : undefined}>
                <select value={f.priceUnit} onChange={(e) => set('priceUnit', e.target.value)} className={`${UNIT_SELECT} w-full sm:w-auto`}>
                  {unitOptions('1 ')}
                </select>
              </Field>
              <Field
                label="Purchase price (₹)"
                note={
                  f.purchasePriceFromAvg
                    ? 'Filled from the average cost (no purchase price was saved). Save to keep it.'
                    : perBasePreview > 0
                      ? `= ₹${perBasePreview} per ${f.baseUnit}${isEdit ? '' : ' · also the starting average cost'}`
                      : undefined
                }
              >
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={f.purchasePrice}
                  onChange={(e) => setF((s) => ({ ...s, purchasePrice: e.target.value, purchasePriceFromAvg: false }))}
                  placeholder="0.00"
                  className={INPUT}
                />
              </Field>
              <Field label="Transfer price (₹)">
                <input type="number" step="any" min="0" value={f.transferPrice} onChange={(e) => set('transferPrice', e.target.value)} placeholder="0.00" className={INPUT} />
              </Field>
              <Field label="Reconciliation price (₹)">
                <input type="number" step="any" min="0" value={f.reconciliationPrice} onChange={(e) => set('reconciliationPrice', e.target.value)} placeholder="0.00" className={INPUT} />
              </Field>
              <Field label="Excise duty (₹ amount)">
                <input type="number" step="any" min="0" value={f.exciseDuty} onChange={(e) => set('exciseDuty', e.target.value)} placeholder="0" className={INPUT} />
              </Field>
              <Field label="Tax type">
                <select value={f.taxType} onChange={(e) => set('taxType', e.target.value)} className={INPUT}>
                  {[...new Set([...TAX_TYPES, f.taxType])].filter(Boolean).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tax (%)">
                <input type="number" step="any" min="0" value={f.taxRate} onChange={(e) => set('taxRate', e.target.value)} placeholder="e.g. 5" disabled={f.taxType === 'None'} className={INPUT} />
              </Field>
              <Field label="HSN code">
                <input type="text" value={f.hsn} onChange={(e) => set('hsn', e.target.value)} className={INPUT} />
              </Field>
            </Section>

            {/* 4. Stock */}
            <Section title="Stock levels">
              {!isEdit && (
                <Field label="Opening stock (kitchen)" wide note={previewOpening > 0 ? `= ${previewOpening.toLocaleString('en-IN')} ${f.baseUnit}` : undefined}>
                  <div className="flex gap-1.5 sm:max-w-sm">
                    <input type="number" step="any" min="0" value={f.openingStock} onChange={(e) => set('openingStock', e.target.value)} placeholder="0" className={INPUT} />
                    <select value={f.openingUnit} onChange={(e) => set('openingUnit', e.target.value)} className={UNIT_SELECT}>
                      {unitOptions()}
                    </select>
                  </div>
                </Field>
              )}
              <Field label="Minimum stock level" note="Low-stock alert below this">
                <div className="flex gap-1.5">
                  <input type="number" step="any" min="0" value={f.restockLevel} onChange={(e) => set('restockLevel', e.target.value)} placeholder="Optional" className={INPUT} />
                  <select value={f.restockUnit} onChange={(e) => set('restockUnit', e.target.value)} className={UNIT_SELECT} aria-label="Minimum stock level unit">
                    {unitOptions()}
                  </select>
                </div>
              </Field>
              <Field label="At par stock level" note="Refill up to this">
                <div className="flex gap-1.5">
                  <input type="number" step="any" min="0" value={f.parLevel} onChange={(e) => set('parLevel', e.target.value)} placeholder="Optional" className={INPUT} />
                  <select value={f.parUnit} onChange={(e) => set('parUnit', e.target.value)} className={UNIT_SELECT} aria-label="At par stock level unit">
                    {unitOptions()}
                  </select>
                </div>
              </Field>
              <Field label="Normal loss (%)">
                <input type="number" step="any" min="0" value={f.normalLossPct} onChange={(e) => set('normalLossPct', e.target.value)} placeholder="e.g. 2" className={INPUT} />
              </Field>
              <div>
                <span className="mb-1 block text-[11px] font-semibold text-[#0f172b]">Closing stock calculated on</span>
                <div className="flex flex-wrap gap-3 pt-1">
                  {CLOSING_PERIODS.map((p) => (
                    <label key={p} className="flex cursor-pointer items-center gap-1.5 text-xs text-[#0f172b]">
                      <input
                        type="checkbox"
                        checked={f.closingStockOn.includes(p)}
                        onChange={(e) =>
                          set('closingStockOn', e.target.checked ? [...f.closingStockOn, p] : f.closingStockOn.filter((x) => x !== p))
                        }
                        className={CHECK}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
            </Section>

            {/* 5. Expiry & status */}
            <Section title="Expiry & status">
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#0f172b]">
                  <input type="checkbox" checked={f.isExpiry} onChange={(e) => set('isExpiry', e.target.checked)} className={CHECK} />
                  Is expiry (goes bad)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={f.shelfLifeDays}
                    onChange={(e) => set('shelfLifeDays', e.target.value)}
                    placeholder="Best before"
                    disabled={!f.isExpiry}
                    aria-label="Best before in days"
                    className={`${INPUT} max-w-[140px]`}
                  />
                  <span className="text-xs text-[#5b6b86]">days</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#0f172b]">
                  <input type="checkbox" checked={f.favourite} onChange={(e) => set('favourite', e.target.checked)} className={CHECK} />
                  <Star size={14} className={f.favourite ? 'fill-amber-400 text-amber-500' : 'text-[#5b6b86]'} />
                  Set as favourite
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#0f172b]">
                  <input type="checkbox" checked={f.exclusive} onChange={(e) => set('exclusive', e.target.checked)} className={CHECK} />
                  Exclusive to this restaurant
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#0f172b]">
                  <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} className={CHECK} />
                  Active (available in recipes & entries)
                </label>
              </div>
            </Section>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 border-t border-[#dfe6fb] px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-[#dfe6fb] bg-white px-4 py-2 text-xs font-semibold text-[#5b6b86] transition hover:bg-[#f5f7ff] hover:text-[#0f172b]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-sm bg-[#155dfc] px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1447e6] disabled:opacity-50"
            >
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Raw Material'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export interface RmQuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  existingMaterials: RawMaterial[];
  categories: string[];
  onCreated?: (newMaterial: { id: string; name: string; category: string; baseUnit: BaseUnit }) => void;
}

export const RmQuickAddModal: React.FC<RmQuickAddModalProps> = ({
  isOpen,
  onClose,
  companyId,
  existingMaterials,
  categories,
  onCreated,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('General');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [baseUnit, setBaseUnit] = useState<BaseUnit>('GRM');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(['General', ...categories]);
    if (category.trim()) set.add(category.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [categories, category]);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setCategory(categories[0] || 'General');
    setIsAddingCategory(false);
    setNewCategoryName('');
    setBaseUnit('GRM');
    setError(null);
  }, [isOpen, categories]);

  if (!isOpen) return null;

  const saveQuick = async (keepOpen: boolean) => {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter a raw material name.');
      return;
    }
    const duplicate = existingMaterials.find(
      (m) => m.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicate) {
      setError(`"${duplicate.name}" already exists.`);
      return;
    }

    const finalCat = (isAddingCategory ? newCategoryName : category).trim() || 'General';
    setSubmitting(true);
    try {
      if (!categories.some((c) => c.toLowerCase() === finalCat.toLowerCase())) {
        await addRawMaterialCategory(companyId, finalCat);
      }
      const id = await createRawMaterial(companyId, {
        name: trimmedName,
        category: finalCat,
        baseUnit,
      });
      onCreated?.({ id, name: trimmedName, category: finalCat, baseUnit });
      if (keepOpen) {
        setName('');
        setCategory(finalCat);
        setIsAddingCategory(false);
        setNewCategoryName('');
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create raw material.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveQuick(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/50 p-3 font-poppins">
      <div className="w-full max-w-md overflow-hidden rounded-sm border border-[#dfe6fb] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#dfe6fb] bg-[#f5f7ff] px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-[#0f172b]">Quick Add Raw Material</h3>
            <p className="text-[11px] text-[#5b6b86]">Name, category & base unit only</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-[#5b6b86] hover:bg-[#e6eeff] hover:text-[#0f172b]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 p-4">
          {error && (
            <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#0f172b]">
              Raw Material Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mozzarella Cheese, Mayonnaise"
              autoFocus
              required
              className="w-full rounded-sm border border-[#dfe6fb] bg-white px-3 py-2 text-sm text-[#0f172b] outline-none focus:border-[#155dfc] focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold text-[#0f172b]">Category</label>
              <button
                type="button"
                onClick={() => setIsAddingCategory((v) => !v)}
                className="text-[11px] font-semibold text-[#155dfc] hover:underline"
              >
                {isAddingCategory ? 'Choose existing' : '+ New category'}
              </button>
            </div>
            {isAddingCategory ? (
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Enter new category name"
                className="w-full rounded-sm border border-[#155dfc] bg-white px-3 py-2 text-sm text-[#0f172b] outline-none"
              />
            ) : (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-sm border border-[#dfe6fb] bg-white px-3 py-2 text-sm text-[#0f172b] outline-none focus:border-[#155dfc]"
              >
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#0f172b]">
              Base Unit <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {BASE_UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setBaseUnit(u)}
                  className={`rounded-sm border py-2 text-center text-xs font-bold transition ${
                    baseUnit === u
                      ? 'border-[#155dfc] bg-[#e6eeff] text-[#155dfc]'
                      : 'border-[#dfe6fb] bg-white text-[#5b6b86] hover:bg-[#f5f7ff]'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#dfe6fb] pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-[#dfe6fb] bg-white px-3 py-1.5 text-xs font-semibold text-[#5b6b86] hover:bg-[#f5f7ff]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => saveQuick(true)}
              className="rounded-sm border border-[#155dfc] bg-[#e6eeff] px-3 py-1.5 text-xs font-semibold text-[#155dfc] hover:bg-blue-100 disabled:opacity-50"
            >
              Save & Add Another
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-sm bg-[#155dfc] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1447e6] disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};
