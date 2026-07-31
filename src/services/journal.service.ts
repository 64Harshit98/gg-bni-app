import {
  collection,
  query,
  onSnapshot,
  orderBy,
  Timestamp,
  QuerySnapshot,
  doc,
  getDoc,
  setDoc,
  type DocumentData,
  type Unsubscribe,
  runTransaction,
  increment,
  serverTimestamp,
  writeBatch,
  getDocs,
  where,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/Firebase';
import { getFirestoreOperations } from '../lib/ItemsFirebase';
import { normalizePlan } from '../context/Plan';
import { PLANS } from '../enums';
import type { SalesSettings } from '../Pages/Settings/SalesSetting';
import { resolveCompanyLogoBase64 } from '../Catalogue/hooks/useCompanyLogo';

// ─── Domain types ────────────────────────────────────────────────────────────

export interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  finalPrice: number;
  mrp: number;
  barcode?: string;
  stock?: number;
  gst?: number;
  taxRate?: number;
  hsnSac?: string;
  effectiveUnitPrice?: number;
  unit?: string;
  discount?: number;
  discount2?: number;
  manualDiscount?: number;
  purchasePrice?: number;
  purchasediscount?: number;
  taxType?: string;
  taxAmount?: number;
  taxableAmount?: number;
  salesPrice?: number;
  discountPercentage?: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  time: string;
  status: 'Paid' | 'Unpaid';
  type: 'Debit' | 'Credit';
  partyName: string;
  partyNumber?: string;
  partyAddress?: string;
  partyGstin?: string;
  createdAt: Date;
  dueAmount?: number;
  items?: InvoiceItem[];
  paymentMethods?: DocumentData;
  paymentHistory?: any[];
  returnHistory?: DocumentData[];
  returnedItemsSnapshot?: any[];
  salesmanId?: string | null;
  salesmanName?: string;
  manualDiscount?: number;
  taxType?: string;
  gstScheme?: string;
  subtotal?: number;
  taxAmount?: number;
  taxableAmount?: number;
  totalDiscount?: number;
  roundingOff?: number;
  voucherName?: string;
  shippingName?: string;
  shippingNumber?: string;
  shippingAddress?: string;
  shippingGST?: string;
  placeOfSupply?: string;
  expenses?: { name: string; amount: number }[];
  extraExpenseName?: string;
  extraExpenseAmount?: number;
  narration?: string;
  transportDetails?: {
    transportName?: string;
    grRrNo?: string;
    grRrDate?: string;
    vehicleNo?: string;
    stationFrom?: string;
    pinCode?: string;
  };
  isEstimate?: boolean;
}

export interface PdfData {
  printFormat?: 'A4' | 'THERMAL58';
  enableTriplicate?: boolean;
  gstScheme: string;
  taxType: string;
  companyName: string;
  companyAddress: string;
  companyContact: string;
  companyEmail: string;
  companyLogoBase64?: string;
  signatureBase64: string;
  companyGstin: string;
  msmeNumber: string;
  panNumber: string;
  placeOfSupply?: string;
  companyState?: string;
  billDiscount: number;
  discountDisplayFormat?: 'amount' | 'percentage';
  upiId: string;
  billTo: {
    name: string;
    address: string;
    phone: string;
    gstin: string;
  };
  shipTo?: {
    name: string;
    address: string;
    phone: string;
    gstin?: string;
  };
  expenses: { name: string; amount: number }[];
  extraExpenseName?: string;
  extraExpenseAmount?: number;
  narration?: string;
  transportDetails?: {
    transportName?: string;
    grRrNo?: string;
    grRrDate?: string;
    vehicleNo?: string;
    stationFrom?: string;
    pinCode?: string;
  };
  invoice: {
    number: string;
    date: string;
    billedBy: string;
    roNumber: string;
  };
  items: any[];
  terms: string;
  finalAmount: number;
  advance?: number;
  due?: number;
  previousBalance?: number;
  isEstimate?: boolean;
  bankDetails: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    ifsc: string;
  };
}

const formatInvoiceTime = (date: Date): string => {
  if (!date) return 'N/A';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
};

/** Maps a `sales` or `purchases` query snapshot into typed `Invoice[]`. */
export function mapInvoiceSnapshot(snapshot: QuerySnapshot, type: 'Credit' | 'Debit'): Invoice[] {
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
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
        salesPrice: Number(item.salesPrice) || 0,
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
      0,
    );
    const returnHistory = data.returnHistory || [];
    const savedAmount = Number(data.totalAmount) || 0;
    const changeReturned = Number(data.revDiscount) || 0;
    const fallbackAmount = calculatedTotal - changeReturned;
    const correctDisplayAmount = savedAmount > 0 ? savedAmount : fallbackAmount;

    return {
      id: docSnap.id,
      invoiceNumber: data.invoiceNumber || `#${docSnap.id.slice(0, 6).toUpperCase()}`,
      amount: correctDisplayAmount,
      manualDiscount: data.manualDiscount || 0,
      time: formatInvoiceTime(createdAt),
      status: status,
      type: type,
      partyName: data.partyName || 'N/A',
      partyNumber: data.partyNumber || '',
      partyAddress: data.partyAddress || '',
      partyGstin: data.partyGstin || '',
      placeOfSupply: data.placeOfSupply || '',
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
}

/** Subscribes to the `sales` collection, mapped to `Invoice[]` (type `Credit`). */
export function subscribeSalesInvoices(
  companyId: string,
  onData: (invoices: Invoice[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  const salesQuery = query(collection(db, 'companies', companyId, 'sales'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    salesQuery,
    (snapshot) => onData(mapInvoiceSnapshot(snapshot, 'Credit')),
    (err) => {
      console.error('Sales listener error:', err);
      onError('Failed to load sales.');
    },
  );
}

/** Subscribes to the `purchases` collection, mapped to `Invoice[]` (type `Debit`). */
export function subscribePurchaseInvoices(
  companyId: string,
  onData: (invoices: Invoice[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  const purchasesQuery = query(collection(db, 'companies', companyId, 'purchases'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    purchasesQuery,
    (snapshot) => onData(mapInvoiceSnapshot(snapshot, 'Debit')),
    (err) => {
      console.error('Purchases listener error:', err);
      onError('Failed to load purchases.');
    },
  );
}

/** Checks a PDC (post-dated cheque) payment against today's date and, if it
 * crosses a notification threshold that hasn't already fired, records the
 * notified date and dispatches a `pdc_notification` window event. */
export async function maybeNotifyPdcCheque(
  companyId: string,
  invoice: Invoice,
  payment: { method?: string; chequeDate?: string; chequeNumber?: string; amount?: number },
): Promise<void> {
  if (payment.method !== 'PDC' || !payment.chequeDate) return;

  const today = new Date();
  const chequeDate = new Date(payment.chequeDate);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const chequeMid = new Date(chequeDate.getFullYear(), chequeDate.getMonth(), chequeDate.getDate());

  const diffTime = chequeMid.getTime() - todayMid.getTime();
  const rawDays = diffTime / (1000 * 60 * 60 * 24);
  const diffDays = Math.ceil(rawDays);

  if (!(diffDays === 1 || diffDays === 0 || diffDays < 0 || diffDays <= -7)) return;

  const invoiceRef = doc(db, 'companies', companyId, invoice.type === 'Credit' ? 'sales' : 'purchases', invoice.id);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(invoiceRef);
    if (!snap.exists()) return;

    const data = snap.data() as any;
    const notified = data.pdcNotifiedDates || [];

    if (notified.includes(payment.chequeDate)) {
      return;
    }

    transaction.update(invoiceRef, {
      pdcNotifiedDates: [...notified, payment.chequeDate],
    });

    window.dispatchEvent(
      new CustomEvent('pdc_notification', {
        detail: {
          invoiceNumber: invoice.invoiceNumber,
          chequeNumber: payment.chequeNumber,
          chequeDate: payment.chequeDate,
          partyName: invoice.partyName,
          amount: payment.amount || invoice.amount,
          createdAt: new Date().toISOString(),
          status: invoice.status === 'Paid' ? 'PAID' : diffDays < 0 ? 'OVERDUE' : 'UPCOMING',
        },
      }),
    );
  });
}

export interface CompanyExpiryInfo {
  daysRemaining: number | null;
  isPosBasicPlan: boolean;
}

/** Reads the company doc's `expiryDate`/`pack` fields. */
export async function fetchCompanyExpiryInfo(companyId: string): Promise<CompanyExpiryInfo> {
  const companyRef = doc(db, 'companies', companyId);
  const snap = await getDoc(companyRef);
  if (!snap.exists()) return { daysRemaining: null, isPosBasicPlan: false };

  const data = snap.data();
  const expiry = data.expiryDate;
  let daysRemaining: number | null = null;
  if (expiry) {
    const d = expiry.toDate ? expiry.toDate() : new Date(expiry);
    daysRemaining = Math.ceil((d.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  }
  const normalizedPlan = normalizePlan(data.pack);
  return { daysRemaining, isPosBasicPlan: normalizedPlan === PLANS.POS_BASIC };
}

/** Reads `settings/bill`'s `enableTriplicate` flag. */
export async function fetchEnableTriplicate(companyId: string): Promise<boolean> {
  const billSettingsRef = doc(db, 'companies', companyId, 'settings', 'bill');
  const snap = await getDoc(billSettingsRef);
  return snap.exists() ? !!snap.data().enableTriplicate : false;
}

/** Restores stock for every line item and applies any net credit-note
 * adjustment, then deletes the invoice document — mirrors the previous
 * inline `writeBatch` logic exactly. */
export async function deleteInvoiceAndRestoreStock(companyId: string, invoiceToDelete: Invoice): Promise<void> {
  const collectionName = invoiceToDelete.type === 'Credit' ? 'sales' : 'purchases';
  const invoiceDocRef = doc(db, 'companies', companyId, collectionName, invoiceToDelete.id);

  const batch = writeBatch(db);

  for (const item of invoiceToDelete.items || []) {
    if (item.id && item.quantity > 0) {
      const itemDocRef = doc(db, 'companies', companyId, 'items', item.id);

      const itemSnap = await getDoc(itemDocRef);
      if (!itemSnap.exists()) continue;

      const stockChange = invoiceToDelete.type === 'Credit' ? item.quantity : -item.quantity;

      batch.update(itemDocRef, {
        stock: increment(stockChange),
        updatedAt: serverTimestamp(),
      });
    }
  }

  const creditNotePayment = Number(invoiceToDelete.paymentMethods?.['Credit Note'] || 0);

  const creditNoteReturns = (invoiceToDelete.returnHistory || [])
    .filter((h: any) => h.modeOfReturn === 'Credit Note' || h.modeOfReturn?.includes('Credit Note'))
    .reduce((sum: number, h: any) => sum + (Number(h.finalBalance) || 0), 0);

  const netCreditAdjustment = creditNotePayment - creditNoteReturns;

  if (netCreditAdjustment !== 0 && invoiceToDelete.partyNumber) {
    const customerRef = doc(db, 'companies', companyId, 'customers', invoiceToDelete.partyNumber);
    batch.set(customerRef, { creditBalance: increment(netCreditAdjustment) }, { merge: true });
  }
  batch.delete(invoiceDocRef);
  await batch.commit();
}

/** Fetches the counterpart balance (supplier debitBalance for purchases,
 * customer creditBalance for sales) used to pre-fill the settle-payment modal. */
export async function fetchPartyBalance(companyId: string, phone: string, isDebit: boolean): Promise<number> {
  const collectionName = isDebit ? 'suppliers' : 'customers';
  const field = isDebit ? 'debitBalance' : 'creditBalance';
  const partyRef = doc(db, 'companies', companyId, collectionName, phone);
  const snap = await getDoc(partyRef);
  return snap.exists() ? Number(snap.data()[field] || 0) : 0;
}

/** Applies a payment against an invoice's due balance inside a transaction,
 * adjusts the counterparty's credit/debit balance for credit-note payments,
 * and dispatches a `pdc_notification` event for cash/UPI settlements. */
export async function settleInvoicePayment(
  companyId: string,
  invoice: { id: string; type: 'Credit' | 'Debit'; partyNumber?: string; invoiceNumber: string; partyName: string },
  amount: number,
  method: string,
  chequeNumber?: string,
  chequeDate?: string,
): Promise<void> {
  const collectionName = invoice.type === 'Credit' ? 'sales' : 'purchases';
  const docRef = doc(db, 'companies', companyId, collectionName, invoice.id);

  const normalizedMethod = method.toLowerCase().replace(/\s+/g, '');
  const isCreditNote =
    normalizedMethod === 'credit' ||
    normalizedMethod === 'creditnote' ||
    normalizedMethod === 'debit' ||
    normalizedMethod === 'debitnote';
  const normalizedPhone = (invoice.partyNumber || '').replace(/\D/g, '').slice(-10);

  await runTransaction(db, async (transaction) => {
    const sfDoc = await transaction.get(docRef);
    if (!sfDoc.exists()) throw new Error('Document does not exist!');

    const data = sfDoc.data() as DocumentData;
    const currentPaymentMethods = data.paymentMethods || {};
    const currentDue = currentPaymentMethods.due || 0;
    const currentMethodTotal = currentPaymentMethods[method] || 0;

    const newDue = currentDue - amount;
    if (newDue < 0) throw new Error('Payment exceeds due amount.');

    if (isCreditNote && normalizedPhone) {
      if (invoice.type === 'Debit') {
        const supplierRef = doc(db, 'companies', companyId, 'suppliers', normalizedPhone);
        transaction.set(supplierRef, { debitBalance: increment(-amount) }, { merge: true });
      } else {
        const customerRef = doc(db, 'companies', companyId, 'customers', normalizedPhone);
        transaction.set(customerRef, { creditBalance: increment(-amount) }, { merge: true });
      }
    }

    const newPaymentMethods = {
      ...currentPaymentMethods,
      [method]: currentMethodTotal + amount,
      due: newDue,
    };

    const paymentRecord = {
      amount,
      method,
      date: new Date().toISOString(),
      timestamp: Date.now(),
      chequeNumber: method === 'PDC' ? chequeNumber || '' : '',
      chequeDate: method === 'PDC' ? chequeDate || '' : '',
    };

    const currentHistory = data.paymentHistory || [];

    transaction.update(docRef, {
      paymentMethods: newPaymentMethods,
      paymentHistory: [...currentHistory, paymentRecord],
    });

    const isSales = invoice.type === 'Credit';
    const isCashOrUpi = method?.toLowerCase() === 'cash' || method?.toLowerCase() === 'upi';
    const isNowPaid = newDue === 0;

    if (isSales && isCashOrUpi) {
      window.dispatchEvent(
        new CustomEvent('pdc_notification', {
          detail: {
            invoiceNumber: invoice.invoiceNumber,
            partyName: invoice.partyName,
            amount: amount,
            createdAt: new Date().toISOString(),
            status: isNowPaid ? 'PAID' : 'UPCOMING',
            method: method,
          },
        }),
      );
    }
  });
}

/** Fetches the WhatsApp bot credentials stored on the company's business_info doc. */
export async function fetchBusinessWhatsappCreds(
  companyId: string,
): Promise<{ botMasterToken?: string; whatsappNumber?: string }> {
  const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);
  const businessSnap = await getDoc(businessDocRef);
  const { botMasterToken, whatsappNumber } = businessSnap.data() || {};
  return { botMasterToken, whatsappNumber };
}

/** Reads the optional custom WhatsApp message appended to invoice sends. */
export async function fetchWhatsappExtraMessage(companyId: string): Promise<string> {
  const billSettingsSnap = await getDoc(doc(db, 'companies', companyId, 'settings', 'bill'));
  return billSettingsSnap.exists() && billSettingsSnap.data().whatsappExtraMessage
    ? `\n\n${billSettingsSnap.data().whatsappExtraMessage}`
    : '';
}

/** Uploads a generated PDF blob to Storage and returns its download URL plus
 * a `remove` callback for the delayed cleanup used by the WhatsApp senders. */
export async function uploadInvoicePdf(fileName: string, pdfBlob: Blob): Promise<{ fileUrl: string; remove: () => Promise<void> }> {
  const storageRef = ref(storage, fileName);
  await uploadBytes(storageRef, pdfBlob);
  const fileUrl = await getDownloadURL(storageRef);
  return {
    fileUrl,
    remove: () => deleteObject(storageRef),
  };
}

/** Persists that the Journal tutorial has been completed for this company. */
export async function markJournalTutorialDone(companyId: string): Promise<void> {
  await setDoc(
    doc(db, 'companies', companyId, 'settings', 'tutorial'),
    { journalTutorialDone: true },
    { merge: true },
  );
}

export interface PreparePdfDataParams {
  invoice: Invoice;
  forcePosPrint: boolean;
  companyId: string;
  isPosBasicPlan: boolean;
  salesSettings: SalesSettings | null;
}

/** Builds the full `PdfData` payload passed to the PDF generator, resolving
 * business info, item catalogue data, bill settings, company logo, and the
 * customer/supplier's outstanding previous balance. Mirrors the previous
 * inline `preparePdfData` logic exactly. */
export async function preparePdfData({
  invoice,
  forcePosPrint,
  companyId,
  isPosBasicPlan,
  salesSettings,
}: PreparePdfDataParams): Promise<PdfData | null> {
  if (!companyId) return null;

  const dbOps = getFirestoreOperations(companyId);

  const isPurchase = invoice.type === 'Debit';

  const [businessInfo, fetchedItems, billSettingsSnap, companyLogoBase64] = await Promise.all([
    dbOps.getBusinessInfo(),
    dbOps.syncItems(),
    getDoc(doc(db, 'companies', companyId, 'settings', 'bill')),
    resolveCompanyLogoBase64(companyId),
  ]);

  const billSettings = billSettingsSnap.exists() ? billSettingsSnap.data() : ({} as any);

  const populatedItems = (invoice.items || []).map((item: any, index: number) => {
    const fullItem: any = fetchedItems.find((fi: any) => fi.id === item.id) || {};
    const finalTaxRate = item.taxRate || item.tax || item.gstPercent || fullItem.tax || 0;
    const resolvedTaxType = item.taxType || invoice.taxType || salesSettings?.taxType || '';

    let itemAmount = 0;
    if (resolvedTaxType === 'Exclusive' && item.taxableAmount) {
      itemAmount = item.taxableAmount;
    } else if (item.effectiveUnitPrice && item.effectiveUnitPrice > 0) {
      itemAmount = item.effectiveUnitPrice * (Number(item.quantity) || 1);
    } else if (item.finalPrice !== undefined && item.finalPrice !== null && item.finalPrice > 0) {
      itemAmount = item.finalPrice;
    } else {
      itemAmount = (Number(item.mrp) || 0) * (Number(item.quantity) || 1);
    }

    const qty = Number(item.quantity) || 1;

    const actualMrp = isPurchase ? Number(item.purchasePrice) || 0 : Number(item.mrp) || 0;

    const basePrice = actualMrp > 0 ? actualMrp : Number(item.salesPrice) || 0;

    let absoluteDiscount = basePrice * qty - itemAmount;
    if (absoluteDiscount < 0) absoluteDiscount = 0;

    const d1Pct = Number(item.discount || item.discountPercentage) || 0;
    const d2Pct = Number(item.discount2) || 0;

    const priceAfterD1 = basePrice * (1 - d1Pct / 100);
    const priceAfterD2 = priceAfterD1 * (1 - d2Pct / 100);

    const discount1Amount = (basePrice - priceAfterD1) * qty;

    let discount2Amount = (priceAfterD1 - priceAfterD2) * qty;
    if (d2Pct === 0 && itemAmount > 0) {
      const totalDiscountAmt = basePrice * qty - itemAmount;
      discount2Amount = Math.max(0, totalDiscountAmt - discount1Amount);
    }

    return {
      sno: index + 1,
      name: item.name,
      quantity: qty,
      unit: fullItem.unit || item.unit || 'Pcs',
      hsn: fullItem.hsnSac || item.hsnSac || 'N/A',
      listPrice: actualMrp,
      price: basePrice,
      discountAmount: absoluteDiscount,
      discount1Amount,
      discount2Amount,
      discount1Percent: d1Pct,
      discount2Percent: d2Pct,
      amount: itemAmount,
      taxType: resolvedTaxType,
      taxAmount: item.taxAmount || 0,
      taxableAmount: item.taxableAmount || 0,
      gstPercent: finalTaxRate,
      taxRate: finalTaxRate,
    };
  });

  const advance = (() => {
    const pm = invoice.paymentMethods || {};
    const total = Object.entries(pm)
      .filter(([k]) => k !== 'due')
      .reduce((s, [, v]) => s + (Number(v) || 0), 0);
    return total > 0 ? total : 0;
  })();

  const previousBalance = await (async () => {
    if (!companyId || !invoice.partyNumber) return 0;
    try {
      const salesRef = collection(db, 'companies', companyId, 'sales');
      const snap = await getDocs(query(salesRef, where('partyNumber', '==', invoice.partyNumber)));
      let total = 0;
      snap.forEach((d) => {
        if (d.id !== invoice.id) {
          total += Number(d.data().paymentMethods?.due ?? 0);
        }
      });
      const obRef = collection(db, 'companies', companyId, 'openingBalances');
      const obSnap = await getDocs(query(obRef, where('partyNumber', '==', invoice.partyNumber)));
      obSnap.forEach((d) => {
        const data = d.data();
        if ((data.balanceType ?? 'due') === 'due') {
          total += Number(data.dueAmount ?? data.amount ?? 0);
        }
      });
      return total;
    } catch {
      return 0;
    }
  })();

  return {
    printFormat: forcePosPrint || isPosBasicPlan ? 'THERMAL58' : billSettings.posPrintFormat || 'A4',
    enableTriplicate: billSettings.enableTriplicate || false,
    gstScheme: salesSettings?.gstScheme || '',
    taxType: invoice.taxType || salesSettings?.taxType || '',
    companyName: businessInfo?.name || '',
    companyAddress: businessInfo?.address || '',
    companyContact: businessInfo?.phoneNumber || '',
    companyEmail: businessInfo?.email || '',
    companyLogoBase64: companyLogoBase64 || undefined,
    signatureBase64: billSettings.signatureBase64 || '',
    companyGstin: billSettings.companyGstin || businessInfo?.gstin || '',
    msmeNumber: businessInfo?.msmeNumber || '',
    panNumber: businessInfo?.panNumber || '',
    companyState: businessInfo?.state || '',
    placeOfSupply: invoice.placeOfSupply || '',
    billDiscount: invoice.manualDiscount || 0,
    discountDisplayFormat: billSettings?.discountDisplayFormat || 'amount',
    upiId: billSettings.upiId || '',
    billTo: {
      name: invoice.partyName,
      address: invoice.partyAddress || '',
      phone: invoice.partyNumber || '',
      gstin: invoice.partyGstin || '',
    },
    shipTo: {
      name: invoice.shippingName || '',
      address: invoice.shippingAddress || '',
      phone: invoice.shippingNumber || '',
      gstin: invoice.shippingGST || '',
    },
    expenses: invoice.expenses || [],
    extraExpenseName: invoice.extraExpenseName || '',
    extraExpenseAmount: invoice.extraExpenseAmount || 0,
    narration: invoice.narration || '',
    transportDetails: invoice.transportDetails || undefined,
    invoice: {
      number: invoice.invoiceNumber,
      date: new Date(invoice.createdAt).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      }),
      billedBy: salesSettings?.enableSalesmanSelection ? invoice.salesmanName || 'N/A' : '',
      roNumber: '',
    },
    advance,
    due: invoice.dueAmount || 0,
    previousBalance,
    items: populatedItems,
    terms:
      billSettings.posTermsAndConditions ||
      billSettings.termsAndConditions ||
      'Goods once sold will not be taken back.',
    finalAmount: invoice.amount,
    isEstimate: (invoice as any).isEstimate || false,
    bankDetails: {
      accountName: businessInfo?.accountHolderName || billSettings.accountName,
      accountNumber: businessInfo?.accountNumber || billSettings.accountNumber,
      bankName: businessInfo?.bankName || billSettings.bankName,
      ifsc: businessInfo?.ifscCode || billSettings.ifscCode || '',
    },
  };
}
