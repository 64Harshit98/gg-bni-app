import { useState } from 'react';
import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { State, PLANS } from '../../../enums';
import type { Invoice } from '../journal.types';

interface UseInvoiceDeletionParams {
  currentUser: any;
  setModal: (modal: { message: string; type: State } | null) => void;
}

// Owns the "delete invoice" confirm + execute flow — moved verbatim from
// Journal.tsx (was invoiceToDelete state, promptDeleteInvoice,
// confirmDeleteInvoice, and cancelDelete inline in the main Journal component).
export const useInvoiceDeletion = ({ currentUser, setModal }: UseInvoiceDeletionParams) => {
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);

  const promptDeleteInvoice = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);

    // Check if invoice has credit note in payment methods
    const creditNotePayment = Number(invoice.paymentMethods?.['Credit Note'] || 0);

    // Check if invoice has credit note returns
    const hasCreditNoteReturns = (invoice.returnHistory || []).some((h: any) =>
      h.modeOfReturn === 'Credit Note' || h.modeOfReturn?.includes('Credit Note')
    );

    let warningMessage = "Are you sure you want to delete this invoice? This action cannot be undone";

    // Add credit note warning for payments
    if (creditNotePayment > 0) {
      warningMessage += `. This bill was paid using Credit Note of ${creditNotePayment.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}. The credit note balance will be restored to the customer`;
    }

    // Add credit note warning for returns
    if (hasCreditNoteReturns) {
      const creditNoteReturnAmount = (invoice.returnHistory || [])
        .filter((h: any) => h.modeOfReturn === 'Credit Note' || h.modeOfReturn?.includes('Credit Note'))
        .reduce((sum: number, h: any) => sum + (Number(h.finalBalance) || 0), 0);

      if (creditNotePayment > 0) {
        warningMessage += ` and the returned items' Credit Note of ${creditNoteReturnAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} will be removed from the customer`;
      } else {
        warningMessage += `. This bill contains Credit Note returns of ${creditNoteReturnAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} which will be removed from the customer`;
      }
    }

    // Add stock restoration message for non-POS_BASIC plans
    if (currentUser?.plan !== PLANS.POS_BASIC) {
      warningMessage += " and will restore item stock";
    }

    warningMessage += ".";

    setModal({ message: warningMessage, type: State.INFO });
  };

  const confirmDeleteInvoice = async () => {
    if (!invoiceToDelete || !invoiceToDelete.items) return;
    if (!currentUser?.companyId) {
      setModal({ message: "Error: No company ID found. Cannot delete.", type: State.ERROR });
      return;
    }
    const companyId = currentUser.companyId;
    const collectionName = invoiceToDelete.type === 'Credit' ? 'sales' : 'purchases';
    const invoiceDocRef = doc(db, 'companies', companyId, collectionName, invoiceToDelete.id);

    try {
      const batch = writeBatch(db);

      for (const item of invoiceToDelete.items!) {
        if (item.id && item.quantity > 0) {
          const itemDocRef = doc(db, 'companies', companyId, 'items', item.id);

          const itemSnap = await getDoc(itemDocRef);
          if (!itemSnap.exists()) continue;

          const stockChange = invoiceToDelete.type === 'Credit' ? item.quantity : -item.quantity;

          batch.update(itemDocRef, {
            stock: increment(stockChange),
            updatedAt: serverTimestamp()
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
        batch.set(customerRef, {
          creditBalance: increment(netCreditAdjustment)
        }, { merge: true });
      }
      batch.delete(invoiceDocRef);
      await batch.commit();

      setModal({ message: "Invoice deleted ", type: State.SUCCESS });
    } catch (err) {
      console.error("Error in batch write: ", err);
      setModal({ message: `Failed to delete invoice: ${err instanceof Error ? err.message : 'Unknown error'}`, type: State.ERROR });
    } finally {
      setInvoiceToDelete(null);
      setTimeout(() => setModal(null), 3000);
    }
  };

  const cancelDelete = () => {
    setInvoiceToDelete(null);
    setModal(null);
  };

  return {
    invoiceToDelete,
    setInvoiceToDelete,
    promptDeleteInvoice,
    confirmDeleteInvoice,
    cancelDelete,
  };
};
