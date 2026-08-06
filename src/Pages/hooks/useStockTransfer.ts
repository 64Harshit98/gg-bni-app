import { useState, useEffect, useMemo } from 'react';
import {
  collection, addDoc, deleteDoc, updateDoc, doc,
  onSnapshot, query, orderBy, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/Firebase';

// ============================================================
// TYPES
// ============================================================
export interface Godown {
  id: string;
  name: string;
  location?: string;
  isActive: boolean;
  createdAt: number;
}

export interface StockTransfer {
  id: string;
  itemId: string;
  itemName: string;
  unit?: string;
  quantity: number;
  type: 'purchase-in' | 'transfer' | 'adjustment';
  fromGodownId?: string;
  fromGodownName?: string;
  toGodownId: string;
  toGodownName: string;
  date: number; // ms timestamp of the transfer/purchase date
  remarks?: string;
  refInvoice?: string;
  createdAt: number;
}

export interface GodownStockRow {
  godownId: string;
  godownName: string;
  itemId: string;
  itemName: string;
  unit?: string;
  quantity: number;
}

// Pseudo-godown-id representing the shop's own sellable (POS) inventory.
// This is what Sales/POS deducts from — never a real godown document.
export const SHOP_ID = '__shop__';
export const SHOP_NAME = 'Shop';

// A minimal shape of what we need from the "items" collection.

// A minimal shape of what we need from the "items" collection.
interface ItemDoc {
  id: string;
  name: string;
  unit?: string;
  stock?: number;
  godownStock?: Record<string, number>;
}

// ============================================================
// 1) GODOWN MASTER (CRUD)
// ============================================================
export function useGodowns(companyId: string | undefined) {
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, 'companies', companyId, 'godowns'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q,
      (snap) => {
        setGodowns(snap.docs.map(d => ({ id: d.id, ...d.data() } as Godown)));
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); },
    );
    return unsub;
  }, [companyId]);

  const addGodown = async (companyId: string, data: { name: string; location?: string }) => {
    await addDoc(collection(db, 'companies', companyId, 'godowns'), {
      name: data.name.trim(),
      location: data.location?.trim() || '',
      isActive: true,
      createdAt: Date.now(),
    });
  };

  const updateGodown = async (companyId: string, id: string, data: Partial<Pick<Godown, 'name' | 'location' | 'isActive'>>) => {
    await updateDoc(doc(db, 'companies', companyId, 'godowns', id), data);
  };

  const deleteGodown = async (companyId: string, id: string) => {
    await deleteDoc(doc(db, 'companies', companyId, 'godowns', id));
  };

  return { godowns, loading, error, addGodown, updateGodown, deleteGodown };
}

// ============================================================
// 2) STOCK TRANSFER HISTORY + ACTIONS
// ============================================================
export function useStockTransfers(companyId: string | undefined) {
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, 'companies', companyId, 'stockTransfers'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q,
      (snap) => {
        setTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() } as StockTransfer)));
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); },
    );
    return unsub;
  }, [companyId]);

  /**
   * Manually move stock of one item from one godown to another.
   * Validates that enough quantity exists in the source godown.
   */
  const transferStock = async (companyId: string, payload: {
    itemId: string;
    itemName: string;
    unit?: string;
    fromGodownId: string;
    fromGodownName: string;
    toGodownId: string;
    toGodownName: string;
    quantity: number;
    date: number;
    remarks?: string;
  }) => {
    const isFromShop = payload.fromGodownId === SHOP_ID;
    const isToShop = payload.toGodownId === SHOP_ID;

    if (payload.fromGodownId === payload.toGodownId) {
      throw new Error('Source and destination cannot be the same.');
    }
    if (!payload.quantity || payload.quantity <= 0) {
      throw new Error('Enter a valid quantity.');
    }

    await runTransaction(db, async (tx) => {
      const itemRef = doc(db, 'companies', companyId, 'items', payload.itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) throw new Error('Item not found.');

      const data = itemSnap.data() as ItemDoc;
      const godownStock = { ...(data.godownStock || {}) };
      const shopQty = data.stock || 0;

      // Shop inventory lives on item.stock; godown inventory lives on godownStock.<id>.
      // The two are independent totals now — never derived from one another.
      const fromQty = isFromShop ? shopQty : (godownStock[payload.fromGodownId] || 0);

      if (fromQty < payload.quantity) {
        throw new Error(`Insufficient stock in ${payload.fromGodownName}. Available: ${fromQty}`);
      }

      const updatePayload: Record<string, any> = {
        // Critical: syncItems()/listenToItems() only re-fetch items whose
        // updatedAt changed since last sync. Without this, a transfer updates
        // Firestore correctly but local caches keep showing stale stock
        // indefinitely (until some other write happens to touch this item).
        updatedAt: serverTimestamp(),
      };

      // Decrement source
      if (isFromShop) {
        updatePayload.stock = shopQty - payload.quantity;
      } else {
        updatePayload[`godownStock.${payload.fromGodownId}`] = fromQty - payload.quantity;
      }

      // Increment destination
      if (isToShop) {
        updatePayload.stock = shopQty + payload.quantity;
      } else {
        const toQty = godownStock[payload.toGodownId] || 0;
        updatePayload[`godownStock.${payload.toGodownId}`] = toQty + payload.quantity;
      }

      tx.update(itemRef, updatePayload);

      const transferRef = doc(collection(db, 'companies', companyId, 'stockTransfers'));
      tx.set(transferRef, {
        itemId: payload.itemId,
        itemName: payload.itemName,
        unit: payload.unit || '',
        quantity: payload.quantity,
        type: 'transfer',
        fromGodownId: payload.fromGodownId,
        fromGodownName: payload.fromGodownName,
        toGodownId: payload.toGodownId,
        toGodownName: payload.toGodownName,
        date: payload.date,
        remarks: payload.remarks || '',
        createdAt: Date.now(),
      });
    });
  };

  const deleteTransferRecord = async (companyId: string, id: string) => {
    await runTransaction(db, async (tx) => {
      const transferRef = doc(db, 'companies', companyId, 'stockTransfers', id);
      const transferSnap = await tx.get(transferRef);
      if (!transferSnap.exists()) throw new Error('Transfer record not found.');
      const t = transferSnap.data() as StockTransfer;

      const itemRef = doc(db, 'companies', companyId, 'items', t.itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) throw new Error('Item not found — cannot reverse stock.');

      const data = itemSnap.data() as ItemDoc;
      const godownStock = { ...(data.godownStock || {}) };
      const shopQty = data.stock || 0;

      // Legacy records (from before the Shop/godown split existed) used
      // '__unassigned__' to mean "stock that lived on item.stock but wasn't
      // tracked per-godown" — conceptually the same bucket as today's Shop.
      // Firestore also rejects field paths starting/ending with "__", so this
      // value must never be written as a godownStock.<id> key.
      const LEGACY_UNASSIGNED = '__unassigned__';
      const isFromShop = t.fromGodownId === SHOP_ID || t.fromGodownId === LEGACY_UNASSIGNED;
      const isToShop = t.toGodownId === SHOP_ID || t.toGodownId === LEGACY_UNASSIGNED;

      // Same reason as transferStock — without touching updatedAt, local
      // caches (syncItems/listenToItems) keep serving the pre-reversal stock.
      const updatePayload: Record<string, any> = {
        updatedAt: serverTimestamp(),
      };

      // Reverse the destination increment.
      if (isToShop) {
        updatePayload.stock = shopQty - t.quantity;
      } else {
        const toQty = godownStock[t.toGodownId] || 0;
        updatePayload[`godownStock.${t.toGodownId}`] = toQty - t.quantity;
      }

      // Reverse the source decrement — only applies to manual transfers,
      // since a 'purchase-in' record has no fromGodownId (stock was newly added,
      // not moved from elsewhere).
      if (t.type === 'transfer' && t.fromGodownId) {
        if (isFromShop) {
          // Guard against double-adjusting `stock` if source and destination
          // both happen to resolve to the same field (shouldn't normally occur).
          const baseShopQty = updatePayload.stock !== undefined ? updatePayload.stock : shopQty;
          updatePayload.stock = baseShopQty + t.quantity;
        } else {
          const fromQty = godownStock[t.fromGodownId] || 0;
          updatePayload[`godownStock.${t.fromGodownId}`] = fromQty + t.quantity;
        }
      }

      tx.update(itemRef, updatePayload);
      tx.delete(transferRef);
    });
  };

  return { transfers, loading, error, transferStock, deleteTransferRecord };
}

// ============================================================
// 3) CURRENT GODOWN-WISE STOCK SUMMARY (derived from items collection)
// ============================================================
export function useGodownStock(companyId: string | undefined, godowns: Godown[]) {
  const [items, setItems] = useState<ItemDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const q = collection(db, 'companies', companyId, 'items');
    const unsub = onSnapshot(q,
      (snap) => {
        setItems(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); },
    );
    return unsub;
  }, [companyId]);

  const godownMap = useMemo(() => {
    const m: Record<string, string> = {};
    godowns.forEach(g => { m[g.id] = g.name; });
    return m;
  }, [godowns]);

  const stockRows: GodownStockRow[] = useMemo(() => {
    const rows: GodownStockRow[] = [];
    items.forEach(item => {
      // Shop (POS-sellable) inventory — this is what Sales/POS deducts from.
      const shopQty = item.stock || 0;
      if (shopQty > 0) {
        rows.push({
          godownId: SHOP_ID,
          godownName: SHOP_NAME,
          itemId: item.id,
          itemName: item.name,
          unit: item.unit,
          quantity: shopQty,
        });
      }

      // Godown inventory — separate from Shop, not sellable until transferred in.
      const gs = item.godownStock || {};
      Object.entries(gs).forEach(([gid, qtyRaw]) => {
        const qty = Number(qtyRaw) || 0;
        if (qty > 0) {
          rows.push({
            godownId: gid,
            godownName: godownMap[gid] || 'Unknown Godown',
            itemId: item.id,
            itemName: item.name,
            unit: item.unit,
            quantity: qty,
          });
        }
      });
    });
    return rows;
  }, [items, godownMap]);

  return { stockRows, items, loading, error };
}

// /**
//  * Helper used by the Purchase page: for a given item + godown, increments
//  * godownStock on the item doc AND writes a 'purchase-in' transfer record,
//  * inside the SAME Firestore transaction that already updates item.stock.
//  * Call this from within your existing runTransaction() block in PurchasePage.
//  */
// export function applyPurchaseGodownIn(
//   tx: { update: Function; set: Function },
//   companyId: string,
//   itemRef: any,
//   currentGodownStock: Record<string, number> | undefined,
//   godownId: string,
//   godownName: string,
//   quantity: number,
// ) {
//   const godownStock = { ...(currentGodownStock || {}) };
//   const newQty = (godownStock[godownId] || 0) + quantity;
//   tx.update(itemRef, { [`godownStock.${godownId}`]: newQty });
// }