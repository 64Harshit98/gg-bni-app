import { useState, useEffect } from 'react';
import { SHOP_ID, SHOP_NAME, type Godown } from '../Pages/hooks/useStockTransfer';
import { GodownModal } from './GodownModal'; 
import { db } from '../lib/Firebase'; 
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export interface AssignableItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
}

export interface GodownSplit {
  godownId: string;
  quantity: number;
}

interface Props {
  isOpen: boolean;
  items: AssignableItem[];
  godowns: Godown[];
  companyId?: string;
  onConfirm: (assignments: Record<string, GodownSplit[]>) => void; // { [cartItemId]: split[] }
  onClose: () => void;
}

const genId = () => Math.random().toString(36).slice(2, 10);

/**
 * Shown right after "Pay Now" / "Update" is clicked on the Purchase page,
 * before the PaymentDrawer opens. Lets the user split each purchased item's
 * quantity across Shop (POS-sellable) and/or one or more godowns — e.g. 10
 * units purchased, 5 to Shop and 5 to Warehouse. Mirrors the Transfer Stock
 * modal's split-row pattern. Shop and godown inventory are tracked
 * completely separately: only Shop stock is ever deducted by Sales/POS.
 */
export const PurchaseGodownAssignModal = ({ isOpen, items, godowns, companyId, onConfirm, onClose }: Props) => {
  // rowId -> split, grouped per item id
  const [splitsByItem, setSplitsByItem] = useState<Record<string, (GodownSplit & { rowId: string })[]>>({});
  const [error, setError] = useState('');

  // 👈 NEW — godowns created from inside this modal, before the parent's
  // realtime godowns list catches up. Merged into every lookup below so
  // the new godown is selectable immediately.
  const [localGodowns, setLocalGodowns] = useState<Godown[]>([]);
  const [isAddGodownOpen, setIsAddGodownOpen] = useState(false);
  const allGodowns = [...godowns, ...localGodowns.filter(lg => !godowns.some(g => g.id === lg.id))];

  useEffect(() => {
    if (isOpen) {
      // Default every item to a single Shop row for its full quantity —
      // same inventory that was updated before this feature existed.
      const initial: Record<string, (GodownSplit & { rowId: string })[]> = {};
      items.forEach(i => {
        initial[i.id] = [{ rowId: genId(), godownId: SHOP_ID, quantity: i.quantity }];
      });
      setSplitsByItem(initial);
      setError('');
    }
  }, [isOpen, items]);

  if (!isOpen) return null;

  const getRemaining = (itemId: string, excludeRowId?: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return 0;
    const used = (splitsByItem[itemId] || [])
      .filter(r => r.rowId !== excludeRowId)
      .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    return item.quantity - used;
  };

  const addSplitRow = (itemId: string) => {
    const remaining = getRemaining(itemId);
    if (remaining <= 0) return;
    setSplitsByItem(prev => ({
      ...prev,
      [itemId]: [...(prev[itemId] || []), { rowId: genId(), godownId: '', quantity: remaining }],
    }));
  };

  const removeSplitRow = (itemId: string, rowId: string) => {
    setSplitsByItem(prev => {
      const rows = (prev[itemId] || []).filter(r => r.rowId !== rowId);
      // Never leave an item with zero rows — fall back to a single Shop row.
      if (rows.length === 0) {
        const item = items.find(i => i.id === itemId);
        rows.push({ rowId: genId(), godownId: SHOP_ID, quantity: item?.quantity || 0 });
      }
      return { ...prev, [itemId]: rows };
    });
  };

  const updateRowGodown = (itemId: string, rowId: string, godownId: string) => {
    setSplitsByItem(prev => ({
      ...prev,
      [itemId]: (prev[itemId] || []).map(r => r.rowId === rowId ? { ...r, godownId } : r),
    }));
  };

  const updateRowQuantity = (itemId: string, rowId: string, quantity: string) => {
    const n = quantity === '' ? 0 : Number(quantity);
    if (isNaN(n)) return;
    setSplitsByItem(prev => ({
      ...prev,
      [itemId]: (prev[itemId] || []).map(r => r.rowId === rowId ? { ...r, quantity: n } : r),
    }));
  };

  const godownName = (id: string) => id === SHOP_ID ? SHOP_NAME : (allGodowns.find(g => g.id === id)?.name || ''); // 👈 CHANGED: godowns -> allGodowns

  // 👈 NEW
  const handleCreateGodown = async (data: { name: string; location?: string }) => {
    if (!companyId) {
      setError('Cannot add godown: missing company information.');
      return;
    }
    const godownsRef = collection(db, 'companies', companyId, 'godowns');
    const docRef = await addDoc(godownsRef, {
      name: data.name,
      location: data.location || '',
      createdAt: serverTimestamp(),
    });
    const newGodown: Godown = { id: docRef.id, name: data.name, location: data.location || '' } as Godown;
    setLocalGodowns(prev => [...prev, newGodown]);
    setIsAddGodownOpen(false);
  };

  const handleConfirm = () => {
    // Validate: every row has a destination, quantities are positive, and
    // each item's rows sum exactly to its purchased quantity.
    for (const item of items) {
      const rows = splitsByItem[item.id] || [];
      const missingDestination = rows.some(r => !r.godownId);
      if (missingDestination) {
        setError(`Select a destination for every row of "${item.name}".`);
        return;
      }
      const invalidQty = rows.some(r => !r.quantity || r.quantity <= 0);
      if (invalidQty) {
        setError(`Enter a valid quantity for every row of "${item.name}".`);
        return;
      }
      const total = rows.reduce((s, r) => s + r.quantity, 0);
      if (total !== item.quantity) {
        setError(`"${item.name}": split quantities (${total}) must add up to purchased quantity (${item.quantity}).`);
        return;
      }
    }
    setError('');
    const result: Record<string, GodownSplit[]> = {};
    items.forEach(item => {
      result[item.id] = (splitsByItem[item.id] || []).map(({ godownId, quantity }) => ({ godownId, quantity }));
    });
    onConfirm(result);
  };

  const totalGodownUnits = items.reduce((sum, item) => {
    const rows = splitsByItem[item.id] || [];
    return sum + rows.filter(r => r.godownId && r.godownId !== SHOP_ID).reduce((s, r) => s + (r.quantity || 0), 0);
  }, 0);
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white w-full max-w-lg rounded-sm shadow-xl p-5 max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="text-lg font-bold text-gray-800">Assign Godowns</h2>
          <button
            onClick={() => setIsAddGodownOpen(true)}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 bg-blue-50 px-2.5 py-1 rounded-sm whitespace-nowrap flex-shrink-0"
          >
            + Add Godown
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Choose where each item is being stocked — split the purchased quantity across Shop and one or more godowns if needed. "Shop" is your regular sellable inventory — the same stock used for Sales/POS.
        </p>

        {allGodowns.length === 0 && (
          <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-sm p-4 mb-4">
            No godowns set up yet. Tap "+ Add Godown" below to create one, or continue and everything will go to Shop.
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3">
          {items.map(item => {
            const rows = splitsByItem[item.id] || [];
            const remaining = getRemaining(item.id);
            return (
              <div key={item.id} className="border border-gray-100 rounded-sm p-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">Total Qty: {item.quantity} {item.unit || ''}</p>
                  </div>
                  {allGodowns.length > 0 && (
                    <button
                      onClick={() => addSplitRow(item.id)}
                      disabled={remaining <= 0}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      + Split
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {rows.map(row => (
                    <div key={row.rowId} className="flex items-center gap-1.5">
                      <select
                        value={row.godownId}
                        onChange={e => updateRowGodown(item.id, row.rowId, e.target.value)}
                        className="flex-1 border rounded-sm p-1.5 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={SHOP_ID}>🏪 {SHOP_NAME}</option>
                        {allGodowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      <input
                        type="number"
                        value={row.quantity === 0 ? '' : row.quantity}
                        onChange={e => updateRowQuantity(item.id, row.rowId, e.target.value)}
                        placeholder="Qty"
                        className="w-20 border rounded-sm p-1.5 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {rows.length > 1 && (
                        <button
                          onClick={() => removeSplitRow(item.id, row.rowId)}
                          className="text-red-400 hover:text-red-600 text-xs font-bold px-1"
                          title="Remove row"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {rows.length > 1 && (
                  <p className={`text-[11px] mt-1.5 ${remaining === 0 ? 'text-green-600' : 'text-orange-500'}`}>
                    {remaining === 0
                      ? `✓ Fully split (${rows.map(r => `${godownName(r.godownId) || '?'}: ${r.quantity}`).join(', ')})`
                      : `${remaining} unit(s) not yet assigned`}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="text-red-500 text-xs mt-3">{error}</p>}

        <p className="text-xs text-gray-400 mt-3">{totalGodownUnits} of {totalUnits} total units going to a godown; the rest go to Shop.</p>

        <div className="flex gap-2 mt-4 pt-3 border-t">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-sm border text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2 rounded-sm text-white text-sm font-semibold bg-blue-600 hover:bg-blue-700"
          >
            Continue to Payment
          </button>
        </div>
      </div>

      {/* 👈 NEW — lets the user create a godown without leaving this modal */}
      <GodownModal
        isOpen={isAddGodownOpen}
        onClose={() => setIsAddGodownOpen(false)}
        onSave={handleCreateGodown}
        theme="blue"
      />
    </div>
  );
};