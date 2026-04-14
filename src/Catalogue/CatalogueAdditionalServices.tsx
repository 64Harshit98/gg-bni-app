import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { useAuth } from '../context/auth-context';
import { botMasterService } from '../Pages/Additional/Whatsapp/WhatsappApi';
import { CustomCard } from '../Components/CustomCard';
import { IconChevronDown, IconClose } from '../constants/Icons';
import { ROUTES } from '../constants/routes.constants';

const CatalogueAdditionalServices: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [isChecking, setIsChecking] = useState(false);
    const [isCheckingPayment, setIsCheckingPayment] = useState(false);

    const handleWhatsappClick = async () => {
        if (!currentUser) {
            navigate(ROUTES.WHATSAPP_PLAN);
            return;
        }

        setIsChecking(true);
        try {
            const companyId = (currentUser as any).companyId || currentUser.uid;
            const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);
            const businessDoc = await getDoc(businessDocRef);

            if (businessDoc.exists()) {
                const data = businessDoc.data();
                const token = data.botMasterToken;
                const phone = data.whatsappNumber;

                if (token && phone) {
                    const response = await botMasterService.getMe(token, phone);

                    if (response.success && response.data?.sessions?.length > 0) {
                        const activeSession = response.data.sessions.find(
                            (s: any) => s.active === true
                        );
                        if (activeSession) {
                            navigate(ROUTES.WHATSAPP_LANDING);
                            return;
                        }
                    }
                }
            }
            navigate(ROUTES.WHATSAPP_PLAN);
        } catch (err) {
            console.error('WhatsApp check failed:', err);
            navigate(ROUTES.WHATSAPP_PLAN);
        } finally {
            setIsChecking(false);
        }
    };
    const handlePaymentGatewayClick = async () => {
        if (!currentUser) {
            navigate(ROUTES.PAYMENT_GATEWAY);
            return;
        }

        setIsCheckingPayment(true);
        try {
            const companyId = (currentUser as any).companyId || currentUser.uid;
            const paymentDocRef = doc(db, 'companies', companyId, 'payment_gateway', companyId);
            const paymentDoc = await getDoc(paymentDocRef);

            if (paymentDoc.exists()) {
                const data = paymentDoc.data();
                if (data.accountNumber && data.name) {
                    navigate('/payment-gateway/dashboard');
                    return;
                }
            }
            navigate(ROUTES.PAYMENT_GATEWAY);
        } catch (err) {
            console.error('Payment Gateway check failed:', err);
            navigate(ROUTES.PAYMENT_GATEWAY);
        } finally {
            setIsCheckingPayment(false);
        }
    };

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden bg-gray-100">
            {/* Header */}
            <div className="z-30 bg-white border-b border-gray-100 pb-6 pt-6 px-6 shadow-sm flex-none">
                <div className="flex items-start gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="mt-1 flex items-center justify-center p-2 rounded-full bg-gray-50 text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-all"
                        title="Go Back"
                    >
                        <IconClose />
                    </button>
                    <div className="flex flex-col">
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
                            Add Ons
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Extend your Catalogue with powerful integrations
                        </p>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto bg-slate-100 space-y-3 pt-4 pb-24 px-2">
                <CustomCard
                    onClick={() => {
                        if (!isChecking) handleWhatsappClick();
                    }}
                    className="transition-all cursor-pointer hover:shadow-md active:scale-[0.99]"
                >
                    <div className="flex items-center justify-between py-2">
                        <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-lg font-semibold text-slate-800">
                                    WhatsApp Integration
                                </h3>
                            </div>
                            <p className="text-sm text-slate-500">
                                {isChecking
                                    ? 'Checking connection status...'
                                    : 'Connect your Catalogue to WhatsApp for seamless communication.'}
                            </p>
                        </div>

                        <div className="flex items-center">
                            <button
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400"
                                disabled={isChecking}
                            >
                                {isChecking ? (
                                    <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <IconChevronDown className="w-5 h-5 -rotate-90" />
                                )}
                            </button>
                        </div>
                    </div>
                </CustomCard>
                <CustomCard
                    onClick={() => {
                        if (!isCheckingPayment) handlePaymentGatewayClick();
                    }}
                    className="transition-all cursor-pointer hover:shadow-md active:scale-[0.99]"
                >
                    <div className="flex items-center justify-between py-2">
                        <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-lg font-semibold text-slate-800">
                                    Payment Gateway
                                </h3>
                            </div>
                            <p className="text-sm text-slate-500">
                                {isCheckingPayment
                                    ? 'Checking payment status...'
                                    : 'Integrate payment gateway with bank account details and EMI information.'}
                            </p>
                        </div>

                        <div className="flex items-center">
                            <button
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400"
                                disabled={isCheckingPayment}
                            >
                                {isCheckingPayment ? (
                                    <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <IconChevronDown className="w-5 h-5 -rotate-90" />
                                )}
                            </button>
                        </div>
                    </div>
                </CustomCard>
                <CustomCard className="transition-all cursor-not-allowed opacity-60 bg-slate-50">
                    <div className="flex items-center justify-between py-2">
                        <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-1 min-w-0">
                                <h3 className="text-lg font-semibold text-slate-800 whitespace-nowrap">
                                    Inventory Management
                                </h3>
                                <span className="bg-sky-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-xs uppercase tracking-wide border border-gray-300">
                                    Coming Soon
                                </span>
                            </div>
                            <p className="text-sm text-slate-500">
                                Track stock levels, manage items, and adjust pricing.
                            </p>
                        </div>

                        <div className="flex items-center">
                            <button
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-gray-300"
                                disabled
                            >
                            </button>
                        </div>
                    </div>
                </CustomCard>
                <CustomCard className="transition-all cursor-not-allowed opacity-60 bg-slate-50">
                    <div className="flex items-center justify-between py-2">
                        <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-lg font-semibold text-slate-800">
                                    Label Design
                                </h3>
                                <span className="bg-sky-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-xs uppercase tracking-wide border border-gray-300">
                                    Coming Soon
                                </span>
                            </div>
                            <p className="text-sm text-slate-500">
                                Custom label design for your products. ₹1,100 per design.
                            </p>
                        </div>

                        <div className="flex items-center">
                            <button
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-gray-300"
                                disabled
                            >
                            </button>
                        </div>
                    </div>
                </CustomCard>

                <CustomCard className="transition-all cursor-not-allowed opacity-60 bg-slate-50">
                    <div className="flex items-center justify-between py-2">
                        <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-lg font-semibold text-slate-800">
                                    Bill Design
                                </h3>
                                <span className="bg-sky-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-xs uppercase tracking-wide border border-gray-300">
                                    Coming Soon
                                </span>
                            </div>
                            <p className="text-sm text-slate-500">
                                Custom bill design for your business. ₹1,100 per design.
                            </p>
                        </div>

                        <div className="flex items-center">
                            <button
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-gray-300"
                                disabled
                            >
                            </button>
                        </div>
                    </div>
                </CustomCard>
            </div>
        </div>
    );
};

export default CatalogueAdditionalServices;