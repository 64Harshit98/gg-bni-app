import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/auth-context';
import { PLANS } from '../../enums';
import { useNavigate } from 'react-router-dom';

// --- HELPER: Full Feature List from Image ---
const BASIC_FEATURES = [
    'Vendor POS Dashboard Access',
    'Total Sale Board',
    'Automated Sales Reports',
    'Custom Voucher Numbering',
    'Bar Code + QR Code Scanner',
    'Autofill Bill Amount & Balances',
    'Bulk Import Items',
    'Parent Categorisation of Items',
    'Automated Invoice Generation',
    'GST composition'
];

const PRO_FEATURES = [
    ...BASIC_FEATURES, // Includes everything in Basic
    'Daily Performance Board',
    'Payment Methods Board',
    'Top Items Sold Board',
    'Top Salesman Board',
    'Restock Items Board',
    'Hide Data Functionality',
    'Amount vs Quantity in Boards',
    'Sales Return Voucher',
    'Voucher/Invoice modification',
    'Purchase Voucher',
    'Shortcut Barcode Printing',
    'Purchase Return Voucher',
    'Payment Reminder Feature',
    'Transaction Filter & Search',
    'Multi-Store Functionality',
    'Automated Business Card Making',
    'Automated Purchase Reports',
    'Automated Item Reports',
    'Automated PnL Reports',
    'Downloadable Reports',
    'List vs Card View',
    'Salesman wise Billing',
    'Automated Rounding Off (upto ₹100)',
    'Item-wise Discount Setting',
    'Negative Inventory Billing',
    'Customer Database Management',
    'Custom Barcode Generation',
    'Supplier Database Management',
    'Custom Users Management',
    'Custom User App Permissions',
    'Discount/Sale Amount Secret Editor',
    'Credit Note functionality',
    'Exchange Items Functionality',
    'Multi-tax Purchase Vouchering',
    'Individual Barcode Printing',
    'Credit Sales Setting',
    'Multiple Owners in Same Company'
];

// --- DATA: POS Plans ---
const POS_TIERS = [
    {
        id: PLANS.BASIC,
        name: 'POS Basic',
        price: { monthly: '₹99', yearly: '₹999' },
        description: 'Essential tools for small businesses.',
        features: BASIC_FEATURES,
        recommended: false,
    },
    {
        id: PLANS.PRO || 'pro',
        name: 'POS Pro',
        price: { monthly: '₹299', yearly: '₹2,999' },
        description: 'Complete solution for growing businesses.',
        features: PRO_FEATURES,
        recommended: true,
    }
];

// --- DATA: Catalogue Plans ---
const CATALOGUE_TIERS = [
    {
        id: 'cat_starter',
        name: 'Starter',
        price: { monthly: '₹149', yearly: '₹1,499' },
        description: 'Digital menu.',
        features: ['Online Catalogue', 'Share on WhatsApp', 'Receive Orders'],
        recommended: false,
    },
    {
        id: 'cat_premium',
        name: 'Premium',
        price: { monthly: '₹499', yearly: '₹4,999' },
        description: 'Store + Payments.',
        features: ['Online Catalogue', 'Share on WhatsApp', 'Receive Orders', 'Online Payments', 'Custom Domain', 'Order Analytics'],
        recommended: true,
    }
];

const SubscriptionPage: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    // --- STATE ---
    const [activeTab, setActiveTab] = useState<'pos' | 'catalogue'>('pos');
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
    const [isDetailsOpen] = useState(true);

    // --- DATA ACCESS ---
    const subData = (currentUser as any)?.subscription || (currentUser as any)?.Subscription;
    const currentPack = subData?.pack || PLANS.BASIC;
    const isPlanActive = subData?.isActive || false;
    const expiryDate = subData?.expiryDate;

    const showActiveView = currentPack !== 'free' && currentPack !== PLANS.BASIC && isPlanActive;

    // Select Tiers
    const currentTiers = activeTab === 'pos' ? POS_TIERS : CATALOGUE_TIERS;

    // Generate Unique Feature List for the table rows
    const allFeatures = useMemo(() => {
        // We want the rows to follow the order of PRO features primarily
        // If we just use a Set, order might be lost. 
        // Since Pro contains everything in Basic, we can just use the Pro list for the rows.
        if (activeTab === 'pos') return PRO_FEATURES;

        // For catalogue, merge them
        const features = new Set<string>();
        currentTiers.forEach(tier => tier.features.forEach(f => features.add(f)));
        return Array.from(features);
    }, [currentTiers, activeTab]);

    // --- COMPONENT: COLLAPSIBLE ACTIVE CARD ---
    const ActivePlanCollapsible = () => (
        <div className="max-w-4xl mx-auto mb-8 transition-all duration-300">
            <div className="bg-white rounded-sm shadow-md border border-green-100 overflow-hidden">
                <div
                    className="bg-green-600 p-4 flex justify-between items-center cursor-pointer hover:bg-green-700 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-sm">
                            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-lg leading-tight">
                                Current Plan: {currentPack.toUpperCase()}
                            </h2>
                            <p className="text-green-100 text-xs">
                                {isPlanActive ? 'Active Subscription' : 'Expired'}
                            </p>
                        </div>
                    </div>
                </div>
                <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isDetailsOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="p-6 bg-green-50/30">
                        <div className="grid grid-cols-2 sm:grid-cols-2 gap-6">
                            <div>
                                <p className="text-sm text-gray-500 uppercase font-bold tracking-wider">Status</p>
                                <div className="mt-1 flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-sm bg-green-500 animate-pulse"></span>
                                    <span className="text-base font-semibold text-gray-800">Active</span>
                                </div>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 uppercase font-bold tracking-wider">Expires On</p>
                                <p className="mt-1 text-base font-semibold text-gray-800">
                                    {expiryDate
                                        ? new Date((expiryDate as any).toDate ? (expiryDate as any).toDate() : expiryDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                                        : 'Lifetime / Unknown'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 pb-20 font-sans">
            {/* Header */}
            <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <button
                            onClick={() => navigate(-1)}
                            className={`flex items-center gap-2 transition-colors ${!isPlanActive ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-gray-900'}`}
                            disabled={!isPlanActive}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                            Back
                        </button>
                        <h1 className="text-xl font-bold text-gray-800">Subscription</h1>
                        <div className="w-10"></div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
                {showActiveView && <ActivePlanCollapsible />}

                {/* 1. Tab Switcher (POS / Catalogue) */}
                <div className="flex justify-center w-full mb-6">
                    <div className="bg-white p-1 rounded-sm shadow-sm border border-gray-200 inline-flex">
                        <button
                            onClick={() => setActiveTab('pos')}
                            className={`px-6 py-2 rounded-sm text-sm font-bold transition-all duration-200 ${activeTab === 'pos' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            POS Plans
                        </button>
                        <button
                            onClick={() => setActiveTab('catalogue')}
                            className={`px-6 py-2 rounded-sm text-sm font-bold transition-all duration-200 ${activeTab === 'catalogue' ? 'bg-sky-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            Catalogue Plans
                        </button>
                    </div>
                </div>

                {/* 2. Billing Cycle Toggle (Monthly / Yearly) */}
                <div className="flex justify-center w-full items-center mb-8 gap-4">
                    <span className={`text-sm font-medium ${billingCycle === 'monthly' ? 'text-gray-900 font-bold' : 'text-gray-500'}`}>
                        4 Weeks
                    </span>
                    <button
                        onClick={() => setBillingCycle(prev => prev === 'monthly' ? 'yearly' : 'monthly')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-sm transition-colors focus:outline-none ${billingCycle === 'yearly' ? 'bg-green-600' : 'bg-gray-300'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-sm bg-white transition duration-200 ease-in-out ${billingCycle === 'yearly' ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <span className={`text-sm font-medium ${billingCycle === 'yearly' ? 'text-gray-900 font-bold' : 'text-gray-500'}`}>
                        Yearly <span className="text-green-600 text-xs ml-1 font-bold">(Save 22.2%)</span>
                    </span>
                </div>

                {/* 3. COMPARISON TABLE */}
                <div className="bg-white rounded-sm shadow-xl border border-gray-200 max-w-5xl mx-auto overflow-visible">
                    <div className="relative">
                        <table className="w-full table-fixed border-collapse">
                            {/* TABLE HEADER - Sticky Implementation */}
                            <thead className="sticky top-16 z-30 shadow-sm">
                                <tr>
                                    <th className="p-4 text-left w-1/3 bg-gray-50 border-b border-gray-200 align-bottom">
                                        <span className="text-gray-500 font-medium text-xs sm:text-sm uppercase tracking-wider">Features</span>
                                    </th>
                                    {currentTiers.map(tier => (
                                        <th
                                            key={tier.id}
                                            className={`p-4 text-center border-b border-gray-200 relative ${tier.recommended ? 'bg-yellow-50' : 'bg-white'
                                                }`}
                                        >
                                            {tier.recommended && (
                                                <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-yellow-400 text-yellow-900 text-[9px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wide shadow-sm whitespace-nowrap z-10">
                                                    Recommended
                                                </span>
                                            )}
                                            <h3 className="text-sm sm:text-lg font-bold text-gray-900 truncate">{tier.name}</h3>
                                            <div className="mt-1 sm:mt-2">
                                                <span className="text-xl sm:text-3xl font-extrabold text-gray-900">
                                                    {tier.price[billingCycle]}
                                                </span>
                                                <span className="text-xs text-gray-500 block font-medium">
                                                    {billingCycle === 'monthly' ? 'per 4 weeks' : 'per year'}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => alert(`Contact Admin for ${tier.name} (${billingCycle})`)}
                                                className={`mt-3 w-full py-1.5 rounded-sm text-xs sm:text-sm font-bold transition-colors ${tier.recommended
                                                        ? activeTab === 'pos' ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-sky-600 text-white hover:bg-sky-700'
                                                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                                                    }`}
                                            >
                                                Choose
                                            </button>
                                        </th>
                                    ))}
                                </tr>
                            </thead>

                            {/* FEATURE ROWS */}
                            <tbody className="divide-y divide-gray-100">
                                {allFeatures.map((feature, idx) => (
                                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                        <td className="p-3 text-xs sm:text-sm font-medium text-gray-700 pl-4 sm:pl-8">
                                            {feature}
                                        </td>
                                        {currentTiers.map(tier => {
                                            const hasFeature = tier.features.includes(feature);
                                            return (
                                                <td key={tier.id} className="p-3 text-center">
                                                    {hasFeature ? (
                                                        <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600">
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </div>
                                                    ) : (
                                                        <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600">
                                                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
                                                            </svg>
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionPage;