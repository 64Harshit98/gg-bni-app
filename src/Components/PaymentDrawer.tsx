import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FloatingLabelInput } from './ui/FloatingLabelInput';
import { transactiontypes } from '../constants/Transactiontype';
import { Modal } from '../constants/Modal';
import { State } from '../enums';
import { db } from '../lib/Firebase';
import {
    doc,
    setDoc,
    serverTimestamp,
    increment as firebaseIncrement,
    collection,
    query,
    where,
    getDocs,
    limit
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context';

export interface PaymentDetails { [key: string]: number; }

export interface PaymentCompletionData {
    paymentDetails: PaymentDetails;
    partyName: string;
    partyNumber: string;
    discount: number;
    finalAmount: number;
    appliedCredit: number;
    appliedDebit: number;
    partyAddress?: string;
    partyGST?: string;
    revDiscount?: number;
    method?: string;
    shippingName?: string;
    shippingNumber?: string;
    shippingAddress?: string;
    shippingGST?: string;
    extraExpenseName?: string;
    extraExpenseAmount?: number;
    narration?: string;
}

interface PaymentDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    mode?: 'sale' | 'purchase' | 'calculator';
    subtotal: number;
    totalTax?: number;
    billTotal: number;
    totalQuantity?: number;
    totalItemDiscount?: number;
    onPaymentComplete: (data: PaymentCompletionData) => Promise<void>;
    isPartyNameEditable?: boolean;
    initialPartyName?: string;
    initialPartyNumber?: string;
    initialPaymentMethods?: PaymentDetails | { [key: string]: any };
    requireCustomerName?: boolean;
    requireCustomerMobile?: boolean;
    initialDiscount?: number;
    allowDueBilling?: boolean;
    initialShippingName?: string;
    initialShippingNumber?: string;
    initialShippingAddress?: string;
    initialShippingGST?: string;
    initialExpenseName?: string;
    initialExpenseAmount?: number;
    initialNarration?: string;
    enableShippingDetails?: boolean;
    enableExtraExpense?: boolean;
    enableNarration?: boolean;
    enableCustomerDetails?: boolean;
    initialPartyAddress?: string;
    initialPartyGST?: string;
}

const SESSION_STORAGE_NAME_KEY = 'sessionPartyName';
const SESSION_STORAGE_NUMBER_KEY = 'sessionPartyNumber';

interface PartySuggestion {
    name: string;
    number: string;
    address?: string;
    gstNumber?: string;
    creditBalance?: number;
    debitBalance?: number;
    shippingName?: string;
    shippingNumber?: string;
    shippingAddress?: string;
    shippingGST?: string;
}

const PaymentDrawer: React.FC<PaymentDrawerProps> = ({
    isOpen,
    onClose,
    mode = 'sale',
    subtotal,
    billTotal,
    totalTax = 0,
    totalQuantity = 0,
    totalItemDiscount = 0,
    onPaymentComplete,
    initialPartyName,
    initialPartyNumber,
    initialPaymentMethods,
    requireCustomerName = false,
    requireCustomerMobile = false,
    allowDueBilling = false,
    initialDiscount = 0,
    initialShippingName,
    initialShippingNumber,
    initialShippingAddress,
    initialShippingGST,
    initialExpenseName,
    initialExpenseAmount,
    initialNarration,
    enableShippingDetails = false,
    enableExtraExpense = false,
    enableNarration = false,
    enableCustomerDetails = true,
    initialPartyAddress,
    initialPartyGST,
}) => {
    const { currentUser } = useAuth();

    // --- COMPUTED PROPERTIES BASED ON MODE ---
    const isSale = mode === 'sale';
    const collectionName = isSale ? 'customers' : 'suppliers';
    const partyLabel = isSale ? 'Customer' : 'Supplier';
    const isCalculator = mode === 'calculator';

    // --- STATE ---
    const [partyName, setPartyName] = useState('');
    const [partyNumber, setPartyNumber] = useState('');
    const [partyAddress, setPartyAddress] = useState('');
    const [partyGST, setPartyGST] = useState('');
    const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
    const [discount, setDiscount] = useState(0);
    const [discountPercent, setDiscountPercent] = useState(0);
    const [partyCredit, setPartyCredit] = useState(0);
    const [partyDebit, setPartyDebit] = useState(0);
    const [useCredit, setUseCredit] = useState(false);
    const [useDebit, setUseDebit] = useState(false);
    const [selectedPayments, setSelectedPayments] = useState<PaymentDetails>({});
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDiscountLocked, setIsDiscountLocked] = useState(true);

    const [suggestions, setSuggestions] = useState<PartySuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeout = useRef<NodeJS.Timeout | null>(null);

    const shouldSaveToLocalStorage = useRef(true);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const [discountInfo, setDiscountInfo] = useState<string | null>(null);
    const [addressType, setAddressType] = useState<'billing' | 'shipping'>('billing');
    const [isSameAsBilling, setIsSameAsBilling] = useState(false);
    const [shippingName, setShippingName] = useState('');
    const [shippingNumber, setShippingNumber] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');
    const [shippingGST, setShippingGST] = useState('');

    const [isExpenseExpanded, setIsExpenseExpanded] = useState(false);
    const [expenseName, setExpenseName] = useState('');
    const [expenseAmount, setExpenseAmount] = useState<number | ''>('');
    const [narration, setNarration] = useState('');
    const [isNarrationExpanded, setIsNarrationExpanded] = useState(false);

    // --- CALCULATIONS ---
    const parsedExpense = parseFloat(expenseAmount.toString()) || 0;
    const netPayable = useMemo(() => Math.max(0, billTotal - discount + parsedExpense), [billTotal, discount, parsedExpense]);

    const totalManualPayment = useMemo(() => {
        const sum = Object.values(selectedPayments).reduce((acc, amount) => acc + (amount || 0), 0);
        return parseFloat(sum.toFixed(2));
    }, [selectedPayments]);

    const appliedCreditAmount = useMemo(() => {
        if (!useCredit || partyCredit <= 0) return 0;
        const remainingAfterManual = Math.max(0, netPayable - totalManualPayment);
        return Math.min(remainingAfterManual, partyCredit);
    }, [useCredit, partyCredit, netPayable, totalManualPayment]);

    const appliedDebitAmount = useMemo(() => {
        if (!useDebit || partyDebit <= 0) return 0;
        const remainingAfterManualAndCredit = Math.max(0, netPayable - totalManualPayment - appliedCreditAmount);
        return Math.min(remainingAfterManualAndCredit, partyDebit);
    }, [useDebit, partyDebit, netPayable, totalManualPayment, appliedCreditAmount]);

    const totalPaymentReceived = useMemo(() => {
        return parseFloat((totalManualPayment + appliedCreditAmount + appliedDebitAmount).toFixed(2));
    }, [totalManualPayment, appliedCreditAmount, appliedDebitAmount]);

    const changeToReturn = useMemo(() => {
        const diff = totalPaymentReceived - netPayable;
        return diff > 0.01 ? parseFloat(diff.toFixed(2)) : 0;
    }, [totalPaymentReceived, netPayable]);

    const pendingAmount = useMemo(() => {
        const diff = netPayable - totalPaymentReceived;
        return diff > 0.01 ? parseFloat(diff.toFixed(2)) : 0;
    }, [netPayable, totalPaymentReceived]);

    // --- AUTO-SYNC SHIPPING DETAILS ---
    useEffect(() => {
        if (isSameAsBilling) {
            setShippingName(partyName);
            setShippingNumber(partyNumber);
            setShippingAddress(partyAddress);
            setShippingGST(partyGST);
        }
    }, [isSameAsBilling, partyName, partyNumber, partyAddress, partyGST]);

    useEffect(() => {
        if (!isOpen) return;

        setIsSubmitting(false);
        setDiscount(initialDiscount || 0);
        setDiscountPercent(billTotal > 0 ? parseFloat((((initialDiscount || 0) / billTotal) * 100).toFixed(2)) : 0)
        setIsDiscountLocked(true);
        setPartyCredit(0);
        setUseCredit(false);
        setPartyDebit(0);
        setUseDebit(false);
        setSuggestions([]);
        setShowSuggestions(false);
        setAddressType('billing');
        setShippingName(initialShippingName || '');
        setShippingNumber(initialShippingNumber || '');
        setShippingAddress(initialShippingAddress || '');
        setShippingGST(initialShippingGST || '');
        setExpenseName(initialExpenseName || '');
        setExpenseAmount(initialExpenseAmount || '');
        setIsExpenseExpanded(false);
        setNarration(initialNarration || '');
        setIsNarrationExpanded(!!initialNarration);

        let initialName = initialPartyName || '';
        let initialNumber = initialPartyNumber || '';

        // --- THE FIX ---
        if (initialName || initialNumber) {
            // EDIT MODE: Turn off auto-save so we don't overwrite the New Bill draft
            shouldSaveToLocalStorage.current = false;

            // Clear the session storage so the next New Bill starts totally fresh
            try {
                sessionStorage.removeItem(SESSION_STORAGE_NAME_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_NUMBER_KEY);
            } catch (e) { }
        } else {
            // NEW BILL MODE: Turn auto-save back on and load any existing draft
            shouldSaveToLocalStorage.current = true;
            try {
                initialName = sessionStorage.getItem(SESSION_STORAGE_NAME_KEY) || '';
                initialNumber = sessionStorage.getItem(SESSION_STORAGE_NUMBER_KEY) || '';
            } catch (e) { }
        }
        // ---------------

        if (initialPaymentMethods && Object.keys(initialPaymentMethods).length > 0) {
            const loadedPayments: PaymentDetails = {};
            Object.entries(initialPaymentMethods).forEach(([key, value]) => {
                if (key === 'due' || key === 'Credit Note' || key === 'Debit Note') return;
                const numVal = Number(value);
                if (!isNaN(numVal) && numVal > 0) loadedPayments[key] = numVal;
            });
            setSelectedPayments(loadedPayments);
        } else {
            setSelectedPayments({});
        }

        setPartyName(initialName);
        setPartyNumber(initialNumber);
        setPartyAddress(initialPartyAddress || '');
        setPartyGST(initialPartyGST || '');
        setIsDetailsExpanded(false);

        // Auto-search logic on open
        if (isSale && initialNumber) searchParty(initialNumber, 'number');
        if (!isSale && initialName) searchParty(initialName, 'name');

    }, [isOpen, mode, initialDiscount, initialPartyName, initialPartyNumber, initialPartyAddress, initialPartyGST, initialShippingName, initialShippingNumber, initialShippingAddress, initialShippingGST, initialExpenseName, initialExpenseAmount, initialNarration]);

    useEffect(() => {
        if (isOpen && !isSubmitting && shouldSaveToLocalStorage.current) {
            try {
                if (partyName) sessionStorage.setItem(SESSION_STORAGE_NAME_KEY, partyName);
                if (partyNumber) sessionStorage.setItem(SESSION_STORAGE_NUMBER_KEY, partyNumber);
            } catch (e) { }
        }
    }, [partyName, partyNumber, isOpen, isSubmitting]);

    const searchParty = async (term: string, field: 'name' | 'number') => {
        if (!term || term.length < 2 || !currentUser?.companyId) {
            setSuggestions([]); setShowSuggestions(false); return;
        }

        const companyId = currentUser.companyId;
        const partyRef = collection(db, 'companies', companyId, collectionName);

        const termLower = term.toLowerCase();

        const termCap = termLower.charAt(0).toUpperCase() + termLower.slice(1);

        try {
            const queries = [];

            queries.push(
                getDocs(query(partyRef, where(field, '>=', termLower), where(field, '<=', termLower + '\uf8ff'), limit(5)))
            );

            if (field === 'name' && termCap !== termLower) {
                queries.push(
                    getDocs(query(partyRef, where(field, '>=', termCap), where(field, '<=', termCap + '\uf8ff'), limit(5)))
                );
            }
            const snapshots = await Promise.all(queries);

            const resultsMap = new Map<string, PartySuggestion>();

            snapshots.forEach(snap => {
                snap.forEach(doc => {
                    if (!resultsMap.has(doc.id)) {
                        const data = doc.data();
                        resultsMap.set(doc.id, {
                            name: data.name || '',
                            number: data.number || doc.id,
                            address: data.address,
                            gstNumber: data.gstNumber,
                            creditBalance: data.creditBalance,
                            debitBalance: data.debitBalance,
                            shippingName: data.shippingName,
                            shippingNumber: data.shippingNumber,
                            shippingAddress: data.shippingAddress,
                            shippingGST: data.shippingGST,
                        });
                    }
                });
            });

            const results = Array.from(resultsMap.values());
            setSuggestions(results);
            setShowSuggestions(results.length > 0);

        } catch (err) {
            console.error(err);
        }
    };

    const handleInputChange = (value: string, type: 'name' | 'number') => {
        if (type === 'name') {
            setPartyName(value);
            if (!isSale) {
                if (searchTimeout.current) clearTimeout(searchTimeout.current);
                searchTimeout.current = setTimeout(() => { searchParty(value, 'name'); }, 400);
            } else {
                setSuggestions([]); setShowSuggestions(false);
            }
        } else {
            setPartyNumber(value);
            if (isSale) {
                if (searchTimeout.current) clearTimeout(searchTimeout.current);
                searchTimeout.current = setTimeout(() => { searchParty(value, 'number'); }, 400);
            } else {
                setSuggestions([]); setShowSuggestions(false);
            }
        }
    };

    const selectParty = (party: PartySuggestion) => {
        setPartyName(party.name);
        setPartyNumber(party.number);
        setPartyAddress(party.address || '');
        setPartyGST(party.gstNumber || '');
        setPartyCredit(party.creditBalance || 0);
        setPartyDebit(party.debitBalance || 0);
        setShippingName(party.shippingName || '');
        setShippingNumber(party.shippingNumber || '');
        setShippingAddress(party.shippingAddress || '');
        setShippingGST(party.shippingGST || '');
        setUseCredit(false);
        setUseDebit(false);
        setShowSuggestions(false);
    };

    const handleAmountChange = (modeId: string, amount: string) => {
        const numAmount = parseFloat(amount) || 0;
        setSelectedPayments(prev => ({ ...prev, [modeId]: Math.max(0, numAmount) }));
    };

    const handleFillRemaining = (modeId: string) => {
        const currentAmount = selectedPayments[modeId] || 0;
        const amountToFill = Math.max(0, pendingAmount);
        handleAmountChange(modeId, (currentAmount + amountToFill).toFixed(2));
    };

    const handleConfirm = async () => {
        if (pendingAmount > 0.01) {
            setModal({ message: `Mismatch: ₹${pendingAmount.toFixed(2)} remaining.`, type: State.ERROR });
            return;
        }
        // ✅ ADD THIS CHECK — block if manual payment already covers full bill but credit is also applied
        if (useCredit && appliedCreditAmount === 0 && partyCredit > 0) {
            setModal({
                message: `Credit note not needed — payment methods already cover the full bill of ₹${netPayable.toFixed(2)}.`,
                type: State.ERROR
            });
            return;
        }

        const dueAmount = Object.entries(selectedPayments).reduce((acc, [key, value]) => {
            return key.toLowerCase().includes('due') ? acc + (value || 0) : acc;
        }, 0);

        if (mode === 'sale' && dueAmount > 0 && !partyNumber.trim()) {
            setModal({ message: `${partyLabel} Phone Number is required for Due Billing.`, type: State.ERROR });
            return;
        }
        if (mode === 'purchase' && dueAmount > 0 && (!partyName.trim() || !partyNumber.trim())) {
            setModal({ message: `${partyLabel} Name and Phone Number are required for Due Billing.`, type: State.ERROR });
            return;
        }

        let revDiscount = 0;
        if (changeToReturn > 0.01) revDiscount = changeToReturn;

        const payloadToSave: PaymentDetails = {};
        transactiontypes.forEach((t) => { payloadToSave[t.id] = 0; });
        Object.entries(selectedPayments).forEach(([key, value]) => { payloadToSave[key] = value; });

        if (appliedCreditAmount > 0) payloadToSave['Credit Note'] = appliedCreditAmount;
        if (appliedDebitAmount > 0) payloadToSave['Debit Note'] = appliedDebitAmount;

        setIsSubmitting(true);
        shouldSaveToLocalStorage.current = false;

        try {
            const safePartyName = partyName ? partyName.trim() : '';
            const safePartyNumber = partyNumber ? partyNumber.trim() : '';
            const safePartyAddress = partyAddress ? partyAddress.trim() : '';
            const safePartyGST = partyGST ? partyGST.trim() : '';
            const safeShippingName = shippingName ? shippingName.trim() : '';
            const safeShippingNumber = shippingNumber ? shippingNumber.trim() : '';
            const safeShippingAddress = shippingAddress ? shippingAddress.trim() : '';
            const safeShippingGST = shippingGST ? shippingGST.trim() : '';
            const safeExpenseName = expenseName ? expenseName.trim() : '';
            const safeNarration = narration ? narration.trim() : '';

            await onPaymentComplete({
                paymentDetails: payloadToSave || {},
                partyName: safePartyName,
                partyNumber: safePartyNumber,
                discount: discount || 0,
                finalAmount: netPayable || 0,
                appliedCredit: appliedCreditAmount || 0,
                appliedDebit: appliedDebitAmount || 0,
                partyAddress: safePartyAddress,
                partyGST: safePartyGST,
                revDiscount: revDiscount || 0,
                shippingName: safeShippingName,
                shippingNumber: safeShippingNumber,
                shippingAddress: safeShippingAddress,
                shippingGST: safeShippingGST,
                extraExpenseName: safeExpenseName,
                extraExpenseAmount: parsedExpense || 0,
                narration: safeNarration,
            });

            const identifier = safePartyNumber || safePartyName;

            if (currentUser?.companyId && identifier) {
                const partyDocRef = doc(db, 'companies', currentUser.companyId, collectionName, identifier);

                const partyData: any = {
                    name: safePartyName,
                    number: safePartyNumber,
                    companyId: currentUser.companyId,
                    address: safePartyAddress,
                    gstNumber: safePartyGST,
                    shippingName: safeShippingName,
                    shippingNumber: safeShippingNumber,
                    shippingAddress: safeShippingAddress,
                    shippingGST: safeShippingGST,
                    updatedAt: serverTimestamp(),
                };

                Object.keys(partyData).forEach(key => {
                    if (partyData[key] === undefined) delete partyData[key];
                });

                if (isSale) partyData.lastSaleAt = serverTimestamp();
                else partyData.lastPurchaseAt = serverTimestamp();

                if (appliedCreditAmount > 0) partyData.creditBalance = firebaseIncrement(-appliedCreditAmount);
                if (appliedDebitAmount > 0) partyData.debitBalance = firebaseIncrement(-appliedDebitAmount);

                await setDoc(partyDocRef, partyData, { merge: true });
            }

            try {
                sessionStorage.removeItem(SESSION_STORAGE_NAME_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_NUMBER_KEY);
            } catch (e) { }

            setPartyName(''); setPartyNumber(''); setSelectedPayments({});
            setShippingName(''); setShippingNumber(''); setShippingAddress(''); setShippingGST('');
            setExpenseName(''); setExpenseAmount('');

        } catch (error) {
            setModal({ message: (error as Error).message || 'Failed to save.', type: State.ERROR });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDiscountPressStart = () => longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500);
    const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
    const handleDiscountClick = () => { if (isDiscountLocked) { setDiscountInfo("Cannot edit"); setTimeout(() => setDiscountInfo(null), 3000); } };
    const handleDiscountAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const amt = parseFloat(e.target.value) || 0;
        setDiscount(amt);
        setDiscountPercent(billTotal > 0 ? parseFloat(((amt / billTotal) * 100).toFixed(2)) : 0);
    };

    const handleDiscountPercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const pct = parseFloat(e.target.value) || 0;
        setDiscountPercent(pct);
        setDiscount(parseFloat(((pct / 100) * billTotal).toFixed(2)));
    };

    // --- RENDER HELPERS ---
    const renderSuggestions = () => {
        if (!showSuggestions || suggestions.length === 0) return null;
        return (
            <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 shadow-xl rounded-lg mt-1 max-h-48 overflow-y-auto">
                {suggestions.map((party, idx) => (
                    <div key={idx} className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 text-sm flex justify-between items-center" onClick={() => selectParty(party)}>
                        <div>
                            <div className="font-bold text-gray-800">{party.name}</div>
                            <div className="text-xs text-gray-500">{party.number}</div>
                        </div>
                        {party.creditBalance && party.creditBalance > 0 && (<span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">Credit: ₹{party.creditBalance}</span>)}
                    </div>
                ))}
            </div>
        );
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[99] flex items-end justify-center sm:items-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />

            {modal && <div className="absolute z-[10000]"><Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} /></div>}

            <div className="relative w-full max-w-lg bg-gray-50 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col transform transition-transform duration-300 ease-out animate-slide-up" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="p-3 bg-white rounded-t-2xl border-b border-gray-200 sticky top-0 z-10 flex items-center justify-center shadow-sm">
                    <div className="w-10 h-1 bg-gray-300 rounded-full absolute top-2"></div>
                    <button onClick={onClose} className="absolute left-4 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                    <h2 className="text-lg font-semibold text-gray-800 mt-2">Payment Details</h2>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-y-contain bg-white">
                    {/* Party Info Section */}
                    {enableCustomerDetails && (
                        <div className="p-4 space-y-2">

                            {/* NORMAL MODE: Header & Shipping Toggles */}
                            {!isCalculator && (
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{partyLabel} Info</h3>
                                    {isSale && enableShippingDetails && (
                                        <div className="flex bg-gray-200 rounded-md p-1 shadow-inner">
                                            <button onClick={() => setAddressType('billing')} className={`text-xs px-4 py-1.5 rounded font-semibold transition-all ${addressType === 'billing' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Billing</button>
                                            <button onClick={() => setAddressType('shipping')} className={`text-xs px-4 py-1.5 rounded font-semibold transition-all ${addressType === 'shipping' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Shipping</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* NORMAL MODE: Same as Billing Checkbox */}
                            {!isCalculator && isSale && enableShippingDetails && addressType === 'shipping' && (
                                <div className="flex items-center justify-end mb-3 animate-in fade-in slide-in-from-top-1">
                                    <label className="flex items-center gap-2 cursor-pointer bg-blue-50 px-3 py-1.5 rounded-md border border-blue-100">
                                        <input type="checkbox" checked={isSameAsBilling} onChange={(e) => { const isChecked = e.target.checked; setIsSameAsBilling(isChecked); if (!isChecked) { setShippingName(''); setShippingNumber(''); setShippingAddress(''); setShippingGST(''); } }} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer" />
                                        <span className="text-xs font-semibold text-blue-800">Same as Billing Details</span>
                                    </label>
                                </div>
                            )}

                            {/* NAME AND NUMBER INPUTS (Will always render if enableCustomerDetails is true) */}
                            <div className="grid grid-cols-2 gap-4 relative animate-in fade-in slide-in-from-top-2">
                                {/* NUMBER INPUT */}
                                <div className="relative">
                                    <input
                                        type="tel"
                                        maxLength={10}
                                        placeholder={requireCustomerMobile ? "Phone Number *" : "Phone Number"}
                                        value={addressType === 'billing' ? partyNumber : shippingNumber}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);

                                            if (addressType === 'billing') {
                                                handleInputChange(val, 'number');
                                            } else {
                                                setShippingNumber(val);
                                                setIsSameAsBilling(false);
                                            }
                                        }}
                                        onFocus={() => { if (isSale && addressType === 'billing' && partyNumber.length >= 3) searchParty(partyNumber, 'number'); }}
                                        className={`w-full bg-gray-50 p-3 text-sm rounded-xs border ${requireCustomerMobile && !partyNumber && addressType === 'billing' ? 'border-red-300 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'} focus:ring-2 focus:ring-blue-100 outline-none`}
                                        autoComplete="off"
                                    />
                                    {requireCustomerMobile && addressType === 'billing' && <span className="absolute right-3 top-3 text-red-500 font-bold">*</span>}
                                    {isSale && addressType === 'billing' && renderSuggestions()}
                                </div>

                                {/* NAME INPUT */}
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder={requireCustomerName ? `${partyLabel} Name *` : `${partyLabel} Name`}
                                        value={addressType === 'billing' ? partyName : shippingName}
                                        onChange={(e) => {
                                            if (addressType === 'billing') { handleInputChange(e.target.value, 'name'); }
                                            else { setShippingName(e.target.value); setIsSameAsBilling(false); }
                                        }}
                                        onFocus={() => { if (!isSale && addressType === 'billing' && partyName.length >= 3) searchParty(partyName, 'name'); }}
                                        className={`w-full bg-gray-50 p-3 text-sm rounded-xs border ${requireCustomerName && !partyName && addressType === 'billing' ? '' : 'border-gray-200 focus:border-blue-500'} focus:ring-2 focus:ring-blue-100 outline-none`}
                                        autoComplete="off"
                                    />
                                    {requireCustomerName && addressType === 'billing' && <span className="absolute right-3 top-3 text-red-500 font-bold">*</span>}
                                    {!isSale && addressType === 'billing' && renderSuggestions()}
                                </div>
                            </div>

                            {/* NORMAL MODE: Extra Details Toggles (HIDDEN IN CALCULATOR MODE) */}
                            {!isCalculator && (
                                <div className="pt-2 flex flex-col gap-2 w-full">
                                    <div className="flex items-center justify-between w-full">
                                        <div onClick={() => setIsDetailsExpanded(!isDetailsExpanded)} className="flex items-center justify-start cursor-pointer text-blue-600 hover:text-blue-700 transition-colors text-xs font-semibold select-none">
                                            <span>{isDetailsExpanded ? '- Hide' : '+ Add'} GST & Address</span>
                                        </div>
                                        {isSale && enableNarration && (
                                            <div onClick={() => setIsNarrationExpanded(!isNarrationExpanded)} className="flex items-center justify-start cursor-pointer text-gray-500 hover:text-gray-700 transition-colors text-xs font-semibold select-none">
                                                <span>{isNarrationExpanded ? '- Hide' : '+ Add'} Narration</span>
                                            </div>
                                        )}
                                        {isSale && enableExtraExpense && (
                                            <div onClick={() => setIsExpenseExpanded(!isExpenseExpanded)} className="flex items-center justify-end cursor-pointer text-orange-600 hover:text-orange-700 transition-colors text-xs font-semibold select-none">
                                                <span>{isExpenseExpanded ? '- Hide' : '+ Add'} Expense</span>
                                            </div>
                                        )}
                                    </div>

                                    {isDetailsExpanded && (
                                        <div className="grid grid-cols-2 gap-3 mt-3 animate-in slide-in-from-top-2 fade-in duration-200">
                                            <input type="text" placeholder="GST Number" maxLength={15} value={addressType === 'billing' ? partyGST : shippingGST} onChange={(e) => { if (addressType === 'billing') { setPartyGST(e.target.value); } else { setShippingGST(e.target.value); setIsSameAsBilling(false); } }} className="w-full p-2.5 text-sm rounded-XS border border-gray-200 bg-gray-50 focus:border-blue-500 outline-none" />
                                            <input type="text" placeholder="Full Address" value={addressType === 'billing' ? partyAddress : shippingAddress} onChange={(e) => { if (addressType === 'billing') { setPartyAddress(e.target.value); } else { setShippingAddress(e.target.value); setIsSameAsBilling(false); } }} className="w-full p-2.5 text-sm rounded-XS border border-gray-200 bg-gray-50 focus:border-blue-500 outline-none" />
                                        </div>
                                    )}
                                    {isExpenseExpanded && (
                                        <div className="grid grid-cols-2 gap-3 mt-3 animate-in slide-in-from-top-2 fade-in duration-200 p-2 bg-orange-50 rounded-lg border border-orange-100">
                                            <input type="text" placeholder="Expense Name (e.g. Freight)" value={expenseName} onChange={(e) => setExpenseName(e.target.value)} className="w-full p-2.5 text-sm rounded-lg border border-orange-200 bg-white focus:border-orange-500 outline-none" />
                                            <input type="number" placeholder="Amount (₹)" value={expenseAmount} onChange={(e) => setExpenseAmount(parseFloat(e.target.value) || '')} className="w-full p-2.5 text-sm rounded-lg border border-orange-200 bg-white focus:border-orange-500 outline-none" />
                                        </div>
                                    )}
                                    {isNarrationExpanded && (
                                        <div className="mt-2 animate-in slide-in-from-top-2 fade-in duration-200">
                                            <textarea placeholder="Enter narration or remarks..." value={narration} onChange={(e) => setNarration(e.target.value)} className="w-full p-2.5 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:border-blue-500 outline-none resize-none" rows={2} />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Credit/Debit Balances */}
                    {(partyCredit > 0 || partyDebit > 0) && (
                        <div className="px-4 pb-2">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Available Balances</h3>
                            {partyCredit > 0 && (
                                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-100 rounded-lg mb-2">
                                    <div className="flex flex-col"><span className="text-sm font-semibold text-green-800">Credit Note Balance</span><span className="text-xs text-green-600">Available: ₹{partyCredit.toFixed(2)}</span></div>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} className="w-5 h-5 text-green-600 rounded focus:ring-green-500 border-gray-300" /><span className="text-sm font-medium text-gray-700">Apply</span></label>
                                </div>
                            )}
                            {partyDebit > 0 && (
                                <div className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg">
                                    <div className="flex flex-col"><span className="text-sm font-semibold text-red-800">Debit Balance</span><span className="text-xs text-red-600">Available: ₹{partyDebit.toFixed(2)}</span></div>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={useDebit} onChange={(e) => setUseDebit(e.target.checked)} className="w-5 h-5 text-red-600 rounded focus:ring-red-500 border-gray-300" /><span className="text-sm font-medium text-gray-700">Apply</span></label>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Payment Inputs */}
                    <div className="p-4 bg-gray-100">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Transaction Type</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {transactiontypes.map((mode) => {
                                // 1. Identify if this is the Due field
                                const isDueField =
                                    mode.id.toLowerCase().includes('due') ||
                                    mode.name.toLowerCase().includes('due');

                                // 2. Determine if it should be locked
                                // It is locked ONLY if it's a Sale, it IS the due field, and Due Billing is turned OFF.
                                const isDisabled = isSale && isDueField && !allowDueBilling;

                                return (
                                    <FloatingLabelInput
                                        key={mode.id}
                                        id={mode.id}
                                        label={isDisabled ? `${mode.name}` : mode.name}
                                        value={selectedPayments[mode.id]?.toString() || ''}
                                        // Block the change handlers if disabled
                                        onChange={(e) => {
                                            if (!isDisabled) handleAmountChange(mode.id, e.target.value);
                                        }}
                                        onFill={() => {
                                            if (!isDisabled) handleFillRemaining(mode.id);
                                        }}
                                        showFillButton={pendingAmount > 0.01 && !isDisabled}
                                        className={`rounded-xs transition-colors ${isDisabled
                                            ? 'bg-gray-100 cursor-not-allowed opacity-60 pointer-events-none'
                                            : 'bg-white'
                                            }`}
                                        disabled={isDisabled}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer Totals */}
                <div className="p-4 bg-white border-t border-gray-200 rounded-b-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">
                    {!isCalculator && (

                        <div className="flex justify-between items-center mb-2 text-sm text-gray-500">
                            <span>Qty: <strong className="text-gray-800">{totalQuantity}</strong></span>
                            <div className="flex items-center gap-2">
                                <span>Subtotal:</span>
                                <span className="font-medium text-gray-800">₹{subtotal.toFixed(2)}</span>
                            </div>
                        </div>
                    )}
                    {/* AFTER: Two synced inputs — % and ₹ — both locked by default */}
                    <div
                        className="flex justify-between items-center mb-2 text-sm"
                        onMouseDown={handleDiscountPressStart}
                        onMouseUp={handleDiscountPressEnd}
                        onMouseLeave={handleDiscountPressEnd}
                        onTouchStart={handleDiscountPressStart}
                        onTouchEnd={handleDiscountPressEnd}
                        onClick={handleDiscountClick}
                    >
                        <div className="flex items-center gap-2">
                            <span className={`text-gray-500 ${isDiscountLocked ? '' : 'text-blue-600 font-semibold'}`}>
                                Bill Discount
                            </span>
                            {isDiscountLocked
                                ? <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                </svg>
                                : null
                            }
                            {discountInfo && (
                                <span className="text-xs text-red-500 bg-red-50 px-1 rounded animate-pulse">
                                    {discountInfo}
                                </span>
                            )}
                        </div>

                        {/* Twin inputs */}
                        <div className="flex items-center gap-1">
                            {/* Percent input */}
                            <div className="relative flex items-center">
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={discountPercent || ''}
                                    onChange={handleDiscountPercentChange}
                                    readOnly={isDiscountLocked}
                                    className={`w-14 text-center bg-red-100 rounded-sm text-red-800 focus:outline-none pr-4 ${isDiscountLocked ? 'cursor-not-allowed' : 'border-b border-blue-300 font-semibold'
                                        }`}
                                />
                                <span className="absolute right-1 text-xs text-red-400 font-bold pointer-events-none">%</span>
                            </div>

                            <span className="text-gray-300 text-xs">|</span>

                            {/* Amount input */}
                            <div className="relative flex items-center">
                                <span className="absolute left-1 text-xs text-red-400 font-bold pointer-events-none">₹</span>
                                <input
                                    id="discount"
                                    type="number"
                                    placeholder="0"
                                    value={discount || ''}
                                    onChange={handleDiscountAmountChange}
                                    readOnly={isDiscountLocked}
                                    className={`w-16 text-center bg-red-100 rounded-sm text-red-800 focus:outline-none pl-4 ${isDiscountLocked ? 'cursor-not-allowed' : 'border-b border-blue-300 font-semibold'
                                        }`}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between items-center mb-1.5 min-h-[24px]">
                        <div className="flex-1 flex justify-start">
                            {changeToReturn > 0.01 ? (
                                <span className="text-base font-bold text-yellow-700 bg-yellow-50 px-2 py-1 rounded border border-yellow-100">
                                    Return: ₹{changeToReturn.toFixed()}
                                </span>
                            ) : (
                                <span className={`text-base font-bold ${pendingAmount < 0.01 ? 'text-green-600' : 'text-red-500'}`}>
                                    {pendingAmount < 0.01 ? 'Paid' : `Due: ₹${pendingAmount.toFixed()}`}
                                </span>
                            )}
                        </div>

                        <div className="flex flex-col items-center mb-4 px-4">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">
                                Total Payable
                            </span>
                            <span className="text-3xl font-extrabold text-blue-600">
                                ₹{netPayable.toFixed(2)}
                            </span>
                        </div>

                        <div className="flex-1 flex flex-col items-end justify-center pb-4">
                            {totalTax > 0 && (
                                <span className="text-sm text-gray-600 font-medium leading-tight mb-1">
                                    Tax: ₹{totalTax.toFixed(2)}
                                </span>
                            )}
                            {totalItemDiscount > 0 && (
                                <span className="text-base text-red-600 font-medium leading-tight">
                                    Disc: -₹{totalItemDiscount.toFixed()}
                                </span>
                            )}
                        </div>
                    </div>

                    <button onClick={handleConfirm} disabled={isSubmitting || pendingAmount > 0.01} className="w-full py-3.5 text-white rounded-sm font-bold text-lg shadow active:scale-[0.98] transition-all disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2" style={{ backgroundColor: pendingAmount < 0.01 ? '#0ea5e9' : '#94a3b8' }}>
                        {isSubmitting ? (<><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Processing...</>) : ("Confirm Payment")}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default PaymentDrawer;