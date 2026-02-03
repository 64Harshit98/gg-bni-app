import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
    doc,
    getDoc,
    updateDoc,
    setDoc,
} from 'firebase/firestore';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { FiCheck } from 'react-icons/fi';


export interface PurchaseSettings {
    companyId?: string;
    settingType: 'purchase';
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

export const getDefaultPurchaseSettings = (companyId: string): PurchaseSettings => ({
    companyId: companyId,
    settingType: 'purchase',
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

const PurchaseSettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [settings, setSettings] = useState<PurchaseSettings | null>(null);
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

            const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'purchase-settings');

            try {
                const docSnap = await getDoc(settingsDocRef);

                if (docSnap.exists()) {
                    setSettings(docSnap.data() as PurchaseSettings);
                } else {
                    console.log(`No purchase settings found. Creating defaults...`);
                    const defaultSettings = getDefaultPurchaseSettings(companyId);

                    await setDoc(settingsDocRef, defaultSettings);

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

    const handleChange = (field: keyof PurchaseSettings, value: string | number | boolean) => {
        if (!settings) return;

        if (field === 'defaultDiscount' || field === 'currentVoucherNumber') {
            if (value === '') {
                setSettings({ ...settings, [field]: 0 });
            } else {
                const numValue = parseFloat(String(value));
                setSettings({ ...settings, [field]: isNaN(numValue) ? 0 : numValue });
            }
        } else {
            setSettings({ ...settings, [field]: value });
        }
    };

    const handleCheckboxChange = (field: keyof PurchaseSettings, checked: boolean) => {
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
                <button onClick={() => navigate(-1)} className="text-2xl font-bold text-gray-600 bg-transparent border-none cursor-pointer p-1">&times;</button>
                <h1 className="text-lg font-semibold text-gray-800">Purchase Settings</h1>
                <div className="w-6"></div>
            </div>

            <main className="flex-grow p-4 bg-gray-50 w-full overflow-y-auto box-border pb-30">
                <form onSubmit={handleSave} className="max-w-3xl mx-auto">

                    {/* --- Card 1: Display Settings --- */}

                    <div className="bg-white rounded-sm p-4 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Display Settings</h2>

                        <div className="mb-2">
                            <label className="block text-gray-700 text-sm font-medium mb-3">Purchase View Mode</label>

                            <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
                                {/* List View Option */}
                                <div
                                    onClick={() => handleChange('purchaseViewType', 'list')}
                                    className={`cursor-pointer relative rounded-xl border-2 p-2 flex flex-col items-center gap-3 transition-all duration-200 ${settings.purchaseViewType === 'list'
                                        ? 'border-blue-600 bg-blue-50 shadow-md'
                                        : 'border-gray-200 hover:border-blue-300 bg-white'
                                        }`}
                                >
                                    {settings.purchaseViewType === 'list' && (
                                        <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-0.5 shadow-sm">
                                            <FiCheck size={12} />
                                        </div>
                                    )}
                                    {/* Visual Representation of List */}
                                    <div className="w-full max-w-[12rem] h-24 bg-white border border-gray-200 rounded p-3 flex flex-col gap-2 justify-center shadow-inner mx-auto">
                                        <div className="h-2 w-3/4 bg-gray-300 rounded"></div>
                                        <div className="h-2 w-full bg-gray-200 rounded"></div>
                                        <div className="h-2 w-5/6 bg-gray-200 rounded"></div>
                                        <div className="h-2 w-full bg-gray-200 rounded"></div>
                                    </div>
                                    <div className="text-center">
                                        <p className="font-bold text-gray-800">List View</p>
                                        <p className="text-xs text-gray-500 mt-1">Best for Desktop & Barcode Scanning</p>
                                    </div>
                                </div>

                                {/* Card View Option */}
                                <div
                                    className="relative rounded-xl border-2 border-gray-100 p-4 flex flex-col items-center gap-3 bg-gray-50 cursor-not-allowed opacity-100"
                                >
                                    {/* Coming Soon Badge */}
                                    <div className="absolute top-3 right-3 bg-orange-300 text-black text-[10px] font-bold px-2 py-1 rounded-sm border border-orange-200 shadow-sm">
                                        COMING SOON
                                    </div>

                                    {/* Visual Representation (Grayed Out) */}
                                    <div className="w-full max-w-[12rem] h-24 bg-gray-100 border border-gray-200 rounded p-3 grid grid-cols-3 gap-2 shadow-none mx-auto opacity-50">
                                        <div className="bg-gray-300 rounded aspect-square w-full"></div>
                                        <div className="bg-gray-300 rounded aspect-square w-full"></div>
                                        <div className="bg-gray-300 rounded aspect-square w-full"></div>
                                        <div className="bg-gray-300 rounded aspect-square w-full"></div>
                                        <div className="bg-gray-300 rounded aspect-square w-full"></div>
                                        <div className="bg-gray-300 rounded aspect-square w-full"></div>
                                    </div>
                                    <div className="text-center opacity-60">
                                        <p className="font-bold text-gray-500">Card View</p>
                                        <p className="text-xs text-gray-400 mt-1">Best for Touchscreens & Tablets</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* --- Card 2: Pricing & Tax --- */}
                    <div className="bg-white rounded-sm p-4 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-2">Pricing</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                        </div>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="rounding-off"
                                checked={settings.roundingOff}
                                onChange={(e) => handleCheckboxChange('roundingOff', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="rounding-off" className="ml-2 text-gray-700 text-sm font-medium">Enable Rounding Off (Nearest Rupee)</label>
                        </div>
                    </div>

                    {/* --- Card 3: Defaults & Behavior --- */}
                    <div className="bg-white rounded-sm p-4 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Defaults & Behavior</h2>
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

                    {/* --- Card 4: Required Fields --- */}
                    <div className="bg-white rounded-sm p-4 shadow-md mb-2">
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

                    {/* --- Card 5: Voucher Numbering --- */}
                    <div className="bg-white rounded-sm p-4 shadow-md mb-2">
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

export default PurchaseSettingsPage;