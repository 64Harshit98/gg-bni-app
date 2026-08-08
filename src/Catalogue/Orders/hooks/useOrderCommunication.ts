import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { storage } from '../../../lib/Firebase'; // Ensure 'storage' is exported from your Firebase config
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { botMasterService } from '../../../Pages/Additional/Whatsapp/WhatsappApi';
import { ROUTES } from '../../../constants/routes.constants';
import { State } from '../../../enums';
import { ACTION } from '../../../enums/action.enum';
import type { Item } from '../../../constants/models';
import type { Order } from '../orders.types';
import { CatalogueBill, prepareCatalogueBillData } from '../../CatalogueBill/CatalogueBill';

interface UseOrderCommunicationParams {
    currentUser: any;
    companyInfo: any;
    availableItems: Item[];
    catalogueWhatsappExtra: string;
    setModal: (modal: { message: string; type: State } | null) => void;
}

// ─── Shared bill-building helpers ───────────────────────────────────────────
// Previously each of handlePdfAction/handleSendWhatsapp/handleSendReminder
// independently reimplemented these two blocks. Consolidated here; see the
// notes on computeStatusAwareAmounts below for the one behavior change made
// while doing so (handleSendReminder's due-amount formula was a bug, fixed).

interface BillItem {
    sno: number;
    name: string;
    qty: number;
    unitMultiplier: number;
    tax: number;
    mrp: number;
    price: number;
    total: number;
    imageBase64: string;
    discount: number;
    discount2: number;
}

// Builds the per-item array (with base64 images + discount-display math) used
// by the generated PDF. `availableItems`, when non-empty, enables the
// catalog-image fallback + "no image anywhere" warning that only
// handlePdfAction originally had — passing nothing (the default) reproduces
// handleSendWhatsapp/handleSendReminder's simpler behavior exactly.
const buildBillItems = async (
    items: Order['items'],
    convertImageUrlToBase64: (url: string, itemName: string) => Promise<string>,
    availableItems: Item[] = []
): Promise<BillItem[]> => {
    return Promise.all((items || []).map(async (item: any, index: number) => {
        const mrp = Number(item.mrp || 0);
        const salesPrice = Number(item.salesPrice || 0);
        const actualPrice = item.effectiveUnitPrice ?? item.customPrice ?? (salesPrice > 0 ? salesPrice : mrp);

        let targetImageUrl = item.imageUrl;
        if (!targetImageUrl && availableItems.length > 0) {
            const catalogItem = availableItems.find(master => String(master.id) === String(item.itemId || item.id));
            if (catalogItem && catalogItem.imageUrl) {
                targetImageUrl = catalogItem.imageUrl;
            }
        }

        let base64Image = "";
        if (targetImageUrl) {
            base64Image = await convertImageUrlToBase64(targetImageUrl, item.name);
        } else if (availableItems.length > 0) {
            console.warn(`⚠️ 3. Item [${item.name}] has NO imageUrl in both Order AND Catalog.`);
        }

        const basePriceForDiscount = mrp > 0 ? mrp : salesPrice;
        const storedDiscount2 = Number(item.discount2 ?? 0);
        let effectiveDiscount1 = Number(item.discount ?? 0);
        if (basePriceForDiscount > 0 && actualPrice > 0 && storedDiscount2 === 0) {
            effectiveDiscount1 = ((basePriceForDiscount - actualPrice) / basePriceForDiscount) * 100;
        }
        return {
            sno: index + 1,
            name: item.name,
            qty: item.quantity,
            unitMultiplier: item.unitMultiplier ?? 1,
            tax: item.tax ?? 0,
            mrp: mrp,
            price: actualPrice,
            total: actualPrice * item.quantity,
            imageBase64: base64Image,
            discount: Number(effectiveDiscount1.toFixed(2)),
            discount2: Number(item.discount2 ?? 0),
        };
    }));
};

// Replaces handlePdfAction's old duplicated previous-balance fetch (it used
// to compute this twice — once into a dead `previousBalance` variable that
// was never read, once into `wpPreviousBalance` which was actually used).
// Only handlePdfAction calls this.
const fetchPreviousBalance = async (
    companyId: string | undefined,
    customerPhone: string,
    excludeOrderId: string
): Promise<number> => {
    let previousBalance = 0;
    if (!companyId || !customerPhone) return previousBalance;

    try {
        // 1. Due from other Orders
        const salesRef = collection(db, 'companies', companyId, 'Orders');
        const snap = await getDocs(query(salesRef, where('userLoginPhone', '==', customerPhone)));
        snap.forEach(d => {
            if (d.id !== excludeOrderId) {
                const data = d.data();
                const total = Number(data.totalAmount || 0);
                const paid = Number(data.paidAmount || 0);
                previousBalance += Math.max(0, total - paid);
            }
        });

        // 2. Due from openingBalances (same party phone)
        const obRef = collection(db, 'companies', companyId, 'openingBalances');
        const obSnap = await getDocs(query(obRef, where('partyNumber', '==', customerPhone)));
        obSnap.forEach(d => {
            const data = d.data();
            // Only 'due' type OB adds to previous balance, 'advance' does not
            if ((data.balanceType ?? 'due') === 'due') {
                previousBalance += Number(data.dueAmount ?? data.amount ?? 0);
            }
        });
    } catch (e) {
        console.error('Previous balance fetch error:', e);
    }

    return previousBalance;
};

// The order-total/paid/due formula used for the generated bill and (as of
// this consolidation) the reminder message too. Treats a 'Paid' order as
// fully settled (dueAmount forced to 0) even if the stored paidAmount field
// is stale/lower than totalAmount.
//
// FIX: handleSendReminder previously used a different, non-status-aware
// formula (`due = max(0, totalAmount - paidAmount)` with no status check),
// meaning a 'Paid' order with a stale paidAmount could trigger a WhatsApp
// reminder claiming a balance was still due, even though the bill/list views
// would show it as settled. Unified on this formula so all three send flows
// agree.
const computeStatusAwareAmounts = (order: Order) => {
    const paidAmount = order.status === 'Paid' ? order.totalAmount : Number(order.paidAmount || 0);
    const dueAmount = order.status === 'Paid' ? 0 : Math.max(0, order.totalAmount - Number(order.paidAmount || 0));
    return { paidAmount, advancePaid: paidAmount, dueAmount };
};

interface BuildRawBillDataParams {
    order: Order;
    companyInfo: any;
    businessData: any;
    companyId: string | undefined;
    items: BillItem[];
    grandTotal: number;
    paidAmount: number;
    advancePaid: number;
    dueAmount: number;
    previousBalance?: number;
    billingExtras?: {
        billDiscount: number;
        extraExpenseName: string;
        extraExpenseAmount: number;
        extraExpenses: { name: string; amount: number }[];
    };
}

// Shapes the order into whatever prepareCatalogueBillData/CatalogueBill
// expect. previousBalance/billingExtras are omitted from the returned object
// entirely (not zeroed) when not passed, matching handleSendWhatsapp/
// handleSendReminder's original payload shape, which never included those keys.
const buildRawBillData = ({
    order,
    companyInfo,
    businessData,
    companyId,
    items,
    grandTotal,
    paidAmount,
    advancePaid,
    dueAmount,
    previousBalance,
    billingExtras,
}: BuildRawBillDataParams): Record<string, any> => {
    const data: Record<string, any> = {
        companyId,
        companyName: companyInfo?.name || "",
        companyAddress: companyInfo?.address || "",
        companyPhone: companyInfo?.ownerPhoneNumber || "",
        placeOfSupply: order.shippingDetails?.state || "",
        companyGstin: businessData.gstin || "",
        panNumber: businessData.panNumber || "",
        msmeNumber: businessData.msmeUdyamNumber || "",

        bankName: businessData.bankName || "",
        accountName: businessData.accountHolderName || "",
        accountNumber: businessData.accountNumber || "",
        ifscCode: businessData.ifscCode || "",

        specialInstruction: order.specialInstruction || "",
        transportDetails: order.transportDetails || null,
        customer: {
            billing: {
                name: order.billingDetails?.name || order.userName || "Customer",
                phone: order.billingDetails?.phone || order.userLoginPhone || "",
                address: order.billingDetails?.address || "",
                city: order.billingDetails?.city || "",
                state: order.billingDetails?.state || "",
                gstin: order.billingDetails?.gstin || "",
            },
            shipping: {
                name: order.shippingDetails?.name || order.billingDetails?.name || "",
                phone: order.shippingDetails?.phone || "",
                address: order.shippingDetails?.address || "",
                city: order.shippingDetails?.city || order.billingDetails?.city || "",
                state: order.shippingDetails?.state || order.billingDetails?.state || "",
                gstin: order.shippingDetails?.gstin || "",
            },
        },

        order: {
            orderId: order.orderId,
            date: order.time,
        },

        items,

        grandTotal,
        paidAmount,
        advancePaid,
        dueAmount,
    };

    if (previousBalance !== undefined) {
        data.previousBalance = previousBalance;
    }
    if (billingExtras) {
        data.billDiscount = billingExtras.billDiscount;
        data.extraExpenseName = billingExtras.extraExpenseName;
        data.extraExpenseAmount = billingExtras.extraExpenseAmount;
        data.extraExpenses = billingExtras.extraExpenses;
    }

    return data;
};

// Owns the "send/print/download bill" communication flow — moved verbatim
// from Orders.tsx (was the selectedOrderForAction/showQrModal/showPrintSubMenu/
// pdfLoadingOrderId/sendingPdf/billType state, the blobToBase64/convertImageUrlToBase64
// helpers, and handlePdfAction/handleSendWhatsapp/handleSendReminder).
export const useOrderCommunication = ({
    currentUser,
    companyInfo,
    availableItems,
    catalogueWhatsappExtra,
    setModal,
}: UseOrderCommunicationParams) => {
    const navigate = useNavigate();

    const [selectedOrderForAction, setSelectedOrderForAction] = useState<Order | null>(null);
    const [pdfLoadingOrderId, setPdfLoadingOrderId] = useState<string | null>(null);
    const [showQrModal, setShowQrModal] = useState<Order | null>(null);
    const [sendingPdf, setSendingPdf] = useState(false);
    const [showPrintSubMenu, setShowPrintSubMenu] = useState(false);
    const [billType, setBillType] = useState<'estimate' | 'bill'>('bill');

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const convertImageUrlToBase64 = async (url: string, itemName: string): Promise<string> => {
        if (!url) {
            console.warn(`⚠️ [${itemName}] No Image URL provided in the database.`);
            return "";
        }

        try {
            const cacheBuster = url + (url.includes('?') ? '&' : '?') + 'cb=' + new Date().getTime();
            const response = await fetch(cacheBuster, { mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            return await blobToBase64(blob);
        } catch (err) {
            console.warn(`⚠️ [${itemName}] Direct fetch blocked. Trying Proxy...`);
            try {
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
                const proxyResponse = await fetch(proxyUrl);
                if (!proxyResponse.ok) throw new Error(`Proxy HTTP ${proxyResponse.status}`);
                const blob = await proxyResponse.blob();
                return await blobToBase64(blob);
            } catch (proxyErr) {
                console.error(`❌ [${itemName}] Both direct and proxy fetch failed.`);
                return "";
            }
        }
    };

    const handlePdfAction = async (Order: Order, action: ACTION, withDuplicate: boolean = false) => {
        setPdfLoadingOrderId(Order.id);

        try {
            const businessDocRef = doc(
                db,
                'companies',
                currentUser?.companyId || '',
                'business_info',
                currentUser?.companyId || ''
            );

            const businessSnap = await getDoc(businessDocRef);
            const businessData = businessSnap.exists() ? businessSnap.data() : {};

            const itemsWithBase64 = await buildBillItems(Order.items, convertImageUrlToBase64, availableItems);

            const customerPhone = (Order.billingDetails?.phone || Order.userLoginPhone || '').toString().trim();
            const previousBalance = await fetchPreviousBalance(currentUser?.companyId, customerPhone, Order.id);

            const { paidAmount, advancePaid, dueAmount } = computeStatusAwareAmounts(Order);

            const rawBillData = buildRawBillData({
                order: Order,
                companyInfo,
                businessData,
                companyId: currentUser?.companyId,
                items: itemsWithBase64,
                grandTotal: Order.totalAmount,
                paidAmount,
                advancePaid,
                dueAmount,
                previousBalance,
                billingExtras: {
                    billDiscount: Number(Order.manualDiscount || 0),
                    extraExpenseName: (Order.expenses || []).map(e => e.name).join(', '),
                    extraExpenseAmount: (Order.expenses || []).reduce((sum, e) => sum + (parseFloat(String(e.amount)) || 0), 0),
                    extraExpenses: (Order.expenses || []).map(e => ({ name: e.name, amount: parseFloat(String(e.amount)) || 0 })),
                },
            });

            const preparedData = await prepareCatalogueBillData({
                ...rawBillData,
                isEstimate: billType === 'estimate'
            });

            if (action === ACTION.PRINT) {
                await CatalogueBill(preparedData, "print", withDuplicate);
            } else if (action === ACTION.DOWNLOAD) {
                await CatalogueBill(preparedData, "download");
            }

        } catch (err) {
            console.error("❌ Catalogue bill error:", err);
        } finally {
            setPdfLoadingOrderId(null);
        }
    };

    const handleSendWhatsapp = async (Order: Order) => {
        const phone = Order.userLoginPhone || Order.billingDetails?.phone || '';
        const name = Order.userName || Order.billingDetails?.name || 'Customer';

        if (!phone) {
            setModal({ message: "Customer phone number is missing.", type: State.ERROR });
            return;
        }

        setSendingPdf(true);

        try {
            if (!currentUser?.companyId) throw new Error("User context missing.");

            const businessDocRef = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);
            const businessSnap = await getDoc(businessDocRef);
            const businessData = businessSnap.exists() ? businessSnap.data() : {};

            const { botMasterToken, whatsappNumber } = businessData || {};

            if (!botMasterToken || !whatsappNumber) {
                setSendingPdf(false);
                setSelectedOrderForAction(null);
                navigate(ROUTES.WHATSAPP_PLAN || '/whatsapp-plans');
                return;
            }

            const itemsWithBase64 = await buildBillItems(Order.items, convertImageUrlToBase64);
            const { paidAmount, advancePaid, dueAmount } = computeStatusAwareAmounts(Order);

            const rawBillData = buildRawBillData({
                order: Order,
                companyInfo,
                businessData,
                companyId: currentUser?.companyId,
                items: itemsWithBase64,
                grandTotal: Order.totalAmount,
                paidAmount,
                advancePaid,
                dueAmount,
            });

            const preparedData = await prepareCatalogueBillData({
                ...rawBillData,
                isEstimate: billType === 'estimate'
            });

            const pdfBlob = await CatalogueBill(preparedData, "blob");
            if (!pdfBlob) throw new Error("Failed to generate PDF Blob.");

            const safeNum = Order.orderId.replace(/[\/\\?%*:|"<>]/g, '-');
            const cleanName = `${safeNum}.pdf`;
            const storageRef = ref(storage, cleanName);
            await uploadBytes(storageRef, pdfBlob);

            const fileUrl = await getDownloadURL(storageRef);

            const amount = Order.totalAmount;
            const extraMsg = catalogueWhatsappExtra ? `\n\n${catalogueWhatsappExtra}` : '';
            const message = `Hello ${name},\n\nHere is your order bill #${Order.orderId}.\nAmount: ${Number(amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}\n\nThank you!${extraMsg}`;

            const response = await botMasterService.sendPdfFromUrl(
                botMasterToken,
                whatsappNumber,
                phone,
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
                setModal({ message: "Invoice sent!", type: State.SUCCESS });
                setTimeout(async () => {
                    try { await deleteObject(storageRef); } catch (error) { console.warn("Auto-delete failed:", error); }
                }, 60000); // 1 minute cleanup
            } else {
                throw new Error("API reported failure.");
            }

        } catch (err) {
            console.error("WhatsApp Send Error:", err);
            setModal({ message: "Failed to send WhatsApp invoice.", type: State.ERROR });
        } finally {
            setSendingPdf(false);
            setSelectedOrderForAction(null);
        }
    };

    const handleSendReminder = async (Order: Order) => {
        const phone = Order.userLoginPhone || Order.billingDetails?.phone || '';
        const name = Order.userName || Order.billingDetails?.name || 'Customer';

        if (!phone) {
            setModal({ message: "Customer phone number is missing.", type: State.ERROR });
            return;
        }
        if (!currentUser?.companyId) return;

        setSendingPdf(true);

        try {
            const businessDocRef = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);
            const businessSnap = await getDoc(businessDocRef);
            const { botMasterToken, whatsappNumber } = businessSnap.data() || {};

            if (!botMasterToken || !whatsappNumber) {
                setSendingPdf(false);
                navigate(ROUTES.WHATSAPP_PLAN || '/whatsapp-plans');
                return;
            }

            // FIX: now uses the same status-aware formula as handlePdfAction/
            // handleSendWhatsapp (see computeStatusAwareAmounts above) instead
            // of a raw paidAmount/dueAmount calc that ignored order.status —
            // previously a 'Paid' order with a stale paidAmount field could
            // trigger a reminder claiming a balance was still due.
            const { paidAmount, dueAmount } = computeStatusAwareAmounts(Order);
            const total = Order.totalAmount;

            const dueAmt = dueAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
            const totalAmt = total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

            const message = `Dear ${name},\n\nThis is a gentle reminder that an amount of ${dueAmt} is still due against your order #${Order.orderId} (Total: ${totalAmt}).\n\nKindly clear the due amount at your earliest convenience. Thank you!`;

            // --- Build the bill PDF, same prep as handlePdfAction/handleSendWhatsapp ---
            const businessData = businessSnap.exists() ? businessSnap.data() : {};

            const itemsWithBase64 = await buildBillItems(Order.items, convertImageUrlToBase64);

            const rawBillData = buildRawBillData({
                order: Order,
                companyInfo,
                businessData,
                companyId: currentUser?.companyId,
                items: itemsWithBase64,
                grandTotal: total,
                paidAmount,
                advancePaid: paidAmount,
                dueAmount,
            });

            const preparedData = await prepareCatalogueBillData({
                ...rawBillData,
                isEstimate: billType === 'estimate'
            });

            const pdfBlob = await CatalogueBill(preparedData, "blob");
            if (!pdfBlob) throw new Error("Failed to generate PDF Blob.");

            const safeNum = Order.orderId.replace(/[\/\\?%*:|"<>]/g, '-');
            const cleanName = `${safeNum}.pdf`;
            const storageRef = ref(storage, cleanName);
            await uploadBytes(storageRef, pdfBlob);

            const fileUrl = await getDownloadURL(storageRef);
            // -------------------------------------------------------------------------------

            const response = await botMasterService.sendPdfFromUrl(
                botMasterToken,
                whatsappNumber,
                phone,
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
                setTimeout(async () => {
                    try { await deleteObject(storageRef); } catch (error) { console.warn("Auto-delete failed:", error); }
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

    return {
        selectedOrderForAction, setSelectedOrderForAction,
        pdfLoadingOrderId, setPdfLoadingOrderId,
        showQrModal, setShowQrModal,
        sendingPdf, setSendingPdf,
        showPrintSubMenu, setShowPrintSubMenu,
        billType, setBillType,
        handlePdfAction,
        handleSendWhatsapp,
        handleSendReminder,
    };
};
