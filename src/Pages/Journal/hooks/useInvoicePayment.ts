import { useState } from 'react';
import {
  doc,
  getDoc,
  type DocumentData,
  runTransaction,
  increment,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import type { Invoice } from '../journal.types';

interface UseInvoicePaymentParams {
  currentUser: any;
}

// Owns the "settle payment" modal flow — moved verbatim from Journal.tsx
// (was the isModalOpen/selectedInvoice/customerCredit state, openPaymentModal,
// and handleSettlePayment inline in the main Journal component).
export const useInvoicePayment = ({ currentUser }: UseInvoicePaymentParams) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [customerCredit, setCustomerCredit] = useState<number>(0);

  const openPaymentModal = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsModalOpen(true);

    const phone = (invoice.partyNumber || '').replace(/\D/g, '').slice(-10);
    if (phone && currentUser?.companyId) {
      try {
        if (invoice.type === 'Debit') {
          // Purchase invoice → fetch supplier's debitBalance
          const supplierRef = doc(db, 'companies', currentUser.companyId, 'suppliers', phone);
          const snap = await getDoc(supplierRef);
          setCustomerCredit(snap.exists() ? Number(snap.data().debitBalance || 0) : 0);
        } else {
          // Sales invoice → fetch customer's creditBalance
          const customerRef = doc(db, 'companies', currentUser.companyId, 'customers', phone);
          const snap = await getDoc(customerRef);
          setCustomerCredit(snap.exists() ? Number(snap.data().creditBalance || 0) : 0);
        }
      } catch (err) {
        console.error('Error fetching balance:', err);
        setCustomerCredit(0);
      }
    } else {
      setCustomerCredit(0);
    }
  };

  const handleSettlePayment = async (
    invoice: any,
    amount: number,
    method: string,
    chequeNumber?: string,
    chequeDate?: string
  ) => {
    if (!currentUser?.companyId) {
      throw new Error("No company ID found. Cannot settle payment.");
    }

    const companyId = currentUser.companyId;
    const collectionName = invoice.type === 'Credit' ? 'sales' : 'purchases';
    const docRef = doc(db, 'companies', companyId, collectionName, invoice.id);

    const normalizedMethod = method.toLowerCase().replace(/\s+/g, '');
    const isCreditNote = normalizedMethod === 'credit' || normalizedMethod === 'creditnote'
      || normalizedMethod === 'debit' || normalizedMethod === 'debitnote';
    const normalizedPhone = (invoice.partyNumber || '').replace(/\D/g, '').slice(-10);

    await runTransaction(db, async (transaction) => {
      const sfDoc = await transaction.get(docRef);
      if (!sfDoc.exists()) throw new Error("Document does not exist!");

      const data = sfDoc.data() as DocumentData;
      const currentPaymentMethods = data.paymentMethods || {};
      const currentDue = currentPaymentMethods.due || 0;
      const currentMethodTotal = currentPaymentMethods[method] || 0;

      const newDue = currentDue - amount;
      if (newDue < 0) throw new Error('Payment exceeds due amount.');

      // ✅ Sirf Firestore update transaction ke andar
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
        chequeNumber: method === 'PDC' ? (chequeNumber || '') : '',
        chequeDate: method === 'PDC' ? (chequeDate || '') : ''
      };

      const currentHistory = data.paymentHistory || [];

      transaction.update(docRef, {
        paymentMethods: newPaymentMethods,
        paymentHistory: [...currentHistory, paymentRecord]
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
              method: method
            },
          })
        );
      }
    });

    // ✅ Transaction complete hone ke BAAD React state update karo
    if (isCreditNote && normalizedPhone) {
      setCustomerCredit(prev => Math.max(0, prev - amount));
    }
  };

  return {
    customerCredit,
    setCustomerCredit,
    isModalOpen,
    setIsModalOpen,
    selectedInvoice,
    setSelectedInvoice,
    openPaymentModal,
    handleSettlePayment,
  };
};
