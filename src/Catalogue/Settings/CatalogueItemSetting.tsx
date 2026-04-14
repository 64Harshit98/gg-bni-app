import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
} from 'firebase/firestore';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { ToggleRow } from '../Settings/CatalogueSalesSetting';
export interface ItemSettings {
    companyId?: string;
    settingType: 'item';
    requirePurchasePrice: boolean;
    requireSaleDiscount: boolean;
    requirePurchaseDiscount: boolean;
    requireTax: boolean;
    requireBarcode: boolean;
    requireRestockQuantity: boolean;
    autoGenerateBarcode: boolean;
}

export const getDefaultItemSettings = (companyId: string): ItemSettings => ({
    companyId: companyId,
    settingType: 'item',
    requirePurchasePrice: true,
    requireSaleDiscount: false,
    requirePurchaseDiscount: false,
    requireTax: false,
    requireBarcode: false,
    requireRestockQuantity: false,

    autoGenerateBarcode: true,
});

const CatalogueItemSetting: React.FC = () => {
    const navigate = useNavigate();
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
                    console.log("No item settings found. Creating defaults...");
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
                <button onClick={() => navigate(-1)} className="text-2xl font-bold text-gray-600 bg-transparent border-none cursor-pointer p-1">&times;</button>
                <h1 className="text-lg font-semibold text-gray-800">Item Settings</h1>
                <div className="w-6"></div>
            </div>

            <main className="flex-grow min-h-0 p-3 sm:p-4 md:p-5 bg-gray-50 w-full overflow-y-auto box-border pb-44 md:pb-24">
                <form onSubmit={handleSave} className="max-w-3xl mx-auto space-y-3">

                    {/* Required Fields */}
                    <section className="bg-white rounded-sm border border-gray-200 shadow-sm p-5 md:p-6 space-y-3">
                        <h2 className="text-base md:text-lg font-semibold text-gray-800">Required Fields</h2>
                        <p className="text-sm text-gray-500 -mt-2">
                            Select which fields must be filled when adding a single item.
                            (Name, MRP, Stock Amount, and Category are always required).
                        </p>
                        <div className="space-y-1">
                            <ToggleRow
                                id="req-purchasePrice"
                                label="Require Purchase Price"
                                description="Purchase price must be filled when adding an item."
                                checked={settings.requirePurchasePrice}
                                onChange={(checked) => handleCheckboxChange('requirePurchasePrice', checked)}
                            />
                            <ToggleRow
                                id="req-sale-discount"
                                label="Require Sale Discount (%)"
                                description="Sale discount percentage must be filled when adding an item."
                                checked={settings.requireSaleDiscount}
                                onChange={(checked) => handleCheckboxChange('requireSaleDiscount', checked)}
                            />
                            <ToggleRow
                                id="req-purchase-discount"
                                label="Require Purchase Discount (%)"
                                description="Purchase discount percentage must be filled when adding an item."
                                checked={settings.requirePurchaseDiscount}
                                onChange={(checked) => handleCheckboxChange('requirePurchaseDiscount', checked)}
                            />
                            <ToggleRow
                                id="req-tax"
                                label="Require Tax (%)"
                                description="Tax percentage must be filled when adding an item."
                                checked={settings.requireTax}
                                onChange={(checked) => handleCheckboxChange('requireTax', checked)}
                            />
                            <ToggleRow
                                id="req-barcode"
                                label="Require Barcode"
                                description="Barcode must be filled when adding an item."
                                checked={settings.requireBarcode}
                                onChange={(checked) => handleCheckboxChange('requireBarcode', checked)}
                            />
                            <ToggleRow
                                id="req-restock"
                                label="Require Restock Quantity"
                                description="Restock quantity must be filled when adding an item."
                                checked={settings.requireRestockQuantity}
                                onChange={(checked) => handleCheckboxChange('requireRestockQuantity', checked)}
                            />
                        </div>
                    </section>

                    {/* Barcode Handling */}
                    <section className="bg-white rounded-sm border border-gray-200 shadow-sm p-5 md:p-6 space-y-5">
                        <h2 className="text-base md:text-lg font-semibold text-gray-800">Barcode Handling</h2>
                        <ToggleRow
                            id="auto-barcode"
                            label="Auto-Generate Barcode if Empty"
                            description="A unique barcode will be generated when adding an item if the barcode field is left blank."
                            checked={settings.autoGenerateBarcode}
                            onChange={(checked) => handleCheckboxChange('autoGenerateBarcode', checked)}
                        />
                    </section>

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

export default CatalogueItemSetting;