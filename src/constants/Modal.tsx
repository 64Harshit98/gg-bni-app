import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { State } from "../enums";
import { FiAlertTriangle } from 'react-icons/fi';

interface ModalProps {
    message: string;
    onClose: () => void;
    onConfirm?: () => void;
    showConfirmButton?: boolean;
    type: State;
}

export const Modal: React.FC<ModalProps> = ({
    message,
    onClose,
    onConfirm,
    // Set a default value for showConfirmButton to make it optional
    showConfirmButton = false,
    type,
}) => {
    const modalContent = (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
            <div className="bg-white rounded-sm shadow-2xl p-6 w-full max-w-sm text-center">
                {/* Icon based on type */}
                <div className={`mx-auto mb-4 w-12 h-12 rounded-sm flex items-center justify-center ${type === State.SUCCESS ? 'bg-green-100' :
                    type === State.WARNING ? 'bg-red-100' :
                        'bg-blue-100'
                    }`}>
                    {type === State.SUCCESS && <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>}
                    {type === State.ERROR && <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>}
                    {type === State.INFO && <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
                    {type === State.WARNING && <FiAlertTriangle className="w-8 h-8 text-red-600" />}
                </div>

                <p className="text-lg font-medium text-gray-800 mb-6">{message}</p>

                {/* Conditionally render buttons based on showConfirmButton prop */}
                {showConfirmButton ? (
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-sm hover:bg-gray-300 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`flex-1 text-white py-2 px-4 rounded-sm transition-colors ${type === State.ERROR || type === State.INFO ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                        >
                            Confirm
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={onClose}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-sm hover:bg-blue-700 transition-colors"
                    >
                        OK
                    </button>
                )}
            </div>
        </div>
    );

    if (typeof document === 'undefined') return modalContent;
    return createPortal(modalContent, document.body);
};

export interface ModalInvoice {
    id: string;
    invoiceNumber: string;
    amount: number;
    time: string;
    status: 'Paid' | 'Unpaid';
    type: 'Debit' | 'Credit';
    partyName: string;
    createdAt: Date;
    dueAmount?: number;
    partyNumber?: string;
    items?: any[];
}

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: ModalInvoice | null;
    onSubmit: (invoice: ModalInvoice, amount: number, method: string, chequeNumber?: string, chequeDate?: string) => Promise<void>;
    onConfirm?: (amountToAdd: number) => Promise<void>;
    availableCredit?: number; // Added to receive credit from OrdersPage
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, invoice, onSubmit, availableCredit = 0 }) => {
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('cash');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [chequeNumber, setChequeNumber] = useState('');
    const [chequeDate, setChequeDate] = useState('');

    useEffect(() => {
        if (invoice) {
            setAmount(invoice.dueAmount?.toString() ?? '');
            setError('');
            setChequeNumber('');
            setChequeDate('');
            setMethod('cash'); // Reset method when modal opens
        }
    }, [invoice]);

    if (!isOpen || !invoice) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const paymentAmount = parseFloat(amount);

        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            setError('Please enter a valid amount.');
            return;
        }
        if (paymentAmount > (invoice.dueAmount ?? 0)) {
            setError('Payment cannot exceed the due amount.');
            return;
        }

        // --- NEW: Validation for Credit Note Redemption ---
        if (method === 'credit Note' && paymentAmount > availableCredit) {
            setError(`Cannot redeem more than available credit (₹${availableCredit.toLocaleString('en-IN')}).`);
            return;
        }
        // ------------------------------------------------

        if (method === 'PDC') {
            if (!chequeNumber.trim()) {
                setError('Please enter cheque number.');
                return;
            }
            if (!chequeDate) {
                setError('Please select cheque date.');
                return;
            }
        }

        setIsSubmitting(true);
        setError('');
        try {
            await onSubmit(
                invoice,
                paymentAmount,
                method,
                method === 'PDC' ? chequeNumber : undefined,
                method === 'PDC' ? chequeDate : undefined
            );
            onClose();
        } catch (err) {
            console.error(err);
            setError('Failed to process payment. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex justify-center items-center z-[2000]">
            <div className="bg-white rounded-sm shadow-xl p-6 w-full max-w-md">
                <h2 className="text-2xl font-bold mb-2 text-slate-800">Settle Payment</h2>
                <p className="mb-4 text-slate-600">
                    For <span className="font-semibold">{invoice.partyName}</span> (Due: ₹{(invoice.dueAmount ?? 0).toLocaleString('en-IN')})
                </p>

                {/* --- NEW: Display Available Credit Balance --- */}
                {availableCredit > 0 && (
                    <div className="mb-5 p-3 bg-blue-50 border border-blue-100 rounded-sm flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-800 uppercase tracking-widest">Available Credit</span>
                        <span className="text-sm font-black text-blue-600">₹{availableCredit.toLocaleString('en-IN')}</span>
                    </div>
                )}
                {/* ------------------------------------------- */}

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label htmlFor="amount" className="block text-sm font-medium text-slate-700">Amount to Settle</label>
                        <input
                            type="number"
                            id="amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="mt-1 block w-full rounded-sm border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                            required
                        />
                    </div>
                    <div className="mb-6">
                        <label htmlFor="method" className="block text-sm font-medium text-slate-700">Payment Method</label>
                        <select
                            id="method"
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                            className="mt-1 block w-full rounded-sm border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                        >
                            <option value="cash">Cash</option>
                            <option value="upi">UPI</option>
                            <option value="card">Card</option>
                            <option value="PDC">PDC</option>
                            {/* --- NEW: Add Credit Note Option --- */}
                            {availableCredit > 0 && (
                                <option value="credit Note">Credit Note</option>
                            )}
                            {/* --------------------------------- */}
                        </select>
                    </div>
                    {method === 'PDC' && (
                        <div className="mb-6 bg-slate-50 p-3 rounded-sm border border-slate-200">
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">Cheque Number</label>
                                <input
                                    type="text"
                                    value={chequeNumber}
                                    onChange={(e) => setChequeNumber(e.target.value)}
                                    className="mt-1 block w-full rounded-sm border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border text-sm"
                                    placeholder="Enter cheque number"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">Cheque Date</label>
                                <input
                                    type="date"
                                    value={chequeDate}
                                    onChange={(e) => setChequeDate(e.target.value)}
                                    className="mt-1 block w-full rounded-sm border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border text-sm"
                                    required
                                />
                            </div>
                        </div>
                    )}
                    {error && <p className="text-red-500 text-xs font-bold mb-4 bg-red-50 p-2 rounded-sm border border-red-100">{error}</p>}

                    <div className="flex justify-end gap-3 mt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-sm bg-slate-200 text-slate-800 font-bold hover:bg-slate-300 text-sm">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2.5 rounded-sm bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 text-sm"
                        >
                            {isSubmitting ? 'Processing...' : 'Submit Payment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};