/**
 * Data-access layer for the Customer Report page. Wraps the Firestore reads
 * that used to live inline in `CustomerReport.tsx` / `useCustomerReport.tsx`
 * behind small, typed, real-time subscription helpers. Logic (field mapping,
 * fallback rules) is preserved exactly as it was before extraction.
 */
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { type Sale } from '../../Pages/Reports/CustomerReportComponents/customerReport.utils';

/** A `Sale` row tagged with whether it originated from an opening balance. */
export type SaleWithOrigin = Sale & { isOpeningBalance: boolean };

/** Map of `num:<phone>` / `name:<lowercased name>` -> outstanding credit balance. */
export type CustomerCreditMap = Record<string, number>;

/**
 * Subscribes to the company's `sales` collection and streams it back as
 * normalized `Sale` rows (due/credit-note amounts resolved from either the
 * structured `paymentMethods` map or legacy top-level fields).
 */
export function subscribeToCustomerSales(
  companyId: string,
  onData: (sales: SaleWithOrigin[]) => void,
  onError: () => void,
): Unsubscribe {
  const salesRef = collection(db, 'companies', companyId, 'sales');

  return onSnapshot(
    query(salesRef),
    (snapshot) => {
      const sales: SaleWithOrigin[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const paymentMethods = (data.paymentMethods || {}) as Record<string, unknown>;

        const sumMethodAmounts = (matcher: (key: string) => boolean) =>
          Object.entries(paymentMethods).reduce((sum, [key, value]) => {
            if (!matcher(key)) return sum;
            const num = Number(value || 0);
            return sum + (Number.isFinite(num) ? num : 0);
          }, 0);

        const dueFromMethods = sumMethodAmounts((key) => key.toLowerCase().includes('due'));
        const creditFromMethods = sumMethodAmounts((key) => key.toLowerCase() === 'credit note');

        const dueAmount = Number(data.paymentMethods?.due ?? data.dueAmount ?? dueFromMethods ?? 0);
        const creditNoteAmount = Number(data.creditNoteAmount ?? creditFromMethods ?? 0);

        return {
          id: docSnap.id,
          partyName: data.partyName || 'N/A',
          partyNumber: data.partyNumber || 'N/A',
          totalAmount: Number(data.totalAmount || 0),
          dueAmount: Number.isFinite(dueAmount) ? dueAmount : 0,
          creditNoteAmount: Number.isFinite(creditNoteAmount) ? creditNoteAmount : 0,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
          isOpeningBalance: false,
        };
      });
      onData(sales);
    },
    onError,
  );
}

/**
 * Subscribes to the company's `openingBalances` collection and streams back
 * only "due"-type opening balances, normalized into `Sale` rows.
 */
export function subscribeToCustomerOpeningBalances(
  companyId: string,
  onData: (entries: SaleWithOrigin[]) => void,
  onError: () => void,
): Unsubscribe {
  const obRef = collection(db, 'companies', companyId, 'openingBalances');

  return onSnapshot(
    query(obRef),
    (snapshot) => {
      const entries: SaleWithOrigin[] = snapshot.docs
        .filter((docSnap) => {
          const data = docSnap.data();
          // Only include "due" type opening balances, not "advance".
          return (data.balanceType ?? 'due') === 'due';
        })
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            partyName: data.partyName || 'N/A',
            partyNumber: data.partyNumber || 'N/A',
            totalAmount: Number(data.amount || 0),
            dueAmount: Number(data.dueAmount ?? data.amount ?? 0),
            creditNoteAmount: 0,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
            isOpeningBalance: true,
          };
        });
      onData(entries);
    },
    onError,
  );
}

/**
 * Subscribes to the company's `customers` collection and streams back a
 * lookup map (by phone number and by lowercased name) of each customer's
 * outstanding credit balance, used to enrich the Customer Report rows.
 */
export function subscribeToCustomerCreditBalances(
  companyId: string,
  onData: (map: CustomerCreditMap) => void,
  onError: () => void,
): Unsubscribe {
  const customersRef = collection(db, 'companies', companyId, 'customers');

  return onSnapshot(
    query(customersRef),
    (snapshot) => {
      const nextMap: CustomerCreditMap = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const credit = Number(data.creditBalance || 0);
        const numberKey = String(data.number || '').trim();
        const nameKey = String(data.name || '').trim().toLowerCase();

        if (numberKey) nextMap[`num:${numberKey}`] = Number.isFinite(credit) ? credit : 0;
        if (nameKey) nextMap[`name:${nameKey}`] = Number.isFinite(credit) ? credit : 0;
      });
      onData(nextMap);
    },
    onError,
  );
}
