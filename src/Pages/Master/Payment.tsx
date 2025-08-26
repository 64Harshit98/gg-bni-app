import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase';
import {
    collection,
    query,
    where,
    onSnapshot,
    Timestamp,
    QuerySnapshot,
    doc,
    runTransaction
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';

// --- Reusable Spinner Component ---
const Spinner: React.FC = () => (
    <div className="flex justify-center items-center p-8">
        <svg /* ... spinner svg code ... */ >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>
);

// --- Data Types & Helpers ---
interface Invoice {
    id: string;
    amount: number;
    time: string;
    type: 'Debit' | 'Credit';
    partyName: string;
    createdAt: Date;
    dueAmount: number;
}

const formatDate = (date: Date): string => {
    if (!date) return 'N/A';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

// --- Custom Hook for Fetching UNPAID Journal Data ---
const useUnpaidJournalData = (userId?: string) => {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }

        // FIX: Modified queries to only fetch documents where due amount > 0
        const salesQuery = query(
            collection(db, 'sales'),
            where('userId', '==', userId),
            where('paymentMethods.due', '>', 0)
        );
        const purchasesQuery = query(
            collection(db, 'purchases'),
            where('userId', '==', userId),
            where('paymentMethods.due', '>', 0)
        );

        const handleSnapshotError = (err: Error, type: string) => {
            console.error(`Error fetching ${type}:`, err);
            setError(`Failed to load ${type} data.`);
            setLoading(false);
        };

        const processSnapshot = (
            snapshot: QuerySnapshot,
            type: 'Credit' | 'Debit'
        ): Invoice[] => {
            return snapshot.docs.map((doc) => {
                const data = doc.data();
                const createdAt =
                    data.createdAt instanceof Timestamp
                        ? data.createdAt.toDate()
                        : new Date();
                return {
                    id: doc.id,
                    amount: data.totalAmount || 0,
                    time: formatDate(createdAt),
                    type: type,
                    partyName: data.partyName || 'N/A',
                    createdAt,
                    dueAmount: data.paymentMethods?.due || 0,
                };
            });
        };

        const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
            const salesData = processSnapshot(snapshot, 'Credit');
            setInvoices((prev) => [
                ...prev.filter((inv) => inv.type !== 'Credit'),
                ...salesData,
            ]);
            setLoading(false);
        }, (err) => handleSnapshotError(err, 'sales'));

        const unsubscribePurchases = onSnapshot(purchasesQuery, (snapshot) => {
            const purchasesData = processSnapshot(snapshot, 'Debit');
            setInvoices((prev) => [
                ...prev.filter((inv) => inv.type !== 'Debit'),
                ...purchasesData,
            ]);
            setLoading(false);
        }, (err) => handleSnapshotError(err, 'purchases'));

        return () => {
            unsubscribeSales();
            unsubscribePurchases();
        };
    }, [userId]);

    const sortedInvoices = useMemo(
        () => invoices.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
        [invoices]
    );

    return { invoices: sortedInvoices, loading, error };
};

// FIX: New component for the payment modal
const PaymentModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    invoice: Invoice | null;
    onSubmit: (invoice: Invoice, amount: number, method: string) => Promise<void>;
}> = ({ isOpen, onClose, invoice, onSubmit }) => {
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('cash');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (invoice) {
            setAmount(invoice.dueAmount.toString());
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
        if (paymentAmount > invoice.dueAmount) {
            setError('Payment cannot exceed the due amount.');
            return;
        }

        setIsSubmitting(true);
        setError('');
        try {
            await onSubmit(invoice, paymentAmount, method);
            onClose();
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
                    For <span className="font-semibold">{invoice.partyName}</span> (Due: ₹{invoice.dueAmount.toLocaleString('en-IN')})
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
                            <option value="bank">Bank Transfer</option>
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

// --- Main Journal Component ---
const Journal: React.FC = () => {
    const [activeType, setActiveType] = useState<'Debit' | 'Credit'>('Credit');
    const { currentUser, loading: authLoading } = useAuth();
    const { invoices, loading: dataLoading, error } = useUnpaidJournalData(
        currentUser?.uid
    );

    // State for the modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

    const filteredInvoices = useMemo(
        () => invoices.filter((invoice) => invoice.type === activeType),
        [invoices, activeType]
    );

    // FIX: Function to handle the payment submission and update Firestore
    const handleSettlePayment = async (
        invoice: Invoice,
        amount: number,
        method: string
    ) => {
        const collectionName = invoice.type === 'Credit' ? 'sales' : 'purchases';
        const docRef = doc(db, collectionName, invoice.id);

        try {
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(docRef);
                if (!sfDoc.exists()) {
                    throw 'Document does not exist!';
                }

                const data = sfDoc.data() as DocumentData;
                const currentPaymentMethods = data.paymentMethods || {};
                const currentDue = currentPaymentMethods.due || 0;
                const currentMethodTotal = currentPaymentMethods[method] || 0;

                const newDue = currentDue - amount;

                // Ensure newDue doesn't go below zero
                if (newDue < 0) {
                    throw 'Payment exceeds due amount.';
                }

                const newPaymentMethods = {
                    ...currentPaymentMethods,
                    [method]: currentMethodTotal + amount,
                    due: newDue,
                };

                transaction.update(docRef, { paymentMethods: newPaymentMethods });
            });
            console.log('Transaction successfully committed!');
        } catch (e) {
            console.error('Transaction failed: ', e);
            throw e; // Re-throw to be caught in the modal
        }
    };

    const openPaymentModal = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setIsModalOpen(true);
    };

    const renderContent = () => {
        if (authLoading || dataLoading) return <Spinner />;
        if (error) return <p className="p-8 text-center text-red-500">{error}</p>;

        if (filteredInvoices.length > 0) {
            return filteredInvoices.map((invoice) => (
                <div
                    key={invoice.id}
                    className="mb-4 rounded-lg border border-slate-200 bg-white p-4 px-5 shadow-sm"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="mb-1 text-lg font-semibold text-slate-800">{invoice.partyName}</p>
                            <p className="text-sm text-slate-500">
                                Inv #{invoice.id.slice(0, 6)}... at {invoice.time}
                            </p>
                        </div>
                        <p className={`text-2xl font-bold ${invoice.type === 'Credit' ? 'text-green-600' : 'text-red-600'}`}>
                            ₹{invoice.dueAmount.toLocaleString('en-IN')}
                        </p>
                    </div>
                    {/* FIX: Add Settle Payment Button */}
                    <div className="mt-3 pt-3 border-t border-slate-200 text-right">
                        <button onClick={() => openPaymentModal(invoice)} className="text-sm font-semibold text-blue-600 hover:text-blue-800">
                            Settle Payment
                        </button>
                    </div>
                </div>
            ));
        }

        return <p className="p-8 text-center text-base text-slate-500">No unpaid invoices found.</p>;
    };

    return (
        <div className="flex min-h-screen w-full flex-col overflow-hidden bg-white shadow-md">
            <div className="flex flex-shrink-0 items-center justify-center border-b border-slate-200 bg-white p-4 px-6 shadow-sm ">
                <h1 className="text-3xl font-bold text-slate-800 ">Unpaid Invoices</h1>
            </div>

            {/* Debit/Credit Tabs */}
            <div className="flex justify-around border-b border-slate-200 bg-white px-6 shadow-sm">
                <button
                    className={`flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${activeType === 'Credit' ? 'border-blue-600 font-semibold text-blue-600' : 'border-transparent text-slate-500'}`}
                    onClick={() => setActiveType('Credit')}
                >
                    To Receive (+)
                </button>
                <button
                    className={`flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${activeType === 'Debit' ? 'border-blue-600 font-semibold text-blue-600' : 'border-transparent text-slate-500'}`}
                    onClick={() => setActiveType('Debit')}
                >
                    To Pay (-)
                </button>
            </div>

            {/* FIX: Removed Paid/Unpaid Tabs */}

            <div className="flex-grow overflow-y-auto bg-slate-100 p-6">
                {renderContent()}
            </div>

            <PaymentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                invoice={selectedInvoice}
                onSubmit={handleSettlePayment}
            />
        </div>
    );
};

export default Journal;