import { useEffect } from 'react';
import type { Item } from '../../constants/models';

/**
 * Keeps `stock` live-synced on availableItems from Firestore's items collection.
 * Fixes stale stock after a Purchase, Sale, or Stock Transfer made elsewhere
 * (another page, another tab, or Stock Transfer report) without requiring a
 * full page reload. Only the `stock` field is patched — nothing else is touched.
 *
 * Rides on dbOperations.listenToItems (see ItemsFirebase.ts), the shared
 * idb-keyval-backed items sync: after the first full sync it only listens for
 * docs changed since the last sync (`where('updatedAt', '>', lastSyncTime)`),
 * instead of opening a second full `items` collection listener per page.
 */
export function useLiveItemsStock(
  companyId: string | undefined,
  dbOperations: { listenToItems: (onData: (items: Item[]) => void) => () => void } | null | undefined,
  setAvailableItems: React.Dispatch<React.SetStateAction<Item[]>>,
) {
  useEffect(() => {
    if (!companyId || !dbOperations) return;

    const unsubscribe = dbOperations.listenToItems((liveItems) => {
      const stockMap = new Map<string, number>();
      liveItems.forEach((item) => {
        if (item.id) stockMap.set(item.id, (item as any).stock ?? (item as any).Stock ?? 0);
      });

      setAvailableItems(prev => {
        if (prev.length === 0) return prev; // wait for initial fetch to populate the list
        let changed = false;
        const next = prev.map(item => {
          if (!item.id) return item;
          const liveStock = stockMap.get(item.id);
          if (liveStock === undefined || liveStock === item.stock) return item;
          changed = true;
          return { ...item, stock: liveStock };
        });
        return changed ? next : prev;
      });
    });

    return () => unsubscribe();
  }, [companyId, dbOperations, setAvailableItems]);
}
