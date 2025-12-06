// src/Pages/BusinessInfoPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components/CustomButton';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Stepper } from '../../Components/Stepper';
import { FloatingLabelSelect } from '../../Components/FloatingLabelSelect';
import { Variant } from '../../enums';
import { FiTag, FiHash, FiMapPin, FiMap, FiAtSign, FiHome } from 'react-icons/fi';
import { Building2Icon, PinIcon, Scale } from 'lucide-react';


// --- Constants ---
const LOCAL_STORAGE_KEY = 'sellar_onboarding_data';

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
  { value: 'Regular', label: 'Regular' },
  { value: 'NA', label: 'Not Registered / NA' },
  { value: 'Composite', label: 'Composite' },
];

const BusinessInfoPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // --- Form States ---
  const [businessName, setBusinessName] = useState('');

  // Type & Category
  const [businessType, setBusinessType] = useState('');
  const [customBusinessType, setCustomBusinessType] = useState('');
  const [businessCategory, setBusinessCategory] = useState('');
  const [customBusinessCategory, setCustomBusinessCategory] = useState('');

  // GST
  const [gstType, setGstType] = useState('');
  const [gstin, setGstin] = useState('');

  // Address
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const [error, setError] = useState<string | null>(null);

  // --- 1. Load Data on Mount ---
  useEffect(() => {
    // Get data passed from previous route (Step 1)
    const routeData = location.state || {};

    // Get data saved in local storage
    const savedDataString = localStorage.getItem(LOCAL_STORAGE_KEY);
    const savedData = savedDataString ? JSON.parse(savedDataString) : {};

    // Merge: Route data takes priority for Step 1 fields, Saved data takes priority for Step 2 fields
    const mergedData = { ...savedData, ...routeData };

    // Populate State
    if (mergedData.businessName) setBusinessName(mergedData.businessName);
    if (mergedData.businessType) setBusinessType(mergedData.businessType);
    if (mergedData.customBusinessType) setCustomBusinessType(mergedData.customBusinessType);
    if (mergedData.businessCategory) setBusinessCategory(mergedData.businessCategory);
    if (mergedData.customBusinessCategory) setCustomBusinessCategory(mergedData.customBusinessCategory);
    if (mergedData.gstType) setGstType(mergedData.gstType);
    if (mergedData.gstin) setGstin(mergedData.gstin);
    if (mergedData.streetAddress) setStreetAddress(mergedData.streetAddress);
    if (mergedData.city) setCity(mergedData.city);
    if (mergedData.state) setState(mergedData.state);
    if (mergedData.postalCode) setPostalCode(mergedData.postalCode);

    // Save the merged initial state back to local storage to ensure Step 1 data is persisted
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mergedData));
  }, []); // Run once on mount

  // --- 2. Save Data Locally on Change ---
  useEffect(() => {
    const saveData = () => {
      const currentSaved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
      const updatedData = {
        ...currentSaved,
        businessName,
        businessType,
        customBusinessType,
        businessCategory,
        customBusinessCategory,
        gstType,
        gstin,
        streetAddress,
        city,
        state,
        postalCode
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedData));
    };

    // Debounce or save on every change (simple save is fine for this scale)
    saveData();
  }, [businessName, businessType, customBusinessType, businessCategory, customBusinessCategory, gstType, gstin, streetAddress, city, state, postalCode]);

  // --- Validation Logic ---
  const validateForm = (): boolean => {
    const finalBusinessType = businessType === 'Other' ? customBusinessType : businessType;
    const finalBusinessCategory = businessCategory === 'Other' ? customBusinessCategory : businessCategory;

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
      return false;
    }

    if ((gstType === 'Regular' || gstType === 'Composite') && !gstin.trim()) {
      setError('Please enter your GSTIN.');
      return false;
    }
    return true;
  };

  // --- Navigation Handlers ---
  const getCombinedData = () => {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
  };

  const handleNext = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    // Prepare final payload from Storage (contains Step 1 & 2)
    const allData = getCombinedData();

    // Ensure derived fields are correct
    const finalBusinessType = businessType === 'Other' ? customBusinessType : businessType;
    const finalBusinessCategory = businessCategory === 'Other' ? customBusinessCategory : businessCategory;

    const payload = {
      ...allData,
      businessType: finalBusinessType,
      businessCategory: finalBusinessCategory,
      gstin: gstType === 'NA' ? '' : gstin,
      fullAddress: `${streetAddress}, ${city}, ${state} - ${postalCode}`,
    };

    console.log("Validation passed. Navigating to Step 3:", payload);

    navigate(ROUTES.SHOP_SETUP, {
      state: payload,
    });
  };

  // --- Stepper Click Handler ---
  const handleStepClick = (targetStep: number) => {
    // 1. Go Back to Step 1
    if (targetStep === 1) {
      const currentData = getCombinedData();
      navigate(ROUTES.SIGNUP, { state: currentData }); // Pass data back to Step 1
    }
    // 2. Stay on Step 2
    else if (targetStep === 2) {
      return;
    }
    // 3. Go Forward (Step 3 or 4) - Require Validation
    else if (targetStep > 2) {
      handleNext(); // Reuse next logic which validates and navigates
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">

      {/* Sticky Header with Stepper */}
      <div className="sticky top-0 z-40 bg-gray-100 pt-4 pb-2 px-4 shadow-sm">
        <Stepper
          totalSteps={4}
          currentStep={2}
          // Assuming your Stepper component accepts an onStepClick prop. 
          // If not, you'll need to update the Stepper component to accept this prop.
          onStepClick={handleStepClick}
        />
      </div>

      <div className="flex-grow px-4 pb-24 overflow-y-auto">
        <h1 className="text-4xl font-bold mb-4 mt-4">Business Details</h1>

<div className='bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-2 pt-8 pb-8'>
        <div className="flex flex-col space-y-5">

          <FloatingLabelInput
            id="businessName"
            label="Business Name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            icon={<FiAtSign size={20} />}
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
              icon={<FiHome size={20} />}
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
            icon={<Scale size={20} />}
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
                icon={<FiHash size={20} />}
              />
            </div>
          )}

          {/* Address */}
          <div className="relative">
            <FloatingLabelInput
              id="streetAddress"
              label="Street Address / Area"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              required
              className="pl-10"
              icon={<Building2Icon size={20} />}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FloatingLabelInput
              id="city"
              label="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              icon={<FiMapPin size={20} />}
              required
            />
            <FloatingLabelInput
              id="postalCode"
              label="Pincode"
              type="number"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              icon={<PinIcon size={20} />}
              required
            />
          </div>

          <div className="relative">
            <FloatingLabelInput
              id="state"
              label="State"
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
              className="pl-10"
              icon={<FiMap size={20} />}
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">{error}</p>}
        </div>
      </div>
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-50 shadow-lg">
        <div className="max-w-md mx-auto">
          <CustomButton
            type="button"
            variant={Variant.Filled}
            onClick={() => handleNext()}
            className="w-full"
          >
            Next Step
          </CustomButton>
        </div>
      </div>
    </div>
  );
};

export default BusinessInfoPage;