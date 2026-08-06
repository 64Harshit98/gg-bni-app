import { useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import type { Item } from '../../constants/models';

/**
 * Keeps `stock` live-synced on availableItems from Firestore's items collection.
 * Fixes stale stock after a Purchase, Sale, or Stock Transfer made elsewhere
 * (another page, another tab, or Stock Transfer report) without requiring a
 * full page reload. Only the `stock` field is patched — nothing else is touched.
 */
export function useLiveItemsStock(
  companyId: string | undefined,
  setAvailableItems: React.Dispatch<React.SetStateAction<Item[]>>,
) {
  useEffect(() => {
    if (!companyId) return;
    const itemsRef = collection(db, 'companies', companyId, 'items');
    const unsubscribe = onSnapshot(
      itemsRef,
      (snap) => {
        setAvailableItems(prev => {
          if (prev.length === 0) return prev; // wait for initial fetch to populate the list
          let changed = false;
          const stockMap = new Map<string, number>();
          snap.docs.forEach(d => {
            const data = d.data() as any;
            stockMap.set(d.id, data.stock ?? data.Stock ?? 0);
          });
          const next = prev.map(item => {
            if (!item.id) return item;
            const liveStock = stockMap.get(item.id);
            if (liveStock === undefined || liveStock === item.stock) return item;
            changed = true;
            return { ...item, stock: liveStock };
          });
          return changed ? next : prev;
        });
      },
      (err) => {
        console.error('[useLiveItemsStock] snapshot error:', err);
      }
    );
    return () => unsubscribe();
  }, [companyId, setAvailableItems]);
}