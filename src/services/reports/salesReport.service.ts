import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore';

import { db } from '../../lib/Firebase';
import type { SaleRecord } from '../../Pages/Reports/SalesReportComponents/salesReport.utils';

/**
 * Fetch all sale records for a company, newest first. Mirrors the query
 * previously inlined in `useSalesReport.tsx`; logic/shape is unchanged, only
 * relocated here.
 */
export async function fetchSales(companyId: string): Promise<SaleRecord[]> {
  try {
    const salesQuery = query(
      collection(db, 'companies', companyId, 'sales'),
      orderBy('createdAt', 'desc'),
    );

    const snapshot = await getDocs(salesQuery);

    return snapshot.docs.map((docSnap): SaleRecord => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        partyName: data.partyName || 'N/A',
        invoiceNumber: data.invoiceNumber || 'N/A',
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
    console.error('[salesReport.service] Error fetching sales:', err);
    throw new Error('Failed to load sales report.');
  }
}

export const salesReportService = { fetchSales };
