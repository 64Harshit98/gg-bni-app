import { useState } from 'react';
import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { clearSalesReportCache } from '../../Reports/SalesReportComponents/salesReportCache';
import { clearPurchaseReportCache } from '../../Reports/PurchaseReportComponents/purchaseReportCache';
import { State, PLANS } from '../../../enums';
import type { Invoice } from '../journal.types';
import { readSaleLoyalty, undoSaleChanges, writeLoyaltyInBatch } from '../../../lib/loyalty';
import { useIsRestaurant } from '../../../context/RestaurantDataContext';
import { avgCostWithout, queueMovement, rawMaterialRef } from '../../../lib/restaurant/stockApi';
import { KITCHEN_ID, KITCHEN_NAME, type ConsumptionLine, type RawMaterial } from '../../../lib/restaurant/types';
import { round6 } from '../../../lib/restaurant/units';

interface UseInvoiceDeletionParams {
  currentUser: any;
  setModal: (modal: { message: string; type: State } | null) => void;
}

// Owns the "delete invoice" confirm + execute flow — moved verbatim from
// Journal.tsx (was invoiceToDelete state, promptDeleteInvoice,
// confirmDeleteInvoice, and cancelDelete inline in the main Journal component).
export const useInvoiceDeletion = ({ currentUser, setModal }: UseInvoiceDeletionParams) => {
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const isRestaurant = useIsRestaurant();

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

    // Loyalty points this bill earned / used are undone too
    const loyalty = invoice.type === 'Credit' ? readSaleLoyalty(invoice as any) : null;
    if (loyalty && (loyalty.earned > 0 || loyalty.redeemed > 0)) {
      const parts = [
        loyalty.earned > 0 ? `${loyalty.earned} loyalty points it earned will be taken back` : '',
        loyalty.redeemed > 0 ? `${loyalty.redeemed} points used on it will be given back` : '',
      ].filter(Boolean);
      warningMessage += `. ${parts.join(' and ')}`;
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

      // Raw materials this bill touches, read once. A deleted raw material is skipped —
      // updating a missing doc would fail the whole delete.
      const rmCache = new Map<string, Partial<RawMaterial> | null>();
      const rmOf = async (id: string) => {
        if (!rmCache.has(id)) {
          const s = await getDoc(rawMaterialRef(companyId, id));
          rmCache.set(id, s.exists() ? (s.data() as Partial<RawMaterial>) : null);
        }
        return rmCache.get(id) ?? null;
      };

      for (const item of invoiceToDelete.items!) {
        const rawCons: ConsumptionLine[] | undefined = (item as any).rawConsumption;
        if (collectionName === 'sales' && Array.isArray(rawCons) && rawCons.length > 0) {
          for (const c of rawCons) {
            if (c.rawMaterialId && Number(c.qty) > 0 && (await rmOf(c.rawMaterialId))) {
              queueMovement(batch, companyId, {
                rawMaterialId: c.rawMaterialId,
                rawMaterialName: c.name || c.rawMaterialId,
                type: 'return',
                qty: Number(c.qty),
                locationId: KITCHEN_ID,
                locationName: KITCHEN_NAME,
                refType: 'sale',
                refId: invoiceToDelete.id,
                refNo: invoiceToDelete.invoiceNumber,
                unitCost: c.unitCost,
                note: 'Invoice deleted',
              });
            }
          }
          continue;
        }
        const rmPurchaseId: string | undefined = (item as any).rawMaterialId;
        const rmBaseQty: number = Number((item as any).baseQty) || 0;
        if (collectionName === 'purchases' && ((invoiceToDelete as any).isRawMaterialPurchase || (rmPurchaseId && rmBaseQty > 0))) {
          const targetId = rmPurchaseId || item.id;
          const deductQty = rmBaseQty || Number(item.quantity) || 0;
          const rm = targetId ? await rmOf(targetId) : null;
          if (targetId && deductQty > 0 && rm) {
            // Take this receipt's cost back out of the average (unitCost saved per line; older bills derive it)
            const lineUnitCost =
              Number((item as any).unitCost) ||
              round6(((Number((item as any).purchasePrice) || 0) * (Number(item.quantity) || 0)) / deductQty);
            const revertedAvg = avgCostWithout(rm, deductQty, lineUnitCost);
            // keep the cached copy in step for a second line of the same raw material
            const locId: string = (item as any).locationId || KITCHEN_ID;
            rm.avgCost = revertedAvg;
            if (locId === KITCHEN_ID) rm.stock = (Number(rm.stock) || 0) - deductQty;
            else rm.godownStock = { ...(rm.godownStock || {}), [locId]: (Number(rm.godownStock?.[locId]) || 0) - deductQty };
            queueMovement(batch, companyId, {
              rawMaterialId: targetId,
              rawMaterialName: item.name || targetId,
              type: 'purchase',
              qty: -deductQty,
              locationId: (item as any).locationId || KITCHEN_ID,
              locationName: (item as any).locationName || KITCHEN_NAME,
              refType: 'purchase',
              refId: invoiceToDelete.id,
              refNo: invoiceToDelete.invoiceNumber,
              unitCost: lineUnitCost || undefined,
              note: 'Purchase deleted',
            }, revertedAvg);
          }
          continue;
        }
        if (!isRestaurant && item.id && item.quantity > 0) {
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

      // Loyalty: take back what the bill earned, give back what it used.
      const loyalty = collectionName === 'sales' ? readSaleLoyalty(invoiceToDelete as any) : null;
      if (loyalty) {
        writeLoyaltyInBatch(
          batch, db, companyId, loyalty.phone,
          undoSaleChanges(loyalty, 'delete', { refId: invoiceToDelete.id, invoiceNumber: invoiceToDelete.invoiceNumber }),
          { name: invoiceToDelete.partyName, actor: { uid: currentUser.uid, name: currentUser.name || '' } },
        );
      }
      batch.delete(invoiceDocRef);
      await batch.commit();
      if (collectionName === 'sales') clearSalesReportCache(companyId);
      else clearPurchaseReportCache(companyId);

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
