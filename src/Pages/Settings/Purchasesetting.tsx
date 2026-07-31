import React, { useState, useEffect } from 'react';
import { Spinner as ModernSpinner } from '../../Components/ui/spinner';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { ShoppingBag, ToggleRight, ClipboardCheck } from 'lucide-react';
import { ResetSettingsButton } from '../../Components/ResetSettingsButton';
import { Button } from '../../Components/ui/button';
import BackButton from '../../Components/BackButton';
import {
    fetchPurchaseSettings,
    savePurchaseSettings,
    fetchPurchaseVoucherCounter,
    getDefaultPurchaseSettings,
    type PurchaseSettings,
} from '../../services/settings/purchaseSetting.service';
import { SettingsSectionCard } from './components/SettingsSectionCard';
import { SettingsToggleRow } from './components/SettingsToggleRow';
import { PurchaseDisplaySettingsCard } from './components/PurchaseDisplaySettingsCard';
import { PurchaseVoucherNumberingCard } from './components/PurchaseVoucherNumberingCard';

// Re-exported so existing consumers (AuthContext, SettingsContext,
// Purchase.tsx, PurchaseReturn.tsx) that import these from this module path
// keep working unchanged.
export { getDefaultPurchaseSettings };
export type { PurchaseSettings };

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

        const loadSettings = async () => {
            setIsLoading(true);
            try {
                const loaded = await fetchPurchaseSettings(currentUser.companyId!);
                setSettings(loaded);
            } catch (err) {
                console.error('Failed to fetch/create purchase settings:', err);
                setModal({ message: 'Failed to load settings.', type: State.ERROR });
            } finally {
                setIsLoading(false);
            }
        };

        loadSettings();
    }, [currentUser?.companyId]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!currentUser?.companyId || !settings) {
            setModal({ message: 'Error: Missing data.', type: State.ERROR });
            return;
        }

        setIsSaving(true);
        try {
            await savePurchaseSettings(currentUser.companyId, settings);
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
            const backendCounter = await fetchPurchaseVoucherCounter(currentUser.companyId);
            setSettings({
                ...settings,
                voucherName: 'Purchase',
                voucherPrefix: 'PUR',
                currentVoucherNumber: backendCounter,
            });
        } catch (error) {
            console.error('Failed to fetch backend counter for reset:', error);
            setSettings({
                ...settings,
                voucherName: 'Purchase',
                voucherPrefix: 'PUR',
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
            <div className="flex min-h-screen flex-col items-center justify-center bg-background">
                <ModernSpinner size="xl" className="text-primary" />
                <p className="mt-4 text-muted-foreground">Loading settings...</p>
            </div>
        );
    }

    return (
        <div className="aurora relative flex min-h-screen w-full flex-col bg-background">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            <header className="glass sticky top-0 z-30 flex items-center gap-3 p-3">
                <BackButton />
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-sm shadow-primary/20">
                    <ShoppingBag className="size-4" />
                </span>
                <div>
                    <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
                        Purchase <span className="text-gradient">Settings</span>
                    </h1>
                    <p className="text-xs text-muted-foreground">Configure how purchases are entered and numbered</p>
                </div>
            </header>

            <main className="w-full flex-grow overflow-y-auto p-3 pb-32 sm:p-4 md:p-5 md:pb-24">
                <form onSubmit={handleSave} className="mx-auto max-w-5xl space-y-4">
                    <PurchaseDisplaySettingsCard
                        purchaseViewType={settings.purchaseViewType}
                        onViewTypeChange={(value) => handleChange('purchaseViewType', value)}
                        cardViewWithPhoto={!!settings.cardViewWithPhoto}
                        onCardPhotoChange={(value) => handleCheckboxChange('cardViewWithPhoto', value)}
                        cartInsertionOrder={settings.cartInsertionOrder ?? 'top'}
                        onCartOrderChange={(value) => handleChange('cartInsertionOrder', value)}
                        action={
                            <ResetSettingsButton<PurchaseSettings>
                                defaults={getDefaultPurchaseSettings(currentUser?.companyId ?? '')}
                                onReset={setSettings}
                            />
                        }
                    />

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <SettingsSectionCard icon={<ToggleRight className="size-4" />} title="Defaults & Behavior" contentClassName="space-y-2">
                            <SettingsToggleRow
                                id="print-barcode"
                                label="Enable Barcode Printing Option"
                                description="Show an option to print barcodes after saving a purchase."
                                tooltip="Show an option to print barcodes after saving a purchase."
                                checked={settings.enableBarcodePrinting}
                                onChange={(checked) => handleCheckboxChange('enableBarcodePrinting', checked)}
                            />
                            <SettingsToggleRow
                                id="item-discount-2"
                                label="Enable Second Discount (Disc2)"
                                description="Show a second discount field, applied on top of Disc1."
                                tooltip="Adds a compounding second discount field (Disc2%) in the purchase cart, on top of the existing item discount."
                                checked={settings.enableDiscount2 ?? false}
                                onChange={(checked) => handleCheckboxChange('enableDiscount2', checked)}
                            />
                        </SettingsSectionCard>

                        <SettingsSectionCard icon={<ClipboardCheck className="size-4" />} title="Required Fields" contentClassName="space-y-2">
                            <SettingsToggleRow
                                id="req-supplier-name"
                                label="Require Supplier Name"
                                description="Force entering a supplier name before saving."
                                tooltip="Force entering a supplier name before saving the purchase."
                                checked={settings.requireSupplierName}
                                onChange={(checked) => handleCheckboxChange('requireSupplierName', checked)}
                            />
                            <SettingsToggleRow
                                id="req-supplier-mobile"
                                label="Require Supplier Mobile"
                                description="Force entering a supplier mobile number before saving."
                                tooltip="Force entering a supplier mobile number before saving."
                                checked={settings.requireSupplierMobile}
                                onChange={(checked) => handleCheckboxChange('requireSupplierMobile', checked)}
                            />
                        </SettingsSectionCard>
                    </div>

                    <PurchaseVoucherNumberingCard
                        voucherName={settings.voucherName}
                        voucherPrefix={settings.voucherPrefix}
                        currentVoucherNumber={settings.currentVoucherNumber}
                        onVoucherPrefixChange={(value) => handleChange('voucherPrefix', value)}
                        onCurrentVoucherNumberChange={(value) => handleChange('currentVoucherNumber', value)}
                        onResetClick={handleResetVoucher}
                    />
                </form>
            </main>

            <div className="fixed inset-x-0 bottom-16 z-40 bg-transparent px-4 pb-2 md:bottom-0 md:p-4">
                <div className="mx-auto flex max-w-2xl justify-center gap-4">
                    <Button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        size="lg"
                        className="min-w-[160px] gap-2 bg-gradient-brand text-white shadow-lg shadow-primary/20 hover:opacity-90"
                    >
                        {isSaving && <ModernSpinner size="sm" />}
                        {isSaving ? 'Saving...' : 'Save Settings'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default PurchaseSettingsPage;
