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
    mode?: 'sale' | 'purchase'; // Added Mode
    subtotal: number;
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
}

const PaymentDrawer: React.FC<PaymentDrawerProps> = ({
    isOpen,
    onClose,
    mode = 'sale',
    subtotal,
    billTotal,
    totalQuantity = 0,
    totalItemDiscount = 0,
    onPaymentComplete,
    initialPartyName,
    initialPartyNumber,
    initialPaymentMethods,
    requireCustomerName = false,
    requireCustomerMobile = false,
    initialDiscount = 0,
}) => {
    const { currentUser } = useAuth();

    // --- COMPUTED PROPERTIES BASED ON MODE ---
    const isSale = mode === 'sale';
    const collectionName = isSale ? 'customers' : 'suppliers';
    const partyLabel = isSale ? 'Customer' : 'Supplier';

    // --- STATE ---
    const [partyName, setPartyName] = useState('');
    const [partyNumber, setPartyNumber] = useState('');
    const [partyAddress, setPartyAddress] = useState('');
    const [partyGST, setPartyGST] = useState('');
    const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
    const [discount, setDiscount] = useState(0);
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

    // --- CALCULATIONS ---
    const netPayable = useMemo(() => Math.max(0, billTotal - discount), [billTotal, discount]);

    const appliedCreditAmount = useMemo(() => {
        if (!useCredit || partyCredit <= 0) return 0;
        return Math.min(netPayable, partyCredit);
    }, [useCredit, partyCredit, netPayable]);

    const appliedDebitAmount = useMemo(() => {
        if (!useDebit || partyDebit <= 0) return 0;
        return Math.min(netPayable - appliedCreditAmount, partyDebit);
    }, [useDebit, partyDebit, netPayable, appliedCreditAmount]);

    const totalManualPayment = useMemo(() => {
        const sum = Object.values(selectedPayments).reduce((acc, amount) => acc + (amount || 0), 0);
        return parseFloat(sum.toFixed(2));
    }, [selectedPayments]);

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

    // --- EFFECTS ---
    useEffect(() => {
        if (!isOpen) return;
        shouldSaveToLocalStorage.current = true;
        setIsSubmitting(false);
        setDiscount(initialDiscount || 0);
        setIsDiscountLocked(true);
        setPartyCredit(0);
        setUseCredit(false);
        setPartyDebit(0);
        setUseDebit(false);
        setSuggestions([]);
        setShowSuggestions(false);

        let initialName = initialPartyName || '';
        let initialNumber = initialPartyNumber || '';

        if (!initialName && !initialNumber) {
            try {
                initialName = sessionStorage.getItem(SESSION_STORAGE_NAME_KEY) || '';
                initialNumber = sessionStorage.getItem(SESSION_STORAGE_NUMBER_KEY) || '';
            } catch (e) { }
        }

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
        setPartyAddress('');
        setPartyGST('');
        setIsDetailsExpanded(false);

        // Auto-search logic on open
        if (isSale && initialNumber) searchParty(initialNumber, 'number');
        if (!isSale && initialName) searchParty(initialName, 'name');

    }, [isOpen, mode, initialDiscount]);

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
                            debitBalance: data.debitBalance
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
            await onPaymentComplete({
                paymentDetails: payloadToSave,
                partyName, partyNumber, discount,
                finalAmount: netPayable,
                appliedCredit: appliedCreditAmount,
                appliedDebit: appliedDebitAmount,
                partyAddress, partyGST, revDiscount,
            });

            // --- SAVE TO RESPECTIVE DB ---
            if (currentUser?.companyId && partyNumber && partyNumber.trim().length > 0) {
                const cleanNumber = partyNumber.trim();
                const partyDocRef = doc(db, 'companies', currentUser.companyId, collectionName, cleanNumber);

                const partyData: any = {
                    name: partyName.trim(),
                    number: cleanNumber,
                    companyId: currentUser.companyId,
                    address: partyAddress.trim(),
                    gstNumber: partyGST.trim(),
                };

                if (isSale) {
                    partyData.lastSaleAt = serverTimestamp();
                } else {
                    partyData.lastPurchaseAt = serverTimestamp();
                }

                if (appliedCreditAmount > 0) partyData.creditBalance = firebaseIncrement(-appliedCreditAmount);
                if (appliedDebitAmount > 0) partyData.debitBalance = firebaseIncrement(-appliedDebitAmount);

                await setDoc(partyDocRef, partyData, { merge: true });
            }

            try {
                sessionStorage.removeItem(SESSION_STORAGE_NAME_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_NUMBER_KEY);
            } catch (e) { }
            setPartyName(''); setPartyNumber(''); setSelectedPayments({});
        } catch (error) {
            setModal({ message: (error as Error).message || 'Failed to save.', type: State.ERROR });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDiscountPressStart = () => longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500);
    const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
    const handleDiscountClick = () => { if (isDiscountLocked) { setDiscountInfo("Cannot edit"); setTimeout(() => setDiscountInfo(null), 3000); } };
    const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => { setDiscount(parseFloat(e.target.value) || 0); };

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
                <div className="p-3 bg-white rounded-t-2xl border-b border-gray-200 sticky top-0 z-10 flex items-center justify-center relative shadow-sm">
                    <div className="w-10 h-1 bg-gray-300 rounded-full absolute top-2"></div>
                    <button onClick={onClose} className="absolute left-4 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                    <h2 className="text-lg font-semibold text-gray-800 mt-2">Payment Details</h2>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-y-contain bg-white">
                    {/* Party Info */}
                    <div className="p-4 space-y-2">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{partyLabel} Info</h3>
                        <div className="grid grid-cols-2 gap-4 relative">

                            {/* NUMBER INPUT (Search trigger if Sale) */}
                            <div className="relative">
                                <input
                                    type="number"
                                    placeholder={requireCustomerMobile ? "Phone Number *" : "Phone Number"}
                                    value={partyNumber}
                                    onChange={(e) => handleInputChange(e.target.value, 'number')}
                                    onFocus={() => { if (isSale && partyNumber.length >= 3) searchParty(partyNumber, 'number'); }}
                                    className={`w-full bg-gray-50 p-3 text-sm rounded-xs border ${requireCustomerMobile && !partyNumber ? 'border-red-300 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'} focus:ring-2 focus:ring-blue-100 outline-none`}
                                    autoComplete="off"
                                />
                                {requireCustomerMobile && <span className="absolute right-3 top-3 text-red-500 font-bold">*</span>}
                                {/* Render Dropdown here ONLY if Sale */}
                                {isSale && renderSuggestions()}
                            </div>

                            {/* NAME INPUT (Search trigger if Purchase) */}
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder={requireCustomerName ? `${partyLabel} Name *` : `${partyLabel} Name`}
                                    value={partyName}
                                    onChange={(e) => handleInputChange(e.target.value, 'name')}
                                    onFocus={() => { if (!isSale && partyName.length >= 3) searchParty(partyName, 'name'); }}
                                    className={`w-full bg-gray-50 p-3 text-sm rounded-xs border ${requireCustomerName && !partyName ? '' : 'border-gray-200 focus:border-blue-500'} focus:ring-2 focus:ring-blue-100 outline-none`}
                                    autoComplete="off"
                                />
                                {requireCustomerName && <span className="absolute right-3 top-3 text-red-500 font-bold">*</span>}
                                {/* Render Dropdown here ONLY if Purchase */}
                                {!isSale && renderSuggestions()}
                            </div>

                        </div>
                        <div className="pt-1">
                            <div onClick={() => setIsDetailsExpanded(!isDetailsExpanded)} className="flex items-center justify-start cursor-pointer text-blue-600 hover:text-blue-700 transition-colors text-xs font-semibold select-none"><span>{isDetailsExpanded ? 'Hide' : '+ Add'} GST & Address</span></div>
                            {isDetailsExpanded && (
                                <div className="grid grid-cols-2 gap-3 mt-3 animate-in slide-in-from-top-2 fade-in duration-200">
                                    <input type="text" placeholder="GST Number" value={partyGST} onChange={(e) => setPartyGST(e.target.value)} className="w-full p-2.5 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:border-blue-500 outline-none" />
                                    <input type="text" placeholder="Address" value={partyAddress} onChange={(e) => setPartyAddress(e.target.value)} className="w-full p-2.5 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:border-blue-500 outline-none" />
                                </div>
                            )}
                        </div>
                    </div>

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
                            {transactiontypes.map((mode) => (
                                <FloatingLabelInput key={mode.id} id={mode.id} label={mode.name} value={selectedPayments[mode.id]?.toString() || ''} onChange={(e) => handleAmountChange(mode.id, e.target.value)} onFill={() => handleFillRemaining(mode.id)} showFillButton={pendingAmount > 0.01} className="bg-white rounded-xs" />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer Totals */}
                <div className="p-4 bg-white border-t border-gray-200 rounded-b-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">
                    <div className="flex justify-between items-center mb-2 text-sm text-gray-500">
                        <span>Qty: <strong className="text-gray-800">{totalQuantity}</strong></span>
                        <div className="flex items-center gap-2">
                            <span>Subtotal:</span>
                            <span className="font-medium text-gray-800">₹{subtotal.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center mb-2 text-sm" onMouseDown={handleDiscountPressStart} onMouseUp={handleDiscountPressEnd} onMouseLeave={handleDiscountPressEnd} onTouchStart={handleDiscountPressStart} onTouchEnd={handleDiscountPressEnd} onClick={handleDiscountClick}>
                        <div className="flex items-center gap-2">
                            <span className={`text-gray-500 ${isDiscountLocked ? '' : 'text-blue-600 font-semibold'}`}>Bill Discount (₹)</span>
                            {isDiscountLocked && <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>}
                            {discountInfo && <span className="text-xs text-red-500 bg-red-50 px-1 rounded animate-pulse">{discountInfo}</span>}
                        </div>
                        <input id="discount" type="number" placeholder="0" value={discount || ''} onChange={handleDiscountChange} readOnly={isDiscountLocked} className={`w-20 text-right bg-gray-100 rounded-xs text-gray-800 focus:outline-none ${isDiscountLocked ? 'cursor-not-allowed' : 'border-b border-blue-300 font-semibold'}`} />
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

                        <div className="flex-1 flex justify-end">
                            {totalItemDiscount > 0 && (
                                <span className="text-base text-green-600 font-medium">
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