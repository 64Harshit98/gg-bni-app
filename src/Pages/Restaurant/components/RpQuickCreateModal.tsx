import React, { useState } from 'react';
import { X, Plus, Package } from 'lucide-react';
import { BASE_UNITS, round3 } from '../../../lib/restaurant/units';
import { addRawMaterialCategory, createRawMaterial } from '../../../lib/restaurant/stockApi';
import type { BaseUnit, PurchaseUnit, RawMaterialCategory } from '../../../lib/restaurant/types';

export interface RpQuickCreatedMaterial {
  id: string;
  name: string;
  category: string;
  baseUnit: BaseUnit;
  purchaseUnit?: PurchaseUnit;
}

interface RpQuickCreateModalProps {
  isOpen: boolean;
  companyId: string;
  categories: RawMaterialCategory[];
  initialName?: string;
  onClose: () => void;
  onCreated: (material: RpQuickCreatedMaterial) => void;
}

const INPUT_CLS =
  'w-full h-10 px-3 text-sm rounded-sm border border-[#dfe6fb] bg-white text-[#0f172b] placeholder:text-[#5b6b86] focus:outline-none focus:border-[#155dfc] focus:ring-2 focus:ring-[#155dfc]/20';
const LABEL_CLS = 'block text-xs font-semibold text-[#0f172b] mb-1';

export const RpQuickCreateModal: React.FC<RpQuickCreateModalProps> = ({
  isOpen,
  companyId,
  categories,
  initialName = '',
  onClose,
  onCreated,
}) => {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(categories[0]?.name || 'General');
  const [customCategory, setCustomCategory] = useState('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [baseUnit, setBaseUnit] = useState<BaseUnit>('GRM');
  const [hasPurchaseUnit, setHasPurchaseUnit] = useState(false);
  const [purchaseUnitName, setPurchaseUnitName] = useState('');
  const [purchaseUnitFactor, setPurchaseUnitFactor] = useState('');
  const [restockLevel, setRestockLevel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setCategory(categories[0]?.name || 'General');
      setCustomCategory('');
      setIsCustomCategory(false);
      setBaseUnit('GRM');
      setHasPurchaseUnit(false);
      setPurchaseUnitName('');
      setPurchaseUnitFactor('');
      setRestockLevel('');
      setError(null);
    }
  }, [isOpen, initialName, categories]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Raw material name is required.');
      return;
    }

    const finalCategory = (isCustomCategory ? customCategory : category).trim() || 'General';

    let purchaseUnit: PurchaseUnit | undefined;
    if (hasPurchaseUnit) {
      const pName = purchaseUnitName.trim();
      const pFactor = Number(purchaseUnitFactor);
      if (!pName) {
        setError('Enter a packaging unit name (e.g. pkt, box, bag).');
        return;
      }
      if (!pFactor || pFactor <= 0) {
        setError(`Enter how many ${baseUnit} are in 1 ${pName}.`);
        return;
      }
      purchaseUnit = { name: pName, factor: round3(pFactor) };
    }

    setSaving(true);
    setError(null);
    try {
      if (isCustomCategory && customCategory.trim()) {
        await addRawMaterialCategory(companyId, finalCategory);
      }
      const id = await createRawMaterial(companyId, {
        name: trimmedName,
        category: finalCategory,
        baseUnit,
        purchaseUnit,
        restockLevel: Number(restockLevel) > 0 ? round3(Number(restockLevel)) : undefined,
      });
      onCreated({
        id,
        name: trimmedName,
        category: finalCategory,
        baseUnit,
        purchaseUnit,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create raw material.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#0f172b]/50 p-4 font-poppins"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-sm border border-[#dfe6fb] bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#dfe6fb] bg-[#eef2ff] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#155dfc]/10 text-[#155dfc]">
              <Package size={18} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[#0f172b]">New Raw Material</h3>
              <p className="text-[11px] text-[#5b6b86]">Add directly to kitchen inventory</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-sm text-[#5b6b86] hover:bg-white hover:text-[#0f172b]"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          {error && (
            <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className={LABEL_CLS}>Raw Material Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Burger Patty, Tomato, Mozzarella"
              className={INPUT_CLS}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[#0f172b]">Category</label>
                <button
                  type="button"
                  onClick={() => setIsCustomCategory((v) => !v)}
                  className="text-[11px] font-medium text-[#155dfc] hover:underline"
                >
                  {isCustomCategory ? 'Pick existing' : '+ New'}
                </button>
              </div>
              {isCustomCategory ? (
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="e.g. Vegetables, Dairy"
                  className={INPUT_CLS}
                />
              ) : (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="General">General</option>
                  {categories
                    .filter((c) => c.name.toLowerCase() !== 'general')
                    .map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                </select>
              )}
            </div>

            <div>
              <label className={LABEL_CLS}>Base Unit *</label>
              <select
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value as BaseUnit)}
                className={INPUT_CLS}
              >
                {BASE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u === 'GRM' ? 'GRM (Grams / KG)' : u === 'ML' ? 'ML (Millilitres / LTR)' : 'PC (Pieces / Dozen)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-sm border border-[#dfe6fb] bg-[#f8faff] p-3 space-y-2.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-[#0f172b] cursor-pointer">
              <input
                type="checkbox"
                checked={hasPurchaseUnit}
                onChange={(e) => setHasPurchaseUnit(e.target.checked)}
                className="h-4 w-4 rounded-sm accent-[#155dfc]"
              />
              Has custom packaging unit (e.g. 1 pkt = 10 PC)
            </label>

            {hasPurchaseUnit && (
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                    Unit Name (e.g. pkt, bag)
                  </label>
                  <input
                    type="text"
                    value={purchaseUnitName}
                    onChange={(e) => setPurchaseUnitName(e.target.value)}
                    placeholder="pkt"
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                    1 {purchaseUnitName.trim() || 'unit'} = how many {baseUnit}?
                  </label>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    value={purchaseUnitFactor}
                    onChange={(e) => setPurchaseUnitFactor(e.target.value)}
                    placeholder="e.g. 10"
                    className={INPUT_CLS}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={LABEL_CLS}>Restock Alert Level (in {baseUnit}, optional)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={restockLevel}
              onChange={(e) => setRestockLevel(e.target.value)}
              placeholder={`e.g. 500 ${baseUnit}`}
              className={INPUT_CLS}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#dfe6fb]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-9 px-3.5 rounded-sm border border-[#dfe6fb] bg-white text-xs font-medium text-[#0f172b] hover:bg-[#eef2ff]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-sm bg-[#155dfc] text-xs font-semibold text-white hover:bg-[#1447e6] disabled:opacity-50"
            >
              <Plus size={15} />
              {saving ? 'Creating...' : 'Create Raw Material'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
