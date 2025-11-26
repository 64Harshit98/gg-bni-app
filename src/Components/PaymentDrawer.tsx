import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FloatingLabelInput } from './ui/FloatingLabelInput';
import { transactiontypes } from '../constants/Transactiontype';
import { Modal } from '../constants/Modal';
import { State } from '../enums';
import { db } from '../lib/Firebase';
import { doc, getDoc, setDoc, serverTimestamp, increment as firebaseIncrement } from 'firebase/firestore';
import { useAuth } from '../context/auth-context';

export interface PaymentDetails {
    [key: string]: number;
}

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
    revDiscount?: number; // <--- Added this field
}

interface PaymentDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    subtotal: number;
    onPaymentComplete: (data: PaymentCompletionData) => Promise<void>;
    isPartyNameEditable?: boolean;
    initialPartyName?: string;
    initialPartyNumber?: string;
    initialPaymentMethods?: PaymentDetails | { [key: string]: any };
}

const LOCAL_STORAGE_NAME_KEY = 'lastPartyName';
const LOCAL_STORAGE_NUMBER_KEY = 'lastPartyNumber';

const PaymentDrawer: React.FC<PaymentDrawerProps> = ({
    isOpen,
    onClose,
    subtotal,
    onPaymentComplete,
    initialPartyName,
    initialPartyNumber,
    initialPaymentMethods,
}) => {
    const { currentUser } = useAuth();
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
    const [isFetchingParty, setIsFetchingParty] = useState(false);
    
    const shouldSaveToLocalStorage = useRef(true);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const [discountInfo, setDiscountInfo] = useState<string | null>(null);

    // --- EFFECTIVE SUBTOTAL ---
    const effectiveSubtotal = useMemo(() => {
        if (subtotal > 0) return subtotal;
        const initialTotal = initialPaymentMethods 
            ? Object.values(initialPaymentMethods).reduce((acc: number, val: any) => acc + (Number(val) || 0), 0)
            : 0;
        return initialTotal > 0 ? initialTotal : 0;
    }, [subtotal, initialPaymentMethods]);

    // --- MATH & TOTALS ---
    const appliedCredit = useMemo(() => {
        if (!useCredit || customerCredit <= 0) return 0;
        const amountAfterDiscount = effectiveSubtotal - discount;
        return Math.min(amountAfterDiscount, customerCredit);
    }, [useCredit, customerCredit, effectiveSubtotal, discount]);

    const appliedDebit = useMemo(() => {
        if (!useDebit || customerDebit <= 0) return 0;
        const amountAfterDiscountAndCredit = effectiveSubtotal - discount - appliedCredit;
        return Math.min(amountAfterDiscountAndCredit, customerDebit);
    }, [useDebit, customerDebit, effectiveSubtotal, discount, appliedCredit]);

    const finalPayableAmount = useMemo(() => {
        const val = Math.max(0, effectiveSubtotal - discount - appliedCredit - appliedDebit);
        return parseFloat(val.toFixed(2));
    }, [effectiveSubtotal, discount, appliedCredit, appliedDebit]);

    const totalEnteredAmount = useMemo(() => {
        const sum = Object.values(selectedPayments).reduce((acc, amount) => acc + (amount || 0), 0);
        return parseFloat(sum.toFixed(2));
    }, [selectedPayments]);

    // Any excess amount is considered "Change to Return" visually, 
    // but will be saved as 'revDiscount' in the database.
    const changeToReturn = useMemo(() => {
        const diff = totalEnteredAmount - finalPayableAmount;
        return diff > 0.01 ? parseFloat(diff.toFixed(2)) : 0;
    }, [totalEnteredAmount, finalPayableAmount]);

    const pendingAmount = useMemo(() => {
        const diff = finalPayableAmount - totalEnteredAmount;
        return diff > 0.01 ? parseFloat(diff.toFixed(2)) : 0;
    }, [finalPayableAmount, totalEnteredAmount]);

    // --- INITIALIZATION ---
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

        let initialName = initialPartyName || '';
        let initialNumber = initialPartyNumber || '';

        if (!initialName && !initialNumber) {
            try {
                initialName = localStorage.getItem(LOCAL_STORAGE_NAME_KEY) || '';
                initialNumber = localStorage.getItem(LOCAL_STORAGE_NUMBER_KEY) || '';
            } catch (e) {
                console.error("Failed to read localStorage:", e);
            }
        }

        if (initialPaymentMethods && Object.keys(initialPaymentMethods).length > 0) {
            const loadedPayments: PaymentDetails = {};
            Object.entries(initialPaymentMethods).forEach(([key, value]) => {
                if (key === 'due') return;
                const numVal = Number(value);
                if (!isNaN(numVal) && numVal > 0) {
                    loadedPayments[key] = numVal;
                }
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

    }, [isOpen]); 

    // --- LOCAL STORAGE SAVE ---
    useEffect(() => {
        if (isOpen && !isSubmitting && shouldSaveToLocalStorage.current) {
            try {
                if (partyName) localStorage.setItem(LOCAL_STORAGE_NAME_KEY, partyName);
                if (partyNumber) localStorage.setItem(LOCAL_STORAGE_NUMBER_KEY, partyNumber);
            } catch (e) {
                console.error("Failed to write to localStorage:", e);
            }
        }
    }, [partyName, partyNumber, isOpen, isSubmitting]);

    const handlePartyNumberBlur = async () => {
        setCustomerCredit(0);
        setUseCredit(false);
        setCustomerDebit(0);
        setUseDebit(false);

        if (!partyNumber || partyNumber.length < 10 || !currentUser?.companyId) return;

        setIsFetchingParty(true);
        const companyId = currentUser.companyId;

        try {
            const customerDocRef = doc(db, 'companies', companyId, 'customers', partyNumber);
            const customerDoc = await getDoc(customerDocRef);
            if (customerDoc.exists()) {
                const customerData = customerDoc.data();
                setPartyName(customerData.name);
                setPartyAddress(customerData.address || '');
                setPartyGST(customerData.gstNumber || '');

                const availableCredit = customerData.creditBalance || 0;
                if (availableCredit > 0) {
                    setCustomerCredit(availableCredit);
                    setUseCredit(true);
                }
                const availableDebit = customerData.debitBalance || 0;
                if (availableDebit > 0) {
                    setCustomerDebit(availableDebit);
                    setUseDebit(true);
                }
            }
        } catch (error) {
            console.error("Error fetching customer:", error);
        } finally {
            setIsFetchingParty(false);
        }
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
        // 1. Validate Pending Amount (Must be 0 or less)
        if (pendingAmount > 0.01) {
            setModal({ message: `Amount mismatch. Remaining to pay: ₹${pendingAmount.toFixed(2)}`, type: State.ERROR });
            return;
        }

        // 2. Calculate Review Discount (Excess Amount)
        let revDiscount = 0;
        if (changeToReturn > 0.01) {
            revDiscount = changeToReturn;
        }

        // 3. CONSTRUCT PAYLOAD (AGGRESSIVE ZERO-FILL)
        // This ensures old values are overwritten with 0 if they are removed.
        const payloadToSave: PaymentDetails = {};

        // A. Start with 0 for ALL standard transaction types
        transactiontypes.forEach((t) => {
            payloadToSave[t.id] = 0;
        });

        // B. Start with 0 for ALL keys found in initial data (handling legacy/custom types)
        if (initialPaymentMethods) {
            Object.keys(initialPaymentMethods).forEach((key) => {
                if (key !== 'due') {
                    payloadToSave[key] = 0;
                }
            });
        }

        // C. Overlay the actual user input
        Object.entries(selectedPayments).forEach(([key, value]) => {
            payloadToSave[key] = value;
        });

        setIsSubmitting(true);
        shouldSaveToLocalStorage.current = false; 

        try {
            await onPaymentComplete({
                paymentDetails: payloadToSave, // Sends {cash: 0, upi: 150, ...}
                partyName, partyNumber, discount,
                finalAmount: finalPayableAmount,
                appliedCredit,
                appliedDebit,
                partyAddress,
                partyGST,
                revDiscount, // <--- Sending the review discount here
            });

            if (partyNumber && partyNumber.length >= 20 && currentUser?.companyId) {
                const customerDocRef = doc(db, 'companies', currentUser.companyId, 'customers', partyNumber);
                await setDoc(customerDocRef, {
                    name: partyName, number: partyNumber, companyId: currentUser.companyId,
                    lastSaleAt: serverTimestamp(),
                    creditBalance: firebaseIncrement(-appliedCredit),
                    debitBalance: firebaseIncrement(-appliedDebit),
                    address: partyAddress,
                    gstNumber: partyGST,
                }, { merge: true });
            }

            try {
                localStorage.removeItem(LOCAL_STORAGE_NAME_KEY);
                localStorage.removeItem(LOCAL_STORAGE_NUMBER_KEY);
            } catch (e) {
                console.error("Failed to clear localStorage:", e);
            }
            setPartyName('');
            setPartyNumber('');
            setSelectedPayments({});

        } catch (error) {
            setModal({ message: (error as Error).message || 'Failed to save sale.', type: State.ERROR });
            setIsSubmitting(false);
        }
    };

    const handleDiscountPressStart = () => longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500);
    const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
    const handleDiscountClick = () => {
        if (isDiscountLocked) {
            setDiscountInfo("Cannot edit Discount.");
            setTimeout(() => setDiscountInfo(null), 3000);
        }
    };
    const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDiscount = parseFloat(e.target.value) || 0;
        setDiscount(newDiscount);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose}>
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
            <div className="fixed bottom-0 left-0 right-0 bg-gray-50 rounded-t-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="p-2 sticky top-0 bg-gray-50 z-10 border-b">
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto "></div>
                    <button onClick={onClose} className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-gray-200 p-2 text-gray-900">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                    <h2 className="text-xl font-bold text-center text-gray-800">Payment</h2>
                </div>
                <div className="p-2 space-y-2 overflow-y-auto">
                    {/* ... (Customer Details Section remains same) ... */}
                    <div className="bg-white rounded-sm shadow-sm p-2 space-y-1">
                        <h3 className="font-semibold text-gray-800 text-sm">Customer Details</h3>
                        <div className="grid grid-cols-2 md:grid-cols-2 gap-2">
                            <div className="relative">
                                <input
                                    type="number"
                                    placeholder="Party Number"
                                    value={partyNumber}
                                    onChange={(e) => setPartyNumber(e.target.value)}
                                    onBlur={handlePartyNumberBlur}
                                    className="w-full bg-gray-100 p-2 text-sm rounded-sm border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                                />
                                {isFetchingParty && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">Searching...</div>}
                            </div>
                            <input
                                type="text"
                                placeholder="Party Name"
                                value={partyName}
                                onChange={(e) => setPartyName(e.target.value)}
                                className="w-full bg-gray-100 p-2 text-sm rounded-sm border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <div className="col-span-full border-t mt-2 pt-2">
                            <div
                                onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                                className="flex items-center justify-between cursor-pointer text-gray-600 hover:text-gray-900 transition-colors"
                            >
                                <span className="text-sm font-medium">More Details</span>
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className={`h-5 w-5 transform transition-transform duration-300 ${isDetailsExpanded ? 'rotate-180' : 'rotate-0'}`}
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </div>

                            {isDetailsExpanded && (
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <input
                                        type="text"
                                        placeholder="Party GST Number"
                                        value={partyGST}
                                        onChange={(e) => setPartyGST(e.target.value)}
                                        className="w-full p-2 text-sm rounded-sm border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Party Address"
                                        value={partyAddress}
                                        onChange={(e) => setPartyAddress(e.target.value)}
                                        className="w-full p-2 text-sm rounded-sm border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2 grid">
                        {transactiontypes.map((mode) => (
                            <FloatingLabelInput
                                key={mode.id}
                                id={mode.id}
                                label={mode.name}
                                value={selectedPayments[mode.id]?.toString() || ''}
                                onChange={(e) => handleAmountChange(mode.id, e.target.value)}
                                onFill={() => handleFillRemaining(mode.id)}
                                showFillButton={pendingAmount > 0.01}
                            />
                        ))}
                    </div>
                </div>
                <div className="p-2 mt-auto sticky bottom-0 bg-white border-t">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-gray-600">Subtotal:</span>
                        <span className="font-medium text-sm">₹{effectiveSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between mb-1 gap-2 p-2 -m-2 rounded-lg" onMouseDown={handleDiscountPressStart} onMouseUp={handleDiscountPressEnd} onMouseLeave={handleDiscountPressEnd} onTouchStart={handleDiscountPressStart} onTouchEnd={handleDiscountPressEnd} onClick={handleDiscountClick}>
                        <label htmlFor="discount" className={`text-sm text-gray-600 ${isDiscountLocked ? 'cursor-pointer' : ''}`}>Discount (₹):</label>
                        {discountInfo && <div className="flex items-center text-sm bg-red-100 text-red-800 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                            {discountInfo}</div>}
                        <input id="discount" type="number" placeholder="0.00" value={discount || ''} onChange={handleDiscountChange} readOnly={isDiscountLocked} className={`w-20 text-right bg-gray-100 p-1 text-sm rounded-md border-gray-300 focus:ring-blue-500 focus:border-blue-500 ${isDiscountLocked ? 'cursor-not-allowed text-gray-500' : ''}`} />
                    </div>

                    {customerCredit > 0 && (
                        <div className="flex justify-between items-center mb-1 text-green-600">
                            <label htmlFor="useCreditCheckbox" className="flex items-center text-sm cursor-pointer">
                                <input type="checkbox" id="useCreditCheckbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                <span className="ml-2">Credit Balance (Available: ₹{customerCredit.toFixed(2)})</span>
                            </label>
                            <span className="font-medium text-sm">- ₹{appliedCredit.toFixed(2)}</span>
                        </div>
                    )}

                    {customerDebit > 0 && (
                        <div className="flex justify-between items-center mb-1 text-orange-600">
                            <label htmlFor="useDebitCheckbox" className="flex items-center text-sm cursor-pointer">
                                <input type="checkbox" id="useDebitCheckbox" checked={useDebit} onChange={(e) => setUseDebit(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                <span className="ml-2">Debit Note (Available: ₹{customerDebit.toFixed(2)})</span>
                            </label>
                            <span className="font-medium text-sm">- ₹{appliedDebit.toFixed(2)}</span>
                        </div>
                    )}

                    <div className="flex justify-between items-center mb-1 border-t pt-1">
                        <span className="text-gray-800 font-semibold">Total Payable:</span>
                        <span className="font-bold text-lg text-blue-600">₹{finalPayableAmount.toFixed(2)}</span>
                    </div>

                    {/* --- DYNAMIC STATUS ROW (Show excess as Review Discount) --- */}
                    {changeToReturn > 0.01 ? (
                        <div className="flex justify-between items-center mb-2 bg-yellow-50 p-2 rounded border border-yellow-200">
                            <span className="text-yellow-700 font-semibold">Review Discount (Excess):</span>
                            <span className="font-bold text-md text-yellow-700">
                                ₹{changeToReturn.toFixed(2)}
                            </span>
                        </div>
                    ) : (
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-600">Remaining:</span>
                            <span className={`font-bold text-md ${pendingAmount < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                                ₹{pendingAmount.toFixed(2)}
                            </span>
                        </div>
                    )}

                    <button
                        onClick={handleConfirm}
                        disabled={isSubmitting || pendingAmount > 0.01}
                        className="w-full flex items-center justify-center bg-blue-600 text-white font-bold py-1 px-3 rounded-sm hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                    >
                        {isSubmitting ? 'Submitting...' : 'Confirm & Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentDrawer;