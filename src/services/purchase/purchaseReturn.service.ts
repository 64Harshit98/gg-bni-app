/**
 * Data-access layer for the Purchase Return page
 * (`src/Pages/Master/PurchaseReturn.tsx`). Wraps the Firestore reads/
 * writes/batch commit that page previously made directly behind small,
 * typed functions. Stock-update math, balance/tax calculations, and write
 * ordering are preserved verbatim from the original component -- only the
 * I/O has been relocated and typed.
 */
import {
  collection,
  query,
  getDocs,
  doc,
  getDoc,
  type DocumentData,
  orderBy,
  limit,
  type DocumentSnapshot,
  writeBatch,
  increment as firebaseIncrement,
  arrayUnion,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import type { PurchaseItem as OriginalPurchaseItem } from '../../constants/models';

export interface PurchaseData {
  id: string;
  invoiceNumber: string;
  partyName: string;
  partyNumber?: string;
  partyAddress?: string;
  taxType?: 'inclusive' | 'exclusive' | 'exempt';
  partyGstin?: string;
  items: OriginalPurchaseItem[];
  totalAmount: number;
  manualDiscount?: number;
  createdAt: any;
  isReturned?: boolean;
  paymentMethods?: { [key: string]: number };
}

export interface Party {
  id?: string;
  name: string;
  number: string;
  [key: string]: any;
}

export interface ReturnInitialData {
  recentPurchases: PurchaseData[];
  availableItems: import('../../constants/models').Item[];
  availableParties: Party[];
}

/**
 * Loads the recent purchases list (last 50), the supplier/party list (up to
 * 100), the current inventory, and -- when navigated to with a specific
 * `purchaseId` that isn't already carried via router state -- that single
 * purchase doc, all in parallel. Mirrors the original `fetchData` effect
 * body exactly.
 */
export async function fetchPurchaseReturnInitialData(
  companyId: string,
  syncItems: () => Promise<import('../../constants/models').Item[]>,
  purchaseId: string | undefined,
  hasInvoiceDataFromState: boolean,
): Promise<ReturnInitialData & { specificPurchase: PurchaseData | null }> {
  const purchasesQuery = query(
    collection(db, 'companies', companyId, 'purchases'),
    orderBy('createdAt', 'desc'),
    limit(50),
  );

  const partiesQuery = query(collection(db, 'companies', companyId, 'suppliers'), limit(100));

  let specificPurchasePromise: Promise<DocumentSnapshot<DocumentData, DocumentData> | null> = Promise.resolve(null);

  if (purchaseId && !hasInvoiceDataFromState) {
    const specificRef = doc(db, 'companies', companyId, 'purchases', purchaseId);
    specificPurchasePromise = getDoc(specificRef);
  }

  const [purchasesSnapshot, allItems, partiesSnap, specificPurchaseSnap] = await Promise.all([
    getDocs(purchasesQuery),
    syncItems(),
    getDocs(partiesQuery),
    specificPurchasePromise,
  ]);

  const recentPurchases: PurchaseData[] = purchasesSnapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() } as PurchaseData),
  );
  const availableParties = partiesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Party));

  const specificPurchase = specificPurchaseSnap && specificPurchaseSnap.exists()
    ? ({ id: specificPurchaseSnap.id, ...specificPurchaseSnap.data() } as PurchaseData)
    : null;

  return {
    recentPurchases,
    availableItems: allItems,
    availableParties,
    specificPurchase,
  };
}

/**
 * Resolves the item document ref to update stock on: prefers a doc whose id
 * equals the barcode, falls back to a `where('barcode', '==', ...)` query,
 * and finally falls back to the given inventory id. Mirrors the original
 * `getItemDocRef` helper exactly.
 */
export async function getItemDocRef(companyId: string, barcode: string | undefined, fallbackId: string) {
  if (!barcode) return doc(db, 'companies', companyId, 'items', fallbackId);

  const barcodeAsIdRef = doc(db, 'companies', companyId, 'items', barcode);
  const barcodeAsIdSnap = await getDoc(barcodeAsIdRef);
  if (barcodeAsIdSnap.exists()) return barcodeAsIdRef;

  const q = query(collection(db, 'companies', companyId, 'items'), where('barcode', '==', barcode));
  const querySnap = await getDocs(q);

  if (!querySnap.empty) {
    return querySnap.docs[0].ref;
  }
  return doc(db, 'companies', companyId, 'items', fallbackId);
}

export interface ReturnItemInput {
  id: string;
  originalItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  mrp: number;
  tax?: number;
  hsnSac?: string;
  barcode?: string;
  unit?: string;
  unitMultiplier?: number;
}

export interface NewItemReceivedInput extends ReturnItemInput {
  discount?: number;
}

export interface SaveReturnTransactionParams {
  companyId: string;
  selectedPurchase: PurchaseData;
  itemsToReturn: ReturnItemInput[];
  newItemsReceived: NewItemReceivedInput[];
  availableItems: import('../../constants/models').Item[];
  activeTaxMode: 'inclusive' | 'exclusive' | 'exempt';
  discountDeducted: number;
  finalBalance: number;
  modeOfReturn: string;
  exchangeBalanceAction: 'Debit Note' | 'Cash Refund';
  finalSupplierName: string;
  finalSupplierNumber: string;
  supplierAddress: string;
  supplierGstin: string;
  completionDiscount: number;
  completionPaymentDetails?: { [key: string]: number } | null;
  completionPartyAddress?: string;
  completionPartyGST?: string;
}

/**
 * Commits a purchase-return transaction as a single Firestore batch:
 * decrements stock for every returned item, increments stock for every new
 * (exchange) item, rewrites the purchase's item list/totals, appends a
 * return-history record, and upserts the supplier's debit balance when
 * applicable. Preserves the exact batch write order and math from the
 * original `saveReturnTransaction` handler.
 */
export async function saveReturnTransaction(params: SaveReturnTransactionParams): Promise<void> {
  const {
    companyId,
    selectedPurchase,
    itemsToReturn,
    newItemsReceived,
    availableItems,
    activeTaxMode,
    discountDeducted,
    finalBalance,
    modeOfReturn,
    exchangeBalanceAction,
    finalSupplierName,
    finalSupplierNumber,
    supplierAddress,
    supplierGstin,
    completionDiscount,
    completionPaymentDetails,
    completionPartyAddress,
    completionPartyGST,
  } = params;

  const batch = writeBatch(db);
  const purchaseRef = doc(db, 'companies', companyId, 'purchases', selectedPurchase.id);

  const originalItemsMap = new Map(selectedPurchase.items.map((item) => [item.id, { ...item }]));

  for (const returnItem of itemsToReturn) {
    const originalItem = originalItemsMap.get(returnItem.originalItemId);
    if (originalItem) {
      originalItem.quantity -= returnItem.quantity;
      if (originalItem.quantity <= 0) originalItemsMap.delete(returnItem.originalItemId);
    }
    const itemDocRef = await getItemDocRef(companyId, returnItem.barcode, returnItem.originalItemId);
    batch.update(itemDocRef, { stock: firebaseIncrement(-returnItem.quantity), updatedAt: serverTimestamp() });
  }

  for (const newItem of newItemsReceived) {
    const originalItem = originalItemsMap.get(newItem.originalItemId);
    if (originalItem) {
      originalItem.quantity += newItem.quantity;
    } else {
      const itemMaster = availableItems.find((i) => i.id === newItem.originalItemId);
      const itemTaxRate = (itemMaster?.tax !== undefined) ? Number(itemMaster.tax) : 0;

      const lineTotal = newItem.unitPrice * newItem.quantity;
      let lineBase = lineTotal;
      let lineTax = 0;

      if (activeTaxMode === 'inclusive' && itemTaxRate > 0) {
        lineBase = lineTotal / (1 + (itemTaxRate / 100));
        lineTax = lineTotal - lineBase;
      } else if (activeTaxMode === 'exclusive' && itemTaxRate > 0) {
        lineTax = lineTotal * (itemTaxRate / 100);
      }
      originalItemsMap.set(newItem.originalItemId, {
        id: newItem.originalItemId,
        name: newItem.name,
        quantity: newItem.quantity,
        purchasePrice: newItem.unitPrice,
        mrp: newItem.mrp || 0,
        tax: newItem.tax || 0,
        taxRate: itemTaxRate,
        taxType: activeTaxMode,
        taxableAmount: lineBase,
        taxAmount: lineTax,
        finalPrice: activeTaxMode === 'exclusive' ? lineBase + lineTax : lineTotal,
        hsnSac: newItem.hsnSac || '',
        barcode: newItem.barcode || '',
        unit: newItem.unit || '',
        unitMultiplier: newItem.unitMultiplier || 1,
      } as any);
    }
    const itemDocRef = await getItemDocRef(companyId, newItem.barcode, newItem.originalItemId);
    batch.update(itemDocRef, { stock: firebaseIncrement(newItem.quantity), updatedAt: serverTimestamp() });
  }

  const newItemsList = Array.from(originalItemsMap.values());
  const newGrossTotal = newItemsList.reduce((sum, item) => sum + (item.quantity * (item.purchasePrice || 0)), 0);
  const currentTransactionBillDiscount = Number(completionDiscount || 0);
  const originalManualDiscount = Number(selectedPurchase.manualDiscount) || 0;
  const newManualDiscount = Math.max(0, originalManualDiscount - discountDeducted) + currentTransactionBillDiscount;
  const newTotalAmount = newGrossTotal - newManualDiscount;
  const updatedPaymentMethods: any = { ...(selectedPurchase.paymentMethods || {}) };

  if (completionPaymentDetails) {
    Object.entries(completionPaymentDetails).forEach(([mode, amount]) => {
      if (mode !== 'due') {
        updatedPaymentMethods[mode] = (updatedPaymentMethods[mode] || 0) + Number(amount);
      }
    });
  }

  const totalPaidSoFar = Object.entries(updatedPaymentMethods)
    .filter(([k]) => k !== 'due')
    .reduce((sum, [, val]) => sum + Number(val), 0);

  updatedPaymentMethods.due = Math.max(0, newTotalAmount - totalPaidSoFar);

  const actualReturnMode = modeOfReturn === 'Exchange' && finalBalance > 0
    ? `Exchange & ${exchangeBalanceAction}`
    : modeOfReturn;

  const returnHistoryRecord = {
    id: crypto.randomUUID(),
    returnedAt: new Date(),
    returnedItems: itemsToReturn.map(({ id, ...item }) => item),
    newItemsReceived: newItemsReceived.map(({ id, ...item }) => item),
    finalBalance,
    discountDeducted,
    modeOfReturn: actualReturnMode,
    returnType: actualReturnMode,
    paymentDetails: completionPaymentDetails || null,
    invoiceNumber: selectedPurchase.invoiceNumber,
    partyName: finalSupplierName,
    partyNumber: finalSupplierNumber,
    billDiscount: currentTransactionBillDiscount,
  };

  const updateData: any = {
    partyName: finalSupplierName,
    partyNumber: finalSupplierNumber,
    items: newItemsList,
    totalAmount: newTotalAmount,
    manualDiscount: newManualDiscount,
    returnHistory: arrayUnion(returnHistoryRecord),
    returnedItemsSnapshot: arrayUnion(...itemsToReturn.map((i) => ({
      id: i.originalItemId,
      name: i.name,
      quantity: i.quantity,
      finalPrice: i.amount,
      mrp: i.mrp,
    }))),
    paymentMethods: updatedPaymentMethods,
    isReturned: true,
    lastUpdated: serverTimestamp(),
  };

  batch.update(purchaseRef, updateData);

  if (finalSupplierNumber.length >= 3) {
    const supplierRef = doc(db, 'companies', companyId, 'suppliers', finalSupplierNumber);
    const supplierUpdateData: any = {
      name: finalSupplierName,
      number: finalSupplierNumber,
      address: completionPartyAddress || supplierAddress || selectedPurchase.partyAddress || '',
      gstin: completionPartyGST || supplierGstin || selectedPurchase.partyGstin || '',
      companyId,
      lastUpdatedAt: serverTimestamp(),
    };

    const shouldAddDebit = finalBalance > 0
      && (modeOfReturn === 'Debit Note' || (modeOfReturn === 'Exchange' && exchangeBalanceAction === 'Debit Note'));

    if (shouldAddDebit) {
      const netDebitToAdd = finalBalance - (completionDiscount || 0);
      if (netDebitToAdd > 0) {
        supplierUpdateData.debitBalance = firebaseIncrement(netDebitToAdd);
      }
    }

    batch.set(supplierRef, supplierUpdateData, { merge: true });
  }

  await batch.commit();
}
