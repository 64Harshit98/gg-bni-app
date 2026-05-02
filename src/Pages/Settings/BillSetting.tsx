import React, { useState, useEffect, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { db } from '../../lib/Firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { State } from '../../enums';
import { Modal } from '../../constants/Modal';
import { IconClose } from '../../constants/Icons';
import { useNavigate } from 'react-router';

// --- Interfaces ---
export interface BillSettingsData {
    upiId?: string;
    termsAndConditions: string;
    signatureBase64?: string;
    printFormat?: 'A4' | 'THERMAL58';
}

interface BusinessInfoData {
    companyName: string;
    address: string;
    phone: string;
    email: string;
    // Tax
    gstin: string;
    panNumber: string;
    msmeNumber: string;
    // Bank
    bankName: string;
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
    // Branding
    companyLogo: string;
}

const BillSettings: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const sigPadRef = useRef<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    const [businessInfo, setBusinessInfo] = useState<BusinessInfoData>({
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
    });

    const [settings, setSettings] = useState<BillSettingsData>({
        upiId: '',
        termsAndConditions: '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged if payment is delayed.\n3. Subject to local Jurisdiction only.',
        signatureBase64: '',
        printFormat: 'A4'
    });

    const formatAddress = (addr: any): string => {
        if (!addr) return 'Not Set';
        if (typeof addr === 'string') return addr;
        const { streetAddress, city, state, postalCode, zipCode, pincode } = addr;
        const parts = [streetAddress, city, state].filter(part => part && part.trim() !== '');
        let fullAddress = parts.join(', ');
        const code = postalCode || zipCode || pincode;
        if (code) fullAddress += ` - ${code}`;
        return fullAddress;
    };

    // --- 1. Load Data with Priority Fallback ---
    useEffect(() => {
        const fetchData = async () => {
            if (!currentUser?.companyId) return;

            try {
                setIsLoading(true);
                const companyId = currentUser.companyId;

                const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);
                const settingsDocRef = doc(db, 'companies', companyId, 'settings', 'bill');

                const [businessSnap, settingsSnap] = await Promise.all([
                    getDoc(businessDocRef),
                    getDoc(settingsDocRef)
                ]);

                const bData = businessSnap.exists() ? businessSnap.data() : {};
                const sData = settingsSnap.exists() ? settingsSnap.data() : {};

                setBusinessInfo({
                    companyName: bData.businessName || bData.name || 'Not Set',
                    address: formatAddress(bData),
                    phone: bData.phoneNumber || bData.phone || 'Not Set',
                    email: bData.email || 'Not Set',
                    gstin: bData.gstin || '',
                    panNumber: bData.panNumber || '',
                    msmeNumber: bData.msmeUdyamNumber || bData.registrationNumber || '',
                    bankName: bData.bankName || '',
                    accountHolderName: bData.accountHolderName || '',
                    accountNumber: bData.accountNumber || '',
                    ifscCode: bData.ifscCode || '',
                    companyLogo: bData.companyLogo || '',
                });

                const loadedSettings: BillSettingsData = {
                    upiId: sData.upiId || bData.upiId || '',
                    termsAndConditions: sData.termsAndConditions || '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged if payment is delayed.\n3. Subject to local Jurisdiction only.',
                    signatureBase64: sData.signatureBase64 || '',
                    printFormat: sData.printFormat || 'A4',
                };

                setSettings(loadedSettings);

                if (loadedSettings.signatureBase64) {
                    setTimeout(() => {
                        if (sigPadRef.current) {
                            sigPadRef.current.fromDataURL(loadedSettings.signatureBase64);
                        }
                    }, 200);
                }

            } catch (error) {
                console.error("Error fetching bill settings:", error);
                setModal({ message: "Failed to load settings.", type: State.ERROR });
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [currentUser]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const clearSignature = () => {
        sigPadRef.current?.clear();
        setSettings(prev => ({ ...prev, signatureBase64: '' }));
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

            const dataToSave = {
            // Editable settings
            upiId: settings.upiId,
            termsAndConditions: settings.termsAndConditions,
            printFormat: settings.printFormat,
            signatureBase64: currentSignature,

            // ✅ Always sync from businessInfo so these stay fresh
            companyGstin: businessInfo.gstin,
            panNumber: businessInfo.panNumber,
            msmeNumber: businessInfo.msmeNumber,
            accountName: businessInfo.accountHolderName,
            accountNumber: businessInfo.accountNumber,
            bankName: businessInfo.bankName,
            ifscCode: businessInfo.ifscCode,

            updatedAt: serverTimestamp()
        };

            const docRef = doc(db, 'companies', currentUser.companyId, 'settings', 'bill');
            await setDoc(docRef, dataToSave, { merge: true });

            setSettings(prev => ({ ...prev, signatureBase64: currentSignature }));
            setModal({ message: "Bill settings saved successfully!", type: State.SUCCESS });
        } catch (error) {
            console.error("Error saving bill settings:", error);
            setModal({ message: "Failed to save settings.", type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="ml-3 text-gray-600 font-medium">Loading Settings...</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-24 relative">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            <div className="flex items-center bg-white border-b border-gray-200 sticky top-0 z-10">
                <button
                    onClick={() => navigate(-1)}
                    className="ml-4 flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
                >
                    <IconClose />
                </button>
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <h1 className="text-2xl font-bold text-gray-900">Invoice Configuration</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage details printed on your bills.</p>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-6">

                {/* SECTION 1: Company Identity — pulled from business profile, read-only */}
                <div className="bg-white rounded-sm shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">Company Details</h2>
                            <p className="text-xs text-gray-500">
                                Fetched from your{' '}
                                <button
                                    type="button"
                                    onClick={() => navigate('/edit-profile')}
                                    className="text-blue-600 hover:underline text-xs bg-transparent border-0 cursor-pointer p-0 font-normal"
                                >
                                    Business Profile
                                </button>
                                . Edit there to update here.
                            </p>
                        </div>
                        <span className="text-xs font-medium px-2 py-1 bg-gray-200 text-gray-600 rounded">
                            Read Only
                        </span>
                    </div>
                    <div className="p-5 space-y-6 opacity-80">

                        {/* Logo + Name + Address */}
                        <div className="flex flex-col sm:flex-row items-start gap-4">
                            {businessInfo.companyLogo ? (
                                <img
                                    src={businessInfo.companyLogo}
                                    alt="Company Logo"
                                    className="w-16 h-16 rounded-sm object-contain border border-gray-200 bg-gray-50 p-1.5 shrink-0"
                                />
                            ) : (
                                <div className="w-16 h-16 rounded-sm border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-xs font-bold shrink-0">
                                    LOGO
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-w-0">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Company Name</label>
                                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-sm text-gray-800 font-medium">
                                        {businessInfo.companyName}
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Registered Address</label>
                                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-sm text-gray-800 font-medium">
                                        {businessInfo.address}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Contact */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone</label>
                                <div className="p-3 bg-gray-50 border border-gray-200 rounded-sm text-gray-800 font-medium">
                                    {businessInfo.phone}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                                <div className="p-3 bg-gray-50 border border-gray-200 rounded-sm text-gray-800 font-medium">
                                    {businessInfo.email}
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-100" />

                        {/* Tax & Registration */}
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Tax & Registration</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">GSTIN</label>
                                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-sm text-gray-800 font-medium truncate">
                                        {businessInfo.gstin || <span className="text-gray-400">Not set</span>}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">PAN Number</label>
                                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-sm text-gray-800 font-medium">
                                        {businessInfo.panNumber || <span className="text-gray-400">Not set</span>}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">MSME No.</label>
                                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-sm text-gray-800 font-medium truncate">
                                        {businessInfo.msmeNumber || <span className="text-gray-400">Not set</span>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-100" />

                        {/* Bank Details */}
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Bank Details</p>
                            <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bank Name</label>
                                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-sm text-gray-800 font-medium truncate">
                                        {businessInfo.bankName || <span className="text-gray-400">Not set</span>}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Acc.Holder Name</label>
                                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-sm text-gray-800 font-medium truncate">
                                        {businessInfo.accountHolderName || <span className="text-gray-400">Not set</span>}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Account Number</label>
                                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-sm text-gray-800 font-medium truncate">
                                        {businessInfo.accountNumber || <span className="text-gray-400">Not set</span>}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">IFSC Code</label>
                                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-sm text-gray-800 font-medium">
                                        {businessInfo.ifscCode || <span className="text-gray-400">Not set</span>}
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* ── SECTION 2: UPI ID ── */}
                <div className="bg-white rounded-sm shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="text-lg font-semibold text-gray-800">Payment</h2>
                        <p className="text-xs text-gray-500">UPI ID displayed on invoices for quick payments.</p>
                    </div>
                    <div className="p-6">
                        <div className="max-w-sm">
                            <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID</label>
                            <input
                                type="text"
                                name="upiId"
                                value={settings.upiId || ''}
                                onChange={handleChange}
                                placeholder="e.g. yourname@upi"
                                className="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* --- NEW SECTION: Print Preferences --- */}
                <div className="bg-white rounded-sm shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="text-lg font-semibold text-gray-800">Print Preferences</h2>
                        <p className="text-xs text-gray-500">Choose your default bill format.</p>
                    </div>
                    <div className="p-6">
                        <div className="flex flex-col sm:flex-row gap-4">
                            <label className={`flex-1 flex items-center p-4 border rounded-sm cursor-pointer transition-colors ${settings.printFormat === 'A4' ? 'border-blue-600 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'}`}>
                                <input
                                    type="radio"
                                    name="printFormat"
                                    value="A4"
                                    checked={settings.printFormat === 'A4'}
                                    onChange={handleChange}
                                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                />
                                <div className="ml-3">
                                    <span className="block text-sm font-medium text-gray-900">A4 Size</span>
                                    <span className="block text-xs text-gray-500">Standard full-page invoice layout.</span>
                                </div>
                            </label>

                            <label className={`flex-1 flex items-center p-4 border rounded-sm cursor-pointer transition-colors ${settings.printFormat === 'THERMAL58' ? 'border-blue-600 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'}`}>
                                <input
                                    type="radio"
                                    name="printFormat"
                                    value="THERMAL58"
                                    checked={settings.printFormat === 'THERMAL58'}
                                    onChange={handleChange}
                                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                />
                                <div className="ml-3">
                                    <span className="block text-sm font-medium text-gray-900">2-Inch Thermal</span>
                                    <span className="block text-xs text-gray-500">58mm continuous receipt layout.</span>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
                {/* ------------------------------------- */}

                {/* SECTION 4: Digital Signature */}
                <div className="bg-white rounded-sm shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">Digital Signature</h2>
                            <p className="text-xs text-gray-500">Sign here to display on invoices</p>
                        </div>
                        <button
                            type="button"
                            onClick={clearSignature}
                            className="text-xs text-red-600 hover:text-red-700 font-medium px-3 py-1 border border-red-200 rounded bg-red-50 hover:bg-red-100 transition-colors"
                        >
                            Clear Signature
                        </button>
                    </div>
                    <div className="p-6">
                        <div className="border-2 border-dashed border-gray-300 rounded-sm bg-gray-50 flex justify-center items-center overflow-hidden relative">
                            <SignatureCanvas
                                ref={sigPadRef}
                                penColor="black"
                                canvasProps={{
                                    className: 'signature-canvas',
                                    style: { width: '100%', height: '200px' },
                                }}
                                backgroundColor="rgba(255,255,255,0)"
                            />
                            <div className="absolute pointer-events-none text-gray-400 opacity-20 text-4xl font-bold select-none">
                                SIGN HERE
                            </div>
                        </div>
                        {settings.printFormat === 'THERMAL58' && (
                            <p className="mt-2 text-xs text-amber-600 font-medium">Note: Signatures are not displayed on 2-Inch Thermal receipts.</p>
                        )}
                    </div>
                </div>

                {/* ── SECTION 4: Terms & Conditions ── */}
                <div className="bg-white rounded-sm shadow-sm border border-gray-200 overflow-hidden mb-20">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="text-lg font-semibold text-gray-800">Terms & Conditions</h2>
                        <p className="text-xs text-gray-500">Printed at the footer of every invoice.</p>
                    </div>
                    <div className="p-6">
                        <textarea
                            name="termsAndConditions"
                            value={settings.termsAndConditions}
                            onChange={handleChange}
                            rows={5}
                            className="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-blue-500 focus:border-blue-500 outline-none text-sm leading-relaxed"
                        />
                    </div>
                </div>

            </div>

            {/* ── Floating Save Button ── */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-transparent pb-18 flex justify-end md:px-8">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`
                        w-full md:w-auto px-8 py-3 rounded-sm text-white font-bold text-lg shadow-md transition-all transform active:scale-[0.98]
                        ${isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}
                    `}
                >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </button>

            </div>
        </div>
    );
};

export default BillSettings;