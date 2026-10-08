import { useState, useEffect } from 'react';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  limit,
  where,
  Timestamp,
  QuerySnapshot,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { formatDate } from '../../../lib/format';
import type { Invoice } from '../journal.types';

export interface JournalDateRange {
  start: Date;
  end: Date;
}

// When a date range is active, the range MUST be enforced server-side
// (where + orderBy on createdAt) rather than fetched-then-filtered — a
// company with 300+ more recent sales than the selected range would
// otherwise never even have the older, in-range invoices fetched, no
// matter what date filter the user picks (they'd just silently be
// missing). With no range ("all"), fall back to the previous recent-300
// behavior — an unbounded scan of the whole history isn't needed there.
export const useJournalData = (companyId?: string, dateRange?: JournalDateRange | null) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rangeStartMs = dateRange?.start.getTime();
  const rangeEndMs = dateRange?.end.getTime();

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      setInvoices([]);
      return;
    }

    setLoading(true);

    const salesQuery = rangeStartMs !== undefined && rangeEndMs !== undefined
      ? query(
        collection(db, 'companies', companyId, 'sales'),
        where('createdAt', '>=', Timestamp.fromMillis(rangeStartMs)),
        where('createdAt', '<=', Timestamp.fromMillis(rangeEndMs)),
        orderBy('createdAt', 'desc')
      )
      : query(
        collection(db, 'companies', companyId, 'sales'),
        orderBy('createdAt', 'desc'),
        limit(300)
      );

    const purchasesQuery = rangeStartMs !== undefined && rangeEndMs !== undefined
      ? query(
        collection(db, 'companies', companyId, 'purchases'),
        where('createdAt', '>=', Timestamp.fromMillis(rangeStartMs)),
        where('createdAt', '<=', Timestamp.fromMillis(rangeEndMs)),
        orderBy('createdAt', 'desc')
      )
      : query(
        collection(db, 'companies', companyId, 'purchases'),
        orderBy('createdAt', 'desc'),
        limit(300)
      );

    const processSnapshot = (snapshot: QuerySnapshot, type: 'Credit' | 'Debit'): Invoice[] => {
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
        const paymentMethods = data.paymentMethods || {};
        const dueAmount = paymentMethods.due || 0;
        const status: 'Paid' | 'Unpaid' = dueAmount > 0 ? 'Unpaid' : 'Paid';

        const items = (data.items || []).map((item: any) => {
          const quantity = Number(item.quantity) || 0;
          const mrp = Number(item.mrp) || 0;
          const effectiveUnit = Number(item.effectiveUnitPrice) || 0;
          const dbFinalPrice = Number(item.finalPrice) || 0;

          let calculatedFinalPrice = dbFinalPrice;
          if (type === 'Debit') {
            if (effectiveUnit > 0) {
              calculatedFinalPrice = effectiveUnit * quantity;
            } else if (dbFinalPrice === 0) {
              calculatedFinalPrice = (Number(item.purchasePrice) || mrp) * quantity;
            }
          }

          return {
            id: item.id || '',
            name: item.name || 'N/A',
            quantity: quantity,
            finalPrice: type === 'Credit' ? dbFinalPrice : calculatedFinalPrice,
            mrp: mrp,
            salesPrice: Number(item.salesPrice) || 0, // <-- Add this line
            discount: item.discount || 0,
            discount2: Number(item.discount2) || 0,
            discountPercentage: Number(item.discountPercentage) || Number(item.discount) || 0,
            effectiveUnitPrice: effectiveUnit,
            manualDiscount: item.manualDiscount || 0,
            purchasePrice: Number(item.purchasePrice) || 0,
            barcode: item.barcode || '',
            stock: item.stock ?? item.Stock ?? 0,
            gst: item.gst || 0,
            taxRate: item.taxRate || item.gstPercent || 0,
            hsnSac: item.hsnSac || '',
            unit: item.unit || 'Pcs',
            purchasediscount: Number(item.purchasediscount) || 0,
            taxType: item.taxType || '',
            taxAmount: Number(item.taxAmount) || 0,
            taxableAmount: Number(item.taxableAmount) || 0,
          };
        });

        const calculatedTotal = Object.values(paymentMethods).reduce(
          (sum: number, value: any) => sum + (typeof value === 'number' ? value : 0),
          0
        );
        const returnHistory = data.returnHistory || [];
        const savedAmount = Number(data.totalAmount) || 0;
        const changeReturned = Number(data.revDiscount) || 0;
        const fallbackAmount = calculatedTotal - changeReturned;
        const correctDisplayAmount = savedAmount > 0 ? savedAmount : fallbackAmount;

        return {
          id: doc.id,
          invoiceNumber: data.invoiceNumber || `#${doc.id.slice(0, 6).toUpperCase()}`,
          amount: correctDisplayAmount,
          manualDiscount: data.manualDiscount || 0,
          time: formatDate(createdAt),
          status: status,
          type: type,
          partyName: data.partyName || 'N/A',
          partyNumber: data.partyNumber || '',
          partyAddress: data.partyAddress || '',
          partyGstin: data.partyGstin || '',
          placeOfSupply: data.placeOfSupply || '', // <-- ADD THIS
          salesmanId: data.salesmanId || null,
          salesmanName: data.salesmanName || '',
          createdAt,
          dueAmount: dueAmount,
          returnHistory: returnHistory,
          items: items,
          returnedItemsSnapshot: data.returnedItemsSnapshot || [],
          paymentMethods: paymentMethods,
          paymentHistory: data.paymentHistory || [],
          taxType: data.taxType || '',
          gstScheme: data.gstScheme || '',
          subtotal: Number(data.subtotal) || 0,
          taxAmount: Number(data.taxAmount) || 0,
          taxableAmount: Number(data.taxableAmount) || 0,
          totalDiscount: Number(data.totalDiscount) || 0,
          roundingOff: Number(data.roundingOff) || 0,
          voucherName: data.voucherName || '',
          shippingName: data.shippingName || '',
          shippingNumber: data.shippingNumber || '',
          shippingAddress: data.shippingAddress || '',
          shippingGST: data.shippingGST || '',
          expenses: data.expenses || [],
          extraExpenseName: data.extraExpenseName || '',
          extraExpenseAmount: Number(data.extraExpenseAmount) || 0,
          narration: data.narration || '',
          transportDetails: data.transportDetails || undefined,
        };
      });
    };

    const unsubSales = onSnapshot(salesQuery, (snapshot) => {
      const salesData = processSnapshot(snapshot, 'Credit');
      setInvoices(prev => {
        const withoutCredit = prev.filter(inv => inv.type !== 'Credit');
        const combined = [...withoutCredit, ...salesData];
        return combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      });
      setLoading(false);
    }, (err) => {
      console.error("Sales listener error:", err);
      setError("Failed to load sales.");
      setLoading(false);
    });

    const unsubPurchases = onSnapshot(purchasesQuery, (snapshot) => {
      const purchasesData = processSnapshot(snapshot, 'Debit');
      setInvoices(prev => {
        const withoutDebit = prev.filter(inv => inv.type !== 'Debit');
        const combined = [...withoutDebit, ...purchasesData];
        return combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      });
      setLoading(false);
    }, (err) => {
      console.error("Purchases listener error:", err);
      setError("Failed to load purchases.");
      setLoading(false);
    });

    return () => {
      unsubSales();
      unsubPurchases();
    };
  }, [companyId, rangeStartMs, rangeEndMs]);

  return { invoices, loading, error };
};
