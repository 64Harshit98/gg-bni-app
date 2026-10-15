import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { PLANS } from '../../enums';
import BackButton from '../../Components/BackButton';
import { db } from '../../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { logoutUser } from '../../lib/AuthOperations';
import { ROUTES } from '../../constants/routes.constants';
import { validateCoupon, createIciciOrder } from '../../lib/PaymentOperations';

// --- HELPER: Feature Descriptions ---
const FEATURE_DESCRIPTIONS: Record<string, string> = {
    'Calculator Billing': 'A quick-entry billing mode that works like a calculator for fast checkouts.',
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
    'Multiple owners in same company': 'Grant full administrative access to business partners.',
    'Completed Sales Board': 'Overview of completed orders and total revenue for the day.',
    'Order Journey Tracking': 'Track every order through Confirmed, Packed, and Completed stages.',
    'Top 5 Items Sold Board': 'See your best-selling catalogue products in the selected period.',
    'Restock Alerts': 'Get notified when catalogue items need restocking.',
    'Sales Report': 'Detailed log of all completed sales transactions.',
    'Customer Report': 'Insights into your customer base and their order history.',
    'Profit & Loss Report': 'Instant P&L summary based on catalogue orders.',
    'Item Report': 'Performance and sales history for every catalogue item.',
    'Online Catalogue': 'A digital storefront where customers can browse your products online.',
    'Share on WhatsApp': 'Share your catalogue link directly with customers via WhatsApp.',
    'Receive Orders': 'Accept and manage incoming customer orders from your catalogue.',
    'Online Payments': 'Collect payments digitally through your catalogue store.',
    'Custom Domain': 'Use your own branded domain name for your online catalogue.',
    'Order Analytics': 'Detailed breakdown of order trends, volumes, and performance.'

};

const BASIC_FEATURES = [
    'Calculator Billing',
    'Vendor POS Dashboard Access',
    'Total Sale Board',
    'Automated Sales Reports',
    'Custom Voucher Numbering',
    'Autofill Bill Amount & Balances',
    'Daily Performance Board',
    'Payment Methods Board',
    'Hide Data Functionality',
    'Amount vs Quantity in Boards',
    'Transaction filter & search',
    'Automated business card making',
];

const PRO_FEATURES = [
    ...BASIC_FEATURES.filter(f => f !== 'Calculator Billing'),
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
        id: PLANS.POS_BASIC,
        name: 'POS Basic (Cal-C)',
        price: { monthly: '₹99', yearly: '₹999' },
        originalPrice: { monthly: '₹199', yearly: '₹1,999' },
        description: 'Essential tools for small businesses.',
        features: BASIC_FEATURES,
        recommended: false,
    },
    {
        id: PLANS.POS_PRO || 'pro',
        name: 'POS Pro (POSi)',
        price: { monthly: '₹299', yearly: '₹2,999' },
        originalPrice: { monthly: '₹499', yearly: '₹3,999' },
        description: 'Complete solution for growing businesses.',
        features: PRO_FEATURES,
        recommended: true,
    }
];

const CATALOGUE_TIERS = [
    {
        id: PLANS.CATALOGUE_PRO,
        name: 'Premium',
        price: { monthly: '₹499', yearly: '₹4,999' },
        originalPrice: { monthly: '₹799', yearly: '₹7,999' },
        description: 'Store + Payments.',
        features: [
            'Online Catalogue',
            'Share on WhatsApp',
            'Receive Orders',
            'Online Payments',
            'Custom Domain',
            'Order Analytics',
            'Completed Sales Board',
            'Order Journey Tracking',
            'Daily Performance Board',
            'Top 5 Items Sold Board',
            'Restock Alerts',
            'Sales Report',
            'Customer Report',
            'Profit & Loss Report',
            'Item Report',
        ],
        recommended: true,
    }
];
const BOTH_TIERS = [
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: { monthly: '₹799', yearly: '₹7,999' },
        originalPrice: { monthly: '₹1,299', yearly: '₹12,999' },
        description: 'Store + Payments + Catalogue.',
        features: [
            ...new Set([...PRO_FEATURES, ...CATALOGUE_TIERS[0].features])  // ← merge both, no duplicates
        ],
        recommended: true,
    }
];

// ---------------------------------------------------------------------------
// UI-only: SELLAR design system, Tailwind classes (no custom CSS).
// POS / Both use the blue theme; the Catalogue tab switches to the SELLAR
// Catalogue orange tokens (primary #c2410c, soft #ffedd5, canvas #fff5ec).
// NOTE: class names are written out in full (not built dynamically) so
// Tailwind's JIT can pick them up.
// ---------------------------------------------------------------------------
const THEME_POS = {
    canvas: 'bg-[#eef2ff]',
    border: 'border-[#dfe6fb]',
    borderB: 'border-b-[#dfe6fb]',
    sunken: 'bg-[#f5f7ff]',
    sunkenHover: 'hover:bg-[#f5f7ff]',
    soft: 'bg-[#e6eeff]',
    softHover: 'hover:bg-[#e6eeff]',
    primaryText: 'text-[#155dfc]',
    primaryBg: 'bg-[#155dfc]',
    primaryHover: 'hover:bg-[#1447e6]',
    primaryBorder: 'border-[#155dfc]',
    outline: 'focus-visible:outline-[#155dfc]',
    accent: 'accent-[#155dfc]',
    chipBg: 'bg-[#fff3dd]',
    chipText: 'text-[#bb4d00]',
};
const THEME_CAT = {
    canvas: 'bg-[#fff5ec]',
    border: 'border-[#f3dfcf]',
    borderB: 'border-b-[#f3dfcf]',
    sunken: 'bg-[#fff9f4]',
    sunkenHover: 'hover:bg-[#fff9f4]',
    soft: 'bg-[#ffedd5]',
    softHover: 'hover:bg-[#ffedd5]',
    primaryText: 'text-[#c2410c]',
    primaryBg: 'bg-[#c2410c]',
    primaryHover: 'hover:bg-[#9a3412]',
    primaryBorder: 'border-[#c2410c]',
    outline: 'focus-visible:outline-[#c2410c]',
    accent: 'accent-[#c2410c]',
    chipBg: 'bg-[#fef3c7]',
    chipText: 'text-[#a16207]',
};

const COLLAPSED_FEATURE_COUNT = 6;

type Tier = {
    id: string;
    name: string;
    price: { monthly: string; yearly: string };
    originalPrice: { monthly: string; yearly: string };
    description: string;
    features: string[];
    recommended: boolean;
};

const PRODUCT_TABS: { id: 'pos' | 'catalogue' | 'both'; label: string; desc: string }[] = [
    { id: 'pos', label: 'POS', desc: 'Billing, stock and staff at the counter' },
    { id: 'catalogue', label: 'Catalogue', desc: 'Online catalogue your customers can order from' },
    { id: 'both', label: 'Both', desc: 'POS and Catalogue together' },
];

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const parseRupees = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;
const splitPlanName = (name: string) => {
    const m = name.match(/^(.*?)\s*\((.*)\)\s*$/);
    return m ? { title: m[1], code: m[2] } : { title: name, code: '' };
};

const Svg: React.FC<{ d: string; size?: number; stroke?: number }> = ({ d, size = 16, stroke = 1.75 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
    </svg>
);
const IconCrown = ({ size = 20 }: { size?: number }) => <Svg d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" size={size} />;
const IconChevron: React.FC<{ open?: boolean }> = ({ open }) => (
    <span className={`inline-flex transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
        <Svg d="m6 9 6 6 6-6" size={16} />
    </span>
);

const Included: React.FC<{ small?: boolean }> = ({ small }) => (
    <span
        className={`inline-grid place-items-center rounded-full shrink-0 bg-[#e9faef] text-[#008236] ${small ? 'w-[18px] h-[18px]' : 'w-6 h-6'}`}
        aria-label="Included"
    >
        <Svg d="M5 12.5l4.5 4.5L19 7" size={small ? 11 : 14} stroke={2.5} />
    </span>
);
const NotIncluded: React.FC<{ small?: boolean; bg: string }> = ({ small, bg }) => (
    <span
        className={`inline-grid place-items-center rounded-full shrink-0 ${bg} text-[#5b6b86] ${small ? 'w-[18px] h-[18px]' : 'w-6 h-6'}`}
        aria-label="Not included"
    >
        <Svg d="M6 6l12 12M18 6 6 18" size={small ? 11 : 14} stroke={2.5} />
    </span>
);

const SubscriptionPage: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
    try { await logoutUser(); navigate(ROUTES.LANDING); }
    catch (err) { console.error('Logout failed:', err); }
};

// Go back exactly one page in history (minus 1).
// If there is no previous page (e.g. page opened directly / refreshed in a new tab),
// fall back to the plan's dashboard so the user is never stuck.
const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
        navigate(-1);
    } else {
        navigate(dashboardRoute, { replace: true });
    }
};

const [activeTab, setActiveTab] = useState<'pos' | 'catalogue' | 'both'>('pos');
    const [showAllFeatures, setShowAllFeatures] = useState(false);

    // Catalogue tab → orange theme, everything else → blue theme
    const T = activeTab === 'catalogue' ? THEME_CAT : THEME_POS;

    const subData = (currentUser as any)?.subscription || (currentUser as any)?.Subscription;
    const currentPack = subData?.pack || PLANS.POS_BASIC;
    const isPlanActive = subData?.isActive || false;
    const expiryDate = subData?.expiryDate;

    // The page the user arrived from may no longer be allowed under their
    // (possibly just-changed) plan, so send them to their plan's own
    // dashboard instead of blindly going back through browser history —
    // mirrors the redirect PermissionWrapper itself uses for isCatalogueOnly.
    const isCatalogueOnly = currentPack === PLANS.CATALOGUE_PRO || currentPack === PLANS.CALC_CATALOG;
    const dashboardRoute = isCatalogueOnly ? ROUTES.CHOME : ROUTES.HOME;

    const [userEmail, setUserEmail] = useState<string>('');
    useEffect(() => {
        const fetchEmail = async () => {
            if (!currentUser?.uid || !(currentUser as any)?.companyId) return;
            const userDocRef = doc(db, 'companies', (currentUser as any).companyId, 'users', currentUser.uid);
            const snap = await getDoc(userDocRef);
            if (snap.exists()) setUserEmail(snap.data()?.email || '');
        };
        fetchEmail();
    }, [currentUser]);
    const showActiveView = isPlanActive;
    const currentTiers: Tier[] = activeTab === 'pos' ? POS_TIERS : activeTab === 'catalogue' ? CATALOGUE_TIERS : BOTH_TIERS;

    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState('');

    // --- Checkout modal state ---
    const [checkoutTier, setCheckoutTier] = useState<{ id: string; name: string; price: number } | null>(null);
    const [couponInput, setCouponInput] = useState('');
    const [couponApplying, setCouponApplying] = useState(false);
    const [couponError, setCouponError] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountAmount: number; taxAmount: number; finalAmount: number } | null>(null);
    const [paying, setPaying] = useState(false);
    const [payError, setPayError] = useState('');
    const [confirmPlanSwitch, setConfirmPlanSwitch] = useState(false);

    const ALL_TIERS = useMemo(() => [...POS_TIERS, ...CATALOGUE_TIERS, ...BOTH_TIERS], []);
    const currentPlanName = ALL_TIERS.find(t => t.id === currentPack)?.name || currentPack;
    const isSwitchingPlan = isPlanActive && !!checkoutTier && checkoutTier.id !== currentPack;

    const TAX_RATE = 0.18; // 18% GST, applied on every plan — kept in sync with functions/lib/index.js

    const yearlyPriceToNumber = (price: string) => Number(price.replace(/[^\d]/g, '')) || 0;

    const checkoutBreakdown = useMemo(() => {
        if (!checkoutTier) return null;
        if (appliedCoupon) {
            return {
                discountAmount: appliedCoupon.discountAmount,
                taxAmount: appliedCoupon.taxAmount,
                total: appliedCoupon.finalAmount,
            };
        }
        const taxAmount = Math.round(checkoutTier.price * TAX_RATE);
        return { discountAmount: 0, taxAmount, total: checkoutTier.price + taxAmount };
    }, [checkoutTier, appliedCoupon]);

    const openCheckout = (tier: { id: string; name: string; price: { yearly: string } }) => {
        setCheckoutTier({ id: tier.id, name: tier.name, price: yearlyPriceToNumber(tier.price.yearly) });
        setCouponInput('');
        setCouponError('');
        setAppliedCoupon(null);
        setPayError('');
        setConfirmPlanSwitch(false);
    };

    const handleApplyCoupon = async () => {
        if (!checkoutTier || !couponInput.trim()) return;
        setCouponApplying(true);
        setCouponError('');
        try {
            const result = await validateCoupon(couponInput.trim(), checkoutTier.id);
            if (!result.valid) {
                setCouponError(result.message);
                setAppliedCoupon(null);
            } else {
                setAppliedCoupon({
                    code: couponInput.trim().toUpperCase(),
                    discountAmount: result.discountAmount,
                    taxAmount: result.taxAmount,
                    finalAmount: result.finalAmount,
                });
            }
        } catch (err: any) {
            setCouponError(err.message || 'Failed to validate coupon.');
            setAppliedCoupon(null);
        } finally {
            setCouponApplying(false);
        }
    };

    const handlePayNow = async () => {
        if (!checkoutTier) return;
        setPaying(true);
        setPayError('');
        try {
            const order = await createIciciOrder(checkoutTier.id, appliedCoupon?.code);
            window.location.href = order.redirectURI;
        } catch (err: any) {
            setPayError(err.message || 'Failed to start payment.');
            setPaying(false);
        }
    };

    const allFeatures = useMemo(() => {
        if (activeTab === 'pos') {
            const proOnly = PRO_FEATURES.filter(f => !BASIC_FEATURES.includes(f));
            return [...BASIC_FEATURES, ...proOnly];
        }
        const features = new Set<string>();
        currentTiers.forEach(tier => tier.features.forEach(f => features.add(f)));
        return Array.from(features);
    }, [currentTiers, activeTab]);

    const visibleFeatures = showAllFeatures ? allFeatures : allFeatures.slice(0, COLLAPSED_FEATURE_COUNT);
    const hasMoreFeatures = allFeatures.length > COLLAPSED_FEATURE_COUNT;
    const moreLabel = showAllFeatures ? 'Show fewer features' : `Show all ${allFeatures.length} features`;

    // On phones the recommended plan comes first.
    const mobileTiers = useMemo(
        () => [...currentTiers].sort((a, b) => Number(b.recommended) - Number(a.recommended)),
        [currentTiers]
    );

    // --- Display helpers (UI only) ---
    const priceInfo = (tier: Tier) => {
        const yearly = parseRupees(tier.price.yearly);
        const was = parseRupees(tier.originalPrice?.yearly || '');
        return { yearly, was, save: was > yearly ? was - yearly : 0, perMonth: Math.round(yearly / 12) };
    };

    const planButtonLabel = (tier: Tier, isCurrentTier: boolean) => {
        if (isCurrentTier) return 'Renew plan';
        if (isPlanActive) return `Switch to ${splitPlanName(tier.name).title}`;
        return 'Choose plan';
    };
    const badgeText = (isCurrentTier: boolean) =>
        isCurrentTier ? 'Current plan' : activeTab === 'catalogue' ? 'Best seller' : 'Recommended';

    const currentSplit = splitPlanName(String(currentPlanName));
    const expiryText = expiryDate
        ? new Date((expiryDate as any).toDate ? (expiryDate as any).toDate() : expiryDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
        : 'Lifetime / Unknown';
    const accountName = (currentUser as any)?.name || (currentUser as any)?.displayName || '—';

    const showEnterpriseNote = isPlanActive && currentPack === BOTH_TIERS[0].id;
    const colWidth = currentTiers.length === 1 ? '40%' : '26%';
    const checkoutTotal = (checkoutBreakdown?.total ?? checkoutTier?.price ?? 0).toLocaleString('en-IN');

    // --- Tailwind class building blocks ---
    const btn = 'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-sm border border-transparent text-sm font-medium leading-5 whitespace-nowrap transition-colors disabled:opacity-45 disabled:cursor-not-allowed';
    const btnPrimary = `${btn} ${T.primaryBg} ${T.primaryHover} text-white`;
    const btnSecondary = `${btn} bg-white text-[#0f172b] !border-[#7a8aa3] ${T.sunkenHover}`;
    const btnGhost = `${btn} text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b]`;
    const btnDangerSm = `${btn} !h-8 !px-3 !text-[13px] text-[#d5000c] hover:bg-[#ffeef0]`;
    const card = `bg-white border ${T.border} rounded-sm shadow-sm min-w-0`;
    const recBadge = 'inline-flex items-center h-[22px] px-2.5 rounded-full text-[10px] font-semibold tracking-[.06em] uppercase text-white whitespace-nowrap';
    const saveChip = 'inline-block text-[11px] leading-5 font-semibold text-[#008236] bg-[#e9faef] px-2 rounded-full';
    const caption = 'text-xs leading-[18px] text-[#5b6b86]';

    const planBtnClass = (tier: Tier, isCurrentTier: boolean) =>
        `${isCurrentTier || tier.recommended ? btnPrimary : btnSecondary} w-full`;

    return (
        <div className={`min-h-screen ${T.canvas} text-[#0f172b] font-[Poppins,system-ui,-apple-system,'Segoe_UI',sans-serif] text-sm leading-[22px] pb-20 transition-colors`}>
            {/* Top bar */}
            <div className={`sticky top-0 z-20 bg-white border-b ${T.borderB}`}>
                <div className="flex items-center gap-2 h-14 px-2 max-w-[1000px] mx-auto md:h-16 md:pl-4 md:pr-6 md:gap-3">
                    <BackButton onClick={handleBack} />
                    <div className="flex-1 min-w-0">
                        <div className="hidden md:block text-xs leading-4 text-[#5b6b86]">Account /</div>
                        <h1 className="m-0 text-lg leading-[26px] font-semibold truncate md:text-[22px] md:leading-[30px]">Plan &amp; subscription</h1>
                    </div>
                    <span className="hidden lg:block text-xs text-[#5b6b86]">Your SELLAR plan and what each plan includes</span>
                    <button onClick={handleLogout} className={btnDangerSm}>Log out</button>
                </div>
            </div>

            <div className="max-w-[1000px] mx-auto px-4 pt-3 pb-6 grid grid-cols-1 gap-3 md:px-6 md:pt-5 md:pb-8 md:gap-4">
                {showActiveView && (
                    <div className={`${card} flex items-start gap-3 p-3.5 md:items-center md:gap-4 md:px-5 md:py-[18px]`}>
                        <span className={`shrink-0 w-10 h-10 rounded-sm grid place-items-center ${T.chipBg} ${T.chipText}`}><IconCrown /></span>
                        <div className="flex-1 min-w-0">
                            <div className={caption}>Your plan</div>
                            <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1">
                                <b className="text-[17px] leading-[26px] font-semibold md:text-[22px] md:leading-[30px]">{currentSplit.title}</b>
                                {currentSplit.code && <span className={caption}>{currentSplit.code}</span>}
                                <span className="inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-semibold tracking-[.03em] leading-[22px] whitespace-nowrap bg-[#0f172b] text-white">CURRENT</span>
                            </div>
                            <div className="flex flex-wrap gap-x-7 gap-y-2.5 mt-2.5 md:mt-2">
                                <div className="flex flex-col gap-0.5 text-[13px] leading-5 min-w-0">
                                    <small className="text-[11px] leading-4 font-semibold tracking-[.06em] uppercase text-[#5b6b86]">Status</small>
                                    <span className="inline-flex items-center gap-1.5 text-[#008236] font-semibold">
                                        <i className="inline-block w-2 h-2 rounded-full bg-[#008236]" />Active
                                    </span>
                                </div>
                                <div className="flex flex-col gap-0.5 text-[13px] leading-5 min-w-0">
                                    <small className="text-[11px] leading-4 font-semibold tracking-[.06em] uppercase text-[#5b6b86]">Expires on</small>
                                    <b className="tabular-nums">{expiryText}</b>
                                </div>
                                <div className="flex flex-col gap-0.5 text-[13px] leading-5 min-w-0">
                                    <small className="text-[11px] leading-4 font-semibold tracking-[.06em] uppercase text-[#5b6b86]">Account</small>
                                    <span className="break-all">{accountName}{userEmail ? ` · ${userEmail}` : ''}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {showEnterpriseNote && (
                    <div className={`flex gap-2 items-start px-3 py-2.5 rounded-sm text-xs leading-[19px] ${T.soft} ${T.primaryText} md:text-[13px] md:items-center`}>
                        <span className="shrink-0 mt-0.5 md:mt-0"><IconCrown size={16} /></span>
                        <span>Enterprise already includes everything in the plans below. Paying for another plan replaces it.</span>
                    </div>
                )}

                {/* Product switch */}
                <div className="grid gap-2.5">
                    <h2 className="hidden md:block m-0 text-base leading-6 font-semibold">Compare plans</h2>

                    {/* phones: segmented control */}
                    <div className={`grid grid-cols-3 gap-0.5 p-[3px] ${T.sunken} border ${T.border} rounded-sm md:hidden`} role="group" aria-label="Product">
                        {PRODUCT_TABS.map(tab => (
                            <button
                                key={tab.id}
                                aria-pressed={activeTab === tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`h-9 rounded-sm border-0 text-sm font-medium transition-colors ${activeTab === tab.id ? `bg-white ${T.primaryText} shadow-sm` : 'bg-transparent text-[#45556c]'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* tablet / desktop: product cards */}
                    <div className="hidden md:grid grid-cols-3 gap-2.5" role="group" aria-label="Product">
                        {PRODUCT_TABS.map(tab => {
                            const on = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    aria-pressed={on}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex flex-col items-start justify-start gap-0.5 text-left rounded-sm text-[#0f172b] transition-colors ${on
                                        ? `border-2 ${T.primaryBorder} ${T.soft} px-[13px] py-[11px]`
                                        : `border border-[#7a8aa3] bg-white px-3.5 py-3 ${T.sunkenHover}`}`}
                                >
                                    <b className={`text-sm leading-[22px] font-semibold ${on ? T.primaryText : ''}`}>{tab.label}</b>
                                    <small className="text-xs leading-4 text-[#5b6b86]">{tab.desc}</small>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ---------- Desktop / tablet: comparison table ---------- */}
                <div className={`${card} hidden md:block overflow-hidden`}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-separate border-spacing-0">
                            <thead>
                                <tr>
                                    <th className={`align-bottom text-left font-normal px-4 py-3 text-[13px] bg-white border-b ${T.border}`}>
                                        <span className="text-[11px] leading-4 font-semibold tracking-[.08em] uppercase text-[#5b6b86]">Compare features</span>
                                    </th>
                                    {currentTiers.map(tier => {
                                        const isCurrentTier = isPlanActive && tier.id === currentPack;
                                        const { title, code } = splitPlanName(tier.name);
                                        const p = priceInfo(tier);
                                        return (
                                            <th
                                                key={tier.id}
                                                className={`align-top text-center font-normal px-4 pt-5 pb-4 border-b ${T.border} ${tier.recommended ? T.soft : 'bg-white'}`}
                                                style={{ width: colWidth }}
                                            >
                                                <div className="h-[22px] mb-1.5 flex justify-center">
                                                    {(isCurrentTier || tier.recommended) && (
                                                        <span className={`${recBadge} ${isCurrentTier ? 'bg-[#0f172b]' : T.primaryBg}`}>{badgeText(isCurrentTier)}</span>
                                                    )}
                                                </div>
                                                <div className="text-[17px] leading-6 font-semibold">{title}</div>
                                                <div className="text-[11px] leading-4 text-[#5b6b86] min-h-4">{code ? `Plan code ${code}` : ''}</div>
                                                <div className="text-[30px] leading-9 font-semibold mt-2 tabular-nums">
                                                    {p.was > p.yearly && <span className="text-[13px] text-[#5b6b86] line-through mr-2 font-normal">{rupees(p.was)}</span>}
                                                    {rupees(p.yearly)}
                                                </div>
                                                <div className={caption}>per year · about {rupees(p.perMonth)} a month</div>
                                                <div className="min-h-5 mt-1.5 mb-3">
                                                    {p.save > 0 && <span className={saveChip}>Save {rupees(p.save)}</span>}
                                                </div>
                                                <button onClick={() => openCheckout(tier)} className={planBtnClass(tier, isCurrentTier)}>
                                                    {planButtonLabel(tier, isCurrentTier)}
                                                </button>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {visibleFeatures.map(feature => (
                                    <tr key={feature}>
                                        <td className={`text-left px-4 py-3 text-[13px] bg-white border-b ${T.border}`}>
                                            <div className="font-medium text-[#0f172b] leading-5">{feature}</div>
                                            {FEATURE_DESCRIPTIONS[feature] && <div className="text-xs leading-[18px] text-[#5b6b86] mt-px">{FEATURE_DESCRIPTIONS[feature]}</div>}
                                        </td>
                                        {currentTiers.map(tier => (
                                            <td key={tier.id} className={`text-center px-4 py-3 border-b ${T.border} ${tier.recommended ? T.soft : 'bg-white'}`}>
                                                <span className="inline-flex">
                                                    {tier.features.includes(feature) ? <Included /> : <NotIncluded bg={T.sunken} />}
                                                </span>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {hasMoreFeatures && (
                        <button
                            className={`flex items-center gap-2 w-full px-4 py-3 border-0 ${T.sunken} ${T.primaryText} ${T.softHover} text-[13px] font-medium text-left transition-colors`}
                            aria-expanded={showAllFeatures}
                            onClick={() => setShowAllFeatures(v => !v)}
                        >
                            <IconChevron open={showAllFeatures} />{moreLabel}
                        </button>
                    )}
                </div>

                {/* ---------- Phones: one card per plan ---------- */}
                <div className="grid gap-3 md:hidden">
                    {mobileTiers.map(tier => {
                        const isCurrentTier = isPlanActive && tier.id === currentPack;
                        const { title, code } = splitPlanName(tier.name);
                        const p = priceInfo(tier);
                        const frame = isCurrentTier
                            ? 'border-2 border-[#0f172b] p-[13px]'
                            : tier.recommended
                                ? `border-2 ${T.primaryBorder} p-[13px]`
                                : 'border border-[#7a8aa3] p-3.5';
                        return (
                            <div key={tier.id} className={`relative grid gap-1.5 min-w-0 rounded-sm bg-white ${frame}`}>
                                {(isCurrentTier || tier.recommended) && (
                                    <span className={`${recBadge} absolute -top-[11px] right-3.5 ${isCurrentTier ? 'bg-[#0f172b]' : T.primaryBg}`}>{badgeText(isCurrentTier)}</span>
                                )}
                                <div className="flex items-baseline gap-2">
                                    <b className="text-base leading-6 font-semibold">{title}</b>
                                    {code && <span className={caption}>{code}</span>}
                                </div>
                                <div>
                                    <span className="text-2xl leading-8 font-semibold tabular-nums">{rupees(p.yearly)}</span>{' '}
                                    <span className={caption}>/ year{p.was > p.yearly && <> · <s>{rupees(p.was)}</s></>}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={caption}>About {rupees(p.perMonth)} a month</span>
                                    {p.save > 0 && <span className={saveChip}>Save {rupees(p.save)}</span>}
                                </div>
                                <ul className="grid gap-2 my-1.5 mx-0 p-0 list-none text-[13px] leading-5">
                                    {visibleFeatures.map(feature => {
                                        const has = tier.features.includes(feature);
                                        return (
                                            <li key={feature} className={`flex gap-2 items-center ${has ? '' : 'text-[#5b6b86]'}`}>
                                                {has ? <Included small /> : <NotIncluded small bg={T.sunken} />}
                                                {feature}
                                            </li>
                                        );
                                    })}
                                </ul>
                                {hasMoreFeatures && (
                                    <button
                                        className={`inline-flex items-center gap-1.5 self-start border-0 bg-transparent p-0 mb-1.5 ${T.primaryText} text-[13px] font-medium`}
                                        aria-expanded={showAllFeatures}
                                        onClick={() => setShowAllFeatures(v => !v)}
                                    >
                                        <IconChevron open={showAllFeatures} />{moreLabel}
                                    </button>
                                )}
                                <button onClick={() => openCheckout(tier)} className={planBtnClass(tier, isCurrentTier)}>
                                    {planButtonLabel(tier, isCurrentTier)}
                                </button>
                            </div>
                        );
                    })}
                </div>

                <p className="m-0 text-center text-xs leading-[18px] text-[#5b6b86]">All plans are billed yearly</p>
            </div>

            {/* ---------- Checkout pop-up (bottom sheet on phones) ---------- */}
            {checkoutTier && (
                <div className="fixed inset-0 z-50 bg-[rgba(2,6,24,.45)] flex items-end justify-center sm:items-center sm:p-4">
                    <div
                        className="bg-white w-full max-w-[448px] rounded-t-sm sm:rounded-sm shadow-2xl p-5 max-h-[92vh] overflow-y-auto text-[#0f172b]"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="sp-checkout-title"
                    >
                        <h3 id="sp-checkout-title" className="m-0 text-lg leading-[26px] font-semibold">Checkout</h3>
                        <p className="m-0 mt-0.5 mb-4 text-sm text-[#5b6b86]">{checkoutTier.name} — billed yearly</p>

                        <dl className={`grid gap-1.5 m-0 mb-4 p-4 ${T.sunken} border ${T.border} rounded-sm text-sm tabular-nums`}>
                            <div className="flex justify-between gap-3">
                                <dt className="text-[#45556c]">Plan price</dt>
                                <dd className="m-0 text-right">₹{checkoutTier.price.toLocaleString('en-IN')}</dd>
                            </div>
                            {appliedCoupon && (
                                <div className="flex justify-between gap-3 text-[#008236]">
                                    <dt>Coupon ({appliedCoupon.code})</dt>
                                    <dd className="m-0 text-right">-₹{appliedCoupon.discountAmount.toLocaleString('en-IN')}</dd>
                                </div>
                            )}
                            <div className="flex justify-between gap-3">
                                <dt className="text-[#45556c]">GST (18%)</dt>
                                <dd className="m-0 text-right">+₹{(checkoutBreakdown?.taxAmount ?? 0).toLocaleString('en-IN')}</dd>
                            </div>
                            <div className={`flex justify-between gap-3 items-baseline font-semibold text-base pt-2 mt-1 border-t ${T.border}`}>
                                <dt className="text-[#0f172b]">Total</dt>
                                <dd className="m-0 text-right text-xl">₹{checkoutTotal}</dd>
                            </div>
                        </dl>

                        <div className="mb-4">
                            <label htmlFor="sp-coupon" className="block text-[13px] font-medium mb-1.5">Coupon code</label>
                            <div className="flex gap-2">
                                <input
                                    id="sp-coupon"
                                    type="text"
                                    className={`flex-1 min-w-0 h-10 text-sm bg-white text-[#0f172b] border border-[#7a8aa3] rounded-sm px-3 placeholder:text-[#5b6b86] disabled:bg-[#f5f7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${T.outline}`}
                                    value={couponInput}
                                    onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setAppliedCoupon(null); setCouponError(''); }}
                                    placeholder="Enter code"
                                    disabled={!!appliedCoupon}
                                />
                                {appliedCoupon ? (
                                    <button className={btnSecondary} onClick={() => { setAppliedCoupon(null); setCouponInput(''); }}>
                                        Remove
                                    </button>
                                ) : (
                                    <button
                                        className={btnSecondary}
                                        onClick={handleApplyCoupon}
                                        disabled={couponApplying || !couponInput.trim()}
                                    >
                                        {couponApplying ? 'Checking…' : 'Apply'}
                                    </button>
                                )}
                            </div>
                            {appliedCoupon && <p className="m-0 mt-1.5 text-xs leading-[18px] text-[#008236]">Coupon applied ✓</p>}
                            {couponError && <p className="m-0 mt-1.5 text-xs leading-[18px] text-[#d5000c]">{couponError}</p>}
                        </div>

                        {isSwitchingPlan && (
                            <div className={`${T.chipBg} ${T.chipText} rounded-sm p-3 mb-4`}>
                                <p className="m-0 mb-2 text-[13px] leading-[19px]">
                                    You have an active <b>{currentPlanName}</b> plan. Paying for <b>{checkoutTier.name}</b> will replace it — your current plan will no longer be active.
                                </p>
                                <label className="flex items-start gap-2 text-xs leading-[18px] cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className={`mt-0.5 w-4 h-4 ${T.accent}`}
                                        checked={confirmPlanSwitch}
                                        onChange={(e) => setConfirmPlanSwitch(e.target.checked)}
                                    />
                                    I understand this will replace my current plan.
                                </label>
                            </div>
                        )}

                        {payError && <p className="m-0 mb-3 text-sm text-[#d5000c]">{payError}</p>}

                        <div className="flex items-center justify-end gap-2">
                            <button className={btnGhost} onClick={() => setCheckoutTier(null)}>Cancel</button>
                            <button
                                className={`${btnPrimary} flex-1 sm:flex-none sm:min-w-[160px]`}
                                onClick={handlePayNow}
                                disabled={paying || (isSwitchingPlan && !confirmPlanSwitch)}
                            >
                                {paying ? 'Processing…' : `Pay ₹${checkoutTotal}`}
                            </button>
                        </div>

                        <div className="mt-3 text-center">
                            <button
                                className="bg-transparent border-0 p-0 text-xs text-[#45556c] underline cursor-pointer hover:text-[#0f172b]"
                                onClick={() => {
                                    setSelectedPlan(checkoutTier.name);
                                    setCheckoutTier(null);
                                    setIsContactModalOpen(true);
                                }}
                            >
                                Prefer to pay offline? Contact admin instead
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isContactModalOpen && (
                <div className="fixed inset-0 z-50 bg-[rgba(2,6,24,.45)] flex items-end justify-center sm:items-center sm:p-4">
                    <div
                        className="bg-white w-full max-w-[448px] rounded-t-sm sm:rounded-sm shadow-2xl p-5 max-h-[92vh] overflow-y-auto text-[#0f172b]"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="sp-contact-title"
                    >
                        <h3 id="sp-contact-title" className="m-0 mb-2 text-lg leading-[26px] font-semibold">Contact admin</h3>
                        <p className="m-0 mb-4 text-[#45556c]">
                            To subscribe to <b className="text-[#0f172b]">{selectedPlan}</b>, please contact our admin:
                        </p>
                        <div className={`${T.sunken} border ${T.border} rounded-sm p-4 mb-5 text-center`}>
                            <p className={`m-0 mb-1 ${caption}`}>Call us at</p>
                            <a href="tel:9818815838" className={`text-2xl leading-8 font-semibold ${T.primaryText} no-underline tabular-nums`}>98188 15838</a>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <button className={`${btnPrimary} flex-1 sm:flex-none sm:min-w-[160px]`} onClick={() => setIsContactModalOpen(false)}>Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>

    );
};

export default SubscriptionPage;