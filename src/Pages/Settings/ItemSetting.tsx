import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
    doc,
    getDocs,
    updateDoc,
    setDoc,
    collection,
    query,
    where,
} from 'firebase/firestore';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { useAuth } from '../../context/Auth-Context';

export interface ItemSettings {
    companyId?: string;
    settingType?: 'item';
    requirePurchasePrice?: boolean;
    requireDiscount?: boolean;
    requireTax?: boolean;
    requireBarcode?: boolean;
    requireRestockQuantity?: boolean;
    autoGenerateBarcode?: boolean;
}

const ItemSettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [settings, setSettings] = useState<ItemSettings>({});
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    const [settingsDocId, setSettingsDocId] = useState<string | null>(null);

    const getDefaultItemSettings = (companyId: string): ItemSettings => ({
        companyId: companyId,
        settingType: 'item',
        requirePurchasePrice: false,
        requireDiscount: false,
        requireTax: false,
        requireBarcode: false,
        requireRestockQuantity: false,
        autoGenerateBarcode: true,
    });


    useEffect(() => {
        if (!currentUser?.companyId) {
            setIsLoading(true); // Keep loading until user is ready
            setSettings({});
            console.warn("No currentUser or companyId found. Cannot load item settings.");
            return;
        }

        setIsLoading(true);
        const companyId = currentUser.companyId;

        const fetchOrCreateSettings = async () => {
            // --- FIX: Use the correct multi-tenant path ---
            const settingsCollectionRef = collection(db, 'companies', companyId, 'settings');

            // --- FIX: Remove the redundant where('companyId', ...) ---
            const q = query(settingsCollectionRef, where('settingType', '==', 'item'));

            try {
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const docSnap = querySnapshot.docs[0];
                    setSettings(docSnap.data() as ItemSettings);
                    setSettingsDocId(docSnap.id);
                } else {
                    console.warn(`No item settings found for company ${companyId}. Creating defaults.`);
                    const defaultSettings = getDefaultItemSettings(companyId);

                    // Use a predictable ID for the settings document
                    const predictableDocId = `item-settings`;

                    // --- FIX: Use the multi-tenant path to create the doc ---
                    const newDocRef = doc(db, 'companies', companyId, 'settings', predictableDocId);
                    await setDoc(newDocRef, defaultSettings);

                    setSettings(defaultSettings);
                    setSettingsDocId(newDocRef.id);
                }
            } catch (err) {
                console.error('Failed to fetch/create item settings:', err);
                setModal({ message: 'Failed to load settings. Please try again.', type: State.ERROR });
                setSettings({});
            } finally {
                setIsLoading(false);
            }
        };

        fetchOrCreateSettings();
    }, [currentUser?.companyId]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!settingsDocId || !currentUser?.companyId) {
            setModal({ message: 'Error: Cannot determine user or settings document.', type: State.ERROR });
            return;
        }
        const companyId = currentUser.companyId; // Get companyId for the path

        setIsSaving(true);
        try {
            // --- FIX: Use the correct multi-tenant path to update ---
            const docToUpdateRef = doc(db, 'companies', companyId, 'settings', settingsDocId);

            const settingsToSave: ItemSettings = {
                ...settings,
                companyId: companyId,
                settingType: 'item',
            };
            await updateDoc(docToUpdateRef, settingsToSave as { [key: string]: any });
            setModal({ message: 'Item settings saved successfully!', type: State.SUCCESS });
        } catch (err) {
            console.error('Failed to save item settings:', err);
            setModal({ message: 'Failed to save settings. Please try again.', type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCheckboxChange = (field: keyof ItemSettings, checked: boolean) => {
        setSettings(prev => ({ ...prev, [field]: checked }));
    };

    if (isLoading) {
        return (
            <div className="flex flex-col min-h-screen items-center justify-center">
                <Spinner />
                <p className="mt-4 text-gray-600">Loading Item Settings...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-white w-full">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
                <button onClick={() => navigate(-1)} className="text-2xl font-bold text-gray-600 bg-transparent border-none cursor-pointer p-1">&times;</button>
                <h1 className="text-lg font-semibold text-gray-800">Item Add Settings</h1>
                <div className="w-6"></div>
            </div>

            <main className="flex-grow p-4 bg-gray-50 w-full overflow-y-auto box-border">
                <form onSubmit={handleSave} className="bg-white rounded-lg p-6 shadow-md max-w-3xl mx-auto space-y-6">

                    <div>
                        <h2 className="text-base font-semibold text-gray-700 mb-3 border-b pb-2">Required Fields</h2>
                        <p className="text-sm text-gray-500 mb-3">
                            Select which fields must be filled when adding a single item.
                            (Name, MRP, Stock Amount, and Category are always required).
                        </p>
                        <div className="space-y-2">
                            <div className="flex items-center">
                                <input type="checkbox" id="req-purchasePrice"
                                    checked={settings.requirePurchasePrice ?? false}
                                    onChange={(e) => handleCheckboxChange('requirePurchasePrice', e.target.checked)}
                                    className="w-4 h-4 text-blue-600" />
                                <label htmlFor="req-purchasePrice" className="ml-2 text-sm font-medium text-gray-700">Require Purchase Price</label>
                            </div>
                            <div className="flex items-center">
                                <input type="checkbox" id="req-discount"
                                    checked={settings.requireDiscount ?? false}
                                    onChange={(e) => handleCheckboxChange('requireDiscount', e.target.checked)}
                                    className="w-4 h-4 text-blue-600" />
                                <label htmlFor="req-discount" className="ml-2 text-sm font-medium text-gray-700">Require Discount (%)</label>
                            </div>
                            <div className="flex items-center">
                                <input type="checkbox" id="req-tax"
                                    checked={settings.requireTax ?? false}
                                    onChange={(e) => handleCheckboxChange('requireTax', e.target.checked)}
                                    className="w-4 h-4 text-blue-600" />
                                <label htmlFor="req-tax" className="ml-2 text-sm font-medium text-gray-700">Require Tax (%)</label>
                            </div>
                            <div className="flex items-center">
                                <input type="checkbox" id="req-barcode"
                                    checked={settings.requireBarcode ?? false}
                                    onChange={(e) => handleCheckboxChange('requireBarcode', e.target.checked)}
                                    className="w-4 h-4 text-blue-600" />
                                <label htmlFor="req-barcode" className="ml-2 text-sm font-medium text-gray-700">Require Barcode</label>
                            </div>
                            <div className="flex items-center">
                                <input type="checkbox" id="req-restock"
                                    checked={settings.requireRestockQuantity ?? false}
                                    onChange={(e) => handleCheckboxChange('requireRestockQuantity', e.target.checked)}
                                    className="w-4 h-4 text-blue-600" />
                                <label htmlFor="req-restock" className="ml-2 text-sm font-medium text-gray-700">Require Restock Quantity</label>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-base font-semibold text-gray-700 mb-3 border-b pb-2 pt-4">Barcode Handling</h2>
                        <div className="flex items-center">
                            <input type="checkbox" id="auto-barcode"
                                checked={settings.autoGenerateBarcode ?? false}
                                onChange={(e) => handleCheckboxChange('autoGenerateBarcode', e.target.checked)}
                                className="w-4 h-4 text-blue-600" />
                            <label htmlFor="auto-barcode" className="ml-2 text-sm font-medium text-gray-700">Automatically Generate Barcode if Empty</label>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 pl-6">If checked, a unique barcode will be generated when adding an item if the barcode field is left blank.</p>
                    </div>


                    {/* --- Save Button --- */}
                    <button
                        type="submit"
                        disabled={isSaving || isLoading}
                        className="w-full mt-6 flex items-center justify-center bg-blue-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {isSaving ? <Spinner /> : 'Save Item Settings'}
                    </button>
                </form>
            </main>
        </div>
    );
};

export default ItemSettingsPage;