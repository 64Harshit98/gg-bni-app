import React, { useState, useEffect } from 'react';
import { Spinner as ModernSpinner } from '../../Components/ui/spinner';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { ResetSettingsButton } from '../../Components/ResetSettingsButton';
import { Button } from '../../Components/ui/button';
import BackButton from '../../Components/BackButton';
import { PackageSearch, Tags, Boxes, Barcode } from 'lucide-react';
import {
    fetchItemSettings,
    saveItemSettings,
    getDefaultItemSettings,
    type ItemSettings,
} from '../../services/settings/itemSetting.service';
import { SettingsSectionCard } from './components/SettingsSectionCard';
import { SettingsToggleRow } from './components/SettingsToggleRow';

// Re-exported so existing consumers (AuthContext, SettingsContext, ItemAdd)
// that import these from this module path keep working unchanged.
export { getDefaultItemSettings };
export type { ItemSettings };

// --- Main Settings Component ---
// `theme` is retained for prop-shape/backward compatibility only — this
// component is mounted from both the POS (`theme="blue"`) and Catalogue
// (`theme="orange"`) routes via wrapper components in AppRegistry.tsx. The
// shared design system now supplies all colors, so the value is no longer
// consumed here (same pattern as `Pages/Master/ItemGroup.tsx`).
interface SharedItemSettingsProps {
    theme?: 'blue' | 'orange';
}

const SharedItemSettings: React.FC<SharedItemSettingsProps> = ({ theme }) => {
    void theme;
    const { currentUser } = useAuth();

    const [settings, setSettings] = useState<ItemSettings | null>(null);
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
                const loaded = await fetchItemSettings(currentUser.companyId!);
                setSettings(loaded);
            } catch (err) {
                console.error('Failed to load item settings:', err);
                setModal({ message: 'Failed to load settings.', type: State.ERROR });
            } finally {
                setIsLoading(false);
            }
        };

        loadSettings();
    }, [currentUser?.companyId]);

    const handleSave = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (!currentUser?.companyId || !settings) {
            setModal({ message: 'Error: Missing data.', type: State.ERROR });
            return;
        }

        setIsSaving(true);
        try {
            await saveItemSettings(currentUser.companyId, settings);
            setModal({ message: 'Item settings saved successfully!', type: State.SUCCESS });
        } catch (err) {
            console.error('Failed to save settings:', err);
            setModal({ message: 'Failed to save settings. Please try again.', type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCheckboxChange = (field: keyof ItemSettings, checked: boolean) => {
        if (settings) {
            setSettings({ ...settings, [field]: checked });
        }
    };

    if (isLoading || !settings) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-background">
                <ModernSpinner size="xl" className="text-primary" />
                <p className="mt-4 text-muted-foreground">Loading item settings...</p>
            </div>
        );
    }

    return (
        <div className="aurora relative flex min-h-screen w-full flex-col bg-background">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            <header className="glass sticky top-0 z-30 flex items-center gap-3 p-3">
                <BackButton />
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-sm shadow-primary/20">
                    <PackageSearch className="size-4" />
                </span>
                <div>
                    <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
                        Item <span className="text-gradient">Settings</span>
                    </h1>
                    <p className="text-xs text-muted-foreground">Choose which fields are required when adding items</p>
                </div>
            </header>

            <main className="w-full flex-grow overflow-y-auto p-3 pb-32 sm:p-4 md:p-5 md:pb-24">
                <form onSubmit={handleSave} className="mx-auto max-w-3xl space-y-4 md:space-y-6">
                    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between md:p-6">
                        <div>
                            <h2 className="text-base font-semibold text-foreground md:text-lg">Mandatory Fields</h2>
                            <span className="text-xs font-medium text-destructive">* Item name and MRP (or Sale Price) are always mandatory.</span>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Select which optional fields must be filled out when manually adding a single item.
                            </p>
                        </div>
                        <ResetSettingsButton<ItemSettings>
                            defaults={getDefaultItemSettings(currentUser?.companyId ?? '')}
                            onReset={setSettings}
                        />
                    </div>

                    <SettingsSectionCard icon={<Tags className="size-4" />} title="Classification & Media" contentClassName="space-y-2">
                        <SettingsToggleRow
                            id="req-category"
                            label="Require Category"
                            description="Category must be selected when adding an item."
                            tooltip="Group this item belongs to (e.g., Electronics)."
                            checked={settings.requireCategory}
                            onChange={(checked) => handleCheckboxChange('requireCategory', checked)}
                        />
                        <SettingsToggleRow
                            id="req-hsn"
                            label="Require HSN Code"
                            description="HSN/SAC code must be provided when adding an item."
                            tooltip="Harmonized System Nomenclature code for taxation."
                            checked={settings.requireHsnCode}
                            onChange={(checked) => handleCheckboxChange('requireHsnCode', checked)}
                        />
                        <SettingsToggleRow
                            id="req-image"
                            label="Require Image"
                            description="An image file or URL must be provided when adding an item."
                            tooltip="The visual representation of the product."
                            checked={settings.requireImage}
                            onChange={(checked) => handleCheckboxChange('requireImage', checked)}
                        />
                    </SettingsSectionCard>

                    <SettingsSectionCard icon={<Tags className="size-4" />} title="Pricing & Taxes" contentClassName="space-y-2">
                        <SettingsToggleRow
                            id="req-purchasePrice"
                            label="Require Purchase Price"
                            description="Purchase price must be filled when adding an item."
                            tooltip="The price you paid to acquire this item."
                            checked={settings.requirePurchasePrice}
                            onChange={(checked) => handleCheckboxChange('requirePurchasePrice', checked)}
                        />
                        <SettingsToggleRow
                            id="req-sale-discount"
                            label="Require Sale Discount (%)"
                            description="Sale discount percentage must be filled when adding an item."
                            tooltip="Default discount percentage given to customers."
                            checked={settings.requireSaleDiscount}
                            onChange={(checked) => handleCheckboxChange('requireSaleDiscount', checked)}
                        />
                        <SettingsToggleRow
                            id="req-purchase-discount"
                            label="Require Purchase Discount (%)"
                            description="Purchase discount percentage must be filled when adding an item."
                            tooltip="Discount percentage received from the supplier."
                            checked={settings.requirePurchaseDiscount}
                            onChange={(checked) => handleCheckboxChange('requirePurchaseDiscount', checked)}
                        />
                        <SettingsToggleRow
                            id="req-tax"
                            label="Require Tax (%)"
                            description="Tax percentage must be filled when adding an item."
                            tooltip="Applicable tax percentage for this item."
                            checked={settings.requireTax}
                            onChange={(checked) => handleCheckboxChange('requireTax', checked)}
                        />
                    </SettingsSectionCard>

                    <SettingsSectionCard icon={<Boxes className="size-4" />} title="Inventory & Measurement" contentClassName="space-y-2">
                        <SettingsToggleRow
                            id="req-stock"
                            label="Require Opening Stock"
                            description="Initial stock quantity must be entered when adding an item."
                            tooltip="Current available quantity in your inventory."
                            checked={settings.requireStock}
                            onChange={(checked) => handleCheckboxChange('requireStock', checked)}
                        />
                        <SettingsToggleRow
                            id="req-restock"
                            label="Require Restock Level"
                            description="Restock alert quantity must be set when adding an item."
                            tooltip="Minimum stock level to trigger a reorder alert."
                            checked={settings.requireRestockQuantity}
                            onChange={(checked) => handleCheckboxChange('requireRestockQuantity', checked)}
                        />
                        <SettingsToggleRow
                            id="req-moq"
                            label="Require MOQ"
                            description="Minimum Order Quantity must be specified when adding an item."
                            tooltip="Minimum Item Quantity to be ordered."
                            checked={settings.requireMoq}
                            onChange={(checked) => handleCheckboxChange('requireMoq', checked)}
                        />
                        <SettingsToggleRow
                            id="req-unit"
                            label="Require Unit"
                            description="Unit of measurement (e.g., pcs, box) must be selected."
                            tooltip="Measurement unit (e.g., pieces, box, kg)."
                            checked={settings.requireUnit}
                            onChange={(checked) => handleCheckboxChange('requireUnit', checked)}
                        />
                    </SettingsSectionCard>

                    <SettingsSectionCard icon={<Barcode className="size-4" />} title="Barcode Handling" contentClassName="space-y-2">
                        <SettingsToggleRow
                            id="req-barcode"
                            label="Require Manual Barcode Input"
                            description="Barcode must be manually scanned or typed when adding an item."
                            tooltip="Unique identifier for scanning the product."
                            checked={settings.requireBarcode}
                            onChange={(checked) => handleCheckboxChange('requireBarcode', checked)}
                        />
                        <SettingsToggleRow
                            id="auto-barcode"
                            label="Automatically Generate Barcode"
                            description="A unique barcode will be generated if the barcode field is left blank."
                            checked={settings.autoGenerateBarcode}
                            onChange={(checked) => handleCheckboxChange('autoGenerateBarcode', checked)}
                        />
                    </SettingsSectionCard>
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

export default SharedItemSettings;
