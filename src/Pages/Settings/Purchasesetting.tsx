import React, { useState, useEffect } from 'react';
import { db } from '../../lib/Firebase';
import {
    doc,
    getDoc,
    setDoc,
} from 'firebase/firestore';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { useAuth } from '../../context/auth-context';
import {
    FiCheck,
    FiMonitor,
    FiList,
    FiPrinter,
    FiPercent,
    FiLayers,
    FiPackage,
    FiShield,
    FiUser,
    FiPhone,
    FiHash,
    FiLock,
    FiSearch,
} from 'react-icons/fi';
import { Search } from 'lucide-react';
import { ResetSettingsButton } from '../../Components/ResetSettingsButton';
import BackButton from '../../Components/BackButton';

export interface PurchaseSettings {
    companyId?: string;
    settingType: 'purchase';
    defaultDiscount: number;
    inputMRP: boolean;
    zeroValueValidation: boolean;
    enableBarcodePrinting: boolean;
    copyVoucherAfterSaving: boolean;
    roundingOff: boolean;
    enableDiscount2?: boolean;
    voucherName: string;
    voucherPrefix: string;
    currentVoucherNumber: number;
    purchaseViewType: 'card' | 'list';
    requireSupplierName: boolean;
    requireSupplierMobile: boolean;
    cartInsertionOrder?: 'top' | 'bottom';
    cardViewWithPhoto?: boolean;
    enableGodownAssignment?: boolean;
}

export const getDefaultPurchaseSettings = (companyId: string): PurchaseSettings => ({
    companyId: companyId,
    settingType: 'purchase',
    defaultDiscount: 0,
    inputMRP: false,
    zeroValueValidation: true,
    enableBarcodePrinting: true,
    copyVoucherAfterSaving: false,
    roundingOff: false,
    enableDiscount2: false,
    voucherName: 'Purchase',
    voucherPrefix: 'PUR',
    currentVoucherNumber: 1,
    purchaseViewType: 'list',
    requireSupplierName: true,
    requireSupplierMobile: false,
    cartInsertionOrder: 'bottom',
    cardViewWithPhoto: true,
    enableGodownAssignment: false,
});

/* ------------------------------------------------------------------ */
/*  UI building blocks (SELLAR design system, light theme)             */
/*  ink #0f172b · muted #45556c · subtle #5b6b86 · border #dfe6fb      */
/*  control border #7a8aa3 · primary #155dfc · canvas #eef2ff          */
/* ------------------------------------------------------------------ */

const FOCUS_RING =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc]';

type Tone = 'blue' | 'green' | 'magenta';

const TONES: Record<Tone, string> = {
    blue: 'bg-[#e6eeff] text-[#155dfc]',
    green: 'bg-[#e9faef] text-[#008236]',
    magenta: 'bg-[#ffe8f8] text-[#c4009a]',
};

interface CardProps {
    id: string;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    tone?: Tone;
    action?: React.ReactNode;
    children: React.ReactNode;
}

const SettingsCard: React.FC<CardProps> = ({ id, title, subtitle, icon, tone = 'blue', action, children }) => (
    <section
        id={id}
        className="scroll-mt-32 overflow-hidden rounded-sm border border-[#dfe6fb] bg-white shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] lg:scroll-mt-4"
    >
        <div className="flex items-center gap-3 border-b border-[#dfe6fb] px-4 py-3.5 md:px-[18px]">
            <span className={`grid h-8 w-8 flex-none place-items-center rounded-sm ${TONES[tone]}`}>{icon}</span>
            <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold leading-5 text-[#0f172b]">{title}</h2>
                <p className="mt-0.5 text-xs leading-[18px] text-[#5b6b86]">{subtitle}</p>
            </div>
            {action}
        </div>
        <div className="divide-y divide-[#dfe6fb]">{children}</div>
    </section>
);

const OptionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode; htmlFor?: string }> = ({
    icon,
    children,
    htmlFor,
}) => (
    <div className="flex items-center gap-2 text-sm font-medium text-[#0f172b]">
        <span className="flex-none text-[#5b6b86]">{icon}</span>
        {htmlFor ? <label htmlFor={htmlFor}>{children}</label> : <span>{children}</span>}
    </div>
);

interface ToggleRowProps {
    id: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ id, label, description, icon, checked, onChange }) => (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5 md:px-[18px]">
        <div className="min-w-0">
            <OptionTitle icon={icon} htmlFor={id}>{label}</OptionTitle>
            <p className="mt-0.5 text-xs leading-[18px] text-[#5b6b86]">{description}</p>
        </div>
        <label htmlFor={id} className="relative inline-flex flex-none cursor-pointer items-center">
            <input
                id={id}
                type="checkbox"
                role="switch"
                className="peer sr-only"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span className="h-[22px] w-10 rounded-full bg-[#7a8aa3] transition-colors peer-checked:bg-[#155dfc] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#155dfc]" />
            <span className="absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform peer-checked:translate-x-[18px]" />
        </label>
    </div>
);

const ViewTick: React.FC<{ size?: number }> = ({ size = 12 }) => (
    <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-sm bg-[#155dfc] text-white">
        <FiCheck size={size} strokeWidth={3} />
    </span>
);

const SECTIONS: { id: string; label: string; icon: React.ReactNode }[] = [
    { id: 'display', label: 'Display', icon: <FiMonitor size={16} /> },
    { id: 'behaviour', label: 'Defaults & behaviour', icon: <FiPackage size={16} /> },
    { id: 'required', label: 'Required fields', icon: <FiShield size={16} /> },
    { id: 'voucher', label: 'Purchase numbering', icon: <FiHash size={16} /> },
];

const PurchaseSettingsPage: React.FC = () => {
    const { currentUser } = useAuth();

    const [settings, setSettings] = useState<PurchaseSettings | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    // UI only: which section link is highlighted in the nav
    const [activeSection, setActiveSection] = useState<string>('display');
    // UI only: search box (filters which settings are shown)
    const [query, setQuery] = useState<string>('');
    const [searchOpen, setSearchOpen] = useState<boolean>(false);

    useEffect(() => {
        if (!currentUser?.companyId) {
            setIsLoading(true);
            return;
        }

        const fetchOrCreateSettings = async () => {
            setIsLoading(true);
            const companyId = currentUser.companyId!;

            const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'purchase-settings');
            const counterDocRef = doc(db, 'companies', companyId, 'counters', 'purchaseCounter');

            try {
                const [docSnap, counterSnap] = await Promise.all([
                    getDoc(settingsDocRef),
                    getDoc(counterDocRef)
                ]);

                const defaultSettings = getDefaultPurchaseSettings(companyId);
                let mergedSettings = { ...defaultSettings };

                if (docSnap.exists()) {
                    mergedSettings = { ...mergedSettings, ...docSnap.data() };
                } else {
                    console.log(`No purchase settings found. Creating defaults...`);
                    await setDoc(settingsDocRef, defaultSettings);
                }

                if (counterSnap.exists() && counterSnap.data().currentNumber !== undefined) {
                    mergedSettings.currentVoucherNumber = counterSnap.data().currentNumber;
                } else {
                    await setDoc(counterDocRef, { currentNumber: defaultSettings.currentVoucherNumber }, { merge: true });
                }

                setSettings(mergedSettings as PurchaseSettings);
            } catch (err) {
                console.error('Failed to fetch/create purchase settings:', err);
                setModal({ message: 'Failed to load settings.', type: State.ERROR });
            } finally {
                setIsLoading(false);
            }
        };

        fetchOrCreateSettings();
    }, [currentUser?.companyId]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!currentUser?.companyId || !settings) {
            setModal({ message: 'Error: Missing data.', type: State.ERROR });
            return;
        }

        setIsSaving(true);
        try {
            const companyId = currentUser.companyId;
            const settingsRef = doc(db, 'companies', companyId, 'settings', 'purchase-settings');
            const counterRef = doc(db, 'companies', companyId, 'counters', 'purchaseCounter');

            const { currentVoucherNumber, ...restOfSettings } = settings;

            const settingsToSave = {
                ...restOfSettings,
                companyId: companyId,
                settingType: 'purchase'
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
            const counterDocRef = doc(db, 'companies', currentUser.companyId, 'counters', 'purchaseCounter');
            const counterSnap = await getDoc(counterDocRef);

            let backendCounter = 1;
            if (counterSnap.exists() && counterSnap.data().currentNumber) {
                backendCounter = counterSnap.data().currentNumber;
            }

            setSettings({
                ...settings,
                voucherName: 'Purchase',
                voucherPrefix: 'PUR',
                currentVoucherNumber: backendCounter
            });

        } catch (error) {
            console.error("Failed to fetch backend counter for reset:", error);
            setSettings({
                ...settings,
                voucherName: 'Purchase',
                voucherPrefix: 'PUR'
            });
        }
    };

    const handleChange = (field: keyof PurchaseSettings, value: string | number | boolean) => {
        if (!settings) return;

        if (field === 'defaultDiscount' || field === 'currentVoucherNumber') {
            if (value === '') {
                setSettings({ ...settings, [field]: 0 });
            } else {
                const numValue = parseFloat(String(value));
                setSettings({ ...settings, [field]: isNaN(numValue) ? 0 : numValue });
            }
        } else {
            setSettings({ ...settings, [field]: value });
        }
    };

    const handleCheckboxChange = (field: keyof PurchaseSettings, checked: boolean) => {
        if (settings) {
            setSettings({ ...settings, [field]: checked });
        }
    };

    // UI only: smooth-scroll to a section (no URL hash, so routing is untouched)
    const goToSection = (id: string) => {
        setActiveSection(id);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    if (isLoading || !settings) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#eef2ff] font-['Poppins',system-ui,-apple-system,'Segoe_UI',sans-serif]">
                <Spinner />
                <p className="mt-4 text-sm text-[#45556c]">Loading settings...</p>
            </div>
        );
    }

    const voucherPreview = settings.voucherPrefix
        ? `${settings.voucherPrefix}-${settings.currentVoucherNumber}`
        : String(settings.currentVoucherNumber);

    const q = query.trim().toLowerCase();
    const m = (text: string) => !q || text.toLowerCase().includes(q);

    const secDisplay = m('display how the purchase screen looks');
    const showView = secDisplay || m('list view card view photo image touchscreen pos barcode scanning');
    const showSort = secDisplay || m('cart item sorting newest first oldest first scanned');
    const showDisplay = showView || showSort;

    const secBehaviour = m('defaults behaviour extra options while recording a purchase');
    const rowBarcode = secBehaviour || m('barcode printing option print labels');
    const rowDisc2 = secBehaviour || m('second discount disc2 discount');
    const rowGodown = secBehaviour || m('godown assignment pay now stock shop warehouse');
    const showBehaviour = rowBarcode || rowDisc2 || rowGodown;

    const secRequired = m('required fields what must be filled before saving');
    const rowSupName = secRequired || m('require supplier name');
    const rowSupMobile = secRequired || m('require supplier mobile phone number');
    const showRequired = rowSupName || rowSupMobile;

    const showVoucher = m('purchase numbering voucher name prefix next number reset default how purchase entries are numbered');
    const noResults = !showDisplay && !showBehaviour && !showRequired && !showVoucher;

    const toggleSearch = () => {
        setSearchOpen((o) => !o);
        if (searchOpen) setQuery('');
    };

    const resetVoucherButton = (
        <button
            type="button"
            onClick={handleResetVoucher}
            className={`flex-none rounded-sm px-2.5 py-1.5 text-xs font-medium text-[#5b6b86] transition-colors hover:bg-[#f5f7ff] hover:text-[#0f172b] ${FOCUS_RING}`}
        >
            Reset to default
        </button>
    );

    return (
        <div className="flex min-h-screen w-full flex-col bg-[#eef2ff] font-['Poppins',system-ui,-apple-system,'Segoe_UI',sans-serif] text-[#0f172b]">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            {/* Header */}
            <div className="sticky top-0 z-30 border-b border-[#dfe6fb] bg-white">
                <div className="flex items-center gap-3 px-3 py-3 md:px-6 md:py-3.5">
                    <BackButton />
                    <div className="min-w-0">
                        <p className="text-xs leading-4 text-[#5b6b86]">Settings</p>
                        <h1 className="text-lg font-semibold leading-6 text-[#0f172b] md:text-[22px] md:leading-[30px]">
                            Purchase settings
                        </h1>
                    </div>
                    <p className="ml-4 hidden self-end pb-1 text-xs text-[#5b6b86] xl:block">
                        Applies to every purchase entry
                    </p>

                    {/* Desktop search */}
                    <label className="ml-auto hidden md:flex items-center gap-2 w-[300px] h-[38px] px-3 rounded-sm border border-[#7a8aa3] bg-white text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#155dfc]">
                        <Search size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
                            placeholder="Find a setting — e.g. barcode, discount, supplier"
                            aria-label="Find a setting"
                            className="flex-1 min-w-0 border-0 outline-none bg-transparent text-sm text-[#0f172b] placeholder:text-[#5b6b86]"
                        />
                    </label>

                    {/* Mobile search icon (right-most) */}
                    <button
                        type="button"
                        aria-label="Search"
                        onClick={toggleSearch}
                        className="ml-auto md:hidden inline-grid place-items-center w-10 h-10 rounded-sm text-[#45556c] hover:bg-[#f5f7ff]"
                    >
                        <Search size={20} strokeWidth={1.75} />
                    </button>
                </div>

                {/* Mobile search field */}
                {searchOpen && (
                    <div className="md:hidden px-4 pb-3">
                        <label className="flex items-center gap-2 h-10 px-3 rounded-sm border border-[#7a8aa3] bg-white text-[#5b6b86]">
                            <Search size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none" />
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Find a setting"
                                aria-label="Find a setting"
                                className="flex-1 min-w-0 border-0 outline-none bg-transparent text-sm text-[#0f172b] placeholder:text-[#5b6b86]"
                            />
                        </label>
                    </div>
                )}

                {/* Mobile section chips (now inside sticky header, so they stay fixed) */}
                <div
                    className="flex gap-2 overflow-x-auto border-t border-[#dfe6fb] px-4 py-2.5 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    role="group"
                    aria-label="Jump to section"
                >
                    {SECTIONS.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            aria-pressed={activeSection === s.id}
                            onClick={() => goToSection(s.id)}
                            className={`inline-flex h-[30px] flex-none items-center whitespace-nowrap rounded-sm border px-3 text-xs font-medium transition-colors ${FOCUS_RING} ${activeSection === s.id
                                ? 'border-[#0f172b] bg-[#0f172b] text-white'
                                : 'border-[#7a8aa3] bg-white text-[#45556c]'
                                }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            <main className="box-border min-h-0 w-full flex-grow overflow-y-auto px-3 pb-44 pt-4 sm:px-4 md:px-6 md:pb-6 md:pt-5">
                <form onSubmit={handleSave} className="mx-auto max-w-5xl">

                    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-5">
                        {/* Desktop section nav */}
                        <nav className="sticky top-4 hidden gap-0.5 lg:grid" aria-label="Settings sections">
                            {SECTIONS.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    aria-current={activeSection === s.id}
                                    onClick={() => goToSection(s.id)}
                                    className={`flex items-center gap-2.5 rounded-sm px-3 py-2 text-left text-[13px] font-medium transition-colors ${FOCUS_RING} ${activeSection === s.id
                                        ? 'bg-[#e6eeff] text-[#155dfc]'
                                        : 'text-[#45556c] hover:bg-white'
                                        }`}
                                >
                                    {s.icon}
                                    {s.label}
                                </button>
                            ))}
                            <p className="px-3 pt-3 text-xs leading-[18px] text-[#5b6b86]">
                                Changes save only when you press Save.
                            </p>
                        </nav>

                        <div className="grid gap-3 md:gap-4">

                            {/* Display */}
                            {showDisplay && (
                                <SettingsCard
                                    id="display"
                                    title="Display"
                                    subtitle="How the purchase screen looks"
                                    icon={<FiMonitor size={18} />}
                                    action={
                                        <ResetSettingsButton<PurchaseSettings>
                                            defaults={getDefaultPurchaseSettings(currentUser?.companyId ?? '')}
                                            onReset={setSettings}
                                        />
                                    }
                                >
                                    {showView && (
                                        <div className="px-4 py-4 md:px-[18px]">
                                            <div className="grid grid-cols-2 gap-3">
                                                {/* List View */}
                                                <button
                                                    type="button"
                                                    aria-pressed={settings.purchaseViewType === 'list'}
                                                    onClick={() => handleChange('purchaseViewType', 'list')}
                                                    className={`relative grid gap-2 rounded-sm p-3 text-left transition-colors ${FOCUS_RING} ${settings.purchaseViewType === 'list'
                                                        ? 'border-2 border-[#155dfc] bg-[#e6eeff] p-[11px]'
                                                        : 'border border-[#7a8aa3] bg-white hover:bg-[#f5f7ff]'
                                                        }`}
                                                >
                                                    {settings.purchaseViewType === 'list' && <ViewTick />}
                                                    <div className="grid h-[62px] content-start gap-1.5 rounded-sm border border-[#dfe6fb] bg-white p-2.5">
                                                        <i className="block h-1.5 w-[70%] rounded-[3px] bg-[#dfe6fb]" />
                                                        <i className="block h-1.5 rounded-[3px] bg-[#dfe6fb]" />
                                                        <i className="block h-1.5 w-[85%] rounded-[3px] bg-[#dfe6fb]" />
                                                        <i className="block h-1.5 rounded-[3px] bg-[#dfe6fb]" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-[#0f172b]">List view</p>
                                                        <p className="text-xs leading-[18px] text-[#5b6b86]">POS &amp; barcode scanning</p>
                                                    </div>
                                                </button>

                                                {/* Card View */}
                                                <button
                                                    type="button"
                                                    aria-pressed={settings.purchaseViewType === 'card'}
                                                    onClick={() => handleChange('purchaseViewType', 'card')}
                                                    className={`relative grid gap-2 rounded-sm p-3 text-left transition-colors ${FOCUS_RING} ${settings.purchaseViewType === 'card'
                                                        ? 'border-2 border-[#155dfc] bg-[#e6eeff] p-[11px]'
                                                        : 'border border-[#7a8aa3] bg-white hover:bg-[#f5f7ff]'
                                                        }`}
                                                >
                                                    {settings.purchaseViewType === 'card' && <ViewTick />}
                                                    <div className="grid h-[62px] grid-cols-3 content-start gap-1.5 rounded-sm border border-[#dfe6fb] bg-white p-2.5">
                                                        {[...Array(6)].map((_, i) => (
                                                            <i key={i} className="block h-4 rounded-[3px] bg-[#dfe6fb]" />
                                                        ))}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-[#0f172b]">Card view</p>
                                                        <p className="text-xs leading-[18px] text-[#5b6b86]">Touchscreens</p>
                                                    </div>
                                                </button>
                                            </div>

                                            {/* Card photo sub-options */}
                                            {settings.purchaseViewType === 'card' && (
                                                <div className="mt-3 rounded-sm bg-[#f5f7ff] p-3">
                                                    <p className="mb-2 text-xs font-semibold text-[#45556c]">Card image display</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {/* With Photo */}
                                                        <button
                                                            type="button"
                                                            aria-pressed={!!settings.cardViewWithPhoto}
                                                            onClick={() => handleCheckboxChange('cardViewWithPhoto', true)}
                                                            className={`relative flex flex-col items-center gap-2 rounded-sm p-2 text-left transition-colors sm:flex-row sm:gap-3 sm:p-3 ${FOCUS_RING} ${settings.cardViewWithPhoto
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
                                                            className={`relative flex flex-col items-center gap-2 rounded-sm p-2 text-left transition-colors sm:flex-row sm:gap-3 sm:p-3 ${FOCUS_RING} ${!settings.cardViewWithPhoto
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
                                        </div>
                                    )}

                                    {/* Cart Item Sorting */}
                                    {showSort && (
                                        <div className="grid gap-3 px-4 py-3.5 md:px-[18px]">
                                            <div>
                                                <OptionTitle icon={<FiList size={16} />}>Cart item sorting</OptionTitle>
                                                <p className="mt-0.5 text-xs leading-[18px] text-[#5b6b86]">
                                                    Choose where a newly scanned item appears in the cart.
                                                </p>
                                            </div>
                                            <div className="flex gap-0.5 rounded-[11px] border border-[#dfe6fb] bg-[#f5f7ff] p-[3px]" role="group" aria-label="Cart item sorting">
                                                <button
                                                    type="button"
                                                    aria-pressed={settings.cartInsertionOrder === 'top'}
                                                    onClick={() => handleChange('cartInsertionOrder', 'top')}
                                                    className={`h-9 flex-1 rounded-sm text-sm font-medium transition-colors ${FOCUS_RING} ${settings.cartInsertionOrder === 'top'
                                                        ? 'bg-[#0f172b] text-white'
                                                        : 'text-[#45556c] hover:text-[#0f172b]'
                                                        }`}
                                                >
                                                    Newest first
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-pressed={settings.cartInsertionOrder === 'bottom'}
                                                    onClick={() => handleChange('cartInsertionOrder', 'bottom')}
                                                    className={`h-9 flex-1 rounded-sm text-sm font-medium transition-colors ${FOCUS_RING} ${settings.cartInsertionOrder === 'bottom'
                                                        ? 'bg-[#0f172b] text-white'
                                                        : 'text-[#45556c] hover:text-[#0f172b]'
                                                        }`}
                                                >
                                                    Oldest first
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </SettingsCard>
                            )}

                            {/* Defaults & Behavior + Required Fields */}
                            {(showBehaviour || showRequired) && (
                                <div className="grid grid-cols-1 items-start gap-3 md:gap-4 xl:grid-cols-2">
                                    {showBehaviour && (
                                        <SettingsCard
                                            id="behaviour"
                                            title="Defaults & behaviour"
                                            subtitle="Extra options while recording a purchase"
                                            icon={<FiPackage size={18} />}
                                            tone="green"
                                        >
                                            {rowBarcode && (
                                                <ToggleRow
                                                    id="print-barcode"
                                                    icon={<FiPrinter size={16} />}
                                                    label="Barcode printing option"
                                                    description="After saving, offer to print barcodes for the items just received."
                                                    checked={settings.enableBarcodePrinting}
                                                    onChange={(checked) => handleCheckboxChange('enableBarcodePrinting', checked)}
                                                />
                                            )}
                                            {rowDisc2 && (
                                                <ToggleRow
                                                    id="item-discount-2"
                                                    icon={<FiPercent size={16} />}
                                                    label="Second discount (Disc2)"
                                                    description="Adds a second discount field (Disc2%) in the cart, applied on top of the first item discount."
                                                    checked={settings.enableDiscount2 ?? false}
                                                    onChange={(checked) => handleCheckboxChange('enableDiscount2', checked)}
                                                />
                                            )}
                                            {rowGodown && (
                                                <ToggleRow
                                                    id="godown-assignment"
                                                    icon={<FiLayers size={16} />}
                                                    label="Godown assignment"
                                                    description="Pay Now opens a pop-up to split the purchased quantity across godowns. When off, all stock goes straight to the Shop."
                                                    checked={settings.enableGodownAssignment ?? true}
                                                    onChange={(checked) => handleCheckboxChange('enableGodownAssignment', checked)}
                                                />
                                            )}
                                        </SettingsCard>
                                    )}

                                    {showRequired && (
                                        <SettingsCard
                                            id="required"
                                            title="Required fields"
                                            subtitle="What must be filled before saving a purchase"
                                            icon={<FiShield size={18} />}
                                            tone="magenta"
                                        >
                                            {rowSupName && (
                                                <ToggleRow
                                                    id="req-supplier-name"
                                                    icon={<FiUser size={16} />}
                                                    label="Require supplier name"
                                                    description="Block saving until a supplier name is entered."
                                                    checked={settings.requireSupplierName}
                                                    onChange={(checked) => handleCheckboxChange('requireSupplierName', checked)}
                                                />
                                            )}
                                            {rowSupMobile && (
                                                <ToggleRow
                                                    id="req-supplier-mobile"
                                                    icon={<FiPhone size={16} />}
                                                    label="Require supplier mobile"
                                                    description="Block saving until a supplier mobile number is entered."
                                                    checked={settings.requireSupplierMobile}
                                                    onChange={(checked) => handleCheckboxChange('requireSupplierMobile', checked)}
                                                />
                                            )}
                                        </SettingsCard>
                                    )}
                                </div>
                            )}

                            {/* Voucher Numbering */}
                            {showVoucher && (
                                <SettingsCard
                                    id="voucher"
                                    title="Purchase numbering"
                                    subtitle="How purchase entries are numbered"
                                    icon={<FiHash size={18} />}
                                    action={resetVoucherButton}
                                >
                                    <div className="grid gap-4 px-4 py-4 md:px-[18px]">
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
                                            <div className="grid gap-1">
                                                <label htmlFor="voucher-name" className="flex items-center gap-2 text-[13px] font-medium text-[#45556c]">
                                                    Voucher name
                                                    <span className="inline-flex h-[18px] items-center gap-1 rounded-sm bg-[#f5f7ff] px-2 text-[9px] font-semibold uppercase tracking-[0.03em] text-[#45556c]">
                                                        <FiLock size={10} />
                                                        Locked
                                                    </span>
                                                </label>
                                                <input
                                                    type="text"
                                                    id="voucher-name"
                                                    value={settings.voucherName || 'Purchase'}
                                                    disabled
                                                    className="h-10 w-full cursor-not-allowed select-none rounded-sm border border-[#7a8aa3] bg-[#f5f7ff] px-3 text-sm text-[#5b6b86] opacity-80"
                                                />
                                                <p className="text-xs text-[#5b6b86]">Internal name for this type of entry.</p>
                                            </div>
                                            <div className="grid gap-1">
                                                <label htmlFor="voucher-prefix" className="text-[13px] font-medium text-[#45556c]">Prefix</label>
                                                <input
                                                    type="text"
                                                    id="voucher-prefix"
                                                    value={settings.voucherPrefix || ''}
                                                    onChange={(e) => handleChange('voucherPrefix', e.target.value)}
                                                    className="h-10 w-full rounded-sm border border-[#7a8aa3] bg-white px-3 text-sm font-semibold text-[#0f172b] outline-none placeholder:font-normal placeholder:text-[#5b6b86] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[#155dfc]"
                                                    placeholder="e.g., PUR"
                                                />
                                                <p className="text-xs text-[#5b6b86]">Letters before the number, e.g. PUR-.</p>
                                            </div>
                                            <div className="grid gap-1">
                                                <label htmlFor="current-number" className="text-[13px] font-medium text-[#45556c]">Next number</label>
                                                <input
                                                    type="number"
                                                    id="current-number"
                                                    value={settings.currentVoucherNumber ?? 1000}
                                                    onChange={(e) => handleChange('currentVoucherNumber', e.target.value)}
                                                    className="h-10 w-full rounded-sm border border-[#7a8aa3] bg-white px-3 text-sm font-semibold tabular-nums text-[#0f172b] outline-none focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[#155dfc]"
                                                    min="1"
                                                    step="1"
                                                />
                                                <p className="text-xs text-[#5b6b86]">Number used for the next purchase.</p>
                                            </div>
                                        </div>
                                        <div className="inline-flex items-center gap-1.5 self-start justify-self-start rounded-sm bg-[#f5f7ff] px-3 py-2 text-xs text-[#45556c]">
                                            Next purchase will be
                                            <b className="font-semibold tabular-nums text-[#0f172b]">{voucherPreview}</b>
                                        </div>
                                    </div>
                                </SettingsCard>
                            )}

                            {noResults && (
                                <div className="rounded-sm border border-[#dfe6fb] bg-white px-6 py-10 text-center shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]">
                                    <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-sm bg-[#e6eeff] text-[#155dfc]"><FiSearch size={22} /></span>
                                    <p className="text-[15px] font-semibold text-[#0f172b]">No setting found for &ldquo;{query.trim()}&rdquo;</p>
                                    <p className="mt-1 text-xs text-[#5b6b86]">Try a shorter word, like discount, barcode or supplier.</p>
                                    <button type="button" onClick={() => setQuery('')} className={`mt-4 h-9 rounded-sm border border-[#7a8aa3] bg-white px-4 text-sm font-medium text-[#0f172b] hover:bg-[#f5f7ff] ${FOCUS_RING}`}>Clear search</button>
                                </div>
                            )}

                        </div>
                    </div>
                </form>
            </main>

            {/* Save bar: floating card on phone, sticky full-width bar on desktop */}
            <div className="pointer-events-none fixed inset-x-0 bottom-16 z-40 px-3 pb-2 md:pointer-events-auto md:sticky md:inset-x-auto md:bottom-0 md:border-t md:border-[#dfe6fb] md:bg-white md:p-0 md:shadow-[0_-6px_16px_rgba(21,48,140,0.06)] after:hidden after:content-[''] md:after:block md:after:absolute md:after:inset-x-0 md:after:top-full md:after:h-8 md:after:bg-white">
                <div className="pointer-events-auto mx-auto flex max-w-[640px] items-center justify-between gap-3 rounded-sm border border-[#dfe6fb] bg-white py-2.5 pl-4 pr-2.5 shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] md:mx-0 md:max-w-none md:rounded-none md:border-0 md:bg-transparent md:px-6 md:py-3 md:shadow-none">
                    <span className="min-w-0 text-xs leading-[18px] text-[#5b6b86]">Changes save only when you press Save.</span>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className={`inline-flex h-10 min-w-[140px] items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-transparent bg-[#155dfc] px-4 text-sm font-medium leading-5 text-white transition-colors hover:bg-[#1447e6] disabled:cursor-not-allowed disabled:opacity-45 ${FOCUS_RING}`}
                    >
                        {isSaving ? <Spinner /> : (<><FiCheck size={16} />Save settings</>)}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PurchaseSettingsPage;