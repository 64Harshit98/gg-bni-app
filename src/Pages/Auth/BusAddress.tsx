import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomIcon } from '../../Components';
import { ICONS } from '../../constants/icon.constants';
import { CustomButton } from '../../Components/CustomButton';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';

// --- Main Business Address Page Component (Step 2) ---
const BusinessAddressPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // Retrieve the business info from the previous step
    const businessInfo = location.state;

    // State for this page's form fields
    const [streetAddress, setStreetAddress] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleNext = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!streetAddress.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
            setError("Please fill out all address fields.");
            return;
        }

        // Combine data from step 1 and step 2
        const combinedData = {
            ...businessInfo,
            streetAddress,
            city,
            state,
            postalCode,
        };

        // Navigate to the final step (Owner Info) and pass all collected data
        navigate(ROUTES.SIGNUP, { state: combinedData });
    };

    return (
        <div className="flex flex-col min-h-screen bg-white p-6">
            <button
                onClick={() => navigate(-1)} // Go back to the previous page
                className="self-start mb-8"
            >
                <CustomIcon iconName={ICONS.BACK_CURVE} />
            </button>
            <h1 className="text-4xl font-bold mb-2">Business Address</h1>

            <form onSubmit={handleNext} className="flex flex-col space-y-6 overflow-y-auto">
                <FloatingLabelInput
                    id="streetAddress"
                    type="text"
                    label="Street Address"
                    value={streetAddress}
                    onChange={(e) => setStreetAddress(e.target.value)}
                    required
                />
                <FloatingLabelInput
                    id="city"
                    type="text"
                    label="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                />
                <FloatingLabelInput
                    id="state"
                    type="text"
                    label="State / Province"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    required
                />
                <FloatingLabelInput
                    id="postalCode"
                    type="text"
                    label="Postal / ZIP Code"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    required
                />

                {error && <p className="text-red-500 text-sm text-center">{error}</p>}

                <CustomButton type="submit" variant="filled">
                    Next
                </CustomButton>
            </form>
        </div>
    );
};

export default BusinessAddressPage;
