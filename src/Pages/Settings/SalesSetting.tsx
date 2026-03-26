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
import { InfoTooltip } from '../../Components/InfoToolTip';
import { ResetSettingsButton } from '../../Components/ResetSettingsButton';

export interface SalesSettings {
    settingType: 'sales';
    salesViewType?: 'card' | 'list';
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
    companyId?: string;
    lockTaxToggle?: boolean;
    enableShippingDetails?: boolean;
    enableExtraExpense?: boolean;
    enableNarration?: boolean;
    cardViewWithPhoto?: boolean;
}

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
    cardViewWithPhoto: true,
});

const SalesSettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [settings, setSettings] = useState<SalesSettings | null>(null);
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

            const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');
            const counterDocRef = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');

            try {
                const [docSnap, counterSnap] = await Promise.all([
                    getDoc(settingsDocRef),
                    getDoc(counterDocRef)
                ]);

                const defaultSettings = getDefaultSalesSettings(companyId);
                let mergedSettings = { ...defaultSettings };

                if (docSnap.exists()) {
                    mergedSettings = { ...mergedSettings, ...docSnap.data() };
                } else {
                    console.log(`Creating default sales settings...`);
                    await setDoc(settingsDocRef, defaultSettings);
                }

                if (counterSnap.exists() && counterSnap.data().currentNumber !== undefined) {
                    mergedSettings.currentVoucherNumber = counterSnap.data().currentNumber;
                } else {
                    await setDoc(counterDocRef, { currentNumber: defaultSettings.currentVoucherNumber }, { merge: true });
                }

                setSettings(mergedSettings as SalesSettings);
            } catch (err) {
                console.error('Failed to fetch/create sales settings:', err);
                setModal({ message: 'Failed to load settings.', type: State.ERROR });
            } finally {
                setIsLoading(false);
            }
        };

        fetchOrCreateSettings();
    }, [currentUser?.companyId]);

    useEffect(() => {
        if (settings?.gstScheme === 'composition') {
            if (settings.taxType !== 'inclusive') {
                setSettings(prev => prev ? ({ ...prev, taxType: 'inclusive' }) : null);
            }
        }
    }, [settings?.gstScheme]);

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

            const settingsToSave = {
                ...restOfSettings,
                companyId: companyId,
                settingType: 'sales',
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

    const handleChange = (field: keyof SalesSettings, value: any) => {
        if (!settings) return;

        const numericFields = [
            'defaultDiscount',
            'currentVoucherNumber',
            'roundingInterval',
        ];

        if (numericFields.includes(field)) {
            const numValue = parseFloat(value);
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
                    className="text-2xl font-bold text-gray-600 bg-transparent border-none cursor-pointer p-1"
                >
                    &times;
                </button>
                <h1 className="text-lg font-semibold text-gray-800">Sales Settings</h1>
                <div className="w-6"></div>
            </div>

            <main className="flex-grow p-4 bg-gray-50 w-full overflow-y-auto box-border pb-30">
                <form onSubmit={handleSave} className="max-w-3xl mx-auto">

                    {/* --- Card 1: General Settings --- */}
                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-800">Display Settings</h2>
                            <ResetSettingsButton<SalesSettings>
                                defaults={getDefaultSalesSettings(currentUser?.companyId ?? '')}
                                onReset={setSettings}
                            />
                        </div>
                        <div className="mb-4">
                            <div className="flex items-center mb-3">
                                <label className="text-gray-700 text-sm font-medium mr-2">
                                    Sales View Mode
                                </label>
                                <InfoTooltip text="Choose between list or card layout for the sales screen." />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* List View Option */}
                                <div
                                    onClick={() => handleChange('salesViewType', 'list')}
                                    className={`cursor-pointer relative rounded-xl border-2 p-2 flex flex-col items-center gap-3 transition-all duration-200 ${settings.salesViewType === 'list'
                                        ? 'border-blue-600 bg-blue-50 shadow-md'
                                        : 'border-gray-200 hover:border-blue-300 bg-white'
                                        }`}
                                >
                                    {settings.salesViewType === 'list' && (
                                        <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-0.5 shadow-sm z-10">
                                            <FiCheck size={12} />
                                        </div>
                                    )}
                                    {/* Visual Representation of List */}
                                    <div className="w-full h-24 bg-white border border-gray-200 rounded p-3 flex flex-col gap-2 justify-center shadow-inner">
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
                                    onClick={() => handleChange('salesViewType', 'card')}
                                    className={`cursor-pointer relative rounded-xl border-2 p-4 flex flex-col items-center gap-3 transition-all duration-200 ${settings.salesViewType === 'card'
                                        ? 'border-blue-600 bg-blue-50 shadow-md'
                                        : 'border-gray-200 hover:border-blue-300 bg-white'
                                        }`}
                                >
                                    {settings.salesViewType === 'card' && (
                                        <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-0.5 shadow-sm z-10">
                                            <FiCheck size={12} />
                                        </div>
                                    )}
                                    <div className="w-full max-w-[12rem] h-24 bg-white border border-gray-200 rounded p-3 grid grid-cols-3 gap-1.5 shadow-inner mx-auto">
                                        {[...Array(6)].map((_, i) => (
                                            <div key={i} className="bg-gray-200 rounded-sm"></div>
                                        ))}
                                    </div>
                                    <div className="text-center">
                                        <p className="font-bold text-gray-800">Card View</p>
                                        <p className="text-xs text-gray-500 mt-1">Best for Touchscreens & Tablets</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* --- Card Image Display Sub Options --- */}
                        {settings.salesViewType === 'card' && (
                            <div className="mt-4 ml-4 mr-4 pl-[18px] pr-[18px] py-1 border-l-2 border-r-2 border-gray-200 transition-all duration-200">
                                <div className="flex items-center mb-3 mt-3">
                                    <label className="text-gray-600 text-sm font-medium mr-2">Card Image Display</label>
                                    <InfoTooltip text="Choose whether product images are shown on each card." />
                                </div>
                                <div className="grid grid-cols-2 gap-2 pb-1">

                                    {/* With Photo */}
                                    <div
                                        onClick={() => handleCheckboxChange('cardViewWithPhoto', true)}
                                        className={`cursor-pointer relative rounded-lg border p-2 sm:p-3 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 transition-all duration-200 
                                    ${settings.cardViewWithPhoto
                                                ? 'border-blue-500 bg-white shadow-sm'
                                                : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                                            }`}
                                    >
                                        {settings.cardViewWithPhoto && (
                                            <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-0.5 shadow-sm z-10">
                                                <FiCheck size={10} />
                                            </div>
                                        )}

                                        <div className=" w-full sm:w-[6.5rem] sm:shrink-0 h-12 sm:h-12 bg-gray-100 border border-gray-200 rounded p-1 grid grid-cols-3 gap-1">
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} className="flex flex-col items-center gap-0.5">
                                                    <div className="w-full aspect-square bg-blue-200 rounded-sm"></div>
                                                    <div className="h-1 w-full bg-gray-300 rounded"></div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="text-left">
                                            <p className="text-xs sm:text-sm font-semibold text-gray-700">With Photo</p>
                                            <p className="text-xs text-gray-500 hidden sm:block">Shows product image on card</p>
                                        </div>
                                    </div>


                                    {/* Without Photo */}
                                    <div
                                        onClick={() => handleCheckboxChange('cardViewWithPhoto', false)}
                                        className={`cursor-pointer relative rounded-lg border p-2 sm:p-3 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 transition-all duration-200
                                    ${!settings.cardViewWithPhoto
                                                ? 'border-blue-500 bg-white shadow-sm'
                                                : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                                            }`}
                                    >
                                        {!settings.cardViewWithPhoto && (
                                            <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-0.5 shadow-sm z-10">
                                                <FiCheck size={10} />
                                            </div>
                                        )}

                                        <div className=" w-full sm:w-[6.5rem] sm:shrink-0 h-12 sm:h-12 bg-gray-100 border border-gray-200 rounded p-1 grid grid-cols-3 gap-1">
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} className="flex flex-col items-center justify-center gap-0.5 bg-white rounded-sm border border-gray-200 p-1">
                                                    <div className="h-1 w-3/4 bg-gray-300 rounded"></div>
                                                    <div className="h-1 w-full bg-gray-200 rounded"></div>
                                                    <div className="h-1 w-1/2 bg-gray-200 rounded"></div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="text-left">
                                            <p className="text-xs sm-text-sm font-semibold text-gray-700">Without Photo</p>
                                            <p className="text-xs text-gray-500 hidden sm:block">Text-only compact cards</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center mb-2">
                            <input type="checkbox" id="salesman-billing" checked={settings.enableSalesmanSelection ?? false} onChange={(e) => handleCheckboxChange('enableSalesmanSelection', e.target.checked)} className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="salesman-billing" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Enable Salesman-wise Billing
                            </label>
                            <InfoTooltip text="Track which salesman handled each specific sale invoice." />
                        </div>
                    </div>

                    {/* --- Card 2: Pricing & Tax --- */}
                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Pricing & Tax</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <div className="flex items-center mb-1">
                                    <label htmlFor="gst-scheme" className="text-gray-700 text-sm font-medium mr-2">
                                        GST Scheme
                                    </label>
                                    <InfoTooltip text="Select the applicable GST tax scheme for your business." />
                                </div>
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

                        {settings.gstScheme === 'regular' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                                <div>
                                    <div className="flex items-center mb-1">
                                        <label htmlFor="tax-type" className="text-gray-700 text-sm font-medium mr-2">
                                            Tax Calculation (for Regular GST)
                                        </label>
                                        <InfoTooltip text="Choose if your item prices include or exclude GST." />
                                    </div>
                                    <select
                                        id="tax-type"
                                        value={settings.taxType || 'exclusive'}
                                        onChange={(e) => handleChange('taxType', e.target.value)}
                                        className="w-full p-3 border border-gray-300 rounded-lg bg-white"
                                    >
                                        <option value="exclusive">Tax Exclusive (Sales Price excludes GST)</option>
                                        <option value="inclusive">Tax Inclusive (Sales Price includes GST)</option>
                                    </select>
                                </div>
                            </div>
                        )}
                        <div className="flex items-start mt-2">
                            <input
                                type="checkbox"
                                id="lock-tax"
                                checked={settings.lockTaxToggle ?? false}
                                onChange={(e) => handleCheckboxChange('lockTaxToggle', e.target.checked)}
                                className="w-5 h-5 text-red-500 rounded focus:ring-red-500 mt-0.5"
                            />
                            <div className="ml-3">
                                <div className="flex items-center">
                                    <label htmlFor="lock-tax" className="text-sm font-bold text-gray-800 mr-2">
                                        Lock Tax Mode
                                    </label>
                                    <InfoTooltip text="Prevent cashiers from modifying tax settings during checkout.(Regular Scheme only)" />
                                </div>
                                <p className="text-xs text-gray-600">Prevent cashiers from changing the tax mode (view only).</p>
                            </div>
                        </div>

                        <div className="flex items-center mb-2 mt-4">
                            <input type="checkbox" id="enable-rounding" checked={settings.enableRounding ?? false} onChange={(e) => handleCheckboxChange('enableRounding', e.target.checked)} className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="enable-rounding" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Enable Rounding Off
                            </label>
                            <InfoTooltip text="Automatically round the individual item net price in the bill to the nearest rupee selected." />
                        </div>
                        {settings.enableRounding && (
                            <div className="ml-6 mt-2 mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                                <div>
                                    <div className="flex items-center mb-1">
                                        <label htmlFor="rounding-interval" className="text-gray-700 text-xs font-bold uppercase mr-2">
                                            Rounding To
                                        </label>
                                        <InfoTooltip text="Select the nearest value to round the bill to." />
                                    </div>
                                    <select
                                        id="rounding-interval"
                                        value={settings.roundingInterval ?? 1}
                                        onChange={(e) => handleChange('roundingInterval', e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded bg-white text-sm"
                                    >
                                        <option value="0.01">0.01 (Precise)</option>
                                        <option value="0.1">0.10</option>
                                        <option value="0.5">0.50</option>
                                        <option value="1">1.00 (Nearest Rupee)</option>
                                        <option value="5">5.00</option>
                                        <option value="10">10.00</option>
                                        <option value="50">50.00</option>
                                        <option value="100">100.00</option>
                                    </select>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center mb-4">
                            <input
                                type="checkbox"
                                id="hide-mrp"
                                checked={settings.hideMrp ?? false}
                                onChange={(e) => handleCheckboxChange('hideMrp', e.target.checked)}
                                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                            />
                            <label htmlFor="hide-mrp" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Hide MRP in Sales List
                            </label>
                            <InfoTooltip text="Hide the Maximum Retail Price column on the sales screen." />
                        </div>
                        <div className="mb-4">
                            <div className="flex items-center mb-1">
                                <label className="text-sm font-medium text-gray-700 mr-2">
                                    Cart Item Sorting
                                </label>
                                <InfoTooltip text="Choose where newly scanned items appear in the cart." />
                            </div>
                            <select
                                value={settings?.cartInsertionOrder || 'top'}
                                onChange={(e) => handleChange('cartInsertionOrder', e.target.value as 'top' | 'bottom')}
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="top">Newest First (Add New to Top)</option>
                                <option value="bottom">Oldest First (Add New to Bottom)</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                Controls where new items appear in the cart list.
                            </p>
                        </div>
                    </div>

                    {/* --- Card 3: Discounts & Price Control --- */}
                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Discounts & Price Control</h2>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="item-discount" checked={settings.enableItemWiseDiscount ?? false} onChange={(e) => handleCheckboxChange('enableItemWiseDiscount', e.target.checked)} className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="item-discount" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Enable Item-wise Discount
                            </label>
                            <InfoTooltip text="Allow discounts to be applied to individual cart items." />
                        </div>

                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="lock-discount" checked={settings.lockDiscountEntry ?? false} onChange={(e) => handleCheckboxChange('lockDiscountEntry', e.target.checked)} className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="lock-discount" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Lock Discount Entry (Prevent editing on sales screen)
                            </label>
                            <InfoTooltip text="Stop staff from manually changing discounts during a sale." />
                        </div>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="lock-price" checked={settings.lockSalePriceEntry ?? false} onChange={(e) => handleCheckboxChange('lockSalePriceEntry', e.target.checked)} className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="lock-price" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Lock Sale Price (Prevent editing on sales screen)
                            </label>
                            <InfoTooltip text="Stop staff from manually altering an item's selling price." />
                        </div>
                    </div>

                    {/* --- Card 4: Billing & Inventory Rules --- */}
                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Billing & Inventory Rules</h2>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="allow-negative" checked={settings.allowNegativeStock ?? false} onChange={(e) => handleCheckboxChange('allowNegativeStock', e.target.checked)} className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="allow-negative" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Allow Negative Inventory Billing
                            </label>
                            <InfoTooltip text="Allow selling items even if recorded stock is zero." />
                        </div>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="allow-due" checked={settings.allowDueBilling ?? false} onChange={(e) => handleCheckboxChange('allowDueBilling', e.target.checked)} className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="allow-due" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Allow Due Billing (Credit Sales)
                            </label>
                            <InfoTooltip text="Allow finalizing sales with partial or no payment (credit)." />
                        </div>
                    </div>
                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Additional Checkout Fields</h2>
                        <p className="text-sm text-gray-500 mb-2">Enable extra fields during the payment checkout drawer.</p>

                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="enable-shipping" checked={settings.enableShippingDetails ?? false} onChange={(e) => handleCheckboxChange('enableShippingDetails', e.target.checked)} className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="enable-shipping" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Enable Shipping Details
                            </label>
                            <InfoTooltip text="Allow capturing separate shipping address and GST for customers." />
                        </div>

                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="enable-expense" checked={settings.enableExtraExpense ?? false} onChange={(e) => handleCheckboxChange('enableExtraExpense', e.target.checked)} className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="enable-expense" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Enable Extra Expense
                            </label>
                            <InfoTooltip text="Add an extra charge (like Freight or Packing) to the final bill." />
                        </div>

                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="enable-narration" checked={settings.enableNarration ?? false} onChange={(e) => handleCheckboxChange('enableNarration', e.target.checked)} className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="enable-narration" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Enable Narration / Remarks
                            </label>
                            <InfoTooltip text="Allow adding a custom note or remark to the invoice." />
                        </div>
                    </div>

                    {/* --- Card 5: Required Fields --- */}
                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Required Fields</h2>
                        <p className="text-sm text-gray-500 mb-2">Select fields that must be filled before saving a sale.</p>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="req-customer" checked={settings.requireCustomerName ?? false} onChange={(e) => handleCheckboxChange('requireCustomerName', e.target.checked)} className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="req-customer" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Require Customer Name
                            </label>
                            <InfoTooltip text="Force entering a customer name before saving the invoice." />
                        </div>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" id="req-mobile" checked={settings.requireCustomerMobile ?? false} onChange={(e) => handleCheckboxChange('requireCustomerMobile', e.target.checked)} className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500" />
                            <label htmlFor="req-mobile" className="ml-2 mr-2 text-gray-700 text-sm font-medium">
                                Require Customer Mobile
                            </label>
                            <InfoTooltip text="Force entering a customer mobile number before saving." />
                        </div>
                    </div>

                    {/* --- Card 6: Voucher Numbering & Options --- */}
                    <div className="bg-white rounded-lg p-6 shadow-md mb-2">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-gray-800">Voucher Numbering</h2>
                            <button
                                type="button"
                                onClick={handleResetVoucher}
                                className="text-xs text-red-600 hover:text-red-800 font-bold px-3 py-1.5 rounded-sm bg-red-50 hover:bg-red-100 transition-colors border border-red-100"
                            >
                                Reset to Default
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <div className="flex items-center mb-1">
                                    <label htmlFor="voucher-name" className="flex items-center text-gray-700 text-sm font-medium mr-2">
                                        Voucher Name <span className="ml-2 text-[10px] text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded">LOCKED</span>
                                    </label>
                                    <InfoTooltip text="Internal document name for this transaction type." />
                                </div>
                                <input
                                    type="text"
                                    id="voucher-name"
                                    value={settings.voucherName || 'Invoice'}
                                    disabled
                                    className="w-full p-3 border border-gray-200 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed select-none"
                                />
                            </div>

                            <div>
                                <div className="flex items-center mb-1">
                                    <label htmlFor="voucher-prefix" className="text-gray-700 text-sm font-medium mr-2">
                                        Voucher Prefix
                                    </label>
                                    <InfoTooltip text="Letters added before the invoice number (e.g., INV-1)." />
                                </div>
                                <input
                                    type="text"
                                    id="voucher-prefix"
                                    value={settings.voucherPrefix || ''}
                                    onChange={(e) => handleChange('voucherPrefix', e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    placeholder="e.g., INV"
                                />
                            </div>

                            <div>
                                <div className="flex items-center mb-1">
                                    <label htmlFor="current-number" className="text-gray-700 text-sm font-medium mr-2">
                                        Next Voucher Number
                                    </label>
                                    <InfoTooltip text="The sequence number for the next generated invoice." />
                                </div>
                                <input
                                    type="number"
                                    id="current-number"
                                    value={settings.currentVoucherNumber ?? 1}
                                    onChange={(e) => handleChange('currentVoucherNumber', e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    placeholder="e.g., 1"
                                    min="1"
                                    step="1"
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

export default SalesSettingsPage;