import { useState } from 'react';
import { db } from '../../../lib/Firebase';
import {
  doc,
  getDoc,
  writeBatch,
  arrayUnion,
  serverTimestamp,
  increment as firebaseIncrement,
} from 'firebase/firestore';
import { State } from '../../../enums';
import { ROUTES } from '../../../constants/routes.constants';
import type { PaymentCompletionData } from '../../../Components/PaymentDrawer';
import { addOnStockToRestore } from '../../../constants/models';
import { calcReturnReversal, readSaleLoyalty, writeLoyaltyInBatch } from '../../../lib/loyalty';
import type { Order, OrderItem } from '../../Orders';
import type { TransactionItem, ExchangeItem } from '../ordersReturn.types';
import {
  computeOrderReturn,
  computePostReturnPaymentStatus,
  mapOrderItemToTransactionItem,
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
  // Set after a successful return, drives the "Return completed + Send on WhatsApp" popup
  const [returnSuccess, setReturnSuccess] = useState<{
    order: Order;
    creditUpdated: boolean;
    creditAdded: number;
    newCreditBalance: number;
  } | null>(null);

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

      // --- 1–5. RETURN / EXCHANGE MATHS ---
      // Same function as the on-screen summary: re-taxes the remaining and new
      // lines, takes back the bill discount in proportion, and works out the
      // balance as the change in the order total.
      const result = computeOrderReturn(
        selectedSale as any,
        itemsToReturn,
        modeOfReturn === 'Exchange' ? exchangeItems : [],
        modeOfReturn,
        availableItems as any[]
      );
      const newItemsList = result.newItems.map((item) => {
        const clean: Record<string, any> = { ...item };
        Object.keys(clean).forEach((k) => { if (clean[k] === undefined) delete clean[k]; });
        return clean as OrderItem;
      });
      const discountDeduction = result.discountDeducted;
      const newManualDiscount = result.newManualDiscount;
      const updatedFinalAmount = result.after.total;

      const validInventoryIds = new Set(availableItems.map(i => String(i.id)));

      // --- 3.5 HANDLE RETURN STOCK (ADD BACK) ---
      // Lines added in the order editor have their own line id — the stock item is
      // `itemId`. A pack line (e.g. box of 6) took quantity × pieces out of stock at
      // checkout, so the same goes back.
      const restoreByItem = new Map<string, number>();
      itemsToReturn.forEach(returnItem => {
        const billLine: any = (selectedSale.items || []).find((i: any) => i.id === returnItem.originalItemId);
        const stockId = String(billLine?.itemId || billLine?.id || returnItem.originalItemId);
        const pieces = Number(billLine?.unitMultiplier) || 1;
        restoreByItem.set(stockId, (restoreByItem.get(stockId) || 0) + Number(returnItem.quantity) * pieces);
      });
      restoreByItem.forEach((qty, stockId) => {
        if (validInventoryIds.has(stockId)) {
          batch.update(
            doc(db, 'companies', companyId, 'items', stockId),
            {
              stock: firebaseIncrement(qty),
              updatedAt: serverTimestamp()
            }
          );
        }
      });

      // --- 3.5b RETURN STOCK for linked add-on items (e.g. Coke sold with a burger) ---
      const linkedRestore = new Map<string, number>();
      itemsToReturn.forEach(returnItem => {
        // Read from the untouched order, since originalItemsMap lines may already be reduced/removed above
        const billLine = (selectedSale.items || []).find((i: any) => i.id === returnItem.originalItemId);
        if (billLine) {
          addOnStockToRestore(billLine as any, Number(returnItem.quantity)).forEach((qty, itemId) =>
            linkedRestore.set(itemId, (linkedRestore.get(itemId) || 0) + qty));
        }
      });
      linkedRestore.forEach((qty, itemId) => {
        if (validInventoryIds.has(itemId)) {
          batch.update(
            doc(db, 'companies', companyId, 'items', itemId),
            { stock: firebaseIncrement(qty), updatedAt: serverTimestamp() }
          );
        }
      });

      // --- 3.6 HANDLE EXCHANGE STOCK (DEDUCT) ---
      (modeOfReturn === 'Exchange' ? exchangeItems : []).forEach(exchangeItem => {
        if (validInventoryIds.has(String(exchangeItem.originalItemId))) {
          batch.update(
            doc(db, 'companies', companyId, 'items', exchangeItem.originalItemId),
            {
              stock: firebaseIncrement(-exchangeItem.quantity),
              updatedAt: serverTimestamp()
            }
          );
        }
      });

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

      // Credit/refund issued by THIS return/exchange still reduces what's due on
      // the bill (below), and is separately tracked via creditNoteAmount/
      // refundAmount (root-level firebaseIncrement, further down). It must NOT
      // also be written into paymentMethods['CREDIT NOTE']/['CASH REFUND'] — that
      // field is for amounts actually PAID via the settle-payment drawer
      // (useOrderPayment.ts). Writing the issuance there too double-counts the
      // same event once the customer later settles the remaining due using that
      // credit (issuance + settlement both landing in the same badge total).
      let creditAmountToAdd = 0;
      let refundAmountToAdd = 0;

      if (finalBalance > 0) {
        if (modeOfReturn === 'Credit Note' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Credit Note')) {
          creditAmountToAdd = finalBalance;
        } else if (modeOfReturn === 'Cash Refund' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Cash Refund')) {
          refundAmountToAdd = finalBalance;
        }
      }

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
        exchangeItems: (modeOfReturn === 'Exchange' ? exchangeItems : []).map(cleanItem),
        finalBalance,
        // GST that went back with the returned items / came in with the new ones
        returnTax: result.returnTax,
        exchangeTax: result.exchangeTax,
        roundOff: result.roundOff,
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

      // --- 9b. LOYALTY: take back earned points in proportion to how much the order went down.
      // Points the customer USED are not given back — the refund / credit note covers the value.
      let loyaltyUpdate: Record<string, unknown> = {};
      const savedOrderSnap = await getDoc(saleRef);
      const savedOrder: any = savedOrderSnap.exists() ? savedOrderSnap.data() : {};
      const orderLoyalty = readSaleLoyalty(savedOrder);
      if (orderLoyalty && orderLoyalty.earned > 0) {
        const totalBefore = Number(savedOrder.totalAmount) || 0;
        const reduction = Math.max(0, totalBefore - updatedFinalAmount);
        const takeBack = calcReturnReversal(orderLoyalty.earned, reduction, totalBefore);
        if (takeBack > 0) {
          writeLoyaltyInBatch(batch, db, companyId, orderLoyalty.phone, [{
            type: 'reverse',
            points: -takeBack,
            refType: 'return',
            refId: selectedSale.id,
            invoiceNumber: savedOrder.orderId || '',
            note: `Online order items returned (₹${reduction.toFixed(2)})`,
            extra: { reverses: 'earn' },
          }], { actor: { uid: currentUser.uid, name: currentUser.name || '' } });
          loyaltyUpdate = { loyalty: { ...orderLoyalty, earned: orderLoyalty.earned - takeBack } };
        }
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
        // Bill-level figures, same as the editor saves them
        totalTax: Number(result.after.tax.toFixed(2)),
        baseAmount: Number(result.after.itemsBase.toFixed(2)),
        roundOff: Number((result.after.total - Math.max(0, result.after.raw)).toFixed(2)),

        manualDiscount: newManualDiscount,
        paymentMethods: {
          ...updatedPaymentMethods,
          // Whatever is still owed on the new total (also for orders that were unpaid —
          // the old formula ignored GST, the bill discount and exchanged-in items)
          due: effectiveDue,
        },

        paidAmount: effectivePaid,
        status: isUnpaidOrder ? 'Completed' : newStatus,

        returnHistory: arrayUnion(safeReturnHistoryRecord),

        // --- NEW FIX: Update root fields for OrdersPage summary totals ---
        ...(creditAmountToAdd > 0 && { creditNoteAmount: firebaseIncrement(creditAmountToAdd) }),
        ...(refundAmountToAdd > 0 && { refundAmount: firebaseIncrement(refundAmountToAdd) }),
        ...loyaltyUpdate,

        updatedAt: serverTimestamp()
      });
      await batch.commit();
      await refreshSelectedOrder(selectedSale.id);
      setOriginalSaleItems(
        newItemsList
          .map((item: any) => mapOrderItemToTransactionItem(item))
          .filter(Boolean) as TransactionItem[]
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

      // Re-read the updated order + customer so the WhatsApp bill/credit message use fresh numbers
      const creditUpdated = finalPartyNumber.length >= 3 && shouldAddCredit;
      let updatedOrder: any = null;
      let newCreditBalance = 0;
      try {
        const savedSnap = await getDoc(saleRef);
        if (savedSnap.exists()) {
          const sd: any = savedSnap.data();
          updatedOrder = {
            ...sd,
            id: selectedSale.id,
            orderId: sd.orderId || selectedSale.orderId,
            time: sd.time ?? selectedSale.time,
            userName: sd.userName || finalPartyName,
            userLoginPhone: sd.userLoginPhone || finalPartyNumber,
          };
        }
        if (creditUpdated) {
          const custSnap = await getDoc(doc(db, 'companies', companyId, 'customers', finalPartyNumber));
          newCreditBalance = Number(custSnap.data()?.creditBalance) || 0;
        }
      } catch (e) {
        console.warn('Could not re-read updated order for WhatsApp share:', e);
      }

      if (updatedOrder) {
        setReturnSuccess({
          order: updatedOrder as Order,
          creditUpdated,
          creditAdded: creditUpdated ? finalBalance : 0,
          newCreditBalance,
        });
      } else {
        // Fallback: old behaviour
        setModal({ type: State.SUCCESS, message: 'Return processed successfully!' });
        setTimeout(() => navigate(ROUTES.ORDERDETAILS), 1500);
      }
    } catch (err: any) {
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

    // A standalone Credit Note/Cash Refund (no exchange) is still blocked on a
    // due order — that's a real return with nothing new bought, so cash/credit
    // shouldn't move while the order is still unpaid. But an EXCHANGE's balance
    // must always be offered as Credit Note or Cash Refund regardless of the
    // order's paid status — it's the difference on the new, replacing items,
    // not a payout against the old unpaid ones. (Matches the same scoping
    // applied to the Sales-return module's handleProcessReturn.)
    if (modeOfReturn !== 'Exchange' && (isCreditNote || isCashRefund) && isDueSale && finalBalance > 0) {
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
    returnSuccess, setReturnSuccess,
    saveReturnTransaction,
    handleProcessReturn,
    getBalanceLabel,
  };
};
