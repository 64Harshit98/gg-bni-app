import React, { useState, useEffect } from 'react';
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
//import { Cata_Permissions } from '../enum/cata_permissions.enum';
//import CataShowWrapper from '../../context/CataShowWrapper';
import { InfoTooltip } from '../../Components/InfoToolTip';
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
  hideOutOfStock: false,
  enableTransportDetails: false,
});

interface CardProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}

const SettingsCard: React.FC<CardProps> = ({ title, icon, children, action }) => (
  <section className="bg-white rounded-sm border border-gray-200 shadow-sm p-5 md:p-6 space-y-5 transition-shadow">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {icon && <span className="text-[#F97316]">{icon}</span>}
        <h2 className="text-base md:text-lg font-semibold text-gray-800">{title}</h2>
      </div>
      {action}
    </div>
    {children}
  </section>
);

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
        <p className="hidden md:block text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
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

  if (isLoading || !settings) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <Spinner />
        <p className="mt-4 text-gray-600">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white w-full">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

      {showGstModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-sm shadow-lg w-full max-w-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-gray-800">Enter GST Number</h3>
            <p className="text-xs text-gray-500">
              GST number is required to enable this tax scheme. This will be saved to your business profile.
            </p>
            <input
              type="text"
              value={gstNumberInput}
              onChange={(e) => setGstNumberInput(e.target.value.toUpperCase().slice(0, 15))}
              placeholder="e.g., 22AAAAA0000A1Z5"
              maxLength={15}
              className="w-full p-2.5 text-sm border border-gray-300 rounded-sm focus:ring-[#F97316] focus:border-[#F97316] outline-none"
              autoFocus
            />
            <p className={`text-xs -mt-2 ${gstNumberInput.length === 15 ? 'text-green-600' : 'text-gray-400'}`}>
              {gstNumberInput.length}/15 characters
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowGstModal(false); setPendingGstScheme(null); }}
                className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-sm hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGstNumberSave}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#F97316] rounded-sm hover:bg-[#F97316]"
              >
                Save & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <BackButton />
        <h1 className="text-lg font-semibold text-gray-800">Sales Settings</h1>
        <div className="w-6"></div>
      </div>

      {/* Main content */}
      <main className="flex-grow min-h-0 p-3 sm:p-4 md:p-5 bg-gray-50 w-full overflow-y-auto box-border pb-44 md:pb-24">
        <form onSubmit={handleSave} className="max-w-5xl mx-auto space-y-5">

          {/* ── Inventory & Stock ─────────────────────────────────────────── */}
          <SettingsCard title="Inventory & Stock" icon={<PackageX size={18} />}>
            <ToggleRow
              id="allow-negative-inventory"
              label="Allow Negative Inventory"
              description="Allow orders even when stock is zero."
              checked={settings.allowNegativeInventory}
              onChange={(checked) => handleCheckboxChange('allowNegativeInventory', checked)}
              tooltip="Permit catalogue orders for items with no recorded stock."
              icon={<PackageX size={18} />}
            />

            <ToggleRow
              id="Hide Out of Stock Items"
              label="Hide Out of Stock Items"
              description="Hide Out of Stock Items."
              checked={settings.hideOutOfStock ?? false}
              onChange={(checked) => handleCheckboxChange('hideOutOfStock', checked)}
              tooltip="Hide Out Of Stock Items from Customers."
              icon={<EyeOff size={18} />}
            />

            <ToggleRow
              id="enable-out-of-stock-notification"
              label="Enable 'Notify Me' Button"
              description="Show a 'Notify Me' button on out-of-stock products so customers can request restock alerts."
              checked={settings.enableOutOfStockNotification ?? false}
              onChange={(checked) => handleCheckboxChange('enableOutOfStockNotification', checked)}
              tooltip="When enabled, customers will see a 'Notify Me' button instead of 'Add to Cart' for out-of-stock items. Their requests appear in the Pre-Order Requests page."
              icon={<BellRing size={18} />}
            />
          </SettingsCard>

          {/* ── Customer Access ───────────────────────────────────────────── */}
          <SettingsCard title="Customer Access" icon={<ShieldCheck size={18} />}>
            <ToggleRow
              id="hide-price"
              label="Hide Price from Customers"
              description="Prices will not be visible on the catalogue."
              checked={settings.hidePrice ?? false}
              onChange={(checked) => handleCheckboxChange('hidePrice', checked)}
              tooltip="Completely hides item prices on the customer-facing catalogue."
              icon={<EyeOff size={18} />}
            />
            <ToggleRow
              id="require-approval"
              label="Require Customer Approval"
              description="Customers must submit a request and be approved before they can view prices or add items to cart."
              checked={settings.requireApproval ?? false}
              onChange={(checked) => handleCheckboxChange('requireApproval', checked)}
              tooltip="Enables an approval gate — customers fill a lead form and you manually approve or decline them."
              icon={<ShieldCheck size={18} />}
            />
          </SettingsCard>

          <SettingsCard title="Pricing & Tax" icon={<Percent size={18} />}>
            <div className="space-y-3">
              <ToggleRow
                id="item-discount"
                label="Enable Item-wise Discount"
                description="Allow discount per item."
                checked={settings.enableItemWiseDiscount ?? false}
                onChange={(checked) => handleCheckboxChange('enableItemWiseDiscount', checked)}
                tooltip="Allow discounts to be applied to individual cart items."
                icon={<Percent size={18} />}
              />
              {/* GST Scheme */}
              <div className="rounded-sm bg-gray-50 border border-gray-100 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-semibold text-gray-800 leading-5">GST Scheme</p>
                  <InfoTooltip text="Select the applicable GST tax scheme for your business." />
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {[
                    { label: 'None', value: 'none' },
                    { label: 'Regular GST', value: 'regular' },
                    { label: 'Composition', value: 'composition' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        if (opt.value !== 'none' && settings.gstScheme === 'none') {
                          checkAndPromptGst(opt.value as 'regular' | 'composition');
                        } else {
                          handleChange('gstScheme', opt.value);
                        }
                      }}
                      className={`min-w-0 min-h-[42px] px-2 py-2 rounded-sm text-[11px] sm:text-sm font-semibold border leading-tight text-center whitespace-normal break-words ${settings.gstScheme === opt.value
                        ? 'bg-[#F97316] text-white border-[#F97316]'
                        : 'bg-white text-gray-700 border-gray-300'
                        }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tax Calculation — only for Regular GST */}
              {settings.gstScheme === 'regular' && (
                <div className="rounded-sm bg-gray-50 border border-gray-100 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-gray-800 leading-5">Tax Calculation</p>
                    <InfoTooltip text="Choose if your item prices include or exclude GST." />
                  </div>
                  <select
                    value={settings.taxType || 'exclusive'}
                    onChange={(e) => handleChange('taxType', e.target.value)}
                    className="w-full p-2.5 text-sm border border-gray-300 rounded-sm bg-white"
                  >
                    <option value="exclusive">Tax Exclusive (Sales Price excludes GST)</option>
                    <option value="inclusive">Tax Inclusive (Sales Price includes GST)</option>
                  </select>
                </div>
              )}
            </div>
          </SettingsCard>

          {/* ── Order Rules & Voucher in a 2-col grid ──────────────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

            {/* Order & Delivery */}
            <SettingsCard title="Order & Delivery" icon={<ClipboardList size={18} />}>
              <div className="rounded-sm bg-gray-50 border border-gray-100 p-3 mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Receipt size={16} className="text-[#F97316]" />
                  <label htmlFor="min-order" className="text-sm font-semibold text-gray-800">
                    Minimum Order Value (₹)
                  </label>
                  <InfoTooltip text="Customer cannot place an order below this amount." />
                </div>
                <input
                  id="min-order"
                  type="number"
                  min="0"
                  value={settings.minimumOrderValue === 0 ? '' : settings.minimumOrderValue}
                  onChange={(e) => handleChange('minimumOrderValue', e.target.value)}
                  className="w-full p-2.5 text-sm border border-gray-300 rounded-sm focus:ring-[#F97316] focus:border-[#F97316] outline-none mt-2"
                  placeholder="0 (no minimum)"
                />
                <p className="text-xs text-gray-500 mt-1.5">Leave blank or 0 to disable minimum order.</p>
              </div>

              <ToggleRow
                id="enable-transport-details"
                label="Enable Transport Details"
                description="Show transport details fields (transporter name, GR/RR No, vehicle no, etc.) on the order edit screen."
                checked={settings.enableTransportDetails ?? false}
                onChange={(checked) => handleCheckboxChange('enableTransportDetails', checked)}
                tooltip="Allows adding transport/logistics information to each order."
                icon={<Truck size={18} />}
              />
            </SettingsCard>

            {/* Voucher Numbering */}
            <SettingsCard title="Voucher Numbering" icon={<Hash size={18} />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center mb-1 gap-2">
                    <label htmlFor="voucher-prefix" className="text-sm font-medium text-gray-700">
                      Voucher Prefix
                    </label>
                    <InfoTooltip text="Letters added before the order number (e.g., ORD-1)." />
                  </div>
                  <input
                    type="text"
                    id="voucher-prefix"
                    value={settings.voucherPrefix || ''}
                    onChange={(e) => handleChange('voucherPrefix', e.target.value)}
                    className="w-full p-2.5 text-sm border border-gray-300 rounded-sm focus:ring-[#F97316] focus:border-[#F97316] outline-none"
                    placeholder="e.g., ORD-"
                  />
                </div>
                <div>
                  <div className="flex items-center mb-1 gap-2">
                    <label htmlFor="current-number" className="text-sm font-medium text-gray-700">
                      Next Voucher Number
                    </label>
                    <InfoTooltip text="Sequence number for the next generated order." />
                  </div>
                  <input
                    type="number"
                    id="current-number"
                    value={settings.currentVoucherNumber ?? 1}
                    onChange={(e) => handleChange('currentVoucherNumber', e.target.value)}
                    className="w-full p-2.5 text-sm border border-gray-300 rounded-sm focus:ring-[#F97316] focus:border-[#F97316] outline-none"
                    min="1"
                    step="1"
                  />
                </div>
              </div>
            </SettingsCard>
          </div>

        </form>
      </main>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-16 md:bottom-0 z-40 bg-transparent px-4 pb-2 md:p-4 pointer-events-none">
        <div className="max-w-2xl mx-auto flex justify-center gap-4 pointer-events-auto">
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="w-auto min-w-[150px] flex items-center justify-center bg-[#F97316] text-white font-bold py-3 px-6 rounded-sm hover:bg-[#F97316] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg"
          >
            {isSaving ? <Spinner /> : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CatalogueSalesSettings;