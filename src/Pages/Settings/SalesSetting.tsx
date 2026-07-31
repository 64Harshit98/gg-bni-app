import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Settings2 } from 'lucide-react';

import { Spinner } from '../../Components/ui/spinner';
import { Button } from '../../Components/ui/button';
import { Permissions } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { toast } from '../../lib/toast';
import ShowWrapper from '../../context/ShowWrapper';
import BackButton from '../../Components/BackButton';
import {
  fetchOrCreateSalesSettings,
  saveSalesSettings,
  fetchInvoiceCounter,
  fetchBusinessGstin,
  saveBusinessGstin,
} from '../../services/settings/salesSetting.service';
import { SalesDisplaySection } from './components/SalesDisplaySection';
import { SalesPricingTaxSection } from './components/SalesPricingTaxSection';
import { SalesOrderDeliverySection } from './components/SalesOrderDeliverySection';
import { SalesCustomerAccessSection } from './components/SalesCustomerAccessSection';
import { SalesVoucherNumberingSection } from './components/SalesVoucherNumberingSection';
import { SalesGstNumberDialog } from './components/SalesGstNumberDialog';

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
    enableDiscount2?: boolean;
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
    enableTransportDetails?: boolean;
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
    cartInsertionOrder: 'top',
    hideMrp: false,
    enableItemWiseDiscount: true,
    enableDiscount2: false,
    lockDiscountEntry: false,
    lockSalePriceEntry: false,
    defaultDiscount: 0,
    allowNegativeStock: true,
    allowDueBilling: true,
    requireCustomerName: false,
    requireCustomerMobile: false,
    voucherName: 'Invoice',
    voucherPrefix: 'INV',
    currentVoucherNumber: 1,
    copyVoucherAfterSaving: false,
    enableShippingDetails: false,
    enableExtraExpense: false,
    enableNarration: false,
    enableTransportDetails: false,
});

const SalesSettingsPage = () => {
    const { currentUser } = useAuth();

    const [settings, setSettings] = useState<SalesSettings | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // GST number prompt states
    const [showGstModal, setShowGstModal] = useState<boolean>(false);
    const [gstNumberInput, setGstNumberInput] = useState<string>('');
    const [pendingGstScheme, setPendingGstScheme] = useState<'regular' | 'composition' | null>(null);

    const activePlan = currentUser?.Subscription?.pack?.toLowerCase() || 'basic';
    // Added safe fallback for basic plan keying to prevent undefined errors
    const allowedFeatures = PLAN_ALLOWED_FEATURES[activePlan] || PLAN_ALLOWED_FEATURES['pos_basic'] || { allowedViews: ['list'] };

    useEffect(() => {
        if (!currentUser?.companyId) {
            setIsLoading(true);
            return;
        }

        const companyId = currentUser.companyId;

        const load = async () => {
            setIsLoading(true);
            try {
                const defaults = getDefaultSalesSettings(companyId);
                const { settings: dbSettings, counterNumber } = await fetchOrCreateSalesSettings(companyId, defaults);

                // APPLY PLAN MASK TO UI ONLY (Never deletes backend data)
                const validView = allowedFeatures.allowedViews?.includes(dbSettings.salesViewType || 'list')
                    ? dbSettings.salesViewType
                    : (allowedFeatures.allowedViews?.[0] || 'list');

                setSettings({
                    ...dbSettings,
                    salesViewType: validView,
                    currentVoucherNumber: counterNumber,
                } as SalesSettings);
            } catch (err) {
                console.error('Failed to fetch/create sales settings:', err);
                toast.error('Failed to load settings.');
            } finally {
                setIsLoading(false);
            }
        };

        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.companyId, activePlan]);

    useEffect(() => {
        if (settings?.gstScheme === 'composition') {
            if (settings.taxType !== 'inclusive') {
                setSettings(prev => prev ? ({ ...prev, taxType: 'inclusive' }) : null);
            }
        }
    }, [settings?.gstScheme, settings?.taxType]);

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();

        if (!currentUser?.companyId || !settings) {
            toast.error('Error: Missing data.');
            return;
        }

        setIsSaving(true);
        try {
            const companyId = currentUser.companyId;
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

            await saveSalesSettings(companyId, settingsToSave, currentVoucherNumber ?? 1);

            toast.success('Settings saved successfully!');
        } catch (err) {
            console.error('Failed to save settings:', err);
            toast.error('Failed to save settings. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetVoucher = async () => {
        if (!settings || !currentUser?.companyId) return;

        try {
            const backendCounter = await fetchInvoiceCounter(currentUser.companyId);
            setSettings({
                ...settings,
                voucherName: 'Invoice',
                voucherPrefix: 'INV',
                currentVoucherNumber: backendCounter
            });
        } catch (error) {
            console.error('Failed to fetch backend counter for reset:', error);
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

    const checkAndPromptGst = async (newScheme: 'regular' | 'composition') => {
        if (!currentUser?.companyId) return;
        try {
            const existingGst = await fetchBusinessGstin(currentUser.companyId);

            if (!existingGst) {
                setPendingGstScheme(newScheme);
                setGstNumberInput('');
                setShowGstModal(true);
            } else {
                handleChange('gstScheme', newScheme);
            }
        } catch (err) {
            console.error('Failed to check business GST info:', err);
            toast.error('Failed to verify GST details.');
        }
    };

    const handleGstNumberSave = async () => {
        if (!currentUser?.companyId || !pendingGstScheme) return;
        const trimmed = gstNumberInput.trim().toUpperCase();

        if (trimmed.length !== 15) {
            toast.error('GST number must be exactly 15 characters.');
            return;
        }

        try {
            await saveBusinessGstin(currentUser.companyId, trimmed);

            handleChange('gstScheme', pendingGstScheme);
            setShowGstModal(false);
            setPendingGstScheme(null);
        } catch (err) {
            console.error('Failed to save GST number:', err);
            toast.error('Failed to save GST number.');
        }
    };

    if (isLoading || !settings) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center">
                <Spinner size="xl" />
                <p className="mt-4 text-muted-foreground">Loading settings...</p>
            </div>
        );
    }

    return (
        <div className="aurora flex min-h-screen w-full flex-col bg-muted">
            <SalesGstNumberDialog
                open={showGstModal}
                value={gstNumberInput}
                onValueChange={setGstNumberInput}
                onCancel={() => { setShowGstModal(false); setPendingGstScheme(null); }}
                onSave={handleGstNumberSave}
            />

            <header className="glass sticky top-0 z-30 mx-3 mt-3 flex flex-shrink-0 items-center justify-between gap-3 rounded-2xl p-3 shadow-sm">
                <div className="flex items-center gap-3">
                    <BackButton />
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-md shadow-primary/25">
                        <Settings2 className="size-4" />
                    </span>
                    <div>
                        <h1 className="text-base font-bold tracking-tight text-foreground md:text-lg">
                            Sales <span className="text-gradient">Settings</span>
                        </h1>
                        <p className="text-xs text-muted-foreground">Configure billing behavior and defaults</p>
                    </div>
                </div>
            </header>

            <main className="w-full flex-grow overflow-y-auto p-3 pb-44 sm:p-4 md:p-5 md:pb-24">
                <form onSubmit={handleSave} className="mx-auto max-w-5xl space-y-5">
                    <div className="space-y-5">
                        <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                            <SalesDisplaySection
                                settings={settings}
                                defaultSettings={getDefaultSalesSettings(currentUser?.companyId ?? '')}
                                onChange={handleChange}
                                onCheckboxChange={handleCheckboxChange}
                                onResetSettings={setSettings}
                            />
                            <SalesPricingTaxSection
                                settings={settings}
                                onChange={handleChange}
                                onCheckboxChange={handleCheckboxChange}
                                onGstSchemeSelect={checkAndPromptGst}
                            />
                        </ShowWrapper>

                        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                            <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
                                <SalesOrderDeliverySection settings={settings} onCheckboxChange={handleCheckboxChange} />
                            </ShowWrapper>
                            <SalesCustomerAccessSection settings={settings} onCheckboxChange={handleCheckboxChange} />
                        </div>
                    </div>

                    <SalesVoucherNumberingSection
                        settings={settings}
                        onChange={handleChange}
                        onResetVoucher={handleResetVoucher}
                    />
                </form>
            </main>

            <div className="pointer-events-none fixed inset-x-0 bottom-16 z-40 bg-transparent px-4 pb-2 md:bottom-0 md:p-4">
                <div className="pointer-events-auto mx-auto flex max-w-2xl justify-center gap-4">
                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        size="lg"
                        className="min-w-[150px] gap-2 bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
                    >
                        {isSaving ? <Spinner size="sm" /> : null}
                        Save Settings
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default SalesSettingsPage;
