import { useState } from 'react';
import { db } from '../../lib/Firebase';
import {
  doc, getDoc, writeBatch, arrayUnion, serverTimestamp,
  increment as firebaseIncrement,
} from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { State } from '../../enums';
import type { Order, OrderItem } from '../Orders';
import type { PaymentCompletionData } from '../../Components/PaymentDrawer';

interface TransactionItem {
  id: string; originalItemId: string; name: string;
  mrp: number; quantity: number; unitPrice: number; amount: number;
}
interface ExchangeItem extends TransactionItem {
  salesPrice: number; discount: number; basePrice: number;
  customPrice?: number | string;
}

interface UseReturnTransactionArgs {
  selectedSale: Order | null;
  itemsToReturn: TransactionItem[];
  exchangeItems: ExchangeItem[];
  availableItems: OrderItem[];
  partyName: string;
  partyNumber: string;
  modeOfReturn: string;
  finalBalance: number;
  setModal: (m: { message: string; type: State } | null) => void;
  setSelectedSale: React.Dispatch<React.SetStateAction<Order | null>>;
  setSalesList: React.Dispatch<React.SetStateAction<Order[]>>;
  setOriginalSaleItems: (items: TransactionItem[]) => void;
  setSelectedReturnIds: (ids: Set<string>) => void;
  setExchangeItems: (items: ExchangeItem[]) => void;
  onSuccess: () => void;
}

export function useReturnTransaction({
  selectedSale, itemsToReturn, exchangeItems, availableItems,
  partyName, partyNumber, modeOfReturn, finalBalance,
  setModal, setSelectedSale, setSalesList,
  setOriginalSaleItems, setSelectedReturnIds, setExchangeItems, onSuccess,
}: UseReturnTransactionArgs) {
  const { currentUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refreshSelectedOrder = async (orderId: string) => {
    if (!currentUser?.companyId) return;
    const snap = await getDoc(doc(db, 'companies', currentUser.companyId, 'Orders', orderId));
    if (!snap.exists()) return;

    const updatedOrder = { id: snap.id, ...snap.data() } as Order;
    setSelectedSale(updatedOrder);

    // Re-populate return items list from refreshed order
    const refreshedItems = (updatedOrder.items ?? [])
      .map((item: any) => {
        if (!item.id) return null;
        const qty = Number(item.quantity) || 0;
        const price = Number(item.salesPrice ?? item.mrp) || 0;
        return {
          id: item.id, originalItemId: item.id,
          name: item.name ?? 'Unnamed Item',
          quantity: qty, originalQuantity: qty,
          unitPrice: price, amount: price * qty,
          mrp: Number(item.mrp) || price,
        };
      })
      .filter(Boolean) as TransactionItem[];

    setOriginalSaleItems(refreshedItems);
    setSalesList(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
  };

  const saveReturnTransaction = async (
    completionData?: Partial<PaymentCompletionData>
  ) => {
    if (!currentUser?.companyId || !selectedSale) return;

    setIsSubmitting(true);
    const companyId = currentUser.companyId;

    try {
      const batch = writeBatch(db);
      const saleRef = doc(db, 'companies', companyId, 'Orders', selectedSale.id);

      const finalPartyName = (completionData?.partyName || partyName || selectedSale.userName || '').trim();
      const finalPartyNumber = (completionData?.partyNumber || partyNumber || '').trim();

      // Build a mutable map of original items
      const originalItemsMap = new Map<string, any>();
      (selectedSale.items || []).forEach((item: any) => {
        const qty = Number(item.quantity) || 1;
        const total = Number(item.finalPrice || item.amount || 0);
        const unit = Number(item.salesPrice) || (qty > 0 ? total / qty : 0);
        originalItemsMap.set(item.id, { ...item, _effectiveUnitPrice: unit });
      });

      const originalInvoiceTotal = (selectedSale.items || []).reduce(
        (sum: number, item: any) => sum + Number(item.finalPrice || 0), 0
      );

      const validInventoryIds = new Set(availableItems.map(i => i.id));
      let returnedItemsGrossValue = 0;

      // Remove returned items from the order map
      itemsToReturn.forEach(returnItem => {
        const orig = originalItemsMap.get(returnItem.originalItemId);
        if (!orig) return;

        if (modeOfReturn !== 'Exchange') {
          returnedItemsGrossValue += orig._effectiveUnitPrice * returnItem.quantity;
        }

        orig.quantity -= returnItem.quantity;
        if (orig.quantity <= 0) originalItemsMap.delete(returnItem.originalItemId);
      });

      // Add exchange items to the order map
      if (modeOfReturn === 'Exchange') {
        exchangeItems.forEach(ei => {
          const existing = originalItemsMap.get(ei.originalItemId);
          if (existing) {
            existing.quantity += ei.quantity;
          } else {
            originalItemsMap.set(ei.originalItemId, {
              id: ei.originalItemId, name: ei.name, mrp: ei.mrp,
              quantity: ei.quantity, discount: ei.discount || 0,
              finalPrice: ei.amount, amount: ei.amount,
              unitPrice: ei.amount / ei.quantity || ei.mrp,
              _effectiveUnitPrice: ei.amount / ei.quantity || ei.mrp,
            });
          }
        });
      }

      // Stock adjustments
      itemsToReturn.forEach(ri => {
        if (validInventoryIds.has(ri.originalItemId)) {
          batch.update(doc(db, 'companies', companyId, 'items', ri.originalItemId), {
            stock: firebaseIncrement(ri.quantity), updatedAt: serverTimestamp(),
          });
        }
      });
      exchangeItems.forEach(ei => {
        if (validInventoryIds.has(ei.originalItemId)) {
          batch.update(doc(db, 'companies', companyId, 'items', ei.originalItemId), {
            stock: firebaseIncrement(-ei.quantity), updatedAt: serverTimestamp(),
          });
        }
      });

      // Rebuild items list
      const newItemsList = Array.from(originalItemsMap.values()).map(item => {
        const safeUnit = Number(item._effectiveUnitPrice) || Number(item.unitPrice) || Number(item.mrp) || 0;
        const lineTotal = safeUnit * Number(item.quantity);
        const { _effectiveUnitPrice, ...clean } = item;
        return { ...clean, unitPrice: safeUnit, salesPrice: safeUnit, finalPrice: lineTotal, amount: lineTotal };
      });

      // Recalculate totals
      const totals = newItemsList.reduce(
        (acc, item) => {
          acc.subtotal += item.mrp * item.quantity;
          acc.totalItemDiscount += item.mrp * item.quantity - item.finalPrice;
          return acc;
        },
        { subtotal: 0, totalItemDiscount: 0 }
      );

      // Prorate manual discount
      const originalManualDiscount = Number(selectedSale.manualDiscount) || 0;
      let discountDeduction = 0;
      if (originalManualDiscount > 0 && originalInvoiceTotal > 0 && returnedItemsGrossValue > 0) {
        discountDeduction = (returnedItemsGrossValue / originalInvoiceTotal) * originalManualDiscount;
      }
      discountDeduction = Math.round(discountDeduction * 100) / 100;
      const newManualDiscount = Math.max(0, originalManualDiscount - discountDeduction);
      const updatedFinalAmount = totals.subtotal - totals.totalItemDiscount - newManualDiscount;

      // Payments
      const updatedPaymentMethods = { ...(selectedSale.paymentMethods || {}) };
      if (completionData?.paymentDetails) {
        Object.entries(completionData.paymentDetails).forEach(([mode, amount]) => {
          if (mode.toLowerCase() !== 'due') {
            updatedPaymentMethods[mode] = (updatedPaymentMethods[mode] || 0) + Number(amount);
          }
        });
      }
      const paid = Object.entries(updatedPaymentMethods)
        .filter(([k]) => k !== 'due')
        .reduce((sum, [, v]) => sum + Number(v), 0);
      updatedPaymentMethods.due = Math.max(0, updatedFinalAmount - paid);

      // Build history record
      const cleanItem = (item: any) => ({
        id: item.id || '', originalItemId: item.originalItemId || '',
        name: item.name || '', mrp: item.mrp ?? 0, quantity: item.quantity ?? 1,
        unitPrice: item.unitPrice ?? 0, amount: item.amount ?? 0, discount: item.discount ?? 0,
      });

      const returnHistoryRecord = JSON.parse(JSON.stringify({
        id: crypto.randomUUID(),
        returnedAt: new Date(),
        returnedItems: itemsToReturn.map(cleanItem),
        exchangeItems: exchangeItems.map(cleanItem),
        finalBalance,
        discountDeducted: discountDeduction,
        modeOfReturn,
        paymentDetails: completionData?.paymentDetails
          ? Object.fromEntries(Object.entries(completionData.paymentDetails).filter(([, v]) => v != null))
          : null,
        partyName: finalPartyName,
        partyNumber: finalPartyNumber,
      }));

      // Customer ledger
      if (finalPartyNumber.length >= 3 && finalBalance > 0) {
        batch.set(
          doc(db, 'companies', companyId, 'customers', finalPartyNumber),
          { name: finalPartyName, number: finalPartyNumber, creditBalance: firebaseIncrement(finalBalance), lastUpdatedAt: serverTimestamp() },
          { merge: true }
        );
      }

      const isUnpaidOrder = (selectedSale.paidAmount ?? 0) === 0;
      const actualPaid = selectedSale.paidAmount ?? 0;
      const newStatus = updatedFinalAmount > 0 && actualPaid >= updatedFinalAmount ? 'Paid' : 'Completed';

      batch.update(saleRef, {
        items: newItemsList,
        totalAmount: updatedFinalAmount,
        manualDiscount: newManualDiscount,
        paymentMethods: {
          ...updatedPaymentMethods,
          due: isUnpaidOrder
            ? Math.max(0, selectedSale.totalAmount - returnedItemsGrossValue)
            : updatedPaymentMethods.due,
        },
        paidAmount: actualPaid,
        status: isUnpaidOrder ? 'Completed' : newStatus,
        returnHistory: arrayUnion(returnHistoryRecord),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      await refreshSelectedOrder(selectedSale.id);

      setSelectedReturnIds(new Set());
      setExchangeItems([]);
      setModal({ type: State.SUCCESS, message: 'Return processed successfully!' });
      onSuccess();
    } catch (err: any) {
      console.error(err);
      setModal({ type: State.ERROR, message: `Failed: ${err.message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  return { saveReturnTransaction, isSubmitting };
}
