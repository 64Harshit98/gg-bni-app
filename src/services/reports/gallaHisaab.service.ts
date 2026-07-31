/**
 * Data-access layer for the Galla Hisaab (daily cash reconciliation) tool.
 * Wraps the Firestore reads that used to live inline in `GallaHisaabTool.tsx`
 * behind a single typed function. The cash/change reconciliation math is a
 * verbatim port of the previous in-component logic.
 */
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

export interface CashBreakdownEntry {
  received: number;
  returned: number;
}

export interface DailyCashHistoryEntry {
  date: string;
  received: number;
  returned: number;
  net: number;
}

export interface GallaHisaabSummary {
  totalCash: number;
  breakdown: CashBreakdownEntry[];
  history: DailyCashHistoryEntry[];
}

export interface GallaHisaabDateRange {
  startDate?: string;
  endDate?: string;
}

/**
 * Fetches all sales for the company (optionally scoped to a date range) and
 * reconciles how much cash was actually received net of change given back.
 */
export async function fetchGallaHisaabSummary(
  companyId: string,
  { startDate, endDate }: GallaHisaabDateRange = {},
): Promise<GallaHisaabSummary> {
  const salesRef = collection(db, 'companies', companyId, 'sales');
  let q = query(salesRef, orderBy('createdAt', 'desc'));

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    q = query(
      salesRef,
      where('createdAt', '>=', start),
      where('createdAt', '<=', end),
      orderBy('createdAt', 'desc'),
    );
  }

  const snap = await getDocs(q);

  let totalCash = 0;
  const breakdown: CashBreakdownEntry[] = [];
  const dailyMap: Record<string, { received: number; returned: number; net: number }> = {};

  snap.docs.forEach((docSnap) => {
    const d = docSnap.data();

    if (d.paymentMethods && typeof d.paymentMethods === 'object') {
      const date = new Date(d.createdAt?.seconds ? d.createdAt.seconds * 1000 : d.createdAt);
      const dateKey = date.toISOString().split('T')[0];

      const methods = Object.entries(d.paymentMethods as Record<string, unknown>)
        .map(([key, val]) => ({ key: key.toLowerCase(), amt: Number(val) || 0 }))
        .filter((m) => m.amt > 0);

      if (methods.length > 0) {
        const billAmount = Number(d.totalAmount || d.total || d.amount || d.grandTotal || 0);
        const totalTendered = methods.reduce((sum, m) => sum + m.amt, 0);

        let change = totalTendered > billAmount ? totalTendered - billAmount : 0;

        let cashReceived = 0;
        let cashReturned = 0;

        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = { received: 0, returned: 0, net: 0 };
        }

        methods.forEach((m) => {
          let finalAmt = m.amt;

          if (m.key === 'cash') {
            cashReceived += m.amt;
          }

          if (change > 0 && m.key === 'cash') {
            const deduct = Math.min(finalAmt, change);
            finalAmt -= deduct;
            change -= deduct;
            cashReturned += deduct;
          }

          // Deduct remaining change from other methods if needed
          if (change > 0) {
            const deduct = Math.min(finalAmt, change);
            finalAmt -= deduct;
            change -= deduct;
          }

          // Only count cash
          if (m.key === 'cash' && finalAmt > 0) {
            totalCash += finalAmt;
          }
        });

        if (cashReceived > 0) {
          breakdown.push({ received: cashReceived, returned: cashReturned });
        }

        dailyMap[dateKey].received += cashReceived;
        dailyMap[dateKey].returned += cashReturned;
        dailyMap[dateKey].net += cashReceived - cashReturned;
      }
    }
  });

  const history = Object.entries(dailyMap)
    .map(([date, val]) => ({ date, ...val }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return { totalCash, breakdown, history };
}
