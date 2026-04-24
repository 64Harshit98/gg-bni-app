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
import { Permissions, State } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { FiCheck } from 'react-icons/fi';
import { InfoTooltip } from '../../Components/InfoToolTip';
import { ResetSettingsButton } from '../../Components/ResetSettingsButton';
import ShowWrapper from '../../context/ShowWrapper';

export interface SalesSettings {
    settingType: 'sales';
    salesViewType?: 'card' | 'list' | 'calculator';
    enableTax?: boolean;
    defaultTaxRate?: number;
    enableSalesmanSelection?: boolean;
    gstScheme?: 'regular' | 'composition' | 'none';
    taxType?: 'inclusive' | 'exclusive';
    enableRounding?: boolean;
    roundingInterval?: number;
    hideMrp?: boolean;
    enableItemWiseDiscount?: boolean;
    lockDiscountEntry?: boolean;
    lockSalePriceEntry?: boolean;
    defaultDiscount?: number;
    allowNegativeStock?: boolean;
    allowDueBilling?: boolean;
    requireCustomerName?: boolean;
    requireCustomerMobile?: boolean;
    voucherName?: string;
    voucherPrefix?: string;
    currentVoucherNumber?: number;
    copyVoucherAfterSaving?: boolean;
    cartInsertionOrder?: 'top' | 'bottom';
    cardViewWithPhoto?: boolean;
    companyId?: string;
    lockTaxToggle?: boolean;
    enableShippingDetails?: boolean;
    enableExtraExpense?: boolean;
    enableNarration?: boolean;
    enableCustomerInfoToggle?: boolean;
    lastSavedPlan?: string;
}

export const PLAN_ALLOWED_FEATURES: Record<string, Partial<Record<keyof SalesSettings, boolean>> & { allowedViews: string[] }> = {
    'pos_basic': {
        allowedViews: ['calculator']
    },
    'pos_pro': {
        allowedViews: ['list', 'card', 'calculator']
    },
    'enterprise': {
        allowedViews: ['list', 'card', 'calculator']
    }
};

// eslint-disable-next-line react-refresh/only-export-components
export const getDefaultSalesSettings = (companyId: string): SalesSettings => ({
    companyId: companyId,
    settingType: 'sales',
    salesViewType: 'list',
    enableSalesmanSelection: false,
    gstScheme: 'none',
    taxType: 'inclusive',
    lockTaxToggle: false,
    enableRounding: false,
    roundingInterval: 1,
    cartInsertionOrder: 'bottom',
    hideMrp: false,
    enableItemWiseDiscount: true,
    lockDiscountEntry: false,
    lockSalePriceEntry: false,
    defaultDiscount: 0,
    allowNegativeStock: true,
    allowDueBilling: true,
    requireCustomerName: false,
    requireCustomerMobile: false,
    voucherName: 'Invoice',
    voucherPrefix: 'INV',
    currentVoucherNumber: 1000,
    copyVoucherAfterSaving: false,
    enableShippingDetails: false,
    enableExtraExpense: false,
    enableNarration: false,
});

interface CardProps {
    title: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}

const SettingsCard: React.FC<CardProps> = ({ title, children, action }) => (
    <section className="bg-white rounded-sm border border-gray-200 shadow-sm p-5 md:p-6 space-y-5 transition-shadow">
        <div className="flex items-center justify-between gap-3">
            <h2 className="text-base md:text-lg font-semibold text-gray-800">{title}</h2>
            {action}
        </div>
        {children}
    </section>
);

export interface ToggleRowProps {
    id: string;
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    tooltip?: string;
    disabled?: boolean;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({ id, label, description, checked, onChange, tooltip, disabled = false, }) => (
    <div className={`flex items-start justify-between gap-4 rounded-sm bg-gray-50/60 border border-gray-100 p-3.5 md:p-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="min-w-0">
            <div className="flex items-center gap-2">
                <label htmlFor={id} className="text-sm font-semibold text-gray-800 leading-5">{label}</label>
                <InfoTooltip text={tooltip || description} />
            </div>
            <p className="hidden md:block text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
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

const SalesSettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [settings, setSettings] = useState<SalesSettings | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    const activePlan = currentUser?.Subscription?.pack?.toLowerCase() || 'basic';
    // Added safe fallback for basic plan keying to prevent undefined errors
    const allowedFeatures = PLAN_ALLOWED_FEATURES[activePlan] || PLAN_ALLOWED_FEATURES['pos_basic'] || { allowedViews: ['list'] };

    useEffect(() => {
        if (!currentUser?.companyId) {
            setIsLoading(true);
            return;
        }

        const fetchOrCreateSettings = async () => {
            setIsLoading(true);
            const companyId = currentUser.companyId!;

            const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');
            const counterDocRef = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');

            try {
                const [docSnap, counterSnap] = await Promise.all([
                    getDoc(settingsDocRef),
                    getDoc(counterDocRef)
                ]);

                // 1. Start with safe defaults
                let dbSettings = getDefaultSalesSettings(companyId);

                // 2. FETCH AND APPLY ACTUAL DATA FROM BACKEND
                if (docSnap.exists()) {
                    dbSettings = { ...dbSettings, ...docSnap.data() };
                } else {
                    console.log(`Creating default sales settings...`);
                    await setDoc(settingsDocRef, dbSettings);
                }

                if (counterSnap.exists() && counterSnap.data().currentNumber !== undefined) {
                    dbSettings.currentVoucherNumber = counterSnap.data().currentNumber;
                } else {
                    await setDoc(counterDocRef, { currentNumber: dbSettings.currentVoucherNumber }, { merge: true });
                }

                // 3. APPLY PLAN MASK TO UI ONLY (Never deletes backend data)
                const validView = allowedFeatures.allowedViews?.includes(dbSettings.salesViewType || 'list')
                    ? dbSettings.salesViewType
                    : (allowedFeatures.allowedViews?.[0] || 'list');

                const finalSettingsToDisplay = {
                    ...dbSettings,
                    salesViewType: validView,
                } as SalesSettings;

                setSettings(finalSettingsToDisplay);
            } catch (err) {
                console.error('Failed to fetch/create sales settings:', err);
                setModal({ message: 'Failed to load settings.', type: State.ERROR });
            } finally {
                setIsLoading(false);
            }
        };

        fetchOrCreateSettings();
    }, [currentUser?.companyId, activePlan]);

    useEffect(() => {
        if (settings?.gstScheme === 'composition') {
            if (settings.taxType !== 'inclusive') {
                setSettings(prev => prev ? ({ ...prev, taxType: 'inclusive' }) : null);
            }
        }
    }, [settings?.gstScheme, settings?.taxType]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!currentUser?.companyId || !settings) {
            setModal({ message: 'Error: Missing data.', type: State.ERROR }); return;
        }

        setIsSaving(true);
        try {
            const companyId = currentUser.companyId;
            const settingsRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');
            const counterRef = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');

            const { currentVoucherNumber, ...restOfSettings } = settings;

            // FORCES UNAUTHORIZED FEATURES TO FALSE/DEFAULT IN THE DATABASE
            const validView = allowedFeatures.allowedViews?.includes(restOfSettings.salesViewType || 'list')
                ? restOfSettings.salesViewType
                : (allowedFeatures.allowedViews?.[0] || 'list');

            const settingsToSave = {
                ...restOfSettings,
                salesViewType: validView,
                companyId: companyId,
                settingType: 'sales',
                lastSavedPlan: activePlan, // REMEMBERS THE PLAN THEY SAVED UNDER
                updatedAt: new Date()
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
            const counterDocRef = doc(db, 'companies', currentUser.companyId, 'counters', 'invoiceCounter');
            const counterSnap = await getDoc(counterDocRef);

            let backendCounter = 1;
            if (counterSnap.exists() && counterSnap.data().currentNumber) {
                backendCounter = counterSnap.data().currentNumber;
            }

            setSettings({
                ...settings,
                voucherName: 'Invoice',
                voucherPrefix: 'INV',
                currentVoucherNumber: backendCounter
            });

        } catch (error) {
            console.error("Failed to fetch backend counter for reset:", error);
            setSettings({
                ...settings,
                voucherName: 'Invoice',
                voucherPrefix: 'INV'
            });
        }
    };

    const handleChange = (field: keyof SalesSettings, value: string | number | boolean) => {
        if (!settings) return;

        const numericFields = [
            'defaultDiscount',
            'currentVoucherNumber',
            'roundingInterval',
        ];

        if (numericFields.includes(field)) {
            const numValue = parseFloat(String(value));
            setSettings({ ...settings, [field]: isNaN(numValue) ? 0 : numValue });
        } else {
            setSettings({ ...settings, [field]: value });
        }
    };

    const handleCheckboxChange = (field: keyof SalesSettings, checked: boolean) => {
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
                    className="mt-1 flex items-center justify-center p-4 rounded-full bg-gray-200 text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-all"
                    title="Go Back"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 5l-7 7 7 7" />
                    </svg>
                </button>
                <h1 className="text-base md:text-lg font-semibold text-gray-800">Sales Settings</h1>
                <div className="w-6"></div>
            </div>

            <main className="flex-grow min-h-0 p-3 sm:p-4 md:p-5 bg-gray-50 w-full overflow-y-auto box-border pb-44 md:pb-24">
                <form onSubmit={handleSave} className="max-w-5xl mx-auto space-y-5">

                    <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                        <div className="space-y-5">
                            {/* Display & Team — full width */}
                            <SettingsCard
                                title="Display Settings"
                                action={
                                    <ResetSettingsButton<SalesSettings>
                                        defaults={getDefaultSalesSettings(currentUser?.companyId ?? '')}
                                        onReset={setSettings}
                                    />
                                }
                            >
                                <div className="grid grid-cols-2 gap-3">
                                    {/* List View */}
                                    <div
                                        onClick={() => handleChange('salesViewType', 'list')}
                                        className={`cursor-pointer relative rounded-sm border-2 p-3 flex flex-col items-center gap-3 transition-all ${settings.salesViewType === 'list' ? 'border-blue-600 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-blue-300'}`}
                                    >
                                        {settings.salesViewType === 'list' && (
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
                                            <p className="text-xs text-gray-500 mt-0.5">Desktop & Barcodes</p>
                                        </div>
                                    </div>

                                    {/* Card View */}
                                    <div
                                        onClick={() => handleChange('salesViewType', 'card')}
                                        className={`cursor-pointer relative rounded-sm border-2 p-3 flex flex-col items-center gap-3 transition-all ${settings.salesViewType === 'card' ? 'border-blue-600 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-blue-300'}`}
                                    >
                                        {settings.salesViewType === 'card' && (
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
                                            <p className="text-xs text-gray-500 mt-0.5">Touchscreens & Tablets</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Card photo sub-options — shown only when card view is selected */}
                                {settings.salesViewType === 'card' && (
                                    <div className="pl-4 pr-4 py-3 border-l-2 border-r-2 border-gray-200">
                                        <p className="text-xs font-semibold text-gray-600 mb-2">Card Image Display</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {/* With Photo */}
                                            <div
                                                onClick={() => handleCheckboxChange('cardViewWithPhoto', true)}
                                                className={`cursor-pointer relative rounded-sm border p-2 sm:p-3 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 transition-all ${settings.cardViewWithPhoto ? 'border-blue-500 bg-white shadow-sm' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
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
                                                className={`cursor-pointer relative rounded-sm border p-2 sm:p-3 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 transition-all ${!settings.cardViewWithPhoto ? 'border-blue-500 bg-white shadow-sm' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
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

                                <ToggleRow
                                    id="salesman-billing"
                                    label="Enable Salesman-wise Billing"
                                    description="Track which salesman handled each bill."
                                    checked={settings.enableSalesmanSelection ?? false}
                                    onChange={(checked) => handleCheckboxChange('enableSalesmanSelection', checked)}
                                    tooltip="Track which salesman handled each specific sale invoice."
                                />
                            </SettingsCard>

                            {/* Pricing & Tax — full width */}
                            <SettingsCard title="Pricing & Tax">
                                <div className="space-y-3">
                                    <div className="rounded-sm bg-gray-50 border border-gray-100 p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <p className="text-sm font-semibold text-gray-800 leading-5">GST Scheme</p>
                                            <InfoTooltip text="Select the applicable GST tax scheme for your business." />
                                        </div>
                                        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                                            {[
                                                { label: 'None', value: 'none' },
                                                { label: 'Regular GST', value: 'regular' },
                                                { label: 'Composition', value: 'composition' },
                                            ].map((opt) => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() => handleChange('gstScheme', opt.value)}
                                                    className={`min-w-0 min-h-[42px] px-2 py-2 rounded-sm text-[11px] sm:text-sm font-semibold border leading-tight text-center whitespace-normal break-words ${settings.gstScheme === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {settings.gstScheme === 'regular' && (
                                        <div className="rounded-sm bg-gray-50 border border-gray-100 p-3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <p className="text-sm font-semibold text-gray-800 leading-5">Tax Calculation</p>
                                                <InfoTooltip text="Choose if your item prices include or exclude GST." />
                                            </div>
                                            <select
                                                value={settings.taxType || 'exclusive'}
                                                onChange={(e) => handleChange('taxType', e.target.value)}
                                                className="w-full p-2.5 text-sm border border-gray-300 rounded-sm bg-white"
                                            >
                                                <option value="exclusive">Tax Exclusive (Sales Price excludes GST)</option>
                                                <option value="inclusive">Tax Inclusive (Sales Price includes GST)</option>
                                            </select>
                                        </div>
                                    )}

                                    <ToggleRow
                                        id="lock-tax"
                                        label="Lock Tax Mode"
                                        description="Prevent cashiers from changing the tax mode (view only)."
                                        checked={settings.lockTaxToggle ?? false}
                                        onChange={(checked) => handleCheckboxChange('lockTaxToggle', checked)}
                                        tooltip="Prevent cashiers from modifying tax settings during checkout (Regular Scheme only)."
                                    />

                                    <ToggleRow
                                        id="enable-rounding"
                                        label="Enable Rounding Off"
                                        description="Automatically round the individual item net price in the bill."
                                        checked={settings.enableRounding ?? false}
                                        onChange={(checked) => handleCheckboxChange('enableRounding', checked)}
                                        tooltip="Round bill totals to selected precision."
                                    />

                                    {settings.enableRounding && (
                                        <div className="rounded-sm bg-gray-50 border border-gray-100 p-3">
                                            <p className="text-xs font-semibold text-gray-700 mb-2">Rounding Precision</p>
                                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                                {[0.01, 0.1, 0.5, 1, 5, 10].map((value) => (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        onClick={() => handleChange('roundingInterval', value)}
                                                        className={`px-2 py-1.5 rounded-sm border text-xs font-semibold ${Number(settings.roundingInterval ?? 1) === value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                                                    >
                                                        {value.toFixed(value < 1 ? 2 : 2)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <ToggleRow
                                        id="hide-mrp"
                                        label="Hide MRP in Sales List"
                                        description="Hide the MRP column from POS item list."
                                        checked={settings.hideMrp ?? false}
                                        onChange={(checked) => handleCheckboxChange('hideMrp', checked)}
                                        tooltip="Hide Maximum Retail Price column on sales screen."
                                    />

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
                                </div>
                            </SettingsCard>

                            {/* Smaller cards in a 2x2 grid */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                                <SettingsCard title="Discounts & Price Control">
                                    <ToggleRow id="item-discount" label="Enable Item-wise Discount" description="Allow discount per item." checked={settings.enableItemWiseDiscount ?? false} onChange={(checked) => handleCheckboxChange('enableItemWiseDiscount', checked)} tooltip="Allow discounts to be applied to individual cart items." />
                                    <ToggleRow id="lock-discount" label="Lock Discount Entry" description="Prevent editing discount in billing screen." checked={settings.lockDiscountEntry ?? false} onChange={(checked) => handleCheckboxChange('lockDiscountEntry', checked)} tooltip="Stop staff from manually changing discounts during a sale." />
                                    <ToggleRow id="lock-price" label="Lock Sale Price" description="Prevent editing sale price in billing screen." checked={settings.lockSalePriceEntry ?? false} onChange={(checked) => handleCheckboxChange('lockSalePriceEntry', checked)} tooltip="Stop staff from manually altering item selling price." />
                                </SettingsCard>

                                <SettingsCard title="Billing & Inventory Rules">
                                    <ToggleRow id="allow-negative" label="Allow Negative Inventory Billing" description="Allow billing items even when stock is zero." checked={settings.allowNegativeStock ?? false} onChange={(checked) => handleCheckboxChange('allowNegativeStock', checked)} tooltip="Allow selling items even if recorded stock is zero." />
                                    <ToggleRow id="allow-due" label="Allow Due Billing" description="Allow partial or no payment billing (credit)." checked={settings.allowDueBilling ?? false} onChange={(checked) => handleCheckboxChange('allowDueBilling', checked)} tooltip="Allow finalizing sales with pending amount." />
                                </SettingsCard>

                                <SettingsCard title="Additional Checkout Fields">
                                    <ToggleRow id="enable-shipping" label="Enable Shipping Details" description="Allow shipping address and GST capture." checked={settings.enableShippingDetails ?? false} onChange={(checked) => handleCheckboxChange('enableShippingDetails', checked)} tooltip="Allow capturing separate shipping address and GST for customers." />
                                    <ToggleRow id="enable-expense" label="Enable Extra Expense" description="Allow additional charges like freight/packing." checked={settings.enableExtraExpense ?? false} onChange={(checked) => handleCheckboxChange('enableExtraExpense', checked)} tooltip="Add extra charge to final bill." />
                                    <ToggleRow id="enable-narration" label="Enable Narration / Remarks" description="Allow adding custom note in invoice." checked={settings.enableNarration ?? false} onChange={(checked) => handleCheckboxChange('enableNarration', checked)} tooltip="Allow custom remarks on invoice." />
                                </SettingsCard>
                            </div>
                        </div>
                    </ShowWrapper>

                    {/* Required Fields (Outside ShowWrapper to display for all plans) */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        <SettingsCard title="Required Fields">
                            <ToggleRow
                                id="req-customer-info"
                                label="Enable Customer Info"
                                description="Enable and disable customer info during payment."
                                checked={settings.enableCustomerInfoToggle ?? false}
                                onChange={(checked) => handleCheckboxChange('enableCustomerInfoToggle', checked)}
                                tooltip="Toggles the customer information capture section during checkout."
                            />
                            <ToggleRow id="req-customer" label="Require Customer Name" description="Force customer name before save." checked={settings.requireCustomerName ?? false} onChange={(checked) => handleCheckboxChange('requireCustomerName', checked)} tooltip="Force entering customer name before saving invoice." />
                            <ToggleRow id="req-mobile" label="Require Customer Mobile" description="Force customer mobile before save." checked={settings.requireCustomerMobile ?? false} onChange={(checked) => handleCheckboxChange('requireCustomerMobile', checked)} tooltip="Force entering customer mobile before saving invoice." />
                        </SettingsCard>
                    </div>

                    {/* Voucher Numbering (Outside ShowWrapper) */}
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
                                    value={settings.voucherName || 'Invoice'}
                                    disabled
                                    className="w-full p-2.5 text-sm border border-gray-200 rounded-sm bg-gray-100 text-gray-500 cursor-not-allowed select-none"
                                />
                            </div>
                            <div>
                                <div className="flex items-center mb-1 gap-2">
                                    <label htmlFor="voucher-prefix" className="text-sm font-medium text-gray-700">Voucher Prefix</label>
                                    <InfoTooltip text="Letters added before invoice number (e.g., INV-1)." />
                                </div>
                                <input
                                    type="text"
                                    id="voucher-prefix"
                                    value={settings.voucherPrefix || ''}
                                    onChange={(e) => handleChange('voucherPrefix', e.target.value)}
                                    className="w-full p-2.5 text-sm border border-gray-300 rounded-sm focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    placeholder="e.g., INV"
                                />
                            </div>
                            <div>
                                <div className="flex items-center mb-1 gap-2">
                                    <label htmlFor="current-number" className="text-sm font-medium text-gray-700">Next Voucher Number</label>
                                    <InfoTooltip text="Sequence number for next generated invoice." />
                                </div>
                                <input
                                    type="number"
                                    id="current-number"
                                    value={settings.currentVoucherNumber ?? 1}
                                    onChange={(e) => handleChange('currentVoucherNumber', e.target.value)}
                                    className="w-full p-2.5 text-sm border border-gray-300 rounded-sm focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                        className="w-auto min-w-[150px] flex items-center justify-center bg-blue-600 text-white font-bold py-3 px-6 rounded-sm hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg"
                    >
                        {isSaving ? <Spinner /> : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SalesSettingsPage;