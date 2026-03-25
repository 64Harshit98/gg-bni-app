import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components/CustomButton';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Stepper } from '../../Components/Stepper';
import { FloatingLabelSelect } from '../../Components/FloatingLabelSelect';
import { Variant, PLANS, ROLES } from '../../enums';
import { FiTag, FiHash, FiMapPin, FiMap, FiAtSign, FiHome, FiCheckCircle } from 'react-icons/fi';
import { Building2Icon, PinIcon, Scale } from 'lucide-react';
import { Spinner } from '../../constants/Spinner';

import { registerUserWithDetails } from '../../lib/AuthOperations';
import { saveLeadProgress } from '../../lib/Lead';
import { auth } from '../../lib/Firebase';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Creating Account...');

  const previousData = location.state || JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');

  // Guard: Ensure user came from Step 1
  if (!previousData.email || !previousData.password) {
    return <Navigate to={ROUTES.SIGNUP} replace />;
  }

  useEffect(() => {
    if (previousData.businessName) setBusinessName(previousData.businessName);
    if (previousData.businessType) setBusinessType(previousData.businessType);
    if (previousData.businessCategory) setBusinessCategory(previousData.businessCategory);
    if (previousData.gstType) setGstType(previousData.gstType);
    if (previousData.gstin) setGstin(previousData.gstin);
    if (previousData.streetAddress) setStreetAddress(previousData.streetAddress);
    if (previousData.city) setCity(previousData.city);
    if (previousData.state) setState(previousData.state);
    if (previousData.postalCode) setPostalCode(previousData.postalCode);
  }, []);

  const validateForm = (): boolean => {
    const finalBusinessType = businessType === 'Other' ? customBusinessType : businessType;
    const finalBusinessCategory = businessCategory === 'Other' ? customBusinessCategory : businessCategory;

    if (!businessName.trim() || !finalBusinessType.trim() || !finalBusinessCategory.trim() ||
      !streetAddress.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
      setError('Please fill out all required fields.');
      return false;
    }

    if (gstType === 'Regular' || gstType === 'Composite') {
      if (!gstin.trim() || gstin.length !== 15) {
        setError('Valid 15-character GSTIN is required.');
        return false;
      }
    }

    if (postalCode.length !== 6) {
      setError('Pincode must be exactly 6 digits.');
      return false;
    }
    return true;
  };

  const handleFinishSetup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    setIsSubmitting(true);
    setStatusMessage('Configuring Dashboard...');

    const finalBusinessType = businessType === 'Other' ? customBusinessType : businessType;
    const finalBusinessCategory = businessCategory === 'Other' ? customBusinessCategory : businessCategory;
    const finalGstin = gstType === 'NA' ? '' : gstin.toUpperCase();

    try {
      // 1. Prepare Business Payload
      const businessInfoPayload = {
        businessName,
        businessType: finalBusinessType,
        businessCategory: finalBusinessCategory,
        gstType,
        gstin: finalGstin,
        fullAddress: `${streetAddress}, ${city}, ${state} - ${postalCode}`,
        createdAt: new Date(),
      };

      // 2. Prepare Plan Payload (Force Enterprise Trial)
      const planPayload = {
        pack: PLANS.ENTERPRISE,
        validity: 'active',
        expiryDate: new Date(new Date().setDate(new Date().getDate() + 28)), // 28 Days Trial
        isTrial: true
      };

      // 3. Inject Default Sales Settings (Replaces deleted configuration step)
      const salesSettingsPayload = {
        gstScheme: gstType,
        taxType: gstType === 'Regular' ? 'exclusive' : 'exclusive',
        enableItemWiseDiscount: true,
        allowDueBilling: true,
        requireCustomerName: true,
        requireCustomerMobile: false,
        salesViewType: 'list',
        settingType: 'sales',
      };

      // 4. Create User in Auth & Firestore
      await registerUserWithDetails(
        previousData.fullName,
        previousData.phoneNumber,
        previousData.email,
        previousData.password,
        ROLES.OWNER,
        businessInfoPayload,
        planPayload,
        salesSettingsPayload,
        [] // No initial staff
      );

      // 5. Update Lead Status (Conversion Event)
      const currentUid = auth.currentUser?.uid;
      await saveLeadProgress(previousData.email, {
        status: 'Trial Plan',
        currentStep: 'Completed',
        userId: currentUid,
        convertedAt: new Date(),
        plan: 'Enterprise Trial'
      });

      // 6. Cleanup & Redirect to Dashboard (AppGuard will handle Phase 2)
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      setStatusMessage('Setup Complete!');
      navigate(ROUTES.HOME);

    } catch (err: any) {
      console.error('Registration failed:', err);
      setError(err.message || 'Setup failed. Please check your internet and try again.');
      setIsSubmitting(false);
    }
  };

  const handleStepClick = (targetStep: number) => {
    if (targetStep === 1) {
      navigate(ROUTES.SIGNUP, { state: previousData });
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-200">
      <div className="flex-shrink-0 bg-gray-200 pt-4 pb-2 px-4 shadow-sm z-40 flex justify-center">
        <div className="w-full max-w-xs">
          <Stepper totalSteps={2} currentStep={2} onStepClick={handleStepClick} />
        </div>
      </div>

      <div className="flex-grow px-4 pb-32 overflow-y-auto scrollbar-hide">
        <div className="flex justify-between items-end mb-4 mt-4">
          <h1 className="text-4xl font-bold">Business Details</h1>
        </div>

        <div className='bg-gray-100 p-4 rounded-lg shadow-sm border border-gray-200 space-y-2 pt-8 pb-8'>
          <form onSubmit={handleFinishSetup} className="flex flex-col space-y-5">
            <FloatingLabelInput id="businessName" label="Business Name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} icon={<FiAtSign size={20} />} required />

            <FloatingLabelSelect id="businessType" label="Business Type" value={businessType} onChange={(e) => setBusinessType(e.target.value)} options={businessTypeOptions} required icon={<FiHome size={20} />} />
            {businessType === 'Other' && (
              <FloatingLabelInput id="customBusinessType" label="Specify Business Type" value={customBusinessType} onChange={(e) => setCustomBusinessType(e.target.value)} required placeholder="e.g. Consultancy" />
            )}

            <FloatingLabelSelect id="businessCategory" label="Category" value={businessCategory} onChange={(e) => setBusinessCategory(e.target.value)} options={businessCategoryOptions} required icon={<FiTag size={20} />} />
            {businessCategory === 'Other' && (
              <FloatingLabelInput id="customBusinessCategory" label="Specify Category" value={customBusinessCategory} onChange={(e) => setCustomBusinessCategory(e.target.value)} required placeholder="e.g. Toys" />
            )}

            <FloatingLabelSelect id="gstType" label="GST Registration Type" value={gstType} onChange={(e) => setGstType(e.target.value)} options={gstTypeOptions} required icon={<Scale size={20} />} />
            {(gstType === 'Regular' || gstType === 'Composite') && (
              <FloatingLabelInput id="gstin" label="GSTIN Number" value={gstin} onChange={(e) => { if (e.target.value.length <= 15) setGstin(e.target.value.toUpperCase()); }} required className="pl-10" icon={<FiHash size={20} />} />
            )}

            <FloatingLabelInput id="streetAddress" label="Street Address / Area" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} required className="pl-10" icon={<Building2Icon size={20} />} />

            <div className="grid grid-cols-2 gap-4">
              <FloatingLabelInput id="city" label="City" value={city} onChange={(e) => setCity(e.target.value)} icon={<FiMapPin size={20} />} required />
              <FloatingLabelInput id="postalCode" label="Pincode" type="number" value={postalCode} onChange={(e) => { if (e.target.value.length <= 6) setPostalCode(e.target.value); }} icon={<PinIcon size={20} />} required />
            </div>

            <FloatingLabelSelect id="state" label="State" value={state} onChange={(e) => setState(e.target.value)} options={indianStates} required icon={<FiMap size={20} />} />

            {error && <p className="text-red-500 text-sm text-center bg-red-50 p-2 rounded animate-pulse">{error}</p>}
          </form>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-100 border-t border-gray-200 z-50 shadow-lg">
        <div className="max-w-md mx-auto space-y-4">
          <CustomButton onClick={handleFinishSetup} variant={Variant.Filled} disabled={isSubmitting} className="h-12 text-lg w-full">
            {isSubmitting ? (
              <div className="flex items-center justify-center gap-2">
                <Spinner /><span>{statusMessage}</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <span>Complete Registration</span><FiCheckCircle />
              </div>
            )}
          </CustomButton>
        </div>
      </div>
    </div>
  );
};

export default BusinessInfoPage;