import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import BarcodeScanner from '../UseComponents/BarcodeScanner';
import { IconScanCircle } from '../constants/Icons';
import { useSalesSettings } from '../context/SettingsContext';
import {
    doc,
    setDoc,
    serverTimestamp,
    increment as fsIncrement,
    runTransaction,
} from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { useAuth } from '../context/auth-context';
import { useDatabase } from '../context/auth-context';
import SearchableItemInput from '../UseComponents/SearchIteminput';
import { Spinner } from '../constants/Spinner';
import PaymentDrawer from '../Components/PaymentDrawer';
import type { Item } from '../constants/models';
import { GenericCartList } from '../Components/CartItem';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { State } from '../enums';
import { ROUTES } from '../constants/indesx';

// ─── Re-use the same Invoice shape from Journal ───────────────────────────────
export interface JournalInvoiceItem {
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
    manualDiscount?: number;
    purchasePrice?: number;
    purchasediscount?: number;
    taxType?: string;
    taxAmount?: number;
    taxableAmount?: number;
    salesPrice?: number;
    discountPercentage?: number;
    // Extra fields set by edit modal
    customPrice?: number;
    itemId?: string;
    unitMultiplier?: number;
    imageUrl?: string;
}

export interface JournalInvoice {
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
    items?: JournalInvoiceItem[];
    paymentMethods?: Record<string, any>;
    paymentHistory?: any[];
    returnHistory?: any[];
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
    [key: string]: any;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface JournalEditModalProps {
    invoice: JournalInvoice;
    onClose: () => void;
    onSaveSuccess: (msg: string, updatedInvoice?: JournalInvoice) => void;
    onSaveError: (msg: string) => void;
    workers?: Array<{ uid: string; name: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatAmount = (n: number) =>
    Number(n || 0).toLocaleString('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
    });

const getUnitPrice = (item: JournalInvoiceItem): number => {
    if (item.customPrice && item.customPrice > 0) return item.customPrice;
    if (item.effectiveUnitPrice && item.effectiveUnitPrice > 0) return item.effectiveUnitPrice;
    if (item.salesPrice && item.salesPrice > 0) return item.salesPrice;
    if (item.mrp && item.mrp > 0) return item.mrp;
    return item.quantity > 0 ? item.finalPrice / item.quantity : 0;
};

// ─── Main Component ───────────────────────────────────────────────────────────
const JournalEditModal: React.FC<JournalEditModalProps> = ({
    invoice,
    onClose,
    onSaveSuccess,
    onSaveError,
    workers: props_workers,
}) => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const dbOperations = useDatabase();
    const { salesSettings } = useSalesSettings();

    // ── Local editable items state ────────────────────────────────────────────
    const [editItems, setEditItems] = useState<JournalInvoiceItem[]>(() => {
        const returnedQtyMap = new Map<string, number>();
        (invoice.returnHistory || []).forEach((h: any) => {
            (h.returnedItems || []).forEach((r: any) => {
                const key = r.originalItemId || r.id;
                returnedQtyMap.set(key, (returnedQtyMap.get(key) || 0) + (Number(r.quantity) || Number(r.qty) || 0));
            });
        });

        const originalItems = (invoice.items || [])
            .filter((item) => {
                const key = item.id;
                const returnedQty = returnedQtyMap.get(key) || 0;
                return item.quantity > returnedQty;
            })
            .map((item) => {
                const key = item.id;
                const returnedQty = returnedQtyMap.get(key) || 0;
                const remainingQty = item.quantity - returnedQty;
                return {
                    ...item,
                    quantity: remainingQty,
                    customPrice: getUnitPrice(item),
                    // Explicitly preserve catalogueId: itemId if it exists, else fall back to id
                    // This is the KEY fix — item.id on saved invoices IS the catalogue item ID
                    itemId: item.itemId || item.id,
                };
            });
        return [...originalItems];
    });

    const [availableItems, setAvailableItems] = useState<Item[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const isSavingRef = React.useRef(false);
    const [pendingAdjustment, setPendingAdjustment] = useState<{ amount: number } | null>(null);
    const [showAdjustmentPopup, setShowAdjustmentPopup] = useState(false);
    const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
    const [selectedItemForEdit, setSelectedItemForEdit] = useState<any>(null);
    const [_modal, setModal] = useState<{ message: string; type: any } | null>(null);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [showPaymentDrawer, setShowPaymentDrawer] = useState(false);
    const [pendingSavedInvoice, setPendingSavedInvoice] = useState<JournalInvoice | null>(null);
    const [editInvoiceNumber, setEditInvoiceNumber] = useState(invoice.invoiceNumber);
    const [editInvoiceDate, setEditInvoiceDate] = useState<string>(() => {
        try {
            const d = invoice.createdAt instanceof Date ? invoice.createdAt : new Date(invoice.createdAt);
            if (!isNaN(d.getTime())) {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
        } catch { }
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });
    const [selectedSalesmanUid, setSelectedSalesmanUid] = useState<string>(invoice.salesmanId || '');
    const [workers, setWorkers] = useState<Array<{ uid: string; name: string }>>(props_workers || []);

    // Load catalogue items once
    useEffect(() => {
        if (!dbOperations) return;
        const unsub = dbOperations.listenToItems((data: Item[]) => setAvailableItems(data));
        return () => unsub && unsub();
    }, [dbOperations]);
    // Load workers independently 
    useEffect(() => {
        if (!dbOperations) return;
        dbOperations.getWorkers().then((fetched: Array<{ uid: string; name: string }>) => {
            if (fetched && fetched.length > 0) setWorkers(fetched);
        }).catch(() => { });
    }, [dbOperations]);

    // ── Calculated total (items only, returns excluded) ───────────────────────
    const calculatedTotal = useMemo(() => {
        return editItems.reduce((sum, item) => {
            const price = item.customPrice ?? getUnitPrice(item);
            return sum + price * Number(item.quantity || 0);
        }, 0);
    }, [editItems]);

    // ── Item manipulation helpers ─────────────────────────────────────────────
    const updateItem = (id: string, patch: Partial<JournalInvoiceItem>) => {
        setEditItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
        );
    };

    const handleQtyChange = (id: string, qty: number) => {
        updateItem(id, { quantity: Math.max(1, Math.floor(qty)) });
    };

    const handleNetPriceChange = (id: string, price: number) => {
        updateItem(id, { customPrice: Math.max(0, price) });
    };

    const handleDiscountChange = (id: string, discountPct: number) => {
        setEditItems((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item;
                const base = item.mrp > 0 ? item.mrp : item.salesPrice || 0;
                const netPrice = base * (1 - Math.min(100, Math.max(0, discountPct)) / 100);
                return { ...item, discountPercentage: discountPct, customPrice: Number(netPrice.toFixed(2)) };
            })
        );
    };

    const handleDeleteItem = (id: string) => {
        setEditItems((prev) => prev.filter((item) => item.id !== id));
    };

    // ── Add new item from catalogue ───────────────────────────────────────────
    const handleAddItem = (selectedItem: Item) => {
        if (!selectedItem.id) return;
        const mrp = Number(selectedItem.mrp || 0);
        const salesPrice = Number(selectedItem.salesPrice || 0);
        const price = salesPrice > 0 ? salesPrice : mrp;
        const qty = selectedItem.moq && selectedItem.moq > 0 ? selectedItem.moq : 1;

        const newItem: JournalInvoiceItem = {
            id: crypto.randomUUID(),
            itemId: selectedItem.id,
            name: selectedItem.name,
            quantity: qty,
            mrp,
            salesPrice,
            finalPrice: price * qty,
            customPrice: price,
            effectiveUnitPrice: price,
            unit: selectedItem.unit || 'Pcs',
            hsnSac: (selectedItem as any).hsnSac || '',
            gst: Number((selectedItem as any).gst || (selectedItem as any).tax || 0),
            taxRate: Number((selectedItem as any).taxRate || (selectedItem as any).tax || 0),
            unitMultiplier: Number((selectedItem as any).unitMultiplier || 1),
        };

        setEditItems((prev) => [newItem, ...prev]);
    };
    const handleBarcodeScanned = (barcode: string) => {
        setIsScannerOpen(false);
        const found = availableItems.find(i => i.barcode === barcode.trim());
        if (!found) return;
        handleAddItem(found);
    };

    // ── Adjustment handlers (Credit Note / Refund when amount is reduced) ─────
    const handleCreditNote = async () => {
        if (!pendingAdjustment || !currentUser?.companyId) return;
        setShowAdjustmentPopup(false);
        setIsSaving(true);
        try {
            const companyId = currentUser.companyId;
            const collectionName = invoice.type === 'Credit' ? 'sales' : 'purchases';
            const invoiceRef = doc(db, 'companies', companyId, collectionName, invoice.id);
            const newTotal = calculatedTotal;
            const alreadyPaid = (() => {
                const pm = invoice.paymentMethods || {};
                const paidViaMethod = Object.entries(pm)
                    .filter(([k]) => k.toLowerCase() !== 'due')
                    .reduce((s, [, v]) => s + (Number(v) || 0), 0);
                const alreadyReturned = Math.max(0, Number(invoice.creditNoteAmount || 0))
                    + Math.max(0, Number(invoice.refundAmount || 0));
                return Math.max(0, paidViaMethod - alreadyReturned);
            })();
            const newDue = Math.max(0, calculatedTotal - alreadyPaid);

            //   const updatedPaid = Math.max(0, alreadyPaid - pendingAdjustment.amount);

            // Add credit balance to customer
            if (invoice.partyNumber) {
                const normalized = invoice.partyNumber.replace(/\D/g, '').slice(-10);
                if (normalized) {
                    const customerRef = doc(db, 'companies', companyId, 'customers', normalized);
                    await setDoc(
                        customerRef,
                        { creditBalance: fsIncrement(pendingAdjustment.amount), updatedAt: serverTimestamp() },
                        { merge: true }
                    );
                }
            }

            // Build removed items snapshot for strikethrough display
            const originalItems = invoice.items || [];
            const editItemIds = new Set(editItems.map(i => i.id));
            const removedItems = originalItems
                .filter(i => !editItemIds.has(i.id))
                .map(i => ({
                    id: i.id,
                    itemId: i.itemId || i.id,
                    name: i.name,
                    quantity: i.quantity,
                    finalPrice: i.finalPrice,
                    mrp: i.mrp,
                    unit: i.unit || 'Pcs',
                    removedAt: new Date().toISOString(),
                    modeOfReturn: 'Credit Note',
                }));

            const existingRemovedItems = (invoice as any).removedItemsHistory || [];

            // Build stock updates for deleted items
            const originalQtyMapCN = new Map<string, number>();
            (invoice.items || []).forEach((item) => {
                const pid = item.itemId || item.id;
                if (pid) {
                    const qty = Number(item.quantity || 0) * Number(item.unitMultiplier || 1);
                    originalQtyMapCN.set(pid, (originalQtyMapCN.get(pid) || 0) + qty);
                }
            });
            const newQtyMapCN = new Map<string, number>();
            editItems.forEach((item) => {
                const pid = item.itemId || item.id;
                if (pid) {
                    const qty = Number(item.quantity || 0) * Number(item.unitMultiplier || 1);
                    newQtyMapCN.set(pid, (newQtyMapCN.get(pid) || 0) + qty);
                }
            });

            await runTransaction(db, async (transaction) => {
                // Reads first
                const stockUpdatesCN: { pid: string; stockDelta: number; ref: any }[] = [];
                originalQtyMapCN.forEach((oldQty, pid) => {
                    const newQty = newQtyMapCN.get(pid) || 0;
                    const delta = newQty - oldQty;
                    if (delta !== 0) {
                        const stockDelta = invoice.type === 'Credit' ? -delta : delta;
                        stockUpdatesCN.push({
                            pid,
                            stockDelta,
                            ref: doc(db, 'companies', companyId, 'items', pid),
                        });
                    }
                });

                const stockSnaps = await Promise.all(stockUpdatesCN.map(({ ref }) => transaction.get(ref)));

                // Writes after reads
                stockUpdatesCN.forEach(({ stockDelta, ref }, i) => {
                    if (!stockSnaps[i].exists()) return;
                    transaction.update(ref, {
                        stock: fsIncrement(stockDelta),
                        updatedAt: serverTimestamp(),
                    });
                });

                const pm = invoice.paymentMethods || {};
                const pmEntries = Object.entries(pm).filter(([k]) => k.toLowerCase() !== 'due');
                let remaining = pendingAdjustment.amount;
                const pmReductions: Record<string, number> = {};
                for (const [k, v] of pmEntries) {
                    if (remaining <= 0) break;
                    const paid = Math.max(0, Number(v) || 0);
                    const deduct = Math.min(paid, remaining);
                    pmReductions[k] = deduct;
                    remaining -= deduct;
                }

                const pmUpdates: Record<string, any> = { 'paymentMethods.due': newDue };
                for (const [k, deduct] of Object.entries(pmReductions)) {
                    pmUpdates[`paymentMethods.${k}`] = fsIncrement(-deduct);
                }

                transaction.update(invoiceRef, {
                    items: editItems.map((item) => ({
                        id: item.id,
                        itemId: item.itemId || item.id,
                        name: item.name,
                        quantity: item.quantity,
                        mrp: item.mrp,
                        salesPrice: item.salesPrice || 0,
                        finalPrice: (item.customPrice ?? getUnitPrice(item)) * item.quantity,
                        effectiveUnitPrice: item.customPrice ?? getUnitPrice(item),
                        unit: item.unit || 'Pcs',
                        hsnSac: item.hsnSac || '',
                        gst: item.gst || 0,
                        taxRate: item.taxRate || 0,
                        discountPercentage: item.discountPercentage || 0,
                        unitMultiplier: item.unitMultiplier || 1,
                    })),
                    totalAmount: newTotal,
                    ...pmUpdates,
                    creditNoteAmount: fsIncrement(pendingAdjustment.amount),
                    removedItemsHistory: [...existingRemovedItems, ...removedItems],
                    updatedAt: serverTimestamp(),
                });
            });

            setPendingAdjustment(null);

            const updatedPm = { ...(invoice.paymentMethods || {}) };
            let rem = pendingAdjustment.amount;
            for (const k of Object.keys(updatedPm)) {
                if (k.toLowerCase() === 'due') continue;
                if (rem <= 0) break;
                const paid = Math.max(0, Number(updatedPm[k]) || 0);
                const deduct = Math.min(paid, rem);
                updatedPm[k] = paid - deduct;
                rem -= deduct;
            }
            updatedPm['due'] = newDue;

            const updatedInvoice: JournalInvoice = {
                ...invoice,
                items: editItems,
                amount: newTotal,
                dueAmount: newDue,
                creditNoteAmount: (Number(invoice.creditNoteAmount || 0)) + pendingAdjustment.amount,
                paymentMethods: updatedPm,
            };

            // If invoice is Unpaid (has due amount), open payment drawer first
            if (newDue > 0) {
                setPendingSavedInvoice(null);
                setPendingSavedInvoice(updatedInvoice);
                setShowPaymentDrawer(true);
                return;
            }

            onSaveSuccess('Invoice updated successfully', updatedInvoice);
            onClose();
        } catch (err: any) {
            onSaveError('Failed to apply credit note: ' + (err?.message || ''));
        } finally {
            setIsSaving(false);
        }
    };

    const handleRefund = async () => {
        if (!pendingAdjustment || !currentUser?.companyId) return;
        setShowAdjustmentPopup(false);
        setIsSaving(true);
        try {
            const companyId = currentUser.companyId;
            const collectionName = invoice.type === 'Credit' ? 'sales' : 'purchases';
            const invoiceRef = doc(db, 'companies', companyId, collectionName, invoice.id);
            const newTotal = calculatedTotal;


            const alreadyPaid = (() => {
                const pm = invoice.paymentMethods || {};
                return Object.entries(pm)
                    .filter(([k]) => k.toLowerCase() !== 'due')
                    .reduce((s, [, v]) => s + (Number(v) || 0), 0);
            })();
            const newDue = Math.max(0, newTotal - alreadyPaid);

            const originalItemsRef = invoice.items || [];
            const editItemIdsRef = new Set(editItems.map(i => i.id));
            const removedItemsRef = originalItemsRef
                .filter(i => !editItemIdsRef.has(i.id))
                .map(i => ({
                    id: i.id,
                    itemId: i.itemId || i.id,
                    name: i.name,
                    quantity: i.quantity,
                    finalPrice: i.finalPrice,
                    mrp: i.mrp,
                    unit: i.unit || 'Pcs',
                    removedAt: new Date().toISOString(),
                    modeOfReturn: 'Cash Refund',
                }));

            const existingRemovedItemsRef = (invoice as any).removedItemsHistory || [];

            // Build stock updates for deleted items
            const originalQtyMapRef2 = new Map<string, number>();
            (invoice.items || []).forEach((item) => {
                const pid = item.itemId || item.id;
                if (pid) {
                    const qty = Number(item.quantity || 0) * Number(item.unitMultiplier || 1);
                    originalQtyMapRef2.set(pid, (originalQtyMapRef2.get(pid) || 0) + qty);
                }
            });
            const newQtyMapRef2 = new Map<string, number>();
            editItems.forEach((item) => {
                const pid = item.itemId || item.id;
                if (pid) {
                    const qty = Number(item.quantity || 0) * Number(item.unitMultiplier || 1);
                    newQtyMapRef2.set(pid, (newQtyMapRef2.get(pid) || 0) + qty);
                }
            });

            await runTransaction(db, async (transaction) => {
                // Reads first
                const stockUpdatesRef2: { pid: string; stockDelta: number; ref: any }[] = [];
                originalQtyMapRef2.forEach((oldQty, pid) => {
                    const newQty = newQtyMapRef2.get(pid) || 0;
                    const delta = newQty - oldQty;
                    if (delta !== 0) {
                        const stockDelta = invoice.type === 'Credit' ? -delta : delta;
                        stockUpdatesRef2.push({
                            pid,
                            stockDelta,
                            ref: doc(db, 'companies', companyId, 'items', pid),
                        });
                    }
                });

                const stockSnaps2 = await Promise.all(stockUpdatesRef2.map(({ ref }) => transaction.get(ref)));

                // Writes after reads
                stockUpdatesRef2.forEach(({ stockDelta, ref }, i) => {
                    if (!stockSnaps2[i].exists()) return;
                    transaction.update(ref, {
                        stock: fsIncrement(stockDelta),
                        updatedAt: serverTimestamp(),
                    });
                });

                const pmRef = invoice.paymentMethods || {};
                const pmEntriesRef = Object.entries(pmRef).filter(([k]) => k.toLowerCase() !== 'due');
                let remainingRef = pendingAdjustment.amount;
                const pmReductionsRef: Record<string, number> = {};
                for (const [k, v] of pmEntriesRef) {
                    if (remainingRef <= 0) break;
                    const paid = Math.max(0, Number(v) || 0);
                    const deduct = Math.min(paid, remainingRef);
                    pmReductionsRef[k] = deduct;
                    remainingRef -= deduct;
                }

                const pmUpdatesRef: Record<string, any> = { 'paymentMethods.due': newDue };
                for (const [k, deduct] of Object.entries(pmReductionsRef)) {
                    pmUpdatesRef[`paymentMethods.${k}`] = fsIncrement(-deduct);
                }

                transaction.update(invoiceRef, {
                    items: editItems.map((item) => ({
                        id: item.id,
                        itemId: item.itemId || item.id,
                        name: item.name,
                        quantity: item.quantity,
                        mrp: item.mrp,
                        salesPrice: item.salesPrice || 0,
                        finalPrice: (item.customPrice ?? getUnitPrice(item)) * item.quantity,
                        effectiveUnitPrice: item.customPrice ?? getUnitPrice(item),
                        unit: item.unit || 'Pcs',
                        hsnSac: item.hsnSac || '',
                        gst: item.gst || 0,
                        taxRate: item.taxRate || 0,
                        discountPercentage: item.discountPercentage || 0,
                        unitMultiplier: item.unitMultiplier || 1,
                    })),
                    totalAmount: newTotal,
                    ...pmUpdatesRef,
                    refundAmount: fsIncrement(pendingAdjustment.amount),
                    removedItemsHistory: [...existingRemovedItemsRef, ...removedItemsRef],
                    updatedAt: serverTimestamp(),
                });
            });

            setPendingAdjustment(null);
            const alreadyPaidRef = (() => {
                const pm = invoice.paymentMethods || {};
                return Object.entries(pm)
                    .filter(([k]) => k.toLowerCase() !== 'due')
                    .reduce((s, [, v]) => s + (Number(v) || 0), 0);
            })();
            const newDueRef = Math.max(0, calculatedTotal - alreadyPaidRef);

            const updatedPmRef = { ...(invoice.paymentMethods || {}) };
            let remRef = pendingAdjustment.amount;
            for (const k of Object.keys(updatedPmRef)) {
                if (k.toLowerCase() === 'due') continue;
                if (remRef <= 0) break;
                const paid = Math.max(0, Number(updatedPmRef[k]) || 0);
                const deduct = Math.min(paid, remRef);
                updatedPmRef[k] = paid - deduct;
                remRef -= deduct;
            }
            updatedPmRef['due'] = newDueRef;

            const updatedInvoice: JournalInvoice = {
                ...invoice,
                items: editItems,
                amount: calculatedTotal,
                dueAmount: newDueRef,
                refundAmount: (Number(invoice.refundAmount || 0)) + pendingAdjustment.amount,
                paymentMethods: updatedPmRef,
            };
            onSaveSuccess(`Refund of ₹${pendingAdjustment.amount.toFixed(2)} processed`, updatedInvoice);
            onClose();
        } catch (err: any) {
            onSaveError('Failed to process refund: ' + (err?.message || ''));
        } finally {
            setIsSaving(false);
        }
    };

    // ── Save ──────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!currentUser?.companyId) return;
        if (isSavingRef.current) return;
    isSavingRef.current = true;

        // // Recompute original subtotal from items directly (not invoice.amount which may be stale)
        // // Use invoice.amount as the true original baseline — it already reflects
        // // discounts, taxes, and extra expenses as stored in Firestore.
        // const alreadyReturnedToCustomer = Math.max(0, Number(invoice.creditNoteAmount || 0))
        //     + Math.max(0, Number(invoice.refundAmount || 0));

        const manualDiscount = Number(invoice.manualDiscount || 0);
        const extraExpense = Number(invoice.extraExpenseAmount || 0);

        const adjustedNewTotal = calculatedTotal - manualDiscount + extraExpense;
        const effectiveOriginalSubtotal = Number(invoice.amount) || 0;

        const netDiff = adjustedNewTotal - effectiveOriginalSubtotal;
        const isMetadataOnlyChange = Math.abs(netDiff) < 0.01;

        if (!isMetadataOnlyChange && netDiff < 0) {
            const alreadyPaid = (() => {
                const pm = invoice.paymentMethods || {};
                const paidViaMethod = Object.entries(pm)
                    .filter(([k]) => k.toLowerCase() !== 'due')
                    .reduce((s, [, v]) => s + Math.max(0, Number(v) || 0), 0);
                // Subtract credit notes / refunds already returned to customer
                // because that money is no longer "received" by us
                const alreadyReturned = Math.max(0, Number(invoice.creditNoteAmount || 0))
                    + Math.max(0, Number(invoice.refundAmount || 0));
                return Math.max(0, paidViaMethod - alreadyReturned);
            })();

            const priceReduction = Math.abs(netDiff);
            const originalDue = Number(invoice.dueAmount || 0);

            const invoiceIsFullyUnpaid = originalDue >= effectiveOriginalSubtotal - 0.01;
            if (!invoiceIsFullyUnpaid && alreadyPaid > 0 && priceReduction > originalDue) {
                const refundableAmount = priceReduction - originalDue;
                setPendingAdjustment({ amount: Number(refundableAmount.toFixed(2)) });
                setShowAdjustmentPopup(true);
                return;
            }
        }
        setIsSaving(true);

        const companyId = currentUser.companyId;
        const collectionName = invoice.type === 'Credit' ? 'sales' : 'purchases';
        const invoiceRef = doc(db, 'companies', companyId, collectionName, invoice.id);
        try {
            const originalQtyMap = new Map<string, number>();
            (invoice.items || []).forEach((item) => {
                // For items saved in Firestore, item.id IS the catalogue item ID.
                // item.itemId may or may not exist depending on when the invoice was created.
                // Always prefer itemId if present, otherwise use id.
                const pid = item.itemId || item.id;
                if (pid) {
                    const qty = Number(item.quantity || 0) * Number(item.unitMultiplier || 1);
                    originalQtyMap.set(pid, (originalQtyMap.get(pid) || 0) + qty);
                }
            });

            const newQtyMap = new Map<string, number>();
            editItems.forEach((item) => {
                // editItems were initialized with itemId: item.itemId || item.id (see useState fix above)
                // so item.itemId is now always the catalogue ID for original items,
                // and selectedItem.id for newly added items.
                const pid = item.itemId || item.id;
                if (pid) {
                    const qty = Number(item.quantity || 0) * Number(item.unitMultiplier || 1);
                    newQtyMap.set(pid, (newQtyMap.get(pid) || 0) + qty);
                }
            });

            // ── 3. Compute stock deltas ──────────────────────────────────────────
            // Only consider pids that are real catalogue item IDs (exist in originalQtyMap,
            // meaning they came from the saved invoice and have a known Firestore item doc).
            const allPids = new Set([...originalQtyMap.keys()]);
            newQtyMap.forEach((_, pid) => allPids.add(pid));

            const stockUpdates: { pid: string; stockDelta: number }[] = [];
            allPids.forEach((pid) => {
                const oldQty = originalQtyMap.get(pid) || 0;
                const newQty = newQtyMap.get(pid) || 0;
                const delta = newQty - oldQty;
                if (delta !== 0) {
                    const stockDelta = invoice.type === 'Credit' ? -delta : delta;
                    stockUpdates.push({ pid, stockDelta });
                    // Debug: remove after confirming stock updates work
                    console.log(`[StockUpdate] pid=${pid} oldQty=${oldQty} newQty=${newQty} delta=${delta} stockDelta=${stockDelta}`);
                }
            });
            // Debug: remove after confirming
            console.log('[StockUpdate] stockUpdates:', stockUpdates);

            // ── Hoist total calculation BEFORE transaction ───────────────────────
            // adjustedNewTotal already = calculatedTotal - manualDiscount + extraExpense
            const newTotal = adjustedNewTotal;

            // // IDs of items that existed in the original invoice
            // const originalItemIds = new Set((invoice.items || []).map(i => i.id));

            const alreadyPaid = (() => {
                const pm = invoice.paymentMethods || {};
                const paidViaMethod = Object.entries(pm)
                    .filter(([k]) => k.toLowerCase() !== 'due')
                    .reduce((s, [, v]) => s + Math.max(0, Number(v) || 0), 0);
                // Subtract amounts already returned to customer — that money is no longer held by us
                const alreadyReturned = Math.max(0, Number(invoice.creditNoteAmount || 0))
                    + Math.max(0, Number(invoice.refundAmount || 0));
                return Math.max(0, paidViaMethod - alreadyReturned);
            })();

            const originalDue = Number(invoice.dueAmount || 0);
            let updatedDue: number;
            if (isMetadataOnlyChange) {
                updatedDue = originalDue;
            } else {
                // Sahi logic: jo already paid hai usse hatao, baaki due hai
                // Isme newly added items + price changes + discounts sab automatically reflect ho jaate hain
                updatedDue = Math.max(0, newTotal - alreadyPaid);
            }

            await runTransaction(db, async (transaction) => {
                const stockItemRefs = stockUpdates.map(({ pid, stockDelta }) => ({
                    pid,
                    stockDelta,
                    ref: doc(db, 'companies', companyId, 'items', pid),
                }));

                const stockSnaps = await Promise.all(
                    stockItemRefs.map(({ ref }) => transaction.get(ref))
                );

                // ── PHASE 2: ALL WRITES AFTER ────────────────────────────────────────
                stockItemRefs.forEach(({ stockDelta, ref }, i) => {
                    // Skip if the item doc doesn't exist in the catalogue (e.g. stale/deleted catalogue item)
                    if (!stockSnaps[i].exists()) {
                        console.warn(`Stock doc not found for item, skipping stock update.`);
                        return;
                    }
                    transaction.update(ref, {
                        stock: fsIncrement(stockDelta),
                        updatedAt: serverTimestamp(),
                    });
                });

                // Build updated items payload
                const updatedItems = editItems.map((item) => ({
                    id: item.id,
                    itemId: item.itemId || item.id,
                    name: item.name,
                    quantity: item.quantity,
                    mrp: item.mrp,
                    salesPrice: item.salesPrice || 0,
                    finalPrice: (item.customPrice ?? getUnitPrice(item)) * item.quantity,
                    effectiveUnitPrice: item.customPrice ?? getUnitPrice(item),
                    unit: item.unit || 'Pcs',
                    hsnSac: item.hsnSac || '',
                    gst: item.gst || 0,
                    taxRate: item.taxRate || 0,
                    discountPercentage: item.discountPercentage || 0,
                    unitMultiplier: item.unitMultiplier || 1,
                }));

                const selectedWorker = workers.find(w => w.uid === selectedSalesmanUid);
                const updatePayload: Record<string, any> = {
                    items: updatedItems,
                    totalAmount: newTotal,
                    'paymentMethods.due': updatedDue,
                    updatedAt: serverTimestamp(),
                    invoiceNumber: editInvoiceNumber,
                    salesmanId: selectedSalesmanUid || null,
                    salesmanName: selectedWorker?.name || '',
                    ...(editInvoiceDate && {
                        createdAt: (() => {
                            const existing = invoice.createdAt instanceof Date
                                ? invoice.createdAt
                                : new Date(invoice.createdAt);
                            const [year, month, day] = editInvoiceDate.split('-').map(Number);
                            const updated = new Date(existing);
                            updated.setFullYear(year, month - 1, day);
                            return updated;
                        })(),
                    }),
                };
                transaction.update(invoiceRef, updatePayload);
            });

            const selectedWorker = workers.find(w => w.uid === selectedSalesmanUid);
            const updatedInvoice: JournalInvoice = {
                ...invoice,
                items: editItems,
                amount: newTotal,
                dueAmount: updatedDue,
                status: updatedDue > 0 ? 'Unpaid' : 'Paid',
                invoiceNumber: editInvoiceNumber,
                salesmanId: selectedSalesmanUid || null,
                salesmanName: selectedWorker?.name || '',
                createdAt: editInvoiceDate ? (() => {
                    const existing = invoice.createdAt instanceof Date
                        ? invoice.createdAt
                        : new Date(invoice.createdAt);
                    const [year, month, day] = editInvoiceDate.split('-').map(Number);
                    const updated = new Date(existing);
                    updated.setFullYear(year, month - 1, day);
                    return updated;
                })() : invoice.createdAt,
                paymentMethods: {
                    ...(invoice.paymentMethods || {}),
                    due: updatedDue,
                },
            };
            if (updatedDue > 0) {
                setPendingSavedInvoice(null);
                setPendingSavedInvoice(updatedInvoice);
                setShowPaymentDrawer(true);
                return;
            }
            onSaveSuccess('Invoice updated successfully', updatedInvoice);
            onClose();
        } catch (err: any) {
            console.error('JournalEditModal save error:', err);
            onSaveError('Failed to save changes: ' + (err?.message || 'Unknown error'));
        } finally {
            setIsSaving(false);
            isSavingRef.current = false;
        }
    };
    // ── Mapped items for GenericCartList ─────────────────────────────────────
    const mappedEditItems = editItems.map((item) => {
        const mrp = Number(item.mrp || 0);
        const netPrice = Number(item.customPrice ?? getUnitPrice(item));
        const discount = mrp > 0 ? ((mrp - netPrice) / mrp) * 100 : (item.discountPercentage ?? 0);
        return {
            ...item,
            productId: item.itemId || item.id,
            isEditable: true,
            discount: Number(discount.toFixed(2)),
            customPrice: Number(netPrice.toFixed(2)),
            unitMultiplier: Number(item.unitMultiplier || 1),
            moq: 0,
        };
    });

    const handleSaveItemEdit = (updatedItemData: Partial<Item>) => {
        if (!selectedItemForEdit) return;
        const payload: any = { ...updatedItemData };
        if (payload.Stock !== undefined) { payload.stock = payload.Stock; delete payload.Stock; }
        Object.keys(payload).forEach(k => { if (payload[k] === undefined) delete payload[k]; });

        setEditItems(prev =>
            prev.map(item =>
                String(item.id) === String(selectedItemForEdit.id)
                    ? { ...item, ...payload }
                    : item
            )
        );
        setIsEditDrawerOpen(false);
        setSelectedItemForEdit(null);
    };
    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <>
            <div
                className={`fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 md:p-4 z-[2000] transition-opacity duration-150 ${showPaymentDrawer ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                onClick={onClose}
            >
                <div
                    className="bg-white rounded-sm w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* ── Header ────────────────────────────────────────────────────────── */}
                    <div className="border-b bg-slate-50 flex-shrink-0">
                        {/* Row 1: Title bar */}
                        <div className="px-4 pt-3 pb-2 flex justify-between items-center gap-2">
                            <div className="flex flex-col items-center">
                                <span className="text-[9px] text-gray-400 uppercase tracking-wide">DATE</span>
                                <input
                                    type="date"
                                    value={editInvoiceDate}
                                    onChange={e => setEditInvoiceDate(e.target.value)}
                                    className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center text-sm outline-none w-28 cursor-pointer transition-colors"
                                />
                            </div>
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide text-center">Edit Invoice</h3>
                            <div className="flex flex-col items-center">
                                <span className="text-[9px] text-gray-400 uppercase tracking-wide">INV NO</span>
                                <input
                                    type="text"
                                    value={editInvoiceNumber}
                                    onChange={e => setEditInvoiceNumber(e.target.value)}
                                    className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center text-sm outline-none w-24 transition-colors"
                                />
                            </div>
                        </div>
                        {salesSettings?.enableSalesmanSelection && (
                            <div className="px-4 pb-3 mt-1 flex justify-center">
                                <select
                                    value={selectedSalesmanUid}
                                    onChange={e => {
                                        if (e.target.value === 'ADD_NEW_SALESMAN') {
                                            navigate(ROUTES.USER_ADD);
                                        } else {
                                            setSelectedSalesmanUid(e.target.value);
                                        }
                                    }}
                                    className="w-2/5 text-xs border border-gray-300 rounded-sm px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                    <option value="">Select Salesman</option>
                                    {workers.map(w => (
                                        <option key={w.uid} value={w.uid}>{w.name}</option>
                                    ))}
                                    <option value="ADD_NEW_SALESMAN" className="font-semibold bg-gray-100">+ Add New Salesman</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {/* ── Body ──────────────────────────────────────────────────────────── */}
                    <div className="flex-1 overflow-y-auto py-2 space-y-2">

                        {/* ── Search + Camera bar ─────────────────────────────────────────── */}
                        <div className="p-2 border border-slate-200 rounded-sm bg-slate-50">
                            <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-1">
                                Add New Item
                            </p>
                            <div className="flex gap-2 items-center">
                                <div className="flex-1">
                                    <SearchableItemInput
                                        items={availableItems}
                                        onItemSelected={handleAddItem}
                                        placeholder="Search item to add..."
                                    />
                                </div>
                                <button
                                    onClick={() => setIsScannerOpen(true)}
                                    className="bg-gray-700 text-white p-2.5 rounded-sm hover:bg-gray-800 transition-colors flex-shrink-0"
                                    title="Scan Barcode"
                                >
                                    <IconScanCircle width={20} height={20} />
                                </button>
                            </div>
                        </div>

                        {/* ── EDIT TAB: original invoice items ────────────────────────────── */}

                        <div className="h-fit self-start w-full p-1 rounded-sm border border-slate-200 bg-slate-50 flex flex-col">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1">
                                Items ({editItems.length})
                            </p>

                            {editItems.length === 0 && (
                                <p className="text-center text-sm text-slate-400 py-6">
                                    No items — add one above or save to delete this invoice.
                                </p>
                            )}

                            <div className="h-auto">
                                <GenericCartList
                                    items={mappedEditItems}
                                    availableItems={availableItems}
                                    basePriceKey="mrp"
                                    priceLabel="MRP"
                                    settings={{
                                        enableRounding: false,
                                        roundingInterval: 1,
                                        enableItemWiseDiscount: true,
                                        lockDiscount: false,
                                        lockPrice: false,
                                        hideMrp: false,
                                    }}
                                    applyRounding={(amount) => amount}
                                    State={State}
                                    setModal={setModal}
                                    onOpenEditDrawer={(item) => {
                                        setSelectedItemForEdit(item);
                                        setIsEditDrawerOpen(true);
                                    }}
                                    onDeleteItem={handleDeleteItem}
                                    onDiscountChange={(id, value) =>
                                        handleDiscountChange(id, typeof value === 'string' ? parseFloat(value) || 0 : value)
                                    }
                                    onCustomPriceChange={(id, value) =>
                                        handleNetPriceChange(id, parseFloat(value) || 0)
                                    }
                                    onCustomPriceBlur={() => { }}
                                    onQuantityChange={handleQtyChange}
                                />
                            </div>

                            {isEditDrawerOpen && selectedItemForEdit && (
                                <ItemEditDrawer
                                    item={selectedItemForEdit}
                                    isOpen={isEditDrawerOpen}
                                    onClose={() => setIsEditDrawerOpen(false)}
                                    onSaveSuccess={handleSaveItemEdit}
                                />
                            )}
                        </div>
                    </div>

                    {/* ── Footer ────────────────────────────────────────────────────────── */}
                    <div className="px-5 py-3 bg-slate-50 border-t flex-shrink-0">
                        <div className="flex justify-between items-center mb-3 text-sm">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Updated Total
                            </span>
                            <span className="text-base font-black text-slate-800">
                                {formatAmount(calculatedTotal)}
                            </span>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowPaymentDrawer(false); setPendingSavedInvoice(null); onClose(); }}
                                className="flex-1 py-2.5 bg-gray-200 text-slate-700 text-sm font-bold rounded-sm hover:bg-gray-300 transition-colors"
                            >
                                Discard
                            </button>
                            <button
                                onClick={() => handleSave()}
                                disabled={isSaving}
                                className="flex-[2] bg-blue-600 text-white py-2.5 rounded-sm text-sm font-black shadow-sm hover:bg-blue-700 transition-colors uppercase disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isSaving ? <><Spinner /> Saving...</> : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {showPaymentDrawer && pendingSavedInvoice && createPortal(
                <PaymentDrawer
                    mode="sale"
                    isOpen={showPaymentDrawer}
                    onClose={() => {
                        setShowPaymentDrawer(false);
                        setPendingSavedInvoice(null);

                    }}
                    subtotal={pendingSavedInvoice?.dueAmount ?? 0}
                    billTotal={pendingSavedInvoice?.dueAmount ?? 0}
                    onPaymentComplete={async () => {
                        setShowPaymentDrawer(false);
                        if (pendingSavedInvoice) {
                            const saved = pendingSavedInvoice;
                            setPendingSavedInvoice(null);
                            onSaveSuccess('Invoice updated successfully', saved);
                            onClose();
                        }
                    }}
                    initialPartyName={invoice.partyName}
                    initialPartyNumber={invoice.partyNumber || ''}
                    initialPartyAddress={invoice.partyAddress || ''}
                    initialPartyGST={invoice.partyGstin || ''}
                    initialNarration={invoice.narration || ''}
                    initialExpenseName={invoice.extraExpenseName || ''}
                    initialExpenseAmount={invoice.extraExpenseAmount || 0}
                    allowDueBilling={true}
                    enableCustomerDetails={true}
                    enableNarration={true}
                    enableExtraExpense={true}
                />,
                document.body
            )}
            <BarcodeScanner
                isOpen={isScannerOpen}
                onClose={() => setIsScannerOpen(false)}
                onScanSuccess={handleBarcodeScanned}
            />
            {/* ── Amount Reduced Popup ─────────────────────────────────────────────── */}
            {showAdjustmentPopup && pendingAdjustment && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white w-[340px] rounded-sm shadow-xl border border-slate-200 p-6 text-center">
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">
                            Amount Reduced
                        </p>
                        <p className="text-3xl font-black text-blue-500 mb-6">
                            ₹{pendingAdjustment.amount.toFixed(2)}
                        </p>
                        <div className="flex gap-3 mb-4">
                            <button
                                onClick={handleCreditNote}
                                disabled={isSaving}
                                className="flex-1 py-3 bg-blue-500 text-white text-sm font-black rounded-sm hover:bg-blue-600 transition-colors disabled:opacity-50"
                            >
                                Credit Note
                            </button>
                            <button
                                onClick={handleRefund}
                                disabled={isSaving}
                                className="flex-1 py-3 bg-blue-600 text-white text-sm font-black rounded-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                Refund
                            </button>
                        </div>
                        <button
                            onClick={() => { setShowAdjustmentPopup(false); setPendingAdjustment(null); }}
                            className="text-[11px] font-bold text-slate-400 hover:text-slate-700"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

export default JournalEditModal;