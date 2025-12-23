import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase'; // Adjust path as needed
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
} from 'firebase/firestore';
import { Spinner } from '../../constants/Spinner'; // Adjust path
import { Modal } from '../../constants/Modal';     // Adjust path
import { State } from '../../enums';               // Adjust path
import { useAuth } from '../../context/auth-context'; // Adjust path

// ==========================================
// 1. EXPORTABLE INTERFACE
// ==========================================
export interface ItemSettings {
    companyId?: string;
    settingType: 'item';
    requirePurchasePrice: boolean;
    requireDiscount: boolean;
    requireTax: boolean;
    requireBarcode: boolean;
    requireRestockQuantity: boolean;
    autoGenerateBarcode: boolean;
}

// ==========================================
// 2. EXPORTABLE DEFAULT FUNCTION
// ==========================================
export const getDefaultItemSettings = (companyId: string): ItemSettings => ({
    companyId: companyId,
    settingType: 'item',
    requirePurchasePrice: true,
    requireDiscount: false,
    requireTax: false,
    requireBarcode: false,
    requireRestockQuantity: false,
    autoGenerateBarcode: true,
});

// ==========================================
// 3. MAIN COMPONENT
// ==========================================
const ItemSettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    
    const [settings, setSettings] = useState<ItemSettings | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    // --- Load Settings on Mount ---
    useEffect(() => {
        if (!currentUser?.companyId) {
            setIsLoading(true);
            return;
        }

        const fetchOrCreateSettings = async () => {
            setIsLoading(true);
            const companyId = currentUser.companyId!;

            // We use a fixed ID 'item-settings' for simplicity and speed
            const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'item-settings');

            try {
                const docSnap = await getDoc(settingsDocRef);

                if (docSnap.exists()) {
                    // A. Settings exist - Load them
                    setSettings(docSnap.data() as ItemSettings);
                } else {
                    // B. Settings do not exist - Create defaults
                    console.log("No item settings found. Creating defaults...");
                    const defaultSettings = getDefaultItemSettings(companyId);
                    
                    // Save to DB
                    await setDoc(settingsDocRef, defaultSettings);
                    
                    // Update State
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

    // --- Save Handler ---
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

            // Update the document
            await updateDoc(settingsDocRef, settings as unknown as { [x: string]: any });
            
            setModal({ message: 'Item settings saved successfully!', type: State.SUCCESS });
        } catch (err) {
            console.error('Failed to save settings:', err);
            setModal({ message: 'Failed to save settings. Please try again.', type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    // --- Input Change Handler ---
    const handleCheckboxChange = (field: keyof ItemSettings, checked: boolean) => {
        if (settings) {
            setSettings({ ...settings, [field]: checked });
        }
    };

    // --- Render Loading ---
    if (isLoading || !settings) {
        return (
            <div className="flex flex-col min-h-screen items-center justify-center">
                <Spinner />
                <p className="mt-4 text-gray-600">Loading Item Settings...</p>
            </div>
        );
    }

    // --- Render Main ---
    return (
        <div className="flex flex-col min-h-screen bg-gray-100 w-full">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
                <button onClick={() => navigate(-1)} className="text-2xl font-bold text-gray-600 bg-transparent border-none cursor-pointer p-1">&times;</button>
                <h1 className="text-lg font-semibold text-gray-800">Item Add Settings</h1>
                <div className="w-6"></div>
            </div>

            {/* Content */}
            <main className="flex-grow p-4 bg-gray-50 w-full overflow-y-auto box-border">
                <form onSubmit={handleSave} className="bg-white rounded-lg p-6 shadow-md max-w-3xl mx-auto space-y-6">

                    <div>
                        <h2 className="text-base font-semibold text-gray-700 mb-3 border-b pb-2">Required Fields</h2>
                        <p className="text-sm text-gray-500 mb-3">
                            Select which fields must be filled when adding a single item.
                            (Name, MRP, Stock Amount, and Category are always required).
                        </p>
                        
                        <div className="space-y-2">
                            {/* Toggle: Purchase Price */}
                            <div className="flex items-center">
                                <input type="checkbox" id="req-purchasePrice"
                                    checked={settings.requirePurchasePrice}
                                    onChange={(e) => handleCheckboxChange('requirePurchasePrice', e.target.checked)}
                                    className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                                <label htmlFor="req-purchasePrice" className="ml-2 text-sm font-medium text-gray-700">Require Purchase Price</label>
                            </div>

                            {/* Toggle: Discount */}
                            <div className="flex items-center">
                                <input type="checkbox" id="req-discount"
                                    checked={settings.requireDiscount}
                                    onChange={(e) => handleCheckboxChange('requireDiscount', e.target.checked)}
                                    className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                                <label htmlFor="req-discount" className="ml-2 text-sm font-medium text-gray-700">Require Discount (%)</label>
                            </div>

                            {/* Toggle: Tax */}
                            <div className="flex items-center">
                                <input type="checkbox" id="req-tax"
                                    checked={settings.requireTax}
                                    onChange={(e) => handleCheckboxChange('requireTax', e.target.checked)}
                                    className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                                <label htmlFor="req-tax" className="ml-2 text-sm font-medium text-gray-700">Require Tax (%)</label>
                            </div>

                            {/* Toggle: Barcode */}
                            <div className="flex items-center">
                                <input type="checkbox" id="req-barcode"
                                    checked={settings.requireBarcode}
                                    onChange={(e) => handleCheckboxChange('requireBarcode', e.target.checked)}
                                    className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                                <label htmlFor="req-barcode" className="ml-2 text-sm font-medium text-gray-700">Require Barcode</label>
                            </div>

                            {/* Toggle: Restock */}
                            <div className="flex items-center">
                                <input type="checkbox" id="req-restock"
                                    checked={settings.requireRestockQuantity}
                                    onChange={(e) => handleCheckboxChange('requireRestockQuantity', e.target.checked)}
                                    className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                                <label htmlFor="req-restock" className="ml-2 text-sm font-medium text-gray-700">Require Restock Quantity</label>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-base font-semibold text-gray-700 mb-3 border-b pb-2 pt-4">Barcode Handling</h2>
                        <div className="flex items-center">
                            <input type="checkbox" id="auto-barcode"
                                checked={settings.autoGenerateBarcode}
                                onChange={(e) => handleCheckboxChange('autoGenerateBarcode', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="auto-barcode" className="ml-2 text-sm font-medium text-gray-700">Automatically Generate Barcode if Empty</label>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 pl-6">If checked, a unique barcode will be generated when adding an item if the barcode field is left blank.</p>
                    </div>

                    {/* Save Button */}
                    <button
                        type="submit"
                        disabled={isSaving || isLoading}
                        className="w-full mt-6 flex items-center justify-center bg-sky-500 text-white font-bold py-3 px-4 rounded-xl hover:bg-sky-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        {isSaving ? <Spinner /> : 'Save Item Settings'}
                    </button>
                </form>
            </main>
        </div>
    );
};

export default ItemSettingsPage;