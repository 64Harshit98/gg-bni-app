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
}

interface PaymentDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    subtotal: number;        // Net Amount (after item discount)
    totalQuantity?: number;
    totalItemDiscount?: number;
    onPaymentComplete: (data: PaymentCompletionData) => Promise<void>;
    isPartyNameEditable?: boolean;
    initialPartyName?: string;
    initialPartyNumber?: string;
    initialPaymentMethods?: PaymentDetails | { [key: string]: any };
}

const LOCAL_STORAGE_NAME_KEY = 'lastPartyName';
const LOCAL_STORAGE_NUMBER_KEY = 'lastPartyNumber';

interface CustomerSuggestion {
    name: string;
    number: string;
    address?: string;
    gstNumber?: string;
    creditBalance?: number;
    debitBalance?: number;
}

const PaymentDrawer: React.FC<PaymentDrawerProps> = ({
    isOpen,
    onClose,
    subtotal,
    totalQuantity = 0,
    totalItemDiscount = 0,
    onPaymentComplete,
    initialPartyName,
    initialPartyNumber,
    initialPaymentMethods,
}) => {
    const { currentUser } = useAuth();

    // --- STATE ---
    const [partyName, setPartyName] = useState('');
    const [partyNumber, setPartyNumber] = useState('');
    const [partyAddress, setPartyAddress] = useState('');
    const [partyGST, setPartyGST] = useState('');
    const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
    const [discount, setDiscount] = useState(0);
    const [customerCredit, setCustomerCredit] = useState(0);
    const [customerDebit, setCustomerDebit] = useState(0);
    const [useCredit, setUseCredit] = useState(false);
    const [useDebit, setUseDebit] = useState(false);
    const [selectedPayments, setSelectedPayments] = useState<PaymentDetails>({});
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDiscountLocked, setIsDiscountLocked] = useState(true);

    const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeout = useRef<NodeJS.Timeout | null>(null);

    const shouldSaveToLocalStorage = useRef(true);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const [discountInfo, setDiscountInfo] = useState<string | null>(null);

    // --- CALCULATIONS ---
    
    // 1. Gross Subtotal (Visual only) = Net Subtotal + Item Discounts
    const displayGrossSubtotal = useMemo(() => {
        return subtotal + totalItemDiscount;
    }, [subtotal, totalItemDiscount]);

    // 2. Final Payable (Logic)
    const finalPayableAmount = useMemo(() => {
        let payable = subtotal - discount;
        if (useCredit) payable -= Math.min(payable, customerCredit);
        if (useDebit) payable -= Math.min(payable, customerDebit);
        return parseFloat(Math.max(0, payable).toFixed(2));
    }, [subtotal, discount, useCredit, customerCredit, useDebit, customerDebit]);

    // Logic: Credits applied
    const appliedCredit = useMemo(() => {
        if (!useCredit || customerCredit <= 0) return 0;
        return Math.min(subtotal - discount, customerCredit);
    }, [useCredit, customerCredit, subtotal, discount]);

    const appliedDebit = useMemo(() => {
        if (!useDebit || customerDebit <= 0) return 0;
        return Math.min(subtotal - discount - appliedCredit, customerDebit);
    }, [useDebit, customerDebit, subtotal, discount, appliedCredit]);

    const totalEnteredAmount = useMemo(() => {
        const sum = Object.values(selectedPayments).reduce((acc, amount) => acc + (amount || 0), 0);
        return parseFloat(sum.toFixed(2));
    }, [selectedPayments]);

    const changeToReturn = useMemo(() => {
        const diff = totalEnteredAmount - finalPayableAmount;
        return diff > 0.01 ? parseFloat(diff.toFixed(2)) : 0;
    }, [totalEnteredAmount, finalPayableAmount]);

    const pendingAmount = useMemo(() => {
        const diff = finalPayableAmount - totalEnteredAmount;
        return diff > 0.01 ? parseFloat(diff.toFixed(2)) : 0;
    }, [finalPayableAmount, totalEnteredAmount]);

    // --- EFFECTS ---
    useEffect(() => {
        if (!isOpen) return;
        shouldSaveToLocalStorage.current = true;
        setIsSubmitting(false);
        setDiscount(0);
        setIsDiscountLocked(true);
        setCustomerCredit(0);
        setUseCredit(false);
        setCustomerDebit(0);
        setUseDebit(false);
        setSuggestions([]);
        setShowSuggestions(false);

        let initialName = initialPartyName || '';
        let initialNumber = initialPartyNumber || '';

        if (!initialName && !initialNumber) {
            try {
                initialName = localStorage.getItem(LOCAL_STORAGE_NAME_KEY) || '';
                initialNumber = localStorage.getItem(LOCAL_STORAGE_NUMBER_KEY) || '';
            } catch (e) { }
        }

        if (initialPaymentMethods && Object.keys(initialPaymentMethods).length > 0) {
            const loadedPayments: PaymentDetails = {};
            Object.entries(initialPaymentMethods).forEach(([key, value]) => {
                if (key === 'due') return;
                const numVal = Number(value);
                if (!isNaN(numVal) && numVal > 0) loadedPayments[key] = numVal;
            });
            setSelectedPayments(loadedPayments);
        } else {
            setSelectedPayments({});
        }

        setPartyName(initialName);
        setPartyNumber(initialNumber);
        setPartyAddress('');
        setPartyGST('');
        setIsDetailsExpanded(false);
        
        if (initialNumber) searchCustomer(initialNumber, 'number');
    }, [isOpen]); 

    useEffect(() => {
        if (isOpen && !isSubmitting && shouldSaveToLocalStorage.current) {
            try {
                if (partyName) localStorage.setItem(LOCAL_STORAGE_NAME_KEY, partyName);
                if (partyNumber) localStorage.setItem(LOCAL_STORAGE_NUMBER_KEY, partyNumber);
            } catch (e) { }
        }
    }, [partyName, partyNumber, isOpen, isSubmitting]);

    // --- SEARCH LOGIC ---
    const searchCustomer = async (term: string, type: 'name' | 'number') => {
        if (!term || term.length < 3 || !currentUser?.companyId) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        const companyId = currentUser.companyId;
        const customersRef = collection(db, 'companies', companyId, 'customers');
        let q;
        if (type === 'number') {
            q = query(customersRef, where('number', '>=', term), where('number', '<=', term + '\uf8ff'), limit(5));
        } else {
            q = query(customersRef, where('name', '>=', term), where('name', '<=', term + '\uf8ff'), limit(5));
        }
        try {
            const snapshot = await getDocs(q);
            const results: CustomerSuggestion[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                results.push({
                    name: data.name || '',
                    number: data.number || doc.id,
                    address: data.address,
                    gstNumber: data.gstNumber,
                    creditBalance: data.creditBalance,
                    debitBalance: data.debitBalance
                });
            });
            setSuggestions(results);
            setShowSuggestions(results.length > 0);
        } catch (err) { console.error(err); }
    };

    const handleInputChange = (value: string, type: 'name' | 'number') => {
        if (type === 'name') setPartyName(value);
        else setPartyNumber(value);

        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => { searchCustomer(value, type); }, 400);
    };

    const selectCustomer = (customer: CustomerSuggestion) => {
        setPartyName(customer.name);
        setPartyNumber(customer.number);
        setPartyAddress(customer.address || '');
        setPartyGST(customer.gstNumber || '');
        
        if ((customer.creditBalance || 0) > 0) { setCustomerCredit(customer.creditBalance!); setUseCredit(true); } 
        else { setCustomerCredit(0); setUseCredit(false); }

        if ((customer.debitBalance || 0) > 0) { setCustomerDebit(customer.debitBalance!); setUseDebit(true); } 
        else { setCustomerDebit(0); setUseDebit(false); }
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

    // --- SUBMIT LOGIC ---
    const handleConfirm = async () => {
        if (pendingAmount > 0.01) {
            setModal({ message: `Mismatch: ₹${pendingAmount.toFixed(2)} remaining.`, type: State.ERROR });
            return;
        }
        let revDiscount = 0;
        if (changeToReturn > 0.01) revDiscount = changeToReturn;

        const payloadToSave: PaymentDetails = {};
        transactiontypes.forEach((t) => { payloadToSave[t.id] = 0; });
        if (initialPaymentMethods) {
            Object.keys(initialPaymentMethods).forEach((key) => { if (key !== 'due') payloadToSave[key] = 0; });
        }
        Object.entries(selectedPayments).forEach(([key, value]) => { payloadToSave[key] = value; });

        setIsSubmitting(true);
        shouldSaveToLocalStorage.current = false; 

        try {
            // 1. Proceed with payment callback
            await onPaymentComplete({
                paymentDetails: payloadToSave,
                partyName, partyNumber, discount,
                finalAmount: finalPayableAmount,
                appliedCredit, appliedDebit, partyAddress, partyGST, revDiscount,
            });

            // 2. Save Customer to DB (Robust Check)
            if (currentUser?.companyId && partyNumber && partyNumber.trim().length > 0) {
                const cleanNumber = partyNumber.trim();
                const customerDocRef = doc(db, 'companies', currentUser.companyId, 'customers', cleanNumber);
                
                const customerData: any = {
                    name: partyName.trim(), number: cleanNumber, companyId: currentUser.companyId,
                    lastSaleAt: serverTimestamp(), address: partyAddress.trim(), gstNumber: partyGST.trim(),
                };
                if (appliedCredit > 0) customerData.creditBalance = firebaseIncrement(-appliedCredit);
                if (appliedDebit > 0) customerData.debitBalance = firebaseIncrement(-appliedDebit);
                
                await setDoc(customerDocRef, customerData, { merge: true });
            }

            try {
                localStorage.removeItem(LOCAL_STORAGE_NAME_KEY);
                localStorage.removeItem(LOCAL_STORAGE_NUMBER_KEY);
            } catch (e) {}
            setPartyName(''); setPartyNumber(''); setSelectedPayments({});
        } catch (error) {
            setModal({ message: (error as Error).message || 'Failed to save.', type: State.ERROR });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDiscountPressStart = () => longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500);
    const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
    const handleDiscountClick = () => { if (isDiscountLocked) { setDiscountInfo("Cannot edit discount"); setTimeout(() => setDiscountInfo(null), 3000); } };
    const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => { setDiscount(parseFloat(e.target.value) || 0); };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />

            {modal && <div className="absolute z-[10000]"><Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} /></div>}
            
            <div 
                className="relative w-full max-w-lg bg-gray-50 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col transform transition-transform duration-300 ease-out animate-slide-up"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
            >
                <div className="p-3 bg-white rounded-t-2xl border-b border-gray-200 sticky top-0 z-10 flex items-center justify-center relative shadow-sm">
                    <div className="w-10 h-1 bg-gray-300 rounded-full absolute top-2"></div>
                    <button onClick={onClose} className="absolute left-4 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                    <h2 className="text-lg font-semibold text-gray-800 mt-2">Payment Details</h2>
                </div>

                {/* SCROLLABLE CONTENT */}
                <div className="flex-1 overflow-y-auto overscroll-y-contain bg-white">
                    
                    {/* CUSTOMER INFO */}
                    <div className="p-4 space-y-2">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Customer Info</h3>
                        <div className="grid grid-cols-2 gap-4 relative">
                            <input
                                type="number" placeholder="Phone Number" value={partyNumber}
                                onChange={(e) => handleInputChange(e.target.value, 'number')}
                                onFocus={() => { if(partyNumber.length >=3) searchCustomer(partyNumber, 'number'); }}
                                className="w-full bg-gray-50 p-3 text-sm rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                                autoComplete="off"
                            />
                            <input
                                type="text" placeholder="Name (Optional)" value={partyName}
                                onChange={(e) => handleInputChange(e.target.value, 'name')}
                                onFocus={() => { if(partyName.length >=3) searchCustomer(partyName, 'name'); }}
                                className="w-full bg-gray-50 p-3 text-sm rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                                autoComplete="off"
                            />
                            {/* Suggestions */}
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 shadow-xl rounded-lg mt-1 max-h-48 overflow-y-auto">
                                    {suggestions.map((customer, idx) => (
                                        <div key={idx} className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 text-sm flex justify-between items-center" onClick={() => selectCustomer(customer)}>
                                            <div><div className="font-bold text-gray-800">{customer.name}</div><div className="text-xs text-gray-500">{customer.number}</div></div>
                                            {customer.creditBalance && customer.creditBalance > 0 && (<span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">Credit: ₹{customer.creditBalance}</span>)}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="pt-1">
                             <div onClick={() => setIsDetailsExpanded(!isDetailsExpanded)} className="flex items-center justify-start cursor-pointer text-blue-600 hover:text-blue-700 transition-colors text-xs font-semibold select-none">
                                <span>{isDetailsExpanded ? 'Hide' : '+ Add'} GST & Address</span>
                            </div>
                            {isDetailsExpanded && (
                                <div className="grid grid-cols-2 gap-3 mt-3 animate-in slide-in-from-top-2 fade-in duration-200">
                                    <input type="text" placeholder="GST Number" value={partyGST} onChange={(e) => setPartyGST(e.target.value)} className="w-full p-2.5 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:border-blue-500 outline-none" />
                                    <input type="text" placeholder="Address" value={partyAddress} onChange={(e) => setPartyAddress(e.target.value)} className="w-full p-2.5 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:border-blue-500 outline-none" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* TRANSACTION TYPE */}
                    <div className="p-4 bg-gray-100">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Transaction Type</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
                            {transactiontypes.map((mode) => (
                                <FloatingLabelInput
                                    key={mode.id}
                                    id={mode.id}
                                    label={mode.name}
                                    value={selectedPayments[mode.id]?.toString() || ''}
                                    onChange={(e) => handleAmountChange(mode.id, e.target.value)}
                                    onFill={() => handleFillRemaining(mode.id)}
                                    showFillButton={pendingAmount > 0.01}
                                    className=""
                                />
                            ))}
                        </div>
                    </div>
                </div>
                
                {/* --- FOOTER SUMMARY --- */}
                <div className="p-5 bg-white border-t border-gray-200 rounded-b-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">
                    
                    <div className="flex justify-between items-center mb-1.5 text-sm text-gray-500">
                        <span>Qty: <strong className="text-gray-800">{totalQuantity}</strong></span>
                        <div className="flex items-center gap-2">
                            <span>Subtotal:</span>
                            {/* VISUAL LOGIC: Show Gross Subtotal (Net + Item Discount) to match visual expectations */}
                            <span className="font-medium text-gray-800">₹{displayGrossSubtotal.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center mb-4 text-sm"
                         onMouseDown={handleDiscountPressStart} onMouseUp={handleDiscountPressEnd} onMouseLeave={handleDiscountPressEnd} onTouchStart={handleDiscountPressStart} onTouchEnd={handleDiscountPressEnd} onClick={handleDiscountClick}>
                        <div className="flex items-center gap-2">
                             <span className={`text-gray-500 ${isDiscountLocked ? '' : 'text-blue-600 font-semibold'}`}>Bill Discount (₹)</span>
                             {isDiscountLocked && <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>}
                             {discountInfo && <span className="text-xs text-red-500 bg-red-50 px-1 rounded animate-pulse">{discountInfo}</span>}
                        </div>
                        <input 
                            id="discount" type="number" placeholder="0" 
                            value={discount || ''} onChange={handleDiscountChange} readOnly={isDiscountLocked} 
                            className={`w-20 text-right bg-transparent text-gray-800 focus:outline-none ${isDiscountLocked ? 'cursor-not-allowed' : 'border-b border-blue-300 font-semibold'}`} 
                        />
                    </div>

                    <div className="flex justify-between items-center mb-4 min-h-[24px]">
                        {/* Status Badge */}
                        <div>
                            {changeToReturn > 0.01 ? (
                                <span className="text-sm font-bold text-yellow-700 bg-yellow-50 px-2 py-1 rounded border border-yellow-100">Return: ₹{changeToReturn.toFixed(2)}</span>
                            ) : (
                                <span className={`text-sm font-bold ${pendingAmount < 0.01 ? 'text-green-600' : 'text-red-500'}`}>
                                   {pendingAmount < 0.01 ? 'Paid' : `Due: ₹${pendingAmount.toFixed(2)}`}
                                </span>
                            )}
                        </div>

                        {/* Item Discount Label */}
                        {totalItemDiscount > 0 && (
                             <span className="text-xs text-green-600 font-medium">Item Disc: -₹{totalItemDiscount.toFixed(2)}</span>
                        )}
                    </div>

                    <div className="flex justify-center items-center mb-4 mt-2">
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Total Payable</span>
                            <span className="text-3xl font-extrabold text-blue-600">₹{finalPayableAmount.toFixed(2)}</span>
                        </div>
                    </div>

                    <button
                            onClick={handleConfirm}
                            disabled={isSubmitting || pendingAmount > 0.01}
                            className="w-full py-3.5 text-white rounded-lg font-bold text-lg shadow active:scale-[0.98] transition-all disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            style={{ backgroundColor: pendingAmount < 0.01 ? '#0ea5e9' : '#94a3b8' }} // Blue if paid, Gray if due
                        >
                            {isSubmitting ? (
                                <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Processing...</>
                            ) : (
                                "Confirm Payment"
                            )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default PaymentDrawer;