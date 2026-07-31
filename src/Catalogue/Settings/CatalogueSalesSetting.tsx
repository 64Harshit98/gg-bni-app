import React, { useEffect, useState } from 'react';
import { Receipt, Save } from 'lucide-react';

import BackButton from '../../Components/BackButton';
import { Button } from '../../Components/ui/button';
import { Spinner as ModernSpinner } from '../../Components/ui/spinner';
import { useAuth } from '../../context/auth-context';
import { toast } from '../../lib/toast';
import {
  fetchBusinessGstin,
  fetchOrCreateCatalogueSalesSettings,
  saveBusinessGstin,
  saveCatalogueSalesSettings,
} from '../../services/settings/catalogueSalesSetting.service';
import type { CatalogueSalesSettings } from './catalogueSalesSetting.types';
import { CustomerAccessSection } from './components/CustomerAccessSection';
import { GstNumberDialog } from './components/GstNumberDialog';
import { InventoryStockSection } from './components/InventoryStockSection';
import { OrderDeliverySection } from './components/OrderDeliverySection';
import { PricingTaxSection } from './components/PricingTaxSection';
import { VoucherNumberingSection } from './components/VoucherNumberingSection';

export type { CatalogueSalesSettings } from './catalogueSalesSetting.types';
export { getDefaultCatalogueSalesSettings } from './catalogueSalesSetting.types';

const NUMERIC_FIELDS: (keyof CatalogueSalesSettings)[] = [
  'defaultCartQuantity',
  'minimumOrderValue',
  'currentVoucherNumber',
  'roundingInterval',
];

const CatalogueSalesSettingsPage: React.FC = () => {
  const { currentUser } = useAuth();

  const [settings, setSettings] = useState<CatalogueSalesSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // GST number prompt state
  const [showGstModal, setShowGstModal] = useState<boolean>(false);
  const [gstNumberInput, setGstNumberInput] = useState<string>('');
  const [pendingGstScheme, setPendingGstScheme] = useState<'regular' | 'composition' | null>(null);
  const [isSavingGst, setIsSavingGst] = useState<boolean>(false);

  useEffect(() => {
    if (!currentUser?.companyId) {
      setIsLoading(true);
      return;
    }

    let cancelled = false;
    const companyId = currentUser.companyId;

    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchOrCreateCatalogueSalesSettings(companyId);
        if (!cancelled) setSettings(data);
      } catch (err) {
        console.error('Failed to fetch/create catalogue sales settings:', err);
        if (!cancelled) toast.error('Failed to load settings.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.companyId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser?.companyId || !settings) {
      toast.error('Error: Missing data.');
      return;
    }

    setIsSaving(true);
    try {
      await saveCatalogueSalesSettings(currentUser.companyId, settings);
      toast.success('Settings saved successfully!');
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof CatalogueSalesSettings, value: string | number | boolean) => {
    if (!settings) return;

    if (NUMERIC_FIELDS.includes(field)) {
      const numValue = parseFloat(String(value));
      setSettings({ ...settings, [field]: isNaN(numValue) ? 0 : Math.max(0, numValue) });
    } else {
      setSettings({ ...settings, [field]: value });
    }
  };

  const handleCheckboxChange = (field: keyof CatalogueSalesSettings, checked: boolean) => {
    if (settings) {
      setSettings({ ...settings, [field]: checked });
    }
  };

  // Checks business_info for an existing GST number before allowing scheme change
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

  const handleGstSchemeSelect = (value: NonNullable<CatalogueSalesSettings['gstScheme']>) => {
    if (value !== 'none' && settings?.gstScheme === 'none') {
      checkAndPromptGst(value as 'regular' | 'composition');
    } else {
      handleChange('gstScheme', value);
    }
  };

  const handleGstDialogOpenChange = (open: boolean) => {
    if (isSavingGst) return;
    setShowGstModal(open);
    if (!open) setPendingGstScheme(null);
  };

  // Saves entered GST number to business_info and applies the pending scheme
  const handleGstNumberSave = async () => {
    if (!currentUser?.companyId || !pendingGstScheme) return;
    const trimmed = gstNumberInput.trim().toUpperCase();

    if (trimmed.length !== 15) {
      toast.error('GST number must be exactly 15 characters.');
      return;
    }

    setIsSavingGst(true);
    try {
      await saveBusinessGstin(currentUser.companyId, trimmed);
      handleChange('gstScheme', pendingGstScheme);
      setShowGstModal(false);
      setPendingGstScheme(null);
    } catch (err) {
      console.error('Failed to save GST number:', err);
      toast.error('Failed to save GST number.');
    } finally {
      setIsSavingGst(false);
    }
  };

  if (isLoading || !settings) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <ModernSpinner size="xl" />
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="aurora flex min-h-screen w-full flex-col bg-muted">
      <header className="glass sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 p-3 md:p-4">
        <BackButton />
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-md shadow-primary/20">
            <Receipt className="size-4" />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
              Sales <span className="text-gradient">Settings</span>
            </h1>
            <p className="text-xs text-muted-foreground">Configure catalogue ordering, pricing and tax rules</p>
          </div>
        </div>
      </header>

      <main className="w-full flex-grow overflow-y-auto p-3 pb-28 sm:p-4 md:p-5 md:pb-24">
        <form onSubmit={handleSave} className="mx-auto max-w-5xl space-y-5">
          <InventoryStockSection settings={settings} onToggle={handleCheckboxChange} />

          <CustomerAccessSection settings={settings} onToggle={handleCheckboxChange} />

          <PricingTaxSection
            settings={settings}
            onToggle={handleCheckboxChange}
            onTaxTypeChange={(value) => handleChange('taxType', value)}
            onGstSchemeSelect={handleGstSchemeSelect}
          />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <OrderDeliverySection settings={settings} onChange={handleChange} onToggle={handleCheckboxChange} />
            <VoucherNumberingSection settings={settings} onChange={handleChange} />
          </div>
        </form>
      </main>

      {/* Sticky save bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-16 z-40 px-4 pb-2 md:bottom-0 md:p-4">
        <div className="pointer-events-auto mx-auto flex max-w-2xl justify-center">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="lg"
            className="min-w-[170px] gap-2 bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
          >
            {isSaving ? <ModernSpinner size="sm" /> : <Save className="size-4" />}
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>

      <GstNumberDialog
        open={showGstModal}
        onOpenChange={handleGstDialogOpenChange}
        value={gstNumberInput}
        onValueChange={setGstNumberInput}
        onConfirm={handleGstNumberSave}
        saving={isSavingGst}
      />
    </div>
  );
};

export default CatalogueSalesSettingsPage;
