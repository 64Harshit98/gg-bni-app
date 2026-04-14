import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';  // ✅ added useLocation
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { useAuth } from '../../../context/auth-context';
import { IconClose } from '../../../constants/Icons';

interface PaymentGatewayData {
    name: string;
    accountNumber: string;
    accountType: 'Savings' | 'Current' | '';
    emiAmount: string;
    emiDate: string;
    aadharCardDetails: string;
    isVerified: boolean;
    planName?: string;      // ✅ NEW: store which plan they paid for
    planId?: string;
}

// ✅ NEW: Plan summary card shown at top
const PlanSummaryCard: React.FC<{ planName: string; price: string; originalPrice?: string }> = ({ planName, price, originalPrice }) => (
    <div className="max-w-2xl mx-auto mb-6 bg-blue-50 border border-blue-200 rounded-sm p-4 flex items-center justify-between">
        <div>
            <p className="text-xs text-blue-500 font-semibold uppercase tracking-wider mb-1">Selected Plan</p>
            <p className="text-lg font-bold text-gray-900">{planName}</p>
            <p className="text-xs text-gray-500 mt-0.5">Billed Yearly · Auto-renews annually</p>
        </div>
        <div className="text-right">
            {originalPrice && (
                <p className="text-sm text-gray-400 line-through">{originalPrice}</p>
            )}
            <p className="text-2xl font-extrabold text-blue-700">{price}</p>
            <p className="text-xs text-gray-500">per year</p>
        </div>
    </div>
);

const PaymentGateway: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();  // ✅ read plan passed from SubscriptionPage
    const { currentUser } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isAlreadyVerified, setIsAlreadyVerified] = useState(false);

    // ✅ Extract plan details passed via navigate state
    const planState = location.state as {
        planName: string;
        planId: string;
        price: string;
        originalPrice?: string;
        billingCycle: string;
    } | null;

    const [formData, setFormData] = useState<PaymentGatewayData>({
        name: '',
        accountNumber: '',
        accountType: '',
        emiAmount: planState?.price || '',   // ✅ pre-fill from plan
        emiDate: '',
        aadharCardDetails: '',
        isVerified: false,
        planName: planState?.planName || '',
        planId: planState?.planId || '',
    });

    useEffect(() => {
        loadPaymentGatewayData();
    }, [currentUser]);

    const loadPaymentGatewayData = async () => {
        if (!currentUser) return;
        setIsLoading(true);
        try {
            const companyId = (currentUser as any).companyId || currentUser.uid;
            const paymentDocRef = doc(db, 'companies', companyId, 'payment_gateway', companyId);
            const paymentDoc = await getDoc(paymentDocRef);

            if (paymentDoc.exists()) {
                const data = paymentDoc.data() as PaymentGatewayData;
                setFormData(data);
                if (data.isVerified) setIsAlreadyVerified(true);
            }
        } catch (err) {
            console.error("Failed to load:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (isAlreadyVerified) return;
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isAlreadyVerified) return;
        if (!currentUser) { alert('Please login to continue'); return; }
        if (!formData.name || !formData.accountNumber || !formData.accountType || !formData.aadharCardDetails) {
            alert('Please fill in all mandatory fields');
            return;
        }

        const today = new Date();
        const emiDate = today.toLocaleDateString('en-IN', {
            day: '2-digit', month: 'long', year: 'numeric'
        });

        setIsSaving(true);
        try {
            const companyId = (currentUser as any).companyId || currentUser.uid;
            const paymentDocRef = doc(db, 'companies', companyId, 'payment_gateway', companyId);
            const dataToSave: PaymentGatewayData = {
                ...formData,
                emiAmount: planState?.price || formData.emiAmount,
                emiDate,
                isVerified: true,
                planName: planState?.planName || formData.planName,
                planId: planState?.planId || formData.planId,
            };
            await setDoc(paymentDocRef, dataToSave, { merge: true });
            setFormData(dataToSave);
            setIsAlreadyVerified(true);
            alert('Verification complete! Our team will activate your plan shortly.');
            navigate(-1);
        } catch (err) {
            console.error("Failed to save:", err);
            alert('Failed to save. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-100">
                <div className="h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-sm animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden bg-gray-100">
            {/* Header */}
            <div className="z-30 bg-white border-b border-gray-100 pb-6 pt-6 px-6 shadow-sm flex-none">
                <div className="flex items-start gap-4">
                    <button onClick={() => navigate(-1)} className="mt-1 flex items-center justify-center p-2 rounded-sm bg-gray-50 text-gray-500 hover:bg-gray-200 transition-all">
                        <IconClose />
                    </button>
                    <div className="flex flex-col">
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Payment Gateway</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            {isAlreadyVerified
                                ? 'Your details have been verified and locked.'
                                : 'One-time bank verification to activate your subscription'}
                        </p>
                    </div>
                </div>
            </div>

            {/* ✅ Verified banner */}
            {isAlreadyVerified && (
                <div className="bg-green-50 border-b border-green-200 px-6 py-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-green-800">
                        Verified on {formData.emiDate} · Plan: {formData.planName} · Details are locked.
                    </span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto bg-slate-100 p-6">

                {/* ✅ Show plan card only if plan was passed and not yet verified */}
                {planState && !isAlreadyVerified && (
                    <PlanSummaryCard
                        planName={planState.planName}
                        price={planState.price}
                        originalPrice={planState.originalPrice}
                    />
                )}

                <form onSubmit={handleSubmit} className="max-w-2xl mx-auto bg-white rounded-sm shadow-sm p-6 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Name <span className="text-red-500">*</span></label>
                            <input type="text" name="name" value={formData.name} onChange={handleInputChange}
                                className={`w-full px-4 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-blue-500 ${isAlreadyVerified ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                placeholder="Account holder name" readOnly={isAlreadyVerified} required />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Account Number <span className="text-red-500">*</span></label>
                            <input type="text" name="accountNumber" value={formData.accountNumber} onChange={handleInputChange}
                                className={`w-full px-4 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-blue-500 ${isAlreadyVerified ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                placeholder="Enter account number" readOnly={isAlreadyVerified} required />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Account Type <span className="text-red-500">*</span></label>
                            <select name="accountType" value={formData.accountType} onChange={handleInputChange}
                                className={`w-full px-4 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-blue-500 ${isAlreadyVerified ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                disabled={isAlreadyVerified} required>
                                <option value="">Select account type</option>
                                <option value="Savings">Savings Account</option>
                                <option value="Current">Current Account</option>
                            </select>
                        </div>

                        {/* ✅ EMI Amount — pre-filled from plan, always read-only */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">EMI Amount (Yearly)</label>
                            <input type="text" value={formData.emiAmount}
                                className="w-full px-4 py-2 border border-gray-300 rounded-sm bg-gray-100 cursor-not-allowed font-semibold text-gray-800"
                                readOnly />
                            <p className="text-xs text-gray-500 mt-1">Auto-filled from your selected plan</p>
                        </div>

                        {/* Aadhar — full width */}
                        <div className="col-span-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Aadhar Card Number <span className="text-red-500">*</span></label>
                            <input type="text" name="aadharCardDetails" value={formData.aadharCardDetails} onChange={handleInputChange}
                                className={`w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:ring-2 focus:ring-blue-500 ${isAlreadyVerified ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                placeholder="XXXX-XXXX-XXXX" maxLength={14} readOnly={isAlreadyVerified} required />
                        </div>

                        {/* EMI Date — only after verification, full width */}
                        {isAlreadyVerified && (
                            <div className="col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Verification Date</label>
                                <input type="text" value={formData.emiDate}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm bg-gray-100 cursor-not-allowed"
                                    readOnly />
                                <p className="text-xs text-gray-500 mt-1">Date when your details were submitted</p>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={() => navigate(-1)}
                            className="flex-1 px-6 py-3 border border-gray-300 rounded-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors">
                            {isAlreadyVerified ? 'Close' : 'Cancel'}
                        </button>
                        {!isAlreadyVerified && (
                            <button type="submit" disabled={isSaving}
                                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                {isSaving ? (
                                    <><div className="h-5 w-5 border-2 border-white border-t-transparent rounded-sm animate-spin"></div>Verifying...</>
                                ) : 'Submit for Verification'}
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PaymentGateway;