import React, { useState, useEffect } from 'react';
import { db } from '../../lib/Firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { ResetSettingsButton } from '../../Components/ResetSettingsButton';
import { ToggleRow } from './SalesSetting';
import BackButton from '../../Components/BackButton';

export interface ItemSettings {
    companyId?: string;
    settingType: 'item';
    requirePurchasePrice: boolean;
    requireDiscount: boolean;
    requireTax: boolean;
    requireRestockQuantity: boolean;
    requireUnit: boolean;
    autoGenerateBarcode: boolean;
    requireCategory: boolean; // ADDED: Category Requirement
    requireBarcode: boolean;
    requireSaleDiscount: boolean;
    requirePurchaseDiscount: boolean
    requireStock: boolean;
}

export const getDefaultItemSettings = (companyId: string): ItemSettings => ({
    companyId: companyId,
    settingType: 'item',
    requirePurchasePrice: false,
    requireDiscount: false,
    requireTax: false,
    requireRestockQuantity: false,
    requireCategory: false,
    requireUnit: false,
    autoGenerateBarcode: true,
    requireBarcode: false,
    requireSaleDiscount: false,
    requirePurchaseDiscount: false,
    requireStock: false,
});

const ItemSettingsPage: React.FC = () => {
    const { currentUser } = useAuth();

    const [settings, setSettings] = useState<ItemSettings | null>(null);
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
            const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'item-settings');

            try {
                const docSnap = await getDoc(settingsDocRef);

                if (docSnap.exists()) {
                    setSettings(docSnap.data() as ItemSettings);
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

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

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
        <div className="flex flex-col min-h-screen bg-gray-100 w-full">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
                <BackButton/>
                <h1 className="text-lg font-semibold text-gray-800">Item Settings</h1>
                <div className="w-6"></div>
            </div>

            <main className="flex-grow p-4 bg-gray-50 w-full overflow-y-auto box-border">
                <form onSubmit={handleSave} className="bg-white rounded-sm p-4 shadow-md max-w-3xl mx-auto space-y-6">

                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-800">Optional Item Fields</h2>
                            <ResetSettingsButton<ItemSettings>
                                defaults={getDefaultItemSettings(currentUser?.companyId ?? '')}
                                onReset={setSettings}
                            />
                        </div>
                        <p className="text-sm text-gray-500 mb-3">
                            Select which of the optional fields must be filled out when manually adding a single item.
                            <br /><span className="text-xs text-red-500 font-medium">* Name, MRP/Sale Price, and Barcode are strictly required by the system and cannot be disabled.</span>
                        </p>

                        <div className="space-y-1 mt-3">
                            <ToggleRow
                                id="req-category"
                                label="Require Category"
                                description="Category must be selected when adding an item."
                                checked={settings.requireCategory}
                                onChange={(checked) => handleCheckboxChange('requireCategory', checked)}
                            />
                            <ToggleRow
                                id="req-purchasePrice"
                                label="Require Purchase Price"
                                description="Purchase price must be filled when adding an item."
                                checked={settings.requirePurchasePrice}
                                onChange={(checked) => handleCheckboxChange('requirePurchasePrice', checked)}
                            />
                            <ToggleRow
                                id="req-discount"
                                label="Require Discount (%)"
                                description="Discount field must be filled when adding an item."
                                checked={settings.requireDiscount}
                                onChange={(checked) => handleCheckboxChange('requireDiscount', checked)}
                            />
                            <ToggleRow
                                id="req-tax"
                                label="Require Tax (%)"
                                description="Tax field must be filled when adding an item."
                                checked={settings.requireTax}
                                onChange={(checked) => handleCheckboxChange('requireTax', checked)}
                            />
                            <ToggleRow
                                id="req-stock"
                                label="Require Stock"
                                description="Stock quantity must be entered when adding an item."
                                checked={settings.requireStock}
                                onChange={(checked) => handleCheckboxChange('requireStock', checked)}
                            />
                            <ToggleRow
                                id="req-restock"
                                label="Require Restock Quantity"
                                description="Restock quantity must be set when adding an item."
                                checked={settings.requireRestockQuantity}
                                onChange={(checked) => handleCheckboxChange('requireRestockQuantity', checked)}
                            />
                            <ToggleRow
                                id="req-unit"
                                label="Require Unit (e.g., kg, pcs)"
                                description="Unit of measurement must be specified when adding an item."
                                checked={settings.requireUnit}
                                onChange={(checked) => handleCheckboxChange('requireUnit', checked)}
                            />
                        </div>
                    </div>

                    <div>
                        <h2 className="text-base font-semibold text-gray-700 mb-3 border-b pb-2 pt-4">Barcode Automation</h2>
                        <ToggleRow
                            id="auto-barcode"
                            label="Automatically Generate Barcode if Empty"
                            description="A unique barcode will be generated when adding an item if the barcode field is left blank."
                            checked={settings.autoGenerateBarcode}
                            onChange={(checked) => handleCheckboxChange('autoGenerateBarcode', checked)}
                            tooltip="Auto-generates a unique barcode when the barcode field is left empty during item creation."
                        />
                    </div>
                    <div className="flex gap-4 mt-6">
                        <button
                            type="submit"
                            disabled={isSaving || isLoading}
                            className="flex-1 flex items-center justify-center bg-sky-500 text-white font-bold py-3 px-4 rounded-sm hover:bg-sky-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            {isSaving ? <Spinner /> : 'Save Item Settings'}
                        </button>

                    </div>
                </form>
            </main>
        </div>
    );
};

export default ItemSettingsPage;