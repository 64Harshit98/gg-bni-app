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

export interface ExpenseItem {
    name: string;
    amount: number;
}
export interface TransportDetails {
    transportName: string;
    grRrNo: string;
    grRrDate: string;
    vehicleNo: string;
    stationFrom: string;
    pinCode: string;
}
const INDIAN_STATES = [
    "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
    "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
    "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
    "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
    "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

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
    expenses?: ExpenseItem[];
    narration?: string;
    placeOfSupply?: string;
    shippingState?: string;
    transportDetails?: TransportDetails;
}

interface PaymentDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    mode?: 'sale' | 'purchase' | 'calculator';
    subtotal: number;
    totalTax?: number;
    billTotal: number;
    originalBillTotal?: number;
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
    initialExpenses?: ExpenseItem[];
    initialNarration?: string;
    enableShippingDetails?: boolean;
    enableExtraExpense?: boolean;
    enableNarration?: boolean;
    enableCustomerDetails?: boolean;
    enableTransportDetails?: boolean;
    initialTransportDetails?: TransportDetails;
    initialPartyAddress?: string;
    initialPartyGST?: string;
    initialPlaceOfSupply?: string;
    initialShippingState?: string;
    taxMode?: 'inclusive' | 'exclusive' | 'exempt';
    onTaxModeChange?: (mode: 'inclusive' | 'exclusive' | 'exempt') => void;
    isTaxToggleLocked?: boolean;
    totalMrp?: number;
}

// --- SESSION STORAGE KEYS ---
const SESSION_STORAGE_NAME_KEY = 'sessionPartyName';
const SESSION_STORAGE_NUMBER_KEY = 'sessionPartyNumber';
const SESSION_STORAGE_ADDRESS_KEY = 'sessionPartyAddress';
const SESSION_STORAGE_GST_KEY = 'sessionPartyGST';
const SESSION_STORAGE_STATE_KEY = 'sessionPartyState';
const SESSION_STORAGE_SHIPPING_NAME_KEY = 'sessionShippingName';
const SESSION_STORAGE_SHIPPING_NUMBER_KEY = 'sessionShippingNumber';
const SESSION_STORAGE_SHIPPING_ADDRESS_KEY = 'sessionShippingAddress';
const SESSION_STORAGE_SHIPPING_GST_KEY = 'sessionShippingGST';
const SESSION_STORAGE_SHIPPING_STATE_KEY = 'sessionShippingState';
const SESSION_STORAGE_SAME_AS_BILLING_KEY = 'sessionIsSameAsBilling';
const SESSION_STORAGE_EXPENSES_KEY = 'sessionExpenses';
const SESSION_STORAGE_NARRATION_KEY = 'sessionNarration';
const SESSION_STORAGE_PAYMENTS_KEY = 'sessionSelectedPayments';
const SESSION_STORAGE_TRANSPORT_KEY = 'sessionTransportDetails';

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
    state?: string;
    shippingState?: string;
}

const PaymentDrawer: React.FC<PaymentDrawerProps> = ({
    isOpen,
    onClose,
    mode = 'sale',
    billTotal,
    originalBillTotal,
    totalTax = 0,
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
    initialExpenses,
    initialNarration,
    enableShippingDetails = false,
    enableExtraExpense = false,
    enableNarration = false,
    enableCustomerDetails = true,
    enableTransportDetails = false,
    initialTransportDetails,
    initialPartyAddress,
    initialPartyGST,
    initialPlaceOfSupply,
    initialShippingState,
    taxMode = 'exclusive',
    onTaxModeChange,
    isTaxToggleLocked = false,
    totalMrp = 0,
}) => {
    const { currentUser } = useAuth();

    // --- COMPUTED PROPERTIES BASED ON MODE ---
    const isSale = mode === 'sale' || mode === 'calculator';
    const collectionName = isSale ? 'customers' : 'suppliers';
    const partyLabel = isSale ? 'Customer' : 'Supplier';
    const isCalculator = mode === 'calculator';
    const isPurchaseReturnMode = mode === 'purchase' ;

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
    const [partyState, setPartyState] = useState('');
    const [shippingState, setShippingState] = useState('');
    const [suggestions, setSuggestions] = useState<PartySuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeout = useRef<NodeJS.Timeout | null>(null);

    const numberInputRef = useRef<HTMLInputElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const shouldSaveToLocalStorage = useRef(true);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const [discountInfo, setDiscountInfo] = useState<string | null>(null);
    const [addressType, setAddressType] = useState<'billing' | 'shipping'>('billing');
    const [isSameAsBilling, setIsSameAsBilling] = useState(false);
    const [shippingName, setShippingName] = useState('');
    const [shippingNumber, setShippingNumber] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');
    const [shippingGST, setShippingGST] = useState('');

    const [expenses, setExpenses] = useState<{ id: number; name: string; amount: number | '' }[]>([]);
    const [narration, setNarration] = useState('');
    const [isNarrationExpanded, setIsNarrationExpanded] = useState(false);

    const [showTransportModal, setShowTransportModal] = useState(false);
    const [transportName, setTransportName] = useState('');
    const [grRrNo, setGrRrNo] = useState('');
    const [grRrDate, setGrRrDate] = useState('');
    const [vehicleNo, setVehicleNo] = useState('');
    const [stationFrom, setStationFrom] = useState('');
    const [pinCode, setPinCode] = useState('');

    const hasTransportDetails = !!(transportName || grRrNo || grRrDate || vehicleNo || stationFrom || pinCode);
    // --- CALCULATIONS ---
    const liveTax = useMemo(() => {
        if (!billTotal || billTotal <= 0) return totalTax || 0;
        const ratio = Math.max(0, (billTotal - discount) / billTotal);
        return (totalTax || 0) * ratio;
    }, [totalTax, billTotal, discount]);

    const parsedExpense = expenses.reduce((sum, e) => sum + (parseFloat(e.amount.toString()) || 0), 0);
    const netPayable = useMemo(() => Math.round(Math.max(0, billTotal - discount + parsedExpense)), [billTotal, discount, parsedExpense]);

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
            setShippingState(partyState);
        }
    }, [isSameAsBilling, partyName, partyNumber, partyAddress, partyGST, partyState]);

    // --- LIFECYCLE: MOUNT / SYNC INITIAL DATA & CACHE ---
    useEffect(() => {
        if (!isOpen) return;

        setIsSubmitting(false);
        const baseTotal = originalBillTotal && originalBillTotal > 0 ? originalBillTotal : billTotal;
        const originalPercent = initialDiscount && baseTotal > 0 ? (initialDiscount / baseTotal) * 100 : 0;
        const scaledDiscount = billTotal > 0 ? Math.round((originalPercent / 100) * billTotal) : 0;

        setDiscount(scaledDiscount);
        setDiscountPercent(parseFloat(originalPercent.toFixed(2)));
        setIsDiscountLocked(true);
        setPartyCredit(0);
        setUseCredit(false);
        setPartyDebit(0);
        setUseDebit(false);
        setSuggestions([]);
        setShowSuggestions(false);
        setAddressType('billing');

        // Setup fallbacks using props
        let finalName = initialPartyName || '';
        let finalNumber = initialPartyNumber || '';
        let finalAddress = initialPartyAddress || '';
        let finalGST = initialPartyGST || '';
        let finalState = initialPlaceOfSupply || '';
        let finalShippingName = initialShippingName || '';
        let finalShippingNumber = initialShippingNumber || '';
        let finalShippingAddress = initialShippingAddress || '';
        let finalShippingGST = initialShippingGST || '';
        let finalShippingState = initialShippingState || '';
        let finalIsSameAsBilling = false;
        let finalExpenses = initialExpenses && initialExpenses.length > 0
            ? initialExpenses.map((e, index) => ({ id: Date.now() + index, name: e.name, amount: e.amount }))
            : [];
        let finalNarration = initialNarration || '';
        let loadedPayments: PaymentDetails = {};
        let finalTransport: TransportDetails = initialTransportDetails || {
            transportName: '', grRrNo: '', grRrDate: '', vehicleNo: '', stationFrom: '', pinCode: ''
        };
        // In edit mode, always prefer the prop value
        if (initialPartyName || initialPartyNumber) {
            // Edit mode: use prop directly, ignore session storage
            if (initialTransportDetails) {
                finalTransport = initialTransportDetails;
            }
        } else {
            // New bill mode: try session storage first, then prop
            const savedTransport = sessionStorage.getItem(SESSION_STORAGE_TRANSPORT_KEY);
            if (savedTransport) {
                try { finalTransport = JSON.parse(savedTransport); } catch (e) { }
            } else if (initialTransportDetails) {
                finalTransport = initialTransportDetails;
            }
        }
        if (initialPaymentMethods && Object.keys(initialPaymentMethods).length > 0) {
            Object.entries(initialPaymentMethods).forEach(([key, value]) => {
                if (key === 'due' || key === 'Credit Note' || key === 'Debit Note') return;
                const numVal = Number(value);
                if (!isNaN(numVal) && numVal > 0) loadedPayments[key] = numVal;
            });
        }

        if (finalName || finalNumber) {
            // EDIT MODE: Turn off auto-save so we don't overwrite any ongoing New Bill draft
            shouldSaveToLocalStorage.current = false;

            // Clear session values completely so the next New Bill flows fresh
            try {
                sessionStorage.removeItem(SESSION_STORAGE_NAME_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_NUMBER_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_ADDRESS_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_GST_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_STATE_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_NAME_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_NUMBER_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_ADDRESS_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_GST_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_STATE_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SAME_AS_BILLING_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_EXPENSES_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_NARRATION_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_PAYMENTS_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_TRANSPORT_KEY);
            } catch (e) { }
        } else {
            // NEW BILL MODE: Enable automatic local caching
            shouldSaveToLocalStorage.current = true;
            try {
                finalName = sessionStorage.getItem(SESSION_STORAGE_NAME_KEY) || '';
                finalNumber = sessionStorage.getItem(SESSION_STORAGE_NUMBER_KEY) || '';
                finalAddress = sessionStorage.getItem(SESSION_STORAGE_ADDRESS_KEY) || '';
                finalGST = sessionStorage.getItem(SESSION_STORAGE_GST_KEY) || '';
                finalState = sessionStorage.getItem(SESSION_STORAGE_STATE_KEY) || '';
                finalShippingName = sessionStorage.getItem(SESSION_STORAGE_SHIPPING_NAME_KEY) || '';
                finalShippingNumber = sessionStorage.getItem(SESSION_STORAGE_SHIPPING_NUMBER_KEY) || '';
                finalShippingAddress = sessionStorage.getItem(SESSION_STORAGE_SHIPPING_ADDRESS_KEY) || '';
                finalShippingGST = sessionStorage.getItem(SESSION_STORAGE_SHIPPING_GST_KEY) || '';
                finalShippingState = sessionStorage.getItem(SESSION_STORAGE_SHIPPING_STATE_KEY) || '';
                finalIsSameAsBilling = sessionStorage.getItem(SESSION_STORAGE_SAME_AS_BILLING_KEY) === 'true';
                finalNarration = sessionStorage.getItem(SESSION_STORAGE_NARRATION_KEY) || '';

                const savedExpenses = sessionStorage.getItem(SESSION_STORAGE_EXPENSES_KEY);
                if (savedExpenses) finalExpenses = JSON.parse(savedExpenses);

                const savedPayments = sessionStorage.getItem(SESSION_STORAGE_PAYMENTS_KEY);
                if (savedPayments) loadedPayments = JSON.parse(savedPayments);

            } catch (e) { }
        }

        // Apply initialized parameters directly to state hook engines
        setPartyName(finalName);
        setPartyNumber(finalNumber);
        setPartyAddress(finalAddress);
        setPartyGST(finalGST);
        setPartyState(finalState);
        setShippingName(finalShippingName);
        setShippingNumber(finalShippingNumber);
        setShippingAddress(finalShippingAddress);
        setShippingGST(finalShippingGST);
        setShippingState(finalShippingState);
        setIsSameAsBilling(finalIsSameAsBilling);
        setExpenses(finalExpenses);
        setNarration(finalNarration);
        setSelectedPayments(loadedPayments);

        setTransportName(finalTransport.transportName || '');
        setGrRrNo(finalTransport.grRrNo || '');
        setGrRrDate(finalTransport.grRrDate || '');
        setVehicleNo(finalTransport.vehicleNo || '');
        setStationFrom(finalTransport.stationFrom || '');
        setPinCode(finalTransport.pinCode || '');
        setIsNarrationExpanded(!!finalNarration);
        setIsDetailsExpanded(!!(finalAddress || finalGST || finalState));

        if (isSale && finalNumber) searchParty(finalNumber, 'number');
        if (!isSale && finalName) searchParty(finalName, 'name');

    }, [isOpen, mode, billTotal, initialDiscount, originalBillTotal, initialPartyName, initialPartyNumber, initialPartyAddress, initialPartyGST, initialShippingName, initialShippingNumber, initialShippingAddress, initialShippingGST, initialNarration, initialTransportDetails, initialPlaceOfSupply, initialShippingState]);

    // --- AUTOMATIC SESSION SYNC EFFECT ---
    useEffect(() => {
        if (isOpen && !isSubmitting && shouldSaveToLocalStorage.current) {
            try {
                sessionStorage.setItem(SESSION_STORAGE_NAME_KEY, partyName);
                sessionStorage.setItem(SESSION_STORAGE_NUMBER_KEY, partyNumber);
                sessionStorage.setItem(SESSION_STORAGE_ADDRESS_KEY, partyAddress);
                sessionStorage.setItem(SESSION_STORAGE_GST_KEY, partyGST);
                sessionStorage.setItem(SESSION_STORAGE_STATE_KEY, partyState);
                sessionStorage.setItem(SESSION_STORAGE_SHIPPING_NAME_KEY, shippingName);
                sessionStorage.setItem(SESSION_STORAGE_SHIPPING_NUMBER_KEY, shippingNumber);
                sessionStorage.setItem(SESSION_STORAGE_SHIPPING_ADDRESS_KEY, shippingAddress);
                sessionStorage.setItem(SESSION_STORAGE_SHIPPING_GST_KEY, shippingGST);
                sessionStorage.setItem(SESSION_STORAGE_SHIPPING_STATE_KEY, shippingState);
                sessionStorage.setItem(SESSION_STORAGE_SAME_AS_BILLING_KEY, String(isSameAsBilling));
                sessionStorage.setItem(SESSION_STORAGE_NARRATION_KEY, narration);
                sessionStorage.setItem(SESSION_STORAGE_EXPENSES_KEY, JSON.stringify(expenses));
                sessionStorage.setItem(SESSION_STORAGE_PAYMENTS_KEY, JSON.stringify(selectedPayments));
                sessionStorage.setItem(SESSION_STORAGE_TRANSPORT_KEY, JSON.stringify({
                    transportName, grRrNo, grRrDate, vehicleNo, stationFrom, pinCode
                }));
            } catch (e) { }
        }
    }, [
        partyName, partyNumber, partyAddress, partyGST, partyState,
        shippingName, shippingNumber, shippingAddress, shippingGST, shippingState,
        isSameAsBilling, expenses, narration, selectedPayments, isOpen, isSubmitting, transportName, grRrNo, grRrDate, vehicleNo, stationFrom, pinCode
    ]);

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
                            state: data.state || data.placeOfSupply,
                            shippingState: data.shippingState,
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
        setPartyState(party.state || '');
        setPartyGST(party.gstNumber || '');
        setPartyCredit(party.creditBalance || 0);
        setPartyDebit(party.debitBalance || 0);
        setShippingName(party.shippingName || '');
        setShippingNumber(party.shippingNumber || '');
        setShippingAddress(party.shippingAddress || '');
        setShippingState(party.shippingState || '');
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

        const nonDuePaymentTotal = Object.entries(selectedPayments).reduce((acc, [key, value]) => {
            const isDue = key.toLowerCase().includes('due');
            return isDue ? acc : acc + (value || 0);
        }, 0);

        const dueInPayments = Object.entries(selectedPayments).reduce((acc, [key, value]) => {
            return key.toLowerCase().includes('due') ? acc + (value || 0) : acc;
        }, 0);

        const activeNonDuePayments = Object.entries(selectedPayments).filter(([key, value]) => {
            const isDue = key.toLowerCase().includes('due');
            return !isDue && (value || 0) > 0;
        });

        if (activeNonDuePayments.length > 1 && nonDuePaymentTotal > netPayable + 0.01) {
            setModal({
                message: `Paid amount (₹${nonDuePaymentTotal.toFixed(2)}) exceeds the bill total of ₹${netPayable.toFixed(2)}. Please correct the payment amounts.`,
                type: State.ERROR
            });
            return;
        }

        if (dueInPayments > 0 && nonDuePaymentTotal + dueInPayments > netPayable + 0.01) {
            setModal({
                message: `Total entered (₹${(nonDuePaymentTotal + dueInPayments).toFixed(2)}) exceeds the bill of ₹${netPayable.toFixed(2)}. Reduce Due or other payment amounts.`,
                type: State.ERROR
            });
            return;
        }

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
            const formattedExpenses = expenses
                .filter(e => e.name.trim() || e.amount)
                .map(e => ({
                    name: e.name.trim(),
                    amount: parseFloat(e.amount.toString()) || 0
                }));
            const safeNarration = narration ? narration.trim() : '';
            const safeTransportDetails: TransportDetails = {
                transportName: transportName.trim(),
                grRrNo: grRrNo.trim(),
                grRrDate: grRrDate.trim(),
                vehicleNo: vehicleNo.trim(),
                stationFrom: stationFrom.trim(),
                pinCode: pinCode.trim(),
            };
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
                expenses: formattedExpenses,
                narration: safeNarration,
                placeOfSupply: partyState,
                shippingState: shippingState,
                transportDetails: hasTransportDetails ? safeTransportDetails : undefined,
            });

            const identifier = safePartyNumber || safePartyName;

            if (currentUser?.companyId && identifier) {
                const partyDocRef = doc(db, 'companies', currentUser.companyId, collectionName, identifier);

                const partyData: any = {
                    name: safePartyName,
                    number: safePartyNumber,
                    companyId: currentUser.companyId,
                    address: safePartyAddress,
                    state: partyState,
                    gstNumber: safePartyGST,
                    shippingName: safeShippingName,
                    shippingNumber: safeShippingNumber,
                    shippingAddress: safeShippingAddress,
                    shippingGST: safeShippingGST,
                    shippingState: shippingState,
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

            // Cleanup storage references explicitly on success
            try {
                sessionStorage.removeItem(SESSION_STORAGE_NAME_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_NUMBER_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_ADDRESS_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_GST_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_STATE_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_NAME_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_NUMBER_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_ADDRESS_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_GST_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_STATE_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SAME_AS_BILLING_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_EXPENSES_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_NARRATION_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_PAYMENTS_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_TRANSPORT_KEY);
            } catch (e) { }

            setPartyName(''); setPartyNumber(''); setSelectedPayments({});
            setShippingName(''); setShippingNumber(''); setShippingAddress(''); setShippingGST('');
            setExpenses([]); setNarration('');
            setTransportName(''); setGrRrNo(''); setGrRrDate(''); setVehicleNo(''); setStationFrom(''); setPinCode('');

        } catch (error) {
            setModal({ message: (error as Error).message || 'Failed to save.', type: State.ERROR });
        } {
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
        let pct = parseFloat(e.target.value) || 0;
        if (pct > 100) pct = 100;
        if (pct < 0) pct = 0;
        setDiscountPercent(pct);
        setDiscount(parseFloat(((pct / 100) * billTotal).toFixed(2)));
    };

    const renderSuggestions = () => {
        if (!showSuggestions || suggestions.length === 0) return null;
        const ref = isSale ? numberInputRef.current : nameInputRef.current;
        const rect = ref?.getBoundingClientRect();
        if (!rect) return null;

        return createPortal(
            <div
                style={{
                    position: 'fixed',
                    top: rect.bottom + 4,
                    left: rect.left,
                    width: rect.width * 2 + 8,
                    zIndex: 99999,
                }}
                className="bg-card border border-border shadow-xl rounded-sm max-h-48 overflow-y-auto"
            >
                {suggestions.map((party, idx) => (
                    <div key={idx} className="px-2 py-1 hover:bg-blue-50 cursor-pointer border-b last:border-0 text-sm flex justify-between items-center" onClick={() => selectParty(party)}>
                        <div>
                            <div className="font-semibold text-xs text-foreground">{party.name}</div>
                            <div className="text-[10px] text-muted-foreground">{party.number}</div>
                        </div>
                        {party.creditBalance && party.creditBalance > 0 && (<span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">Credit: ₹{party.creditBalance}</span>)}
                    </div>
                ))}
            </div>,
            document.body
        );
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[99] flex items-end justify-center sm:items-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />

            {modal && <div className="absolute z-[10000]"><Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} /></div>}
            {showTransportModal && (
                <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4" onClick={() => setShowTransportModal(false)}>
                    <div className="absolute inset-0 bg-black/50" />
                    <div className="relative w-full max-w-md bg-card rounded-sm shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-blue-500 px-4 py-2.5 flex items-center justify-between">
                            <h3 className="text-white font-semibold text-sm">Transport Details</h3>
                            <button onClick={() => setShowTransportModal(false)} className="text-white hover:text-orange-100">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Transport Name</label>
                                    <input type="text" value={transportName} onChange={(e) => setTransportName(e.target.value)} placeholder="e.g. DP World Express Logistic" className="w-full p-2 text-sm rounded-sm border border-border bg-muted focus:border-orange-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">GR/RR No.</label>
                                    <input type="text" value={grRrNo} onChange={(e) => setGrRrNo(e.target.value)} className="w-full p-2 text-sm rounded-sm border border-border bg-muted focus:border-orange-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">GR/RR Date</label>
                                    <input type="date" value={grRrDate} onChange={(e) => setGrRrDate(e.target.value)} className="w-full p-2 text-sm rounded-sm border border-border bg-muted focus:border-orange-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Vehicle No.</label>
                                    <input type="text" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} className="w-full p-2 text-sm rounded-sm border border-border bg-muted focus:border-orange-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">PIN Code</label>
                                    <input type="text" maxLength={6} value={pinCode} onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full p-2 text-sm rounded-sm border border-border bg-muted focus:border-orange-500 outline-none" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Station / From Place</label>
                                    <input type="text" value={stationFrom} onChange={(e) => setStationFrom(e.target.value)} className="w-full p-2 text-sm rounded-sm border border-border bg-muted focus:border-orange-500 outline-none" />
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                {hasTransportDetails && (
                                    <button
                                        onClick={() => { setTransportName(''); setGrRrNo(''); setGrRrDate(''); setVehicleNo(''); setStationFrom(''); setPinCode(''); }}
                                        className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-sm transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowTransportModal(false)}
                                    className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-sm font-bold text-sm transition-colors"
                                >
                                    OK
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <div className="relative w-full max-w-lg md:max-w-3xl bg-muted rounded-t-xs sm:rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col transform transition-transform duration-300 ease-out animate-slide-up" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="p-3 bg-card rounded-t-xs border-b border-border sticky top-0 z-10 flex items-center justify-center shadow-sm">
                    <div className="w-10 h-1 bg-gray-300 rounded-full absolute top-2"></div>
                    <button onClick={onClose} className="absolute left-4 p-1.5 rounded-full bg-muted hover:bg-muted text-muted-foreground transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                    <h2 className="text-lg font-semibold text-foreground mt-2">Payment Details</h2>
                </div>

                {/* MIDDLE SECTION */}
                <div className="flex-1 overflow-y-auto md:overflow-hidden bg-card flex flex-col md:flex-row">

                    {/* LEFT COLUMN: Customer Info & Balances */}
                    {enableCustomerDetails && (
                        <div className="md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-border bg-card">

                            <div className="p-2 md:p-3 space-y-1 md:space-y-3 flex-1 overflow-y-auto">
                                {!isCalculator && (
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider">{partyLabel} Info</h3>
                                        {isSale && enableShippingDetails && (
                                            <div className="flex bg-muted rounded-xs p-1 shadow-inner">
                                                <button onClick={() => setAddressType('billing')} className={`text-[10px] md:text-xs px-4 md:px-5 py-1.5 md:py-2 rounded font-semibold transition-all ${addressType === 'billing' ? 'bg-card text-blue-600 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Billing</button>
                                                <button onClick={() => setAddressType('shipping')} className={`text-[10px] md:text-xs px-4 md:px-5 py-1.5 md:py-2 rounded font-semibold transition-all ${addressType === 'shipping' ? 'bg-card text-blue-600 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Shipping</button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!isCalculator && isSale && enableShippingDetails && addressType === 'shipping' && (
                                    <div className="flex items-center justify-end mb-2 md:mb-3 animate-in fade-in slide-in-from-top-1">
                                        <label className="flex items-center gap-1.5 md:gap-2 cursor-pointer bg-blue-50 px-2 md:px-3 py-1 md:py-1.5 rounded-xs border border-blue-100">
                                            <input type="checkbox" checked={isSameAsBilling} onChange={(e) => { const isChecked = e.target.checked; setIsSameAsBilling(isChecked); if (!isChecked) { setShippingName(''); setShippingNumber(''); setShippingAddress(''); setShippingGST(''); } }} className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-600 rounded border-border focus:ring-blue-500 cursor-pointer" />
                                            <span className="text-[10px] md:text-xs font-semibold text-blue-800">Same as Billing Details</span>
                                        </label>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-2 md:gap-4 relative animate-in fade-in slide-in-from-top-2">
                                    <div className={`relative ${mode === 'purchase' ? 'order-2' : 'order-1'}`}>
                                        <input
                                            ref={numberInputRef}
                                            type="tel"
                                            maxLength={10}
                                            placeholder={requireCustomerMobile ? "Phone Number *" : "Phone Number"}
                                            value={addressType === 'billing' ? partyNumber : shippingNumber}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                if (addressType === 'billing') { handleInputChange(val, 'number'); }
                                                else { setShippingNumber(val); setIsSameAsBilling(false); }
                                            }}
                                            onFocus={() => { if (isSale && addressType === 'billing' && partyNumber.length >= 3) searchParty(partyNumber, 'number'); }}
                                            className={`w-full bg-muted p-2 md:p-3 text-xs md:text-sm rounded-xs border ${requireCustomerMobile && !partyNumber && addressType === 'billing' ? 'border-red-300 focus:border-red-500' : 'border-border focus:border-blue-500'} focus:ring-2 focus:ring-blue-100 outline-none`}
                                            autoComplete="off"
                                        />
                                        {requireCustomerMobile && addressType === 'billing' && <span className="absolute right-2 top-2 md:right-3 md:top-3 text-red-500 font-bold">*</span>}
                                    </div>

                                    <div className={`relative ${mode === 'purchase' ? 'order-1' : 'order-2'}`}>
                                        <input
                                            ref={nameInputRef}
                                            type="text"
                                            placeholder={requireCustomerName ? `${partyLabel} Name *` : `${partyLabel} Name`}
                                            value={addressType === 'billing' ? partyName : shippingName}
                                            onChange={(e) => {
                                                if (addressType === 'billing') { handleInputChange(e.target.value, 'name'); }
                                                else { setShippingName(e.target.value); setIsSameAsBilling(false); }
                                            }}
                                            onFocus={() => { if (!isSale && addressType === 'billing' && partyName.length >= 3) searchParty(partyName, 'name'); }}
                                            className={`w-full bg-muted p-2 md:p-3 text-xs md:text-sm rounded-xs border ${requireCustomerName && !partyName && addressType === 'billing' ? '' : 'border-border focus:border-blue-500'} focus:ring-2 focus:ring-blue-100 outline-none`}
                                            autoComplete="off"
                                        />
                                        {requireCustomerName && addressType === 'billing' && <span className="absolute right-2 top-2 md:right-3 md:top-3 text-red-500 font-bold">*</span>}
                                    </div>
                                    {addressType === 'billing' && renderSuggestions()}
                                </div>

                                {!isCalculator && (
                                    <div className="pt-1 md:pt-2 flex flex-col gap-1.5 md:gap-1 w-full">
                                        <div className="flex items-center justify-between w-full">
                                            <div onClick={() => setIsDetailsExpanded(!isDetailsExpanded)} className="flex items-center justify-start cursor-pointer text-blue-600 hover:text-blue-700 transition-colors text-[10px] md:text-xs font-semibold select-none">
                                                <span>{isDetailsExpanded ? '-' : '+'} GST & Address</span>
                                            </div>
                                            {isSale && enableNarration && (
                                                <div onClick={() => setIsNarrationExpanded(!isNarrationExpanded)} className="flex items-center justify-start cursor-pointer text-muted-foreground hover:text-foreground transition-colors text-[10px] md:text-xs font-semibold select-none">
                                                    <span>{isNarrationExpanded ? '- ' : '+'} Narration</span>
                                                </div>
                                            )}
                                            {isSale && enableExtraExpense && (
                                                <div onClick={() => setExpenses(prev => [...prev, { id: Date.now(), name: '', amount: '' }])} className="flex items-center justify-end cursor-pointer text-orange-600 hover:text-orange-700 transition-colors text-[10px] md:text-xs font-semibold select-none">
                                                    <span>+ Expense</span>
                                                </div>
                                            )}
                                            {enableTransportDetails && (
                                                <div onClick={() => setShowTransportModal(true)} className="flex items-center justify-end cursor-pointer text-teal-600 hover:text-teal-700 transition-colors text-[10px] md:text-xs font-semibold select-none">
                                                    <span>{hasTransportDetails ? '✓ Transport Details' : '+ Transport Details'}</span>
                                                </div>
                                            )}
                                        </div>

                                        {isDetailsExpanded && (
                                            <div className="flex flex-col gap-2 md:gap-3 mt-1.5 md:mt-3 animate-in slide-in-from-top-2 fade-in duration-200">
                                                <input type="text" placeholder="GST Number" maxLength={15} value={addressType === 'billing' ? partyGST : shippingGST} onChange={(e) => { if (addressType === 'billing') { setPartyGST(e.target.value); } else { setShippingGST(e.target.value); setIsSameAsBilling(false); } }} className="w-full p-2 text-xs md:text-sm rounded-xs border border-border bg-muted focus:border-blue-500 outline-none" />
                                                <div className="flex gap-2 w-full">
                                                    <input type="text" placeholder="Full Address" value={addressType === 'billing' ? partyAddress : shippingAddress} onChange={(e) => { if (addressType === 'billing') { setPartyAddress(e.target.value); } else { setShippingAddress(e.target.value); setIsSameAsBilling(false); } }} className="flex-1 p-2 text-xs md:text-sm rounded-xs border border-border bg-muted focus:border-blue-500 outline-none" />
                                                    <select value={addressType === 'billing' ? partyState : shippingState} onChange={(e) => { if (addressType === 'billing') { setPartyState(e.target.value); } else { setShippingState(e.target.value); setIsSameAsBilling(false); } }} className="w-1/3 p-2 text-xs md:text-sm rounded-xs border border-border bg-muted focus:border-blue-500 outline-none">
                                                        <option value="">State</option>
                                                        {INDIAN_STATES.map(state => (<option key={state} value={state}>{state}</option>))}
                                                    </select>
                                                </div>
                                            </div>
                                        )}

                                        {expenses.length > 0 && (
                                            <div className="flex flex-col gap-1.5 md:gap-2 mt-1.5 md:mt-3 animate-in slide-in-from-top-2 fade-in duration-200">
                                                {expenses.map((expense) => (
                                                    <div key={expense.id} className="flex items-center gap-1.5 md:gap-2 p-1.5 min-w-0 bg-orange-50 rounded-xs border border-orange-100">
                                                        <input type="text" placeholder="Expense Name" value={expense.name} onChange={(e) => setExpenses(prev => prev.map(ex => ex.id === expense.id ? { ...ex, name: e.target.value } : ex))} className="flex-1 min-w-0 p-2 text-xs md:text-sm rounded-xs border border-orange-200 bg-card focus:border-orange-500 outline-none" />
                                                        <input type="number" placeholder="Amt (₹)" value={expense.amount} onChange={(e) => setExpenses(prev => prev.map(ex => ex.id === expense.id ? { ...ex, amount: parseFloat(e.target.value) || '' } : ex))} className="w-20 min-w-0 md:w-28 p-2 text-xs md:text-sm rounded-xs border border-orange-200 bg-card focus:border-orange-500 outline-none" />
                                                        <button onClick={() => setExpenses(prev => prev.filter(ex => ex.id !== expense.id))} className="p-1 md:p-1.5 rounded-full bg-orange-100 hover:bg-red-100 text-orange-400 hover:text-red-500 transition-colors flex-shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {isNarrationExpanded && (
                                            <div className="mt-1.5 md:mt-2 animate-in slide-in-from-top-2 fade-in duration-200">
                                                <textarea placeholder="Enter narration or remarks..." value={narration} onChange={(e) => setNarration(e.target.value)} className="w-full p-2 text-xs md:text-sm rounded-xs border border-border bg-muted focus:border-blue-500 outline-none resize-none" rows={2} />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Available Balances */}
                            {(partyCredit > 0 || partyDebit > 0) && (
                                <div className="px-2 md:px-5 pb-1 md:pb-3">
                                    <h3 className="text-[9px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 md:mb-1">Available Balances</h3>
                                    {partyCredit > 0 && (
                                        <div className="flex items-center justify-between p-1 md:p-3 bg-green-50 border border-green-100 rounded-xs mb-1.5 md:mb-2">
                                            <span className="text-[10px] md:text-sm font-semibold text-green-800">Credit Note</span>
                                            <span className="text-[8px] md:text-xs text-green-600 mx-auto ml-2">Avail: ₹{partyCredit.toFixed(2)}</span>
                                            <label className="flex items-center gap-1.5 md:gap-2 cursor-pointer ml-2">
                                                <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} className="w-3.5 h-3.5 md:w-5 md:h-5 text-green-600 rounded focus:ring-green-500 border-border" />
                                                <span className="text-[10px] md:text-sm font-medium text-foreground">Apply</span>
                                            </label>
                                        </div>
                                    )}
                                    {partyDebit > 0 && (
                                        <div className="flex items-center justify-between p-2 md:p-3 bg-red-50 border border-red-100 rounded-xs">
                                            <span className="text-[10px] md:text-sm font-semibold text-red-800">Debit Balance</span>
                                            <span className="text-[8px] md:text-xs text-red-600 mx-auto ml-2">Avail: ₹{partyDebit.toFixed(2)}</span>
                                            <label className="flex items-center gap-1.5 md:gap-2 cursor-pointer ml-2">
                                                <input type="checkbox" checked={useDebit} onChange={(e) => setUseDebit(e.target.checked)} className="w-3.5 h-3.5 md:w-5 md:h-5 text-red-600 rounded focus:ring-red-500 border-border" />
                                                <span className="text-[10px] md:text-sm font-medium text-foreground">Apply</span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* RIGHT COLUMN: Transaction Type */}
                    <div className={`p-2 md:p-4 bg-muted flex flex-col justify-center border-t md:border-t-0 ${enableCustomerDetails ? 'md:w-1/2' : 'w-full'}`}>
                        <h3 className="text-[10px] md:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 md:mb-3">
                            Transaction Type
                        </h3>
                        <div className="grid grid-cols-2 gap-6">
                            {transactiontypes.map((mode) => {
                                const isDueField = mode.id.toLowerCase().includes('due') || mode.name.toLowerCase().includes('due');
                                const isDisabled = isPurchaseReturnMode ? false : (isSale && isDueField && !allowDueBilling);

                                return (
                                    <FloatingLabelInput
                                        key={mode.id}
                                        id={mode.id}
                                        label={isDisabled ? `${mode.name}` : mode.name}
                                        value={selectedPayments[mode.id]?.toString() || ''}
                                        onChange={(e) => { if (!isDisabled) handleAmountChange(mode.id, e.target.value); }}
                                        onFill={() => { if (!isDisabled) handleFillRemaining(mode.id); }}
                                        showFillButton={pendingAmount > 0.01 && !isDisabled}
                                        className={`
                                            h-10 min-h-[50px] text-xs rounded-xs transition-colors shadow-sm
                                            [&_button]:text-[9px] [&_button]:px-2 [&_button]:py-0.5 [&_button]:h-auto [&_button]:rounded-[3px] [&_button]:tracking-wider
                                            [&_input]:text-xs [&_input]:font-bold [&_label]:text-[10px]
                                            ${isDisabled
                                                ? 'bg-muted cursor-not-allowed opacity-60 pointer-events-none'
                                                : 'bg-card'
                                            }
                                        `}
                                        disabled={isDisabled}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer Totals & Summary Box */}
                <div className="p-2 md:px-4 md:py-3 bg-muted border-t border-border rounded-b-xs shadow-[0_-4px_15px_rgba(0,0,0,0.05)] z-20">
                    {/* MOBILE LAYOUT */}
                    <div
                        className="md:hidden flex justify-between items-center mb-1.5 px-1"
                        onMouseDown={handleDiscountPressStart}
                        onMouseUp={handleDiscountPressEnd}
                        onMouseLeave={handleDiscountPressEnd}
                        onTouchStart={handleDiscountPressStart}
                        onTouchEnd={handleDiscountPressEnd}
                        onClick={handleDiscountClick}
                    >
                        <div className="flex items-center gap-1.5">
                            <span className={`text-muted-foreground text-[11px] ${isDiscountLocked ? '' : 'text-blue-600 font-semibold'}`}>
                                Bill Discount
                            </span>
                            {isDiscountLocked && (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                </svg>
                            )}
                            {discountInfo && (
                                <span className="text-[10px] text-red-500 bg-red-50 px-1 rounded animate-pulse">
                                    {discountInfo}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="relative flex items-center">
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={discountPercent || ''}
                                    onChange={handleDiscountPercentChange}
                                    readOnly={isDiscountLocked}
                                    className={`w-10 text-center text-[11px] bg-red-100 rounded-xs text-red-800 focus:outline-none pr-3 py-0.5 ${isDiscountLocked ? 'cursor-not-allowed' : 'border-b border-blue-300 font-semibold'}`}
                                />
                                <span className="absolute right-1 text-[10px] text-red-400 font-bold pointer-events-none">%</span>
                            </div>
                            <span className="text-gray-300 text-[10px] mx-0.5">|</span>
                            <div className="relative flex items-center">
                                <span className="absolute left-1 text-[10px] text-red-400 font-bold pointer-events-none">₹</span>
                                <input
                                    id="discount-mobile"
                                    type="number"
                                    placeholder="0"
                                    value={discount || ''}
                                    onChange={handleDiscountAmountChange}
                                    readOnly={isDiscountLocked}
                                    className={`w-12 text-center text-[11px] bg-red-100 rounded-xs text-red-800 focus:outline-none pl-3 py-0.5 ${isDiscountLocked ? 'cursor-not-allowed' : 'border-b border-blue-300 font-semibold'}`}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="md:hidden pt-1.5 border-t border-border">
                        <div className="flex justify-between items-center mb-1 px-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tax Type</span>
                            <div className="flex bg-muted p-0.5 rounded-xs shadow-inner">
                                <button onClick={() => onTaxModeChange && onTaxModeChange('exempt')} disabled={isTaxToggleLocked} className={`px-4 py-1 text-[10px] font-bold rounded-xs shadow-sm transition-all ${taxMode === 'exempt' ? 'bg-blue-500 text-white' : 'text-muted-foreground hover:text-foreground'} ${isTaxToggleLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>Exempt</button>
                                <button onClick={() => onTaxModeChange && onTaxModeChange('inclusive')} disabled={isTaxToggleLocked} className={`px-4 py-0.5 text-[10px] font-bold rounded-xs shadow-sm transition-all ${taxMode === 'inclusive' ? 'bg-blue-500 text-white' : 'text-muted-foreground hover:text-foreground'} ${isTaxToggleLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>Inclusive</button>
                                <button onClick={() => onTaxModeChange && onTaxModeChange('exclusive')} disabled={isTaxToggleLocked} className={`px-4 py-0.5 text-[10px] font-bold rounded-xs shadow-sm transition-all ${taxMode === 'exclusive' ? 'bg-blue-500 text-white' : 'text-muted-foreground hover:text-foreground'} ${isTaxToggleLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>Exclusive</button>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1 mb-1 px-1">
                            <div className="flex justify-start items-center min-h-[16px]">
                                {changeToReturn > 0.01 ? (
                                    <span className="text-[10px] font-bold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-xs border border-yellow-100">Return: ₹{changeToReturn.toFixed(2)}</span>
                                ) : (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-xs border ${pendingAmount < 0.01 ? 'text-green-700 bg-green-50 border-green-100' : 'text-red-600 bg-red-50 border-red-100'}`}>
                                        {pendingAmount < 0.01 ? 'Fully Paid' : `Due: ₹${pendingAmount.toFixed(2)}`}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center justify-between bg-card rounded-xs border border-border shadow-sm text-center">
                                <div className="flex flex-col items-center flex-1">
                                    <span className="text-[9px] text-muted-foreground font-bold uppercase mb-0.5 leading-none">MRP</span>
                                    <span className="text-[11px] font-bold text-foreground leading-none">₹{totalMrp.toFixed(0)}</span>
                                </div>
                                <div className="flex flex-col items-center flex-1 border-r border-border pr-1">
                                    <span className="text-[9px] text-muted-foreground font-bold uppercase mb-0.5 leading-none">Disc</span>
                                    <span className="text-[11px] font-bold text-red-500 leading-none">-₹{(totalItemDiscount + discount).toFixed(0)}</span>
                                </div>
                                <div className="bg-blue-600 text-white rounded-xs py-1.5 px-3 flex flex-col items-center justify-center shadow-sm mx-1.5">
                                    <span className="text-[8px] font-bold uppercase tracking-wider text-blue-200 mb-0.5 leading-none">Total</span>
                                    <span className="font-extrabold text-lg tracking-tight leading-none">₹{netPayable.toFixed(0)}</span>
                                </div>
                                <div className="flex flex-col items-center flex-1 border-l border-border pl-1">
                                    <span className="text-[9px] text-muted-foreground font-bold uppercase mb-0.5 leading-none">Sub</span>
                                    <span className="text-[11px] font-bold text-foreground leading-none">₹{Math.max(0, netPayable - liveTax).toFixed(0)}</span>
                                </div>
                                <div className="flex flex-col items-center flex-1">
                                    <span className="text-[9px] text-muted-foreground font-bold uppercase mb-0.5 leading-none">Tax</span>
                                    <span className="text-[11px] font-bold text-foreground leading-none">+₹{liveTax.toFixed(0)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* DESKTOP LAYOUT */}
                    <div className="hidden md:flex md:flex-col md:gap-2">
                        <div className="flex items-center justify-between gap-4">
                            <div
                                className="flex items-center gap-3 cursor-pointer"
                                onMouseDown={handleDiscountPressStart}
                                onMouseUp={handleDiscountPressEnd}
                                onMouseLeave={handleDiscountPressEnd}
                                onClick={handleDiscountClick}
                            >
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-1 mb-1">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Bill Discount</span>
                                        {isDiscountLocked && (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                        {discountInfo && (
                                            <span className="text-[10px] text-red-500 bg-red-50 px-1 rounded animate-pulse">{discountInfo}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex items-center bg-red-50 border border-red-200 rounded px-2 py-1">
                                            <input
                                                type="number"
                                                placeholder="0"
                                                value={discountPercent || ''}
                                                onChange={handleDiscountPercentChange}
                                                readOnly={isDiscountLocked}
                                                className={`w-10 text-center text-xs bg-transparent text-red-800 focus:outline-none pr-3 ${isDiscountLocked ? 'cursor-not-allowed' : 'font-semibold'}`}
                                            />
                                            <span className="absolute right-1.5 text-[10px] text-red-400 font-bold pointer-events-none">%</span>
                                        </div>
                                        <div className="relative flex items-center bg-red-50 border border-red-200 rounded px-2 py-1">
                                            <span className="absolute left-1.5 text-[10px] text-red-400 font-bold pointer-events-none">₹</span>
                                            <input
                                                id="discount"
                                                type="number"
                                                placeholder="0"
                                                value={discount || ''}
                                                onChange={handleDiscountAmountChange}
                                                readOnly={isDiscountLocked}
                                                className={`w-14 text-center text-xs bg-transparent text-red-800 focus:outline-none pl-3 ${isDiscountLocked ? 'cursor-not-allowed' : 'font-semibold'}`}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Tax Type</span>
                                <div className="flex items-center gap-1">
                                    {(['exempt', 'inclusive', 'exclusive'] as const).map((mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => onTaxModeChange && onTaxModeChange(mode)}
                                            disabled={isTaxToggleLocked}
                                            className={`
                                                px-4 py-[7px] text-xs font-bold rounded border transition-all
                                                ${taxMode === mode
                                                    ? 'bg-blue-500 border-blue-500 text-white shadow-sm'
                                                    : 'bg-muted border-border text-muted-foreground hover:border-border hover:text-foreground'
                                                }
                                                ${isTaxToggleLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                            `}
                                        >
                                            {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between bg-card rounded-xs border border-border shadow-sm text-center">
                            <div className="flex flex-col items-center flex-1 py-1.5">
                                <span className="text-[9px] text-muted-foreground font-bold uppercase mb-0.5 leading-none">MRP</span>
                                <span className="text-[12px] font-bold text-foreground leading-none">₹{totalMrp.toFixed(0)}</span>
                            </div>
                            <div className="flex flex-col items-center flex-1 border-r border-border py-1.5">
                                <span className="text-[9px] text-muted-foreground font-bold uppercase mb-0.5 leading-none">Disc</span>
                                <span className="text-[12px] font-bold text-red-500 leading-none">-₹{(totalItemDiscount + discount).toFixed(0)}</span>
                            </div>
                            <div className="bg-blue-600 text-white rounded-xs py-2 px-5 flex flex-col items-center justify-center shadow-sm mx-2">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-blue-200 mb-0.5 leading-none">Total</span>
                                <span className="font-extrabold text-xl tracking-tight leading-none">₹{netPayable.toFixed(0)}</span>
                            </div>
                            <div className="flex flex-col items-center flex-1 border-l border-border py-1.5">
                                <span className="text-[9px] text-muted-foreground font-bold uppercase mb-0.5 leading-none">Sub</span>
                                <span className="text-[12px] font-bold text-foreground leading-none">₹{Math.max(0, netPayable - liveTax).toFixed(0)}</span>
                            </div>
                            <div className="flex flex-col items-center flex-1 py-1.5">
                                <span className="text-[9px] text-muted-foreground font-bold uppercase mb-0.5 leading-none">Tax</span>
                                <span className="text-[12px] font-bold text-foreground leading-none">+₹{liveTax.toFixed(0)}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {changeToReturn > 0.01 ? (
                                <span className="text-[11px] font-bold text-yellow-700 bg-yellow-50 px-3 py-1.5 rounded-xs border border-yellow-100 whitespace-nowrap">
                                    Return: ₹{changeToReturn.toFixed(2)}
                                </span>
                            ) : (
                                <span className={`text-[11px] font-bold px-3 py-1.5 rounded-xs border whitespace-nowrap ${pendingAmount < 0.01 ? 'text-green-700 bg-green-50 border-green-100' : 'text-red-600 bg-red-50 border-red-100'}`}>
                                    {pendingAmount < 0.01 ? 'Fully Paid' : `Due: ₹${pendingAmount.toFixed(2)}`}
                                </span>
                            )}
                            <button
                                onClick={handleConfirm}
                                disabled={isSubmitting || pendingAmount > 0.01}
                                className="flex-1 py-3 text-white rounded-xs font-bold text-sm shadow active:scale-[0.98] transition-all disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                style={{ backgroundColor: pendingAmount < 0.01 ? '#0ea5e9' : '#94a3b8' }}
                            >
                                {isSubmitting ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>...</>) : ("Confirm Payment")}
                            </button>
                        </div>
                    </div>

                    {/* Mobile Confirm Button */}
                    <button onClick={handleConfirm} disabled={isSubmitting || pendingAmount > 0.01} className="md:hidden w-full py-3 text-white rounded-xs font-bold text-sm shadow active:scale-[0.98] transition-all disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1" style={{ backgroundColor: pendingAmount < 0.01 ? '#0ea5e9' : '#94a3b8' }}>
                        {isSubmitting ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>...</>) : ("Confirm Payment")}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default PaymentDrawer;