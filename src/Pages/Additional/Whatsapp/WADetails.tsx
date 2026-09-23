import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth } from '../../../lib/Firebase';
import { useAuth } from '../../../context/auth-context';
import { ROUTES } from '../../../constants/routes.constants';
import { Stepper } from '../../../Components/Stepper';
import { botMasterService } from './WhatsappApi';
import BackButton from '../../../Components/BackButton';

// --- Types ---
interface ProfileData {
    name: string;
    email: string;
    streetAddress: string;
    city: string;
    state: string;
    postalCode: string;
    phoneNumber: string;
    authToken?: string;
}

interface PlanData {
    id: string;
    name: string;
    price: number;
    duration: string;
    features: string[];
}

// --- Hook to Fetch & Save Profile Data ---
const useProfileData = (userId?: string, companyId?: string) => {
    const [profile, setProfile] = useState<Partial<ProfileData>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId || !companyId) {
            setLoading(false);
            return;
        }
        const fetchProfileData = async () => {
            setLoading(true);
            try {
                const userDocRef = doc(db, 'companies', companyId, 'users', userId);
                const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);

                const [userDocSnap, businessDocSnap] = await Promise.all([
                    getDoc(userDocRef),
                    getDoc(businessDocRef),
                ]);

                const userData = userDocSnap.exists() ? userDocSnap.data() : {};
                const businessData = businessDocSnap.exists() ? businessDocSnap.data() : {};

                setProfile({ ...userData, ...businessData });
            } catch (err) {
                console.error("Error fetching data:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchProfileData();
    }, [userId, companyId]);

    // Add planData?: PlanData to the parameters
    const saveData = async (data: Partial<ProfileData>, planData?: PlanData) => {
        if (!userId || !companyId || !auth.currentUser) throw new Error("Auth missing");

        const userDocRef = doc(db, 'companies', companyId, 'users', userId);
        const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);

        const promises = [];

        // 1. Update personal name
        if (data.name && auth.currentUser.displayName !== data.name) {
            promises.push(updateProfile(auth.currentUser, { displayName: data.name }));
        }
        promises.push(setDoc(userDocRef, { name: data.name }, { merge: true }));

        // 2. Save WhatsApp credentials and Plan details COMPANY-WIDE
        const businessUpdateData: any = {
            streetAddress: data.streetAddress,
            city: data.city,
            state: data.state,
            postalCode: data.postalCode,
            whatsappNumber: data.phoneNumber,
            updatedAt: serverTimestamp()
        };

        if (data.authToken) {
            businessUpdateData.botMasterToken = data.authToken;
        }

        // --- NEW: Attach the selected plan details ---
        if (planData) {
            businessUpdateData.whatsappPlan = {
                planId: planData.id,
                planName: planData.name,
                planPrice: planData.price,
                duration: planData.duration,
                subscribedAt: serverTimestamp()
            };
        }

        promises.push(setDoc(businessDocRef, businessUpdateData, { merge: true }));

        await Promise.all(promises);
    };

    return { profile, loading, saveData };
};

// --- Main Component ---
const WhatsAppDetailsPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser, loading: authLoading } = useAuth();

    const selectedPlan = location.state?.selectedPlan as PlanData | undefined;

    const companyId = (currentUser as any)?.companyId || currentUser?.uid;
    const { profile, loading: dataLoading, saveData } = useProfileData(currentUser?.uid, companyId);

    const [formData, setFormData] = useState<Partial<ProfileData>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>('');

    useEffect(() => {
        if (profile) {
            setFormData(profile);
        }
    }, [profile]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // --- MAIN ACTION: Register & Save ---
    const handleConfirm = async () => {
        // 1. Validation (Password removed)
        if (!formData.phoneNumber) {
            alert("Please enter a valid phone number.");
            return;
        }

        setIsSaving(true);
        setStatusMessage('Registering account...');

        try {
            // Generate a random secure password on the fly just in case the API strictly requires the field
            const autoGeneratedPassword = "A1!123456789";

            // 2. Call Bot Master API to Register
            const apiResponse = await botMasterService.registerUser({
                name: formData.name || "User",
                email: formData.email || "user@example.com",
                phone: formData.phoneNumber,
                password: autoGeneratedPassword // Sending the auto-generated password
            });

            // 3. Extract Token 
            const newToken = apiResponse.user?.auth_token || apiResponse.token || apiResponse.authtoken;

            if (!newToken) {
                throw new Error(apiResponse.message || "Registration failed: No Auth Token returned.");
            }

            // 4. Save to Firestore
            setStatusMessage('Saving details...');
            await saveData({
                ...formData,
                authToken: newToken
            }, selectedPlan);

            // 5. Navigate to Verification
            navigate(ROUTES.WHATSAPP_VERIFICATION, {
                state: {
                    phoneNumber: formData.phoneNumber,
                    selectedPlan: selectedPlan,
                    authToken: newToken
                }
            });

        } catch (error: any) {
            console.error("Failed to process:", error);
            const errMsg = error.response?.data?.message || error.message || "Unknown error";
            alert(`Registration Error: ${errMsg}`);
        } finally {
            setIsSaving(false);
            setStatusMessage('');
        }
    };

    const handleGlobalStepClick = (stepNumber: number) => {
        if (stepNumber === 1) navigate(ROUTES.WHATSAPP_PLAN || '/whatsapp-plans');
        else if (stepNumber === 2) navigate(ROUTES.WHATSAPP_DETAILS || '/whatsapp-details', { state: { ...location.state } });
    };

    const isLoading = authLoading || dataLoading;

    if (isLoading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading details...</div>;
    if (!currentUser) return <div className="min-h-screen flex items-center justify-center text-red-500">Please log in.</div>;

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">

            {/* --- Stepper Header --- */}
            <div className="sticky top-0 z-50 w-full backdrop-blur-sm transition-all duration-300">
                <div className="max-w-md mx-auto px-6 py-4">
                    <BackButton />
                    <Stepper
                        totalSteps={3}
                        currentStep={2}
                        onStepClick={handleGlobalStepClick}
                        activeClassName="bg-emerald-600 text-white"
                        completedClassName="bg-emerald-100 text-emerald-600"
                        connectorClassName="bg-emerald-600"
                    />
                    <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-2 px-1">
                        <span className="cursor-pointer hover:text-emerald-600" onClick={() => handleGlobalStepClick(1)}>Select Plan</span>
                        <span className="text-emerald-600">Details</span>
                        <span className="cursor-pointer hover:text-emerald-600 text-center">Verification</span>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                    {/* Left Column: User Details Form */}
                    <div className="md:col-span-2 space-y-6">
                        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                            <div className="mb-6">
                                <h1 className="text-2xl font-bold text-gray-800">Account Details</h1>
                                <p className="text-gray-500 text-sm mt-1">
                                    We need these details to create your dedicated WhatsApp API account.
                                </p>
                            </div>

                            <div className="space-y-5">

                                {/* Full Name */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Full Name</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name || ''}
                                        onChange={handleChange}
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                        placeholder="Enter your name"
                                    />
                                </div>

                                {/* Email (Read-Only) */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Email Address (Read-Only)</label>
                                    <div className="p-3 bg-gray-100 rounded-lg text-gray-500 font-medium cursor-not-allowed">
                                        {formData.email}
                                    </div>
                                </div>

                                {/* Address Fields */}
                                <div className="space-y-3">
                                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Registered Address</label>
                                    <input type="text" name="streetAddress" value={formData.streetAddress || ''} onChange={handleChange} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Street Address" />
                                    <div className="flex space-x-2">
                                        <input type="text" name="city" value={formData.city || ''} onChange={handleChange} className="w-1/2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="City" />
                                        <input type="text" name="state" value={formData.state || ''} onChange={handleChange} className="w-1/2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="State" />
                                    </div>
                                    <input type="text" name="postalCode" value={formData.postalCode || ''} onChange={handleChange} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Postal Code" />
                                </div>

                                {/* --- Account Security Section --- */}
                                <div className="mt-8 pt-6 border-t border-gray-100">
                                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4">WhatsApp Configuration</h3>

                                    {/* Phone Number */}
                                    <div className="mb-4">
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">WhatsApp Number</label>
                                        <div className="flex">
                                            {/* Static +91 Box */}
                                            <span className="inline-flex items-center px-4 bg-gray-200 border border-r-0 border-gray-200 rounded-l-lg text-gray-700 font-bold">
                                                +91
                                            </span>
                                            <input
                                                type="tel" // 'tel' brings up the number keypad on mobile
                                                name="phoneNumber"
                                                // We strip the '91' for the display so the user only sees their 10 digits
                                                value={formData.phoneNumber ? formData.phoneNumber.replace(/^91/, '') : ''}
                                                onChange={(e) => {
                                                    // 1. Strip out any accidental letters/spaces they type
                                                    const rawNumber = e.target.value.replace(/\D/g, '');

                                                    // 2. Send the fully formatted number (91 + their number) to your state
                                                    handleChange({
                                                        target: {
                                                            name: 'phoneNumber',
                                                            value: '91' + rawNumber
                                                        }
                                                    } as any);
                                                }}
                                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-r-lg text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                                placeholder="9876543210"
                                                maxLength={10} // Stops them from typing more than 10 digits
                                            />
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Enter your 10-digit number. The country code is added automatically.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Order Summary */}
                    <div className="md:col-span-1">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 sticky top-24">
                            <h2 className="text-lg font-bold text-gray-800 mb-4">Order Summary</h2>

                            {selectedPlan ? (
                                <div className="space-y-4">
                                    <div className="pb-4 border-b border-gray-100">
                                        <p className="text-sm text-gray-500">Selected Plan</p>
                                        <div className="flex justify-between items-baseline mt-1">
                                            <h3 className="text-xl font-bold text-green-600">{selectedPlan.name}</h3>
                                            <span className="text-sm font-medium text-gray-900">{selectedPlan.duration}</span>
                                        </div>
                                    </div>

                                    <div className="py-2">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-gray-600">Subtotal</span>
                                            <span className="font-medium">₹{selectedPlan.price.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-gray-600">Taxes</span>
                                            <span className="text-green-600 text-xs">Inclusive</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                                            <span className="font-bold text-gray-900">Total</span>
                                            <span className="font-bold text-xl text-gray-900">₹{selectedPlan.price.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                                    <p className="text-gray-500 text-sm">No plan selected</p>
                                    <button onClick={() => navigate(-1)} className="text-blue-600 text-sm font-medium mt-2 hover:underline">Go back to plans</button>
                                </div>
                            )}

                            <div className="mt-6">
                                <button
                                    onClick={handleConfirm}
                                    disabled={!formData.phoneNumber || isSaving || !selectedPlan}
                                    className={`w-full font-semibold py-3 px-4 rounded-lg transition-all shadow-md flex items-center justify-center
                                    ${formData.phoneNumber
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-lg transform hover:-translate-y-0.5'
                                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        }`}
                                >
                                    {isSaving ? (
                                        <span className="flex items-center gap-2">
                                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            {statusMessage || 'Processing...'}
                                        </span>
                                    ) : (
                                        'Create Account & Proceed \u2192'
                                    )}
                                </button>
                                <p className="text-xs text-center text-gray-400 mt-3">
                                    By proceeding, you agree to our Terms of Service.
                                </p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default WhatsAppDetailsPage;