import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { PLANS } from '../../enums';
import BackButton from '../../Components/BackButton';
import { db } from '../../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { logoutUser } from '../../lib/AuthOperations';
import { ROUTES } from '../../constants/routes.constants';
import { cn } from '../../lib/utils';
import { Button } from '../../Components/ui/button';
import { Badge } from '../../Components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
} from '../../Components/ui/dialog';
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from '../../Components/ui/tooltip';
import {
    LogOut,
    Calendar,
    Check,
    Minus,
    Info,
    Store,
    Layers,
    Crown,
    Phone,
    Sparkles,
    Clock,
    Mail,
    Copy,
    User,
    RefreshCw,
} from 'lucide-react';

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
        id: 'cat_premium',
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

const TABS: { key: 'pos' | 'catalogue' | 'both'; label: string; icon: React.ReactNode }[] = [
    { key: 'pos', label: 'POS', icon: <Store className="size-4" /> },
    { key: 'catalogue', label: 'Catalogue', icon: <Layers className="size-4" /> },
    { key: 'both', label: 'Both', icon: <Crown className="size-4" /> },
];

// Icon shown on the active-plan hero badge, keyed by plan id.
const PLAN_ICONS: Record<string, React.ReactNode> = {
    [PLANS.ENTERPRISE]: <Crown className="size-8 drop-shadow-sm" />,
    [PLANS.POS_PRO]: <Sparkles className="size-8 drop-shadow-sm" />,
    pro: <Sparkles className="size-8 drop-shadow-sm" />,
};

const DAYS_CYCLE_TOTAL = 365;
const RING_RADIUS = 16;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// Groups features into logical sections so the comparison table reads like
// a spec sheet instead of a flat wall of rows.
const CATEGORY_ORDER = [
    'Billing & Checkout',
    'Purchases & Inventory',
    'Dashboards & Insights',
    'Reports & Analytics',
    'Customers & Payments',
    'Team & Access',
    'Business Tools',
    'Online Catalogue',
];

const CATEGORY_OF: Record<string, string> = {
    'Calculator Billing': 'Billing & Checkout',
    'Automated Invoice Generation': 'Billing & Checkout',
    'Autofill Bill Amount & Balances': 'Billing & Checkout',
    'Custom Voucher Numbering': 'Billing & Checkout',
    'Automated rounding off (upto ₹100)': 'Billing & Checkout',
    'Item-wise discount setting': 'Billing & Checkout',
    'Negative inventory billing': 'Billing & Checkout',
    'Salesman wise billing': 'Billing & Checkout',
    'Credit sales setting': 'Billing & Checkout',
    'Discount/Sale amount secret editor': 'Billing & Checkout',
    'Exchange items functionality': 'Billing & Checkout',
    'Credit Note functionality': 'Billing & Checkout',
    'Sales return voucher': 'Billing & Checkout',
    'Voucher/Invoice modification': 'Billing & Checkout',
    'Shortcut Barcode Printing': 'Billing & Checkout',
    'Individual barcode printing': 'Billing & Checkout',
    'Custom barcode generation': 'Billing & Checkout',
    'Multi-tax Purchase vouchering': 'Purchases & Inventory',
    'Purchase voucher': 'Purchases & Inventory',
    'Purchase return voucher': 'Purchases & Inventory',
    'Restock Items Board': 'Purchases & Inventory',
    'Restock Alerts': 'Purchases & Inventory',
    'Supplier database management': 'Purchases & Inventory',
    'Vendor POS Dashboard Access': 'Dashboards & Insights',
    'Total Sale Board': 'Dashboards & Insights',
    'Daily Performance Board': 'Dashboards & Insights',
    'Payment Methods Board': 'Dashboards & Insights',
    'Top Items Sold Board': 'Dashboards & Insights',
    'Top Salesman Board': 'Dashboards & Insights',
    'Amount vs Quantity in Boards': 'Dashboards & Insights',
    'Completed Sales Board': 'Dashboards & Insights',
    'Top 5 Items Sold Board': 'Dashboards & Insights',
    'Hide Data Functionality': 'Dashboards & Insights',
    'List vs Card view': 'Dashboards & Insights',
    'Order Journey Tracking': 'Dashboards & Insights',
    'Automated Sales Reports': 'Reports & Analytics',
    'Automated purchase reports': 'Reports & Analytics',
    'Automated Item reports': 'Reports & Analytics',
    'Automated PnL reports': 'Reports & Analytics',
    'Downloadable reports': 'Reports & Analytics',
    'Sales Report': 'Reports & Analytics',
    'Customer Report': 'Reports & Analytics',
    'Profit & Loss Report': 'Reports & Analytics',
    'Item Report': 'Reports & Analytics',
    'Order Analytics': 'Reports & Analytics',
    'Payment reminder feature': 'Customers & Payments',
    'Customer database management': 'Customers & Payments',
    'Online Payments': 'Customers & Payments',
    'Custom users management': 'Team & Access',
    'Custom user app permissions': 'Team & Access',
    'Multiple owners in same company': 'Team & Access',
    'Transaction filter & search': 'Business Tools',
    'Multi-store functionality': 'Business Tools',
    'Automated business card making': 'Business Tools',
    'Online Catalogue': 'Online Catalogue',
    'Share on WhatsApp': 'Online Catalogue',
    'Receive Orders': 'Online Catalogue',
    'Custom Domain': 'Online Catalogue',
};

const SubscriptionPage: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try { await logoutUser(); navigate(ROUTES.LANDING); }
        catch (err) { console.error('Logout failed:', err); }
    };

    const [activeTab, setActiveTab] = useState<'pos' | 'catalogue' | 'both'>('pos');

    const subData = (currentUser as any)?.subscription || (currentUser as any)?.Subscription;
    const currentPack = subData?.pack || PLANS.POS_BASIC;
    const isPlanActive = subData?.isActive || false;
    const expiryDate = subData?.expiryDate;

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

    const showActiveView = isPlanActive && (
        currentPack === PLANS.ENTERPRISE ||
        currentPack === PLANS.POS_PRO ||
        currentPack === 'pro' ||
        currentPack === 'enterprise'
    );
    const currentTiers = activeTab === 'pos' ? POS_TIERS : activeTab === 'catalogue' ? CATALOGUE_TIERS : BOTH_TIERS;

    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState('');

    const allFeatures = useMemo(() => {
        if (activeTab === 'pos') {
            const proOnly = PRO_FEATURES.filter(f => !BASIC_FEATURES.includes(f));
            return [...BASIC_FEATURES, ...proOnly];
        }
        const features = new Set<string>();
        currentTiers.forEach(tier => tier.features.forEach(f => features.add(f)));
        return Array.from(features);
    }, [currentTiers, activeTab]);

    const groupedFeatures = useMemo(() => {
        const groups: Record<string, string[]> = {};
        allFeatures.forEach(feature => {
            const category = CATEGORY_OF[feature] || 'Other';
            (groups[category] ||= []).push(feature);
        });
        const ordered = CATEGORY_ORDER.filter(cat => groups[cat]?.length).map(category => ({
            category,
            features: groups[category],
        }));
        if (groups.Other?.length) ordered.push({ category: 'Other', features: groups.Other });
        return ordered;
    }, [allFeatures]);

    const expiryDateObj = useMemo(() => {
        if (!expiryDate) return null;
        return (expiryDate as any).toDate ? (expiryDate as any).toDate() : new Date(expiryDate);
    }, [expiryDate]);

    const daysRemaining = useMemo(() => {
        if (!expiryDateObj) return null;
        return Math.ceil((expiryDateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }, [expiryDateObj]);

    const daysRemainingClamped = daysRemaining !== null ? Math.max(0, daysRemaining) : null;
    const daysProgressPct = daysRemainingClamped !== null
        ? Math.max(0, Math.min(100, (daysRemainingClamped / DAYS_CYCLE_TOTAL) * 100))
        : 0;
    const daysUrgency: 'critical' | 'warning' | 'healthy' = daysRemainingClamped !== null && daysRemainingClamped <= 7
        ? 'critical'
        : daysRemainingClamped !== null && daysRemainingClamped <= 30
            ? 'warning'
            : 'healthy';
    const daysRingColorClass = daysUrgency === 'critical' ? 'text-destructive' : daysUrgency === 'warning' ? 'text-warning' : 'text-success';

    const [emailCopied, setEmailCopied] = useState(false);
    const handleCopyEmail = async () => {
        if (!userEmail) return;
        try {
            await navigator.clipboard.writeText(userEmail);
            setEmailCopied(true);
            setTimeout(() => setEmailCopied(false), 1500);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    };

    const handleManagePlan = () => {
        setSelectedPlan(String(currentPack).replace('pos_', '').toUpperCase());
        setIsContactModalOpen(true);
    };

    return (
        <div className="aurora min-h-screen bg-muted pb-20">
            {/* Header */}
            <header className="glass sticky top-0 z-20 flex items-center gap-3 border-b border-border px-4 py-3">
                <BackButton />
                <div className="flex-1">
                    <h1 className="text-lg font-bold tracking-tight text-foreground">
                        Subscription <span className="text-gradient">Plans</span>
                    </h1>
                    <p className="text-xs text-muted-foreground">Manage your billing & unlock more features</p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                    <LogOut className="size-3.5" />
                    <span className="hidden sm:inline">Logout</span>
                </Button>
            </header>

            <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-8 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
                {/* ── Active plan hero ── */}
                {showActiveView && (
                    <div className="relative mb-8 overflow-hidden rounded-3xl border border-border bg-card shadow-lg ring-1 ring-primary/10">
                        <div
                            className="relative h-28 overflow-hidden bg-gradient-to-br from-primary via-primary to-[oklch(0.5_0.24_320)]"
                            style={{
                                backgroundImage:
                                    'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.18) 1px, transparent 0), linear-gradient(to bottom right, var(--primary), var(--primary), oklch(0.5 0.24 320))',
                                backgroundSize: '18px 18px, 100% 100%',
                            }}
                        >
                            <div className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full bg-white/15 blur-2xl" />
                            <div className="pointer-events-none absolute -bottom-16 left-16 size-40 rounded-full bg-white/10 blur-3xl" />
                            <Badge
                                variant="success"
                                className="absolute right-4 top-4 gap-1.5 border-white/30 bg-white/15 py-1.5 text-white backdrop-blur-sm"
                            >
                                <span className="size-1.5 rounded-full bg-white animate-pulse" />
                                Active Subscription
                            </Badge>
                        </div>
                        <div className="px-6 pb-6">
                            <div className="-mt-10 flex items-start justify-between gap-4">
                                <div className="glow-primary shrink-0 rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.6_0.22_330)] p-[3px]">
                                    <span className="flex size-20 items-center justify-center rounded-[15px] border-4 border-card bg-gradient-brand text-white">
                                        {PLAN_ICONS[currentPack] ?? <Crown className="size-8 drop-shadow-sm" />}
                                    </span>
                                </div>
                                <Button size="sm" onClick={handleManagePlan} className="mt-11 gap-1.5 shadow-md shadow-primary/20">
                                    <RefreshCw className="size-3.5" />
                                    Manage Plan
                                </Button>
                            </div>
                            <div className="mt-4">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current plan</p>
                                <h2 className="text-2xl font-extrabold tracking-tight text-foreground">{String(currentPack).replace('pos_', '').toUpperCase()}</h2>
                            </div>

                            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/20 to-cyan-500/20 text-sky-600 shadow-inner dark:text-sky-400">
                                        <Calendar className="size-[18px]" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Expires on</p>
                                        <p className="truncate text-sm font-bold text-foreground">
                                            {expiryDateObj
                                                ? expiryDateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                                                : 'Lifetime / Unknown'}
                                        </p>
                                    </div>
                                </div>

                                {daysRemainingClamped !== null && (
                                    <div className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                                        <div className="relative flex size-11 shrink-0 items-center justify-center">
                                            <svg className="absolute inset-0 size-11 -rotate-90" viewBox="0 0 40 40">
                                                <circle cx="20" cy="20" r={RING_RADIUS} fill="none" strokeWidth="4" className="stroke-muted" />
                                                <circle
                                                    cx="20"
                                                    cy="20"
                                                    r={RING_RADIUS}
                                                    fill="none"
                                                    strokeWidth="4"
                                                    strokeLinecap="round"
                                                    stroke="currentColor"
                                                    className={daysRingColorClass}
                                                    strokeDasharray={RING_CIRCUMFERENCE}
                                                    strokeDashoffset={RING_CIRCUMFERENCE * (1 - daysProgressPct / 100)}
                                                />
                                            </svg>
                                            <Clock className={cn('size-4', daysRingColorClass)} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Days left</p>
                                            <p className={cn('text-sm font-bold', daysUrgency === 'critical' ? 'text-destructive' : 'text-foreground')}>
                                                {daysRemainingClamped} day{daysRemainingClamped === 1 ? '' : 's'}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-600 shadow-inner dark:text-violet-400">
                                        <User className="size-[18px]" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Name</p>
                                        <p className="truncate text-sm font-bold text-foreground">
                                            {(currentUser as any)?.name || (currentUser as any)?.displayName || '—'}
                                        </p>
                                    </div>
                                </div>

                                <div className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-600 shadow-inner dark:text-emerald-400">
                                        <Mail className="size-[18px]" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Email</p>
                                        <p className="truncate text-sm font-bold text-foreground">{userEmail || '—'}</p>
                                    </div>
                                    {userEmail && (
                                        <button
                                            type="button"
                                            onClick={handleCopyEmail}
                                            title="Copy email"
                                            aria-label="Copy email"
                                            className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition hover:bg-primary/10 hover:text-primary group-hover:opacity-100 focus-visible:opacity-100"
                                        >
                                            {emailCopied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Tab switcher ── */}
                <div className="mb-8 flex justify-center">
                    <div className="glass inline-flex gap-1 rounded-2xl p-1 shadow-sm">
                        {TABS.map(tab => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200',
                                    activeTab === tab.key
                                        ? 'bg-gradient-brand text-white shadow-md shadow-primary/25'
                                        : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
                                )}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Pricing cards ── */}
                <div className={cn('mb-10 grid gap-5', currentTiers.length > 1 ? 'sm:grid-cols-2' : 'mx-auto max-w-md sm:grid-cols-1')}>
                    {currentTiers.map(tier => (
                        <div
                            key={tier.id}
                            className={cn(
                                'group relative flex flex-col overflow-hidden rounded-3xl border p-6 transition-all duration-200',
                                tier.recommended
                                    ? 'glow-primary border-0 bg-gradient-to-br from-primary via-primary to-[oklch(0.5_0.24_320)] text-primary-foreground'
                                    : 'border-border bg-card hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg',
                            )}
                        >
                            {tier.recommended && (
                                <>
                                    <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/15 blur-2xl" />
                                    <span className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                                        <Sparkles className="size-3" />
                                        {activeTab === 'catalogue' ? 'Best Seller' : 'Recommended'}
                                    </span>
                                </>
                            )}

                            <h3 className={cn('relative text-lg font-bold', tier.recommended ? 'text-white' : 'text-foreground')}>
                                {tier.name}
                            </h3>
                            <p className={cn('relative mt-1 text-sm', tier.recommended ? 'text-white/80' : 'text-muted-foreground')}>
                                {tier.description}
                            </p>

                            <div className="relative mt-6 flex flex-wrap items-end gap-2">
                                {tier.originalPrice && (
                                    <span className={cn('text-sm line-through', tier.recommended ? 'text-white/60' : 'text-muted-foreground')}>
                                        {tier.originalPrice.yearly}
                                    </span>
                                )}
                                <span className={cn('text-3xl font-extrabold', tier.recommended ? 'text-white' : 'text-foreground')}>
                                    {tier.price.yearly}
                                </span>
                                <span className={cn('pb-1 text-xs font-medium', tier.recommended ? 'text-white/70' : 'text-muted-foreground')}>
                                    / year
                                </span>
                            </div>

                            <Button
                                onClick={() => { setSelectedPlan(tier.name); setIsContactModalOpen(true); }}
                                variant={tier.recommended ? 'default' : 'outline'}
                                className={cn('relative mt-6 w-full', tier.recommended && 'bg-white text-primary hover:bg-white/90')}
                            >
                                Choose {tier.name.split('(')[0].trim()}
                            </Button>

                            <p
                                className={cn(
                                    'relative mt-6 border-t pt-4 text-xs font-medium',
                                    tier.recommended ? 'border-white/20 text-white/70' : 'border-border text-muted-foreground',
                                )}
                            >
                                {tier.features.length}+ features included
                            </p>
                        </div>
                    ))}
                </div>

                {/* ── Full feature comparison ── */}
                <div className="mb-10 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                        <div>
                            <h3 className="text-sm font-bold text-foreground">Full feature comparison</h3>
                            <p className="text-xs text-muted-foreground">Everything included in each plan, grouped by category</p>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="inline-flex size-4 items-center justify-center rounded-full bg-success/15 text-success">
                                    <Check className="size-2.5" strokeWidth={3.5} />
                                </span>
                                Included
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <Minus className="size-3.5 text-muted-foreground/40" />
                                Not available
                            </span>
                            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">
                                {allFeatures.length} features
                            </span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <TooltipProvider delayDuration={150}>
                            <table className="w-full min-w-[420px] border-collapse text-[13px]">
                                <thead>
                                    <tr className="border-b border-border bg-muted/40">
                                        <th className="w-1/2 px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:w-2/5">
                                            Feature
                                        </th>
                                        {currentTiers.map(tier => (
                                            <th key={tier.id} className="px-2.5 py-2 text-center text-xs font-semibold text-foreground">
                                                <span
                                                    className={cn(
                                                        'inline-flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1',
                                                        tier.recommended ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                                                    )}
                                                >
                                                    <span>{tier.name.split('(')[0].trim()}</span>
                                                    <span className="text-[10px] font-normal opacity-70">
                                                        {tier.features.length}/{allFeatures.length}
                                                    </span>
                                                </span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {groupedFeatures.map(group => (
                                        <React.Fragment key={group.category}>
                                            <tr className="bg-muted/50">
                                                <td
                                                    colSpan={currentTiers.length + 1}
                                                    className="px-5 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-primary"
                                                >
                                                    {group.category}
                                                </td>
                                            </tr>
                                            {group.features.map((feature, idx) => (
                                                <tr key={idx} className="transition-colors hover:bg-accent/40">
                                                    <td className="px-5 py-1.5 text-[13px] font-medium text-foreground">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="leading-tight">{feature}</span>
                                                            {FEATURE_DESCRIPTIONS[feature] && (
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <button
                                                                            type="button"
                                                                            aria-label={`About ${feature}`}
                                                                            className="rounded-full p-0.5 text-muted-foreground/60 transition hover:bg-primary/10 hover:text-primary"
                                                                        >
                                                                            <Info className="size-3.5" />
                                                                        </button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="right" className="max-w-[220px] text-left">
                                                                        {FEATURE_DESCRIPTIONS[feature]}
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {currentTiers.map(tier => {
                                                        const hasFeature = tier.features.includes(feature);
                                                        return (
                                                            <td key={tier.id} className="px-2.5 py-1.5 text-center">
                                                                {hasFeature ? (
                                                                    <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-success/15 text-success">
                                                                        <Check className="size-3" strokeWidth={3.5} />
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex size-[18px] items-center justify-center text-muted-foreground/30">
                                                                        <Minus className="size-3" />
                                                                    </span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </TooltipProvider>
                    </div>
                </div>
            </div>

            {/* ── Contact modal ── */}
            <Dialog open={isContactModalOpen} onOpenChange={setIsContactModalOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-md">
                                <Phone className="size-5" />
                            </span>
                            <div>
                                <DialogTitle>Contact Admin</DialogTitle>
                                <DialogDescription>We&apos;ll help you upgrade right away</DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <p className="text-sm text-muted-foreground">
                        To subscribe to <span className="font-semibold text-foreground">{selectedPlan}</span>, please reach out to our admin team:
                    </p>

                    <a
                        href="tel:9818815838"
                        className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-primary/30 bg-primary/5 py-5 text-center transition hover:bg-primary/10"
                    >
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Call us at</span>
                        <span className="text-gradient text-2xl font-extrabold">9818815838</span>
                    </a>

                    <DialogFooter>
                        <Button onClick={() => setIsContactModalOpen(false)} className="w-full">
                            Got it
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default SubscriptionPage;
