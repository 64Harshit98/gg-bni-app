import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '../../lib/Firebase';
import type { Transaction } from '../../Pages/Reports/PNLReportComponents/pnlReport.utils';

interface RawSaleLineItem {
  purchasePrice?: number;
  quantity?: number;
}

interface RawSaleDoc {
  totalAmount?: number;
  createdAt?: Timestamp;
  invoiceNumber?: string;
  partyName?: string;
  items?: RawSaleLineItem[];
}

/**
 * Subscribes to a company's `sales` collection in real time and maps each
 * document into the `Transaction` shape the P&L report consumes. Cost of
 * goods sold is derived client-side from each bill's own line items
 * (`purchasePrice * quantity`), matching the original inline calculation
 * that used to live in `usePnlReport`.
 *
 * Returns the Firestore `Unsubscribe` so callers can tear down the listener
 * on unmount.
 */
export function subscribeToPnlSales(
  companyId: string,
  onData: (sales: Transaction[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const salesRef = collection(db, 'companies', companyId, 'sales');
  const salesQuery = query(salesRef);

  return onSnapshot(
    salesQuery,
    (snapshot) => {
      try {
        const sales: Transaction[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as RawSaleDoc;

          const costOfGoodsSold = (data.items ?? []).reduce((sum, item) => {
            const unitCost = Number(item.purchasePrice) || 0;
            return sum + unitCost * (item.quantity || 0);
          }, 0);

          return {
            id: docSnap.id,
            totalAmount: data.totalAmount || 0,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
            invoiceNumber: data.invoiceNumber || 'N/A',
            partyName: data.partyName || 'Cash Sale',
            costOfGoodsSold,
          };
        });
        onData(sales);
      } catch (err) {
        console.error('subscribeToPnlSales: failed to map snapshot', err);
        onError(err);
      }
    },
    (err) => {
      console.error('subscribeToPnlSales: listener error', err);
      onError(err);
    },
  );
}
