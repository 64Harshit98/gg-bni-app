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
  { value: 'Gifts & Stationery', label: 'Gifts & Stationery' },
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

// Alphabetically Sorted list of Indian States and Union Territories
const indianStates = [
  { value: 'Andaman and Nicobar Islands', label: 'Andaman and Nicobar Islands' },
  { value: 'Andhra Pradesh', label: 'Andhra Pradesh' },
  { value: 'Arunachal Pradesh', label: 'Arunachal Pradesh' },
  { value: 'Assam', label: 'Assam' },
  { value: 'Bihar', label: 'Bihar' },
  { value: 'Chandigarh', label: 'Chandigarh' },
  { value: 'Chhattisgarh', label: 'Chhattisgarh' },
  { value: 'Dadra and Nagar Haveli and Daman and Diu', label: 'Dadra and Nagar Haveli and Daman and Diu' },
  { value: 'Delhi', label: 'Delhi' },
  { value: 'Goa', label: 'Goa' },
  { value: 'Gujarat', label: 'Gujarat' },
  { value: 'Haryana', label: 'Haryana' },
  { value: 'Himachal Pradesh', label: 'Himachal Pradesh' },
  { value: 'Jammu and Kashmir', label: 'Jammu and Kashmir' },
  { value: 'Jharkhand', label: 'Jharkhand' },
  { value: 'Karnataka', label: 'Karnataka' },
  { value: 'Kerala', label: 'Kerala' },
  { value: 'Ladakh', label: 'Ladakh' },
  { value: 'Lakshadweep', label: 'Lakshadweep' },
  { value: 'Madhya Pradesh', label: 'Madhya Pradesh' },
  { value: 'Maharashtra', label: 'Maharashtra' },
  { value: 'Manipur', label: 'Manipur' },
  { value: 'Meghalaya', label: 'Meghalaya' },
  { value: 'Mizoram', label: 'Mizoram' },
  { value: 'Nagaland', label: 'Nagaland' },
  { value: 'Odisha', label: 'Odisha' },
  { value: 'Puducherry', label: 'Puducherry' },
  { value: 'Punjab', label: 'Punjab' },
  { value: 'Rajasthan', label: 'Rajasthan' },
  { value: 'Sikkim', label: 'Sikkim' },
  { value: 'Tamil Nadu', label: 'Tamil Nadu' },
  { value: 'Telangana', label: 'Telangana' },
  { value: 'Tripura', label: 'Tripura' },
  { value: 'Uttar Pradesh', label: 'Uttar Pradesh' },
  { value: 'Uttarakhand', label: 'Uttarakhand' },
  { value: 'West Bengal', label: 'West Bengal' },
];

const BusinessInfoPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // --- Form States ---
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [customBusinessType, setCustomBusinessType] = useState('');
  const [businessCategory, setBusinessCategory] = useState('');
  const [customBusinessCategory, setCustomBusinessCategory] = useState('');
  const [gstType, setGstType] = useState('');
  const [gstin, setGstin] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  // --- 1. Load Data on Mount ---
  useEffect(() => {
    const routeData = location.state || {};
    const savedDataString = localStorage.getItem(LOCAL_STORAGE_KEY);
    const savedData = savedDataString ? JSON.parse(savedDataString) : {};
    const mergedData = { ...savedData, ...routeData };

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

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mergedData));
  }, [location.state]);

  // --- 2. Save Data Locally on Change ---
  useEffect(() => {
    const saveData = () => {
      const currentSaved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
      const updatedData = {
        ...currentSaved,
        businessName, businessType, customBusinessType, businessCategory,
        customBusinessCategory, gstType, gstin, streetAddress, city, state, postalCode
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedData));
    };
    saveData();
  }, [businessName, businessType, customBusinessType, businessCategory, customBusinessCategory, gstType, gstin, streetAddress, city, state, postalCode]);

  // --- Validation Logic ---
  const validateForm = (): boolean => {
    const finalBusinessType = businessType === 'Other' ? customBusinessType : businessType;
    const finalBusinessCategory = businessCategory === 'Other' ? customBusinessCategory : businessCategory;

    // 1. Required fields check
    if (
      !businessName.trim() || !finalBusinessType.trim() || !finalBusinessCategory.trim() ||
      !streetAddress.trim() || !city.trim() || !state.trim() || !postalCode.trim()
    ) {
      setError('Please fill out all required fields.');
      return false;
    }

    // 2. GSTIN Validation (Standard regex for 15-digit Indian GSTIN)
    if (gstType === 'Regular' || gstType === 'Composite') {
      if (!gstin.trim()) {
        setError('Please enter your GSTIN.');
        return false;
      }
      if (gstin.length !== 15) {
        setError('GSTIN must be exactly 15 characters.');
        return false;
      }
    }

    // 3. Pincode Validation (6 digits)
    if (postalCode.length !== 6) {
      setError('Pincode must be exactly 6 digits.');
      return false;
    }

    return true;
  };

  const getCombinedData = () => JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');

  const handleNext = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    const allData = getCombinedData();
    const finalBusinessType = businessType === 'Other' ? customBusinessType : businessType;
    const finalBusinessCategory = businessCategory === 'Other' ? customBusinessCategory : businessCategory;

    const payload = {
      ...allData,
      businessType: finalBusinessType,
      businessCategory: finalBusinessCategory,
      gstin: gstType === 'NA' ? '' : gstin.toUpperCase(),
      fullAddress: `${streetAddress}, ${city}, ${state} - ${postalCode}`,
    };

    navigate(ROUTES.SHOP_SETUP, { state: payload });
  };

  const handleStepClick = (targetStep: number) => {
    if (targetStep === 1) {
      navigate(ROUTES.SIGNUP, { state: getCombinedData() });
    } else if (targetStep > 2) {
      handleNext();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      <div className="sticky top-0 z-40 bg-gray-100 pt-4 pb-2 px-4 shadow-sm">
        <Stepper totalSteps={4} currentStep={2} onStepClick={handleStepClick} />
      </div>

      <div className="flex-grow px-4 pb-32 overflow-y-auto">
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
                  onChange={(e) => {
                    if (e.target.value.length <= 15) {
                      setGstin(e.target.value.toUpperCase());
                    }
                  }}
                  required
                  className="pl-10"
                  icon={<FiHash size={20} />}
                />
              </div>
            )}

            <FloatingLabelInput
              id="streetAddress"
              label="Street Address / Area"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              required
              className="pl-10"
              icon={<Building2Icon size={20} />}
            />

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
                onChange={(e) => {
                  if (e.target.value.length <= 6) {
                    setPostalCode(e.target.value);
                  }
                }}
                icon={<PinIcon size={20} />}
                required
              />
            </div>

            <FloatingLabelSelect
              id="state"
              label="State"
              value={state}
              onChange={(e) => setState(e.target.value)}
              options={indianStates}
              required
              icon={<FiMap size={20} />}
            />

            {error && <p className="text-red-500 text-sm text-center bg-red-50 p-2 rounded animate-pulse">{error}</p>}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-50 shadow-lg">
        <div className="max-w-md mx-auto">
          <CustomButton type="button" variant={Variant.Filled} onClick={() => handleNext()} className="w-full">
            Next Step
          </CustomButton>
        </div>
      </div>
    </div>
  );
};

export default BusinessInfoPage;