import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomIcon } from '../../Components';
import { ICONS } from '../../constants/icon.constants';
import { CustomButton } from '../../Components/CustomButton';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';

// --- Main Business Info Page Component (Step 1) ---
const BusinessInfoPage: React.FC = () => {
    const navigate = useNavigate();

    // State for this page's form fields
    const [businessName, setBusinessName] = useState('');
    const [businessType, setBusinessType] = useState('');
    const [businessCategory, setBusinessCategory] = useState('');
    const [registrationNumber, setRegistrationNumber] = useState('');
    const [gstin, setGstin] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleNext = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!businessName.trim() || !businessType.trim() || !businessCategory.trim() || !registrationNumber.trim()) {
            setError("Please fill out all required business fields.");
            return;
        }

        // Navigate to the next step (Business Address) and pass the collected data
        navigate(ROUTES.BUSINESS_ADDRESS, {
            state: {
                businessName,
                businessType,
                businessCategory,
                registrationNumber,
                gstin,
            }
        });
    };

    return (
        <div className="flex flex-col min-h-screen bg-white p-6">
            <button
                onClick={() => navigate(ROUTES.LANDING)}
                className="self-start mb-8"
            >
                <CustomIcon iconName={ICONS.BACK_CURVE} />
            </button>
            <h1 className="text-4xl font-bold mb-2">Business Information</h1>

            <form onSubmit={handleNext} className="flex flex-col space-y-6 overflow-y-auto">
                <FloatingLabelInput
                    id="businessName"
                    type="text"
                    label="Business Name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                />
                <FloatingLabelInput
                    id="businessType"
                    type="text"
                    label="Business Type"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    required
                />
                <FloatingLabelInput
                    id="businessCategory"
                    type="text"
                    label="Business Category"
                    value={businessCategory}
                    onChange={(e) => setBusinessCategory(e.target.value)}
                    required
                />
                <FloatingLabelInput
                    id="registrationNumber"
                    type="text"
                    label="Registration Number"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    required
                />
                <FloatingLabelInput
                    id="gstin"
                    type="text"
                    label="GSTIN (If applicable)"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                />

                {error && <p className="text-red-500 text-sm text-center">{error}</p>}

                <CustomButton type="submit" variant="filled">
                    Next
                </CustomButton>
            </form>
        </div>
    );
};

export default BusinessInfoPage;
