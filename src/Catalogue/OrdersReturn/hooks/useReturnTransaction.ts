import { useState } from 'react';
import { db } from '../../../lib/Firebase';
import {
  doc,
  writeBatch,
  arrayUnion,
  serverTimestamp,
  increment as firebaseIncrement,
} from 'firebase/firestore';
import { State } from '../../../enums';
import { ROUTES } from '../../../constants/routes.constants';
import type { PaymentCompletionData } from '../../../Components/PaymentDrawer';
import type { Order, OrderItem } from '../../Orders';
import type { TransactionItem, ExchangeItem } from '../ordersReturn.types';
import {
  computeOriginalInvoiceTotal,
  resolveEffectiveUnitPriceForSave,
  buildRecalculatedItemsList,
  computeItemGrossTotals,
  computeManualDiscountDeduction,
  computePostReturnPaymentStatus,
} from '../ordersReturn.calculations';

// ─────────────────────────────────────────────────────────────────────────
// Moved verbatim from OrdersReturn.tsx (formatting/hoisting only — no
// behavior changes). Owns the money-critical "commit the return/exchange to
// Firestore" flow: saveReturnTransaction (previously ~L602-902), the
// process/validate gate in front of it (handleProcessReturn, previously
// ~L911-995), and the small balance-label helper used by both the mobile
// and desktop summary panels (getBalanceLabel, previously ~L997-1002). Also
// owns the two pieces of state exclusively read/written within this flow:
// isDrawerOpen (the "customer owes extra" PaymentDrawer) and
// exchangeBalanceAction (previously ~L83-84).
//
// `selectedSale`/`originalSaleItems`/`selectedReturnIds`/`exchangeItems`/
// `modeOfReturn`/`partyName`/`partyNumber`/`availableItems`/`isLoading` are
// NOT owned here — each is also written from other hooks (see those hooks'
// header comments), so per the cross-hook-dependency convention they were
// lifted to OrdersReturn.tsx and threaded into this hook as params.
// ─────────────────────────────────────────────────────────────────────────

interface UseReturnTransactionParams {
  currentUser: any;
  navigate: (path: string) => void;
  selectedSale: Order | null;
  setSelectedSale: React.Dispatch<React.SetStateAction<Order | null>>;
  setOriginalSaleItems: React.Dispatch<React.SetStateAction<TransactionItem[]>>;
  setSelectedReturnIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  itemsToReturn: TransactionItem[];
  exchangeItems: ExchangeItem[];
  setExchangeItems: React.Dispatch<React.SetStateAction<ExchangeItem[]>>;
  modeOfReturn: string;
  partyName: string;
  partyNumber: string;
  availableItems: OrderItem[];
  finalBalance: number;
  isDueSale: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setModal: (modal: { message: string; type: State } | null) => void;
  refreshSelectedOrder: (orderId: string) => Promise<void>;
}

export const useReturnTransaction = ({
  currentUser,
  navigate,
  selectedSale,
  setSelectedSale,
  setOriginalSaleItems,
  setSelectedReturnIds,
  itemsToReturn,
  exchangeItems,
  setExchangeItems,
  modeOfReturn,
  partyName,
  partyNumber,
  availableItems,
  finalBalance,
  isDueSale,
  setIsLoading,
  setModal,
  refreshSelectedOrder,
}: UseReturnTransactionParams) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [exchangeBalanceAction, setExchangeBalanceAction] = useState<'Credit Note' | 'Cash Refund'>('Credit Note');

  // --- SAVE LOGIC ---
  const saveReturnTransaction = async (
    completionData?: Partial<PaymentCompletionData>
  ) => {
    if (!currentUser || !currentUser.companyId || !selectedSale) return;

    setIsLoading(true);
    const companyId = currentUser.companyId;

    try {
      const batch = writeBatch(db);
      const saleRef = doc(db, 'companies', companyId, 'Orders', selectedSale.id);

      // --- 0. FINAL PARTY DETAILS ---
      const finalPartyName =
        (completionData?.partyName || partyName || selectedSale.userName || '').trim();

      const finalPartyNumber =
        (completionData?.partyNumber || partyNumber || '').trim();

      // --- 1. ORIGINAL ITEMS MAP ---
      const originalItemsMap = new Map<string, any>();

      (selectedSale.items || []).forEach((item: any) => {
        const safeId = item.id;
        const unit = resolveEffectiveUnitPriceForSave(item);

        originalItemsMap.set(safeId, {
          ...item,
          _effectiveUnitPrice: unit
        });
      });


      const originalInvoiceTotal = computeOriginalInvoiceTotal(selectedSale.items);

      const validInventoryIds = new Set(availableItems.map(i => i.id));

      // --- 2. HANDLE RETURNS ---
      let returnedItemsGrossValue = 0;

      // --- 2. HANDLE RETURNS ---
      if (modeOfReturn !== 'Exchange') {
        itemsToReturn.forEach(returnItem => {
          const originalItem = originalItemsMap.get(returnItem.originalItemId);

          if (originalItem) {
            originalItem.quantity -= returnItem.quantity;
            returnedItemsGrossValue +=
              originalItem._effectiveUnitPrice * returnItem.quantity;

            if (originalItem.quantity <= 0) {
              originalItemsMap.delete(returnItem.originalItemId);
            }
          }
        });
      }

      // --- 3. HANDLE EXCHANGE ---
      if (modeOfReturn === 'Exchange') {
        // 🔁 remove returned items first
        itemsToReturn.forEach(returnItem => {
          const originalItem = originalItemsMap.get(returnItem.originalItemId);

          if (originalItem) {
            originalItem.quantity -= returnItem.quantity;

            if (originalItem.quantity <= 0) {
              originalItemsMap.delete(returnItem.originalItemId);
            }
          }
        });
      }

      // ➕ add exchange items
      if (modeOfReturn === 'Exchange') {
        exchangeItems.forEach(exchangeItem => {
          const existingItem = originalItemsMap.get(exchangeItem.originalItemId);

          if (existingItem) {
            existingItem.quantity += exchangeItem.quantity;
          } else {
            originalItemsMap.set(exchangeItem.originalItemId, {
              id: exchangeItem.originalItemId,
              name: exchangeItem.name,
              mrp: exchangeItem.mrp,
              quantity: exchangeItem.quantity,
              discount: exchangeItem.discount || 0,
              finalPrice: exchangeItem.amount,
              amount: exchangeItem.amount,
              unitPrice:
                exchangeItem.amount / exchangeItem.quantity || exchangeItem.mrp,
              _effectiveUnitPrice:
                exchangeItem.amount / exchangeItem.quantity || exchangeItem.mrp
            });
          }
        });
      }

      // --- 3.5 HANDLE RETURN STOCK (ADD BACK) ---
      itemsToReturn.forEach(returnItem => {
        if (validInventoryIds.has(returnItem.originalItemId)) {
          batch.update(
            doc(db, 'companies', companyId, 'items', returnItem.originalItemId),
            {
              stock: firebaseIncrement(returnItem.quantity),
              updatedAt: serverTimestamp()
            }
          );
        }
      });

      // --- 3.6 HANDLE EXCHANGE STOCK (DEDUCT) ---
      exchangeItems.forEach(exchangeItem => {
        if (validInventoryIds.has(exchangeItem.originalItemId)) {
          batch.update(
            doc(db, 'companies', companyId, 'items', exchangeItem.originalItemId),
            {
              stock: firebaseIncrement(-exchangeItem.quantity),
              updatedAt: serverTimestamp()
            }
          );
        }
      });

      // --- 4. RECALCULATE BILL ---
      const newItemsList = buildRecalculatedItemsList(originalItemsMap);

      const totals = computeItemGrossTotals(newItemsList);

      // --- 5. MANUAL DISCOUNT ---
      const originalManualDiscount = Number(selectedSale.manualDiscount) || 0;
      const { discountDeduction, newManualDiscount } = computeManualDiscountDeduction(
        originalManualDiscount,
        originalInvoiceTotal,
        returnedItemsGrossValue
      );

      const updatedFinalAmount =
        totals.subtotal - totals.totalItemDiscount - newManualDiscount;

      // --- 6. PAYMENTS ---
      const updatedPaymentMethods = {
        ...(selectedSale.paymentMethods || {})
      };

      if (completionData?.paymentDetails) {
        Object.entries(completionData.paymentDetails).forEach(
          ([mode, amount]) => {
            if (mode.toLowerCase() !== 'due') {
              updatedPaymentMethods[mode] =
                (updatedPaymentMethods[mode] || 0) + Number(amount);
            }
          }
        );
      }

      // --- NEW FIX: Add Credit/Refund amounts to paymentMethods for OrdersPage badges ---
      let creditAmountToAdd = 0;
      let refundAmountToAdd = 0;

      if (finalBalance > 0) {
        if (modeOfReturn === 'Credit Note' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Credit Note')) {
          creditAmountToAdd = finalBalance;
          updatedPaymentMethods['CREDIT NOTE'] = (updatedPaymentMethods['CREDIT NOTE'] || 0) + finalBalance;
        } else if (modeOfReturn === 'Cash Refund' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Cash Refund')) {
          refundAmountToAdd = finalBalance;
          updatedPaymentMethods['CASH REFUND'] = (updatedPaymentMethods['CASH REFUND'] || 0) + finalBalance;
        }
      }


      const paid = Object.entries(updatedPaymentMethods)
        .filter(([k]) => k !== 'due')
        .reduce((sum, [, v]) => sum + Number(v), 0);

      updatedPaymentMethods.due = Math.max(0, updatedFinalAmount - paid);

      // --- 7. HISTORY ---

      const cleanItem = (item: any) => ({
        id: item.id || '',
        originalItemId: item.originalItemId || '',
        name: item.name || '',
        mrp: item.mrp ?? 0,
        quantity: item.quantity ?? 1,
        unitPrice: item.unitPrice ?? 0,
        amount: item.amount ?? 0,
        discount: item.discount ?? 0,
      });
      const cleanPaymentDetails = completionData?.paymentDetails
        ? Object.fromEntries(
          Object.entries(completionData.paymentDetails).filter(
            ([_, v]) => v !== undefined && v !== null
          )
        )
        : null;

      const returnHistoryRecord = {
        id: crypto.randomUUID(),
        returnedAt: new Date(),
        returnedItems: itemsToReturn.map(cleanItem),
        exchangeItems: exchangeItems.map(cleanItem),
        finalBalance,
        discountDeducted: discountDeduction,
        modeOfReturn,
        paymentDetails: cleanPaymentDetails,
        partyName: finalPartyName,
        partyNumber: finalPartyNumber
      };

      const safeReturnHistoryRecord = JSON.parse(
        JSON.stringify(returnHistoryRecord)
      );

      // --- 9. CUSTOMER LEDGER ---
      const shouldAddCredit =
        finalBalance > 0 &&
        (modeOfReturn === 'Credit Note' ||
          (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Credit Note'));
      if (finalPartyNumber.length >= 3 && shouldAddCredit) {
        batch.set(
          doc(db, 'companies', companyId, 'customers', finalPartyNumber),
          {
            name: finalPartyName,
            number: finalPartyNumber,
            creditBalance: firebaseIncrement(finalBalance),
            lastUpdatedAt: serverTimestamp()
          },
          { merge: true }
        );
      }

      const actualPaid = selectedSale.paidAmount ?? 0;
      const { isUnpaidOrder, effectivePaid, effectiveDue, newStatus } = computePostReturnPaymentStatus(
        actualPaid,
        completionData?.paymentDetails,
        updatedFinalAmount
      );

      batch.update(saleRef, {
        items: newItemsList,
        totalAmount: updatedFinalAmount,

        manualDiscount: newManualDiscount,
        paymentMethods: {
          ...updatedPaymentMethods,
          due: isUnpaidOrder
            ? Math.max(0, selectedSale.totalAmount - returnedItemsGrossValue)
            : effectiveDue,
        },

        paidAmount: effectivePaid,
        status: isUnpaidOrder ? 'Completed' : newStatus,

        returnHistory: arrayUnion(safeReturnHistoryRecord),

        // --- NEW FIX: Update root fields for OrdersPage summary totals ---
        ...(creditAmountToAdd > 0 && { creditNoteAmount: firebaseIncrement(creditAmountToAdd) }),
        ...(refundAmountToAdd > 0 && { refundAmount: firebaseIncrement(refundAmountToAdd) }),

        updatedAt: serverTimestamp()
      });
      await batch.commit();
      await refreshSelectedOrder(selectedSale.id);
      setOriginalSaleItems(
        newItemsList.map((item: any) => ({
          id: item.id,
          originalItemId: item.id,
          name: item.name,
          quantity: item.quantity,
          originalQuantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.finalPrice,
          mrp: item.mrp
        }))
      );
      setSelectedSale(prev =>
        prev
          ? {
            ...prev,
            items: newItemsList
          }
          : prev
      );
      setSelectedReturnIds(new Set());
      setModal({
        type: State.SUCCESS,
        message: 'Return processed successfully!'
      });
      setTimeout(() => navigate(ROUTES.ORDERDETAILS), 1500);
    } catch (err: any) {
      console.error(err);
      setModal({
        type: State.ERROR,
        message: `Failed: ${err.message}`
      });
    } finally {
      setIsLoading(false);
      setIsDrawerOpen(false);
    }
  };

  const handleProcessReturn = () => {

    // ❌ No items selected at all
    if (itemsToReturn.length === 0 && exchangeItems.length === 0) {
      return setModal({
        type: State.ERROR,
        message: 'No items selected.'
      });
    }
    const isCreditNote =
      modeOfReturn === 'Credit Note' ||
      (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Credit Note');
    const isCashRefund =
      modeOfReturn === 'Cash Refund' ||
      (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Cash Refund');

    if ((isCreditNote || isCashRefund) && isDueSale && finalBalance > 0) {
      return setModal({
        type: State.ERROR,
        message: 'Credit Note / Cash Refund cannot be issued for an unpaid order. Please choose Exchange.'
      });
    }
    //  CREDIT NOTE
    if (modeOfReturn === 'Credit Note') {
      if (itemsToReturn.length === 0) {
        return setModal({
          type: State.ERROR,
          message: 'Please select at least one item to return.'
        });
      }

      // Ensure no exchange items are included
      setExchangeItems([]);
      saveReturnTransaction();
      return;
    }

    //  EXCHANGE
    if (modeOfReturn === 'Exchange') {
      if (itemsToReturn.length === 0) {
        return setModal({
          type: State.ERROR,
          message: 'Please select an item to exchange with.'
        });
      }

      if (exchangeItems.length === 0) {
        return setModal({
          type: State.ERROR,
          message: 'Please add an item for exchange.'
        });
      }

      if (finalBalance < 0) {
        // Customer needs to pay extra
        setIsDrawerOpen(true);
      } else {
        // No payment required
        saveReturnTransaction();
      }
      return;
    }

    //  CASH REFUND
    if (modeOfReturn === 'Cash Refund') {
      if (itemsToReturn.length === 0) {
        return setModal({
          type: State.ERROR,
          message: 'Please select at least one item for cash refund.'
        });
      }

      // Remove any mistakenly added exchange items
      setExchangeItems([]);
      saveReturnTransaction();
      return;
    }

    // 🔄 FALLBACK (Safety Check)
    if (finalBalance < 0) {
      setIsDrawerOpen(true);
    } else {
      saveReturnTransaction();
    }
  };

  const getBalanceLabel = () => {
    if (finalBalance < 0) return 'Payment Due';
    if (modeOfReturn === 'Cash Refund') return 'Refund Amount';
    if (modeOfReturn === 'Exchange' && finalBalance > 0 && exchangeBalanceAction === 'Cash Refund') return 'Refund Amount';
    return 'Credit Due';
  };

  return {
    isDrawerOpen, setIsDrawerOpen,
    exchangeBalanceAction, setExchangeBalanceAction,
    saveReturnTransaction,
    handleProcessReturn,
    getBalanceLabel,
  };
};
