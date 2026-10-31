import React, { useState, useEffect, useContext, useRef } from 'react';
import { db } from '../../lib/Firebase';
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from 'firebase/firestore';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { Permissions, State } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { FiCheck } from 'react-icons/fi';
import { InfoTooltip } from '../../Components/InfoToolTip';
import { ResetSettingsButton } from '../../Components/ResetSettingsButton';
import ShowWrapper from '../../context/ShowWrapper';
import BackButton from '../../Components/BackButton';
import {
    Monitor,
    Percent,
    PackageX,
    Truck,
    EyeOff,
    ShieldCheck,
    Hash,
    Lock,
    ArrowDownUp,
    Wallet,
    MapPin,
    Receipt,
    MessageSquare,
    User,
    Phone,
    ArrowUpDown,
    FileText,
    Clock,
    Search,
} from 'lucide-react';

export interface SalesSettings {
    settingType: 'sales';
    salesViewType?: 'card' | 'list' | 'calculator';
    enableTax?: boolean;
    defaultTaxRate?: number;
    enableSalesmanSelection?: boolean;
    gstScheme?: 'regular' | 'composition' | 'none';
    taxType?: 'inclusive' | 'exclusive';
    enableRounding?: boolean;
    roundingInterval?: number;
    hideMrp?: boolean;
    enableItemWiseDiscount?: boolean;
    enableDiscount2?: boolean;
    lockDiscountEntry?: boolean;
    lockSalePriceEntry?: boolean;
    defaultDiscount?: number;
    // 0 (or unset) means no cap — cashiers can enter any Bill Discount.
    maxBillDiscountValue?: number;
    maxBillDiscountType?: 'percent' | 'amount';
    allowNegativeStock?: boolean;
    allowDueBilling?: boolean;
    requireCustomerName?: boolean;
    requireCustomerMobile?: boolean;
    voucherName?: string;
    voucherPrefix?: string;
    currentVoucherNumber?: number;
    copyVoucherAfterSaving?: boolean;
    cartInsertionOrder?: 'top' | 'bottom';
    cardViewWithPhoto?: boolean;
    companyId?: string;
    lockTaxToggle?: boolean;
    enableShippingDetails?: boolean;
    enableExtraExpense?: boolean;
    enableNarration?: boolean;
    enableCustomerInfoToggle?: boolean;
    enableTransportDetails?: boolean;
    lastSavedPlan?: string;
}

export const PLAN_ALLOWED_FEATURES: Record<string, Partial<Record<keyof SalesSettings, boolean>> & { allowedViews: string[] }> = {
    'pos_basic': {
        allowedViews: ['calculator']
    },
    'pos_pro': {
        allowedViews: ['list', 'card', 'calculator']
    },
    'enterprise': {
        allowedViews: ['list', 'card', 'calculator']
    }
};

// eslint-disable-next-line react-refresh/only-export-components
export const getDefaultSalesSettings = (companyId: string): SalesSettings => ({
    companyId: companyId,
    settingType: 'sales',
    salesViewType: 'list',
    enableSalesmanSelection: false,
    gstScheme: 'none',
    taxType: 'inclusive',
    lockTaxToggle: false,
    enableRounding: true,
    roundingInterval: 1,
    cartInsertionOrder: 'bottom',
    hideMrp: false,
    enableItemWiseDiscount: true,
    enableDiscount2: false,
    lockDiscountEntry: false,
    lockSalePriceEntry: false,
    defaultDiscount: 0,
    maxBillDiscountValue: 0,
    maxBillDiscountType: 'percent',
    allowNegativeStock: true,
    allowDueBilling: true,
    requireCustomerName: false,
    requireCustomerMobile: false,
    voucherName: 'Invoice',
    voucherPrefix: 'INV',
    currentVoucherNumber: 1,
    copyVoucherAfterSaving: false,
    enableShippingDetails: false,
    enableExtraExpense: false,
    enableNarration: false,
    enableTransportDetails: false,
    enableCustomerInfoToggle: true, // ✅ ON by default so POS & CALC both show it consistently
});

/* ────────────────────────────────────────────────────────────────────────────
   ToggleRow is exported and may be used by other settings pages, so it is left
   exactly as it was. The Sales Settings page below uses its own <Opt> row.
   ──────────────────────────────────────────────────────────────────────────── */
export interface ToggleRowProps {
    id: string;
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    tooltip?: string;
    disabled?: boolean;
    icon?: React.ReactNode;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({ id, label, description, checked, onChange, tooltip, disabled = false, icon }) => (
    <div className={`flex items-start justify-between gap-4 rounded-sm bg-gray-50/60 border border-gray-100 p-3.5 md:p-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="min-w-0 flex gap-3">
            {icon && <span className="mt-0.5 shrink-0 text-blue-600">{icon}</span>}
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <label htmlFor={id} className="text-sm font-semibold text-gray-800 leading-5">{label}</label>
                    <InfoTooltip text={tooltip || description} />
                </div>
            </div>
        </div>
        <label htmlFor={id} className="relative inline-flex cursor-pointer items-center">
            <input
                id={id}
                type="checkbox"
                className="peer sr-only"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-blue-600" />
            <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
        </label>
    </div>
);

/* ────────────────────────────────────────────────────────────────────────────
   SELLAR design tokens (POS blue accent) as Tailwind class strings.
   No embedded <style> / CSS string any more — everything is Tailwind utilities.

   canvas #eef2ff · surface #fff · sunken #f5f7ff · inverse/ink #0f172b
   muted #45556c · subtle #5b6b86 · border #dfe6fb · control border #7a8aa3
   primary #155dfc (hover #1447e6) · primary soft #e6eeff
   ──────────────────────────────────────────────────────────────────────────── */
const ROOT_BASE =
    "bg-[#eef2ff] font-['Poppins',system-ui,-apple-system,'Segoe_UI',sans-serif] text-sm leading-[22px] text-[#0f172b] antialiased";

const CARD_SHADOW = 'shadow-[0_1px_2px_rgba(21,48,140,.05),0_2px_6px_rgba(21,48,140,.06)]';
const FLOAT_SHADOW = 'shadow-[0_10px_28px_rgba(21,48,140,.14),0_2px_6px_rgba(21,48,140,.08)]';
const FOCUS_RING =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc]';

const FIELD =
    'flex h-10 items-center gap-2 border border-[#7a8aa3] bg-white px-3 rounded-sm focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#155dfc]';
const FIELD_INPUT =
    'min-w-0 flex-1 border-0 bg-transparent text-sm text-[#0f172b] outline-none placeholder:text-[#5b6b86]';
const FIELD_LABEL = 'mb-1 flex items-center gap-2 text-xs font-medium text-[#45556c]';

const BTN_BASE =
    'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-transparent px-4 text-sm font-medium leading-5 transition-colors';
const BTN_PRIMARY = `${BTN_BASE} bg-[#155dfc] text-white hover:bg-[#1447e6] disabled:cursor-not-allowed disabled:opacity-[.45] disabled:hover:bg-[#155dfc] ${FOCUS_RING}`;
const BTN_SECONDARY = `${BTN_BASE} border-[#7a8aa3] bg-white text-[#0f172b] hover:bg-[#f5f7ff] ${FOCUS_RING}`;

// Small "example / preview" pill. <b> inside is bold + tabular numbers.
const PREVIEW =
    'mt-2 inline-flex flex-wrap items-center gap-1.5 bg-[#f5f7ff] px-3 py-2 text-xs leading-[18px] text-[#45556c] rounded-sm [&_b]:font-semibold [&_b]:tabular-nums [&_b]:text-[#0f172b]';

/* ── Presentational building blocks ────────────────────────────────────────── */
// UI-only: the search box filters which option rows are shown on screen.
const SettingsSearchContext = React.createContext<string>('');
const SectionTextContext = React.createContext<string>('');

type Tint = 'blue' | 'green' | 'amber' | 'magenta';

const TINTS: Record<Tint, string> = {
    blue: 'bg-[#e6eeff] text-[#155dfc]',
    green: 'bg-[#e9faef] text-[#008236]',
    amber: 'bg-[#fff3dd] text-[#bb4d00]',
    magenta: 'bg-[#ffe8f8] text-[#c4009a]',
};

interface SectionProps {
    id: string;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    tint?: Tint;
    action?: React.ReactNode;
    children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ id, title, subtitle, icon, tint = 'blue', action, children }) => (
    <section
        id={id}
        className={`min-w-0 scroll-mt-[132px] overflow-hidden border border-[#dfe6fb] bg-white p-0 rounded-sm lg:scroll-mt-[88px] ${CARD_SHADOW}`}
    >
        <div className="flex items-center gap-3 border-b border-[#dfe6fb] px-3.5 py-3 lg:px-[18px] lg:py-3.5">
            <span className={`inline-grid h-8 w-8 flex-none place-items-center rounded-sm ${TINTS[tint]}`}>{icon}</span>
            <div className="min-w-0">
                <b className="block text-[15px] font-semibold leading-[22px] lg:text-base">{title}</b>
                <small className="block text-xs font-normal leading-[18px] text-[#5b6b86]">{subtitle}</small>
            </div>
            {action && <div className="ml-auto flex-none">{action}</div>}
        </div>
        <SectionTextContext.Provider value={`${title} ${subtitle}`}>{children}</SectionTextContext.Provider>
    </section>
);

interface OptProps {
    id?: string;
    label: string;
    description?: string;
    icon?: React.ReactNode;
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    disabled?: boolean;
    children?: React.ReactNode;
}

const Opt: React.FC<OptProps> = ({ id, label, description, icon, checked, onChange, disabled = false, children }) => {
    const query = useContext(SettingsSearchContext).trim().toLowerCase();
    const sectionText = useContext(SectionTextContext);
    if (query && !`${label} ${description ?? ''} ${sectionText}`.toLowerCase().includes(query)) return null;
    const hasSwitch = Boolean(id && onChange);
    return (
        <div
            data-opt
            className={`grid items-center gap-x-4 gap-y-1.5 border-b border-[#dfe6fb] px-3.5 py-3 last:border-b-0 lg:px-[18px] lg:py-3.5 ${
                hasSwitch ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)]'
            } ${disabled ? 'pointer-events-none opacity-[.45]' : ''}`}
        >
            <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                    {icon && <span className="inline-grid text-[#45556c]">{icon}</span>}
                    {hasSwitch ? <label htmlFor={id} className="cursor-pointer">{label}</label> : <span>{label}</span>}
                </div>
                {description && <p className="mb-0 mt-0.5 text-xs leading-[18px] text-[#5b6b86]">{description}</p>}
            </div>
            {hasSwitch && (
                <label className="relative inline-flex flex-none cursor-pointer" htmlFor={id}>
                    <input
                        id={id}
                        type="checkbox"
                        className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
                        checked={checked ?? false}
                        onChange={(e) => onChange!(e.target.checked)}
                    />
                    <span
                        aria-hidden="true"
                        className="relative block h-[22px] w-10 rounded-full bg-[#7a8aa3] transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(0,0,0,.2)] after:transition-transform after:content-[''] peer-checked:bg-[#155dfc] peer-checked:after:translate-x-[18px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#155dfc]"
                    />
                </label>
            )}
            {children && <div className="col-span-full">{children}</div>}
        </div>
    );
};

/* Segmented control */
const SegGroup: React.FC<{ large?: boolean; children: React.ReactNode }> = ({ large, children }) => (
    <div
        role="group"
        className={`max-w-full gap-0.5 border border-[#dfe6fb] bg-[#f5f7ff] p-[3px] rounded-sm ${large ? 'flex' : 'inline-flex'}`}
    >
        {children}
    </div>
);

const SegBtn: React.FC<{ active: boolean; large?: boolean; onClick: () => void; children: React.ReactNode }> = ({
    active, large, onClick, children,
}) => (
    <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={`cursor-pointer border-0 font-medium rounded-sm ${FOCUS_RING} ${
            large ? 'h-9 min-w-0 flex-1 px-1.5 text-xs leading-4 sm:px-3 sm:text-sm' : 'h-7 px-3 text-xs'
        } ${
            active
                ? large
                    ? 'bg-[#0f172b] text-white'
                    : `bg-white text-[#155dfc] ${CARD_SHADOW}`
                : 'bg-transparent text-[#45556c]'
        }`}
    >
        {children}
    </button>
);

/* View picker mock-up bars */
const Bar: React.FC<{ width?: string; tall?: boolean }> = ({ width, tall }) => (
    <i
        className={`block rounded-[3px] bg-[#dfe6fb] ${tall ? 'h-4' : 'h-1.5'}`}
        style={width ? { width } : undefined}
    />
);

const ViewTick: React.FC<{ size?: number }> = ({ size = 12 }) => (
    <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-sm bg-[#155dfc] text-white">
        <FiCheck size={size} strokeWidth={3} />
    </span>
);

const viewBtnClass = (active: boolean) =>
    `relative grid cursor-pointer gap-2 bg-white text-left rounded-sm ${FOCUS_RING} ${
        active
            ? 'border-2 border-[#155dfc] bg-[#e6eeff] p-[11px]'
            : 'border border-[#7a8aa3] p-3'
    }`;

const NAV_SECTIONS: { id: string; label: string; icon: React.ReactNode }[] = [
    { id: 'display', label: 'Display', icon: <Monitor size={16} strokeWidth={1.75} /> },
    { id: 'tax', label: 'Tax & rounding', icon: <FileText size={16} strokeWidth={1.75} /> },
    { id: 'discounts', label: 'Discounts', icon: <Percent size={16} strokeWidth={1.75} /> },
    { id: 'order', label: 'Order & delivery', icon: <Truck size={16} strokeWidth={1.75} /> },
    { id: 'due', label: 'Due billing', icon: <Clock size={16} strokeWidth={1.75} /> },
    { id: 'customer', label: 'Customer', icon: <ShieldCheck size={16} strokeWidth={1.75} /> },
    { id: 'voucher', label: 'Bill numbering', icon: <Hash size={16} strokeWidth={1.75} /> },
];

const ico = (Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>) => <Icon size={16} strokeWidth={1.75} />;

// Display-only helper for the rounding example line.
const formatRupees = (n: number) =>
    `₹${Number.isInteger(n)
        ? n.toLocaleString('en-IN')
        : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SalesSettingsPage: React.FC = () => {
    const { currentUser } = useAuth();

    const [settings, setSettings] = useState<SalesSettings | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    // GST number prompt states
    const [showGstModal, setShowGstModal] = useState<boolean>(false);
    const [gstNumberInput, setGstNumberInput] = useState<string>('');
    const [pendingGstScheme, setPendingGstScheme] = useState<'regular' | 'composition' | null>(null);

    // UI only: which section nav item is highlighted
    const [activeSection, setActiveSection] = useState<string>('display');

    // UI only: search box
    const [query, setQuery] = useState<string>('');
    const [noMatch, setNoMatch] = useState<boolean>(false);
    const formRef = useRef<HTMLFormElement>(null);
    const [searchOpen, setSearchOpen] = useState<boolean>(false); // phone only: search row open/closed


    const activePlan = currentUser?.Subscription?.pack?.toLowerCase() || 'basic';
    // Added safe fallback for basic plan keying to prevent undefined errors
    const allowedFeatures = PLAN_ALLOWED_FEATURES[activePlan] || PLAN_ALLOWED_FEATURES['pos_basic'] || { allowedViews: ['list'] };

    useEffect(() => {
        if (!currentUser?.companyId) {
            setIsLoading(true);
            return;
        }

        const fetchOrCreateSettings = async () => {
            setIsLoading(true);
            const companyId = currentUser.companyId!;

            const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');
            const counterDocRef = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');

            try {
                const [docSnap, counterSnap] = await Promise.all([
                    getDoc(settingsDocRef),
                    getDoc(counterDocRef)
                ]);

                // 1. Start with safe defaults
                let dbSettings = getDefaultSalesSettings(companyId);

                // Plan-aware defaults, applied only when the doc is created for the first time
                const planIsCalcOnly = activePlan === 'pos_basic';
                if (planIsCalcOnly) {
                    dbSettings.enableCustomerInfoToggle = true;
                } else {
                    dbSettings.requireCustomerName = true;
                    dbSettings.requireCustomerMobile = true;
                }

                if (docSnap.exists()) {
                    dbSettings = { ...dbSettings, ...docSnap.data() };
                } else {
                    console.log(`Creating default sales settings...`);
                    await setDoc(settingsDocRef, dbSettings);
                }

                if (counterSnap.exists() && counterSnap.data().currentNumber !== undefined) {
                    dbSettings.currentVoucherNumber = counterSnap.data().currentNumber;
                } else {
                    await setDoc(counterDocRef, { currentNumber: dbSettings.currentVoucherNumber }, { merge: true });
                }

                // 3. APPLY PLAN MASK TO UI ONLY (Never deletes backend data)
                const validView = allowedFeatures.allowedViews?.includes(dbSettings.salesViewType || 'list')
                    ? dbSettings.salesViewType
                    : (allowedFeatures.allowedViews?.[0] || 'list');

                const finalSettingsToDisplay = {
                    ...dbSettings,
                    salesViewType: validView,
                } as SalesSettings;

                setSettings(finalSettingsToDisplay);
            } catch (err) {
                console.error('Failed to fetch/create sales settings:', err);
                setModal({ message: 'Failed to load settings.', type: State.ERROR });
            } finally {
                setIsLoading(false);
            }
        };

        fetchOrCreateSettings();
    }, [currentUser?.companyId, activePlan]);

    useEffect(() => {
        if (settings?.gstScheme === 'composition') {
            if (settings.taxType !== 'inclusive') {
                setSettings(prev => prev ? ({ ...prev, taxType: 'inclusive' }) : null);
            }
        }
    }, [settings?.gstScheme, settings?.taxType]);
    useEffect(() => {
        if (settings && !settings.enableCustomerInfoToggle) {
            if (settings.requireCustomerName || settings.requireCustomerMobile) {
                setSettings(prev => prev
                    ? ({ ...prev, requireCustomerName: false, requireCustomerMobile: false })
                    : null);
            }
        }
    }, [settings?.enableCustomerInfoToggle]);
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!currentUser?.companyId || !settings) {
            setModal({ message: 'Error: Missing data.', type: State.ERROR }); return;
        }

        setIsSaving(true);
        try {
            const companyId = currentUser.companyId;
            const settingsRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');
            const counterRef = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');

            const { currentVoucherNumber, ...restOfSettings } = settings;

            // FORCES UNAUTHORIZED FEATURES TO FALSE/DEFAULT IN THE DATABASE
            const validView = allowedFeatures.allowedViews?.includes(restOfSettings.salesViewType || 'list')
                ? restOfSettings.salesViewType
                : (allowedFeatures.allowedViews?.[0] || 'list');

            const settingsToSave = {
                ...restOfSettings,
                salesViewType: validView,
                companyId: companyId,
                settingType: 'sales',
                lastSavedPlan: activePlan, // REMEMBERS THE PLAN THEY SAVED UNDER
                updatedAt: new Date()
            };

            await Promise.all([
                setDoc(settingsRef, settingsToSave, { merge: true }),
                setDoc(counterRef, { currentNumber: currentVoucherNumber }, { merge: true })
            ]);

            setModal({ message: 'Settings saved successfully!', type: State.SUCCESS });
        } catch (err) {
            console.error('Failed to save settings:', err);
            setModal({ message: 'Failed to save settings. Please try again.', type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetVoucher = async () => {
        if (!settings || !currentUser?.companyId) return;

        try {
            const counterDocRef = doc(db, 'companies', currentUser.companyId, 'counters', 'invoiceCounter');
            const counterSnap = await getDoc(counterDocRef);

            let backendCounter = 1;
            if (counterSnap.exists() && counterSnap.data().currentNumber) {
                backendCounter = counterSnap.data().currentNumber;
            }

            setSettings({
                ...settings,
                voucherName: 'Invoice',
                voucherPrefix: 'INV',
                currentVoucherNumber: backendCounter
            });

        } catch (error) {
            console.error("Failed to fetch backend counter for reset:", error);
            setSettings({
                ...settings,
                voucherName: 'Invoice',
                voucherPrefix: 'INV'
            });
        }
    };

    const handleChange = (field: keyof SalesSettings, value: string | number | boolean) => {
        if (!settings) return;

        const numericFields = [
            'defaultDiscount',
            'currentVoucherNumber',
            'roundingInterval',
            'maxBillDiscountValue',
        ];

        if (numericFields.includes(field)) {
            const numValue = parseFloat(String(value));
            setSettings({ ...settings, [field]: isNaN(numValue) ? 0 : numValue });
        } else {
            setSettings({ ...settings, [field]: value });
        }
    };

    const handleCheckboxChange = (field: keyof SalesSettings, checked: boolean) => {
        if (settings) {
            // Turning on Due Billing without customer info being collected
            // would let a cashier save a credit sale with no way to track
            // who owes it — auto-enable the Customer Info section too.
            if (field === 'allowDueBilling' && checked && !settings.enableCustomerInfoToggle) {
                setSettings({ ...settings, allowDueBilling: true, enableCustomerInfoToggle: true });
                return;
            }
            // The reverse must hold too: Due Billing depends on customer info
            // being collectable at all, so turning that off must turn Due
            // Billing off with it rather than leaving it silently on.
            if (field === 'enableCustomerInfoToggle' && !checked && settings.allowDueBilling) {
                setSettings({ ...settings, enableCustomerInfoToggle: false, allowDueBilling: false });
                return;
            }
            setSettings({ ...settings, [field]: checked });
        }
    };

    const checkAndPromptGst = async (newScheme: 'regular' | 'composition') => {
        if (!currentUser?.companyId) return;
        try {
            const companyId = currentUser.companyId;
            const businessInfoRef = doc(db, 'companies', companyId, 'business_info', companyId);
            const snap = await getDoc(businessInfoRef);
            const existingGst = snap.exists() ? snap.data().gstin : undefined;

            if (!existingGst) {
                setPendingGstScheme(newScheme);
                setGstNumberInput('');
                setShowGstModal(true);
            } else {
                handleChange('gstScheme', newScheme);
            }
        } catch (err) {
            console.error('Failed to check business GST info:', err);
            setModal({ message: 'Failed to verify GST details.', type: State.ERROR });
        }
    };

    const handleGstNumberSave = async () => {
        if (!currentUser?.companyId || !pendingGstScheme) return;
        const trimmed = gstNumberInput.trim().toUpperCase();

        if (trimmed.length !== 15) {
            setModal({ message: 'GST number must be exactly 15 characters.', type: State.ERROR });
            return;
        }

        try {
            const companyId = currentUser.companyId;
            const businessInfoRef = doc(db, 'companies', companyId, 'business_info', companyId);
            await setDoc(businessInfoRef, { gstin: trimmed, updatedAt: serverTimestamp() }, { merge: true });

            handleChange('gstScheme', pendingGstScheme);
            setShowGstModal(false);
            setPendingGstScheme(null);
        } catch (err) {
            console.error('Failed to save GST number:', err);
            setModal({ message: 'Failed to save GST number.', type: State.ERROR });
        }
    };

    // UI only: show an empty message when the search matches no option row
    useEffect(() => {
        const hasQuery = query.trim().length > 0;
        const none = hasQuery && !formRef.current?.querySelector('[data-opt]');
        setNoMatch((prev) => (prev === none ? prev : none));
    });

    // UI only: smooth-scroll to a section and highlight its nav item
    const goToSection = (id: string) => {
        setActiveSection(id);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    if (isLoading || !settings) {
        return (
            <div className={ROOT_BASE}>
                <div className="flex min-h-screen flex-col items-center justify-center text-[#45556c]">
                    <Spinner />
                    <p className="mt-4">Loading settings...</p>
                </div>
            </div>
        );
    }

    // 👇 true for pos_basic (catalog-forced calc) OR any plan where user manually picked calc view
    const isCalcPlan = activePlan === 'pos_basic' || settings.salesViewType === 'calculator';

    // Display-only previews
    const roundingStep = Number(settings.roundingInterval ?? 1) || 1;
    const roundedExample = Math.round(1357.6 / roundingStep) * roundingStep;
    const nextBillLabel = `${settings.voucherPrefix ? `${settings.voucherPrefix}-` : ''}${settings.currentVoucherNumber ?? 1}`;

    return (
        <div className={`${ROOT_BASE} flex min-h-screen w-full flex-col`}>
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            {showGstModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,43,.45)] p-4">
                    <div
                        className={`grid w-full max-w-[400px] gap-3.5 bg-white p-5 rounded-sm ${FLOAT_SHADOW}`}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="gst-title"
                    >
                        <h3 id="gst-title" className="m-0 text-lg font-semibold leading-[26px]">Enter GST number</h3>
                        <p className="m-0 text-[13px] leading-5 text-[#45556c]">
                            GST number is required to enable this tax scheme. This will be saved to your business profile.
                        </p>
                        <div>
                            <label htmlFor="gst-number" className={FIELD_LABEL}>GST number</label>
                            <div className={FIELD}>
                                <input
                                    id="gst-number"
                                    type="text"
                                    className={FIELD_INPUT}
                                    value={gstNumberInput}
                                    onChange={(e) => setGstNumberInput(e.target.value.toUpperCase().slice(0, 15))}
                                    placeholder="e.g., 22AAAAA0000A1Z5"
                                    maxLength={15}
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-0.5">
                            <button
                                type="button"
                                onClick={() => { setShowGstModal(false); setPendingGstScheme(null); }}
                                className={BTN_SECONDARY}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleGstNumberSave}
                                className={BTN_PRIMARY}
                            >
                                Save & continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header + (mobile) section chips */}
            <div className="sticky top-0 z-30 border-b border-[#dfe6fb] bg-white">
                <div className="flex h-14 items-center gap-3 px-2 md:h-auto md:px-6 md:py-3.5">
                    <div className="flex-shrink-0">
                        <BackButton />
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="hidden text-xs leading-[18px] text-[#5b6b86] md:block">Settings /</div>
                        <h1 className="m-0 text-lg font-semibold leading-6 text-[#0f172b] md:text-[22px] md:leading-[30px]">
                            Sales settings
                        </h1>
                    </div>

                    <span className="hidden text-xs leading-[18px] text-[#5b6b86] lg:block">Applies to every sale bill in your shop</span>

                    {/* Desktop search field */}
                    <label className="hidden h-[38px] w-[300px] items-center gap-2 rounded-sm border border-[#7a8aa3] bg-white px-3 text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#155dfc] md:flex">
                        <Search size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
                            placeholder="Find a setting — e.g. rounding, GST, prefix"
                            aria-label="Find a setting"
                            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#0f172b] outline-none placeholder:text-[#5b6b86]"
                        />
                    </label>

                    {/* Mobile search toggle */}
                    <button
                        type="button"
                        aria-label="Search"
                        onClick={() => {
                            setSearchOpen((o) => !o);
                            if (searchOpen) setQuery('');
                        }}
                        className="inline-grid h-10 w-10 place-items-center rounded-sm text-[#45556c] hover:bg-[#f5f7ff] md:hidden"
                    >
                        <Search size={20} strokeWidth={1.75} />
                    </button>
                </div>

                {/* Mobile search field */}
                {searchOpen && (
                    <div className="px-4 pb-3 md:hidden">
                        <label className="flex h-10 items-center gap-2 rounded-sm border border-[#7a8aa3] bg-white px-3 text-[#5b6b86]">
                            <Search size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none" />
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Find a setting"
                                aria-label="Find a setting"
                                className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#0f172b] outline-none placeholder:text-[#5b6b86]"
                            />
                        </label>
                    </div>
                )}

                <div
                    className="flex gap-1.5 overflow-x-auto border-t border-[#dfe6fb] px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden"
                    role="group"
                    aria-label="Jump to section"
                >
                    {NAV_SECTIONS.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            aria-pressed={activeSection === s.id}
                            onClick={() => goToSection(s.id)}
                            className={`inline-flex h-[30px] flex-none cursor-pointer items-center whitespace-nowrap border px-3 text-xs font-medium rounded-sm ${FOCUS_RING} ${
                                activeSection === s.id
                                    ? 'border-[#0f172b] bg-[#0f172b] text-white'
                                    : 'border-[#7a8aa3] bg-white text-[#45556c]'
                            }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            <main className="min-h-0 w-full flex-grow box-border px-3 pb-44 pt-3 sm:px-4 sm:pt-4 md:pb-6 lg:px-6 lg:pt-6">
                <SettingsSearchContext.Provider value={query}>
                    <div className="mx-auto grid max-w-[1120px] grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                        {/* Left section navigation (desktop) */}
                        <nav className="sticky top-24 hidden gap-0.5 self-start rounded-sm lg:grid" aria-label="Sales settings sections">
                            {NAV_SECTIONS.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    aria-current={activeSection === s.id}
                                    onClick={() => goToSection(s.id)}
                                    className={`flex w-full cursor-pointer items-center gap-2.5 border-0 px-3 py-2 text-left text-[13px] font-medium rounded-sm ${
                                        activeSection === s.id
                                            ? 'bg-[#e6eeff] text-[#155dfc]'
                                            : 'bg-transparent text-[#45556c] hover:bg-white hover:text-[#0f172b]'
                                    }`}
                                >
                                    {s.icon}
                                    {s.label}
                                </button>
                            ))}
                            <div className="p-3 text-xs leading-[18px] text-[#5b6b86]">Changes save only when you press Save.</div>
                        </nav>

                        <form
                            ref={formRef}
                            onSubmit={handleSave}
                            className={`grid min-w-0 content-start gap-3 lg:gap-4 ${
                                query.trim() ? '[&_section:not(:has([data-opt]))]:hidden' : ''
                            }`}
                        >
                            {noMatch && (
                                <div className={`min-w-0 border border-[#dfe6fb] bg-white px-4 py-10 text-center text-[#45556c] rounded-sm ${CARD_SHADOW}`}>
                                    <b className="mb-1 block text-[15px] font-semibold text-[#0f172b]">No setting found</b>
                                    Try a different word — for example “discount”, “GST” or “customer”.
                                </div>
                            )}
                            <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                                {/* Display */}
                                <Section
                                    id="display"
                                    title="Display"
                                    subtitle="How the billing screen looks"
                                    icon={<Monitor size={18} strokeWidth={1.75} />}
                                    action={
                                        <ResetSettingsButton<SalesSettings>
                                            defaults={getDefaultSalesSettings(currentUser?.companyId ?? '')}
                                            onReset={(defaults) =>
                                                setSettings((prev) =>
                                                    prev
                                                        ? {
                                                            ...defaults,
                                                            // Preserve tax/GST settings — Reset to Default should NOT touch these
                                                            gstScheme: prev.gstScheme,
                                                            taxType: prev.taxType,
                                                            lockTaxToggle: prev.lockTaxToggle,
                                                            enableRounding: prev.enableRounding,
                                                            roundingInterval: prev.roundingInterval,
                                                        }
                                                        : defaults
                                                )
                                            }
                                        />
                                    }
                                >
                                    <Opt label="Billing screen">
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                className={viewBtnClass(settings.salesViewType === 'list')}
                                                aria-pressed={settings.salesViewType === 'list'}
                                                onClick={() => handleChange('salesViewType', 'list')}
                                            >
                                                {settings.salesViewType === 'list' && <ViewTick />}
                                                <div className="grid h-[62px] content-start gap-1.5 border border-[#dfe6fb] bg-white p-2.5 rounded-sm">
                                                    <Bar width="70%" />
                                                    <Bar />
                                                    <Bar width="85%" />
                                                    <Bar />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-semibold">List view</div>
                                                    <div className="text-xs leading-[18px] text-[#5b6b86]">Desktop & barcode scanners</div>
                                                </div>
                                            </button>
                                            <button
                                                type="button"
                                                className={viewBtnClass(settings.salesViewType === 'card')}
                                                aria-pressed={settings.salesViewType === 'card'}
                                                onClick={() => handleChange('salesViewType', 'card')}
                                            >
                                                {settings.salesViewType === 'card' && <ViewTick />}
                                                <div className="grid h-[62px] grid-cols-3 content-start gap-1.5 border border-[#dfe6fb] bg-white p-2.5 rounded-sm">
                                                    {[...Array(6)].map((_, i) => <Bar key={i} tall />)}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-semibold">Card view</div>
                                                    <div className="text-xs leading-[18px] text-[#5b6b86]">Touchscreens & tablets</div>
                                                </div>
                                            </button>
                                        </div>

                                        {/* Card image display — only when card view is selected */}
                                        {settings.salesViewType === 'card' && (
                                            <div className="mt-3 rounded-sm bg-[#f5f7ff] p-3">
                                                <p className="mb-2 text-xs font-semibold text-[#45556c]">Card image display</p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {/* With Photo */}
                                                    <button
                                                        type="button"
                                                        aria-pressed={!!settings.cardViewWithPhoto}
                                                        onClick={() => handleCheckboxChange('cardViewWithPhoto', true)}
                                                        className={`relative flex flex-col items-center gap-2 rounded-sm p-2 text-left transition-colors sm:flex-row sm:gap-3 sm:p-3 ${settings.cardViewWithPhoto
                                                            ? 'border-2 border-[#155dfc] bg-white p-[7px] sm:p-[11px]'
                                                            : 'border border-[#7a8aa3] bg-white hover:bg-[#f5f7ff]'
                                                            }`}
                                                    >
                                                        {settings.cardViewWithPhoto && <ViewTick size={10} />}
                                                        <div className="grid h-10 w-full grid-cols-3 gap-1 rounded-sm border border-[#dfe6fb] bg-[#f5f7ff] p-1 sm:h-12 sm:w-[6.5rem] sm:shrink-0">
                                                            {[...Array(3)].map((_, i) => (
                                                                <div key={i} className="flex flex-col items-center gap-0.5">
                                                                    <div className="aspect-square w-full rounded-[3px] bg-[#b9ccff]" />
                                                                    <div className="h-1 w-full rounded-[3px] bg-[#dfe6fb]" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="w-full">
                                                            <p className="text-xs font-semibold text-[#0f172b] sm:text-sm">With photo</p>
                                                            <p className="hidden text-xs text-[#5b6b86] sm:block">Shows product image</p>
                                                        </div>
                                                    </button>

                                                    {/* Without Photo */}
                                                    <button
                                                        type="button"
                                                        aria-pressed={!settings.cardViewWithPhoto}
                                                        onClick={() => handleCheckboxChange('cardViewWithPhoto', false)}
                                                        className={`relative flex flex-col items-center gap-2 rounded-sm p-2 text-left transition-colors sm:flex-row sm:gap-3 sm:p-3 ${!settings.cardViewWithPhoto
                                                            ? 'border-2 border-[#155dfc] bg-white p-[7px] sm:p-[11px]'
                                                            : 'border border-[#7a8aa3] bg-white hover:bg-[#f5f7ff]'
                                                            }`}
                                                    >
                                                        {!settings.cardViewWithPhoto && <ViewTick size={10} />}
                                                        <div className="grid h-10 w-full grid-cols-3 gap-1 rounded-sm border border-[#dfe6fb] bg-[#f5f7ff] p-1 sm:h-12 sm:w-[6.5rem] sm:shrink-0">
                                                            {[...Array(3)].map((_, i) => (
                                                                <div key={i} className="flex flex-col items-center justify-center gap-0.5 rounded-[3px] border border-[#dfe6fb] bg-white p-1">
                                                                    <div className="h-1 w-3/4 rounded-[3px] bg-[#dfe6fb]" />
                                                                    <div className="h-1 w-full rounded-[3px] bg-[#dfe6fb]" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="w-full">
                                                            <p className="text-xs font-semibold text-[#0f172b] sm:text-sm">Without photo</p>
                                                            <p className="hidden text-xs text-[#5b6b86] sm:block">Text-only, compact</p>
                                                        </div>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </Opt>

                                    <Opt
                                        id="salesman-billing"
                                        label="Salesman-wise billing"
                                        description="Track which salesman handled each bill."
                                        icon={ico(User)}
                                        checked={settings.enableSalesmanSelection ?? false}
                                        onChange={(checked) => handleCheckboxChange('enableSalesmanSelection', checked)}
                                    />

                                    <Opt
                                        label="Cart item sorting"
                                        description="Where a newly scanned or added item appears in the cart."
                                        icon={ico(ArrowUpDown)}
                                    >
                                        <SegGroup large>
                                            <SegBtn
                                                large
                                                active={settings.cartInsertionOrder === 'top'}
                                                onClick={() => handleChange('cartInsertionOrder', 'top')}
                                            >
                                                Newest first
                                            </SegBtn>
                                            <SegBtn
                                                large
                                                active={settings.cartInsertionOrder === 'bottom'}
                                                onClick={() => handleChange('cartInsertionOrder', 'bottom')}
                                            >
                                                Oldest first
                                            </SegBtn>
                                        </SegGroup>
                                    </Opt>
                                </Section>

                                {/* Tax & rounding */}
                                <Section
                                    id="tax"
                                    title="Tax & rounding"
                                    subtitle="GST scheme and how prices are calculated"
                                    icon={<FileText size={18} strokeWidth={1.75} />}
                                    tint="green"
                                >
                                    <Opt
                                        label="GST scheme"
                                        description="Pick the GST scheme that applies to your business."
                                        icon={ico(FileText)}
                                    >
                                        <SegGroup large>
                                            {[
                                                { label: 'None', value: 'none' },
                                                { label: 'Regular GST', value: 'regular' },
                                                { label: 'Composition', value: 'composition' },
                                            ].map((opt) => (
                                                <SegBtn
                                                    key={opt.value}
                                                    large
                                                    active={settings.gstScheme === opt.value}
                                                    onClick={() => {
                                                        if (opt.value !== 'none' && settings.gstScheme === 'none') {
                                                            checkAndPromptGst(opt.value as 'regular' | 'composition');
                                                        } else {
                                                            handleChange('gstScheme', opt.value);
                                                        }
                                                    }}
                                                >
                                                    {opt.label}
                                                </SegBtn>
                                            ))}
                                        </SegGroup>
                                    </Opt>

                                    {settings.gstScheme === 'regular' && (
                                        <Opt
                                            label="Tax calculation"
                                            description="Whether the sale price you enter already includes GST."
                                            icon={ico(Percent)}
                                        >
                                            <SegGroup large>
                                                <SegBtn
                                                    large
                                                    active={(settings.taxType || 'exclusive') === 'inclusive'}
                                                    onClick={() => handleChange('taxType', 'inclusive')}
                                                >
                                                    Inclusive — price includes GST
                                                </SegBtn>
                                                <SegBtn
                                                    large
                                                    active={(settings.taxType || 'exclusive') === 'exclusive'}
                                                    onClick={() => handleChange('taxType', 'exclusive')}
                                                >
                                                    Exclusive — GST added on top
                                                </SegBtn>
                                            </SegGroup>
                                            <div className={PREVIEW}>
                                                {(settings.taxType || 'exclusive') === 'inclusive'
                                                    ? <>Example: item ₹112 at 12% → <b>₹100 + ₹12 GST = ₹112</b></>
                                                    : <>Example: item ₹100 at 12% → <b>₹100 + ₹12 GST = ₹112</b></>}
                                            </div>
                                        </Opt>
                                    )}

                                    <Opt
                                        id="lock-tax"
                                        label="Lock tax mode"
                                        description="Cashiers can't change the tax mode while billing (Regular scheme only)."
                                        icon={ico(Lock)}
                                        checked={settings.lockTaxToggle ?? false}
                                        onChange={(checked) => handleCheckboxChange('lockTaxToggle', checked)}
                                    />

                                    <Opt
                                        id="enable-rounding"
                                        label="Round off"
                                        description="Automatically round the individual item net price in the bill."
                                        icon={ico(ArrowDownUp)}
                                        checked={settings.enableRounding ?? false}
                                        onChange={(checked) => handleCheckboxChange('enableRounding', checked)}
                                    >
                                        {settings.enableRounding && (
                                            <>
                                                <div className="mb-1.5 text-xs leading-[18px] text-[#5b6b86]">Round to the nearest</div>
                                                <SegGroup>
                                                    {[0.01, 0.1, 0.5, 1, 5, 10].map((value) => (
                                                        <SegBtn
                                                            key={value}
                                                            active={Number(settings.roundingInterval ?? 1) === value}
                                                            onClick={() => handleChange('roundingInterval', value)}
                                                        >
                                                            {value.toFixed(2)}
                                                        </SegBtn>
                                                    ))}
                                                </SegGroup>
                                                <div className={PREVIEW}>
                                                    {formatRupees(1357.6)} → <b>{formatRupees(roundedExample)}</b>
                                                </div>
                                            </>
                                        )}
                                    </Opt>
                                </Section>

                                {/* Discounts & price control */}
                                <Section
                                    id="discounts"
                                    title="Discounts & price control"
                                    subtitle="What cashiers can change on a bill"
                                    icon={<Percent size={18} strokeWidth={1.75} />}
                                    tint="amber"
                                >
                                    <Opt
                                        id="item-discount"
                                        label="Item-wise discount"
                                        description="Show a discount field on each cart line."
                                        icon={ico(Percent)}
                                        checked={settings.enableItemWiseDiscount ?? false}
                                        onChange={(checked) => handleCheckboxChange('enableItemWiseDiscount', checked)}
                                    />
                                    <Opt
                                        id="item-discount-2"
                                        label="Second discount (Disc2)"
                                        description="A second discount applied on top of Disc1 — e.g. a 10% + 5% scheme."
                                        icon={ico(Percent)}
                                        checked={settings.enableDiscount2 ?? false}
                                        onChange={(checked) => handleCheckboxChange('enableDiscount2', checked)}
                                        disabled={!settings.enableItemWiseDiscount}
                                    />
                                    <Opt
                                        id="lock-discount"
                                        label="Lock discount entry"
                                        description="Stop staff from changing discounts on the billing screen."
                                        icon={ico(Lock)}
                                        checked={settings.lockDiscountEntry ?? false}
                                        onChange={(checked) => handleCheckboxChange('lockDiscountEntry', checked)}
                                    />
                                    <Opt
                                        id="lock-price"
                                        label="Lock sale price"
                                        description="Stop staff from editing the selling price on the billing screen."
                                        icon={ico(Lock)}
                                        checked={settings.lockSalePriceEntry ?? false}
                                        onChange={(checked) => handleCheckboxChange('lockSalePriceEntry', checked)}
                                    />
                                    <Opt
                                        label="Max bill discount"
                                        description="Cap the Bill Discount field on the payment drawer. Leave empty for no limit."
                                        icon={ico(Percent)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className={`${FIELD} flex-1`}>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    className={FIELD_INPUT}
                                                    value={settings.maxBillDiscountValue || ''}
                                                    onChange={(e) => handleChange('maxBillDiscountValue', e.target.value)}
                                                    placeholder="No limit"
                                                />
                                            </div>
                                            <SegGroup>
                                                <SegBtn
                                                    active={(settings.maxBillDiscountType || 'percent') === 'percent'}
                                                    onClick={() => handleChange('maxBillDiscountType', 'percent')}
                                                >
                                                    %
                                                </SegBtn>
                                                <SegBtn
                                                    active={settings.maxBillDiscountType === 'amount'}
                                                    onClick={() => handleChange('maxBillDiscountType', 'amount')}
                                                >
                                                    ₹
                                                </SegBtn>
                                            </SegGroup>
                                        </div>
                                    </Opt>
                                    <Opt
                                        id="hide-mrp"
                                        label="Hide MRP in sales list"
                                        description="Hide the MRP column from the item list while billing."
                                        icon={ico(EyeOff)}
                                        checked={settings.hideMrp ?? false}
                                        onChange={(checked) => handleCheckboxChange('hideMrp', checked)}
                                    />
                                </Section>
                            </ShowWrapper>

                            {/* Order & delivery / Due billing / Customer — two columns on wide screens */}
                            <div className="xl:columns-2 xl:gap-x-4 [&>*]:mb-3 xl:[&>*]:mb-4 xl:[&>*]:break-inside-avoid">
                                <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                                    <Section
                                        id="order"
                                        title="Order & delivery"
                                        subtitle="Extra fields on the bill and payment drawer"
                                        icon={<Truck size={18} strokeWidth={1.75} />}
                                        tint="magenta"
                                    >
                                        <Opt
                                            id="allow-negative"
                                            label="Allow negative inventory billing"
                                            description="Sell items even when stock shows 0 — stock will go below zero."
                                            icon={ico(PackageX)}
                                            checked={settings.allowNegativeStock ?? false}
                                            onChange={(checked) => handleCheckboxChange('allowNegativeStock', checked)}
                                        />
                                        <Opt
                                            id="enable-shipping"
                                            label="Shipping details"
                                            description="Capture a separate shipping address and GST for customers."
                                            icon={ico(MapPin)}
                                            checked={settings.enableShippingDetails ?? false}
                                            onChange={(checked) => handleCheckboxChange('enableShippingDetails', checked)}
                                        />
                                        <Opt
                                            id="enable-expense"
                                            label="Extra expense"
                                            description="Add extra charges like freight or packing to the final bill."
                                            icon={ico(Receipt)}
                                            checked={settings.enableExtraExpense ?? false}
                                            onChange={(checked) => handleCheckboxChange('enableExtraExpense', checked)}
                                        />
                                        <Opt
                                            id="enable-narration"
                                            label="Narration / remarks"
                                            description="Add a custom note on the bill."
                                            icon={ico(MessageSquare)}
                                            checked={settings.enableNarration ?? false}
                                            onChange={(checked) => handleCheckboxChange('enableNarration', checked)}
                                        />
                                        <Opt
                                            id="enable-transport"
                                            label="Transport details"
                                            description="Capture GR/RR no., vehicle number and other transport info in the payment drawer."
                                            icon={ico(Truck)}
                                            checked={settings.enableTransportDetails ?? false}
                                            onChange={(checked) => handleCheckboxChange('enableTransportDetails', checked)}
                                        />
                                    </Section>
                                </ShowWrapper>

                                {/* Due billing — kept out of the HiddenProFeatures-gated
                                card above so it's available on every plan (incl. Calc +
                                Catalogue), not just Pro/Enterprise. */}
                                <ShowWrapper requiredPermission={Permissions.AllowDueBilling}>
                                    <Section
                                        id="due"
                                        title="Due billing (udhaar)"
                                        subtitle="Selling on credit"
                                        icon={<Wallet size={18} strokeWidth={1.75} />}
                                        tint="amber"
                                    >
                                        <Opt
                                            id="allow-due"
                                            label="Allow due billing"
                                            description="Allow partial or no payment on a bill (credit). Customer info is switched on with it."
                                            icon={ico(Wallet)}
                                            checked={settings.allowDueBilling ?? false}
                                            onChange={(checked) => handleCheckboxChange('allowDueBilling', checked)}
                                        />
                                    </Section>
                                </ShowWrapper>

                                {/* Customer access (outside ShowWrapper to display for all plans) */}
                                <Section
                                    id="customer"
                                    title="Customer details"
                                    subtitle="What must be filled before a sale"
                                    icon={<ShieldCheck size={18} strokeWidth={1.75} />}
                                >
                                    {isCalcPlan && (
                                        <Opt
                                            id="req-customer-info"
                                            label="Customer info"
                                            description="Show the customer details section during payment."
                                            icon={ico(ShieldCheck)}
                                            checked={settings.enableCustomerInfoToggle ?? false}
                                            onChange={(checked) => handleCheckboxChange('enableCustomerInfoToggle', checked)}
                                        />
                                    )}
                                    <Opt
                                        id="req-customer"
                                        label="Require customer name"
                                        description="Block saving the bill until a name is entered."
                                        icon={ico(User)}
                                        checked={settings.requireCustomerName ?? false}
                                        onChange={(checked) => handleCheckboxChange('requireCustomerName', checked)}
                                    />
                                    <Opt
                                        id="req-mobile"
                                        label="Require customer mobile"
                                        description="Block saving the bill until a mobile number is entered."
                                        icon={ico(Phone)}
                                        checked={settings.requireCustomerMobile ?? false}
                                        onChange={(checked) => handleCheckboxChange('requireCustomerMobile', checked)}
                                    />
                                </Section>
                            </div>

                            {/* Bill numbering (outside ShowWrapper) */}
                            <Section
                                id="voucher"
                                title="Bill numbering"
                                subtitle="How sale bills are numbered"
                                icon={<Hash size={18} strokeWidth={1.75} />}
                                action={
                                    <button
                                        type="button"
                                        onClick={handleResetVoucher}
                                        className="cursor-pointer border-0 bg-transparent px-1.5 py-1 text-xs font-medium text-[#5b6b86] rounded-sm hover:bg-[#f5f7ff] hover:text-[#0f172b]"
                                    >
                                        Reset to default
                                    </button>
                                }
                            >
                                <Opt label="Numbering">
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                        <div>
                                            <label htmlFor="voucher-name" className={FIELD_LABEL}>
                                                Voucher name
                                                <span className="inline-flex h-[18px] items-center gap-1 bg-[#f5f7ff] px-2 text-[9px] font-semibold tracking-[.06em] text-[#45556c] rounded-sm">
                                                    <Lock size={10} strokeWidth={2.25} />LOCKED
                                                </span>
                                            </label>
                                            <div className={`${FIELD} bg-[#f5f7ff]`}>
                                                <input
                                                    type="text"
                                                    id="voucher-name"
                                                    className={`${FIELD_INPUT} cursor-not-allowed text-[#5b6b86]`}
                                                    value={settings.voucherName || 'Invoice'}
                                                    disabled
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label htmlFor="voucher-prefix" className={FIELD_LABEL}>Prefix</label>
                                            <div className={FIELD}>
                                                <input
                                                    type="text"
                                                    id="voucher-prefix"
                                                    className={FIELD_INPUT}
                                                    value={settings.voucherPrefix || ''}
                                                    onChange={(e) => handleChange('voucherPrefix', e.target.value)}
                                                    placeholder="e.g., INV"
                                                    style={{ fontWeight: 600 }}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label htmlFor="current-number" className={FIELD_LABEL}>Next number</label>
                                            <div className={FIELD}>
                                                <input
                                                    type="number"
                                                    id="current-number"
                                                    className={FIELD_INPUT}
                                                    value={settings.currentVoucherNumber ?? 1}
                                                    onChange={(e) => handleChange('currentVoucherNumber', e.target.value)}
                                                    min="1"
                                                    step="1"
                                                    style={{ fontWeight: 600 }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className={PREVIEW}>
                                        Next bill will be <b>{nextBillLabel}</b>
                                    </div>
                                </Opt>
                            </Section>
                        </form>
                    </div>
                </SettingsSearchContext.Provider>
            </main>

            {/* Save bar: floating card on phone, sticky full-width bar on desktop */}
            <div className="pointer-events-none fixed inset-x-0 bottom-16 z-40 px-3 pb-2 md:pointer-events-auto md:sticky md:inset-x-auto md:bottom-0 md:border-t md:border-[#dfe6fb] md:bg-white md:p-0 md:shadow-[0_-6px_16px_rgba(21,48,140,.06)] md:after:absolute md:after:inset-x-0 md:after:top-full md:after:h-8 md:after:bg-white md:after:content-['']">
                <div className={`pointer-events-auto mx-auto flex max-w-[640px] items-center justify-between gap-3 border border-[#dfe6fb] bg-white py-2.5 pl-4 pr-2.5 rounded-sm ${FLOAT_SHADOW} md:mx-0 md:max-w-none md:rounded-none md:border-0 md:bg-transparent md:px-6 md:py-3 md:shadow-none`}>
                    <span className="min-w-0 text-xs leading-[18px] text-[#5b6b86]">Changes save only when you press Save.</span>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className={`${BTN_PRIMARY} min-w-[140px]`}
                    >
                        {isSaving ? <Spinner /> : (<><FiCheck size={16} />Save settings</>)}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SalesSettingsPage;