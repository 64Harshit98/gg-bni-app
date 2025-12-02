import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components/CustomButton';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Stepper } from '../../Components/Stepper';
import { FloatingLabelSelect } from '../../Components/FloatingLabelSelect';
import { Variant } from '../../enums';
import { FiTag, FiHash, FiMapPin, FiGlobe } from 'react-icons/fi';

// --- Dropdown Options ---
const businessTypeOptions = [
  { value: 'Retail', label: 'Retail' },
  { value: 'Wholesale', label: 'Wholesale' },
  { value: 'Services', label: 'Services' },
  { value: 'Manufacturing', label: 'Manufacturing' },
  { value: 'Other', label: 'Other' },
];

const businessCategoryOptions = [
  { value: 'Electronics', label: 'Electronics' },
  { value: 'Grocery', label: 'Grocery' },
  { value: 'Fashion', label: 'Fashion & Apparel' },
  { value: 'Health & Beauty', label: 'Health & Beauty' },
  { value: 'Home & Furniture', label: 'Home & Furniture' },
  { value: 'Food & Beverage', label: 'Food & Beverage' },
  { value: 'Other', label: 'Other' },
];

const gstTypeOptions = [
  { value: 'NA', label: 'Not Registered / NA' },
  { value: 'Regular', label: 'Regular' },
  { value: 'Composite', label: 'Composite' },
];

const BusinessInfoPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Retrieve data from Step 1. Default to empty object if missing (e.g. on refresh)
  const step1Data = location.state || {};

  // --- Form States ---
  const [businessName, setBusinessName] = useState('');

  // Type & Category
  const [businessType, setBusinessType] = useState('');
  const [customBusinessType, setCustomBusinessType] = useState('');

  const [businessCategory, setBusinessCategory] = useState('');
  const [customBusinessCategory, setCustomBusinessCategory] = useState('');

  // GST
  const [gstType, setGstType] = useState('NA');
  const [gstin, setGstin] = useState('');

  // Address
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const [error, setError] = useState<string | null>(null);

  // NOTE: Changed to receive a generic event or no event
  const handleNext = (e?: React.FormEvent) => {
    if (e) e.preventDefault(); // Stop native submission if called from form
    setError(null);

    // 1. Determine final values
    const finalBusinessType = businessType === 'Other' ? customBusinessType : businessType;
    const finalBusinessCategory = businessCategory === 'Other' ? customBusinessCategory : businessCategory;

    console.log("Validating form...");

    // 2. Validation
    if (
      !businessName.trim() ||
      !finalBusinessType.trim() ||
      !finalBusinessCategory.trim() ||
      !streetAddress.trim() ||
      !city.trim() ||
      !state.trim() ||
      !postalCode.trim()
    ) {
      setError('Please fill out all required fields.');
      return;
    }

    if ((gstType === 'Regular' || gstType === 'Composite') && !gstin.trim()) {
      setError('Please enter your GSTIN.');
      return;
    }

    // 3. Prepare Data
    const businessData = {
      ...step1Data, // Merge Step 1 Data
      businessName,
      businessType: finalBusinessType,
      businessCategory: finalBusinessCategory,
      gstin: gstType === 'NA' ? '' : gstin,
      streetAddress,
      city,
      state,
      postalCode,
      fullAddress: `${streetAddress}, ${city}, ${state} - ${postalCode}`,
    };

    console.log("Validation passed. Navigating with data:", businessData);

    // 4. Navigate
    navigate(ROUTES.SHOP_SETUP, {
      state: businessData,
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 p-4">
      <div className="sticky top-0 z-50 bg-gray-100 pb-4 mb-4">
        <Stepper totalSteps={4} currentStep={2} />
      </div>

      <h1 className="text-4xl font-bold mb-6">Business Details</h1>

      {/* Replaced onSubmit with simple div wrapper to avoid browser form quirks */}
      <div className="flex flex-col space-y-5 flex-grow">

        <FloatingLabelInput
          id="businessName"
          label="Business Name"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          required
        />

        {/* Business Type */}
        <div className="flex flex-col gap-2">
          <FloatingLabelSelect
            id="businessType"
            label="Business Type"
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            options={businessTypeOptions}
            required
            icon={<FiTag size={20} />}
          />
          {businessType === 'Other' && (
            <div className="animate-fade-in-down">
              <FloatingLabelInput
                id="customBusinessType"
                label="Specify Business Type"
                value={customBusinessType}
                onChange={(e) => setCustomBusinessType(e.target.value)}
                required
                placeholder="e.g. Consultancy"
              />
            </div>
          )}
        </div>

        {/* Business Category */}
        <div className="flex flex-col gap-2">
          <FloatingLabelSelect
            id="businessCategory"
            label="Category"
            value={businessCategory}
            onChange={(e) => setBusinessCategory(e.target.value)}
            options={businessCategoryOptions}
            required
            icon={<FiTag size={20} />}
          />
          {businessCategory === 'Other' && (
            <div className="animate-fade-in-down">
              <FloatingLabelInput
                id="customBusinessCategory"
                label="Specify Category"
                value={customBusinessCategory}
                onChange={(e) => setCustomBusinessCategory(e.target.value)}
                required
                placeholder="e.g. Toys"
              />
            </div>
          )}
        </div>

        {/* GST */}
        <FloatingLabelSelect
          id="gstType"
          label="GST Registration Type"
          value={gstType}
          onChange={(e) => setGstType(e.target.value)}
          options={gstTypeOptions}
          required
          icon={<FiHash size={20} />}
        />

        {(gstType === 'Regular' || gstType === 'Composite') && (
          <div className="animate-fade-in-down">
            <FloatingLabelInput
              id="gstin"
              label="GSTIN Number"
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              required
              className="pl-10"
            />
          </div>
        )}

        {/* Address */}
        <div className="relative">
          <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <FloatingLabelInput
            id="streetAddress"
            label="Street Address / Area"
            value={streetAddress}
            onChange={(e) => setStreetAddress(e.target.value)}
            required
            className="pl-10"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FloatingLabelInput
            id="city"
            label="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
          />
          <FloatingLabelInput
            id="postalCode"
            label="Pincode"
            type="number"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            required
          />
        </div>

        <div className="relative">
          <FiGlobe className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <FloatingLabelInput
            id="state"
            label="State"
            value={state}
            onChange={(e) => setState(e.target.value)}
            required
            className="pl-10"
          />
        </div>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-100 border-t border-gray-200 z-50">
          <div className="max-w-md mx-auto space-y-4">
          <CustomButton
            type="button"
            variant={Variant.Filled}
            onClick={() => handleNext()}
          >
            Next Step
          </CustomButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusinessInfoPage;