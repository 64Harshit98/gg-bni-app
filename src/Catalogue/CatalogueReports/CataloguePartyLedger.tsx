import React, { useState, useMemo, useRef, useEffect } from 'react';
import ExcelJS from 'exceljs';
import XLSX from 'xlsx-js-style';

type PaymentRecord = {
    date: string | number | Date;
    method: string;
    amount: number;
    chequeNumber?: string;
    chequeDate?: string;
    timestamp?: number;
};

type LedgerTransaction = {
    id: string;
    invoiceNumber: string;
    createdAt: Date;
    totalAmount: number;
    dueAmount: number;
    type: string;
    paymentHistory: PaymentRecord[];
    isOpeningBalance?: boolean;
    balanceType?: 'due' | 'advance';
    note?: string;
};
type OpeningBalance = {
    id: string;
    partyName: string;
    partyNumber: string;
    partyType: 'Customer' | 'Supplier';
    amount: number;
    dueAmount: number;
    balanceType?: 'due' | 'advance';
    note?: string;
    address?: string;    // NEW
    gstNumber?: string;  // NEW
    createdAt: number;
    paymentHistory: PaymentRecord[];
};
type BulkOpeningBalanceRow = {
    partyName: string;
    partyNumber: string;
    partyType: 'Customer' | 'Supplier';
    amount: number;
    balanceType: 'due' | 'advance';
    note: string;
    address?: string;    // NEW
    gstNumber?: string;  // NEW
    date?: number;
};
import { formatDate, formatDateForInput } from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import FilterSelect from '../../Pages/Reports/SalesReportComponents/FilterSelect';
import { useAuth } from '../../context/auth-context';
import { CustomCard } from '../../Components/CustomCard';
import { IconChevronDown } from '../../constants/Icons';
import { db } from '../../lib/Firebase';
import { collection, query, onSnapshot, orderBy, where, doc, getDoc, getDocs, Timestamp } from 'firebase/firestore';
import BackButton from '../../Components/BackButton';
import { PaymentModal } from '../../constants/Modal';
import { useNavigate } from 'react-router-dom';
import { botMasterService } from '../../Pages/Additional/Whatsapp/WhatsappApi';
import { ROUTES } from '../../constants/routes.constants';
import { Spinner } from '../../constants/Spinner';

const normalizePartyNumber = (num?: string): string => {
    if (!num) return '';
    const digits = num.toString().replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
};

const useOrdersData = (companyId?: string) => {
    const [Orders, setOrders] = React.useState<any[]>([]);

    React.useEffect(() => {
        if (!companyId) return;
        const ref = collection(db, 'companies', companyId, 'Orders');
        const q = query(ref, where('status', '!=', 'Upcoming'), orderBy('status'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setOrders(data);
        });
        return () => unsub();
    }, [companyId]);

    return { Orders };
};

const CataloguePartyLedger: React.FC = () => {
    const pageTopRef = useRef<HTMLDivElement | null>(null);
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [sendingReminderFor, setSendingReminderFor] = useState<string | null>(null);
    const { Orders } = useOrdersData(currentUser?.companyId);
    useEffect(() => {
        setLocalPaidOverrides(prev => {
            const updated = { ...prev };
            Orders.forEach((order: any) => {
                if (updated[order.id] !== undefined) {
                    // Firestore has caught up — remove the local override
                    delete updated[order.id];
                }
            });
            return updated;
        });

        setLocalPaymentHistories(prev => {
            const updated = { ...prev };
            Orders.forEach((order: any) => {
                if (updated[order.id] !== undefined) {
                    delete updated[order.id];
                }
            });
            return updated;
        });
    }, [Orders]);
    const [selectedPartyName, setSelectedPartyName] = useState<string | null>(null);
    const [selectedPartyNumber, setSelectedPartyNumber] = useState<string>('');
    const [isLoading] = useState(false);
    const [authLoading] = useState(false);
    const [error] = useState<string | null>(null);

    const [datePreset, setDatePreset] = useState('last30');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [appliedStartDate, setAppliedStartDate] = useState('');
    const [appliedEndDate, setAppliedEndDate] = useState('');

    const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
    const [showTransactionList, setShowTransactionList] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'due' | 'settled'>('all');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [localPaidOverrides, setLocalPaidOverrides] = useState<Record<string, number>>({});
    const [localPaymentHistories, setLocalPaymentHistories] = useState<Record<string, PaymentRecord[]>>({});
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any | null>(null);
    const [openingBalances, setOpeningBalances] = useState<OpeningBalance[]>([]);
    const [isOBModalOpen, setIsOBModalOpen] = useState(false);
    const [obForm, setObForm] = useState({
        partyName: '',
        partyNumber: '',
        partyType: 'Customer' as 'Customer' | 'Supplier',
        balanceType: 'due' as 'due' | 'advance',
        amount: '',
        note: ''
    });
    const [obLoading, setObLoading] = useState(false);
    const [availableCredit, setAvailableCredit] = useState(0);

    // Bulk import state
    const bulkFileInputRef = useRef<HTMLInputElement>(null);
    const [isBulkUploading, setIsBulkUploading] = useState(false);
    const [bulkUploadProgress, setBulkUploadProgress] = useState<{ current: number; total: number } | null>(null);
    const [showBulkImport, setShowBulkImport] = useState(false);

    // NEW: delete-all-parties state
    const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
    const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
    const [isDeletingAll, setIsDeletingAll] = useState(false);

    // NEW: delete-single-party state
    const [partyToDelete, setPartyToDelete] = useState<{ partyName: string; partyNumber: string } | null>(null);
    const [isDeletingParty, setIsDeletingParty] = useState(false);
    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    // NEW: full customers master list (name/number/createdAt/address/gstNumber),
    // fetched once per company — mirrors the Sales-side Party Ledger's pattern
    // (src/Pages/Reports/PartyLedger/usePartyLedger.ts). Lets a customer whose
    // only order was deleted still show up in the ledger, as long as their
    // customers-collection record was created inside the selected date range —
    // previously the party list here was built purely from live Orders, so a
    // customer with zero remaining orders had no way to appear at all.
    const [customersMaster, setCustomersMaster] = useState<{ name: string; number: string; createdAt?: number; address?: string; gstNumber?: string }[]>([]);

    useEffect(() => {
        if (!currentUser?.companyId) return;
        const fetchCustomersMaster = async () => {
            try {
                const custRef = collection(db, 'companies', currentUser.companyId, 'customers');
                const custSnap = await getDocs(custRef);
                setCustomersMaster(custSnap.docs.map(d => {
                    const data = d.data();
                    const createdAtMillis = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : undefined;
                    return {
                        name: data.name || 'Unknown',
                        number: data.number || d.id,
                        createdAt: createdAtMillis,
                        address: data.address || '',
                        gstNumber: data.gstNumber || '',
                    };
                }));
            } catch (err) {
                console.error('Error fetching customers master:', err);
            }
        };
        fetchCustomersMaster();
    }, [currentUser?.companyId]);

    useEffect(() => {
        const fetchAvailableCredit = async () => {
            if (!isPaymentModalOpen || !currentUser?.companyId || !selectedPartyNumber) {
                setAvailableCredit(0);
                return;
            }
            const normalizedPhone = selectedPartyNumber.replace(/\D/g, '').slice(-10);
            if (!normalizedPhone) {
                setAvailableCredit(0);
                return;
            }

            try {
                const { doc: fsDoc, getDoc: fsGetDoc } = await import('firebase/firestore');

                // ✅ Ab sirf customers collection se lo — advance wahan store ho gaya
                const customerRef = fsDoc(
                    db,
                    'companies',
                    currentUser.companyId,
                    'customers',
                    normalizedPhone
                );
                const snap = await fsGetDoc(customerRef);
                if (snap.exists()) {
                    setAvailableCredit(Number(snap.data().creditBalance || 0));
                } else {
                    setAvailableCredit(0);
                }
            } catch (err) {
                console.error('Credit fetch error:', err);
                setAvailableCredit(0);
            }
        };

        fetchAvailableCredit();
    }, [isPaymentModalOpen, selectedPartyNumber, currentUser?.companyId]);

    // NEW: Send a combined WhatsApp due-reminder for a party, listing all unpaid invoice/order numbers
    const handleSendPartyReminder = async (party: { partyName: string; partyNumber: string; totalDue: number; unpaidItems: { label: string; dueAmount: number }[] }) => {
        if (!party.partyNumber || party.partyNumber.trim() === '') {
            showToast('Party phone number is missing.', 'error');
            return;
        }
        if (!currentUser?.companyId) return;

        setSendingReminderFor(party.partyNumber);

        try {
            const businessDocRef = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);
            const businessSnap = await getDoc(businessDocRef);
            const { botMasterToken, whatsappNumber } = businessSnap.data() || {};

            if (!botMasterToken || !whatsappNumber) {
                setSendingReminderFor(null);
                navigate(ROUTES.WHATSAPP_PLAN);
                return;
            }

            if (!party.unpaidItems || party.unpaidItems.length === 0) {
                showToast('No due invoices found for this party.', 'error');
                setSendingReminderFor(null);
                return;
            }

            const invoiceLines = party.unpaidItems
                .map((item) => `• ${item.label}: ${item.dueAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}`)
                .join('\n');

            const totalDueStr = party.totalDue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

            const message = `Dear ${party.partyName},\n\nThis is a gentle reminder that a total amount of ${totalDueStr} is due against the following invoice(s):\n\n${invoiceLines}\n\nKindly clear the due amount at your earliest convenience. Thank you!`;

            const response = await botMasterService.sendMessage(
                botMasterToken,
                whatsappNumber,
                party.partyNumber,
                message
            );

            let isSuccess = false;
            if (Array.isArray(response) && response.length > 0) {
                const res = response[0];
                if (res.status === 'sent' || res.status === 'delivered') isSuccess = true;
            } else if (response?.status === 'sent' || response?.status === 'success' || response?.status === 200) {
                isSuccess = true;
            }

            if (isSuccess) {
                showToast('Reminder sent via WhatsApp!', 'success');
            } else {
                throw new Error('API reported failure.');
            }
        } catch (err) {
            console.error('Catalogue Party Reminder Send Error:', err);
            showToast('Failed to send reminder.', 'error');
        } finally {
            setSendingReminderFor(null);
        }
    };
    const handleSettlePayment = async (
        invoice: any,
        amount: number,
        method: string,
        chequeNumber?: string,
        chequeDate?: string
    ) => {
        try {
            if (!currentUser?.companyId) throw new Error('Company ID not found. Please log in again.');
            if (amount <= 0) throw new Error('Payment amount must be greater than 0.');
            if (!invoice.id) throw new Error('Invalid invoice data.');
            // Handle opening balance settlement separately
            if (invoice.isOpeningBalance) {
                const { doc, runTransaction, setDoc: fsSetDoc, serverTimestamp: fsST, increment: fsIncrement } = await import('firebase/firestore');
                if (method.toUpperCase() === 'CREDIT NOTE' || method.toUpperCase() === 'CREDIT') {
                    const normalizedPhone = selectedPartyNumber.replace(/\D/g, '').slice(-10);
                    if (normalizedPhone) {
                        const customerRef = doc(db, 'companies', currentUser.companyId, 'customers', normalizedPhone);
                        await fsSetDoc(customerRef, {
                            creditBalance: fsIncrement(-amount),
                            updatedAt: fsST(),
                        }, { merge: true });
                        setAvailableCredit(prev => Math.max(0, prev - amount));
                    }
                }

                const obRef = doc(db, 'companies', currentUser.companyId, 'openingBalances', invoice.id);
                await runTransaction(db, async (transaction) => {
                    const sfDoc = await transaction.get(obRef);
                    if (!sfDoc.exists()) throw new Error('Opening balance record not found.');
                    const data = sfDoc.data();
                    const currentDue = data.dueAmount ?? data.amount ?? 0;
                    if (amount > currentDue) throw new Error(`Amount (₹${amount}) exceeds due (₹${currentDue}).`);
                    const paymentRecord = {
                        amount, method: method.toLowerCase(), date: new Date().toISOString(), timestamp: Date.now(),
                        ...(method.toUpperCase() === 'PDC' && { chequeNumber: chequeNumber || '', chequeDate: chequeDate || '' }),
                    };
                    transaction.update(obRef, {
                        dueAmount: Math.max(0, currentDue - amount),
                        paymentHistory: [...(data.paymentHistory || []), paymentRecord],
                    });
                });
                const paymentRecord: PaymentRecord = {
                    amount, method: method.toLowerCase(), date: new Date().toISOString(), timestamp: Date.now(),
                    ...(method.toUpperCase() === 'PDC' && { chequeNumber: chequeNumber || '', chequeDate: chequeDate || '' }),
                };
                updateOpeningBalanceLocally(invoice.id, amount, paymentRecord);
                setIsPaymentModalOpen(false);
                setSelectedInvoiceForPayment(null);
                showToast(`Opening balance payment of ₹${amount} settled via ${method}!`, 'success');
                return;
            }
            const { doc, runTransaction, setDoc: fsSetDoc, serverTimestamp: fsST, increment: fsIncrement } = await import('firebase/firestore');
            const docRef = doc(db, 'companies', currentUser.companyId, 'Orders', invoice.id);

            if (method.toUpperCase() === 'CREDIT NOTE' || method.toUpperCase() === 'CREDIT') {
                const normalizedPhone = selectedPartyNumber.replace(/\D/g, '').slice(-10);
                if (normalizedPhone) {
                    const customerRef = doc(db, 'companies', currentUser.companyId, 'customers', normalizedPhone);
                    await fsSetDoc(customerRef, {
                        creditBalance: fsIncrement(-amount),
                        updatedAt: fsST(),
                    }, { merge: true });
                    setAvailableCredit(prev => Math.max(0, prev - amount));
                }
            }

            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(docRef);
                if (!sfDoc.exists()) throw new Error('Order not found in database.');

                const data = sfDoc.data();
                const currentPaid = Number(data.paidAmount || 0);
                const currentTotal = Number(data.totalAmount || 0);
                const currentDue = currentTotal - currentPaid;

                if (amount > currentDue) {
                    throw new Error(`Payment amount (₹${amount}) exceeds due amount (₹${currentDue.toFixed(0)}).`);
                }

                const newPaid = currentPaid + amount;
                const paymentRecord = {
                    amount,
                    method: method.toLowerCase(),
                    date: new Date().toISOString(),
                    timestamp: Date.now(),
                    ...(method.toUpperCase() === 'PDC' && {
                        chequeNumber: chequeNumber || '',
                        chequeDate: chequeDate || '',
                    }),
                };

                const newStatus = newPaid >= currentTotal ? 'Paid' : data.status;

                transaction.update(docRef, {
                    paidAmount: newPaid,
                    paymentHistory: [...(data.paymentHistory || []), paymentRecord],
                    status: newStatus,
                    updatedAt: new Date(),
                });
            });

            // ✅ Update local state instantly — no refresh needed
            setLocalPaidOverrides(prev => ({
                ...prev,
                [invoice.id]: (prev[invoice.id] ?? Number(
                    Orders.find((o: any) => o.id === invoice.id)?.paidAmount || 0
                )) + amount,
            }));
            const newPaymentRecord: PaymentRecord = {
                amount,
                method: method.toLowerCase(),
                date: new Date().toISOString(),
                ...(method.toUpperCase() === 'PDC' && {
                    chequeNumber: chequeNumber || '',
                    chequeDate: chequeDate || '',
                }),
            };
            setLocalPaymentHistories(prev => ({
                ...prev,
                [invoice.id]: [...(prev[invoice.id] ?? []), newPaymentRecord],
            }));

            setIsPaymentModalOpen(false);
            setSelectedInvoiceForPayment(null);
            showToast(`Payment of ₹${amount} settled successfully!`, 'success');

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            showToast(`Failed to settle payment: ${errorMessage}`, 'error');
            throw error;
        }
    };
    // Set default date range on mount
    useEffect(() => {
        const start = new Date();
        start.setDate(start.getDate() - 29);
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const s = formatDateForInput(start);
        const e = formatDateForInput(end);
        setCustomStartDate(s);
        setCustomEndDate(e);
        setAppliedStartDate(s);
        setAppliedEndDate(e);
    }, []);

    useEffect(() => {
        if (!selectedPartyName) return;
        requestAnimationFrame(() => {
            pageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }, [selectedPartyName]);
    useEffect(() => {
        const duplicateOrders = new Map();
        Orders.forEach(order => {
            if (duplicateOrders.has(order.orderId)) {
                console.warn('Duplicate Order Found:', order.orderId, {
                    first: duplicateOrders.get(order.orderId),
                    second: { name: order.userName, phone: order.userLoginPhone }
                });
            }
            duplicateOrders.set(order.orderId, { name: order.userName, phone: order.userLoginPhone });
        });
    }, [Orders]);
    useEffect(() => {
        if (!currentUser?.companyId) return;
        const fetchOpeningBalances = async () => {
            try {
                const {
                    collection: col,
                    getDocs,
                    Timestamp,
                    doc,
                    setDoc,
                    serverTimestamp,
                    increment: fsIncrement
                } = await import('firebase/firestore');

                const obRef = col(db, 'companies', currentUser.companyId, 'openingBalances');
                const obSnapshot = await getDocs(obRef);

                const mappedOB: OpeningBalance[] = obSnapshot.docs
                    .filter(doc => doc.data().source === 'catalogue')
                    .map(doc => {
                        const data = doc.data();
                        const creationMillis = data.createdAt instanceof Timestamp
                            ? data.createdAt.toMillis()
                            : Date.now();
                        return {
                            id: doc.id,
                            partyName: data.partyName || 'Unknown',
                            partyNumber: data.partyNumber || '',
                            partyType: data.partyType || 'Customer',
                            amount: data.amount || 0,
                            dueAmount: data.dueAmount ?? data.amount ?? 0,
                            balanceType: data.balanceType || 'due',
                            note: data.note || '',
                            address: data.address || '',      // NEW
                            gstNumber: data.gstNumber || '',  // NEW
                            createdAt: creationMillis,
                            paymentHistory: data.paymentHistory || [],
                        };
                    });

                setOpeningBalances(mappedOB);

                // ✅ Purane advance OBs ka credit sync karo
                // Sirf woh OBs jo creditSynced: true nahi hain
                const advanceOBs = obSnapshot.docs.filter(d => {
                    const data = d.data();
                    return data.source === 'catalogue'
                        && data.balanceType === 'advance'
                        && !data.creditSynced; // ← sirf unsynced wale
                });

                for (const obDoc of advanceOBs) {
                    const data = obDoc.data();
                    const normalizedPhone = (data.partyNumber || '')
                        .replace(/\D/g, '').slice(-10);

                    if (!normalizedPhone) continue;

                    try {
                        // Customer credit mein add karo
                        const customerRef = doc(
                            db,
                            'companies',
                            currentUser.companyId,
                            'customers',
                            normalizedPhone
                        );
                        await setDoc(customerRef, {
                            number: normalizedPhone,
                            name: data.partyName || '',
                            creditBalance: fsIncrement(data.dueAmount ?? data.amount ?? 0),
                            updatedAt: serverTimestamp(),
                        }, { merge: true });

                        // OB ko mark karo ki sync ho gaya
                        const { updateDoc } = await import('firebase/firestore');
                        await updateDoc(obDoc.ref, { creditSynced: true });

                        console.log('✅ Synced OB credit:', normalizedPhone, data.dueAmount ?? data.amount);
                    } catch (e) {
                        console.error('❌ Sync failed for:', normalizedPhone, e);
                    }
                }

            } catch (err) {
                console.error('Error fetching opening balances:', err);
            }
        };
        fetchOpeningBalances();
    }, [currentUser?.companyId]);

    const toggleBillExpansion = (billId: string) => {
        setExpandedBillId(prev => prev === billId ? null : billId);
    };

    const handleDatePresetChange = (preset: string) => {
        setDatePreset(preset);
        if (preset === 'custom') return;

        const start = new Date();
        const end = new Date();

        switch (preset) {
            case 'today':
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'yesterday':
                start.setDate(start.getDate() - 1);
                end.setDate(end.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'last7':
                start.setDate(start.getDate() - 6);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'last30':
                start.setDate(start.getDate() - 29);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'thisMonth':
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                end.setFullYear(end.getFullYear(), end.getMonth() + 1, 0);
                end.setHours(23, 59, 59, 999);
                break;
        }

        setCustomStartDate(formatDateForInput(start));
        setCustomEndDate(formatDateForInput(end));
    };

    // ─── FILTERED ORDERS (respects applied date range) ───────────────────────
    const dateFilteredOrders = useMemo(() => {
        if (!appliedStartDate && !appliedEndDate) return Orders;
        const start = appliedStartDate ? new Date(appliedStartDate).setHours(0, 0, 0, 0) : 0;
        const end = appliedEndDate ? new Date(appliedEndDate).setHours(23, 59, 59, 999) : Date.now();
        return Orders.filter((order: any) => {
            const orderDate = order.createdAt?.toDate
                ? order.createdAt.toDate().getTime()
                : new Date(order.createdAt).getTime();
            return orderDate >= start && orderDate <= end;
        });
    }, [Orders, appliedStartDate, appliedEndDate]);

    // ─── PARTY LIST (from date-filtered orders) ───────────────────────────────
    const filteredParties = useMemo(() => {
        const map = new Map();

        // NEW: seed the map with every known customer whose master-record
        // createdAt falls inside the applied date range, at zero — so a
        // customer with no remaining orders in range (e.g. their only order
        // was deleted) still shows up, matching the Sales-side Party Ledger.
        // Orders processed below fill in on top of this seed using the same
        // key, so nothing gets double-counted.
        const seedStart = appliedStartDate ? new Date(appliedStartDate).setHours(0, 0, 0, 0) : 0;
        const seedEnd = appliedEndDate ? new Date(appliedEndDate).setHours(23, 59, 59, 999) : Date.now();
        customersMaster
            .filter(c => c.createdAt !== undefined && c.createdAt >= seedStart && c.createdAt <= seedEnd)
            .forEach(c => {
                const normalizedNumber = normalizePartyNumber(c.number);
                const key = normalizedNumber || c.name.trim().toLowerCase();
                map.set(key, {
                    partyName: c.name || 'N/A',
                    partyNumber: normalizedNumber || c.number || 'N/A',
                    totalBilled: 0,
                    totalDue: 0,
                    totalTransactions: 0,
                    partyType: 'Customer',
                    unpaidItems: [] as { label: string; dueAmount: number }[],
                    address: c.address || undefined,
                    gstNumber: c.gstNumber || undefined,
                });
            });

        dateFilteredOrders.forEach((order: any) => {
            const name = order.userName
                || order.billingDetails?.name
                || order.shippingDetails?.name
                || 'Unknown';
            const rawNumber = order.userLoginPhone
                || order.billingDetails?.phone
                || order.shippingDetails?.phone;

            const number = normalizePartyNumber(rawNumber);
            const key = number
                ? number
                : `NO_PHONE_${name.toLowerCase().replace(/\s+/g, '_')}`;

            if (!map.has(key)) {
                map.set(key, {
                    partyName: name,
                    partyNumber: number,
                    totalBilled: 0,
                    totalDue: 0,
                    totalTransactions: 0,
                    partyType: 'Customer',
                    unpaidItems: [] as { label: string; dueAmount: number }[], // NEW
                });
            } else {
                const existing = map.get(key);
                if (name.length > existing.partyName.length) {
                    existing.partyName = name;
                }
            }
            const existing = map.get(key);
            const total = Number(order.totalAmount || 0);
            const paid = localPaidOverrides[order.id] !== undefined
                ? localPaidOverrides[order.id]
                : Number(order.paidAmount || 0);
            const due = Math.max(0, total - paid);
            existing.totalBilled += total;
            existing.totalDue += due;
            existing.totalTransactions += 1;

            // NEW: track unpaid order for reminder message
            if (due > 0) {
                existing.unpaidItems.push({
                    label: order.orderId || `#${order.id.slice(0, 6).toUpperCase()}`,
                    dueAmount: due,
                });
            }
        });
        openingBalances.forEach((ob) => {
            // ✅ Filter opening balances by date range
            const start = appliedStartDate ? new Date(appliedStartDate).setHours(0, 0, 0, 0) : 0;
            const end = appliedEndDate ? new Date(appliedEndDate).setHours(23, 59, 59, 999) : Date.now();
            if (ob.createdAt < start || ob.createdAt > end) return; // ← skip if outside range

            const normalizedObNumber = normalizePartyNumber(ob.partyNumber);
            const key = normalizedObNumber
                ? normalizedObNumber
                : `NO_PHONE_${ob.partyName.toLowerCase().replace(/\s+/g, '_')}`;

            if (!map.has(key)) {
                map.set(key, {
                    partyName: ob.partyName,
                    partyNumber: normalizedObNumber || ob.partyNumber,
                    totalBilled: 0,
                    totalDue: 0,
                    totalTransactions: 0,
                    partyType: 'Customer',
                    unpaidItems: [] as { label: string; dueAmount: number }[],
                    address: ob.address || undefined,      // NEW
                    gstNumber: ob.gstNumber || undefined,  // NEW
                });
            }
            const existing = map.get(key);
            if (!existing.address && ob.address) existing.address = ob.address;       // NEW
            if (!existing.gstNumber && ob.gstNumber) existing.gstNumber = ob.gstNumber; // NEW
            existing.totalBilled += ob.amount;
            if (ob.balanceType !== 'advance') {
                existing.totalDue += ob.dueAmount;
                // NEW: track unpaid OB for reminder message
                if (ob.dueAmount > 0) {
                    existing.unpaidItems.push({
                        label: 'Opening Due',
                        dueAmount: ob.dueAmount,
                    });
                }
            }
            // existing.totalTransactions += 1;
        });
        const partyData = Array.from(map.values());

        const lowerQuery = searchQuery.toLowerCase();
        return partyData.filter(party => {
            const matchesSearch =
                !searchQuery.trim() ||
                party.partyName.toLowerCase().includes(lowerQuery) ||
                party.partyNumber.toLowerCase().includes(lowerQuery);

            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'due' && party.totalDue > 0) ||
                (statusFilter === 'settled' && party.totalDue === 0);

            return matchesSearch && matchesStatus;
        });
    }, [dateFilteredOrders, searchQuery, localPaidOverrides, statusFilter, openingBalances, appliedStartDate, appliedEndDate, customersMaster]);

    // ─── DETAIL LEDGER (uses same date-filtered orders) ───────────────────────
    const selectedPartyLedger = useMemo(() => {
        if (!selectedPartyName) return null;

        const transactions = dateFilteredOrders
            .filter((order: any) => {
                const orderPhone = normalizePartyNumber(
                    order.userLoginPhone
                    || order.billingDetails?.phone
                    || order.shippingDetails?.phone
                    || ''
                );

                const selectedPhone = normalizePartyNumber(selectedPartyNumber || '');

                // ✅ Phone number hai toh sirf number se match karo (name ignore)
                if (selectedPhone) {
                    return orderPhone === selectedPhone;
                }

                // ✅ Phone nahi hai toh name se match karo (no-phone parties)
                const orderName = order.userName
                    || order.billingDetails?.name
                    || order.shippingDetails?.name
                    || 'Unknown';

                return orderName === selectedPartyName && (
                    !order.userLoginPhone &&
                    !order.billingDetails?.phone &&
                    !order.shippingDetails?.phone
                );
            })
            .map((order: any) => {
                const total = Number(order.totalAmount || 0);
                const paid = localPaidOverrides[order.id] !== undefined
                    ? localPaidOverrides[order.id]
                    : Number(order.paidAmount || 0);
                return {
                    id: order.id,
                    invoiceNumber: order.orderId,
                    createdAt: order.createdAt?.toDate ? order.createdAt.toDate() : new Date(),
                    totalAmount: total,
                    dueAmount: Math.max(0, total - paid),
                    type: 'sale',
                    paymentHistory: localPaymentHistories[order.id]
                        ?? (order.paymentHistory as PaymentRecord[] || []),
                    isOpeningBalance: false,
                    balanceType: undefined,
                };
            });
        // Merge matching opening balances as pseudo-transactions
        const obTransactions: LedgerTransaction[] = openingBalances
            .filter(ob => {
                // Zero-amount OBs exist only so a new party shows up in the party list
                // (bulk import with no due/advance) — they're not a real transaction to display.
                if (ob.amount <= 0) return false;

                // ✅ Date filter
                const start = appliedStartDate ? new Date(appliedStartDate).setHours(0, 0, 0, 0) : 0;
                const end = appliedEndDate ? new Date(appliedEndDate).setHours(23, 59, 59, 999) : Date.now();
                if (ob.createdAt < start || ob.createdAt > end) return false;

                const selectedPhone = normalizePartyNumber(selectedPartyNumber || '');
                if (selectedPhone) return normalizePartyNumber(ob.partyNumber) === selectedPhone;
                return ob.partyName === selectedPartyName;
            })
            .map(ob => ({
                id: ob.id,
                invoiceNumber: '',
                createdAt: new Date(ob.createdAt),
                totalAmount: ob.amount,
                dueAmount: ob.dueAmount,
                type: 'sale',
                paymentHistory: ob.paymentHistory,
                isOpeningBalance: true,
                balanceType: ob.balanceType ?? 'due',
                note: ob.note,
            }));

        const allTransactions = [...obTransactions, ...transactions]
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        return {
            transactions: allTransactions,
            totalBilled: allTransactions
                .filter(t => !(t.isOpeningBalance && t.balanceType === 'advance'))
                .reduce((sum, t) => sum + t.totalAmount, 0),
            totalDue: allTransactions
                .filter(t => !(t.isOpeningBalance && t.balanceType === 'advance'))
                .reduce((sum, t) => sum + t.dueAmount, 0),
        };
    }, [selectedPartyName, selectedPartyNumber, dateFilteredOrders, localPaidOverrides, localPaymentHistories, filteredParties, openingBalances]);
    const updateOpeningBalanceLocally = (obId: string, amountPaid: number, paymentRecord: PaymentRecord) => {
        setOpeningBalances(prev =>
            prev.map(ob => {
                if (ob.id !== obId) return ob;
                return {
                    ...ob,
                    dueAmount: Math.max(0, ob.dueAmount - amountPaid),
                    paymentHistory: [...ob.paymentHistory, paymentRecord],
                };
            })
        );
    };

    const addOpeningBalance = async (
        partyName: string,
        partyNumber: string,
        partyType: 'Customer' | 'Supplier',
        amount: number,
        note?: string,
        balanceType: 'due' | 'advance' = 'due'
    ) => {
        if (!currentUser?.companyId) throw new Error('Company ID not found.');

        // ✅ Sab ek saath import karo
        const {
            doc,
            collection: col,
            setDoc,
            serverTimestamp,
            increment: fsIncrement
        } = await import('firebase/firestore');

        // Step 1: Opening Balance save karo
        const obRef = doc(col(db, 'companies', currentUser.companyId, 'openingBalances'));
        const newOB = {
            partyName,
            partyNumber,
            partyType,
            amount,
            dueAmount: balanceType === 'due' ? amount : 0,
            balanceType,
            note: note || '',
            paymentHistory: [],
            createdAt: serverTimestamp(),
            source: 'catalogue',
        };

        await setDoc(obRef, newOB);
        console.log('✅ OB saved:', obRef.id);

        // Step 2: Agar advance hai toh customer credit update karo
        if (balanceType === 'advance') {
            const normalizedPhone = partyNumber.replace(/\D/g, '').slice(-10);
            console.log('📱 Normalized phone:', normalizedPhone);

            if (normalizedPhone) {
                try {
                    const customerRef = doc(
                        db,
                        'companies',
                        currentUser.companyId,
                        'customers',
                        normalizedPhone
                    );

                    await setDoc(customerRef, {
                        number: normalizedPhone,
                        name: partyName,
                        creditBalance: fsIncrement(amount),
                        updatedAt: serverTimestamp(),
                    }, { merge: true });

                    console.log('✅ Credit updated for:', normalizedPhone, 'Amount:', amount);
                } catch (creditErr) {
                    console.error('❌ Credit update failed:', creditErr);
                    // OB toh save ho gaya, credit update fail hua
                    // Toast show karo user ko
                    showToast('Opening balance saved but credit update failed.', 'error');
                }
            } else {
                console.warn('⚠️ No phone number — credit not updated');
                showToast('Opening balance saved. Note: No phone number provided, credit not linked.', 'error');
            }
        }

        // Step 3: Local state update
        const localOB: OpeningBalance = {
            id: obRef.id,
            partyName,
            partyNumber,
            partyType,
            amount,
            dueAmount: balanceType === 'due' ? amount : 0,
            balanceType,
            note: note || '',
            createdAt: Date.now(),
            paymentHistory: [],
        };
        setOpeningBalances(prev => [...prev, localOB]);
        return localOB;
    };

    const parseExcelDate = (val: any): number | undefined => {
        if (!val) return undefined;
        if (val instanceof Date) return val.getTime();
        const str = val.toString().trim();
        if (!str) return undefined;
        const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (dmyMatch) {
            const day = parseInt(dmyMatch[1], 10);
            const month = parseInt(dmyMatch[2], 10);
            const year = parseInt(dmyMatch[3], 10);
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                const d = new Date(year, month - 1, day);
                if (!isNaN(d.getTime())) return d.getTime();
            }
        }
        const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (isoMatch) {
            const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
            if (!isNaN(d.getTime())) return d.getTime();
        }
        const parsed = new Date(str);
        return isNaN(parsed.getTime()) ? undefined : parsed.getTime();
    };

    const handleBulkFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        executeBulkImport(file);
    };

    const executeBulkImport = async (file: File) => {
        if (!currentUser?.companyId) return;
        setIsBulkUploading(true);
        setBulkUploadProgress(null);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(arrayBuffer);
            const worksheet = workbook.worksheets[0];
            if (!worksheet) throw new Error('Excel file is empty.');

            const safeGetVal = (rowObj: any, colIdx: number) => {
                const val = rowObj.getCell(colIdx).value;
                if (val === null || val === undefined) return '';
                if (val instanceof Date) return val;
                if (typeof val === 'object' && 'richText' in val) return val.richText.map((rt: any) => rt.text).join('').trim();
                if (typeof val === 'object' && 'text' in val) return (val.text || '').toString().trim();
                return val.toString().trim();
            };

            let headerRowNum = 1;
            for (let r = 1; r <= Math.min(worksheet.rowCount, 15); r++) {
                const cell = (safeGetVal(worksheet.getRow(r), 3) as string).toLowerCase();
                if (cell && cell.includes('party name')) { headerRowNum = r; break; }
            }
            const dataStartRow = headerRowNum + 2;

            const rowsToImport: BulkOpeningBalanceRow[] = [];
            let skippedCount = 0;

            for (let r = dataStartRow; r <= worksheet.rowCount; r++) {
                const row = worksheet.getRow(r);
                const partyName = (safeGetVal(row, 3) as string).trim();
                if (!partyName) continue;
                const dateVal = safeGetVal(row, 1);
                const typeVal = (safeGetVal(row, 2) as string).toLowerCase();
                const partyNumber = (safeGetVal(row, 4) as string).trim();
                const dueVal = parseFloat(safeGetVal(row, 5) as string) || 0;
                const advanceVal = parseFloat(safeGetVal(row, 6) as string) || 0;
                const narration = (safeGetVal(row, 7) as string).trim();
                const address = (safeGetVal(row, 8) as string).trim();                 // NEW
                const gstNumber = (safeGetVal(row, 9) as string).trim().toUpperCase(); // NEW

                // ✅ Type must be explicitly "Customer"/"Supplier" — no silent default
                if (!typeVal || !(typeVal.startsWith('c') || typeVal.startsWith('s'))) { skippedCount++; continue; }

                // ✅ Party Number is mandatory AND must be a valid 10-digit phone number
                const partyNumberDigits = partyNumber.replace(/\D/g, '');
                if (!partyNumber || partyNumberDigits.length !== 10) { skippedCount++; continue; }

                const partyType: 'Customer' | 'Supplier' = typeVal.startsWith('s') ? 'Supplier' : 'Customer';
                // Only ambiguous when BOTH are filled. Neither filled is now a valid
                // "just add this party" row — it shouldn't be rejected.
                if (dueVal > 0 && advanceVal > 0) { skippedCount++; continue; }
                rowsToImport.push({
                    partyName,
                    partyNumber,
                    partyType,
                    amount: dueVal > 0 ? dueVal : (advanceVal > 0 ? advanceVal : 0),
                    balanceType: dueVal > 0 ? 'due' : (advanceVal > 0 ? 'advance' : 'due'),
                    note: narration,
                    address: address || undefined,       // NEW
                    gstNumber: gstNumber || undefined,    // NEW
                    date: parseExcelDate(dateVal),
                });
            }

            if (rowsToImport.length === 0) {
                throw new Error('No valid rows found. Check Party Name and Credit/Debit Balance columns.');
            }

            setBulkUploadProgress({ current: 0, total: rowsToImport.length });
            const result = await addBulkOpeningBalances(rowsToImport, (current, total) => {
                setBulkUploadProgress({ current, total });
            });

            const noteParts = [
                skippedCount ? `${skippedCount} skipped (missing type/number, or both balances filled)` : '',
                result.duplicates ? `${result.duplicates} skipped as duplicate number` : '',
            ].filter(Boolean).join(', ');

            if (result.failed > 0 || result.duplicates > 0) {
                showToast(`Imported ${result.success}, ${result.failed} failed${noteParts ? `, ${noteParts}` : ''}.`, 'error');
            } else {
                showToast(`Imported ${result.success} opening balances successfully!${noteParts ? ` (${noteParts})` : ''}`, 'success');
            }
        } catch (err: any) {
            showToast(err.message || 'Failed to import file.', 'error');
        } finally {
            setIsBulkUploading(false);
            setBulkUploadProgress(null);
            if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
        }
    };

    const addBulkOpeningBalances = async (
        rows: BulkOpeningBalanceRow[],
        onProgress?: (current: number, total: number) => void
    ): Promise<{ success: number; failed: number; duplicates: number }> => {
        if (!currentUser?.companyId) throw new Error('Company ID not found.');
        const { doc, collection: col, setDoc, increment: fsIncrement, Timestamp: FsTimestamp } = await import('firebase/firestore');
        const companyId = currentUser.companyId;

        let success = 0;
        let failed = 0;
        let duplicates = 0;
        const newLocalOBs: OpeningBalance[] = [];

        const numberToName = new Map<string, string>();
        openingBalances.forEach(ob => {
            const norm = (ob.partyNumber || '').replace(/\D/g, '').slice(-10);
            if (norm) numberToName.set(norm, ob.partyName.trim().toLowerCase());
        });

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                const normalizedNumber = row.partyNumber.replace(/\D/g, '').slice(-10);
                const rowNameLower = row.partyName.trim().toLowerCase();

                if (normalizedNumber) {
                    const existingName = numberToName.get(normalizedNumber);
                    if (existingName && existingName !== rowNameLower) {
                        duplicates++;
                        onProgress?.(i + 1, rows.length);
                        continue;
                    }
                    numberToName.set(normalizedNumber, rowNameLower);
                }

                const obRef = doc(col(db, 'companies', companyId, 'openingBalances'));
                const createdAtValue = row.date ? FsTimestamp.fromMillis(row.date) : FsTimestamp.now();

                const newOB = {
                    partyName: row.partyName,
                    partyNumber: row.partyNumber,
                    partyType: row.partyType,
                    amount: row.amount,
                    dueAmount: row.balanceType === 'due' ? row.amount : 0,
                    balanceType: row.balanceType,
                    note: row.note || '',
                    address: row.address || '',      // NEW
                    gstNumber: row.gstNumber || '',  // NEW
                    paymentHistory: [],
                    createdAt: createdAtValue,
                    source: 'catalogue',
                };
                await setDoc(obRef, newOB);

                if (row.partyNumber.trim().length >= 3 && row.balanceType === 'advance') {
                    const collectionName = row.partyType === 'Customer' ? 'customers' : 'suppliers';
                    const balanceField = row.partyType === 'Customer' ? 'creditBalance' : 'debitBalance';
                    const partyRef = doc(db, 'companies', companyId, collectionName, row.partyNumber.trim());
                    await setDoc(partyRef, {
                        name: row.partyName,
                        number: row.partyNumber,
                        [balanceField]: fsIncrement(row.amount),
                        ...(row.address ? { address: row.address } : {}),       // NEW
                        ...(row.gstNumber ? { gstNumber: row.gstNumber } : {}), // NEW
                    }, { merge: true });
                }

                newLocalOBs.push({
                    id: obRef.id,
                    partyName: row.partyName,
                    partyNumber: row.partyNumber,
                    partyType: row.partyType,
                    amount: row.amount,
                    dueAmount: row.balanceType === 'due' ? row.amount : 0,
                    balanceType: row.balanceType,
                    note: row.note || '',
                    address: row.address || '',      // NEW
                    gstNumber: row.gstNumber || '',  // NEW
                    createdAt: row.date || Date.now(),
                    paymentHistory: [],
                });
                success++;
            } catch (e) {
                console.error('Failed to import row:', row, e);
                failed++;
            }
            onProgress?.(i + 1, rows.length);
        }

        if (newLocalOBs.length > 0) {
            setOpeningBalances(prev => [...prev, ...newLocalOBs]);
        }
        return { success, failed, duplicates };
    };

    // NEW: wipe every Order and catalogue-sourced opening balance for this company
    const confirmDeleteAll = async () => {
        if (!currentUser?.companyId) return;
        setIsDeletingAll(true);
        try {
            const { collection: col, getDocs, writeBatch } = await import('firebase/firestore');
            const companyId = currentUser.companyId;

            const ordersSnap = await getDocs(col(db, 'companies', companyId, 'Orders'));
            const obSnap = await getDocs(col(db, 'companies', companyId, 'openingBalances'));
            const catalogueObDocs = obSnap.docs.filter(d => d.data().source === 'catalogue');

            const allDocs = [...ordersSnap.docs, ...catalogueObDocs];
            const BATCH_LIMIT = 450;
            for (let i = 0; i < allDocs.length; i += BATCH_LIMIT) {
                const batch = writeBatch(db);
                allDocs.slice(i, i + BATCH_LIMIT).forEach(d => batch.delete(d.ref));
                await batch.commit();
            }

            setOpeningBalances([]);
            setSelectedPartyName(null);
            setSelectedPartyNumber('');
            setIsDeleteAllModalOpen(false);
            setDeleteAllConfirmText('');
            showToast('All parties deleted.', 'success');
        } catch (e: any) {
            showToast(e.message || 'Failed to delete all parties.', 'error');
        } finally {
            setIsDeletingAll(false);
        }
    };

    // NEW: delete one party's Orders + catalogue opening balances
    const confirmDeleteParty = async () => {
        if (!partyToDelete || !currentUser?.companyId) return;
        setIsDeletingParty(true);
        try {
            const { collection: col, getDocs, writeBatch } = await import('firebase/firestore');
            const companyId = currentUser.companyId;
            const targetPhone = normalizePartyNumber(partyToDelete.partyNumber);

            const ordersSnap = await getDocs(col(db, 'companies', companyId, 'Orders'));
            const matchingOrderDocs = ordersSnap.docs.filter(d => {
                const data = d.data();
                const phone = normalizePartyNumber(data.userLoginPhone || data.billingDetails?.phone || data.shippingDetails?.phone || '');
                if (targetPhone) return phone === targetPhone;
                const name = data.userName || data.billingDetails?.name || data.shippingDetails?.name || 'Unknown';
                return name === partyToDelete.partyName;
            });

            const obSnap = await getDocs(col(db, 'companies', companyId, 'openingBalances'));
            const matchingObDocs = obSnap.docs.filter(d => {
                const data = d.data();
                if (data.source !== 'catalogue') return false;
                const phone = normalizePartyNumber(data.partyNumber || '');
                if (targetPhone) return phone === targetPhone;
                return data.partyName === partyToDelete.partyName;
            });

            const allDocs = [...matchingOrderDocs, ...matchingObDocs];
            const batch = writeBatch(db);
            allDocs.forEach(d => batch.delete(d.ref));
            await batch.commit();

            setOpeningBalances(prev => prev.filter(ob => !matchingObDocs.some(d => d.id === ob.id)));
            showToast(`${partyToDelete.partyName} deleted.`, 'success');
            setPartyToDelete(null);
        } catch (e: any) {
            showToast(e.message || 'Failed to delete party.', 'error');
        } finally {
            setIsDeletingParty(false);
        }
    };

    const handleDownloadBulkSample = () => {
        const s = (font: any, fill?: any, alignment?: any, border?: any) => ({
            font: { name: 'Arial', ...font },
            fill: fill ?? {},
            alignment: alignment ?? { horizontal: 'center', vertical: 'center', wrapText: true },
            border: border ?? {},
        });
        const solidFill = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
        const thinBorder = (sides: ('top' | 'bottom' | 'left' | 'right')[]) => {
            const b: any = {};
            sides.forEach(side => { b[side] = { style: 'thin', color: { rgb: 'CBD5E1' } }; });
            return b;
        };
        const allBorders = thinBorder(['top', 'bottom', 'left', 'right']);
        const bblr = thinBorder(['bottom', 'left', 'right']);

        const COLS = [
            { header: '● Date', note: 'DD/MM/YYYY (Optional, defaults to today)', width: 14 },
            { header: '★ Type', note: 'Customer or Supplier', width: 14 },
            { header: '★ Party Name', note: 'Full party name', width: 22 },
            { header: '★ Party Number', note: 'Phone number (Required)', width: 16 },
            { header: '● Due Amount', note: 'They owe you (₹) — leave blank if none', width: 16 },
            { header: '● Advance Amount', note: 'You owe them (₹) — leave both blank to just add the party', width: 16 },
            { header: '● Narration', note: 'Optional note / description', width: 26 },
            { header: '● Party Address', note: 'Optional — full address', width: 26 },   // NEW
            { header: '● GST Number', note: 'Optional — GSTIN', width: 18 },             // NEW
        ];

        const REQ = { bg: 'FEE2E2', txt: 'DC2626' };
        const OPT = { bg: 'DCFCE7', txt: '15803D' };
        const colCount = COLS.length;

        const legendRows = [
            { bg: REQ.bg, txt: REQ.txt, marker: '★  Required', desc: 'Must be filled in – row will be skipped if missing' },
            { bg: OPT.bg, txt: OPT.txt, marker: '●  Optional', desc: 'Leave blank if not applicable' },
        ];

        const sampleRows = [
            ['01/04/2024', 'Customer', 'Ramesh Traders', '9876543210', 5000, '', 'Pending from last year', 'Shop 12, MG Road, Lucknow', '09ABCDE1234F1Z5'],
            ['15/03/2024', 'Supplier', 'Sharma Distributors', '9123456780', '', 3000, 'Advance paid for stock', 'Plot 4, Industrial Area, Kanpur', '09XYZAB5678G1Z2'],
        ];

        const totalRows = 11;
        const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

        aoa[0][0] = 'SELLAR  ·  Old Invoices / Opening Balance Import Template';
        aoa[1][0] = 'Fill in the rows below and upload this file in Party Ledger → Bulk Import. Do NOT rename column headers. Fill only ONE of Due Amount or Advance Amount per row.';
        aoa[3][0] = 'LEGEND';
        legendRows.forEach((l, i) => { aoa[4 + i][0] = l.marker; aoa[4 + i][1] = l.desc; });
        COLS.forEach((c, i) => { aoa[7][i] = c.header; });
        COLS.forEach((c, i) => { aoa[8][i] = c.note; });
        sampleRows.forEach((row, ri) => { row.forEach((val, ci) => { aoa[9 + ri][ci] = val; }); });

        const ws: any = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = COLS.map(c => ({ wch: c.width }));
        ws['!rows'] = [{ hpt: 34 }, { hpt: 24 }, { hpt: 8 }, { hpt: 20 }, { hpt: 18 }, { hpt: 8 }, { hpt: 30 }, { hpt: 22 }];
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
            { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
            ...legendRows.map((_, i) => ({ s: { r: 4 + i, c: 1 }, e: { r: 4 + i, c: 3 } })),
        ];

        const style = (addr: string, st: any) => {
            if (!ws[addr]) ws[addr] = { t: 's', v: '' };
            ws[addr].s = st;
        };

        style('A1', s({ sz: 15, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('0369A1'), { horizontal: 'center', vertical: 'center' }));
        style('A2', s({ sz: 9, italic: true, color: { rgb: '475569' } }, solidFill('DBEAFE'), { horizontal: 'center', vertical: 'center', wrapText: true }));
        style('A4', s({ sz: 10, bold: true, color: { rgb: '0369A1' } }, solidFill('E0F2FE'), { horizontal: 'left', vertical: 'center' }, allBorders));

        legendRows.forEach((l, i) => {
            const row = 5 + i;
            style(`A${row}`, s({ sz: 9, bold: true, color: { rgb: l.txt } }, solidFill(l.bg), { horizontal: 'left', vertical: 'center' }, bblr));
            style(`B${row}`, s({ sz: 9, color: { rgb: '334155' } }, solidFill(l.bg), { horizontal: 'left', vertical: 'center' }, bblr));
            ['C', 'D'].forEach(col => {
                const addr = `${col}${row}`;
                if (!ws[addr]) ws[addr] = { t: 's', v: '' };
                ws[addr].s = s({ sz: 9 }, solidFill(l.bg), {}, bblr);
            });
        });

        COLS.forEach((c, i) => {
            const isReq = c.header.startsWith('★');
            const { bg, txt } = isReq ? REQ : OPT;
            const addr = XLSX.utils.encode_cell({ r: 7, c: i });
            style(addr, s({ sz: 9, bold: true, color: { rgb: txt } }, solidFill(bg), { horizontal: 'center', vertical: 'center', wrapText: true }, allBorders));
        });

        COLS.forEach((_c, i) => {
            const addr = XLSX.utils.encode_cell({ r: 8, c: i });
            style(addr, s({ sz: 7, italic: true, color: { rgb: '64748B' } }, solidFill('F8FAFC'), { horizontal: 'center', vertical: 'center', wrapText: true }, bblr));
        });

        sampleRows.forEach((row, ri) => {
            const altBg = ri % 2 === 1 ? 'F1F5F9' : 'FFFFFF';
            row.forEach((_val, ci) => {
                const addr = XLSX.utils.encode_cell({ r: 9 + ri, c: ci });
                style(addr, s({ sz: 9, color: { rgb: '1E293B' } }, solidFill(altBg), { horizontal: 'center', vertical: 'center' }, bblr));
            });
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'OpeningBalances');
        XLSX.writeFile(wb, 'Sellar_OpeningBalances_Import_Template.xlsx');
    };

    const handleAddOpeningBalance = async () => {
        if (!obForm.partyName.trim() || !obForm.amount || Number(obForm.amount) <= 0) {
            showToast('Please fill in party name and a valid amount.', 'error');
            return;
        }
        setObLoading(true);
        try {
            await addOpeningBalance(
                obForm.partyName.trim(),
                obForm.partyNumber.trim(),
                obForm.partyType,
                Number(obForm.amount),
                obForm.note.trim(),
                obForm.balanceType
            );
            setIsOBModalOpen(false);
            setObForm({ partyName: '', partyNumber: '', partyType: 'Customer', balanceType: 'due', amount: '', note: '' });
            showToast('Opening balance added successfully!', 'success');
        } catch (e) {
            showToast('Failed to add opening balance.', 'error');
        } finally {
            setObLoading(false);
        }
    };
    const goBack = () => {
        setSelectedPartyName(null);
        setSelectedPartyNumber('');
        setExpandedBillId(null);
    };

    if (isLoading || authLoading) return <div className="p-4 text-center">Loading Ledger...</div>;
    if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

    return (
        <div ref={pageTopRef} className="min-h-screen bg-gray-50 pb-16 flex flex-col">
            {/* Opening Balance Modal */}
            {isOBModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="bg-white rounded-sm shadow-xl w-full max-w-sm p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-base font-bold text-gray-800">Add Opening Balance</h2>
                            <span className={`text-xs font-bold px-2.5 py-1 rounded border tracking-wide
        ${obForm.partyType === 'Customer'
                                    ? 'bg-blue-50 text-blue-600 border-blue-200'
                                    : 'bg-purple-50 text-purple-600 border-purple-200'
                                }`}>
                                {obForm.partyType}
                            </span>
                        </div>
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <input
                                    placeholder="Party Name *"
                                    value={obForm.partyName}
                                    readOnly
                                    className="flex-1 p-2 border border-gray-200 rounded-sm text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                                />
                                <input
                                    placeholder="Phone"
                                    value={obForm.partyNumber}
                                    readOnly
                                    maxLength={10}
                                    className="w-28 p-2 border border-gray-200 rounded-sm text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                                />
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-500 mb-1.5">Balance Type</p>
                                <div className="flex border border-gray-200 rounded-sm overflow-hidden text-sm">
                                    <button
                                        onClick={() => setObForm(f => ({ ...f, balanceType: 'due' }))}
                                        className={`flex-1 px-3 py-2 font-medium transition ${obForm.balanceType === 'due' ? 'bg-red-500 text-white' : 'bg-white text-gray-500'}`}
                                    >
                                        Due (They Owe You)
                                    </button>
                                    <button
                                        onClick={() => setObForm(f => ({ ...f, balanceType: 'advance' }))}
                                        className={`flex-1 px-3 py-2 font-medium border-l border-gray-200 transition ${obForm.balanceType === 'advance' ? 'bg-emerald-500 text-white' : 'bg-white text-gray-500'}`}
                                    >
                                        Debt (You Owe Them)
                                    </button>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">
                                    {obForm.balanceType === 'due'
                                        ? 'Party owes you money — receivable/debit balance.'
                                        : 'You owe the party — payable/credit balance.'}
                                </p>
                            </div>
                            <input
                                type="number"
                                placeholder="Amount (₹) *"
                                value={obForm.amount}
                                onChange={e => setObForm(f => ({ ...f, amount: e.target.value }))}
                                className="w-full p-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                            />
                            <input
                                placeholder="Note (optional)"
                                value={obForm.note}
                                onChange={e => setObForm(f => ({ ...f, note: e.target.value }))}
                                className="w-full p-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                            />
                        </div> {/* closes space-y-3 */}
                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => { setIsOBModalOpen(false); setObForm({ partyName: '', partyNumber: '', partyType: 'Customer', balanceType: 'due', amount: '', note: '' }); }}
                                className="flex-1 px-3 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-sm hover:bg-gray-200"
                            >Cancel</button>
                            <button
                                onClick={handleAddOpeningBalance}
                                disabled={obLoading}
                                className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-orange-500 rounded-sm hover:bg-orange-600 disabled:opacity-50"
                            >{obLoading ? 'Saving...' : 'Save'}</button>
                        </div>
                    </div>
                </div>
            )
            }
            {/* NEW: Delete single party confirmation modal */}
            {partyToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="bg-white rounded-sm shadow-xl w-full max-w-sm p-5">
                        <h2 className="text-base font-bold text-gray-800 mb-2">Delete Party?</h2>
                        <p className="text-sm text-gray-600 mb-4">
                            This permanently deletes <span className="font-semibold">{partyToDelete.partyName}</span> and all of their orders and opening balance records. This cannot be undone.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPartyToDelete(null)}
                                disabled={isDeletingParty}
                                className="flex-1 px-3 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-sm hover:bg-gray-200 disabled:opacity-50"
                            >Cancel</button>
                            <button
                                onClick={confirmDeleteParty}
                                disabled={isDeletingParty}
                                className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-red-600 rounded-sm hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                            >{isDeletingParty ? <Spinner /> : 'Delete'}</button>
                        </div>
                    </div>
                </div>
            )}
            {/* NEW: Delete-all-parties confirmation modal (requires typing DELETE) */}
            {isDeleteAllModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="bg-white rounded-sm shadow-xl w-full max-w-sm p-5">
                        <h2 className="text-base font-bold text-red-700 mb-2">Delete ALL Parties?</h2>
                        <p className="text-sm text-gray-600 mb-3">
                            This permanently deletes every order and opening balance record for your catalogue. This cannot be undone.
                        </p>
                        <p className="text-xs text-gray-500 mb-1">Type <span className="font-mono font-bold">DELETE</span> to confirm:</p>
                        <input
                            value={deleteAllConfirmText}
                            onChange={e => setDeleteAllConfirmText(e.target.value)}
                            placeholder="DELETE"
                            className="w-full p-2 border border-gray-300 rounded-sm text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-400"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setIsDeleteAllModalOpen(false); setDeleteAllConfirmText(''); }}
                                disabled={isDeletingAll}
                                className="flex-1 px-3 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-sm hover:bg-gray-200 disabled:opacity-50"
                            >Cancel</button>
                            <button
                                onClick={confirmDeleteAll}
                                disabled={deleteAllConfirmText !== 'DELETE' || isDeletingAll}
                                className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-red-600 rounded-sm hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                            >{isDeletingAll ? <Spinner /> : 'Delete All'}</button>
                        </div>
                    </div>
                </div>
            )}
            {
                toast && (
                    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-md shadow-lg text-sm font-semibold text-white transition-all
                ${toast.type === 'success' ? 'bg-[#F97316]' : 'bg-red-600'}`}>
                        {toast.message}
                    </div>
                )
            }
            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => { setIsPaymentModalOpen(false); setSelectedInvoiceForPayment(null); }}
                invoice={selectedInvoiceForPayment}
                availableCredit={availableCredit}
                onSubmit={handleSettlePayment}
            />
            {/* Hidden file input for bulk import */}
            <input
                type="file"
                ref={bulkFileInputRef}
                onChange={handleBulkFileSelected}
                className="hidden"
                accept=".xlsx, .xls"
            />

            {/* Bulk import progress overlay */}
            {bulkUploadProgress && (
                <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="bg-white p-8 rounded-sm shadow-xl w-80 text-center">
                        <h3 className="text-lg font-bold mb-4 text-gray-800">Importing Opening Balances...</h3>
                        <div className="w-full bg-gray-200 rounded-sm h-4 mb-2 overflow-hidden">
                            <div
                                className="bg-orange-500 h-4 rounded-sm transition-all duration-100"
                                style={{ width: `${(bulkUploadProgress.current / bulkUploadProgress.total) * 100}%` }}
                            />
                        </div>
                        <p className="text-sm text-gray-600 font-mono">
                            {bulkUploadProgress.current} / {bulkUploadProgress.total} processed
                        </p>
                    </div>
                </div>
            )}
            {/* HEADER — master list only */}
            {
                !selectedPartyName && (
                    <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-3">
                        <BackButton className="mt-2 ml-3" />
                        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">Party Ledger</h1>
                        <button
                            onClick={() => setIsDeleteAllModalOpen(true)}
                            className="md:hidden text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 px-3 py-1.5 rounded-sm transition-colors mt-2 mr-3"
                            title="Delete all parties"
                        >
                            Delete All
                        </button>
                    </div>
                )
            }

            <div className="flex-1 flex flex-col md:flex-row gap-0 px-0">

                {/* LEFT: main column */}
                <div className="flex-1 w-full md:w-[65%]">

                    {/* MOBILE-ONLY bulk import — collapsed by default, single-row toggle */}
                    {!selectedPartyName && (
                        <div className="md:hidden bg-white border border-gray-200 rounded-sm mb-3 mx-3 overflow-hidden">
                            <button
                                onClick={() => setShowBulkImport(prev => !prev)}
                                className="w-full relative flex items-center justify-center px-3 py-2.5 text-sm font-bold text-orange-600 hover:bg-orange-50 transition-colors"
                            >
                                <span>Bulk Upload</span>
                                <span className={`absolute right-3 inline-block transition-transform duration-200 ${showBulkImport ? 'rotate-180' : ''}`}>▼</span>
                            </button>
                            {showBulkImport && (
                                <div className="bg-orange-50 border-t border-orange-100 p-3">
                                    <p className="text-xs text-orange-600 mb-2">Upload an Excel sheet of old dues/advances as opening balances.</p>
                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={() => bulkFileInputRef.current?.click()}
                                            disabled={isBulkUploading}
                                            className="w-full bg-orange-500 text-white py-2 px-3 rounded-sm text-sm font-semibold hover:bg-orange-600 disabled:bg-gray-400 flex items-center justify-center gap-2"
                                        >
                                            {isBulkUploading ? <Spinner /> : 'Upload Excel File'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleDownloadBulkSample}
                                            disabled={isBulkUploading}
                                            className="text-sm text-orange-600 underline text-center"
                                        >
                                            Download Sample Template
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* FILTERS — master list only */}
                    {
                        !selectedPartyName && (
                            <div className="bg-white p-3 rounded-sm shadow-sm border border-gray-200 mb-4 mx-3 md:mx-0">
                                <div className="mb-3">
                                    <input
                                        type="text"
                                        placeholder="Search by Party Name or Number..."
                                        value={searchQuery}
                                        onChange={(e) => { setSearchQuery(e.target.value); if (e.target.value.trim()) setShowTransactionList(true); }}
                                        className="w-full p-2 border border-gray-300 rounded-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <FilterSelect value={datePreset} onChange={(e) => handleDatePresetChange(e.target.value)}>
                                        <option value="today">Today</option>
                                        <option value="yesterday">Yesterday</option>
                                        <option value="last7">Last 7 Days</option>
                                        <option value="last30">Last 30 Days</option>
                                        <option value="thisMonth">This Month</option>
                                        <option value="custom">Custom</option>
                                    </FilterSelect>
                                    <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:col-span-2">
                                        <input type="date" value={customStartDate} onChange={(e) => { setCustomStartDate(e.target.value); setDatePreset('custom'); }} className="w-full min-w-0 p-2 text-sm bg-gray-50 border border-gray-200 rounded-sm" />
                                        <input type="date" value={customEndDate} onChange={(e) => { setCustomEndDate(e.target.value); setDatePreset('custom'); }} className="w-full min-w-0 p-2 text-sm bg-gray-50 border border-gray-200 rounded-sm" />
                                    </div>
                                </div>

                                <div className="mt-3">
                                    <button
                                        onClick={() => {
                                            setAppliedStartDate(customStartDate);
                                            setAppliedEndDate(customEndDate);
                                            setSelectedPartyName(null);
                                            setExpandedBillId(null);
                                            setShowTransactionList(false);
                                        }}
                                        className="w-full px-3 py-2 bg-orange-500 text-white text-sm font-semibold rounded-md hover:bg-orange-600 transition-colors"
                                    >
                                        Apply
                                    </button>
                                </div>
                                <div className="flex justify-center mt-3">
                                    <div className="flex bg-gray-100 rounded-sm p-1 text-sm">
                                        <button
                                            onClick={() => { setStatusFilter(prev => prev === 'due' ? 'all' : 'due'); setShowTransactionList(true); }}
                                            className={`px-3 py-1.5 rounded-sm transition ${statusFilter === 'due' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600'}`}
                                        >
                                            Due
                                        </button>
                                        <button
                                            onClick={() => { setStatusFilter(prev => prev === 'settled' ? 'all' : 'settled'); setShowTransactionList(true); }}
                                            className={`px-3 py-1.5 rounded-sm transition ${statusFilter === 'settled' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600'}`}
                                        >
                                            Settled
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    }

                    {/* MAIN VIEW */}
                    <div className="px-3 md:px-0">
                        {
                            !selectedPartyName ? (
                                // VIEW 1: MASTER LIST
                                <div className="space-y-2 mt-2">
                                    {filteredParties.length === 0 ? (
                                        <div className="p-6 text-center text-gray-500 bg-white">No parties found for this period.</div>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => setShowTransactionList(prev => !prev)}
                                                className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-sm text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                                            >
                                                <span>{showTransactionList ? 'Hide' : 'Show'} List ({filteredParties.length} parties)</span>
                                                <span className={`inline-block transition-transform duration-200 ${showTransactionList ? 'rotate-180' : ''}`}>▼</span>
                                            </button>

                                            {showTransactionList && filteredParties.map((party) => (
                                                <CustomCard
                                                    key={`${party.partyName}-${party.partyNumber}`}
                                                    onClick={() => {
                                                        console.log('Selected Party:', party.partyName, '| Number:', party.partyNumber);
                                                        setSelectedPartyName(party.partyName);
                                                        setSelectedPartyNumber(party.partyNumber);
                                                        setExpandedBillId(null);
                                                    }}
                                                    className="cursor-pointer transition-shadow hover:shadow-md p-3.5 bg-white"
                                                >
                                                    <div className="flex items-start justify-between mb-1.5">
                                                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap bg-orange-50 text-orange-600 border-orange-200">
                                                            {party.partyType}
                                                        </span>
                                                        <p className="text-xs text-slate-400">Total: ₹{party.totalBilled.toLocaleString('en-IN')}</p>
                                                    </div>
                                                    <div className="flex items-end justify-between">
                                                        <div>
                                                            <p className="text-base font-semibold text-slate-800">{party.partyName}</p>
                                                            <p className="text-sm text-slate-500 mt-0.5">
                                                                {party.partyNumber || 'N/A'} <span className="mx-1 text-slate-300">•</span> {party.totalTransactions} Bills
                                                            </p>
                                                            {/* NEW: address + GST number, only if present */}
                                                            {party.address && (
                                                                <p className="text-xs text-slate-400 mt-0.5">{party.address}</p>
                                                            )}
                                                            {party.gstNumber && (
                                                                <p className="text-[11px] text-slate-400 mt-0.5">GSTIN: {party.gstNumber}</p>
                                                            )}
                                                        </div>
                                                        <div className="text-right">
                                                            <p className={`text-lg font-bold ${party.totalDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                                {party.totalDue > 0 ? 'Due: ' : ''}₹{party.totalDue.toLocaleString('en-IN')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {/* Remind + Delete row */}
                                                    <div className="mt-2 pt-2 border-t border-slate-100 flex gap-2">
                                                        {party.totalDue > 0 && party.partyNumber && party.partyNumber.trim() !== '' && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleSendPartyReminder(party);
                                                                }}
                                                                disabled={sendingReminderFor === party.partyNumber}
                                                                className="flex-1 py-1.5 text-[11px] font-bold text-white bg-orange-500 rounded-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                                                            >
                                                                {sendingReminderFor === party.partyNumber ? <Spinner /> : 'Remind'}
                                                            </button>
                                                        )}
                                                        {/* NEW: per-party delete button */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setPartyToDelete({ partyName: party.partyName, partyNumber: party.partyNumber });
                                                            }}
                                                            className="flex-1 py-1.5 text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-sm hover:bg-red-100 transition-colors"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </CustomCard>
                                            ))}
                                        </>
                                    )}
                                </div>
                            ) : (
                                // VIEW 2: DETAIL LEDGER
                                <div className="flex flex-col gap-2">

                                    {/* STICKY HEADER */}
                                    <div className="sticky top-0 z-30 pt-2 pb-3 -mx-2 px-2 bg-gray-50">
                                        <div className="flex items-center justify-between pb-2 mb-2">
                                            <BackButton onClick={goBack} />
                                            <h1 className="flex-1 text-lg text-center font-bold text-gray-800 truncate px-2">
                                                {selectedPartyName} - Ledger
                                            </h1>
                                            <div className="w-10 h-10" />
                                        </div>

                                        {/* Summary Card */}
                                        <div className="rounded-sm border border-slate-200 bg-white overflow-hidden">
                                            <div className="bg-orange-50 border-b border-orange-100 px-4 py-2 flex justify-between items-center">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ledger Summary</span>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedPartyLedger?.transactions.filter(t => !t.isOpeningBalance).length} Bills</span>
                                                    <button
                                                        onClick={() => {
                                                            setObForm({
                                                                partyName: selectedPartyName || '',
                                                                partyNumber: selectedPartyNumber || '',
                                                                partyType: 'Customer',
                                                                balanceType: 'due',
                                                                amount: '',
                                                                note: '',
                                                            });
                                                            setIsOBModalOpen(true);
                                                        }}
                                                        className="text-[10px] font-bold px-2 py-0.5 bg-orange-500 text-white rounded hover:bg-orange-600 transition whitespace-nowrap"
                                                    >
                                                        + Opening Balance
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-4 flex justify-between items-center">
                                                <div className="flex flex-col flex-1">
                                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Billed</span>
                                                    <span className="text-lg sm:text-xl font-extrabold text-slate-800 truncate">
                                                        ₹{selectedPartyLedger?.totalBilled.toLocaleString('en-IN')}
                                                    </span>
                                                </div>
                                                <div className="h-10 w-px bg-slate-200 mx-3" />
                                                <div className="flex flex-col flex-1 text-right">
                                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Pending</span>
                                                    <span className={`text-lg sm:text-xl font-extrabold truncate ${selectedPartyLedger && selectedPartyLedger.totalDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                        ₹{selectedPartyLedger?.totalDue.toLocaleString('en-IN')}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bill Cards */}
                                    <div className="px-1 space-y-3">
                                        {selectedPartyLedger?.transactions.length === 0 && (
                                            <div className="p-6 text-center text-gray-500 bg-white rounded-sm">No transactions found for this period.</div>
                                        )}
                                        {selectedPartyLedger?.transactions.map((txn: LedgerTransaction) => {
                                            const isExpanded = expandedBillId === txn.id;
                                            return (
                                                <CustomCard key={txn.id} onClick={() => toggleBillExpansion(txn.id)} className="cursor-pointer transition-shadow hover:shadow-md bg-white">
                                                    <div className="flex justify-between items-end w-full -mt-5 relative pointer-events-none">
                                                        <div className="flex justify-start gap-1 flex-wrap max-w-[50%] pointer-events-auto">
                                                            {txn.isOpeningBalance ? (
                                                                <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap
                                                    ${txn.balanceType === 'advance'
                                                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                                                        : 'bg-orange-50 text-orange-600 border-orange-200'
                                                                    }`}>
                                                                    {txn.balanceType === 'advance' ? 'Advance' : 'Opening Balance'}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap bg-orange-50 text-orange-600 border-orange-200">
                                                                    {txn.type}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between mt-2">
                                                        <div className="flex-1">
                                                            {txn.isOpeningBalance ? (
                                                                <>
                                                                    <p className="text-base font-semibold text-slate-800">Opening Due</p>
                                                                    <p className="text-sm text-slate-500 mt-1">{formatDate(txn.createdAt.getTime())}</p>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <p className="text-base font-semibold text-slate-800">{txn.invoiceNumber || txn.id.slice(0, 8)}</p>
                                                                    <p className="text-sm text-slate-500 mt-1">{formatDate(txn.createdAt.getTime())}</p>
                                                                </>
                                                            )}
                                                        </div>

                                                        <div className="flex-shrink-0 px-2 sm:px-4 flex items-center justify-center">
                                                            {txn.isOpeningBalance && txn.balanceType === 'advance' ? (
                                                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded uppercase tracking-widest">Advance</span>
                                                            ) : txn.dueAmount <= 0 ? (
                                                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded uppercase tracking-widest">Settled</span>
                                                            ) : (
                                                                <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded uppercase tracking-widest">Due</span>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center justify-end space-x-3 flex-1">
                                                            <div className="text-right">
                                                                {txn.dueAmount > 0 ? (
                                                                    <>
                                                                        <p className="text-lg font-bold text-red-600">{txn.dueAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</p>
                                                                        <p className="text-xs text-slate-400">Total: {txn.totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</p>
                                                                    </>
                                                                ) : (
                                                                    <p className="text-lg font-bold text-slate-800">{txn.totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</p>
                                                                )}
                                                            </div>
                                                            <IconChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                                                        </div>
                                                    </div>

                                                    {isExpanded && (
                                                        <div className="mt-3">
                                                            {txn.isOpeningBalance && txn.note && (
                                                                <p className="text-xs text-slate-500 italic mb-2 px-1">
                                                                    Note: {txn.note}
                                                                </p>
                                                            )}
                                                            <div className="relative py-2">
                                                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                                                                <div className="relative flex justify-center">
                                                                    <span className="bg-white px-2 text-xs font-bold text-slate-400 uppercase tracking-widest">Payment History</span>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1 mt-2">
                                                                {txn.paymentHistory && txn.paymentHistory.length > 0 ? (
                                                                    txn.paymentHistory.map((payment: PaymentRecord, index: number) => (
                                                                        <div key={index} className="flex justify-between items-center text-slate-700 py-2 border-b border-slate-50 last:border-0">
                                                                            <div className="flex items-center gap-4">
                                                                                <div className="flex flex-col">
                                                                                    <span className="font-medium text-sm text-slate-600">
                                                                                        {new Date(payment.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                                                    </span>
                                                                                    <span className="text-[10px] text-slate-400">
                                                                                        {new Date(payment.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                                                                    </span>
                                                                                </div>
                                                                                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border bg-orange-50 text-orange-600 border-orange-200">
                                                                                    {payment.method === 'upi' ? 'UPI' : payment.method.replace(/_/g, ' ')}
                                                                                </span>
                                                                            </div>
                                                                            <span className="font-semibold text-emerald-600 text-sm">
                                                                                + {payment.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                                                            </span>
                                                                        </div>
                                                                    ))
                                                                ) : (
                                                                    <p className="text-xs text-slate-400 text-center py-3">No payment records found.</p>
                                                                )}
                                                            </div>
                                                            {/* ✅ Settle Payment Button */}
                                                            {txn.dueAmount > 0 && !(txn.isOpeningBalance && txn.balanceType === 'advance') && (
                                                                <div className="mt-3 pt-3 border-t border-slate-200">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedInvoiceForPayment({
                                                                                id: txn.id,
                                                                                invoiceNumber: txn.invoiceNumber,
                                                                                type: 'sale',
                                                                                totalAmount: txn.totalAmount,
                                                                                dueAmount: txn.dueAmount,
                                                                                partyName: selectedPartyName,
                                                                                isOpeningBalance: txn.isOpeningBalance === true,
                                                                            });
                                                                            setIsPaymentModalOpen(true);
                                                                        }}
                                                                        className="w-full px-4 py-2 text-sm font-semibold text-white bg-[#F97316] rounded-sm hover:bg-[#F97316] transition-colors"
                                                                    >
                                                                        Settle Payment
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </CustomCard>
                                            );
                                        })}
                                    </div>
                                </div>
                            )
                        }
                    </div> {/* closes px-3 md:px-0 */}
                </div> {/* closes left column */}

                {/* RIGHT: white sidebar panel — Bulk Import (desktop only, master list only) */}
                {!selectedPartyName && (
                    <div className="hidden md:flex w-[35%] flex-col bg-white border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
                        <div className="p-6 sticky top-4 self-start w-full">
                            <div className="bg-orange-50 rounded-sm p-5 border border-orange-100">
                                <h2 className="text-lg font-bold text-orange-800 mb-2">Bulk Import</h2>
                                <p className="text-sm text-orange-600 mb-4">
                                    Upload Excel/CSV. Old dues/advances are added as opening balances.
                                </p>
                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={() => bulkFileInputRef.current?.click()}
                                        disabled={isBulkUploading}
                                        className="w-full bg-white text-orange-600 border border-orange-200 hover:bg-orange-50 py-3 px-4 rounded-sm font-semibold disabled:bg-gray-100 flex items-center justify-center gap-2 transition-colors"
                                    >
                                        {isBulkUploading ? <Spinner /> : 'Upload Excel File'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDownloadBulkSample}
                                        disabled={isBulkUploading}
                                        className="text-sm text-orange-500 hover:text-orange-700 underline text-center"
                                    >
                                        Download Sample Template
                                    </button>
                                </div>
                            </div>
                            {/* NEW: Danger zone — delete all parties (desktop sidebar) */}
                            <div className="bg-red-50 rounded-sm p-5 border border-red-100 mt-4">
                                <h2 className="text-sm font-bold text-red-700 mb-1">Danger Zone</h2>
                                <p className="text-xs text-red-600 mb-3">
                                    Permanently delete every party, order, and opening balance.
                                </p>
                                <button
                                    onClick={() => setIsDeleteAllModalOpen(true)}
                                    className="w-full bg-white text-red-600 border border-red-200 hover:bg-red-100 py-2 px-4 rounded-sm text-sm font-semibold transition-colors"
                                >
                                    Delete All Parties
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div> {/* closes flex-1 flex flex-col md:flex-row */}
        </div>
    );
};

export default CataloguePartyLedger;