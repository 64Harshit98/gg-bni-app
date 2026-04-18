// src/pages/Auth/AgentSignup.tsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CustomButton } from '../../Components/CustomButton';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Variant } from '../../enums';
import { FiUser, FiMail, FiLock, FiPhone, FiMapPin, FiCreditCard, FiFileText } from 'react-icons/fi';
import { registerAgentWithDetails } from '../../lib/AuthOperations';
import { ROUTES } from '../../constants/indesx';

const AgentSignup: React.FC = () => {
    const navigate = useNavigate();

    // Standard Text Fields
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [address, setAddress] = useState('');
    const [isAgency, setIsAgency] = useState(false);

    // Document Number States
    const [panNumber, setPanNumber] = useState('');
    const [aadhaarNumber, setAadhaarNumber] = useState('');

    // Separated Optional Business Fields
    const [gstinNumber, setGstinNumber] = useState('');
    const [msmeNumber, setMsmeNumber] = useState('');

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await registerAgentWithDetails({
                name,
                email,
                password,
                phoneNumber,
                isAgency,
                address,
                panNumber,
                aadhaarNumber,
                gstinNumber: isAgency ? gstinNumber : '',
                msmeNumber: isAgency ? msmeNumber : ''
            });

            navigate(ROUTES.PARTNER_DASHBOARD);
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 py-8">
            <div className="bg-white p-6 md:p-8 rounded-xl shadow-lg w-full max-w-2xl max-h-[95vh] overflow-y-auto custom-scrollbar">
                <h2 className="text-2xl md:text-3xl font-bold text-center mb-2 text-gray-900">Partner with Sellar</h2>
                <p className="text-center text-gray-500 mb-6 text-sm md:text-base">Earn recurring commissions by referring businesses.</p>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Account Type Toggle */}
                    <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                        <button
                            type="button"
                            onClick={() => setIsAgency(false)}
                            className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${!isAgency ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'}`}
                        >
                            Independent Agent
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsAgency(true)}
                            className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${isAgency ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'}`}
                        >
                            Agency (Business)
                        </button>
                    </div>

                    {/* Basic Info - Uses Grid for Desktop side-by-side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="relative [&_label]:!left-[3rem]">
                            <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
                            <FloatingLabelInput id="name" label={isAgency ? "Agency/Business Name" : "Full Name"} value={name} onChange={(e) => setName(e.target.value)} required className="pl-12 py-3 bg-gray-50 rounded-lg w-full" />
                        </div>

                        <div className="relative [&_label]:!left-[3rem]">
                            <FiPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
                            <FloatingLabelInput id="phone" type="tel" label="Phone Number" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required className="pl-12 py-3 bg-gray-50 rounded-lg w-full" />
                        </div>
                    </div>

                    <div className="relative [&_label]:!left-[3rem]">
                        <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
                        <FloatingLabelInput id="email" type="email" label="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required className="pl-12 py-3 bg-gray-50 rounded-lg w-full" />
                    </div>

                    <div className="relative [&_label]:!left-[3rem]">
                        <FiMapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
                        <FloatingLabelInput id="address" type="text" label={isAgency ? "Registered Business Address" : "Current Residence Address"} value={address} onChange={(e) => setAddress(e.target.value)} required className="pl-12 py-3 bg-gray-50 rounded-lg w-full" />
                    </div>

                    {/* --- IDENTITY VERIFICATION (ALWAYS VISIBLE) --- */}
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4 mt-2">
                        <h4 className="text-sm font-bold text-gray-800 mb-2 border-b border-gray-200 pb-2">
                            Identity Verification (Required)
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="relative [&_label]:!left-[3rem]">
                                <FiCreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
                                <FloatingLabelInput id="pan" type="text" label="PAN Card Number" value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} required className="pl-12 py-3 bg-white rounded-lg uppercase w-full" />
                            </div>
                            <div className="relative [&_label]:!left-[3rem]">
                                <FiCreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
                                <FloatingLabelInput id="aadhaar" type="text" label="Aadhaar Card Number" value={aadhaarNumber} onChange={(e) => setAadhaarNumber(e.target.value)} required className="pl-12 py-3 bg-white rounded-lg w-full" />
                            </div>
                        </div>
                    </div>

                    {/* --- BUSINESS VERIFICATION (AGENCY ONLY) --- */}
                    {isAgency && (
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-4 mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                            <h4 className="text-sm font-bold text-blue-900 mb-2 border-b border-blue-200 pb-2">
                                Business Verification (Optional)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="relative [&_label]:!left-[3rem]">
                                    <FiFileText className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 z-10" size={18} />
                                    {/* Notice 'required' has been removed from here */}
                                    <FloatingLabelInput id="gstin" type="text" label="GSTIN (Optional)" value={gstinNumber} onChange={(e) => setGstinNumber(e.target.value.toUpperCase())} className="pl-12 py-3 bg-white rounded-lg uppercase w-full border-blue-200 focus:border-blue-500 focus:ring-blue-500" />
                                </div>
                                <div className="relative [&_label]:!left-[3rem]">
                                    <FiFileText className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 z-10" size={18} />
                                    {/* Notice 'required' has been removed from here */}
                                    <FloatingLabelInput id="msme" type="text" label="MSME Number (Optional)" value={msmeNumber} onChange={(e) => setMsmeNumber(e.target.value.toUpperCase())} className="pl-12 py-3 bg-white rounded-lg uppercase w-full border-blue-200 focus:border-blue-500 focus:ring-blue-500" />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="relative [&_label]:!left-[3rem] mt-4">
                        <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
                        <FloatingLabelInput id="password" type="password" label="Create Password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required className="pl-12 py-3 bg-gray-50 rounded-lg w-full" />
                    </div>

                    {error && <p className="text-red-500 text-sm font-medium text-center bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}

                    <CustomButton variant={Variant.Filled} type="submit" disabled={loading} className="w-full !bg-black !text-white h-14 text-lg mt-4 shadow-md hover:shadow-lg transition-all">
                        {loading ? 'Creating Account...' : 'Become a Partner'}
                    </CustomButton>
                </form>

                <p className="text-center mt-6 text-sm font-medium text-gray-600">
                    Already a partner? <Link to={ROUTES.LANDING} className="text-blue-600 hover:text-blue-800 hover:underline">Log In</Link>
                </p>
            </div>
        </div>
    );
};

export default AgentSignup;