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
import { FiCheck } from 'react-icons/fi';
import { InfoTooltip } from '../../Components/InfoToolTip'; // <-- IMPORTED TOOLTIP
import { ResetSettingsButton } from '../../Components/ResetSettingsButton';

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
    cartInsertionOrder?: 'top' | 'bottom';
}

export const getDefaultPurchaseSettings = (companyId: string): PurchaseSettings => ({
    companyId: companyId,
    settingType: 'purchase',
    defaultDiscount: 0,
    inputMRP: false,
    zeroValueValidation: true,
    enableBarcodePrinting: true,
    copyVoucherAfterSaving: false,
    roundingOff: false,
    voucherName: 'Purchase',
    voucherPrefix: 'PRC',
    currentVoucherNumber: 1000,
    purchaseViewType: 'list',
    requireSupplierName: true,
    requireSupplierMobile: true,
    cartInsertionOrder: 'bottom',
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
            const counterDocRef = doc(db, 'companies', companyId, 'counters', 'purchaseCounter');

            try {
                const [docSnap, counterSnap] = await Promise.all([
                    getDoc(settingsDocRef),
                    getDoc(counterDocRef)
                ]);

                const defaultSettings = getDefaultPurchaseSettings(companyId);
                let mergedSettings = { ...defaultSettings };

                if (docSnap.exists()) {
                    mergedSettings = { ...mergedSettings, ...docSnap.data() };
                } else {
                    console.log(`No purchase settings found. Creating defaults...`);
                    await setDoc(settingsDocRef, defaultSettings);
                }

                if (counterSnap.exists() && counterSnap.data().currentNumber !== undefined) {
                    mergedSettings.currentVoucherNumber = counterSnap.data().currentNumber;
                } else {
                    await setDoc(counterDocRef, { currentNumber: defaultSettings.currentVoucherNumber }, { merge: true });
                }

                setSettings(mergedSettings as PurchaseSettings);
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
            const settingsRef = doc(db, 'companies', companyId, 'settings', 'purchase-settings');
            const counterRef = doc(db, 'companies', companyId, 'counters', 'purchaseCounter');

            const { currentVoucherNumber, ...restOfSettings } = settings;

            const settingsToSave = {
                ...restOfSettings,
                companyId: companyId,
                settingType: 'purchase'
            };

            await Promise.all([
                setDoc(settingsRef, settingsToSave, { merge: true }),
                setDoc(counterRef, { currentNumber: currentVoucherNumber }, { merge: true })
            ]);

            setModal({ message: 'Settings saved successfully!', type: State.SUCCESS });
        } catch (err) {
            console.error('Failed to save settings:', err);
            setModal({ message: 'Failed to save settings. Please try again.', type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetVoucher = async () => {
        if (!settings || !currentUser?.companyId) return;

        try {
            const counterDocRef = doc(db, 'companies', currentUser.companyId, 'counters', 'purchaseCounter');
            const counterSnap = await getDoc(counterDocRef);

            let backendCounter = 1;
            if (counterSnap.exists() && counterSnap.data().currentNumber) {
                backendCounter = counterSnap.data().currentNumber;
            }

            setSettings({
                ...settings,
                voucherName: 'Purchase',
                voucherPrefix: 'INV',
                currentVoucherNumber: backendCounter
            });

        } catch (error) {
            console.error("Failed to fetch backend counter for reset:", error);
            setSettings({
                ...settings,
                voucherName: 'Purchase',
                voucherPrefix: 'INV'
            });
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

                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-800 ">Display Settings</h2>
                            <ResetSettingsButton<PurchaseSettings>
                                defaults={getDefaultPurchaseSettings(currentUser?.companyId ?? '')}
                                onReset={setSettings}
                            />
                        </div>

                        <div className="mb-2">
                            <div className="flex items-center mb-3">
                                <label className="text-gray-700 text-sm font-medium mr-2">Purchase View Mode</label>
                                <InfoTooltip text="Choose between list or card layout for the purchase screen." />
                            </div>

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
                                    onClick={() => handleChange('purchaseViewType', 'card')}
                                    className={`cursor-pointer relative rounded-xl border-2 p-2 flex flex-col items-center gap-3 transition-all duration-200 ${settings.purchaseViewType === 'card'
                                            ? 'border-blue-600 bg-blue-50 shadow-md'
                                            : 'border-gray-200 hover:border-blue-300 bg-white'
                                        }`}
                                >
                                    {settings.purchaseViewType === 'card' && (
                                        <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-0.5 shadow-sm">
                                            <FiCheck size={12} />
                                        </div>
                                    )}
                                    {/* Visual Representation (Grayed Out) */}
                                    <div className="w-full max-w-[12rem] h-24 bg-gray-100 border border-gray-200 rounded p-3 grid grid-cols-3 gap-2 shadow-none mx-auto opacity-50">
                                        <div className="h-11 bg-gray-300 rounded aspect-square w-full"></div>
                                        <div className="h-11 bg-gray-300 rounded aspect-square w-full"></div>
                                        <div className="h-11 bg-gray-300 rounded aspect-square w-full"></div>
                                        <div className="h-11 bg-gray-300 rounded aspect-square w-full"></div>
                                        <div className="h-11 bg-gray-300 rounded aspect-square w-full"></div>
                                        <div className="h-11 bg-gray-300 rounded aspect-square w-full"></div>
                                    </div>
                                    <div className="text-center">
                                        <p className="font-bold text-gray-800">Card View</p>
                                        <p className="text-xs text-gray-500 mt-1">Best for Touchscreens & Tablets</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 border-t pt-4">
                            <div className="flex items-center mb-1">
                                <label className="text-sm font-medium text-gray-700 mr-2">
                                    Cart Item Sorting
                                </label>
                                <InfoTooltip text="Choose where newly scanned items appear in the cart." />
                            </div>
                            <select
                                value={settings.cartInsertionOrder || 'top'}
                                onChange={(e) => handleChange('cartInsertionOrder', e.target.value as 'top' | 'bottom')}
                                className="w-full p-2 border border-gray-300 rounded-md bg-gray-50 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                                <option value="top">Newest First (Add New to Top)</option>
                                <option value="bottom">Oldest First (Add New to Bottom)</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                Controls where new items appear in the cart list.
                            </p>
                        </div>
                    </div>

                    {/* --- Card 3: Defaults & Behavior --- */}
                    <div className="bg-white rounded-sm p-4 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Defaults & Behavior</h2>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="print-barcode"
                                checked={settings.enableBarcodePrinting}
                                onChange={(e) => handleCheckboxChange('enableBarcodePrinting', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="print-barcode" className="ml-2 mr-2 text-gray-700 text-sm font-medium">Enable Barcode Printing Option</label>
                            <InfoTooltip text="Show an option to print barcodes after saving a purchase." />
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
                            <label htmlFor="req-supplier-name" className="ml-2 mr-2 text-gray-700 text-sm font-medium">Require Supplier Name</label>
                            <InfoTooltip text="Force entering a supplier name before saving the purchase." />
                        </div>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="req-supplier-mobile"
                                checked={settings.requireSupplierMobile}
                                onChange={(e) => handleCheckboxChange('requireSupplierMobile', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="req-supplier-mobile" className="ml-2 mr-2 text-gray-700 text-sm font-medium">Require Supplier Mobile</label>
                            <InfoTooltip text="Force entering a supplier mobile number before saving." />
                        </div>
                    </div>

                    {/* --- Card 5: Voucher Numbering --- */}
                    <div className="bg-white rounded-sm p-4 shadow-md mb-2">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-gray-800">Voucher Numbering</h2>
                            {/* Reset Button */}
                            <button
                                type="button"
                                onClick={handleResetVoucher}
                                className="text-xs text-red-600 hover:text-red-800 font-bold px-3 py-1.5 rounded-sm bg-red-50 hover:bg-red-100 transition-colors border border-red-100"
                            >
                                Reset to Default
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            {/* Locked Voucher Name */}
                            <div>
                                <div className="flex items-center mb-1">
                                    <label htmlFor="voucher-name" className="flex items-center text-gray-700 text-sm font-medium mr-2">
                                        Voucher Name <span className="ml-2 text-[10px] text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded">LOCKED</span>
                                    </label>
                                    <InfoTooltip text="Internal document name for this transaction type." />
                                </div>
                                <input type="text" id="voucher-name"
                                    value={settings.voucherName || 'Purchase'}
                                    disabled
                                    className="w-full p-3 border border-gray-200 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed select-none"
                                />
                            </div>

                            {/* Editable Voucher Prefix */}
                            <div>
                                <div className="flex items-center mb-1">
                                    <label htmlFor="voucher-prefix" className="text-gray-700 text-sm font-medium mr-2">
                                        Voucher Prefix
                                    </label>
                                    <InfoTooltip text="Letters added before the purchase invoice number (e.g., PRC-)." />
                                </div>
                                <input type="text" id="voucher-prefix"
                                    value={settings.voucherPrefix || ''}
                                    onChange={(e) => handleChange('voucherPrefix', e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    placeholder="e.g., PRC-"
                                />
                            </div>

                            {/* Editable Next Voucher Number */}
                            <div>
                                <div className="flex items-center mb-1">
                                    <label htmlFor="current-number" className="text-gray-700 text-sm font-medium mr-2">
                                        Next Voucher Number
                                    </label>
                                    <InfoTooltip text="The sequence number for the next recorded purchase." />
                                </div>
                                <input type="number" id="current-number"
                                    value={settings.currentVoucherNumber ?? 1000}
                                    onChange={(e) => handleChange('currentVoucherNumber', e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    placeholder="e.g., 1" min="1" step="1"
                                />
                            </div>
                        </div>
                    </div>
                </form>
            </main>
            <div className="fixed bottom-15 left-0 right-0 p-4 bg-transparent shadow-md">
                <div className="max-w-3xl mx-auto flex justify-center gap-4">
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