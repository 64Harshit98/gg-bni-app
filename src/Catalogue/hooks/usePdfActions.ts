import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, storage } from '../../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { State, ACTION } from '../../enums';
import { ROUTES } from '../../constants/routes.constants';
import { generatePdf, generatePdfBlob } from '../../UseComponents/pdfGenerator';
import { getFirestoreOperations } from '../../lib/ItemsFirebase';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import { botMasterService } from '../../Pages/Additional//Whatsapp/WhatsappApi';
import type { Invoice, PdfData } from '../../constants/models';

export const usePdfActions = (
  currentUser: any,
  salesSettings: any,
  setModal: (m: { message: string; type: State } | null) => void
) => {
  const navigate = useNavigate();
  const [pdfGenerating, setPdfGenerating] = useState<string | null>(null);
  const [sendingPdf,    setSendingPdf]    = useState(false);

  const preparePdfData = async (invoice: Invoice): Promise<PdfData | null> => {
    if (!currentUser?.companyId) return null;

    const dbOps = getFirestoreOperations(currentUser.companyId);
    const isPurchase = invoice.type === 'Debit';

    const [businessInfo, fetchedItems, billSettingsSnap, companyLogoBase64] = await Promise.all([
      dbOps.getBusinessInfo(),
      dbOps.syncItems(),
      getDoc(doc(db, 'companies', currentUser.companyId, 'settings', 'bill')),
      resolveCompanyLogoBase64(currentUser.companyId),
    ]);

    const billSettings = billSettingsSnap.exists() ? billSettingsSnap.data() : {};

    const populatedItems = (invoice.items || []).map((item: any, index: number) => {
      const fullItem = fetchedItems.find((fi: any) => fi.id === item.id);
      const finalTaxRate = item.taxRate || item.tax || item.gstPercent || fullItem?.tax || 0;
      const resolvedTaxType = item.taxType || invoice.taxType || salesSettings?.taxType || '';

      let itemAmount = 0;
      if (resolvedTaxType === 'Exclusive' && item.taxableAmount) {
        itemAmount = item.taxableAmount;
      } else if (item.effectiveUnitPrice > 0) {
        itemAmount = item.effectiveUnitPrice * item.quantity;
      } else if (item.finalPrice > 0) {
        itemAmount = item.finalPrice;
      } else {
        itemAmount = item.mrp * item.quantity;
      }

      return {
        sno: index + 1,
        name: item.name,
        quantity: item.quantity,
        unit: fullItem?.unit || item.unit || 'Pcs',
        listPrice: isPurchase ? (item.purchasePrice || item.mrp) : item.mrp,
        gstPercent: finalTaxRate,
        hsn: fullItem?.hsnSac || item.hsnSac || 'N/A',
        discountAmount: isPurchase
          ? (item.purchasediscount || item.discount || item.manualDiscount || 0)
          : (item.discount || item.manualDiscount || 0),
        amount: itemAmount,
        taxType: resolvedTaxType,
        taxAmount: item.taxAmount,
        taxableAmount: item.taxableAmount,
      };
    });

    return {
      printFormat: billSettings.printFormat || 'A4',
      gstScheme: salesSettings?.gstScheme || '',
      taxType: invoice.taxType || salesSettings?.taxType || '',
      companyName: businessInfo?.name || '',
      companyAddress: businessInfo?.address || '',
      companyContact: businessInfo?.phoneNumber || '',
      companyEmail: businessInfo?.email || '',
      companyLogoBase64: companyLogoBase64 || undefined,
      signatureBase64: billSettings.signatureBase64 || '',
      companyGstin: billSettings.companyGstin || businessInfo?.gstin || '',
      msmeNumber: billSettings.msmeNumber || '',
      panNumber: billSettings.panNumber || '',
      billDiscount: invoice.manualDiscount || 0,
      upiId: billSettings.upiId || '',
      billTo: {
        name: invoice.partyName || '',
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
      extraExpenseName: invoice.extraExpenseName || '',
      extraExpenseAmount: invoice.extraExpenseAmount || 0,
      narration: invoice.narration || '',
      invoice: {
        number: invoice.invoiceNumber,
        date: new Date(invoice.createdAt).toLocaleString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: 'numeric', minute: 'numeric', hour12: true,
        }),
        billedBy: salesSettings?.enableSalesmanSelection ? (invoice.salesmanName || 'N/A') : '',
        roNumber: '',
      },
      items: populatedItems,
      terms: billSettings.termsAndConditions || 'Goods once sold will not be taken back.',
      finalAmount: invoice.totalAmount,
      isEstimate: (invoice as any).isEstimate || false,
      bankDetails: {
        accountName:   billSettings.accountName   || businessInfo?.accountHolderName,
        accountNumber: billSettings.accountNumber || businessInfo?.accountNumber,
        bankName:      billSettings.bankName      || businessInfo?.bankName,
        ifsc:          billSettings.ifscCode      || '',
      },
    };
  };

  const handlePdfAction = async (
    invoice: Invoice,
    action: ACTION.DOWNLOAD | ACTION.PRINT,
    billType: 'estimate' | 'bill'
  ) => {
    setPdfGenerating(invoice.id);
    if (!currentUser?.companyId) {
      setModal({ message: 'User company ID missing.', type: State.ERROR });
      setPdfGenerating(null);
      return;
    }
    try {
      const dataForPdf = await preparePdfData({ ...invoice, isEstimate: billType === 'estimate' } as any);
      if (dataForPdf) await generatePdf(dataForPdf, action);
      else throw new Error('Could not prepare PDF data');
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setModal({ message: 'Failed to process PDF action.', type: State.ERROR });
    } finally {
      setPdfGenerating(null);
    }
  };

  const handleSendWhatsapp = async (invoice: Invoice, billType: 'estimate' | 'bill') => {
    if (!invoice.partyNumber) {
      setModal({ message: 'Customer phone number is missing.', type: State.ERROR });
      return;
    }
    setSendingPdf(true);
    try {
      if (!currentUser?.companyId || !currentUser?.uid) throw new Error('User context missing.');

      const businessDocRef = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);
      const businessSnap = await getDoc(businessDocRef);
      const { botMasterToken, whatsappNumber } = businessSnap.data() || {};

      if (!botMasterToken || !whatsappNumber) {
        setSendingPdf(false);
        navigate(ROUTES.WHATSAPP_PLAN);
        return;
      }

      const dataForPdf = await preparePdfData({ ...invoice, isEstimate: billType === 'estimate' } as any);
      if (!dataForPdf) throw new Error('Failed to prepare invoice data.');

      const pdfBlob   = await generatePdfBlob(dataForPdf);
      const cleanName = `${invoice.invoiceNumber.replace(/[\/\\?%*:|"<>]/g, '-')}.pdf`;
      const storageRef = ref(storage, cleanName);

      await uploadBytes(storageRef, pdfBlob);
      const fileUrl = await getDownloadURL(storageRef);

      const message = `Hello ${invoice.partyName},\n\nHere is your invoice #${invoice.invoiceNumber}.\nAmount: ${invoice.totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}\n\nThank you!`;
      const response = await botMasterService.sendPdfFromUrl(botMasterToken, whatsappNumber, invoice.partyNumber, message, fileUrl, cleanName);

      let isSuccess =
        (Array.isArray(response) && ['sent', 'delivered'].includes(response[0]?.status)) ||
        (!Array.isArray(response) && ['sent', 'success', 200].includes(response.status));

      if (isSuccess) {
        setModal({ message: 'Invoice PDF sent via WhatsApp!', type: State.SUCCESS });
        setTimeout(async () => {
          try { await deleteObject(storageRef); } catch { /* cleanup best-effort */ }
        }, 60000);
      } else {
        throw new Error('API reported failure.');
      }
    } catch (err) {
      console.error('WhatsApp Send Error:', err);
      setModal({ message: 'Failed to send WhatsApp invoice.', type: State.ERROR });
    } finally {
      setSendingPdf(false);
    }
  };

  return { pdfGenerating, sendingPdf, preparePdfData, handlePdfAction, handleSendWhatsapp };
};
