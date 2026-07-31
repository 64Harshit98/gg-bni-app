/**
 * Data-access layer for the Orders Return / Exchange flow
 * (`src/Catalogue/OrdersReturn.tsx`). Wraps the Firestore reads/writes that
 * used to live inline in the component behind small, typed helpers. All
 * business logic (proportional discount clawback, stock restore/deduct on
 * return/exchange, credit-note & cash-refund ledger updates, return history)
 * is preserved exactly as it was before extraction — this is a relocation,
 * not a rewrite.
 */
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment as firebaseIncrement,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import type { PaymentCompletionData } from '../../Components/PaymentDrawer';
import type { Order, OrderItem } from '../../Catalogue/Orders';

/** Fetches every order document for a company (used to build the "original sale" picker). */
export async function fetchCompanyOrders(companyId: string): Promise<Order[]> {
  const ordersQuery = query(collection(db, 'companies', companyId, 'Orders'));
  const snap = await getDocs(ordersQuery);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order);
}

/** Fetches the catalogue sales settings doc (e.g. item-wise-discount toggle). */
export async function fetchCatalogueSettings(
  companyId: string,
): Promise<Record<string, unknown> | null> {
  const ref = doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/** Fetches every inventory item for a company (used for the exchange-item picker & stock lookups). */
export async function fetchCompanyItems(companyId: string): Promise<OrderItem[]> {
  const q = query(collection(db, 'companies', companyId, 'items'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as OrderItem);
}

/** Refetches a single order by ID (used to refresh the selected sale after a return is processed). */
export async function fetchOrderById(companyId: string, orderId: string): Promise<Order | null> {
  const orderRef = doc(db, 'companies', companyId, 'Orders', orderId);
  const snap = await getDoc(orderRef);
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Order) : null;
}

export interface ReturnTransactionItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  originalQuantity?: number;
  unitPrice: number;
  amount: number;
  discount?: number;
}

export interface ExchangeTransactionItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  salesPrice: number;
  amount: number;
  discount: number;
  basePrice: number;
  customPrice?: number | string;
}

export interface ProcessReturnParams {
  companyId: string;
  selectedSale: Order;
  partyName: string;
  partyNumber: string;
  itemsToReturn: ReturnTransactionItem[];
  exchangeItems: ExchangeTransactionItem[];
  modeOfReturn: string;
  exchangeBalanceAction: 'Credit Note' | 'Cash Refund';
  finalBalance: number;
  availableItemIds: Set<string>;
  completionData?: Partial<PaymentCompletionData>;
}

export interface ProcessReturnResult {
  newItemsList: DocumentData[];
}

/**
 * Processes a return / exchange / cash-refund for a sale in a single
 * Firestore batch: rebuilds the order's item list (returns removed,
 * exchanges added), restores/deducts inventory stock, recalculates the bill
 * total (including proportional manual-discount clawback), updates payment
 * methods + due, appends a return-history record, and — when applicable —
 * credits the customer's ledger (credit note) or records a cash refund.
 */
export async function processReturnTransaction(
  params: ProcessReturnParams,
): Promise<ProcessReturnResult> {
  const {
    companyId,
    selectedSale,
    partyName,
    partyNumber,
    itemsToReturn,
    exchangeItems,
    modeOfReturn,
    exchangeBalanceAction,
    finalBalance,
    availableItemIds,
    completionData,
  } = params;

  const batch = writeBatch(db);
  const saleRef = doc(db, 'companies', companyId, 'Orders', selectedSale.id);

  // --- 0. FINAL PARTY DETAILS ---
  const finalPartyName = (completionData?.partyName || partyName || selectedSale.userName || '').trim();
  const finalPartyNumber = (completionData?.partyNumber || partyNumber || '').trim();

  // --- 1. ORIGINAL ITEMS MAP ---
  const originalItemsMap = new Map<string, any>();

  (selectedSale.items || []).forEach((item: any) => {
    const safeId = item.id;
    const qty = Number(item.quantity) || 1;
    const total = Number(item.finalPrice || item.amount || 0);
    const unit =
      item.effectiveUnitPrice !== undefined
        ? Number(item.effectiveUnitPrice)
        : (qty > 0 ? total / qty : 0) ||
          Number(item.customPrice ?? item.unitPrice ?? item.salesPrice) ||
          0;

    originalItemsMap.set(safeId, {
      ...item,
      _effectiveUnitPrice: unit,
    });
  });

  const originalInvoiceTotal = (selectedSale.items || []).reduce(
    (sum: number, item: any) => sum + Number(item.finalPrice || 0),
    0,
  );

  // --- 2. HANDLE RETURNS ---
  let returnedItemsGrossValue = 0;

  if (modeOfReturn !== 'Exchange') {
    itemsToReturn.forEach((returnItem) => {
      const originalItem = originalItemsMap.get(returnItem.originalItemId);

      if (originalItem) {
        originalItem.quantity -= returnItem.quantity;
        returnedItemsGrossValue += originalItem._effectiveUnitPrice * returnItem.quantity;

        if (originalItem.quantity <= 0) {
          originalItemsMap.delete(returnItem.originalItemId);
        }
      }
    });
  }

  // --- 3. HANDLE EXCHANGE ---
  if (modeOfReturn === 'Exchange') {
    // remove returned items first
    itemsToReturn.forEach((returnItem) => {
      const originalItem = originalItemsMap.get(returnItem.originalItemId);

      if (originalItem) {
        originalItem.quantity -= returnItem.quantity;

        if (originalItem.quantity <= 0) {
          originalItemsMap.delete(returnItem.originalItemId);
        }
      }
    });
  }

  // add exchange items
  if (modeOfReturn === 'Exchange') {
    exchangeItems.forEach((exchangeItem) => {
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
          unitPrice: exchangeItem.amount / exchangeItem.quantity || exchangeItem.mrp,
          _effectiveUnitPrice: exchangeItem.amount / exchangeItem.quantity || exchangeItem.mrp,
        });
      }
    });
  }

  // --- 3.5 HANDLE RETURN STOCK (ADD BACK) ---
  itemsToReturn.forEach((returnItem) => {
    if (availableItemIds.has(returnItem.originalItemId)) {
      batch.update(doc(db, 'companies', companyId, 'items', returnItem.originalItemId), {
        stock: firebaseIncrement(returnItem.quantity),
        updatedAt: serverTimestamp(),
      });
    }
  });

  // --- 3.6 HANDLE EXCHANGE STOCK (DEDUCT) ---
  exchangeItems.forEach((exchangeItem) => {
    if (availableItemIds.has(exchangeItem.originalItemId)) {
      batch.update(doc(db, 'companies', companyId, 'items', exchangeItem.originalItemId), {
        stock: firebaseIncrement(-exchangeItem.quantity),
        updatedAt: serverTimestamp(),
      });
    }
  });

  // --- 4. RECALCULATE BILL ---
  const newItemsList = Array.from(originalItemsMap.values()).map((item) => {
    const safeUnit = Number(item._effectiveUnitPrice) || Number(item.unitPrice) || Number(item.mrp) || 0;

    const lineTotal = safeUnit * Number(item.quantity);

    const clean = { ...item };
    delete clean._effectiveUnitPrice;

    return {
      ...clean,
      unitPrice: safeUnit,
      salesPrice: safeUnit,
      finalPrice: lineTotal,
      amount: lineTotal,
    };
  });

  const totals = newItemsList.reduce(
    (acc, item) => {
      const gross = item.mrp * item.quantity;
      const discount = gross - item.finalPrice;
      acc.subtotal += gross;
      acc.totalItemDiscount += discount;
      return acc;
    },
    { subtotal: 0, totalItemDiscount: 0 },
  );

  // --- 5. MANUAL DISCOUNT ---
  const originalManualDiscount = Number(selectedSale.manualDiscount) || 0;
  let discountDeduction = 0;

  if (originalManualDiscount > 0 && originalInvoiceTotal > 0 && returnedItemsGrossValue > 0) {
    discountDeduction = (returnedItemsGrossValue / originalInvoiceTotal) * originalManualDiscount;
  }

  discountDeduction = Math.round(discountDeduction * 100) / 100;
  const newManualDiscount = Math.max(0, originalManualDiscount - discountDeduction);

  const updatedFinalAmount = totals.subtotal - totals.totalItemDiscount - newManualDiscount;

  // --- 6. PAYMENTS ---
  const updatedPaymentMethods: Record<string, number> = {
    ...(selectedSale.paymentMethods || {}),
  };

  if (completionData?.paymentDetails) {
    Object.entries(completionData.paymentDetails).forEach(([mode, amount]) => {
      if (mode.toLowerCase() !== 'due') {
        updatedPaymentMethods[mode] = (updatedPaymentMethods[mode] || 0) + Number(amount);
      }
    });
  }

  // Add Credit/Refund amounts to paymentMethods for OrdersPage badges
  let creditAmountToAdd = 0;
  let refundAmountToAdd = 0;

  if (finalBalance > 0) {
    if (modeOfReturn === 'Credit Note' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Credit Note')) {
      creditAmountToAdd = finalBalance;
      updatedPaymentMethods['CREDIT NOTE'] = (updatedPaymentMethods['CREDIT NOTE'] || 0) + finalBalance;
    } else if (
      modeOfReturn === 'Cash Refund' ||
      (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Cash Refund')
    ) {
      refundAmountToAdd = finalBalance;
      updatedPaymentMethods['CASH REFUND'] = (updatedPaymentMethods['CASH REFUND'] || 0) + finalBalance;
    }
  }

  const paid = Object.entries(updatedPaymentMethods)
    .filter(([k]) => k !== 'due')
    .reduce((sum, [, v]) => sum + Number(v), 0);

  updatedPaymentMethods.due = Math.max(0, updatedFinalAmount - paid);

  // --- 7. HISTORY ---
  const cleanItem = (item: ReturnTransactionItem | ExchangeTransactionItem) => ({
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
        Object.entries(completionData.paymentDetails).filter(([, v]) => v !== undefined && v !== null),
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
    partyNumber: finalPartyNumber,
  };

  const safeReturnHistoryRecord = JSON.parse(JSON.stringify(returnHistoryRecord));

  // --- 9. CUSTOMER LEDGER ---
  const shouldAddCredit =
    finalBalance > 0 &&
    (modeOfReturn === 'Credit Note' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Credit Note'));
  if (finalPartyNumber.length >= 3 && shouldAddCredit) {
    batch.set(
      doc(db, 'companies', companyId, 'customers', finalPartyNumber),
      {
        name: finalPartyName,
        number: finalPartyNumber,
        creditBalance: firebaseIncrement(finalBalance),
        lastUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  const actualPaid = selectedSale.paidAmount ?? 0;
  const isUnpaidOrder = actualPaid === 0;

  // Total paid = original paidAmount + any new payment made during this exchange
  const newPaymentAmount = completionData?.paymentDetails
    ? Object.entries(completionData.paymentDetails)
        .filter(([k]) => k.toLowerCase() !== 'due')
        .reduce((sum, [, v]) => sum + Number(v), 0)
    : 0;

  const totalPaidAfterReturn = actualPaid + newPaymentAmount;

  // Clamp: paidAmount should never exceed the new bill total
  const effectivePaid = Math.min(totalPaidAfterReturn, updatedFinalAmount);
  const effectiveDue = Math.max(0, updatedFinalAmount - effectivePaid);

  // Smart status: if due is 0 (or negligible), mark as Paid
  const newStatus = effectiveDue <= 0.1 ? 'Paid' : 'Completed';

  batch.update(saleRef, {
    items: newItemsList,
    totalAmount: updatedFinalAmount,

    manualDiscount: newManualDiscount,
    paymentMethods: {
      ...updatedPaymentMethods,
      due: isUnpaidOrder ? Math.max(0, selectedSale.totalAmount - returnedItemsGrossValue) : effectiveDue,
    },

    paidAmount: effectivePaid,
    status: isUnpaidOrder ? 'Completed' : newStatus,

    returnHistory: arrayUnion(safeReturnHistoryRecord),

    ...(creditAmountToAdd > 0 && { creditNoteAmount: firebaseIncrement(creditAmountToAdd) }),
    ...(refundAmountToAdd > 0 && { refundAmount: firebaseIncrement(refundAmountToAdd) }),

    updatedAt: serverTimestamp(),
  });

  await batch.commit();

  return { newItemsList };
}
