import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { PLANS } from '../../enums';
import { useNavigate } from 'react-router-dom';

// --- HELPER: Feature Descriptions ---
const FEATURE_DESCRIPTIONS: Record<string, string> = {
    'Vendor POS Dashboard Access': 'A central hub to manage sales, inventory, and staff from any device.',
    'Total Sale Board': 'Real-time overview of your total revenue and transaction counts.',
    'Automated Sales Reports': 'Detailed insights into what is selling, when, and to whom, generated automatically.',
    'Custom Voucher Numbering': 'Define your own series for invoices (e.g., SAL/2024/001).',
    'Bar Code + QR Code Scanner': 'Quickly add items to bills using your device camera or a physical scanner.',
    'Autofill Bill Amount & Balances': 'Automatically calculates change and tracks pending customer balances.',
    'Bulk Import Items': 'Upload your entire inventory at once using an Excel/CSV file.',
    'Parent Categorisation of Items': 'Organize products into main categories and sub-categories for better tracking.',
    'Automated Invoice Generation': 'Create professional GST or non-GST bills instantly after a sale.',
    'GST composition': 'Handles specific tax rules for businesses under the GST Composition Scheme.',
    'Daily Performance Board': 'Compare today\'s sales against previous days to track growth.',
    'Payment Methods Board': 'Track revenue split by Cash, Card, UPI, and other custom modes.',
    'Top Items Sold Board': 'Identify your best-selling products to manage stock efficiently.',
    'Top Salesman Board': 'Monitor sales performance of individual staff members.',
    'Restock Items Board': 'Alerts you when items fall below their minimum stock levels.',
    'Hide Data Functionality': 'Hide sensitive financial data from staff views.',
    'Amount vs Quantity in Boards': 'Toggle between volume-based and value-based data visualizations.',
    'Sales return voucher': 'Process customer returns and automatically update inventory.',
    'Voucher/Invoice modification': 'Ability to edit and correct invoices after they have been saved.',
    'Purchase voucher': 'Record stock entry and update purchase prices.',
    'Shortcut Barcode Printing': 'Quickly generate and print labels for new stock.',
    'Purchase return voucher': 'Record and track returns made to your suppliers.',
    'Payment reminder feature': 'Track credit sales and notify customers of pending dues.',
    'Transaction filter & search': 'Find any past invoice instantly by number, date, or customer.',
    'Multi-store functionality': 'Manage multiple branch locations and stock transfers from one account.',
    'Automated business card making': 'Generate digital visiting cards for your business.',
    'Automated purchase reports': 'Comprehensive logs of all stock buying history.',
    'Automated Item reports': 'Performance and history logs for every item in your store.',
    'Automated PnL reports': 'Instant Profit and Loss statements based on your operations.',
    'Downloadable reports': 'Export any data to Excel or PDF for offline use.',
    'List vs Card view': 'Choose between a fast list layout or a visual card layout with product images.',
    'Salesman wise billing': 'Tag specific salesmen to invoices for commission tracking.',
    'Automated rounding off (upto ₹100)': 'Smartly rounds off bill totals to avoid change issues.',
    'Item-wise discount setting': 'Set specific discount rules for individual products.',
    'Negative inventory billing': 'Continue selling items even if they are out of stock in the system.',
    'Customer database management': 'Store customer names, numbers, and purchase history.',
    'Custom barcode generation': 'Create unique barcodes for items that don\'t have them.',
    'Supplier database management': 'Maintain records of your vendors and purchase history.',
    'Custom users management': 'Add staff members with unique logins.',
    'Custom user app permissions': 'Control exactly what each staff member can see or edit.',
    'Discount/Sale amount secret editor': 'A secure tool to adjust past totals for bookkeeping.',
    'Credit Note functionality': 'Issue credit to customers instead of cash refunds.',
    'Exchange items functionality': 'Streamlined process for item-for-item swapping.',
    'Multi-tax Purchase vouchering': 'Handle multiple tax brackets in a single purchase entry.',
    'Individual barcode printing': 'Print specific barcodes for individual items as needed.',
    'Credit sales setting': 'Enable or disable the ability to sell items on credit.',
    'Multiple owners in same company': 'Grant full administrative access to business partners.'
};

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
    ...BASIC_FEATURES,
    'Daily Performance Board',
    'Payment Methods Board',
    'Top Items Sold Board',
    'Top Salesman Board',
    'Restock Items Board',
    'Hide Data Functionality',
    'Amount vs Quantity in Boards',
    'Sales return voucher',
    'Voucher/Invoice modification',
    'Purchase voucher',
    'Shortcut Barcode Printing',
    'Purchase return voucher',
    'Payment reminder feature',
    'Transaction filter & search',
    'Multi-store functionality',
    'Automated business card making',
    'Automated purchase reports',
    'Automated Item reports',
    'Automated PnL reports',
    'Downloadable reports',
    'List vs Card view',
    'Salesman wise billing',
    'Automated rounding off (upto ₹100)',
    'Item-wise discount setting',
    'Negative inventory billing',
    'Customer database management',
    'Custom barcode generation',
    'Supplier database management',
    'Custom users management',
    'Custom user app permissions',
    'Discount/Sale amount secret editor',
    'Credit Note functionality',
    'Exchange items functionality',
    'Multi-tax Purchase vouchering',
    'Individual barcode printing',
    'Credit sales setting',
    'Multiple owners in same company'
];

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

    const [activeTab, setActiveTab] = useState<'pos' | 'catalogue'>('pos');
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
    const [isDetailsOpen] = useState(true);
    const [selectedTooltip, setSelectedTooltip] = useState<string | null>(null);

    const subData = (currentUser as any)?.subscription || (currentUser as any)?.Subscription;
    const currentPack = subData?.pack || PLANS.BASIC;
    const isPlanActive = subData?.isActive || false;
    const expiryDate = subData?.expiryDate;

    const showActiveView = currentPack !== 'free' && currentPack !== PLANS.BASIC && isPlanActive;
    const currentTiers = activeTab === 'pos' ? POS_TIERS : CATALOGUE_TIERS;

    const allFeatures = useMemo(() => {
        if (activeTab === 'pos') return PRO_FEATURES;
        const features = new Set<string>();
        currentTiers.forEach(tier => tier.features.forEach(f => features.add(f)));
        return Array.from(features);
    }, [currentTiers, activeTab]);

    useEffect(() => {
        const handleOutsideClick = () => setSelectedTooltip(null);
        if (selectedTooltip) {
            window.addEventListener('click', handleOutsideClick);
        }
        return () => window.removeEventListener('click', handleOutsideClick);
    }, [selectedTooltip]);

    const ActivePlanCollapsible = () => (
        <div className="max-w-4xl mx-auto mb-8 transition-all duration-300">
            <div className="bg-white rounded-sm shadow-md border border-green-100 overflow-hidden">
                <div className="bg-green-600 p-4 flex justify-between items-center cursor-pointer hover:bg-green-700 transition-colors">
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

                <div className="bg-white rounded-sm shadow-xl border border-gray-200 max-w-5xl mx-auto overflow-visible">
                    <div className="relative">
                        {/* Changed table-fixed to auto-layout to prevent truncation */}
                        <table className="w-full border-collapse">
                            <thead className="sticky top-16 z-30 shadow-sm">
                                <tr>
                                    {/* Increased width for Features column */}
                                    <th className="p-4 text-left w-1/2 bg-gray-50 border-b border-gray-200 align-bottom">
                                        <span className="text-gray-500 font-medium text-xs sm:text-sm uppercase tracking-wider">Features</span>
                                    </th>
                                    {currentTiers.map(tier => (
                                        <th
                                            key={tier.id}
                                            className={`p-4 text-center border-b border-gray-200 relative ${tier.recommended ? 'bg-yellow-50' : 'bg-white'}`}
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

                            <tbody className="divide-y divide-gray-100">
                                {allFeatures.map((feature, idx) => (
                                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                        <td className="p-3 text-xs sm:text-sm font-medium text-gray-700 pl-4 sm:pl-8">
                                            <div className="flex items-center gap-2">
                                                {/* Removed truncate class to show full text */}
                                                <span className="whitespace-normal leading-tight">{feature}</span>
                                                {FEATURE_DESCRIPTIONS[feature] && (
                                                    <div className="relative inline-block leading-none flex-shrink-0">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedTooltip(selectedTooltip === feature ? null : feature);
                                                            }}
                                                            className="text-gray-400 hover:text-blue-500 transition-colors focus:outline-none"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                        </button>
                                                        {selectedTooltip === feature && (
                                                            <div 
                                                                className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-48 p-2 bg-gray-900 text-white text-[10px] leading-tight rounded-md shadow-lg z-50 animate-in fade-in zoom-in duration-200"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {FEATURE_DESCRIPTIONS[feature]}
                                                                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
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