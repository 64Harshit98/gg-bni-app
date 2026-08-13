import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, storage } from '../../../../lib/Firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { ACTION, State } from '../../../../enums';
import { ROUTES } from '../../../../constants/routes.constants';
import { generatePdfBlob, generatePdf, compressImage } from '../../../../UseComponents/pdfGenerator';
import { getFirestoreOperations } from '../../../../lib/ItemsFirebase';
import { resolveCompanyLogoBase64 } from '../../../../Catalogue/hooks/useCompanyLogo';
import { botMasterService } from '../../../Additional/Whatsapp/WhatsappApi';
import { calculatePdfItemDiscounts } from '../sales.calculations';
import type { SalesItem } from '../sales.types';

interface UseSalesCommunicationParams {
    currentUser: any;
    salesSettings: any;
    setModal: (modal: { message: string; type: State } | null) => void;
    navigate: (path: string) => void;
    setItems: React.Dispatch<React.SetStateAction<SalesItem[]>>;
}

// Owns the PDF/WhatsApp/print/QR communication flow — moved verbatim from
// Sales.tsx (was the sendingPdf/printingPdf/showPrintSubMenu/enableTriplicate/
// savedBillData state, the bill-settings-fetch effect that feeds
// enableTriplicate, and preparePdfData/handleSendWhatsapp/handlePrintAction/
// showSuccessModal/handleCloseQrModal). Mirrors Journal's
// useInvoiceCommunication.ts.
//
// `isDrawerOpen`/`setIsDrawerOpen` (the PaymentDrawer's open state) also live
// here rather than in useSalesPayment: showSuccessModal closes the drawer on
// a successful save, and handleSavePayment (in useSalesPayment) needs to call
// showSuccessModal — putting isDrawerOpen in useSalesPayment would have made
// the two hooks depend on each other's output at hook-creation time. Keeping
// it here and passing setIsDrawerOpen forward into useSalesPayment and
// useSalesCalculator (which also opens the drawer, from the checkout button)
// avoids that cycle. Behavior is unchanged — only which file declares the
// useState.
export const useSalesCommunication = ({
    currentUser,
    salesSettings,
    setModal,
    navigate,
    setItems,
}: UseSalesCommunicationParams) => {
    const [savedBillData, setSavedBillData] = useState<{ id: string, number: string, invoiceData?: any } | null>(null);
    const [sendingPdf, setSendingPdf] = useState(false);
    const [printingPdf, setPrintingPdf] = useState(false);
    const [showPrintSubMenu, setShowPrintSubMenu] = useState(false);
    const [enableTriplicate, setEnableTriplicate] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    useEffect(() => {
        const fetchBillSettings = async () => {
            if (!currentUser?.companyId) return;
            try {
                const billSettingsRef = doc(db, 'companies', currentUser.companyId, 'settings', 'bill');
                const snap = await getDoc(billSettingsRef);
                if (snap.exists()) setEnableTriplicate(!!snap.data().enableTriplicate);
            } catch (err) {
                console.error('Error fetching bill settings for triplicate flag:', err);
            }
        };
        fetchBillSettings();
    }, [currentUser?.companyId]);

    const preparePdfData = async (invoice: any) => {
        if (!currentUser?.companyId) return null;
        const dbOps = getFirestoreOperations(currentUser.companyId);
        const [businessInfo, fetchedItems, billSettingsSnap, companyLogoBase64] = await Promise.all([
            dbOps.getBusinessInfo(),
            dbOps.syncItems(),
            getDoc(doc(db, 'companies', currentUser.companyId, 'settings', 'bill')),
            resolveCompanyLogoBase64(currentUser.companyId)
        ]);
        const billSettings = billSettingsSnap.exists() ? billSettingsSnap.data() : {};

        const populatedItems = await Promise.all((invoice.items || []).map(async (item: any, index: number) => {
            const fullItem = fetchedItems.find((fi: any) => fi.id === item.productId || fi.id === item.id);
            const finalTaxRate = item.taxRate || item.tax || fullItem?.tax || 0;
            // NEW: POS-Photos — sirf A4 format ke liye item image fetch + compress karo
            let imageBase64: string | undefined = undefined;
            if (billSettings.enableItemImages && (billSettings.posPrintFormat || 'A4') === 'A4') {
                const imageUrl = (fullItem as any)?.image || (fullItem as any)?.imageUrl || (fullItem as any)?.thumbnail || (fullItem as any)?.imageURL;
                if (imageUrl) {
                    try {
                        const res = await fetch(imageUrl);
                        const blob = await res.blob();
                        imageBase64 = await compressImage(blob);
                    } catch (e) {
                        console.error('Item image fetch failed for PDF:', e);
                    }
                }
            }
            const { itemAmount, discount1Amount, discount2Amount, d1Pct, d2Pct, absoluteDiscount } = calculatePdfItemDiscounts(item);
            return {
                sno: index + 1,
                name: item.name,
                quantity: item.quantity,
                unit: fullItem?.unit || item.unit || "Pcs",
                listPrice: item.mrp,
                gstPercent: finalTaxRate,
                hsn: fullItem?.hsnSac || item.hsnSac || "N/A",
                discountAmount: absoluteDiscount,
                discount1Amount,
                discount2Amount,
                discount1Percent: d1Pct,   // NEW
                discount2Percent: d2Pct,   // NEW
                amount: itemAmount,
                taxAmount: item.taxAmount || 0,
                taxableAmount: item.taxableAmount || 0,
                imageBase64,
            };
        }));

        return {
            printFormat: billSettings.posPrintFormat || 'A4',
            enableTriplicate: billSettings.enableTriplicate || false,
            enableItemImages: billSettings.enableItemImages || false, // NEW
            gstScheme: salesSettings?.gstScheme || '',
            taxType: salesSettings?.taxType || '',
            upiId: billSettings.upiId || '',   //  ADDED: without this, QR never generates
            companyName: businessInfo?.name || 'Your Company',
            companyAddress: businessInfo?.address || 'Your Address',
            companyContact: businessInfo?.phoneNumber || 'Your Phone',
            companyEmail: businessInfo?.email || '',
            companyLogoBase64: companyLogoBase64 || undefined,
            signatureBase64: billSettings.signatureBase64 || '',
            companyGstin: billSettings.companyGstin || businessInfo?.gstin || '',
            msmeNumber: billSettings.msmeNumber || '',
            panNumber: billSettings.panNumber || '',
            companyState: businessInfo?.state || '',
            billDiscount: invoice.manualDiscount || 0,
            discountDisplayFormat: billSettings?.discountDisplayFormat || 'amount',
            billTo: { name: invoice.partyName, address: invoice.partyAddress || '', phone: invoice.partyNumber || '', gstin: invoice.partyGstin || '' },
            shipTo: {
                name: invoice.shippingName || '',
                address: invoice.shippingAddress || '',
                phone: invoice.shippingNumber || '',
                gstin: invoice.shippingGST || '',
            },
            transportDetails: invoice.transportDetails || undefined,
            invoice: {
                number: invoice.invoiceNumber,
                date: new Date(invoice.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true }),
                billedBy: salesSettings?.enableSalesmanSelection ? (invoice.salesmanName || 'N/A') : '',
                roNumber: '',
            },
            items: populatedItems,
            terms: billSettings.posTermsAndConditions || billSettings.termsAndConditions || 'Goods once sold will not be taken back.',
            finalAmount: invoice.amount,
            expenses: invoice.expenses || [],
            advance: (() => {
                const pm = invoice.paymentMethods || {};
                const total = Object.entries(pm)
                    .filter(([k]) => k !== 'due')
                    .reduce((s, [, v]) => s + (Number(v) || 0), 0);
                return total > 0 ? total : 0;
            })(),
            due: invoice.dueAmount || 0,
            previousBalance: await (async () => {
                if (!currentUser?.companyId || !invoice.partyNumber) return 0;
                try {
                    const { getDocs, collection, query, where } = await import('firebase/firestore');
                    const salesRef = collection(db, 'companies', currentUser.companyId, 'sales');
                    const snap = await getDocs(query(salesRef, where('partyNumber', '==', invoice.partyNumber)));
                    let total = 0;
                    snap.forEach(d => {
                        if (d.id !== invoice.id) {
                            total += Number(d.data().paymentMethods?.due ?? 0);
                        }
                    });
                    const obRef = collection(db, 'companies', currentUser.companyId, 'openingBalances');
                    const obSnap = await getDocs(query(obRef, where('partyNumber', '==', invoice.partyNumber)));
                    obSnap.forEach(d => {
                        const data = d.data();
                        if ((data.balanceType ?? 'due') === 'due') {
                            total += Number(data.dueAmount ?? data.amount ?? 0);
                        }
                    });
                    return total;
                } catch { return 0; }
            })(),
            bankDetails: {
                accountName: billSettings.accountName || businessInfo?.accountHolderName,
                accountNumber: billSettings.accountNumber || businessInfo?.accountNumber,
                bankName: billSettings.bankName || businessInfo?.bankName,
                ifsc: billSettings.ifscCode || '',
            }
        };
    };

    const handleSendWhatsapp = async (invoice: any) => {
        if (!invoice.partyNumber) {
            setModal({ message: "Customer phone number is missing.", type: State.ERROR });
            return;
        }
        setSendingPdf(true);
        try {
            if (!currentUser?.companyId || !currentUser?.uid) throw new Error("User context missing.");

            const businessDocRef = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);
            const businessSnap = await getDoc(businessDocRef);
            const { botMasterToken, whatsappNumber } = businessSnap.data() || {};

            if (!botMasterToken || !whatsappNumber) {
                setSendingPdf(false);
                navigate(ROUTES.WHATSAPP_PLAN);
                return;
            }

            const dataForPdf = await preparePdfData(invoice);
            if (!dataForPdf) throw new Error("Failed to prepare invoice data.");
            const pdfBlob = await generatePdfBlob(dataForPdf);

            const safeNum = invoice.invoiceNumber.replace(/[\/\\?%*:|"<>]/g, '-');
            const cleanName = `${safeNum}.pdf`;
            const storageRef = ref(storage, cleanName);
            await uploadBytes(storageRef, pdfBlob);

            const fileUrl = await getDownloadURL(storageRef);
            // --- NEW: Fetch the extra message from bill settings ---
            const billSettingsSnap = await getDoc(doc(db, 'companies', currentUser.companyId, 'settings', 'bill'));
            const billSettingsData = billSettingsSnap.exists() ? billSettingsSnap.data() : {};
            const resolvedExtraMessage = billSettingsData.posWhatsappExtraMessage || '';
            const extraMsg = resolvedExtraMessage ? `\n\n${resolvedExtraMessage}` : '';
            // -------------------------------------------------------

            // Append the extraMsg to the end of your standard message
            const message = `Hello ${invoice.partyName},\n\nHere is your invoice #${invoice.invoiceNumber}.\nAmount: ${invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}\n\nThank you!${extraMsg}`;
            const response = await botMasterService.sendPdfFromUrl(botMasterToken, whatsappNumber, invoice.partyNumber, message, fileUrl, cleanName);

            let isSuccess = false;
            if (Array.isArray(response) && response.length > 0) {
                if (response[0].status === 'sent' || response[0].status === 'delivered') isSuccess = true;
            } else if (response?.status === 'sent' || response?.status === 'success' || response?.status === 200) {
                isSuccess = true;
            }

            if (isSuccess) {
                setModal({ message: "Invoice sent via WhatsApp!", type: State.SUCCESS });
                setSavedBillData(null);
                setTimeout(async () => {
                    try { await deleteObject(storageRef); } catch (e) { console.warn("Could not auto-delete:", e); }
                }, 60000);
            } else {
                throw new Error("API reported failure.");
            }
        } catch (err: any) {
            console.error("WhatsApp Send Error:", err?.code, err?.message);
            setModal({ message: "Failed to send invoice via WhatsApp. Please try again.", type: State.ERROR });
        } finally {
            setSendingPdf(false);
        }
    };
    const handlePrintAction = async (invoice: any, withDuplicate: boolean = false) => {
        setShowPrintSubMenu(false);
        setPrintingPdf(true);
        try {
            const dataForPdf = await preparePdfData(invoice);
            if (dataForPdf) {
                await generatePdf(dataForPdf, ACTION.PRINT, withDuplicate);
            } else {
                throw new Error("Could not prepare PDF data");
            }
        } catch (err) {
            console.error('Failed to print PDF:', err);
            setModal({ message: 'Failed to print invoice. Please try again.', type: State.ERROR });
        } finally {
            setPrintingPdf(false);
        }
    };
    const showSuccessModal = (message: string, navigateTo?: string) => {
        sessionStorage.removeItem('sales_cart_draft');
        sessionStorage.removeItem('sales_tax_mode_draft');
        sessionStorage.removeItem('sales_salesman_draft');
        setIsDrawerOpen(false);
        setModal({ message, type: State.SUCCESS });
        setTimeout(() => { setModal(null); if (navigateTo) navigate(navigateTo); else if (!salesSettings?.copyVoucherAfterSaving) setItems([]); }, 1500);
    };
    const handleCloseQrModal = () => { setSavedBillData(null); };

    return {
        savedBillData, setSavedBillData,
        sendingPdf, setSendingPdf,
        printingPdf, setPrintingPdf,
        showPrintSubMenu, setShowPrintSubMenu,
        enableTriplicate,
        isDrawerOpen, setIsDrawerOpen,
        preparePdfData,
        handleSendWhatsapp,
        handlePrintAction,
        showSuccessModal,
        handleCloseQrModal,
    };
};
