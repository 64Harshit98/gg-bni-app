import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';

import { db } from '../../lib/Firebase';
import type { PurchaseRecord } from '../../Pages/Reports/PurchaseReportComponents/purchaseReports.utils';

export interface PurchaseDateRange {
  start: number;
  end: number;
}

/**
 * Fetch purchase records for a company, filtered to a `createdAt` date range
 * (inclusive). Mirrors the query previously inlined in
 * `usePurchaseReports.tsx`; logic/shape is unchanged, only relocated here.
 */
export async function fetchPurchases(
  companyId: string,
  range: PurchaseDateRange,
): Promise<PurchaseRecord[]> {
  try {
    const start = new Date(range.start);
    const end = new Date(range.end);

    const purchasesQuery = query(
      collection(db, 'companies', companyId, 'purchases'),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(end)),
    );

    const snapshot = await getDocs(purchasesQuery);

    return snapshot.docs.map((docSnap): PurchaseRecord => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        partyName: data.partyName || 'N/A',
        totalAmount: data.totalAmount || 0,
        paymentMethods: data.paymentMethods || {},
        createdAt:
          data.createdAt instanceof Timestamp
            ? data.createdAt.toMillis()
            : Date.now(),
        items: data.items || [],
      };
    });
  } catch (err) {
    console.error('[purchaseReport.service] Error fetching purchases:', err);
    throw new Error('Failed to load purchase report.');
  }
}

export const purchaseReportService = { fetchPurchases };
