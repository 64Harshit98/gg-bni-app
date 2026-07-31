/**
 * Data-access layer for the Party Ledger page. Wraps the Firestore reads and
 * transactional writes that used to live inline (behind dynamic `import()`
 * calls) in `PartyLedger.tsx`, behind small typed functions. Logic
 * (validation rules, balance-field selection, credit/debit-note handling)
 * is preserved exactly as it was before extraction.
 */
import { doc, getDoc, increment, runTransaction } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import type { PaymentRecord } from '../../Pages/Reports/PartyLedger/usePartyLedger';

export interface BusinessWhatsappConfig {
  botMasterToken?: string;
  whatsappNumber?: string;
}

export type PartyCollectionName = 'customers' | 'suppliers';
export type PartyBalanceField = 'creditBalance' | 'debitBalance';

/** Fetches the WhatsApp bot credentials configured for a company. */
export async function fetchBusinessWhatsappConfig(
  companyId: string,
): Promise<BusinessWhatsappConfig> {
  const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);
  const businessSnap = await getDoc(businessDocRef);
  return (businessSnap.data() as BusinessWhatsappConfig) || {};
}

/** Fetches a single party's credit/debit balance field (0 if the doc/field is missing). */
export async function fetchPartyBalance(
  companyId: string,
  collectionName: PartyCollectionName,
  partyNumber: string,
  balanceField: PartyBalanceField,
): Promise<number> {
  const partyRef = doc(db, 'companies', companyId, collectionName, partyNumber);
  const snap = await getDoc(partyRef);
  return snap.exists() ? Number(snap.data()[balanceField] || 0) : 0;
}

const buildPaymentRecord = (
  amount: number,
  method: string,
  chequeNumber?: string,
  chequeDate?: string,
) => ({
  amount,
  method: method.toLowerCase(),
  date: new Date().toISOString(),
  timestamp: Date.now(),
  ...(method.toUpperCase() === 'PDC' && {
    chequeNumber: chequeNumber || '',
    chequeDate: chequeDate || '',
  }),
});

/**
 * Settles a payment against an opening-balance record: reduces its due
 * amount, appends to its payment history, and — for advance opening
 * balances, or credit/debit-note payments against due opening balances —
 * adjusts the party's creditBalance/debitBalance field.
 */
export async function settleOpeningBalancePayment(
  companyId: string,
  invoiceId: string,
  amount: number,
  method: string,
  chequeNumber?: string,
  chequeDate?: string,
): Promise<PaymentRecord> {
  const obRef = doc(db, 'companies', companyId, 'openingBalances', invoiceId);

  await runTransaction(db, async (transaction) => {
    const sfDoc = await transaction.get(obRef);
    if (!sfDoc.exists()) throw new Error('Opening balance record not found.');
    const data = sfDoc.data();
    const currentDue = data.dueAmount ?? data.amount ?? 0;
    if (amount > currentDue) throw new Error(`Amount (₹${amount}) exceeds due (₹${currentDue}).`);

    const paymentRecord = buildPaymentRecord(amount, method, chequeNumber, chequeDate);
    transaction.update(obRef, {
      dueAmount: Math.max(0, currentDue - amount),
      paymentHistory: [...(data.paymentHistory || []), paymentRecord],
    });

    const obBalanceType = data.balanceType || 'due';
    const partyNum = (data.partyNumber || '').trim();
    const partyType = data.partyType || 'Customer';

    // Advance OB settle: reduce the party's creditBalance/debitBalance.
    if (partyNum.length >= 3 && obBalanceType === 'advance') {
      const collectionName: PartyCollectionName = partyType === 'Customer' ? 'customers' : 'suppliers';
      const balanceField: PartyBalanceField = partyType === 'Customer' ? 'creditBalance' : 'debitBalance';
      const partyRef = doc(db, 'companies', companyId, collectionName, partyNum);
      transaction.update(partyRef, {
        [balanceField]: increment(-amount),
      });
    }

    const normalizedMethod = method.toLowerCase().replace(/\s+/g, '');
    const isCreditNote = normalizedMethod === 'credit' || normalizedMethod === 'creditnote';
    const isDebitNote = normalizedMethod === 'debit' || normalizedMethod === 'debitnote';
    if ((isCreditNote || isDebitNote) && partyNum.length >= 3 && obBalanceType === 'due') {
      const collectionName: PartyCollectionName = partyType === 'Customer' ? 'customers' : 'suppliers';
      const balanceField: PartyBalanceField = partyType === 'Customer' ? 'creditBalance' : 'debitBalance';
      const partyRef = doc(db, 'companies', companyId, collectionName, partyNum);
      transaction.set(partyRef, {
        [balanceField]: increment(-amount),
      }, { merge: true });
    }
  });

  return buildPaymentRecord(amount, method, chequeNumber, chequeDate);
}

export interface SettleInvoicePaymentParams {
  companyId: string;
  invoiceId: string;
  invoiceType: 'sale' | 'purchase';
  amount: number;
  method: string;
  partyNumber?: string;
  chequeNumber?: string;
  chequeDate?: string;
}

export interface SettleInvoicePaymentResult {
  paymentRecord: PaymentRecord;
  /** True when a credit-note/debit-note balance adjustment was applied to the party. */
  creditAdjustmentApplied: boolean;
}

/**
 * Settles a payment against a sale/purchase invoice: reduces its due amount,
 * appends to its payment history, and — for credit-note/debit-note
 * payments — adjusts the counterparty's creditBalance/debitBalance field.
 */
export async function settleInvoicePayment({
  companyId,
  invoiceId,
  invoiceType,
  amount,
  method,
  partyNumber,
  chequeNumber,
  chequeDate,
}: SettleInvoicePaymentParams): Promise<SettleInvoicePaymentResult> {
  if (amount <= 0) {
    throw new Error('Payment amount must be greater than 0.');
  }
  if (!invoiceId || !invoiceType) {
    throw new Error('Invalid invoice data.');
  }

  const collectionName = invoiceType === 'sale' ? 'sales' : 'purchases';
  const docRef = doc(db, 'companies', companyId, collectionName, invoiceId);

  let creditAdjustmentApplied = false;

  await runTransaction(db, async (transaction) => {
    const sfDoc = await transaction.get(docRef);
    if (!sfDoc.exists()) {
      throw new Error('Invoice not found in database.');
    }

    const data = sfDoc.data();
    const currentPaymentMethods = data.paymentMethods || {};
    const currentDue = currentPaymentMethods.due || data.dueAmount || 0;

    if (amount > currentDue) {
      throw new Error(`Payment amount (₹${amount}) exceeds due amount (₹${currentDue}).`);
    }

    const newDue = currentDue - amount;
    const newPaymentMethods = {
      ...currentPaymentMethods,
      [method.toLowerCase()]: (currentPaymentMethods[method.toLowerCase()] || 0) + amount,
      due: Math.max(0, newDue),
    };

    const normalizedMethod = method.toLowerCase().replace(/\s+/g, '');
    const isCreditNote = normalizedMethod === 'credit' || normalizedMethod === 'creditnote';
    const isDebitNote = normalizedMethod === 'debit' || normalizedMethod === 'debitnote';

    if ((isCreditNote || isDebitNote) && partyNumber) {
      const partyNum = (partyNumber || '').replace(/\D/g, '').slice(-10);
      if (partyNum) {
        if (invoiceType === 'purchase' && isDebitNote) {
          const supplierRef = doc(db, 'companies', companyId, 'suppliers', partyNum);
          transaction.set(supplierRef, { debitBalance: increment(-amount) }, { merge: true });
        } else if (isCreditNote) {
          const customerRef = doc(db, 'companies', companyId, 'customers', partyNum);
          transaction.set(customerRef, { creditBalance: increment(-amount) }, { merge: true });
        }
        creditAdjustmentApplied = true;
      }
    }

    const paymentRecord = buildPaymentRecord(amount, method, chequeNumber, chequeDate);

    transaction.update(docRef, {
      paymentMethods: newPaymentMethods,
      dueAmount: Math.max(0, newDue),
      paymentHistory: [...(data.paymentHistory || []), paymentRecord],
    });
  });

  return {
    paymentRecord: buildPaymentRecord(amount, method, chequeNumber, chequeDate),
    creditAdjustmentApplied,
  };
}
