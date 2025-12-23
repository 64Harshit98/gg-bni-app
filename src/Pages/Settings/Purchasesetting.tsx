import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase'; // Adjust path if necessary
import {
    doc,
    getDoc,
    updateDoc,
    setDoc,
} from 'firebase/firestore';
import { Spinner } from '../../constants/Spinner'; // Adjust path
import { Modal } from '../../constants/Modal';     // Adjust path
import { State } from '../../enums';               // Adjust path
import { useAuth } from '../../context/auth-context'; // Adjust path

// ==========================================
// 1. EXPORTABLE INTERFACE
// ==========================================
export interface PurchaseSettings {
    companyId?: string;
    settingType: 'purchase';
    gstScheme: 'regular' | 'composition' | 'none';
    taxType: 'inclusive' | 'exclusive';
    defaultDiscount: number;
    inputMRP: boolean;
    zeroValueValidation: boolean;
    enableBarcodePrinting: boolean;
    copyVoucherAfterSaving: boolean;
    roundingOff: boolean;
    voucherName: string;
    voucherPrefix: string;
    currentVoucherNumber: number;
    purchaseViewType: 'card' | 'list';
    requireSupplierName: boolean;
    requireSupplierMobile: boolean;
}

// ==========================================
// 2. EXPORTABLE DEFAULT FUNCTION
// ==========================================
export const getDefaultPurchaseSettings = (companyId: string): PurchaseSettings => ({
    companyId: companyId,
    settingType: 'purchase',
    gstScheme: 'none',
    taxType: 'inclusive',
    defaultDiscount: 0,
    inputMRP: true,
    zeroValueValidation: true,
    enableBarcodePrinting: true,
    copyVoucherAfterSaving: false,
    roundingOff: true,
    voucherName: 'Purchase',
    voucherPrefix: 'PRC-',
    currentVoucherNumber: 1,
    purchaseViewType: 'list',
    requireSupplierName: true,
    requireSupplierMobile: false,
});

// ==========================================
// 3. MAIN COMPONENT
// ==========================================
const PurchaseSettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    
    const [settings, setSettings] = useState<PurchaseSettings | null>(null);
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
            
            // We use a fixed ID 'purchase-settings' for simplicity
            const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'purchase-settings');

            try {
                const docSnap = await getDoc(settingsDocRef);

                if (docSnap.exists()) {
                    // A. Settings exist - Load them
                    setSettings(docSnap.data() as PurchaseSettings);
                } else {
                    // B. Settings do not exist - Create defaults
                    console.log(`No purchase settings found. Creating defaults...`);
                    const defaultSettings = getDefaultPurchaseSettings(companyId);
                    
                    // Save to DB
                    await setDoc(settingsDocRef, defaultSettings);
                    
                    // Update State
                    setSettings(defaultSettings);
                }
            } catch (err) {
                console.error('Failed to fetch/create purchase settings:', err);
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
            const docToUpdateRef = doc(db, 'companies', companyId, 'settings', 'purchase-settings');

            const settingsToSave = {
                ...settings,
                companyId: companyId,
                settingType: 'purchase'
            };

            await updateDoc(docToUpdateRef, settingsToSave as { [key: string]: any });
            setModal({ message: 'Settings saved successfully!', type: State.SUCCESS });
        } catch (err) {
            console.error('Failed to save settings:', err);
            setModal({ message: 'Failed to save settings. Please try again.', type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    // --- Input Change Handlers ---
    const handleChange = (field: keyof PurchaseSettings, value: string | number | boolean) => {
        if (!settings) return;

        if (field === 'defaultDiscount' || field === 'currentVoucherNumber') {
            // Handle number inputs specifically
            if (value === '') {
                setSettings({ ...settings, [field]: 0 }); 
            } else {
                const numValue = parseFloat(String(value));
                setSettings({ ...settings, [field]: isNaN(numValue) ? 0 : numValue });
            }
        } else {
            // Handle strings (selects, text inputs)
            setSettings({ ...settings, [field]: value });
        }
    };

    const handleCheckboxChange = (field: keyof PurchaseSettings, checked: boolean) => {
        if (settings) {
            setSettings({ ...settings, [field]: checked });
        }
    };

    // --- Render Loading ---
    if (isLoading || !settings) {
        return (
            <div className="flex flex-col min-h-screen items-center justify-center">
                <Spinner />
                <p className="mt-4 text-gray-600">Loading settings...</p>
            </div>
        );
    }

    // --- Render Main ---
    return (
        <div className="flex flex-col min-h-screen bg-white w-full mb-16">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
                <button onClick={() => navigate(-1)} className="text-2xl font-bold text-gray-600 bg-transparent border-none cursor-pointer p-1">&times;</button>
                <h1 className="text-lg font-semibold text-gray-800">Purchase Settings</h1>
                <div className="w-6"></div>
            </div>

            <main className="flex-grow p-4 bg-gray-50 w-full overflow-y-auto box-border">
                <form onSubmit={handleSave} className="max-w-3xl mx-auto">

                    {/* --- Card 1: Pricing & Tax --- */}
                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Pricing & Tax</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label htmlFor="gst-scheme" className="block text-gray-700 text-sm font-medium mb-1">GST Scheme</label>
                                <select
                                    id="gst-scheme"
                                    value={settings.gstScheme || 'none'}
                                    onChange={(e) => handleChange('gstScheme', e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg bg-white"
                                >
                                    <option value="none">None (Tax Disabled)</option>
                                    <option value="regular">Regular GST</option>
                                    <option value="composition">Composition GST</option>
                                </select>
                            </div>
                        </div>

                        {(settings.gstScheme === 'regular' || settings.gstScheme === 'composition') && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label htmlFor="tax-type" className="block text-gray-700 text-sm font-medium mb-1">Tax Calculation Type</label>
                                    <select
                                        id="tax-type"
                                        value={settings.taxType || 'exclusive'}
                                        onChange={(e) => handleChange('taxType', e.target.value)}
                                        className="w-full p-3 border border-gray-300 rounded-lg bg-white"
                                    >
                                        <option value="exclusive">Tax Exclusive (Purchase Price + GST)</option>
                                        <option value="inclusive">Tax Inclusive (Purchase Price includes GST)</option>
                                    </select>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="rounding-off"
                                checked={settings.roundingOff}
                                onChange={(e) => handleCheckboxChange('roundingOff', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="rounding-off" className="ml-2 text-gray-700 text-sm font-medium">Enable Rounding Off (Nearest Rupee)</label>
                        </div>
                    </div>

                    {/* --- Card 2: Defaults & Behavior --- */}
                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Defaults & Behavior</h2>
                        <div className="mb-4">
                            <label htmlFor="discount" className="block text-gray-700 text-sm font-medium mb-1">Default Discount (%)</label>
                            <input
                                type="number" id="discount"
                                value={settings.defaultDiscount}
                                onChange={(e) => handleChange('defaultDiscount', e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg"
                                placeholder="e.g., 0"
                                step="any"
                            />
                        </div>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="input-mrp"
                                checked={settings.inputMRP}
                                onChange={(e) => handleCheckboxChange('inputMRP', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="input-mrp" className="ml-2 text-gray-700 text-sm font-medium">Require MRP Input during Purchase</label>
                        </div>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="zero-value"
                                checked={settings.zeroValueValidation}
                                onChange={(e) => handleCheckboxChange('zeroValueValidation', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="zero-value" className="ml-2 text-gray-700 text-sm font-medium">Prevent Zero Value Purchase Price</label>
                        </div>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="print-barcode"
                                checked={settings.enableBarcodePrinting}
                                onChange={(e) => handleCheckboxChange('enableBarcodePrinting', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="print-barcode" className="ml-2 text-gray-700 text-sm font-medium">Enable Barcode Printing Option</label>
                        </div>
                    </div>

                    {/* --- Card 3: Required Fields --- */}
                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Required Fields</h2>
                        <p className="text-sm text-gray-500 mb-2">Select fields that must be filled before saving a purchase.</p>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="req-supplier-name"
                                checked={settings.requireSupplierName}
                                onChange={(e) => handleCheckboxChange('requireSupplierName', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="req-supplier-name" className="ml-2 text-gray-700 text-sm font-medium">Require Supplier Name</label>
                        </div>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="req-supplier-mobile"
                                checked={settings.requireSupplierMobile}
                                onChange={(e) => handleCheckboxChange('requireSupplierMobile', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="req-supplier-mobile" className="ml-2 text-gray-700 text-sm font-medium">Require Supplier Mobile</label>
                        </div>
                    </div>

                    {/* --- Card 4: Voucher Numbering --- */}
                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Voucher Numbering</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label htmlFor="voucher-name" className="block text-gray-700 text-sm font-medium mb-1">Voucher Name</label>
                                <input type="text" id="voucher-name"
                                    value={settings.voucherName}
                                    onChange={(e) => handleChange('voucherName', e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg"
                                    placeholder="e.g., Main Purchase" />
                            </div>
                            <div>
                                <label htmlFor="voucher-prefix" className="block text-gray-700 text-sm font-medium mb-1">Voucher Prefix</label>
                                <input type="text" id="voucher-prefix"
                                    value={settings.voucherPrefix}
                                    onChange={(e) => handleChange('voucherPrefix', e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg"
                                    placeholder="e.g., PRC-" />
                            </div>
                            <div>
                                <label htmlFor="current-number" className="block text-gray-700 text-sm font-medium mb-1">Next Voucher Number</label>
                                <input type="number" id="current-number"
                                    value={settings.currentVoucherNumber}
                                    onChange={(e) => handleChange('currentVoucherNumber', e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg"
                                    placeholder="e.g., 1" min="1" />
                            </div>
                        </div>
                    </div>

                    {/* --- Card 5: Display Settings --- */}
                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Display Settings</h2>
                        <div className="mb-4">
                            <label htmlFor="purchase-view-type" className="block text-gray-700 text-sm font-medium mb-1">Purchase History View</label>
                            <select
                                id="purchase-view-type"
                                value={settings.purchaseViewType || 'list'}
                                onChange={(e) => handleChange('purchaseViewType', e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg bg-white"
                            >
                                <option value="list">List View</option>
                                <option value="card">Card View</option>
                            </select>
                        </div>
                    </div>

                    {/* --- Save Button --- */}
                    <button
                        type="submit"
                        disabled={isSaving || isLoading}
                        className="w-full mt-2 flex items-center justify-center bg-sky-500 text-white font-bold py-3 px-4 rounded-xl hover:bg-sky-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        {isSaving ? <Spinner /> : 'Save Settings'}
                    </button>
                </form>
            </main>
        </div>
    );
};

export default PurchaseSettingsPage;