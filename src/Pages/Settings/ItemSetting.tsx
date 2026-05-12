import React, { useState, useEffect } from 'react';
import { db } from '../../lib/Firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { ResetSettingsButton } from '../../Components/ResetSettingsButton';
import BackButton from '../../Components/BackButton';
import { InfoTooltip } from '../../Components/InfoToolTip'; // Re-added InfoTooltip

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
});

// --- Embedded ToggleRow Component ---
interface ToggleRowProps {
    id: string;
    label: string;
    description?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    tooltip?: string;
}


// --- Main Settings Component ---
interface SharedItemSettingsProps {
    theme?: 'blue' | 'orange';
}

const SharedItemSettings: React.FC<SharedItemSettingsProps> = ({ theme = 'blue' }) => {
    const themeStyles = {
        blue: {
            primaryBg: 'bg-blue-600',
            primaryHover: 'hover:bg-blue-700',
        },
        orange: {
            primaryBg: 'bg-orange-500',
            primaryHover: 'hover:bg-orange-600',
        }
    };

    const activeTheme = themeStyles[theme];
    const { currentUser } = useAuth();

    const [settings, setSettings] = useState<ItemSettings | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    const ToggleRow: React.FC<ToggleRowProps> = ({ id, label, description, checked, onChange, tooltip }) => {
        return (
            <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0">
                <div className="pr-4">
                    <div className="flex items-center gap-1.5">
                        <label htmlFor={id} className="text-sm font-medium text-gray-700 cursor-pointer">
                            {label}
                        </label>
                        {/* InfoTooltip correctly placed next to the label */}
                        {tooltip && <InfoTooltip text={tooltip} />}
                    </div>
                    {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
                </div>
                <div className="flex items-center h-5 mt-1">
                    <button
                        type="button"
                        id={id}
                        role="switch"
                        aria-checked={checked}
                        onClick={() => onChange(!checked)}
                        className={`${checked ? `${activeTheme.primaryBg}` : 'bg-gray-200'
                            } relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-${activeTheme.primaryBg} focus:ring-offset-2`}
                    >
                        <span
                            aria-hidden="true"
                            className={`${checked ? 'translate-x-4' : 'translate-x-0'
                                } pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                        />
                    </button>
                </div>
            </div>
        );
    };

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
                    setSettings({ ...getDefaultItemSettings(companyId), ...existingData });
                } else {
                    const defaultSettings = getDefaultItemSettings(companyId);
                    await setDoc(settingsDocRef, defaultSettings);
                    setSettings(defaultSettings);
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

    if (isLoading || !settings) {
        return (
            <div className="flex flex-col min-h-screen items-center justify-center">
                <Spinner />
                <p className="mt-4 text-gray-600">Loading Item Settings...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 w-full relative">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
                <BackButton />
                <h1 className="text-lg font-semibold text-gray-800">Item Settings</h1>
                <div className="w-6"></div>
            </div>

            <main className="flex-grow min-h-0 p-3 sm:p-4 md:p-5 bg-gray-50 w-full overflow-y-auto box-border pb-44 md:pb-24">
                <form onSubmit={handleSave} className="max-w-3xl mx-auto space-y-4 md:space-y-6">

                    {/* Header & Reset Button */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white rounded-sm border border-gray-200 shadow-sm p-4 md:p-6 gap-4">
                        <div>
                            <h2 className="text-base md:text-lg font-semibold text-gray-800">Global Requirements</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Select which optional fields must be filled out when manually adding a single item.
                                <br /><span className="text-xs text-red-500 font-medium">* Item name and MRP (or Sale Price) are always mandatory.</span>
                            </p>
                        </div>
                        <ResetSettingsButton<ItemSettings>
                            defaults={getDefaultItemSettings(currentUser?.companyId ?? '')}
                            onReset={setSettings}
                        />
                    </div>

                    {/* Categorization & Media */}
                    <section className="bg-white rounded-sm border border-gray-200 shadow-sm p-4 md:p-6 space-y-1">
                        <h3 className="text-md font-semibold text-gray-800 mb-2 border-b pb-2">Classification & Media</h3>
                        <ToggleRow
                            id="req-category"
                            label="Require Category"
                            description="Category must be selected when adding an item."
                            tooltip="Group this item belongs to (e.g., Electronics)."
                            checked={settings.requireCategory}
                            onChange={(checked: boolean) => handleCheckboxChange('requireCategory', checked)}
                        />
                        <ToggleRow
                            id="req-hsn"
                            label="Require HSN Code"
                            description="HSN/SAC code must be provided when adding an item."
                            tooltip="Harmonized System Nomenclature code for taxation."
                            checked={settings.requireHsnCode}
                            onChange={(checked: boolean) => handleCheckboxChange('requireHsnCode', checked)}
                        />
                        <ToggleRow
                            id="req-image"
                            label="Require Image"
                            description="An image file or URL must be provided when adding an item."
                            tooltip="The visual representation of the product."
                            checked={settings.requireImage}
                            onChange={(checked: boolean) => handleCheckboxChange('requireImage', checked)}
                        />
                    </section>

                    {/* Pricing & Tax */}
                    <section className="bg-white rounded-sm border border-gray-200 shadow-sm p-4 md:p-6 space-y-1">
                        <h3 className="text-md font-semibold text-gray-800 mb-2 border-b pb-2">Pricing & Taxes</h3>
                        <ToggleRow
                            id="req-purchasePrice"
                            label="Require Purchase Price"
                            description="Purchase price must be filled when adding an item."
                            tooltip="The price you paid to acquire this item."
                            checked={settings.requirePurchasePrice}
                            onChange={(checked: boolean) => handleCheckboxChange('requirePurchasePrice', checked)}
                        />
                        <ToggleRow
                            id="req-sale-discount"
                            label="Require Sale Discount (%)"
                            description="Sale discount percentage must be filled when adding an item."
                            tooltip="Default discount percentage given to customers."
                            checked={settings.requireSaleDiscount}
                            onChange={(checked: boolean) => handleCheckboxChange('requireSaleDiscount', checked)}
                        />
                        <ToggleRow
                            id="req-purchase-discount"
                            label="Require Purchase Discount (%)"
                            description="Purchase discount percentage must be filled when adding an item."
                            tooltip="Discount percentage received from the supplier."
                            checked={settings.requirePurchaseDiscount}
                            onChange={(checked: boolean) => handleCheckboxChange('requirePurchaseDiscount', checked)}
                        />
                        <ToggleRow
                            id="req-tax"
                            label="Require Tax (%)"
                            description="Tax percentage must be filled when adding an item."
                            tooltip="Applicable tax percentage for this item."
                            checked={settings.requireTax}
                            onChange={(checked: boolean) => handleCheckboxChange('requireTax', checked)}
                        />
                    </section>

                    {/* Inventory & Units */}
                    <section className="bg-white rounded-sm border border-gray-200 shadow-sm p-4 md:p-6 space-y-1">
                        <h3 className="text-md font-semibold text-gray-800 mb-2 border-b pb-2">Inventory & Measurement</h3>
                        <ToggleRow
                            id="req-stock"
                            label="Require Opening Stock"
                            description="Initial stock quantity must be entered when adding an item."
                            tooltip="Current available quantity in your inventory."
                            checked={settings.requireStock}
                            onChange={(checked: boolean) => handleCheckboxChange('requireStock', checked)}
                        />
                        <ToggleRow
                            id="req-restock"
                            label="Require Restock Level"
                            description="Restock alert quantity must be set when adding an item."
                            tooltip="Minimum stock level to trigger a reorder alert."
                            checked={settings.requireRestockQuantity}
                            onChange={(checked: boolean) => handleCheckboxChange('requireRestockQuantity', checked)}
                        />
                        <ToggleRow
                            id="req-moq"
                            label="Require MOQ"
                            description="Minimum Order Quantity must be specified when adding an item."
                            tooltip="Minimum Item Quantity to be ordered."
                            checked={settings.requireMoq}
                            onChange={(checked: boolean) => handleCheckboxChange('requireMoq', checked)}
                        />
                        <ToggleRow
                            id="req-unit"
                            label="Require Unit"
                            description="Unit of measurement (e.g., pcs, box) must be selected."
                            tooltip="Measurement unit (e.g., pieces, box, kg)."
                            checked={settings.requireUnit}
                            onChange={(checked: boolean) => handleCheckboxChange('requireUnit', checked)}
                        />
                    </section>

                    {/* Barcode Automation */}
                    <section className="bg-white rounded-sm border border-gray-200 shadow-sm p-4 md:p-6 space-y-1">
                        <h3 className="text-md font-semibold text-gray-800 mb-2 border-b pb-2">Barcode Handling</h3>
                        <ToggleRow
                            id="req-barcode"
                            label="Require Manual Barcode Input"
                            description="Barcode must be manually scanned or typed when adding an item."
                            tooltip="Unique identifier for scanning the product."
                            checked={settings.requireBarcode}
                            onChange={(checked: boolean) => handleCheckboxChange('requireBarcode', checked)}
                        />
                        <ToggleRow
                            id="auto-barcode"
                            label="Automatically Generate Barcode"
                            description="A unique barcode will be generated if the barcode field is left blank."
                            checked={settings.autoGenerateBarcode}
                            onChange={(checked: boolean) => handleCheckboxChange('autoGenerateBarcode', checked)}
                        />
                    </section>

                </form>
            </main>

            {/* Sticky Save Bar */}
            <div className="fixed inset-x-0 bottom-0 z-40 bg-white md:bg-transparent border-t md:border-t-0 border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:shadow-none md:bottom-4 pointer-events-auto">
                <div className="max-w-3xl mx-auto flex justify-center">
                    <button
                        onClick={() => handleSave()}
                        disabled={isSaving || isLoading}
                        className={`w-full md:w-auto md:min-w-[250px] flex items-center justify-center ${activeTheme.primaryBg} text-white font-bold py-3 md:py-4 px-6 rounded-sm ${activeTheme.primaryHover} transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg active:scale-[0.98]`}
                    >
                        {isSaving ? <Spinner /> : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SharedItemSettings;