/**
 * Data-access layer for the Purchase entry page
 * (`src/Pages/Master/Purchase.tsx`). Wraps the Firestore reads/writes/
 * transactions that page previously made directly behind small, typed
 * functions. Stock-update math, transaction ordering, and tax/discount
 * calculations are preserved verbatim from the original component -- only
 * the I/O has been relocated and typed.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  increment as firebaseIncrement,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import type { PaymentCompletionData } from '../../Components/PaymentDrawer';
import type { SalesItem } from '../../constants/models';

export interface PurchaseItem
  extends Omit<SalesItem, 'finalPrice' | 'effectiveUnitPrice' | 'discountPercentage'> {
  purchasePrice: number | string;
  originalPurchasePrice?: number;
  purchasediscount?: number;
  purchasediscount2?: number;
  barcode?: string;
  taxRate?: number;
  taxType?: 'inclusive' | 'exclusive' | 'exempt';
  taxAmount?: number;
  taxableAmount?: number;
  stock: number;
  productId?: string;
  customPrice?: number | string;
  isEditable?: boolean;
  unitMultiplier?: number;
  unit?: string;
}

export interface PurchaseDocumentData {
  userId: string;
  partyName: string;
  partyNumber: string;
  partyAddress?: string;
  partyGstin?: string;
  invoiceNumber: string;
  items: PurchaseItem[];
  subtotal: number;
  totalDiscount?: number;
  taxableAmount?: number;
  taxAmount?: number;
  gstScheme?: 'regular' | 'composition' | 'none';
  taxType?: 'inclusive' | 'exclusive' | 'exempt';
  totalAmount: number;
  paymentMethods: { [key: string]: number };
  createdAt: any;
  companyId: string;
  voucherName?: string;
  roundingOff?: number;
  manualDiscount?: number;
  updatedAt?: any;
  extraExpenseAmount?: number;
}

export type PurchaseRecord = PurchaseDocumentData & { id: string };

/** Removes all undefined values from an object before sending to Firestore. */
export const sanitizeForFirestore = <T extends Record<string, any>>(obj: T): T => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined),
  ) as T;
};

/** Finds the settings-doc id for this company's purchase settings (settingType == 'purchase'). */
export async function findPurchaseSettingsDocId(companyId: string): Promise<string | null> {
  try {
    const settingsQuery = query(
      collection(db, 'companies', companyId, 'settings'),
      where('settingType', '==', 'purchase'),
    );
    const settingsSnapshot = await getDocs(settingsQuery);
    return settingsSnapshot.empty ? null : settingsSnapshot.docs[0].id;
  } catch (e) {
    console.error('purchaseTransaction.service: error finding settings doc id', e);
    return null;
  }
}

/**
 * Live-subscribes to the company's purchase invoice counter document.
 * `onChange` receives the next invoice number to display. Returns the
 * Firestore unsubscribe function.
 */
export function subscribeToPurchaseCounter(
  companyId: string,
  onChange: (nextNumber: number) => void,
): Unsubscribe {
  const counterRef = doc(db, 'companies', companyId, 'counters', 'purchaseCounter');
  return onSnapshot(counterRef, (docSnap) => {
    if (docSnap.exists()) {
      onChange(docSnap.data().currentNumber || 1);
    } else {
      onChange(1);
    }
  });
}

/** Fetches the item-group id -> display-name map for this company. */
export async function fetchItemGroupMap(companyId: string): Promise<Record<string, string>> {
  const groupMap: Record<string, string> = {};
  try {
    const groupsRef = collection(db, 'companies', companyId, 'itemGroups');
    const groupsSnap = await getDocs(groupsRef);
    groupsSnap.docs.forEach((groupDoc) => {
      const data = groupDoc.data();
      groupMap[groupDoc.id] = data.name || data.groupName || 'Unknown Group';
    });
  } catch (e) {
    console.error('purchaseTransaction.service: error fetching item groups', e);
  }
  return groupMap;
}

/** Fetches a single purchase document by id, for edit-mode initialization. */
export async function fetchPurchaseById(
  companyId: string,
  purchaseId: string,
): Promise<PurchaseRecord | null> {
  const purchaseDocRef = doc(db, 'companies', companyId, 'purchases', purchaseId);
  const docSnap = await getDoc(purchaseDocRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as PurchaseRecord;
}

export interface CreatePurchaseParams {
  companyId: string;
  userId: string;
  invoiceNumber: string;
  completionData: PaymentCompletionData;
  formattedItemsForDB: PurchaseItem[];
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  taxAmount: number;
  gstScheme: 'regular' | 'composition' | 'none';
  taxType: 'inclusive' | 'exclusive' | 'exempt';
  roundingOffAmount: number;
  finalAmount: number;
  voucherName?: string;
  createdAt: Date;
}

/**
 * Creates a new purchase document and increments item stock, atomically, in
 * a single Firestore transaction. Preserves the exact transaction/
 * stock-update order from the original `createNewPurchase` handler.
 */
export async function createPurchaseTransaction(params: CreatePurchaseParams): Promise<void> {
  const {
    companyId,
    userId,
    invoiceNumber,
    completionData,
    formattedItemsForDB,
    subtotal,
    totalDiscount,
    taxableAmount,
    taxAmount,
    gstScheme,
    taxType,
    roundingOffAmount,
    finalAmount,
    voucherName,
    createdAt,
  } = params;

  const manualDiscount = completionData.discount || 0;
  const finalTotalAmount = Math.max(0, finalAmount - manualDiscount);

  await runTransaction(db, async (transaction) => {
    const purchaseData: Omit<PurchaseDocumentData, 'id'> = {
      userId,
      partyName: completionData.partyName.trim(),
      partyNumber: completionData.partyNumber.trim(),
      partyAddress: completionData.partyAddress || '',
      partyGstin: completionData.partyGST || '',
      invoiceNumber,
      items: formattedItemsForDB,
      subtotal,
      totalDiscount,
      taxableAmount,
      taxAmount,
      gstScheme,
      taxType,
      roundingOff: roundingOffAmount,
      manualDiscount,
      totalAmount: finalTotalAmount,
      paymentMethods: completionData.paymentDetails,
      createdAt,
      companyId,
      voucherName: voucherName ?? 'Purchase',
    };

    const newPurchaseRef = doc(collection(db, 'companies', companyId, 'purchases'));
    transaction.set(newPurchaseRef, sanitizeForFirestore(purchaseData));

    const stockUpdates = new Map<string, number>();
    formattedItemsForDB.forEach((item) => {
      const pid = item.id;
      stockUpdates.set(pid, (stockUpdates.get(pid) || 0) + (item.quantity || 1));
    });

    stockUpdates.forEach((qty, pid) => {
      const itemRef = doc(db, 'companies', companyId, 'items', pid);
      transaction.update(itemRef, {
        stock: firebaseIncrement(qty),
        updatedAt: serverTimestamp(),
      });
    });
  });
}

export interface UpdatePurchaseParams {
  companyId: string;
  purchaseId: string;
  invoiceNumber: string;
  completionData: PaymentCompletionData;
  formattedItemsForDB: PurchaseItem[];
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  taxAmount: number;
  gstScheme: 'regular' | 'composition' | 'none';
  taxType: 'inclusive' | 'exclusive' | 'exempt';
  roundingOffAmount: number;
  finalAmount: number;
  createdAt: Date;
}

/**
 * Updates an existing purchase document: recomputes the stock delta between
 * the previously-saved item quantities and the new ones and applies it
 * atomically alongside the document update. Preserves the exact
 * transaction/stock-diff logic from the original `updateExistingPurchase`
 * handler.
 */
export async function updatePurchaseTransaction(params: UpdatePurchaseParams): Promise<void> {
  const {
    companyId,
    purchaseId,
    invoiceNumber,
    completionData,
    formattedItemsForDB,
    subtotal,
    totalDiscount,
    taxableAmount,
    taxAmount,
    gstScheme,
    taxType,
    roundingOffAmount,
    finalAmount,
    createdAt,
  } = params;

  const manualDiscount = completionData.discount || 0;
  const finalTotalAmount = Math.max(0, finalAmount - manualDiscount);

  await runTransaction(db, async (transaction) => {
    const purchaseRef = doc(db, 'companies', companyId, 'purchases', purchaseId);
    const purchaseDoc = await transaction.get(purchaseRef);
    if (!purchaseDoc.exists()) throw new Error('Purchase not found.');

    const originalItemsMap = new Map(
      ((purchaseDoc.data().items as PurchaseItem[]) || []).map((item) => [item.id, item.quantity || 1]),
    );
    const currentItemsMap = new Map(
      formattedItemsForDB.map((item) => [item.id, item.quantity || 1]),
    );
    const allItemIds = new Set([...originalItemsMap.keys(), ...currentItemsMap.keys()]);

    allItemIds.forEach((id) => {
      const oldQty = originalItemsMap.get(id) || 0;
      const newQty = currentItemsMap.get(id) || 0;
      const difference = newQty - oldQty;

      if (difference !== 0) {
        const itemRef = doc(db, 'companies', companyId, 'items', id);
        transaction.update(itemRef, {
          stock: firebaseIncrement(difference),
        });
      }
    });

    const updatedPurchaseData: Partial<PurchaseDocumentData> = {
      partyName: completionData.partyName.trim(),
      partyNumber: completionData.partyNumber.trim(),
      partyAddress: completionData.partyAddress || '',
      partyGstin: completionData.partyGST || '',
      invoiceNumber,
      items: formattedItemsForDB,
      subtotal,
      totalDiscount,
      taxableAmount,
      taxAmount,
      gstScheme,
      taxType,
      roundingOff: roundingOffAmount,
      manualDiscount,
      totalAmount: finalTotalAmount,
      paymentMethods: completionData.paymentDetails,
      updatedAt: serverTimestamp(),
      createdAt,
    };

    transaction.update(purchaseRef, sanitizeForFirestore(updatedPurchaseData));
  });
}
