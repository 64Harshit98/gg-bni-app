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

export interface CatalogueSalesSettings {
  companyId: string
  settingType: 'catalogueSales'
  showOutOfStockItems: boolean
  disableOutOfStockAddToCart: boolean
  priceDisplayMode: 'mrp' | 'salePrice' | 'both'
  showDiscountBadge: boolean
  defaultCartQuantity: number
  allowQuantityDecreaseToZero: boolean
  enableLeadPopup: boolean
  minimumOrderValue: number
  voucherPrefix?: string
  currentVoucherNumber?: number
  copyVoucherAfterSaving?: boolean
}

export const getDefaultCatalogueSalesSettings = (companyId: string): CatalogueSalesSettings => ({
  companyId,
  settingType: 'catalogueSales',
  showOutOfStockItems: true,
  disableOutOfStockAddToCart: true,
  priceDisplayMode: 'both',
  showDiscountBadge: true,
  defaultCartQuantity: 1,
  allowQuantityDecreaseToZero: false,
  enableLeadPopup: false,
  minimumOrderValue: 0,
  voucherPrefix: 'SLS-',
  currentVoucherNumber: 1,
  copyVoucherAfterSaving: false,
});

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
          const savedData = docSnap.data();
          const mergedSettings = {
            ...defaultSettings,
            ...savedData
          };
          setSettings(mergedSettings as CatalogueSalesSettings);
        } else {
          console.log(`Creating default sales settings...`);
          await setDoc(settingsDocRef, defaultSettings);
          setSettings(defaultSettings);
        }
      } catch (err) {
        console.error('Failed to fetch/create sales settings:', err);
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
      const docToUpdateRef = doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');

      const settingsToSave = {
        ...settings,
        companyId: companyId,
        settingType: 'cataloguesales',
        updatedAt: new Date()
      };

      await setDoc(docToUpdateRef, settingsToSave, { merge: true });

      setModal({ message: 'Settings saved successfully!', type: State.SUCCESS });
    } catch (err) {
      console.error('Failed to save settings:', err);
      setModal({ message: 'Failed to save settings. Please try again.', type: State.ERROR });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof CatalogueSalesSettings, value: any) => {
    if (!settings) return;

    const numericFields: (keyof CatalogueSalesSettings)[] = [
      'defaultCartQuantity',
      'minimumOrderValue',
      'currentVoucherNumber'
    ];

    if (numericFields.includes(field)) {
      let numValue = parseFloat(value);

      if (isNaN(numValue)) numValue = 0;

      //  minimum 0 lock
      numValue = Math.max(0, numValue);

      setSettings({ ...settings, [field]: numValue });
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

      <main className="flex-grow p-4 bg-gray-50 w-full overflow-y-auto box-border pb-30">
        <form onSubmit={handleSave} className="max-w-3xl mx-auto">
          {/* Card 1 */}
          <div className="bg-white rounded-lg p-6 shadow-md mb-2">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Visibility
            </h2>

            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                checked={settings.showOutOfStockItems}
                onChange={(e) =>
                  handleCheckboxChange(
                    'showOutOfStockItems',
                    e.target.checked
                  )
                }
                className="w-4 h-4"
              />
              <label className="ml-2 text-sm">
                Show Out of Stock Items
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                checked={settings.disableOutOfStockAddToCart}
                onChange={(e) =>
                  handleCheckboxChange(
                    'disableOutOfStockAddToCart',
                    e.target.checked
                  )
                }
                className="w-4 h-4"
              />
              <label className="ml-2 text-sm">
                Disable Add to Cart when Out of Stock
              </label>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-white rounded-lg p-6 shadow-md mb-2">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Pricing Display
            </h2>

            <select
              value={settings.priceDisplayMode}
              onChange={(e) =>
                handleChange('priceDisplayMode', e.target.value)
              }
              className="w-full p-3 border rounded-lg mb-4"
            >
              <option value="mrp">Show MRP Only</option>
              <option value="salePrice">Show Sale Price Only</option>
              <option value="both">Show Both</option>
            </select>

            <div className="flex items-center">
              <input
                type="checkbox"
                checked={settings.showDiscountBadge}
                onChange={(e) =>
                  handleCheckboxChange(
                    'showDiscountBadge',
                    e.target.checked
                  )
                }
                className="w-4 h-4"
              />
              <label className="ml-2 text-sm">
                Show Discount Badge
              </label>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-white rounded-lg p-6 shadow-md mb-2">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Conversion
            </h2>

            <div className="flex items-center">
              <input
                type="checkbox"
                checked={settings.enableLeadPopup}
                onChange={(e) =>
                  handleCheckboxChange(
                    'enableLeadPopup',
                    e.target.checked
                  )
                }
                className="w-4 h-4"
              />
              <label className="ml-2 text-sm">
                Enable Lead Popup for Buyers
              </label>
            </div>
          </div>

          {/* Card 4 — Minimum Order Value */}
          <div className="bg-white rounded-lg p-6 shadow-md mb-2">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Order Rules
            </h2>

            <label className="block text-sm mb-2">
              Minimum Order Value (₹)
            </label>

            <input
              type="number"
              min="0"
              value={settings.minimumOrderValue === 0 ? '' : settings.minimumOrderValue}
              onChange={(e) =>
                handleChange('minimumOrderValue', e.target.value)
              }
              className="w-full p-3 border rounded-lg"
              placeholder="Enter minimum order value"
            />

            <p className="text-xs text-gray-500 mt-2">
              Customer cannot place order below this amount.
            </p>
          </div>

          {/* Card 5 — Voucher Numbering & Options */}
          <div className="bg-white rounded-lg p-6 shadow-md mb-2">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Voucher Numbering & Options
            </h2>

            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                checked={settings.copyVoucherAfterSaving ?? false}
                onChange={(e) =>
                  handleCheckboxChange('copyVoucherAfterSaving', e.target.checked)
                }
                className="w-4 h-4 text-blue-600 rounded"
              />
              <label className="ml-2 text-gray-700 text-sm font-medium">
                Keep items in cart after saving (Copy Voucher)
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">
                  Voucher Prefix
                </label>
                <input
                  type="text"
                  value={settings.voucherPrefix || ''}
                  onChange={(e) =>
                    handleChange('voucherPrefix', e.target.value)
                  }
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  placeholder="e.g., SLS-"
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">
                  Next Voucher Number
                </label>
                <input
                  type="number"
                  min="1"
                  value={settings.currentVoucherNumber ?? 1}
                  onChange={(e) =>
                    handleChange('currentVoucherNumber', e.target.value)
                  }
                  className="w-full p-3 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>
        </form>
      </main>

      <div className="fixed bottom-15 left-0 right-0 p-4 bg-transparent shadow-md">
        <div className="max-w-3xl mx-auto flex justify-center">
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="w-auto min-w-[150px] flex items-center justify-center bg-sky-500 text-white font-bold py-3 px-6 rounded-sm hover:bg-sky-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg"
          >
            {isSaving ? <Spinner /> : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CatalogueSalesSettings;