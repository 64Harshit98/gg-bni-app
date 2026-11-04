import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { SHOP_ID } from './useStockTransfer';

export interface LedgerAgg { in: number; out: number; }

export function useStockLedger(
  companyId: string | undefined,
  fromDate: string,
  toDate: string,
  locationFilter: string // '' = all locations combined, SHOP_ID, or a godownId
) {
  const [ledgerMap, setLedgerMap] = useState<Map<string, LedgerAgg>>(new Map());
  const [isLedgerLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!companyId || !fromDate || !toDate) return;
    setIsLoading(true);

    const startMs = new Date(fromDate + 'T00:00:00').getTime();
    const endMs = new Date(toDate + 'T23:59:59').getTime();
    const startTs = Timestamp.fromMillis(startMs);
    const endTs = Timestamp.fromMillis(endMs);

    const bump = (map: Map<string, LedgerAgg>, itemId: string, inQty: number, outQty: number) => {
      const agg = map.get(itemId) || { in: 0, out: 0 };
      agg.in += inQty;
      agg.out += outQty;
      map.set(itemId, agg);
    };

    const run = async () => {
      const map = new Map<string, LedgerAgg>();

      // --- stockTransfers: purchases + internal transfers ---
      const transfersRef = collection(db, 'companies', companyId, 'stockTransfers');
      const transfersQ = query(transfersRef, where('date', '>=', startMs), where('date', '<=', endMs));
      const transfersSnap = await getDocs(transfersQ);

      transfersSnap.forEach(d => {
        const t = d.data() as any;
        if (!t.itemId) return;
        const isPurchase = t.type === 'purchase-in';
        const isInternalTransfer = !isPurchase && t.fromGodownId && t.toGodownId;

        if (!locationFilter) {
          // Company-wide: only true new stock counts as "in"; internal moves net to zero.
          if (isPurchase) bump(map, t.itemId, t.quantity || 0, 0);
          // isInternalTransfer contributes nothing here — it's not leaving the company.
        } else {
          // Location-scoped: count anything landing at / leaving this specific location.
          if (t.toGodownId === locationFilter) bump(map, t.itemId, t.quantity || 0, 0);
          if (isInternalTransfer && t.fromGodownId === locationFilter) bump(map, t.itemId, 0, t.quantity || 0);
        }
      });

      // --- sales: only affect Shop stock, per Sales.tsx's firebaseIncrement on item.stock ---
      const includeSales = !locationFilter || locationFilter === SHOP_ID;
      if (includeSales) {
        const salesRef = collection(db, 'companies', companyId, 'sales');
        const salesQ = query(salesRef, where('createdAt', '>=', startTs), where('createdAt', '<=', endTs));
        const salesSnap = await getDocs(salesQ);
        salesSnap.forEach(d => {
          const sale = d.data() as any;
          (sale.items || []).forEach((item: any) => {
            const pid = item.id || item.productId;
            if (pid) bump(map, pid, 0, item.quantity || 0);
          });
        });
      }

      setLedgerMap(map);
      setIsLoading(false);
    };

    run().catch(err => { console.error('Ledger fetch failed', err); setIsLoading(false); });
  }, [companyId, fromDate, toDate, locationFilter]);

  return { ledgerMap, isLedgerLoading };
}