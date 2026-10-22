import React, { useState, useEffect, useContext, useRef } from 'react';
import { db } from '../../lib/Firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { ResetSettingsButton } from '../../Components/ResetSettingsButton';
import BackButton from '../../Components/BackButton';

// --- Shared Interfaces ---
export interface ItemSettings {
    companyId?: string;
    settingType: 'item';
    // Categorization & Media
    requireCategory: boolean;
    requireImage: boolean;
    requireHsnCode: boolean;
    // Pricing & Tax
    requirePurchasePrice: boolean;
    requireSaleDiscount: boolean;
    requirePurchaseDiscount: boolean;
    requireDiscount: boolean;
    requireTax: boolean;
    // Inventory & Measurement
    requireStock: boolean;
    requireRestockQuantity: boolean;
    requireMoq: boolean;
    requireUnit: boolean;
    // Barcode
    requireBarcode: boolean;
    autoGenerateBarcode: boolean;
    enablePriceTiers: boolean;
    enableQuantitySlabs: boolean;
}

export const getDefaultItemSettings = (companyId: string): ItemSettings => ({
    companyId: companyId,
    settingType: 'item',
    requireCategory: false,
    requireImage: false,
    requireHsnCode: false,
    requirePurchasePrice: false,
    requireSaleDiscount: false,
    requirePurchaseDiscount: false,
    requireDiscount: false,
    requireTax: false,
    requireStock: false,
    requireRestockQuantity: false,
    requireMoq: false,
    requireUnit: false,
    requireBarcode: false,
    autoGenerateBarcode: true,
    enablePriceTiers: false,
    enableQuantitySlabs: false,
});

// --- UI only: theme classes (full strings so Tailwind can detect them) ---
interface ThemeStyles {
    page: string;
    primaryBg: string;
    primaryHover: string;
    soft: string;
    softInk: string;
    outline: string;
}

const THEMES: Record<'blue' | 'orange', ThemeStyles> = {
    blue: {
        page: 'bg-[#eef2ff]',
        primaryBg: 'bg-[#155dfc]',
        primaryHover: 'hover:bg-[#1447e6]',
        soft: 'bg-[#e6eeff]',
        softInk: 'text-[#155dfc]',
        outline: 'focus-visible:outline-[#155dfc]',
    },
    orange: {
        page: 'bg-[#fff5ec]',
        primaryBg: 'bg-[#c2410c]',
        primaryHover: 'hover:bg-[#9a3412]',
        soft: 'bg-[#ffedd5]',
        softInk: 'text-[#9a3412]',
        outline: 'focus-visible:outline-[#c2410c]',
    },
};

const CARD = 'min-w-0 overflow-hidden rounded-sm border border-[#dfe6fb] bg-white shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]';
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

// --- UI only: icons (inline SVG, no extra dependency) ---
const ICONS = {
    lock: (<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
    tag: (<><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></>),
    doc: (<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>),
    grid: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
    image: (<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 17-5-5-9 8" /></>),
    box: (<><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>),
    percent: (<><path d="M19 5 5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>),
    restock: (<><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5M12 8v4l3 2" /></>),
    bag: (<><path d="M5 7h14l-1 14H6z" /><path d="M9 7a3 3 0 0 1 6 0" /></>),
    barcode: (<path d="M4 5v14M8 5v14M11 5v10M14 5v14M17 5v10M20 5v14" />),
    scan: (<><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 8v8M10 8v8M13 8v8M17 8v8" /></>),
    layers: (<><path d="m12 2 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>),
    bars: (<><path d="M3 3v18h18" /><path d="M8 16v-4M13 16V8M18 16v-6" /></>),
    check: (<path d="M5 12.5l4.5 4.5L19 7" />),
    search: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
};
type IconName = keyof typeof ICONS;

const Ico: React.FC<{ name: IconName; className?: string }> = ({ name, className = 'h-4 w-4' }) => (
    <svg
        className={`flex-none ${className}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {ICONS[name]}
    </svg>
);

// --- UI only: section nav (scrolls to a section; no router / hash involved) ---
const SECTIONS: { id: string; label: string; icon: IconName }[] = [
    { id: 'is-mandatory', label: 'Always required', icon: 'lock' },
    { id: 'is-classification', label: 'Classification', icon: 'grid' },
    { id: 'is-pricing', label: 'Pricing & taxes', icon: 'percent' },
    { id: 'is-inventory', label: 'Inventory', icon: 'box' },
    { id: 'is-barcode', label: 'Barcode', icon: 'barcode' },
    { id: 'is-optional', label: 'Optional features', icon: 'layers' },
];

const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// --- UI only: "Add item form will ask for" preview (derived from current settings) ---
type RequireKey =
    | 'requireCategory' | 'requireHsnCode' | 'requireImage'
    | 'requirePurchasePrice' | 'requireSaleDiscount' | 'requirePurchaseDiscount' | 'requireTax'
    | 'requireStock' | 'requireRestockQuantity' | 'requireMoq' | 'requireUnit'
    | 'requireBarcode';

const PREVIEW_FIELDS: { key: RequireKey; label: string }[] = [
    { key: 'requireCategory', label: 'Category' },
    { key: 'requireHsnCode', label: 'HSN code' },
    { key: 'requireImage', label: 'Image' },
    { key: 'requirePurchasePrice', label: 'Purchase price' },
    { key: 'requireSaleDiscount', label: 'Sale discount' },
    { key: 'requirePurchaseDiscount', label: 'Purchase discount' },
    { key: 'requireTax', label: 'Tax %' },
    { key: 'requireStock', label: 'Opening stock' },
    { key: 'requireRestockQuantity', label: 'Restock level' },
    { key: 'requireMoq', label: 'MOQ' },
    { key: 'requireUnit', label: 'Unit' },
    { key: 'requireBarcode', label: 'Barcode' },
];

// --- UI only: labels shown in the save bar for unsaved changes ---
const CHANGE_LABELS: { key: keyof ItemSettings; label: string }[] = [
    { key: 'requireCategory', label: 'Require category' },
    { key: 'requireHsnCode', label: 'Require HSN code' },
    { key: 'requireImage', label: 'Require image' },
    { key: 'requirePurchasePrice', label: 'Require purchase price' },
    { key: 'requireSaleDiscount', label: 'Require sale discount' },
    { key: 'requirePurchaseDiscount', label: 'Require purchase discount' },
    { key: 'requireTax', label: 'Require tax' },
    { key: 'requireStock', label: 'Require opening stock' },
    { key: 'requireRestockQuantity', label: 'Require restock level' },
    { key: 'requireMoq', label: 'Require MOQ' },
    { key: 'requireUnit', label: 'Require unit' },
    { key: 'autoGenerateBarcode', label: 'Auto-generate barcode' },
    { key: 'requireBarcode', label: 'Manual barcode input' },
    { key: 'enablePriceTiers', label: 'Multiple pricing options' },
    { key: 'enableQuantitySlabs', label: 'Quantity pricing' },
];

// --- UI only: search (filters which rows are shown on screen) ---
const SearchContext = React.createContext<string>('');
const SectionTextContext = React.createContext<string>('');

// While searching: hide sections with no matching row, and hide info notes
const SEARCH_CSS = `
.is-searching section:not(:has([data-row])) { display: none; }
.is-searching [data-note] { display: none; }
`;

// --- UI building blocks ---
const ROW = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-[#dfe6fb] px-[14px] py-3 last:border-b-0 md:px-[18px] md:py-3.5';

interface ToggleRowProps {
    id: string;
    label: string;
    description?: string;
    icon: IconName;
    checked: boolean;
    onChange: (checked: boolean) => void;
    t: ThemeStyles;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ id, label, description, icon, checked, onChange, t }) => {
    const query = useContext(SearchContext).trim().toLowerCase();
    const sectionText = useContext(SectionTextContext);
    if (query && !`${label} ${description ?? ''} ${sectionText}`.toLowerCase().includes(query)) return null;
    return (
        <div className={ROW} data-row>
            <div>
                <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#0f172b]">
                    <Ico name={icon} className="h-4 w-4 text-[#45556c]" />
                    {label}
                </label>
                {description && <div id={`${id}-desc`} className="mt-0.5 text-xs leading-[18px] text-[#5b6b86]">{description}</div>}
            </div>
            <button
                type="button"
                id={id}
                role="switch"
                aria-checked={checked}
                aria-describedby={description ? `${id}-desc` : undefined}
                onClick={() => onChange(!checked)}
                className={`relative h-[22px] w-10 flex-none rounded-[11px] transition-colors duration-150 ${FOCUS} ${t.outline} ${checked ? t.primaryBg : 'bg-[#7a8aa3]'}`}
            >
                <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-150 ${checked ? 'translate-x-[18px]' : 'translate-x-0'}`}
                />
            </button>
        </div>
    );
};

const Badge: React.FC<{ children: React.ReactNode; info?: boolean; t: ThemeStyles }> = ({ children, info, t }) => (
    <span
        className={`inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-sm px-2 text-[11px] font-semibold leading-[22px] tracking-[0.03em] ${info ? `${t.soft} ${t.softInk}` : 'bg-[#f5f7ff] text-[#45556c]'}`}
    >
        {children}
    </span>
);

const LockedRow: React.FC<{ label: string; description: string; icon: IconName; t: ThemeStyles }> = ({ label, description, icon, t }) => {
    const query = useContext(SearchContext).trim().toLowerCase();
    const sectionText = useContext(SectionTextContext);
    if (query && !`${label} ${description ?? ''} ${sectionText}`.toLowerCase().includes(query)) return null;
    return (
        <div className={ROW} data-row>
            <div>
                <div className="flex items-center gap-2 text-sm font-medium text-[#0f172b]">
                    <Ico name={icon} className="h-4 w-4 text-[#45556c]" />
                    {label}
                </div>
                <div className="mt-0.5 text-xs leading-[18px] text-[#5b6b86]">{description}</div>
            </div>
            <Badge t={t}><Ico name="lock" />ALWAYS</Badge>
        </div>
    );
};

const TINTS = {
    magenta: 'bg-[#ffe8f8] text-[#c4009a]',
    green: 'bg-[#e9faef] text-[#008236]',
    amber: 'bg-[#fff3dd] text-[#bb4d00]',
};

const Section: React.FC<{
    id: string;
    title: string;
    subtitle: string;
    icon: IconName;
    tint?: keyof typeof TINTS;
    t: ThemeStyles;
    children: React.ReactNode;
}> = ({ id, title, subtitle, icon, tint, t, children }) => (
    <section id={id} className={`${CARD} scroll-mt-[120px] md:scroll-mt-[132px] xl:scroll-mt-[84px]`}>
        <div className="flex items-center gap-3 border-b border-[#dfe6fb] px-[14px] py-3 md:px-[18px] md:py-3.5">
            <span className={`inline-grid h-8 w-8 flex-none place-items-center rounded-sm ${tint ? TINTS[tint] : `${t.soft} ${t.softInk}`}`}>
                <Ico name={icon} className="h-[18px] w-[18px]" />
            </span>
            <div>
                <b className="block text-[15px] font-semibold leading-[22px] text-[#0f172b] md:text-base">{title}</b>
                <small className="block text-xs font-normal leading-[18px] text-[#5b6b86]">{subtitle}</small>
            </div>
        </div>
        <SectionTextContext.Provider value={`${title} ${subtitle}`}>{children}</SectionTextContext.Provider>
    </section>
);

// --- Main Settings Component ---
interface SharedItemSettingsProps {
    theme?: 'blue' | 'orange';
}

const SharedItemSettings: React.FC<SharedItemSettingsProps> = ({ theme = 'blue' }) => {
    const t = THEMES[theme];
    const { currentUser } = useAuth();

    const [settings, setSettings] = useState<ItemSettings | null>(null);
    const [savedSettings, setSavedSettings] = useState<ItemSettings | null>(null); // baseline for "unsaved changes"
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    // UI only: search
    const [query, setQuery] = useState<string>('');
    const [searchOpen, setSearchOpen] = useState<boolean>(false); // phone only: search row open/closed
    const [noMatch, setNoMatch] = useState<boolean>(false);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (!currentUser?.companyId) {
            setIsLoading(true);
            return;
        }

        const fetchOrCreateSettings = async () => {
            setIsLoading(true);
            const companyId = currentUser.companyId!;
            const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'item-settings');

            try {
                const docSnap = await getDoc(settingsDocRef);

                if (docSnap.exists()) {
                    const existingData = docSnap.data() as Partial<ItemSettings>;
                    const loaded = { ...getDefaultItemSettings(companyId), ...existingData };
                    setSettings(loaded);
                    setSavedSettings(loaded);
                } else {
                    const defaultSettings = getDefaultItemSettings(companyId);
                    await setDoc(settingsDocRef, defaultSettings);
                    setSettings(defaultSettings);
                    setSavedSettings(defaultSettings);
                }
            } catch (err) {
                console.error('Failed to load item settings:', err);
                setModal({ message: 'Failed to load settings.', type: State.ERROR });
            } finally {
                setIsLoading(false);
            }
        };

        fetchOrCreateSettings();
    }, [currentUser?.companyId]);

    // UI only: show an empty message when the search matches no row
    useEffect(() => {
        const none = query.trim().length > 0 && !formRef.current?.querySelector('[data-row]');
        setNoMatch((prev) => (prev === none ? prev : none));
    });

    const handleSave = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (!currentUser?.companyId || !settings) {
            setModal({ message: 'Error: Missing data.', type: State.ERROR });
            return;
        }

        setIsSaving(true);
        try {
            const companyId = currentUser.companyId;
            const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'item-settings');

            await updateDoc(settingsDocRef, settings as unknown as { [x: string]: any });
            setSavedSettings(settings);
            setModal({ message: 'Item settings saved successfully!', type: State.SUCCESS });
        } catch (err) {
            console.error('Failed to save settings:', err);
            setModal({ message: 'Failed to save settings. Please try again.', type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCheckboxChange = (field: keyof ItemSettings, checked: boolean) => {
        if (settings) {
            setSettings({ ...settings, [field]: checked });
        }
    };

    const handleDiscard = () => {
        if (savedSettings) setSettings(savedSettings);
    };

    const pageClass = `flex min-h-screen w-full flex-col font-['Poppins',system-ui,-apple-system,'Segoe_UI',sans-serif] text-sm text-[#0f172b] antialiased ${t.page}`;

    if (isLoading || !settings) {
        return (
            <div className={`${pageClass} items-center justify-center`}>
                <Spinner />
                <p className="mt-4 text-[#45556c]">Loading item settings...</p>
            </div>
        );
    }

    const requiredFields = PREVIEW_FIELDS.filter((f) => settings[f.key]);
    const optionalFields = PREVIEW_FIELDS.filter((f) => !settings[f.key] && f.key !== 'requireBarcode');

    // Unsaved-change tracking (compares against last loaded/saved values)
    const changeLabels = savedSettings
        ? CHANGE_LABELS.filter((c) => settings[c.key] !== savedSettings[c.key]).map((c) => c.label)
        : [];
    const changeCount = changeLabels.length;

    return (
        <div className={pageClass}>
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[#dfe6fb] bg-white px-3 md:h-[68px] md:gap-4 md:px-6">
                <BackButton />
                <div className="min-w-0 flex-1">
                    <div className="hidden text-xs leading-4 text-[#5b6b86] md:block">Settings /</div>
                    <h1 className="m-0 text-lg font-semibold leading-[26px] md:text-[22px] md:leading-[30px]">Item settings</h1>
                </div>
                <span className="hidden text-xs text-[#5b6b86] xl:block">Which fields must be filled when adding a single item</span>

                {/* Desktop search */}
                <label className="hidden h-[38px] w-[280px] items-center gap-2 rounded-sm border border-[#7a8aa3] bg-white px-3 text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#155dfc] md:flex">
                    <Ico name="search" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
                        placeholder="Find a setting — e.g. barcode, HSN, MOQ"
                        aria-label="Find a setting"
                        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#0f172b] outline-none placeholder:text-[#5b6b86]"
                    />
                </label>

                {/* Mobile search toggle */}
                <button
                    type="button"
                    aria-label="Search"
                    onClick={() => { setSearchOpen((o) => !o); if (searchOpen) setQuery(''); }}
                    className="inline-grid h-10 w-10 place-items-center rounded-sm text-[#45556c] hover:bg-[#f5f7ff] md:hidden"
                >
                    <Ico name="search" className="h-5 w-5" />
                </button>

                <ResetSettingsButton<ItemSettings>
                    defaults={getDefaultItemSettings(currentUser?.companyId ?? '')}
                    onReset={setSettings}
                />
            </header>

            {/* Mobile search row + section chips — phones and tablets */}
            <div className="sticky top-14 z-20 border-b border-[#dfe6fb] bg-white md:top-[68px] xl:hidden">
                {searchOpen && (
                    <div className="px-4 pt-2.5 md:hidden">
                        <label className="flex h-10 items-center gap-2 rounded-sm border border-[#7a8aa3] bg-white px-3 text-[#5b6b86]">
                            <Ico name="search" />
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
                <nav aria-label="Sections" className="flex gap-1.5 overflow-x-auto px-4 py-2.5 [&::-webkit-scrollbar]:hidden">
                    {SECTIONS.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => scrollToSection(s.id)}
                            className={`inline-flex h-[30px] flex-none items-center whitespace-nowrap rounded-sm border border-[#7a8aa3] bg-white px-3 text-xs font-medium text-[#45556c] hover:bg-[#f5f7ff] ${FOCUS} ${t.outline}`}
                        >
                            {s.label}
                        </button>
                    ))}
                </nav>
            </div>

            <SearchContext.Provider value={query}>
                <style>{SEARCH_CSS}</style>
                <div className="mx-auto grid w-full max-w-[760px] flex-1 grid-cols-1 items-start gap-3 px-4 pb-6 pt-3 md:gap-4 md:px-6 md:pb-7 md:pt-5 xl:max-w-[1320px] xl:grid-cols-[220px_minmax(0,1fr)_280px]">
                    {/* Section nav — desktop */}
                    <nav aria-label="Sections" className="sticky top-[84px] hidden gap-0.5 xl:col-start-1 xl:row-start-1 xl:grid">
                        {SECTIONS.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => scrollToSection(s.id)}
                                className={`flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-[13px] font-medium text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b] ${FOCUS} ${t.outline}`}
                            >
                                <Ico name={s.icon} />
                                {s.label}
                            </button>
                        ))}
                    </nav>

                    {/* What the Add item form will ask for */}
                    <aside className="grid gap-3 xl:sticky xl:top-[84px] xl:col-start-3 xl:row-start-1">
                        <div className={`${CARD} grid gap-2.5 px-4 py-3.5`}>
                            <b className="text-sm font-semibold">Add item form will ask for</b>
                            <div className="flex flex-wrap gap-1.5">
                                <Badge info t={t}>Item name *</Badge>
                                <Badge info t={t}>MRP or sale price *</Badge>
                                {requiredFields.map((f) => (
                                    <Badge key={f.key} info t={t}>{f.label} *</Badge>
                                ))}
                            </div>
                            {optionalFields.length > 0 && (
                                <div className="text-xs leading-[18px] text-[#5b6b86]">
                                    Optional: {optionalFields.map((f) => f.label).join(', ')}
                                </div>
                            )}
                        </div>
                        <div className={`flex items-start gap-2 rounded-sm px-3 py-2.5 text-xs leading-[18px] ${t.soft} ${t.softInk}`}>
                            <Ico name="doc" />
                            <span>These rules apply when manually adding a single item.</span>
                        </div>
                    </aside>

                    <form
                        ref={formRef}
                        onSubmit={handleSave}
                        className={`grid min-w-0 gap-3 md:gap-4 xl:col-start-2 xl:row-start-1${query.trim() ? ' is-searching' : ''}`}
                    >
                        {noMatch && (
                            <div className={`${CARD} px-4 py-10 text-center text-[#45556c]`}>
                                <b className="mb-1 block text-[15px] font-semibold text-[#0f172b]">No setting found</b>
                                Try a different word — for example “barcode”, “HSN” or “stock”.
                            </div>
                        )}

                        {/* Always required */}
                        <Section id="is-mandatory" title="Always required" subtitle="These can't be turned off" icon="lock" t={t}>
                            <LockedRow label="Item name" description="Every item needs a name." icon="tag" t={t} />
                            <LockedRow label="MRP or sale price" description="At least one of the two, so the item can be billed." icon="doc" t={t} />
                        </Section>

                        {/* Categorization & Media */}
                        <Section id="is-classification" title="Classification & media" subtitle="Grouping and pictures" icon="grid" tint="magenta" t={t}>
                            <ToggleRow
                                t={t}
                                id="req-category"
                                icon="grid"
                                label="Require category (item group)"
                                description="Every new item must be put in a group."
                                checked={settings.requireCategory}
                                onChange={(checked: boolean) => handleCheckboxChange('requireCategory', checked)}
                            />
                            <ToggleRow
                                t={t}
                                id="req-hsn"
                                icon="doc"
                                label="Require HSN code"
                                description="Needed on GST bills and GSTR-1. Turn on if you file GST."
                                checked={settings.requireHsnCode}
                                onChange={(checked: boolean) => handleCheckboxChange('requireHsnCode', checked)}
                            />
                            <ToggleRow
                                t={t}
                                id="req-image"
                                icon="image"
                                label="Require image"
                                description="A photo on every item — helps in Card view and online catalogues."
                                checked={settings.requireImage}
                                onChange={(checked: boolean) => handleCheckboxChange('requireImage', checked)}
                            />
                        </Section>

                        {/* Pricing & Tax */}
                        <Section id="is-pricing" title="Pricing & taxes" subtitle="Price fields on the Add item form" icon="percent" tint="green" t={t}>
                            <ToggleRow
                                t={t}
                                id="req-purchasePrice"
                                icon="box"
                                label="Require purchase price"
                                description="Without it, profit is overstated because cost shows as ₹0."
                                checked={settings.requirePurchasePrice}
                                onChange={(checked: boolean) => handleCheckboxChange('requirePurchasePrice', checked)}
                            />
                            <ToggleRow
                                t={t}
                                id="req-sale-discount"
                                icon="percent"
                                label="Require sale discount (%)"
                                description="A sale discount % must be entered (0 is allowed)."
                                checked={settings.requireSaleDiscount}
                                onChange={(checked: boolean) => handleCheckboxChange('requireSaleDiscount', checked)}
                            />
                            <ToggleRow
                                t={t}
                                id="req-purchase-discount"
                                icon="percent"
                                label="Require purchase discount (%)"
                                description="A purchase discount % must be entered (0 is allowed)."
                                checked={settings.requirePurchaseDiscount}
                                onChange={(checked: boolean) => handleCheckboxChange('requirePurchaseDiscount', checked)}
                            />
                            <ToggleRow
                                t={t}
                                id="req-tax"
                                icon="doc"
                                label="Require tax (%)"
                                description="Pick a GST rate for every item — recommended with Regular GST."
                                checked={settings.requireTax}
                                onChange={(checked: boolean) => handleCheckboxChange('requireTax', checked)}
                            />
                        </Section>

                        {/* Inventory & Units */}
                        <Section id="is-inventory" title="Inventory & measurement" subtitle="Stock fields on the Add item form" icon="box" tint="amber" t={t}>
                            <ToggleRow
                                t={t}
                                id="req-stock"
                                icon="box"
                                label="Require opening stock"
                                description="How many you have when you add the item."
                                checked={settings.requireStock}
                                onChange={(checked: boolean) => handleCheckboxChange('requireStock', checked)}
                            />
                            <ToggleRow
                                t={t}
                                id="req-restock"
                                icon="restock"
                                label="Require restock level"
                                description="Stock level that triggers a low-stock alert."
                                checked={settings.requireRestockQuantity}
                                onChange={(checked: boolean) => handleCheckboxChange('requireRestockQuantity', checked)}
                            />
                            <ToggleRow
                                t={t}
                                id="req-moq"
                                icon="bag"
                                label="Require MOQ"
                                description="Minimum order quantity for reordering."
                                checked={settings.requireMoq}
                                onChange={(checked: boolean) => handleCheckboxChange('requireMoq', checked)}
                            />
                            <ToggleRow
                                t={t}
                                id="req-unit"
                                icon="tag"
                                label="Require unit"
                                description="pcs, kg, box… a unit must be selected for every item."
                                checked={settings.requireUnit}
                                onChange={(checked: boolean) => handleCheckboxChange('requireUnit', checked)}
                            />
                        </Section>

                        {/* Barcode Automation */}
                        <Section id="is-barcode" title="Barcode handling" subtitle="How new items get a barcode" icon="barcode" t={t}>
                            <ToggleRow
                                t={t}
                                id="auto-barcode"
                                icon="barcode"
                                label="Automatically generate barcode"
                                description="A unique barcode is generated if the barcode field is left blank. You can still change or scan it."
                                checked={settings.autoGenerateBarcode}
                                onChange={(checked: boolean) => handleCheckboxChange('autoGenerateBarcode', checked)}
                            />
                            <ToggleRow
                                t={t}
                                id="req-barcode"
                                icon="scan"
                                label="Require manual barcode input"
                                description="The barcode must be typed or scanned from the pack when adding an item."
                                checked={settings.requireBarcode}
                                onChange={(checked: boolean) => handleCheckboxChange('requireBarcode', checked)}
                            />
                            <div data-note className="border-b border-[#dfe6fb] px-[14px] py-3 last:border-b-0 md:px-[18px] md:py-3.5">
                                <div className={`flex items-start gap-2 rounded-sm px-3 py-2.5 text-[13px] leading-[19px] ${t.soft} ${t.softInk}`}>
                                    <Ico name="barcode" />
                                    <span>
                                        Use one or the other: <b>auto-generate</b> for loose or unbranded goods, <b>manual</b> if everything you sell has a printed barcode.
                                    </span>
                                </div>
                            </div>
                        </Section>

                        {/* Optional Features */}
                        <Section id="is-optional" title="Optional features" subtitle="Extra sections on the item form" icon="layers" t={t}>
                            <ToggleRow
                                t={t}
                                id="enable-price-tiers"
                                icon="layers"
                                label="Enable multiple pricing options"
                                description="Show the Pricing Options section (e.g. Box of 10, Combo) when adding or editing an item."
                                checked={settings.enablePriceTiers}
                                onChange={(checked: boolean) => handleCheckboxChange('enablePriceTiers', checked)}
                            />
                            <ToggleRow
                                t={t}
                                id="enable-quantity-slabs"
                                icon="bars"
                                label="Enable quantity pricing"
                                description="Show the Quantity Pricing section (e.g. 1-10 @ ₹100, 11-20 @ ₹95) when adding or editing an item."
                                checked={settings.enableQuantitySlabs}
                                onChange={(checked: boolean) => handleCheckboxChange('enableQuantitySlabs', checked)}
                            />
                        </Section>
                    </form>
                </div>
            </SearchContext.Provider>

            {/* Save bar (same pattern as Barcode settings) */}
            <div className="sticky bottom-0 z-20 mt-auto flex flex-wrap items-center gap-3 border-t border-[#dfe6fb] bg-white px-4 pb-4 pt-2.5 shadow-[0_-6px_16px_rgba(21,48,140,0.06)] lg:px-6 lg:py-3">
                <span className={`h-2 w-2 shrink-0 rounded-sm ${changeCount === 0 ? 'bg-[#008236]' : t.primaryBg}`} />
                <span className="text-sm font-semibold text-[#0f172b]">
                    {changeCount === 0
                        ? 'All changes saved'
                        : `${changeCount} unsaved ${changeCount === 1 ? 'change' : 'changes'}`}
                </span>
                {changeCount > 0 && (
                    <span className="min-w-0 flex-[1_1_160px] truncate text-xs text-[#5b6b86]">
                        {changeLabels.join(' · ')}
                    </span>
                )}
                <div className="ml-auto flex gap-2">
                    <button
                        type="button"
                        onClick={handleDiscard}
                        disabled={changeCount === 0 || isSaving}
                        className="h-10 cursor-pointer rounded-sm border border-transparent bg-transparent px-4 text-sm font-medium text-[#45556c] transition-colors hover:bg-[#f5f7ff] hover:text-[#0f172b] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                        Discard
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className={`inline-flex h-10 cursor-pointer items-center justify-center rounded-sm border border-transparent px-4 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${t.primaryBg} ${t.primaryHover}`}
                    >
                        {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SharedItemSettings;