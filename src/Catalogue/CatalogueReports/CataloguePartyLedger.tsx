import React, { useState, useMemo, useRef, useEffect } from 'react';

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
    createdAt: number;
    paymentHistory: PaymentRecord[];
};
import { formatDate, formatDateForInput } from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import FilterSelect from '../../Pages/Reports/SalesReportComponents/FilterSelect';
import { useAuth } from '../../context/auth-context';
import { CustomCard } from '../../Components/CustomCard';
import { IconChevronDown } from '../../constants/Icons';
import { db } from '../../lib/Firebase';
import { collection, query, onSnapshot, orderBy, where } from 'firebase/firestore';
import BackButton from '../../Components/BackButton';
import { PaymentModal } from '../../constants/Modal';

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

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
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
                const { doc, runTransaction , setDoc: fsSetDoc, serverTimestamp: fsST, increment: fsIncrement } = await import('firebase/firestore');
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
            const { doc, runTransaction } = await import('firebase/firestore');
            const docRef = doc(db, 'companies', currentUser.companyId, 'Orders', invoice.id);

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
        dateFilteredOrders.forEach((order: any) => {
            const name = order.userName
                || order.billingDetails?.name
                || order.shippingDetails?.name
                || 'Unknown';
            const rawNumber = order.userLoginPhone
                || order.billingDetails?.phone
                || order.shippingDetails?.phone;

            const number = (rawNumber || '').toString().trim();
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
            existing.totalBilled += total;
            existing.totalDue += Math.max(0, total - paid);
            existing.totalTransactions += 1;
        });
        openingBalances.forEach((ob) => {
            // ✅ Filter opening balances by date range
            const start = appliedStartDate ? new Date(appliedStartDate).setHours(0, 0, 0, 0) : 0;
            const end = appliedEndDate ? new Date(appliedEndDate).setHours(23, 59, 59, 999) : Date.now();
            if (ob.createdAt < start || ob.createdAt > end) return; // ← skip if outside range

            const key = ob.partyNumber?.trim()
                ? ob.partyNumber.trim()
                : `NO_PHONE_${ob.partyName.toLowerCase().replace(/\s+/g, '_')}`;

            if (!map.has(key)) {
                map.set(key, {
                    partyName: ob.partyName,
                    partyNumber: ob.partyNumber,
                    totalBilled: 0,
                    totalDue: 0,
                    totalTransactions: 0,
                    partyType: 'Customer',
                });
            }
            const existing = map.get(key);
            existing.totalBilled += ob.amount;
            if (ob.balanceType !== 'advance') {
                existing.totalDue += ob.dueAmount;
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
    }, [dateFilteredOrders, searchQuery, localPaidOverrides, statusFilter, openingBalances, appliedStartDate, appliedEndDate]);

    // ─── DETAIL LEDGER (uses same date-filtered orders) ───────────────────────
    const selectedPartyLedger = useMemo(() => {
        if (!selectedPartyName) return null;

        const transactions = dateFilteredOrders
            .filter((order: any) => {
                const orderPhone = (
                    order.userLoginPhone
                    || order.billingDetails?.phone
                    || order.shippingDetails?.phone
                    || ''
                ).toString().trim();

                const selectedPhone = (selectedPartyNumber || '').toString().trim();

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
                    isOpeningBalance: false,      // ← add this
                    balanceType: undefined,       // ← add this
                };
            });
        // Merge matching opening balances as pseudo-transactions
        const obTransactions: LedgerTransaction[] = openingBalances
            .filter(ob => {
                // ✅ Date filter
                const start = appliedStartDate ? new Date(appliedStartDate).setHours(0, 0, 0, 0) : 0;
                const end = appliedEndDate ? new Date(appliedEndDate).setHours(23, 59, 59, 999) : Date.now();
                if (ob.createdAt < start || ob.createdAt > end) return false;

                const selectedPhone = (selectedPartyNumber || '').toString().trim();
                if (selectedPhone) return ob.partyNumber?.trim() === selectedPhone;
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
        <div ref={pageTopRef} className="min-h-screen bg-gray-50 pb-16">
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
            {/* HEADER — master list only */}
            {
                !selectedPartyName && (
                    <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-3">
                        <BackButton className="mt-2 ml-3" />
                        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">Party Ledger</h1>
                        <div className="w-10 mt-2 mr-3" />
                    </div>
                )
            }

            {/* FILTERS — master list only */}
            {
                !selectedPartyName && (
                    <div className="bg-white p-3 rounded-sm shadow-sm border border-gray-200 mb-4">
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
                            <div className="grid grid-cols-2 gap-2 sm:gap-4">
                                <input type="date" value={customStartDate} onChange={(e) => { setCustomStartDate(e.target.value); setDatePreset('custom'); }} className="w-full p-2 text-sm bg-gray-50 border border-gray-200 rounded-sm" />
                                <input type="date" value={customEndDate} onChange={(e) => { setCustomEndDate(e.target.value); setDatePreset('custom'); }} className="w-full p-2 text-sm bg-gray-50 border border-gray-200 rounded-sm" />
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
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-lg font-bold ${party.totalDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    {party.totalDue > 0 ? 'Due: ' : ''}₹{party.totalDue.toLocaleString('en-IN')}
                                                </p>
                                            </div>
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
        </div >
    );
};

export default CataloguePartyLedger;