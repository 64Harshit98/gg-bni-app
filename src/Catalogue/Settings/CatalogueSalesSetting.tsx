import React, { useState, useEffect, useContext, useRef } from 'react';
import { db } from '../../lib/Firebase';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { FiCheck } from 'react-icons/fi';
//import { Cata_Permissions } from '../enum/cata_permissions.enum';
//import CataShowWrapper from '../../context/CataShowWrapper';
import { InfoTooltip } from '../../Components/InfoToolTip';
import { ResetSettingsButton } from '../../Components/ResetSettingsButton';
import BackButton from '../../Components/BackButton';
import {
  PackageX,
  BellRing,
  EyeOff,
  ShieldCheck,
  Percent,
  Receipt,
  Truck,
  ClipboardList,
  Hash,
  FileText,
  Search,
} from 'lucide-react';

export interface CatalogueSalesSettings {
  companyId: string
  settingType: 'catalogueSales'
  allowNegativeInventory: boolean
  enableOutOfStockNotification: boolean
  priceDisplayMode: 'mrp' | 'salePrice' | 'both'
  showDiscountBadge: boolean
  defaultCartQuantity: number
  allowQuantityDecreaseToZero: boolean
  enableLeadPopup: boolean
  minimumOrderValue: number
  voucherPrefix?: string
  currentVoucherNumber?: number
  copyVoucherAfterSaving?: boolean
  gstScheme?: 'regular' | 'composition' | 'none';
  taxType?: 'inclusive' | 'exclusive';
  lockTaxToggle?: boolean;
  enableRounding?: boolean;
  roundingInterval?: number;
  enforceExactMRP?: boolean;
  hidePrice?: boolean;
  cartInsertionOrder?: 'top' | 'bottom';
  requireApproval: boolean;
  enableItemWiseDiscount?: boolean;
  enableDiscount2?: boolean;
  hideOutOfStock?: boolean;
  enableTransportDetails?: boolean;
}

export const getDefaultCatalogueSalesSettings = (companyId: string): CatalogueSalesSettings => ({
  companyId,
  settingType: 'catalogueSales',
  allowNegativeInventory: true,
  enableOutOfStockNotification: false,
  priceDisplayMode: 'both',
  showDiscountBadge: true,
  defaultCartQuantity: 1,
  allowQuantityDecreaseToZero: false,
  enableLeadPopup: false,
  minimumOrderValue: 0,
  voucherPrefix: 'ORD-',
  currentVoucherNumber: 1,
  copyVoucherAfterSaving: false,
  gstScheme: 'none',
  taxType: 'inclusive',
  lockTaxToggle: false,
  enableRounding: true,
  roundingInterval: 1,
  enforceExactMRP: false,
  hidePrice: false,
  cartInsertionOrder: 'top',
  requireApproval: false,
  enableItemWiseDiscount: false,
  enableDiscount2: false,
  hideOutOfStock: false,
  enableTransportDetails: false,
});

/* ────────────────────────────────────────────────────────────────────────────
   ToggleRow is exported and may be used by other settings pages, so it is left
   exactly as it was. The Catalogue Sales Settings page below uses its own <Opt> row.
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

export const ToggleRow: React.FC<ToggleRowProps> = ({
  id, label, description, checked, onChange, tooltip, disabled = false, icon
}) => (
  <div className={`flex items-start justify-between gap-4 rounded-sm bg-gray-50/60 border border-gray-100 p-3.5 md:p-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
    <div className="min-w-0 flex gap-3">
      {icon && (
        <span className="mt-0.5 shrink-0 text-[#F97316]">{icon}</span>
      )}
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
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-[#F97316]" />
      <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
    </label>
  </div>
);

/* ────────────────────────────────────────────────────────────────────────────
   SELLAR design tokens (Catalogue orange accent) as Tailwind class strings.
   No embedded <style> / CSS string any more — everything is Tailwind utilities.

   canvas #fff7ed · surface #fff · sunken #fff3e6 · inverse/ink #0f172b
   muted #45556c · subtle #5b6b86 · border #f6e3d0 · control border #7a8aa3
   primary #F97316 (hover #EA580C) · primary text #C2410C · primary soft #ffedd5
   ──────────────────────────────────────────────────────────────────────────── */
const ROOT_BASE =
  "bg-[#fff7ed] font-['Poppins',system-ui,-apple-system,'Segoe_UI',sans-serif] text-sm leading-[22px] text-[#0f172b] antialiased";

const CARD_SHADOW = 'shadow-[0_1px_2px_rgba(124,58,0,.05),0_2px_6px_rgba(124,58,0,.06)]';
const FLOAT_SHADOW = 'shadow-[0_10px_28px_rgba(124,58,0,.14),0_2px_6px_rgba(124,58,0,.08)]';
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F97316]';

const FIELD =
  'flex h-10 items-center gap-2 border border-[#7a8aa3] bg-white px-3 rounded-sm focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#F97316]';
const FIELD_INPUT =
  'min-w-0 flex-1 border-0 bg-transparent text-sm text-[#0f172b] outline-none placeholder:text-[#5b6b86]';
const FIELD_LABEL = 'mb-1 flex items-center gap-2 text-xs font-medium text-[#45556c]';

const BTN_BASE =
  'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-transparent px-4 text-sm font-medium leading-5 transition-colors';
const BTN_PRIMARY = `${BTN_BASE} bg-[#F97316] text-white hover:bg-[#EA580C] disabled:cursor-not-allowed disabled:opacity-[.45] disabled:hover:bg-[#F97316] ${FOCUS_RING}`;
const BTN_SECONDARY = `${BTN_BASE} border-[#7a8aa3] bg-white text-[#0f172b] hover:bg-[#fff3e6] ${FOCUS_RING}`;

/* ── Presentational building blocks ────────────────────────────────────────── */
// UI-only: the search box filters which option rows are shown on screen.
const SettingsSearchContext = React.createContext<string>('');
const SectionTextContext = React.createContext<string>('');

interface SectionProps {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ id, title, subtitle, icon, action, children }) => (
  <section
    id={id}
    className={`min-w-0 scroll-mt-[132px] overflow-hidden border border-[#f6e3d0] bg-white p-0 rounded-sm lg:scroll-mt-[88px] ${CARD_SHADOW}`}
  >
    <div className="flex items-center gap-3 border-b border-[#f6e3d0] px-3.5 py-3 lg:px-[18px] lg:py-3.5">
      <span className="inline-grid h-8 w-8 flex-none place-items-center bg-[#ffedd5] text-[#C2410C] rounded-sm">
        {icon}
      </span>
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
      className={`grid items-center gap-x-4 gap-y-1.5 border-b border-[#f6e3d0] px-3.5 py-3 last:border-b-0 lg:px-[18px] lg:py-3.5 ${
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
            className="relative block h-[22px] w-10 rounded-full bg-[#7a8aa3] transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(0,0,0,.2)] after:transition-transform after:content-[''] peer-checked:bg-[#F97316] peer-checked:after:translate-x-[18px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#F97316]"
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
    className={`max-w-full gap-0.5 border border-[#f6e3d0] bg-[#fff3e6] p-[3px] rounded-sm ${large ? 'flex' : 'inline-flex'}`}
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
          : `bg-white text-[#C2410C] ${CARD_SHADOW}`
        : 'bg-transparent text-[#45556c]'
    }`}
  >
    {children}
  </button>
);

const NAV_SECTIONS: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: 'pricing', label: 'Pricing & tax', icon: <Percent size={16} strokeWidth={1.75} /> },
  { id: 'inventory', label: 'Inventory & stock', icon: <PackageX size={16} strokeWidth={1.75} /> },
  { id: 'access', label: 'Customer access', icon: <ShieldCheck size={16} strokeWidth={1.75} /> },
  { id: 'order', label: 'Order & delivery', icon: <ClipboardList size={16} strokeWidth={1.75} /> },
  { id: 'voucher', label: 'Voucher numbering', icon: <Hash size={16} strokeWidth={1.75} /> },
];

const ico = (Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>) => <Icon size={16} strokeWidth={1.75} />;

const CatalogueSalesSettings: React.FC = () => {
  const { currentUser } = useAuth();

  const [settings, setSettings] = useState<CatalogueSalesSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

  // GST number prompt states
  const [showGstModal, setShowGstModal] = useState<boolean>(false);
  const [gstNumberInput, setGstNumberInput] = useState<string>('');
  const [pendingGstScheme, setPendingGstScheme] = useState<'regular' | 'composition' | null>(null);

  // UI only: which section nav item is highlighted
  const [activeSection, setActiveSection] = useState<string>('pricing');

  // UI only: search box
  const [query, setQuery] = useState<string>('');
  const [noMatch, setNoMatch] = useState<boolean>(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [searchOpen, setSearchOpen] = useState<boolean>(false); // phone only: search row open/closed

  useEffect(() => {
    if (!currentUser?.companyId) {
      setIsLoading(true);
      return;
    }

    const fetchOrCreateSettings = async () => {
      setIsLoading(true);
      const companyId = currentUser.companyId!;

      const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');

      try {
        const docSnap = await getDoc(settingsDocRef);
        const defaultSettings = getDefaultCatalogueSalesSettings(companyId);

        if (docSnap.exists()) {
          setSettings({ ...defaultSettings, ...docSnap.data() } as CatalogueSalesSettings);
        } else {
          await setDoc(settingsDocRef, defaultSettings);
          setSettings(defaultSettings);
        }
      } catch (err) {
        console.error('Failed to fetch/create catalogue sales settings:', err);
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
      const docRef = doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');

      await setDoc(docRef, {
        ...settings,
        companyId,
        settingType: 'catalogueSales',
        updatedAt: new Date()
      }, { merge: true });


      setModal({ message: 'Settings saved successfully!', type: State.SUCCESS });
    } catch (err) {
      console.error('Failed to save settings:', err);
      setModal({ message: 'Failed to save settings. Please try again.', type: State.ERROR });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof CatalogueSalesSettings, value: string | number | boolean) => {
    if (!settings) return;

    const numericFields: (keyof CatalogueSalesSettings)[] = [
      'defaultCartQuantity',
      'minimumOrderValue',
      'currentVoucherNumber',
      'roundingInterval',
    ];

    if (numericFields.includes(field)) {
      const numValue = parseFloat(String(value));
      setSettings({ ...settings, [field]: isNaN(numValue) ? 0 : Math.max(0, numValue) });
    } else {
      setSettings({ ...settings, [field]: value });
    }
  };

  const handleCheckboxChange = (field: keyof CatalogueSalesSettings, checked: boolean) => {
    if (settings) {
      setSettings({ ...settings, [field]: checked });
    }
  };

  // Checks business_info for an existing GST number before allowing scheme change
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

  // Saves entered GST number to business_info and applies the pending scheme
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

  return (
    <div className={`${ROOT_BASE} flex min-h-screen w-full flex-col`}>
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} theme="catalogue" />}

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
      <div className="sticky top-0 z-30 border-b border-[#f6e3d0] bg-white">
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

          {/* Desktop search field */}
          <label className="hidden h-[38px] w-[300px] items-center gap-2 rounded-sm border border-[#7a8aa3] bg-white px-3 text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#F97316] md:flex">
            <Search size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
              placeholder="Find a setting — e.g. GST, stock, prefix"
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
            className="inline-grid h-10 w-10 place-items-center rounded-sm text-[#45556c] hover:bg-[#fff3e6] md:hidden"
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
          className="flex gap-1.5 overflow-x-auto border-t border-[#f6e3d0] px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden"
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
                      ? 'bg-[#ffedd5] text-[#C2410C]'
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
                <div className={`min-w-0 border border-[#f6e3d0] bg-white px-4 py-10 text-center text-[#45556c] rounded-sm ${CARD_SHADOW}`}>
                  <b className="mb-1 block text-[15px] font-semibold text-[#0f172b]">No setting found</b>
                  Try a different word — for example “discount”, “GST” or “stock”.
                </div>
              )}

              {/* Pricing & Tax */}
              <Section
                id="pricing"
                title="Pricing & tax"
                subtitle="Discounts and GST scheme"
                icon={<Percent size={18} strokeWidth={1.75} />}
                action={
                  <ResetSettingsButton<CatalogueSalesSettings>
                    defaults={getDefaultCatalogueSalesSettings(currentUser?.companyId ?? '')}
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
                <Opt
                  id="item-discount"
                  label="Enable Item-wise Discount"
                  description="Allow discounts to be applied to individual cart items."
                  icon={ico(Percent)}
                  checked={settings.enableItemWiseDiscount ?? false}
                  onChange={(checked) => handleCheckboxChange('enableItemWiseDiscount', checked)}
                />
                <Opt
                  id="item-discount-2"
                  label="Enable Second Discount (Disc2)"
                  description="Adds a compounding second discount field (Disc2%) in the order edit cart, on top of the existing item discount."
                  icon={ico(Percent)}
                  checked={settings.enableDiscount2 ?? false}
                  onChange={(checked) => handleCheckboxChange('enableDiscount2', checked)}
                  disabled={!settings.enableItemWiseDiscount}
                />

                {/* GST Scheme */}
                <Opt
                  label="GST Scheme"
                  description="Select the applicable GST tax scheme for your business."
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

                {/* Tax Calculation — only for Regular GST */}
                {settings.gstScheme === 'regular' && (
                  <Opt
                    label="Tax Calculation"
                    description="Choose if your item prices include or exclude GST."
                    icon={ico(Percent)}
                  >
                    <SegGroup large>
                      <SegBtn
                        large
                        active={(settings.taxType || 'exclusive') === 'exclusive'}
                        onClick={() => handleChange('taxType', 'exclusive')}
                      >
                        Tax Exclusive — Sales Price excludes GST
                      </SegBtn>
                      <SegBtn
                        large
                        active={(settings.taxType || 'exclusive') === 'inclusive'}
                        onClick={() => handleChange('taxType', 'inclusive')}
                      >
                        Tax Inclusive — Sales Price includes GST
                      </SegBtn>
                    </SegGroup>
                  </Opt>
                )}
              </Section>

              {/* Inventory / Customer access / Order & delivery / Voucher numbering.
                  2×2 grid on wide screens: each row stretches both cards to the same
                  height, so there is no empty gap under the shorter column. */}
              <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-2 xl:gap-4">
                <Section
                  id="inventory"
                  title="Inventory & stock"
                  subtitle="What happens when an item is out of stock"
                  icon={<PackageX size={18} strokeWidth={1.75} />}
                >
                  <Opt
                    id="allow-negative-inventory"
                    label="Allow Negative Inventory"
                    description="Permit catalogue orders for items with no recorded stock."
                    icon={ico(PackageX)}
                    checked={settings.allowNegativeInventory}
                    onChange={(checked) => handleCheckboxChange('allowNegativeInventory', checked)}
                  />
                  <Opt
                    id="hide-out-of-stock"
                    label="Hide Out of Stock Items"
                    description="Hide Out Of Stock Items from Customers."
                    icon={ico(EyeOff)}
                    checked={settings.hideOutOfStock ?? false}
                    onChange={(checked) => handleCheckboxChange('hideOutOfStock', checked)}
                  />
                  <Opt
                    id="enable-out-of-stock-notification"
                    label="Enable 'Notify Me' Button"
                    description="Customers see a 'Notify Me' button instead of 'Add to Cart' for out-of-stock items. Their requests appear in the Pre-Order Requests page."
                    icon={ico(BellRing)}
                    checked={settings.enableOutOfStockNotification ?? false}
                    onChange={(checked) => handleCheckboxChange('enableOutOfStockNotification', checked)}
                  />
                </Section>

                <Section
                  id="access"
                  title="Customer access"
                  subtitle="What customers can see on the catalogue"
                  icon={<ShieldCheck size={18} strokeWidth={1.75} />}
                >
                  <Opt
                    id="hide-price"
                    label="Hide Price from Customers"
                    description="Completely hides item prices on the customer-facing catalogue."
                    icon={ico(EyeOff)}
                    checked={settings.hidePrice ?? false}
                    onChange={(checked) => handleCheckboxChange('hidePrice', checked)}
                  />
                  <Opt
                    id="require-approval"
                    label="Require Customer Approval"
                    description="Customers fill a lead form and you manually approve or decline them before they can view prices or add items to cart."
                    icon={ico(ShieldCheck)}
                    checked={settings.requireApproval ?? false}
                    onChange={(checked) => handleCheckboxChange('requireApproval', checked)}
                  />
                </Section>

                <Section
                  id="order"
                  title="Order & delivery"
                  subtitle="Order limits and transport fields"
                  icon={<ClipboardList size={18} strokeWidth={1.75} />}
                >
                  <Opt
                    label="Minimum Order Value (₹)"
                    description="Customer cannot place an order below this amount. Leave blank or 0 to disable."
                    icon={ico(Receipt)}
                  >
                    <div className={FIELD}>
                      <input
                        id="min-order"
                        type="number"
                        min="0"
                        aria-label="Minimum Order Value"
                        className={FIELD_INPUT}
                        value={settings.minimumOrderValue === 0 ? '' : settings.minimumOrderValue}
                        onChange={(e) => handleChange('minimumOrderValue', e.target.value)}
                        placeholder="0 (no minimum)"
                      />
                    </div>
                  </Opt>
                  <Opt
                    id="enable-transport-details"
                    label="Enable Transport Details"
                    description="Show transport details fields (transporter name, GR/RR No, vehicle no, etc.) on the order edit screen."
                    icon={ico(Truck)}
                    checked={settings.enableTransportDetails ?? false}
                    onChange={(checked) => handleCheckboxChange('enableTransportDetails', checked)}
                  />
                </Section>

                {/* Voucher numbering */}
                <Section
                  id="voucher"
                  title="Voucher numbering"
                  subtitle="How catalogue orders are numbered"
                  icon={<Hash size={18} strokeWidth={1.75} />}
                >
                  <Opt label="Numbering">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label htmlFor="voucher-prefix" className={FIELD_LABEL}>
                          Voucher Prefix
                          <InfoTooltip text="Letters added before the order number (e.g., ORD-1)." />
                        </label>
                        <div className={FIELD}>
                          <input
                            type="text"
                            id="voucher-prefix"
                            className={FIELD_INPUT}
                            value={settings.voucherPrefix || ''}
                            onChange={(e) => handleChange('voucherPrefix', e.target.value)}
                            placeholder="e.g., ORD-"
                            style={{ fontWeight: 600 }}
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="current-number" className={FIELD_LABEL}>
                          Next Voucher Number
                          <InfoTooltip text="Sequence number for the next generated order." />
                        </label>
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
                  </Opt>
                </Section>
              </div>
            </form>
          </div>
        </SettingsSearchContext.Provider>
      </main>

      {/* Save bar: floating card on phone, sticky full-width bar on desktop */}
      <div className="pointer-events-none fixed inset-x-0 bottom-16 z-40 px-3 pb-2 md:pointer-events-auto md:sticky md:inset-x-auto md:bottom-0 md:border-t md:border-[#f6e3d0] md:bg-white md:p-0 md:shadow-[0_-6px_16px_rgba(124,58,0,.06)] md:after:absolute md:after:inset-x-0 md:after:top-full md:after:h-8 md:after:bg-white md:after:content-['']">
        <div className={`pointer-events-auto mx-auto flex max-w-[640px] items-center justify-between gap-3 border border-[#f6e3d0] bg-white py-2.5 pl-4 pr-2.5 rounded-sm ${FLOAT_SHADOW} md:mx-0 md:max-w-none md:rounded-none md:border-0 md:bg-transparent md:px-6 md:py-3 md:shadow-none`}>
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

export default CatalogueSalesSettings;