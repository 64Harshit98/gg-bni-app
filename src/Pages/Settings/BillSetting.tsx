import React, { useState, useEffect, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { db } from '../../lib/Firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { State } from '../../enums';
import { Modal } from '../../constants/Modal';

// --- Interfaces ---
export interface BillSettingsData {
    companyGstin: string;
    msmeNumber: string;
    panNumber: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    ifscCode: string;
    termsAndConditions: string;
    signatureBase64?: string;
}

interface BusinessInfoData {
    companyName: string;
    address: string;
    phone: string;
    email: string;
}

const BillSettings: React.FC = () => {
    const { currentUser } = useAuth();
    const sigPadRef = useRef<any>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    const [businessInfo, setBusinessInfo] = useState<BusinessInfoData>({
        companyName: '', address: '', phone: '', email: ''
    });

    const [settings, setSettings] = useState<BillSettingsData>({
        companyGstin: '',
        msmeNumber: '',
        panNumber: '',
        bankName: '',
        accountName: '',
        accountNumber: '',
        ifscCode: '',
        termsAndConditions: '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged if payment is delayed.\n3. Subject to local Jurisdiction only.',
        signatureBase64: ''
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
                    email: bData.email || 'Not Set'
                });

                const loadedSettings = {
                    companyGstin: sData.companyGstin || bData.gstin || '',
                    msmeNumber: sData.msmeNumber || bData.registrationNumber || '',
                    panNumber: sData.panNumber || bData.panNumber || '',
                    bankName: sData.bankName || bData.bankName || '',
                    accountName: sData.accountName || bData.accountHolderName || '',
                    accountNumber: sData.accountNumber || bData.accountNumber || '',
                    ifscCode: sData.ifscCode || bData.ifscCode || '',
                    termsAndConditions: sData.termsAndConditions || '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged if payment is delayed.\n3. Subject to local Jurisdiction only.',
                    signatureBase64: sData.signatureBase64 || ''
                };

                setSettings(loadedSettings);

                // FIX: Load signature after component has mounted and canvas is ready
                if (loadedSettings.signatureBase64) {
                    setTimeout(() => {
                        if (sigPadRef.current) {
                            sigPadRef.current.fromDataURL(loadedSettings.signatureBase64);
                        }
                    }, 200); // Tiny delay to ensure canvas DOM is ready
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

            let currentSignature = settings.signatureBase64; // Keep old one if pad is empty?
            
            // If the user drew something new, get the data URL
            if (sigPadRef.current && !sigPadRef.current.isEmpty()) {
                currentSignature = sigPadRef.current.getCanvas().toDataURL('image/png');
            } else if (sigPadRef.current && sigPadRef.current.isEmpty()) {
                // If they cleared it, set to empty
                currentSignature = '';
            }

            const dataToSave = {
                ...settings,
                signatureBase64: currentSignature,
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

            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <h1 className="text-2xl font-bold text-gray-900">Invoice Configuration</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage details printed on your bills.</p>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* SECTION 1: Company Identity */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">Company Details</h2>
                            <p className="text-xs text-gray-500">Fetched from Business Profile</p>
                        </div>
                        <span className="text-xs font-medium px-2 py-1 bg-gray-200 text-gray-600 rounded">Read Only</span>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 opacity-80">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Company Name</label>
                            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-gray-800 font-medium">
                                {businessInfo.companyName}
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Address</label>
                            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-gray-800">
                                {businessInfo.address}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Contact</label>
                            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-gray-800">
                                {businessInfo.phone}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-gray-800">
                                {businessInfo.email}
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECTION 2: Tax & Registration */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="text-lg font-semibold text-gray-800">Tax & Registration</h2>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                            <input
                                type="text"
                                name="companyGstin"
                                value={settings.companyGstin}
                                onChange={handleChange}
                                placeholder="e.g. 27ABCDE1234F1Z5"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none uppercase font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">MSME / Udyam No.</label>
                            <input
                                type="text"
                                name="msmeNumber"
                                value={settings.msmeNumber}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none uppercase"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number</label>
                            <input
                                type="text"
                                name="panNumber"
                                value={settings.panNumber}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none uppercase font-mono"
                            />
                        </div>
                    </div>
                </div>

                {/* SECTION 3: Banking Details */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="text-lg font-semibold text-gray-800">Banking Information</h2>
                        <p className="text-xs text-gray-500">Displayed for bank transfer payments.</p>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                            <input
                                type="text"
                                name="bankName"
                                value={settings.bankName}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Account Holder Name</label>
                            <input
                                type="text"
                                name="accountName"
                                value={settings.accountName}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                            <input
                                type="text"
                                name="accountNumber"
                                value={settings.accountNumber}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">IFSC Code</label>
                            <input
                                type="text"
                                name="ifscCode"
                                value={settings.ifscCode}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none uppercase font-mono"
                            />
                        </div>
                    </div>
                </div>

                {/* SECTION 4: Digital Signature */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                        <div className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex justify-center items-center overflow-hidden relative">
                            <SignatureCanvas
                                ref={sigPadRef}
                                penColor="black"
                                canvasProps={{
                                    className: 'signature-canvas',
                                    style: { width: '100%', height: '200px' }
                                }}
                                backgroundColor="rgba(255,255,255,0)"
                            />
                            <div className="absolute pointer-events-none text-gray-400 opacity-20 text-4xl font-bold select-none">
                                SIGN HERE
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECTION 5: Terms & Conditions */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-20">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="text-lg font-semibold text-gray-800">Terms & Conditions</h2>
                    </div>
                    <div className="p-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Terms</label>
                        <textarea
                            name="termsAndConditions"
                            value={settings.termsAndConditions}
                            onChange={handleChange}
                            rows={5}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none text-sm leading-relaxed"
                        />
                    </div>
                </div>

            </div>

            {/* FLOATING SAVE BUTTON */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-transparent pb-18 flex justify-end md:px-8">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`
                        w-full md:w-auto px-8 py-3 rounded-lg text-white font-bold text-lg shadow-md transition-all transform active:scale-[0.98]
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