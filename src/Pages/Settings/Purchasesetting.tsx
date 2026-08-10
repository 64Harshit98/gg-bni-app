import React, { useState, useEffect } from 'react';
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
import { InfoTooltip } from '../../Components/InfoToolTip';
import { ResetSettingsButton } from '../../Components/ResetSettingsButton';
import BackButton from '../../Components/BackButton';

export interface PurchaseSettings {
    companyId?: string;
    settingType: 'purchase';
    defaultDiscount: number;
    inputMRP: boolean;
    zeroValueValidation: boolean;
    enableBarcodePrinting: boolean;
    copyVoucherAfterSaving: boolean;
    roundingOff: boolean;
    enableDiscount2?: boolean;
    voucherName: string;
    voucherPrefix: string;
    currentVoucherNumber: number;
    purchaseViewType: 'card' | 'list';
    requireSupplierName: boolean;
    requireSupplierMobile: boolean;
    cartInsertionOrder?: 'top' | 'bottom';
    cardViewWithPhoto?: boolean;
    enableGodownAssignment?: boolean;
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
    enableDiscount2: false,
    voucherName: 'Purchase',
    voucherPrefix: 'PUR',
    currentVoucherNumber: 1,
    purchaseViewType: 'list',
    requireSupplierName: true,
    requireSupplierMobile: false,
    cartInsertionOrder: 'top',
    cardViewWithPhoto: true,
    enableGodownAssignment: true,
});

interface CardProps {
    title: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}

const SettingsCard: React.FC<CardProps> = ({ title, children, action }) => (
    <section className="bg-white rounded-sm border border-gray-200 shadow-sm p-5 md:p-6 space-y-4 transition-shadow mb-4">
        <div className="flex items-center justify-between gap-3">
            <h2 className="text-base md:text-lg font-semibold text-gray-800">{title}</h2>
            {action}
        </div>
        {children}
    </section>
);

interface ToggleRowProps {
    id: string;
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    tooltip?: string;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ id, label, description, checked, onChange, tooltip }) => (
    <div className="flex items-start justify-between gap-4 rounded-sm bg-gray-50/60 border border-gray-100 p-3.5 md:p-4">
        <div className="min-w-0">
            <div className="flex items-center gap-2">
                <label htmlFor={id} className="text-sm font-semibold text-gray-800 leading-5">{label}</label>
                <InfoTooltip text={tooltip || description} />
            </div>
        </div>
        <label htmlFor={id} className="relative inline-flex cursor-pointer items-center">
            <input
                id={id}
                type="checkbox"
                className="peer sr-only"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-blue-600" />
            <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
        </label>
    </div>
);

const PurchaseSettingsPage: React.FC = () => {
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
                voucherPrefix: 'PUR',
                currentVoucherNumber: backendCounter
            });

        } catch (error) {
            console.error("Failed to fetch backend counter for reset:", error);
            setSettings({
                ...settings,
                voucherName: 'Purchase',
                voucherPrefix: 'PUR'
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
                <BackButton />
                <h1 className="text-base md:text-lg font-semibold text-gray-800">Purchase Settings</h1>
                <div className="w-6"></div>
            </div>

            <main className="flex-grow min-h-0 p-3 sm:p-4 md:p-5 bg-gray-50 w-full overflow-y-auto box-border pb-44 md:pb-24">
                <form onSubmit={handleSave} className="max-w-5xl mx-auto">

                    {/* Display Settings — full width */}
                    <SettingsCard
                        title="Display Settings"
                        action={
                            <ResetSettingsButton<PurchaseSettings>
                                defaults={getDefaultPurchaseSettings(currentUser?.companyId ?? '')}
                                onReset={setSettings}
                            />
                        }
                    >
                        <div className="grid grid-cols-2 gap-3">
                            {/* List View */}
                            <div
                                onClick={() => handleChange('purchaseViewType', 'list')}
                                className={`cursor-pointer relative rounded-sm border-2 p-3 flex flex-col items-center gap-3 transition-all ${settings.purchaseViewType === 'list' ? 'border-blue-600 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-blue-300'}`}
                            >
                                {settings.purchaseViewType === 'list' && (
                                    <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-0.5">
                                        <FiCheck size={12} />
                                    </div>
                                )}
                                <div className="w-full h-20 bg-white border border-gray-200 rounded-sm p-2 flex flex-col gap-1.5 justify-center">
                                    <div className="h-1.5 w-3/4 bg-gray-300 rounded-sm"></div>
                                    <div className="h-1.5 w-full bg-gray-200 rounded-sm"></div>
                                    <div className="h-1.5 w-5/6 bg-gray-200 rounded-sm"></div>
                                    <div className="h-1.5 w-full bg-gray-200 rounded-sm"></div>
                                </div>
                                <div className="text-center">
                                    <p className="font-bold text-gray-800 text-sm">List View</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Best for POS & Barcode Scanning</p>
                                </div>
                            </div>

                            {/* Card View */}
                            <div
                                onClick={() => handleChange('purchaseViewType', 'card')}
                                className={`cursor-pointer relative rounded-sm border-2 p-3 flex flex-col items-center gap-3 transition-all ${settings.purchaseViewType === 'card' ? 'border-blue-600 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-blue-300'}`}
                            >
                                {settings.purchaseViewType === 'card' && (
                                    <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-0.5">
                                        <FiCheck size={12} />
                                    </div>
                                )}
                                <div className="w-full h-20 bg-white border border-gray-200 rounded-sm p-2 grid grid-cols-3 gap-1.5">
                                    {[...Array(6)].map((_, i) => (
                                        <div key={i} className="bg-gray-200 rounded-sm"></div>
                                    ))}
                                </div>
                                <div className="text-center">
                                    <p className="font-bold text-gray-800 text-sm">Card View</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Best for Touchscreens</p>
                                </div>
                            </div>
                        </div>

                        {/* Card photo sub-options */}
                        {settings.purchaseViewType === 'card' && (
                            <div className="pl-4 pr-4 py-3 border-l-2 border-r-2 border-gray-200">
                                <p className="text-xs font-semibold text-gray-600 mb-2">Card Image Display</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {/* With Photo */}
                                    <div
                                        onClick={() => handleCheckboxChange('cardViewWithPhoto', true)}
                                        className={`cursor-pointer relative rounded-sm border p-2 sm:p-3 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 transition-all ${settings.cardViewWithPhoto ? 'border-blue-600 bg-white shadow-sm' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
                                    >
                                        {settings.cardViewWithPhoto && (
                                            <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-0.5">
                                                <FiCheck size={10} />
                                            </div>
                                        )}
                                        <div className="w-full sm:w-[6.5rem] sm:shrink-0 h-10 sm:h-12 bg-gray-100 border border-gray-200 rounded-sm p-1 grid grid-cols-3 gap-1">
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} className="flex flex-col items-center gap-0.5">
                                                    <div className="w-full aspect-square bg-blue-200 rounded-sm"></div>
                                                    <div className="h-1 w-full bg-gray-300 rounded-sm"></div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="text-left">
                                            <p className="text-xs sm:text-sm font-semibold text-gray-700">With Photo</p>
                                            <p className="text-xs text-gray-500 hidden sm:block">Shows product image</p>
                                        </div>
                                    </div>

                                    {/* Without Photo */}
                                    <div
                                        onClick={() => handleCheckboxChange('cardViewWithPhoto', false)}
                                        className={`cursor-pointer relative rounded-sm border p-2 sm:p-3 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 transition-all ${!settings.cardViewWithPhoto ? 'border-blue-600 bg-white shadow-sm' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
                                    >
                                        {!settings.cardViewWithPhoto && (
                                            <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-0.5">
                                                <FiCheck size={10} />
                                            </div>
                                        )}
                                        <div className="w-full sm:w-[6.5rem] sm:shrink-0 h-10 sm:h-12 bg-gray-100 border border-gray-200 rounded-sm p-1 grid grid-cols-3 gap-1">
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} className="flex flex-col items-center justify-center gap-0.5 bg-white rounded-sm border border-gray-200 p-1">
                                                    <div className="h-1 w-3/4 bg-gray-300 rounded-sm"></div>
                                                    <div className="h-1 w-full bg-gray-200 rounded-sm"></div>
                                                    <div className="h-1 w-1/2 bg-gray-200 rounded-sm"></div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="text-left">
                                            <p className="text-xs sm:text-sm font-semibold text-gray-700">Without Photo</p>
                                            <p className="text-xs text-gray-500 hidden sm:block">Text-only compact</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Cart Item Sorting */}
                        <div className="rounded-sm bg-gray-50 border border-gray-100 p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <p className="text-sm font-semibold text-gray-800 leading-5">Cart Item Sorting</p>
                                <InfoTooltip text="Choose where newly scanned items appear in the cart." />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleChange('cartInsertionOrder', 'top')}
                                    className={`px-3 py-2 rounded-sm border text-sm font-semibold ${settings.cartInsertionOrder === 'top' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                                >
                                    Newest First
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleChange('cartInsertionOrder', 'bottom')}
                                    className={`px-3 py-2 rounded-sm border text-sm font-semibold ${settings.cartInsertionOrder === 'bottom' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                                >
                                    Oldest First
                                </button>
                            </div>
                        </div>
                    </SettingsCard>

                    {/* Defaults & Behavior + Required Fields — 2 col */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <SettingsCard title="Defaults & Behavior">
                            <ToggleRow
                                id="print-barcode"
                                label="Enable Barcode Printing Option"
                                description="Show an option to print barcodes after saving a purchase."
                                checked={settings.enableBarcodePrinting}
                                onChange={(checked) => handleCheckboxChange('enableBarcodePrinting', checked)}
                                tooltip="Show an option to print barcodes after saving a purchase."
                            />
                            <ToggleRow
                                id="item-discount-2"
                                label="Enable Second Discount (Disc2)"
                                description="Show a second discount field, applied on top of Disc1."
                                checked={settings.enableDiscount2 ?? false}
                                onChange={(checked) => handleCheckboxChange('enableDiscount2', checked)}
                                tooltip="Adds a compounding second discount field (Disc2%) in the purchase cart, on top of the existing item discount."
                            />
                            <ToggleRow
                                id="godown-assignment"
                                label="Enable Godown Assignment"
                                description="Show the Assign Godown modal after Pay Now."
                                checked={settings.enableGodownAssignment ?? true}
                                onChange={(checked) => handleCheckboxChange('enableGodownAssignment', checked)}
                                tooltip="When enabled, tapping Pay Now opens a modal to split purchased quantity across godowns. When disabled, the modal is skipped and all purchased stock is added directly to the Shop."
                            />
                        </SettingsCard>

                        <SettingsCard title="Required Fields">
                            <ToggleRow
                                id="req-supplier-name"
                                label="Require Supplier Name"
                                description="Force entering a supplier name before saving."
                                checked={settings.requireSupplierName}
                                onChange={(checked) => handleCheckboxChange('requireSupplierName', checked)}
                                tooltip="Force entering a supplier name before saving the purchase."
                            />
                            <ToggleRow
                                id="req-supplier-mobile"
                                label="Require Supplier Mobile"
                                description="Force entering a supplier mobile number before saving."
                                checked={settings.requireSupplierMobile}
                                onChange={(checked) => handleCheckboxChange('requireSupplierMobile', checked)}
                                tooltip="Force entering a supplier mobile number before saving."
                            />
                        </SettingsCard>
                    </div>

                    {/* Voucher Numbering — full width */}
                    <SettingsCard
                        title="Voucher Numbering"
                        action={
                            <button
                                type="button"
                                onClick={handleResetVoucher}
                                className="text-xs text-red-600 hover:text-red-800 font-bold px-3 py-1.5 rounded-sm bg-red-50 hover:bg-red-100 transition-colors border border-red-100"
                            >
                                Reset to Default
                            </button>
                        }
                    >
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <div className="flex items-center mb-1 gap-2">
                                    <label htmlFor="voucher-name" className="text-sm font-medium text-gray-700">Voucher Name</label>
                                    <span className="text-[10px] text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded-sm">LOCKED</span>
                                    <InfoTooltip text="Internal document name for this transaction type." />
                                </div>
                                <input
                                    type="text"
                                    id="voucher-name"
                                    value={settings.voucherName || 'Purchase'}
                                    disabled
                                    className="w-full p-2.5 text-sm border border-gray-200 rounded-sm bg-gray-100 text-gray-500 cursor-not-allowed select-none"
                                />
                            </div>
                            <div>
                                <div className="flex items-center mb-1 gap-2">
                                    <label htmlFor="voucher-prefix" className="text-sm font-medium text-gray-700">Voucher Prefix</label>
                                    <InfoTooltip text="Letters added before the purchase invoice number (e.g., PUR-)." />
                                </div>
                                <input
                                    type="text"
                                    id="voucher-prefix"
                                    value={settings.voucherPrefix || ''}
                                    onChange={(e) => handleChange('voucherPrefix', e.target.value)}
                                    className="w-full p-2.5 text-sm border border-gray-300 rounded-sm focus:ring-blue-600 focus:border-blue-600 outline-none"
                                    placeholder="e.g., PRC"
                                />
                            </div>
                            <div>
                                <div className="flex items-center mb-1 gap-2">
                                    <label htmlFor="current-number" className="text-sm font-medium text-gray-700">Next Voucher Number</label>
                                    <InfoTooltip text="The sequence number for the next recorded purchase." />
                                </div>
                                <input
                                    type="number"
                                    id="current-number"
                                    value={settings.currentVoucherNumber ?? 1000}
                                    onChange={(e) => handleChange('currentVoucherNumber', e.target.value)}
                                    className="w-full p-2.5 text-sm border border-gray-300 rounded-sm focus:ring-blue-600 focus:border-blue-600 outline-none"
                                    min="1"
                                    step="1"
                                />
                            </div>
                        </div>
                    </SettingsCard>

                </form>
            </main>

            <div className="fixed inset-x-0 bottom-16 md:bottom-0 z-40 bg-transparent px-4 pb-2 md:p-4 pointer-events-none">
                <div className="max-w-2xl mx-auto flex justify-center gap-4 pointer-events-auto">
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className="w-auto min-w-[150px] flex items-center justify-center bg-blue-600 text-white font-bold py-3 px-6 rounded-sm hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg"
                    >
                        {isSaving ? <Spinner /> : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PurchaseSettingsPage;