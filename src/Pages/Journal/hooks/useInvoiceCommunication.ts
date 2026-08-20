import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, storage } from '../../../lib/Firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { State, ACTION } from '../../../enums';
import { ROUTES } from '../../../constants/routes.constants';
import { generatePdf, generatePdfBlob, compressImage } from '../../../UseComponents/pdfGenerator';
import { getFirestoreOperations } from '../../../lib/ItemsFirebase';
import { resolveCompanyLogoBase64 } from '../../../Catalogue/hooks/useCompanyLogo';
import { botMasterService } from '../../Additional/Whatsapp/WhatsappApi';
import type { Invoice, PdfData } from '../journal.types';

interface UseInvoiceCommunicationParams {
  currentUser: any;
  salesSettings: any;
  isPosBasicPlan: boolean;
  setModal: (modal: { message: string; type: State } | null) => void;
}

// Owns the PDF/WhatsApp/QR communication flow — moved verbatim from
// Journal.tsx (was the pdfGenerating/invoiceToPrint/showQrModal/sendingPdf/
// showPrintSubMenu/enableTriplicate/billType state, the bill-settings-fetch
// effect that only fed enableTriplicate, and preparePdfData/handlePdfAction/
// handleSendWhatsapp/handleSendReminder/handleShowQr/handlePrintQr).
export const useInvoiceCommunication = ({
  currentUser,
  salesSettings,
  isPosBasicPlan,
  setModal,
}: UseInvoiceCommunicationParams) => {
  const navigate = useNavigate();

  const [pdfGenerating, setPdfGenerating] = useState<string | null>(null);
  const [invoiceToPrint, setInvoiceToPrint] = useState<Invoice | null>(null);
  const [showQrModal, setShowQrModal] = useState<Invoice | null>(null);
  const [sendingPdf, setSendingPdf] = useState(false);
  const [showPrintSubMenu, setShowPrintSubMenu] = useState(false);
  const [enableTriplicate, setEnableTriplicate] = useState(false);
  // Bill type toggle for action modal
  const [billType, setBillType] = useState<'estimate' | 'bill'>('bill');

  // NEW: fetch bill settings to know if triplicate printing is enabled
  useEffect(() => {
    const fetchBillSettings = async () => {
      if (!currentUser?.companyId) return;
      try {
        const billSettingsRef = doc(db, 'companies', currentUser.companyId, 'settings', 'bill');
        const snap = await getDoc(billSettingsRef);
        if (snap.exists()) {
          setEnableTriplicate(!!snap.data().enableTriplicate); // FIXED: field is 'enableTriplicate', not 'posEnableTriplicate'
        }
      } catch (err) {
        console.error('Error fetching bill settings for triplicate flag:', err);
      }
    };
    fetchBillSettings();
  }, [currentUser?.companyId]);

  const preparePdfData = async (invoice: Invoice, forcePosPrint: boolean = false): Promise<PdfData | null> => {
    if (!currentUser?.companyId) return null;

    const dbOps = getFirestoreOperations(currentUser.companyId);

    // --- RESTORED: Identify if it's a purchase bill so we use purchasePrice ---
    const isPurchase = invoice.type === 'Debit';

    // PERF: previousBalance used to be computed with `await` inside the return
    // object below, which meant its two Firestore queries only started after
    // ALL of businessInfo/syncItems/billSettings/companyLogo had already
    // resolved. Starting it here lets it run concurrently with those instead
    // of adding its own round-trip time on top — same queries, same result,
    // just no longer serialized.
    const previousBalancePromise = (async (): Promise<number> => {
      if (!currentUser?.companyId || !invoice.partyNumber) return 0;
      try {
        const { getDocs, collection, query, where, } = await import('firebase/firestore');
        const salesRef = collection(db, 'companies', currentUser.companyId, 'sales');
        const snap = await getDocs(query(
          salesRef,
          where('partyNumber', '==', invoice.partyNumber)
        ));
        let total = 0;
        snap.forEach(d => {
          // Exclude current invoice, sum all other dues
          if (d.id !== invoice.id) {
            total += Number(d.data().paymentMethods?.due ?? 0);
          }
        });
        const obRef = collection(db, 'companies', currentUser.companyId, 'openingBalances');
        const obSnap = await getDocs(query(
          obRef,
          where('partyNumber', '==', invoice.partyNumber)
        ));
        obSnap.forEach(d => {
          const data = d.data();
          // Sirf 'due' type OB add karo, 'advance' nahi
          if ((data.balanceType ?? 'due') === 'due') {
            total += Number(data.dueAmount ?? data.amount ?? 0);
          }
        });
        return total;
      } catch { return 0; }
    })();

    const [businessInfo, fetchedItems, billSettingsSnap, companyLogoBase64, previousBalance] = await Promise.all([
      dbOps.getBusinessInfo(),
      dbOps.syncItems(),
      getDoc(doc(db, 'companies', currentUser.companyId, 'settings', 'bill')),
      resolveCompanyLogoBase64(currentUser.companyId),
      previousBalancePromise,
    ]);

    const billSettings = billSettingsSnap.exists() ? billSettingsSnap.data() : {};

    const populatedItems = (invoice.items || []).map((item: any, index: number) => {
      const fullItem: any = fetchedItems.find((fi: any) => fi.id === item.id) || {};
      const finalTaxRate = item.taxRate || item.tax || item.gstPercent || fullItem.tax || 0;
      const resolvedTaxType = item.taxType || invoice.taxType || salesSettings?.taxType || '';

      // --- RESTORED: Bulletproof Line Amount Calculation ---
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

      // --- BUG FIXES (SCRUM-1044 & SCRUM-1054) ---
      const qty = Number(item.quantity) || 1;

      // 1. Find the ACTUAL mrp to tell the PDF generator if it should change the header
      const actualMrp = isPurchase
        ? (Number(item.purchasePrice) || 0)
        : (Number(item.mrp) || 0);

      // 2. Determine the base price for calculation (fallback to salesPrice if mrp is 0)
      const basePrice = actualMrp > 0
        ? actualMrp
        : (Number(item.salesPrice) || 0);

      // 3. Calculate absolute currency discount dynamically
      let absoluteDiscount = (basePrice * qty) - itemAmount;
      if (absoluteDiscount < 0) absoluteDiscount = 0;

      // 4. Discount 1 + Discount 2 in ₹ amounts
      const d1Pct = Number(item.discount || item.discountPercentage) || 0;
      const d2Pct = Number(item.discount2) || 0;

      const priceAfterD1 = basePrice * (1 - d1Pct / 100);
      const priceAfterD2 = priceAfterD1 * (1 - d2Pct / 100);

      const discount1Amount = (basePrice - priceAfterD1) * qty;

      // Back-calculate discount2Amount from actual taxableAmount if discount2 pct is missing
      let discount2Amount = (priceAfterD1 - priceAfterD2) * qty;
      if (d2Pct === 0 && itemAmount > 0) {
        // totalDiscount = basePrice*qty - itemAmount
        const totalDiscountAmt = (basePrice * qty) - itemAmount;
        discount2Amount = Math.max(0, totalDiscountAmt - discount1Amount);
      }

      return {
        sno: index + 1,
        name: item.name,
        quantity: qty,
        unit: fullItem.unit || item.unit || "Pcs",
        hsn: fullItem.hsnSac || item.hsnSac || "N/A",
        listPrice: actualMrp,
        price: basePrice,

        discountAmount: absoluteDiscount,
        discount1Amount,   // NEW
        discount2Amount,   // NEW
        discount1Percent: d1Pct,   // NEW
        discount2Percent: d2Pct,   // NEW
        amount: itemAmount,
        taxType: resolvedTaxType,
        taxAmount: item.taxAmount || 0,
        taxableAmount: item.taxableAmount || 0,
        gstPercent: finalTaxRate,
        taxRate: finalTaxRate,
        imageBase64: undefined as string | undefined,
      };
    });

    // NEW: POS-Photos — setting ON
    // NEW: POS-Photos — sirf A4 format ke liye, aur setting ON hone par hi photos fetch karo
    const resolvedPrintFormat = (forcePosPrint || isPosBasicPlan) ? 'THERMAL58' : (billSettings.posPrintFormat || 'A4');
    if (billSettings.enableItemImages && resolvedPrintFormat === 'A4') {
      await Promise.all(populatedItems.map(async (pItem: any, idx: number) => {
        const original = (invoice.items || [])[idx];
        const fullItem: any = fetchedItems.find((fi: any) => fi.id === original?.id) || {};
        const imageUrl = fullItem.image || fullItem.imageUrl || fullItem.thumbnail || fullItem.imageURL;
        if (imageUrl) {
          try {
            const res = await fetch(imageUrl);
            const blob = await res.blob();
            pItem.imageBase64 = await compressImage(blob);
          } catch (e) {
            console.error('Item image fetch failed for PDF:', e);
          }
        }
      }));
    }

    return {
      printFormat: (forcePosPrint || isPosBasicPlan) ? 'THERMAL58' : (billSettings.posPrintFormat || 'A4'),
      enableTriplicate: billSettings.enableTriplicate || false,
      enableItemImages: billSettings.enableItemImages || false, // NEW
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
      companyState: businessInfo?.state || '',         // <-- ADD THIS
      placeOfSupply: invoice.placeOfSupply || '',
      billDiscount: invoice.manualDiscount || 0,
      discountDisplayFormat: billSettings?.discountDisplayFormat || 'amount',
      enableDiscount2: salesSettings?.enableDiscount2 || false,
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
          day: 'numeric', month: 'short', year: 'numeric',
          hour: 'numeric', minute: 'numeric', hour12: true
        }),
        billedBy: salesSettings?.enableSalesmanSelection ? (invoice.salesmanName || 'N/A') : '',
        roNumber: '',
      },
      advance: (() => {
        const pm = invoice.paymentMethods || {};
        const total = Object.entries(pm)
          .filter(([k]) => k !== 'due')
          .reduce((s, [, v]) => s + (Number(v) || 0), 0);
        return total > 0 ? total : 0;
      })(),
      due: invoice.dueAmount || 0,
      previousBalance,
      items: populatedItems,
      // Strictly from Bill Settings — billSettings.termsAndConditions isn't a
      // real field in the persisted doc (posTermsAndConditions/
      // catalogueTermsAndConditions are), so that half of the old fallback
      // was always undefined anyway.
      terms: billSettings.posTermsAndConditions || '',
      finalAmount: invoice.amount,
      isEstimate: (invoice as any).isEstimate || false,
      bankDetails: {
        accountName: businessInfo?.accountHolderName || billSettings.accountName,
        accountNumber: businessInfo?.accountNumber || billSettings.accountNumber,
        bankName: businessInfo?.bankName || billSettings.bankName,
        ifsc: businessInfo?.ifscCode || billSettings.ifscCode || '',
      }
    };
  };

  const handlePdfAction = async (invoice: Invoice, action: ACTION.DOWNLOAD | ACTION.PRINT, withDuplicate: boolean = false) => {
    setInvoiceToPrint(null);
    setPdfGenerating(invoice.id);

    if (!currentUser?.companyId) {
      setModal({ message: 'User company ID missing.', type: State.ERROR });
      setPdfGenerating(null);
      return;
    }

    try {
      const dataForPdf = await preparePdfData({
        ...invoice,
        isEstimate: billType === 'estimate'
      } as any, isPosBasicPlan);
      if (dataForPdf) {
        await generatePdf(dataForPdf, action, withDuplicate);
      } else {
        throw new Error("Could not prepare PDF data");
      }
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setModal({ message: 'Failed to process PDF action.', type: State.ERROR });
    } finally {
      setPdfGenerating(null);
    }
  };

  const handleSendWhatsapp = async (invoice: Invoice) => {
    if (!invoice.partyNumber) {
      setModal({ message: "Customer phone number is missing.", type: State.ERROR });
      return;
    }

    setSendingPdf(true);

    try {
      if (!currentUser?.companyId || !currentUser?.uid) throw new Error("User context missing.");

      const businessDocRef = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);
      const extraMsgSettingsRef = doc(db, 'companies', currentUser.companyId, 'settings', 'bill');

      // PERF: these three used to run one after another (business_info fetch,
      // THEN preparePdfData, THEN — after the PDF was already built and
      // uploaded — a second bill-settings fetch just for the WhatsApp extra
      // message). None of the three depends on either of the others, so
      // running them together removes two full sequential round-trips from
      // the critical path. Same data, same checks, just started concurrently.
      const [businessSnap, dataForPdf, billSettingsSnap] = await Promise.all([
        getDoc(businessDocRef),
        preparePdfData({ ...invoice, isEstimate: billType === 'estimate' } as any, isPosBasicPlan),
        getDoc(extraMsgSettingsRef),
      ]);

      const { botMasterToken, whatsappNumber } = businessSnap.data() || {};

      if (!botMasterToken || !whatsappNumber) {
        setSendingPdf(false);
        navigate(ROUTES.WHATSAPP_PLAN);
        return;
      }

      if (!dataForPdf) throw new Error("Failed to prepare invoice data.");

      const pdfBlob = await generatePdfBlob(dataForPdf);

      const safeNum = invoice.invoiceNumber.replace(/[\/\\?%*:|"<>]/g, '-');
      const cleanName = `${safeNum}.pdf`;
      const storageRef = ref(storage, cleanName);
      await uploadBytes(storageRef, pdfBlob);

      const fileUrl = await getDownloadURL(storageRef);

      const billSettingsData = billSettingsSnap.exists() ? billSettingsSnap.data() : {};
      const resolvedExtraMessage = billSettingsData.posWhatsappExtraMessage || '';
      const extraMsg = resolvedExtraMessage ? `\n\n${resolvedExtraMessage}` : '';

      // Append the extraMsg to the end of your standard message
      const message = `Hello ${invoice.partyName},\n\nHere is your invoice #${invoice.invoiceNumber}.\nAmount: ${invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}\n\nThank you!${extraMsg}`;
      const response = await botMasterService.sendPdfFromUrl(
        botMasterToken,
        whatsappNumber,
        invoice.partyNumber,
        message,
        fileUrl,
        cleanName
      );

      let isSuccess = false;
      if (Array.isArray(response) && response.length > 0) {
        const res = response[0];
        if (res.status === 'sent' || res.status === 'delivered') isSuccess = true;
      } else if (response.status === 'sent' || response.status === 'success' || response.status === 200) {
        isSuccess = true;
      }

      if (isSuccess) {
        setModal({ message: "Invoice PDF sent via WhatsApp!", type: State.SUCCESS });
        // Cleanup temp file after 1 minute, same pattern as handleSendReminder.
        // (This used to live in a dead `if (isSuccess)` block checked before
        // isSuccess was ever computed, so it never actually ran — restored
        // here in the branch that's actually reachable.)
        setTimeout(async () => {
          try {
            await deleteObject(storageRef);
          } catch (error) {
            console.warn("Could not auto-delete temp file:", error);
          }
        }, 60000);
        setInvoiceToPrint(null);
      } else {
        throw new Error("API reported failure.");
      }
    } catch (err: any) {
      console.error("WhatsApp Send Error:", err);
      setModal({ message: "Failed to send WhatsApp invoice.", type: State.ERROR });
    } finally {
      setSendingPdf(false);
    }
  };

  const handleSendReminder = async (invoice: Invoice) => {
    if (!invoice.partyNumber) {
      setModal({ message: "Customer phone number is missing.", type: State.ERROR });
      return;
    }
    if (!currentUser?.companyId) return;

    setSendingPdf(true);

    try {
      const businessDocRef = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);

      // PERF: run the business_info fetch and PDF prep concurrently instead
      // of one after the other — preparePdfData doesn't depend on
      // botMasterToken/whatsappNumber, so there's no need to wait for it.
      const [businessSnap, dataForPdf] = await Promise.all([
        getDoc(businessDocRef),
        preparePdfData({ ...invoice, isEstimate: billType === 'estimate' } as any, isPosBasicPlan),
      ]);

      const { botMasterToken, whatsappNumber } = businessSnap.data() || {};

      if (!botMasterToken || !whatsappNumber) {
        setSendingPdf(false);
        navigate(ROUTES.WHATSAPP_PLAN);
        return;
      }

      if (!dataForPdf) throw new Error("Failed to prepare invoice data.");

      const pdfBlob = await generatePdfBlob(dataForPdf);

      const safeNum = invoice.invoiceNumber.replace(/[\/\\?%*:|"<>]/g, '-');
      const cleanName = `${safeNum}.pdf`;
      const storageRef = ref(storage, cleanName);
      await uploadBytes(storageRef, pdfBlob);

      const fileUrl = await getDownloadURL(storageRef);
      // -------------------------------------------------------------

      const dueAmt = (invoice.dueAmount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
      const totalAmt = invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

      const message = `Dear ${invoice.partyName},\n\nThis is a gentle reminder that an amount of ${dueAmt} is still due against your invoice #${invoice.invoiceNumber} (Total: ${totalAmt}).\n\nKindly clear the due amount at your earliest convenience. Thank you!`;

      const response = await botMasterService.sendPdfFromUrl(
        botMasterToken,
        whatsappNumber,
        invoice.partyNumber,
        message,
        fileUrl,
        cleanName
      );

      let isSuccess = false;
      if (Array.isArray(response) && response.length > 0) {
        const res = response[0];
        if (res.status === 'sent' || res.status === 'delivered') isSuccess = true;
      } else if (response?.status === 'sent' || response?.status === 'success' || response?.status === 200) {
        isSuccess = true;
      }

      if (isSuccess) {
        setModal({ message: "Reminder sent via WhatsApp!", type: State.SUCCESS });
        // Cleanup temp file after 1 minute, same pattern as handleSendWhatsapp
        setTimeout(async () => {
          try {
            await deleteObject(storageRef);
          } catch (error) {
            console.warn("Could not auto-delete temp file:", error);
          }
        }, 60000);
      } else {
        throw new Error("API reported failure.");
      }
    } catch (err) {
      console.error("Reminder Send Error:", err);
      setModal({ message: "Failed to send reminder.", type: State.ERROR });
    } finally {
      setSendingPdf(false);
    }
  };

  const handleShowQr = (invoice: Invoice) => {
    setInvoiceToPrint(null);
    setShowQrModal(invoice);
  };

  const handlePrintQr = (invoice: Invoice) => {
    if (!invoice.items || invoice.items.length === 0) {
      setModal({ message: "No items found in this invoice to print.", type: State.ERROR });
      return;
    }
    const cleanItems = invoice.items.map(item => ({
      id: item.id,
      name: item.name,
      quantity: Number(item.quantity),
      mrp: Number(item.mrp),
      barcode: item.barcode || '',
    }));
    navigate(ROUTES.PRINTQR, {
      state: { prefilledItems: cleanItems }
    });
  };

  return {
    pdfGenerating, setPdfGenerating,
    invoiceToPrint, setInvoiceToPrint,
    showQrModal, setShowQrModal,
    sendingPdf, setSendingPdf,
    showPrintSubMenu, setShowPrintSubMenu,
    enableTriplicate,
    billType, setBillType,
    preparePdfData,
    handlePdfAction,
    handleSendWhatsapp,
    handleSendReminder,
    handleShowQr,
    handlePrintQr,
  };
};
