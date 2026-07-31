import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import type SignatureCanvas from 'react-signature-canvas';
import { Receipt, Save } from 'lucide-react';
import BackButton from '../../Components/BackButton';
import { Button } from '../../Components/ui/button';
import { Spinner as ModernSpinner } from '../../Components/ui/spinner';
import { useAuth } from '../../context/auth-context';
import { toast } from '../../lib/toast';
import {
  fetchCatalogueBillSettings,
  saveCatalogueBillSettings,
  type BillSettingsData,
  type BusinessInfoData,
} from '../../services/settings/catalogueBillSetting.service';
import { BillCompanyDetailsCard } from './components/BillCompanyDetailsCard';
import { BillPaymentSection } from './components/BillPaymentSection';
import { BillPrintPreferencesSection } from './components/BillPrintPreferencesSection';
import { BillSignatureSection } from './components/BillSignatureSection';
import { BillMessagingSection } from './components/BillMessagingSection';

const DEFAULT_TERMS =
  '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged if payment is delayed.\n3. Subject to local Jurisdiction only.';

const EMPTY_BUSINESS_INFO: BusinessInfoData = {
  companyName: '',
  address: '',
  phone: '',
  email: '',
  gstin: '',
  panNumber: '',
  msmeNumber: '',
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  ifscCode: '',
  companyLogo: '',
};

const CatalogueBillSettings: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const sigPadRef = useRef<SignatureCanvas | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [businessInfo, setBusinessInfo] = useState<BusinessInfoData>(EMPTY_BUSINESS_INFO);

  const [settings, setSettings] = useState<BillSettingsData>({
    printFormat: 'A4',
    upiId: '',
    termsAndConditions: DEFAULT_TERMS,
    signatureBase64: '',
    whatsappExtraMessage: '',
    enableTriplicate: false,
    discountDisplayFormat: 'amount',
  });

  // --- Load data ---
  useEffect(() => {
    if (!currentUser?.companyId) return;
    let cancelled = false;
    const companyId = currentUser.companyId;
    const userId = currentUser.uid;

    const load = async () => {
      try {
        setIsLoading(true);
        const bundle = await fetchCatalogueBillSettings(companyId, userId);
        if (cancelled) return;

        setBusinessInfo(bundle.businessInfo);
        setSettings(bundle.settings);

        // Load signature after the component has mounted and the canvas is ready.
        if (bundle.settings.signatureBase64) {
          setTimeout(() => {
            sigPadRef.current?.fromDataURL(bundle.settings.signatureBase64 as string);
          }, 200);
        }
      } catch (error) {
        console.error('Error fetching bill settings:', error);
        if (!cancelled) toast.error('Failed to load settings.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const clearSignature = () => {
    sigPadRef.current?.clear();
    setSettings((prev) => ({ ...prev, signatureBase64: '' }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.companyId) return;

    try {
      setIsSaving(true);

      let currentSignature = settings.signatureBase64;
      if (sigPadRef.current && !sigPadRef.current.isEmpty()) {
        currentSignature = sigPadRef.current.getCanvas().toDataURL('image/png');
      } else if (sigPadRef.current && sigPadRef.current.isEmpty()) {
        currentSignature = '';
      }

      await saveCatalogueBillSettings(currentUser.companyId, {
        upiId: settings.upiId,
        signatureBase64: currentSignature,
        enableTriplicate: settings.enableTriplicate || false,
        termsAndConditions: settings.termsAndConditions,
        printFormat: settings.printFormat || 'A4',
        whatsappExtraMessage: settings.whatsappExtraMessage,
        discountDisplayFormat: settings.discountDisplayFormat || 'amount',
        businessInfo: {
          gstin: businessInfo.gstin,
          panNumber: businessInfo.panNumber,
          msmeNumber: businessInfo.msmeNumber,
          accountHolderName: businessInfo.accountHolderName,
          accountNumber: businessInfo.accountNumber,
          bankName: businessInfo.bankName,
          ifscCode: businessInfo.ifscCode,
        },
      });

      setSettings((prev) => ({ ...prev, signatureBase64: currentSignature }));
      toast.success('Bill settings saved successfully!');
    } catch (error) {
      console.error('Error saving bill settings:', error);
      toast.error('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
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
              Invoice <span className="text-gradient">Configuration</span>
            </h1>
            <p className="text-xs text-muted-foreground">Manage details printed on your bills</p>
          </div>
        </div>
      </header>

      <main className="w-full flex-grow overflow-y-auto p-3 pb-28 sm:p-4 md:p-5 md:pb-24">
        <form onSubmit={handleSave} className="mx-auto max-w-5xl space-y-5">
          <BillCompanyDetailsCard
            businessInfo={businessInfo}
            onEditProfile={() => navigate('/catalogue-home/cata-edit-profile')}
          />

          <BillPaymentSection
            upiId={settings.upiId || ''}
            onUpiIdChange={(value) => setSettings((prev) => ({ ...prev, upiId: value }))}
          />

          <BillPrintPreferencesSection
            printFormat={settings.printFormat || 'A4'}
            onPrintFormatChange={(value) => setSettings((prev) => ({ ...prev, printFormat: value }))}
            enableTriplicate={settings.enableTriplicate || false}
            onToggleTriplicate={(checked) => setSettings((prev) => ({ ...prev, enableTriplicate: checked }))}
            discountDisplayFormat={settings.discountDisplayFormat || 'amount'}
            onDiscountDisplayFormatChange={(value) =>
              setSettings((prev) => ({ ...prev, discountDisplayFormat: value }))
            }
          />

          <BillSignatureSection sigPadRef={sigPadRef} onClear={clearSignature} />

          <BillMessagingSection
            whatsappExtraMessage={settings.whatsappExtraMessage || ''}
            onWhatsappExtraMessageChange={(value) =>
              setSettings((prev) => ({ ...prev, whatsappExtraMessage: value }))
            }
            termsAndConditions={settings.termsAndConditions}
            onTermsAndConditionsChange={(value) => setSettings((prev) => ({ ...prev, termsAndConditions: value }))}
          />
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
    </div>
  );
};

export default CatalogueBillSettings;
