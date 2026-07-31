/**
 * Data-access layer for the customer-facing Catalogue checkout flow
 * (`src/Catalogue/CheckOut.tsx`). Wraps the Firestore reads/writes that used
 * to live inline in the component behind small, typed helpers. All business
 * logic (subdomain resolution, MOV/tax calculation inputs, stock deduction on
 * order placement, voucher numbering) is preserved exactly as it was before
 * extraction — this is a relocation, not a rewrite.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  deleteDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../lib/Firebase';

export interface CartItem {
  id: string | number;
  name: string;
  category: string;
  groupId?: string;
  mrp: number;
  salesPrice: number;
  quantity: number;
  image?: string;
  note: string;
  imageUrl?: string;
  moq?: number;
  unit?: string;
  unitMultiplier?: number;
  tax?: number;
}

export interface CatalogueSalesSettings {
  minimumOrderValue: number;
  voucherPrefix?: string;
  currentVoucherNumber?: number;
  hidePrice?: boolean;
  requireApproval?: boolean;
  gstScheme?: string;
  taxType?: string;
}

export interface Address {
  name: string;
  phone: string;
  city: string;
  state: string;
  address: string;
  gstin?: string;
}

export interface SocialLinks {
  whatsappNumber?: string;
  phoneNumber?: string;
  instagram?: string;
  facebook?: string;
  twitter?: string;
  gmail?: string;
  [key: string]: unknown;
}

export interface BusinessInfo {
  businessName: string;
  socialLinks: SocialLinks;
}

export type LeadStatus = 'approved' | 'pending' | 'declined' | null;

/**
 * Resolves a storefront subdomain to its true Firestore company document ID.
 * Returns `redirectTo` when the alias resolves to a company whose canonical
 * subdomain differs, so the caller can redirect while preserving the path.
 */
export async function resolveCompanyIdBySubdomain(
  subdomain: string,
): Promise<{ companyId: string | null; redirectTo?: string }> {
  try {
    const companiesRef = collection(db, 'companies');
    const q = query(companiesRef, where('domainAliases', 'array-contains', subdomain));
    const snap = await getDocs(q);

    if (snap.empty) {
      return { companyId: null };
    }

    const companyDoc = snap.docs[0];
    const data = companyDoc.data();

    if (data.subdomain && data.subdomain !== subdomain) {
      return { companyId: companyDoc.id, redirectTo: data.subdomain };
    }

    return { companyId: companyDoc.id };
  } catch (error) {
    console.error('Error resolving subdomain:', error);
    return { companyId: null };
  }
}

/** Fetches the public business profile (name + social links) for a company. */
export async function fetchBusinessInfo(companyId: string): Promise<BusinessInfo> {
  try {
    const docRef = doc(db, 'companies', companyId, 'business_info', companyId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return { businessName: data.businessName || 'Catalogue', socialLinks: data };
    }
    return { businessName: 'Catalogue', socialLinks: {} };
  } catch {
    return { businessName: 'Catalogue', socialLinks: {} };
  }
}

/** Fetches the catalogue sales settings (MOV, tax scheme, approval flag, etc). */
export async function fetchCatalogueSalesSettings(
  companyId: string,
): Promise<CatalogueSalesSettings> {
  try {
    const ref = doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return snap.data() as CatalogueSalesSettings;
    }
    return { minimumOrderValue: 0 };
  } catch (err) {
    console.error('Failed to load MOV:', err);
    return { minimumOrderValue: 0 };
  }
}

/** Subscribes to the lead/authorized-user approval status for a phone number. */
export function subscribeToLeadStatus(
  companyId: string,
  phone: string,
  onStatus: (status: LeadStatus) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'companies', companyId, 'AuthorizedUser'),
    where('customerNumber', '==', phone),
  );

  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      onStatus(null);
    } else {
      onStatus((snap.docs[0].data().status as LeadStatus) || 'pending');
    }
  });
}

/**
 * Mirrors the in-progress cart onto the customer's `upcoming_<userKey>` order
 * draft doc, so an internal admin/agent can see what's currently in the cart.
 * No-op unless a lead has already been submitted for this session.
 */
export async function syncCartToUpcomingOrder(
  companyId: string,
  cartItems: CartItem[],
): Promise<void> {
  if (!companyId || cartItems.length === 0) return;

  const leadSubmittedCheck = localStorage.getItem('leadSubmitted') === 'true';
  if (!leadSubmittedCheck) return;

  try {
    const userKey = localStorage.getItem('upcoming_user_key');
    if (!userKey) return;

    const orderRef = doc(db, 'companies', companyId, 'Orders', `upcoming_${userKey}`);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) return;

    const itemsForFirebase = cartItems.map((item) => ({
      id: String(item.id),
      docId: String(item.id),
      name: item.name,
      quantity: item.quantity,
      mrp: item.mrp,
      salesPrice: item.salesPrice,
      unit: item.unit,
      unitMultiplier: item.unitMultiplier || 1,
      finalPrice: item.salesPrice * item.quantity,
    }));

    const rawTotalAmount = itemsForFirebase.reduce((acc, curr) => acc + curr.finalPrice, 0);
    const roundedTotalAmount = Math.round(rawTotalAmount);
    const roundOffAmt = Number((roundedTotalAmount - rawTotalAmount).toFixed(2));

    await setDoc(
      orderRef,
      {
        items: itemsForFirebase,
        totalAmount: roundedTotalAmount,
        roundOff: roundOffAmt,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.error('CartPage syncToUpcoming error:', err);
  }
}

/** Clears the items on the customer's upcoming order draft (cart emptied). */
export async function clearUpcomingOrderItems(companyId: string, userKey: string): Promise<void> {
  const orderRef = doc(db, 'companies', companyId, 'Orders', `upcoming_${userKey}`);
  await setDoc(orderRef, { items: [], totalAmount: 0, updatedAt: serverTimestamp() }, { merge: true });
}

/** Deletes the upcoming order draft doc once a real order has been placed. */
export async function deleteUpcomingOrderDraft(companyId: string, userKey: string): Promise<void> {
  const draftRef = doc(db, 'companies', companyId, 'Orders', `upcoming_${userKey}`);
  await deleteDoc(draftRef);
}

export interface PlaceOrderParams {
  companyId: string;
  cartItems: CartItem[];
  billing: Address;
  shipping: Address;
  isSameAsShipping: boolean;
  specialInstruction: string;
  totalPay: number;
  subtotal: number;
  totalTaxAmount: number;
  baseSubtotal: number;
  applyExclusiveTax: boolean;
  scheme: string;
  taxType: string;
}

/**
 * Places a customer order in a single Firestore transaction: allocates the
 * next voucher number, writes the order doc (with per-line tax breakdown),
 * increments the sales-settings voucher counter, and deducts stock for every
 * item — exactly as the original inline `placeOrder` did.
 */
export async function placeOrder(params: PlaceOrderParams): Promise<string> {
  const {
    companyId,
    cartItems,
    billing,
    shipping,
    isSameAsShipping,
    specialInstruction,
    totalPay,
    subtotal,
    totalTaxAmount,
    baseSubtotal,
    applyExclusiveTax,
    scheme,
    taxType,
  } = params;

  const settingsRef = doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');
  const ordersRef = collection(db, 'companies', companyId, 'Orders');

  return runTransaction(db, async (transaction) => {
    const settingsSnap = await transaction.get(settingsRef);

    const itemRefs = cartItems.map((item) => doc(db, 'companies', companyId, 'items', String(item.id)));
    const itemSnaps = await Promise.all(itemRefs.map((ref) => transaction.get(ref)));

    let prefix = 'SLS-';
    let currentNumber = 1001;

    if (settingsSnap.exists()) {
      const sData = settingsSnap.data();
      prefix = sData.voucherPrefix || 'SLS-';
      currentNumber = sData.currentVoucherNumber || 1001;
    }

    const invoice = `${prefix}${currentNumber}`;
    const newOrderDoc = doc(ordersRef);
    const leadData = JSON.parse(localStorage.getItem('leadData') || '{}');
    const fallbackPhone = (leadData.number || '').replace(/\D/g, '').trim();
    const roundOffAmt = Number((totalPay - subtotal).toFixed(2));

    transaction.set(newOrderDoc, {
      orderId: invoice,
      invoiceNumber: invoice,
      status: 'Confirmed',
      isLead: false,
      userName: billing.name || leadData.name || '',
      userLoginPhone: billing.phone || fallbackPhone || '',
      totalAmount: totalPay,
      roundOff: roundOffAmt,
      totalTax: Number(totalTaxAmount.toFixed(2)),
      baseAmount: Number(baseSubtotal.toFixed(2)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      specialInstruction: specialInstruction || '',
      items: cartItems.map((i) => {
        const originalUnitPrice = Number(i.salesPrice);
        const qty = Number(i.quantity);
        const taxRate = Number(i.tax || 0);

        const lineBaseAmount = originalUnitPrice * qty;
        let lineTaxAmount = 0;
        let lineFinalAmount = lineBaseAmount;

        if (applyExclusiveTax) {
          lineTaxAmount = lineBaseAmount * (taxRate / 100);
          lineFinalAmount = lineBaseAmount + lineTaxAmount;
        }

        let itemTaxTypeToSave = 'Inclusive';
        if (scheme === 'exempt' || scheme === 'composition') {
          itemTaxTypeToSave = scheme.charAt(0).toUpperCase() + scheme.slice(1);
        } else if (taxType === 'exclusive') {
          itemTaxTypeToSave = 'Exclusive';
        }

        return {
          id: String(i.id),
          itemId: String(i.id),
          groupId: i.groupId || i.category,
          name: i.name,
          quantity: qty,
          mrp: Number(i.mrp),
          salesPrice: originalUnitPrice,
          effectiveUnitPrice: originalUnitPrice,
          tax: taxRate,
          taxRate: taxRate,
          taxType: itemTaxTypeToSave,
          taxableAmount: Number(
            (applyExclusiveTax ? lineBaseAmount : lineBaseAmount / (1 + taxRate / 100)).toFixed(2),
          ),
          taxAmount: Number(
            (applyExclusiveTax
              ? lineTaxAmount
              : lineBaseAmount - lineBaseAmount / (1 + taxRate / 100)
            ).toFixed(2),
          ),
          finalPrice: Number(lineFinalAmount.toFixed(2)),
          note: i.note,
          image: i.imageUrl || '',
          unit: i.unit || 'pcs',
          unitMultiplier: i.unitMultiplier || 1,
        };
      }),
      billingDetails: billing,
      shippingDetails: isSameAsShipping ? billing : shipping,
      orderedBy: localStorage.getItem('upcoming_user_key'),
    });

    transaction.update(settingsRef, {
      currentVoucherNumber: increment(1),
      updatedAt: serverTimestamp(),
    });

    itemSnaps.forEach((snap, index) => {
      if (snap.exists()) {
        const currentStock = Number(snap.data().stock || 0);
        const deductQty = Number(cartItems[index].quantity);

        transaction.update(snap.ref, {
          stock: currentStock - deductQty,
          updatedAt: serverTimestamp(),
        });
      }
    });

    return invoice;
  });
}
