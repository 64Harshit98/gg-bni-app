import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import bgMain from '../../assets/bg-main.png';
import sellarLogo from '../../assets/sellar-logo-heading.png';
import { ROUTES } from '../../constants/routes.constants';

// Landing page for the browser redirect ICICI sends after a customer
// completes (or abandons) checkout on its hosted page. Activation itself
// already happened server-side in paymentWebhook — this is purely a
// friendly confirmation screen.
const PaymentReturnPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const status = searchParams.get('status');
    const isSuccess = status === 'success';
    const isPending = status === 'pending';

    return (
        <div
            className="fixed inset-0 z-[100] h-screen w-screen overflow-hidden bg-cover bg-center md:bg-[center_top_75%]"
            style={{ backgroundImage: `url(${bgMain})` }}
        >
            <div className="absolute inset-0 bg-gradient-to-b from-white/35 via-white/25 to-white/35" />

            <div className="relative z-10 flex h-full w-full items-center justify-center px-4">
                <div className="flex w-full max-w-sm flex-col items-center rounded-lg bg-white/90 p-8 text-center shadow-2xl">
                    <img src={sellarLogo} alt="Sellar" className="mb-6 w-40" />

                    {isSuccess ? (
                        <>
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
                                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h1 className="text-lg font-bold text-gray-900">Payment successful</h1>
                            <p className="mt-1 text-sm text-gray-500">Your subscription has been activated.</p>
                        </>
                    ) : isPending ? (
                        <>
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h1 className="text-lg font-bold text-gray-900">Payment pending</h1>
                            <p className="mt-1 text-sm text-gray-500">We're still confirming your payment. Check back shortly.</p>
                        </>
                    ) : (
                        <>
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
                                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </div>
                            <h1 className="text-lg font-bold text-gray-900">Payment failed</h1>
                            <p className="mt-1 text-sm text-gray-500">Your payment could not be completed. No charges were activated.</p>
                        </>
                    )}

                    <button
                        onClick={() => navigate(ROUTES.SUBSCRIPTION_PAGE)}
                        className="mt-6 w-full rounded-md bg-blue-600 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700"
                    >
                        Back to Subscription
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentReturnPage;
