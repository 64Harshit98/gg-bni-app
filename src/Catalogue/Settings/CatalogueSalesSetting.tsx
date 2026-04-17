import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
//import { Cata_Permissions } from '../enum/cata_permissions.enum';
//import CataShowWrapper from '../../context/CataShowWrapper';
import { InfoTooltip } from '../../Components/InfoToolTip';

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
  hideOutOfStock?:boolean;
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
  hideOutOfStock:false
});

interface CardProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}
 
const SettingsCard: React.FC<CardProps> = ({ title, children, action }) => (
  <section className="bg-white rounded-sm border border-gray-200 shadow-sm p-5 md:p-6 space-y-5 transition-shadow">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base md:text-lg font-semibold text-gray-800">{title}</h2>
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
}
 
export const ToggleRow: React.FC<ToggleRowProps> = ({
  id, label, description, checked, onChange, tooltip, disabled = false
}) => (
  <div className={`flex items-start justify-between gap-4 rounded-sm bg-gray-50/60 border border-gray-100 p-3.5 md:p-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-gray-800 leading-5">{label}</label>
        <InfoTooltip text={tooltip || description} />
      </div>
      <p className="hidden md:block text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
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
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [settings, setSettings] = useState<CatalogueSalesSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

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

      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <button
          onClick={() => navigate(-1)}
          className="text-2xl font-bold text-gray-600 bg-transparent border-none cursor-pointer p-1"
        >
          &times;
        </button>
        <h1 className="text-lg font-semibold text-gray-800">Sales Settings</h1>
        <div className="w-6"></div>
      </div>

       {/* Main content */}
      <main className="flex-grow min-h-0 p-3 sm:p-4 md:p-5 bg-gray-50 w-full overflow-y-auto box-border pb-44 md:pb-24">
        <form onSubmit={handleSave} className="max-w-5xl mx-auto space-y-5">
 
          {/* ── Visibility ──────────────────────────────────────────────────── */}
          <SettingsCard title="Visibility">
              <ToggleRow
                id="allow-negative-inventory"
                label="Allow Negative Inventory"
                description="Allow orders even when stock is zero."
                checked={settings.allowNegativeInventory}
                onChange={(checked) => handleCheckboxChange('allowNegativeInventory', checked)}
                tooltip="Permit catalogue orders for items with no recorded stock."
              />
              <label className="ml-2 text-sm">
                Allow Negative Inventory
              </label>
            </div>
            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                checked={settings.hideOutOfStock}
                onChange={(e) =>
                  handleCheckboxChange(
                    'hideOutOfStock',
                    e.target.checked
                  )
                }
                className="w-4 h-4 accent-[#F97316]"
              />
              <label className="ml-2 text-sm">
                Hide Out of Stock Items
              </label>
            </div>
            {/* <div className="flex items-center">
              <input
                type="checkbox"
                checked={settings.enableOutOfStockNotification}
                onChange={(e) =>
                  handleCheckboxChange(
                    'enableOutOfStockNotification',
                    e.target.checked
                  )
                }
                className="w-4 h-4 accent-[#F97316]"
              />
              <label className="ml-2 text-sm">
                Enable Notify me button when item is out of stock
              </label>
            </div> */}

            {/* <div className="flex items-center mt-4">
              <input
                type="checkbox"
                checked={settings.requireApproval}
                onChange={(e) =>
                  handleCheckboxChange(
                    'requireApproval',
                    e.target.checked
                  )
                }
                className="w-4 h-4 accent-[#F97316]"
              />
              <label className="ml-2 text-sm">
                Require Customer Approval Before Ordering
              </label>
            </div> */}

            <div className="flex items-center mt-4">
              <input
                type="checkbox"
                checked={settings.hidePrice}
                onChange={(e) =>
                  handleCheckboxChange(
                    'hidePrice',
                    e.target.checked
                  )
                }
                className="w-4 h-4 accent-[#F97316]"
              />
              <label className="ml-2 text-sm">
                Hide Price from Customers
              </label>
            </div>
          </div>

          {/* Pricing & Tax */}

          <div className="bg-white rounded-lg p-6 shadow-md mb-2">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Pricing & Tax</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="gst-scheme" className="block text-gray-700 text-sm font-medium mb-1">GST Scheme</label>
                <select
                  id="gst-scheme"
                  value={settings.gstScheme || 'none'}
                  onChange={(e) => handleChange('gstScheme', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#F97316] focus:border-[#F97316]"
                >
                  <option value="none">None (Tax Disabled)</option>
                  <option value="regular">Regular GST</option>
                  <option value="composition">Composition GST</option>
                </select>
              </div>
            </div>

            {settings.gstScheme === 'regular' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                <div>
                  <label htmlFor="tax-type" className="block text-gray-700 text-sm font-medium mb-1">Tax Calculation (for Regular GST)</label>
                  <select
                    value={settings.taxType || 'exclusive'}
                    onChange={(e) => handleChange('taxType', e.target.value)}
                    className="w-full p-2.5 text-sm border border-gray-300 rounded-sm bg-white"
                  >
                    <option value="exclusive">Tax Exclusive (Sales Price excludes GST)</option>
                    <option value="inclusive">Tax Inclusive (Sales Price includes GST)</option>
                  </select>
                </div>
              </div>
            )}
            
            <div className="flex items-center mb-4">
              <input type="checkbox" id="item-discount" checked={settings.enableItemWiseDiscount ?? false} onChange={(e) => handleCheckboxChange('enableItemWiseDiscount', e.target.checked)} className="w-4 h-4 accent-[#F97316] rounded focus:ring-[#F97316]"/>
              <label htmlFor="item-discount" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                Enable Item-wise Discount
              </label>
              <InfoTooltip text="Allow discounts to be applied to individual cart items." />
            </div>
          </SettingsCard>
 
          {/* ── Order Rules & Voucher in a 2-col grid ──────────────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
 
            {/* Order Rules */}
            <SettingsCard title="Order Rules">
              <div className="rounded-sm bg-gray-50 border border-gray-100 p-3">
                <div className="flex items-center gap-2 mb-1">
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
            </SettingsCard>
 
            {/* Voucher Numbering */}
            <SettingsCard title="Voucher Numbering">
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