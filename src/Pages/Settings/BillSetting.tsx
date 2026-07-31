import React, { useState, useEffect, useRef } from 'react';
import type SignatureCanvas from 'react-signature-canvas';
import { useNavigate } from 'react-router';
import { Receipt, CreditCard, MessageSquare, ScrollText } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { State } from '../../enums';
import { Modal } from '../../constants/Modal';
import BackButton from '../../Components/BackButton';
import { Input } from '../../Components/ui/input';
import { Label } from '../../Components/ui/label';
import { Textarea } from '../../Components/ui/textarea';
import { Button } from '../../Components/ui/button';
import { Spinner } from '../../Components/ui/spinner';
import {
    fetchBillSettings,
    saveBillSettings,
    getDefaultBillSettings,
    type BillSettingsData,
    type BusinessInfoData,
} from '../../services/settings/billSetting.service';
import { SettingsSectionCard } from './components/SettingsSectionCard';
import { BillCompanyInfoCard } from './components/BillCompanyInfoCard';
import { BillPrintPreferencesCard } from './components/BillPrintPreferencesCard';
import { BillSignatureCard } from './components/BillSignatureCard';

// Re-exported for any external code depending on the previous module shape.
export type { BillSettingsData };

const DEFAULT_BUSINESS_INFO: BusinessInfoData = {
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

const BillSettings: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const sigPadRef = useRef<SignatureCanvas>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    const [businessInfo, setBusinessInfo] = useState<BusinessInfoData>(DEFAULT_BUSINESS_INFO);
    const [settings, setSettings] = useState<BillSettingsData>(getDefaultBillSettings());

    // --- 1. Load Data with Priority Fallback ---
    useEffect(() => {
        const loadData = async () => {
            if (!currentUser?.companyId) return;

            try {
                setIsLoading(true);
                const { businessInfo: loadedBusinessInfo, settings: loadedSettings } = await fetchBillSettings(
                    currentUser.companyId,
                    currentUser.uid,
                );

                setBusinessInfo(loadedBusinessInfo);
                setSettings(loadedSettings);

                if (loadedSettings.signatureBase64) {
                    setTimeout(() => {
                        sigPadRef.current?.fromDataURL(loadedSettings.signatureBase64 as string);
                    }, 200);
                }
            } catch (error) {
                console.error('Error fetching bill settings:', error);
                setModal({ message: 'Failed to load settings.', type: State.ERROR });
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [currentUser]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setSettings((prev) => ({ ...prev, [name]: value }));
    };

    const clearSignature = () => {
        sigPadRef.current?.clear();
        setSettings((prev) => ({ ...prev, signatureBase64: '' }));
    };

    // --- 2. Save Data ---
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

            await saveBillSettings(currentUser.companyId, { ...settings, signatureBase64: currentSignature }, businessInfo);

            setSettings((prev) => ({ ...prev, signatureBase64: currentSignature }));
            setModal({ message: 'Bill settings saved successfully!', type: State.SUCCESS });
        } catch (error) {
            console.error('Error saving bill settings:', error);
            setModal({ message: 'Failed to save settings.', type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Spinner size="xl" className="text-primary" />
                <span className="ml-3 font-medium text-muted-foreground">Loading settings...</span>
            </div>
        );
    }

    return (
        <div className="aurora relative min-h-screen bg-background pb-28">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            <header className="glass sticky top-0 z-20 flex items-center gap-2 p-3">
                <BackButton />
                <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-sm shadow-primary/20">
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

            <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
                <BillCompanyInfoCard businessInfo={businessInfo} onEditProfile={() => navigate('/edit-profile')} />

                <SettingsSectionCard
                    icon={<CreditCard className="size-4" />}
                    title="Payment"
                    description="UPI ID displayed on invoices for quick payments."
                >
                    <div className="max-w-sm space-y-1.5">
                        <Label htmlFor="upiId">UPI ID</Label>
                        <Input
                            id="upiId"
                            type="text"
                            name="upiId"
                            value={settings.upiId || ''}
                            onChange={handleChange}
                            placeholder="e.g. yourname@upi"
                        />
                    </div>
                </SettingsSectionCard>

                <BillPrintPreferencesCard
                    printFormat={settings.printFormat ?? 'A4'}
                    onPrintFormatChange={(value) => setSettings((prev) => ({ ...prev, printFormat: value }))}
                    enableTriplicate={!!settings.enableTriplicate}
                    onTriplicateChange={(value) => setSettings((prev) => ({ ...prev, enableTriplicate: value }))}
                    discountDisplayFormat={settings.discountDisplayFormat ?? 'amount'}
                    onDiscountFormatChange={(value) => setSettings((prev) => ({ ...prev, discountDisplayFormat: value }))}
                />

                <BillSignatureCard sigPadRef={sigPadRef} onClear={clearSignature} />

                <SettingsSectionCard
                    icon={<MessageSquare className="size-4" />}
                    title="WhatsApp Message"
                    description="Add an extra message to send along with your invoices on WhatsApp."
                >
                    <Textarea
                        name="whatsappExtraMessage"
                        value={settings.whatsappExtraMessage || ''}
                        onChange={handleChange}
                        placeholder="e.g., Thank you for shopping with us! Please leave a Google review."
                        rows={3}
                        className="text-sm leading-relaxed"
                    />
                </SettingsSectionCard>

                <SettingsSectionCard
                    icon={<ScrollText className="size-4" />}
                    title="Terms & Conditions"
                    description="Printed at the footer of every invoice."
                >
                    <Textarea
                        name="termsAndConditions"
                        value={settings.termsAndConditions}
                        onChange={handleChange}
                        rows={5}
                        className="text-sm leading-relaxed"
                    />
                </SettingsSectionCard>
            </main>

            {/* Floating Save Button */}
            <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center bg-transparent p-4 md:px-8">
                <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    size="lg"
                    className="min-w-[160px] gap-2 bg-gradient-brand text-white shadow-lg shadow-primary/20 hover:opacity-90"
                >
                    {isSaving && <Spinner size="sm" />}
                    {isSaving ? 'Saving...' : 'Save Settings'}
                </Button>
            </div>
        </div>
    );
};

export default BillSettings;
