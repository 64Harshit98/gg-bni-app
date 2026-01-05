import { State } from "../enums";

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
}) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-100 p-4">
        <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm text-center">
            {/* Icon based on type */}
            <div className={`mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center ${type === State.SUCCESS ? 'bg-green-100' :
                type === State.ERROR ? 'bg-red-100' :
                    'bg-blue-100'
                }`}>
                {type === State.SUCCESS && <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>}
                {type === State.ERROR && <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>}
                {type === State.INFO && <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
            </div>

            <p className="text-lg font-medium text-gray-800 mb-6">{message}</p>

            {/* Conditionally render buttons based on showConfirmButton prop */}
            {showConfirmButton ? (
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 text-white py-2 px-4 rounded-lg transition-colors ${type === State.ERROR || type === State.INFO ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                    >
                        Confirm
                    </button>
                </div>
            ) : (
                <button
                    onClick={onClose}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    OK
                </button>
            )}
        </div>
    </div>
);

import React, { useState, useEffect } from 'react';

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
    // Optional properties to ensure full compatibility
    partyNumber?: string;
    items?: any[];
}

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: ModalInvoice | null;
    onSubmit: (invoice: ModalInvoice, amount: number, method: string) => Promise<void>;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, invoice, onSubmit }) => {
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('cash');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (invoice) {
            setAmount(invoice.dueAmount?.toString() ?? '');
            setError('');
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

        setIsSubmitting(true);
        setError('');
        try {
            await onSubmit(invoice, paymentAmount, method);
            onClose(); // Close modal on successful submission
        } catch (err) {
            console.error(err);
            setError('Failed to process payment. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                <h2 className="text-2xl font-bold mb-2 text-slate-800">Settle Payment</h2>
                <p className="mb-4 text-slate-600">
                    For <span className="font-semibold">{invoice.partyName}</span> (Due: ₹{(invoice.dueAmount ?? 0).toLocaleString('en-IN')})
                </p>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label htmlFor="amount" className="block text-sm font-medium text-slate-700">Amount</label>
                        <input
                            type="number"
                            id="amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div className="mb-6">
                        <label htmlFor="method" className="block text-sm font-medium text-slate-700">Payment Method</label>
                        <select
                            id="method"
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                            <option value="cash">Cash</option>
                            <option value="upi">UPI</option>
                            <option value="card">Card</option>
                        </select>
                    </div>
                    {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-slate-200 text-slate-800 hover:bg-slate-300">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                            {isSubmitting ? 'Processing...' : 'Submit Payment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
