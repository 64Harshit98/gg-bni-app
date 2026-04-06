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
import bgMain from '../../assets/bg-main.png';
import sellarHeading from '../../assets/sellar-logo-heading.png';

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
    <div className="flex h-screen overflow-hidden bg-gray-200">
  {/* Left visual (Figma style) */}
  <div className="hidden lg:block w-1/2 relative overflow-hidden bg-gray-200">
    <img
      src={bgMain}
      alt="Registration visual"
      className="h-full w-full object-cover"
    />
    <div className="absolute inset-0 flex items-center justify-center">
      <img
        src={sellarHeading}
        alt="Sellar Heading"
        className="w-48 h-auto"
      />
    </div>
  </div>

  {/* Right content keeps your original sizing/font logic */}
  <div className="flex flex-col h-screen overflow-hidden bg-gray-100 w-full lg:w-1/2">
    <div className="flex-shrink-0 bg-gray-100 pt-4 pb-2 px-4 shadow-sm z-40 flex justify-center">
      <div className="w-full max-w-xs">
        <Stepper totalSteps={2} currentStep={2} onStepClick={handleStepClick} />
      </div>
    </div>

    <div className="flex-grow px-4 pb-0 overflow-y-auto">
      <div className="flex justify-between items-end mb-3 mt-3">
        <h1 className="text-4xl font-bold">Business Details</h1>
      </div>
      <div className="bg-gray-100 p-3 space-y-2 pt-4 pb-4 w-[100%] mx-auto">
        <form onSubmit={handleFinishSetup} className="flex flex-col space-y-4">
          <div className="flex flex-col space-y-4">
            <div className="relative [&_label]:!left-[3rem]">
              <FiAtSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
              <FloatingLabelInput
                id="businessName"
                label="Business Name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                className="pl-12 py-2.5 bg-gray-100 border border-[#7D7777A3] shadow-sm"
              />
            </div>

            <div className={`gap-4 ${businessType !== "Other" && businessCategory !== "Other" ? "grid grid-cols-1 md:grid-cols-2" : "flex flex-col"}`}>
              {/* Business Type */}
              <div className={`${businessType !== "Other" && businessCategory !== "Other" ? "w-full" : ""}`}>
                {businessType !== "Other" && businessCategory !== "Other" ? (
                  <div className="relative [&_label]:!left-[3rem]">
                    <FiHome className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                    <FloatingLabelSelect
                      id="businessType"
                      label="Business Type"
                      value={businessType}
                      onChange={(e) => setBusinessType(e.target.value)}
                      options={businessTypeOptions}
                      required
                      className="pl-12 py-2.5 bg-gray-100 border border-[#7D7777A3] shadow-sm"
                    />
                  </div>
                ) : (
                  <div className={`w-full ${businessType === "Other" ? "flex flex-col md:flex-row gap-4" : ""}`}>
                    {businessType === "Other" ? (
                      <>
                        <div className="relative w-full md:w-1/2 [&_label]:!left-[3rem]">
                          <FiHome className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                          <FloatingLabelSelect
                            id="businessType"
                            label="Business Type"
                            value={businessType}
                            onChange={(e) => setBusinessType(e.target.value)}
                            options={businessTypeOptions}
                            required
                            className="pl-12 py-2.5 bg-gray-100 border border-[#7D7777A3] shadow-sm"
                          />
                        </div>

                        <div className="relative w-full md:w-1/2 [&_label]:!left-[3rem]">
                          <FiHome className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                          <FloatingLabelInput
                            id="customBusinessType"
                            label="Specify Business Type"
                            value={customBusinessType}
                            onChange={(e) => setCustomBusinessType(e.target.value)}
                            required
                            className="pl-12 py-2.5 bg-gray-100 border border-[#7D7777A3] shadow-sm"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="relative w-full [&_label]:!left-[3rem]">
                        <FiHome className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                        <FloatingLabelSelect
                          id="businessType"
                          label="Business Type"
                          value={businessType}
                          onChange={(e) => setBusinessType(e.target.value)}
                          options={businessTypeOptions}
                          required
                          className="pl-12 py-2.5 bg-gray-100 border border-[#7D7777A3] shadow-sm"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Category */}
              <div className={`${businessType !== "Other" && businessCategory !== "Other" ? "w-full" : "flex flex-col md:flex-row gap-4 w-full"}`}>
                {businessType !== "Other" && businessCategory !== "Other" ? (
                  <div className="relative [&_label]:!left-[3rem]">
                    <FiTag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                    <FloatingLabelSelect
                      id="businessCategory"
                      label="Category"
                      value={businessCategory}
                      onChange={(e) => setBusinessCategory(e.target.value)}
                      options={businessCategoryOptions}
                      required
                      className="pl-12 py-2.5 bg-gray-100 border border-[#7D7777A3] shadow-sm"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row gap-4 w-full">
                    <div className={`relative [&_label]:!left-[3rem] ${businessCategory === "Other" ? "w-full md:w-1/2" : "flex-1"}`}>
                      <FiTag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                      <FloatingLabelSelect
                        id="businessCategory"
                        label="Category"
                        value={businessCategory}
                        onChange={(e) => setBusinessCategory(e.target.value)}
                        options={businessCategoryOptions}
                        required
                        className="pl-12 py-2.5 bg-gray-100 border border-[#7D7777A3] shadow-sm"
                      />
                    </div>
                    {businessCategory === "Other" && (
                      <div className="relative w-full md:w-1/2 [&_label]:!left-[3rem]">
                        <FiTag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                        <FloatingLabelInput
                          id="customBusinessCategory"
                          label="Specify Category"
                          value={customBusinessCategory}
                          onChange={(e) => setCustomBusinessCategory(e.target.value)}
                          required
                          className="pl-12 py-2.5 bg-gray-100 border border-[#7D7777A3] shadow-sm"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative [&_label]:!left-[3rem]">
              <Scale className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
              <FloatingLabelSelect
                id="gstType"
                label="GST Registration Type"
                value={gstType}
                onChange={(e) => setGstType(e.target.value)}
                options={gstTypeOptions}
                required
                className="pl-12 py-2.5 bg-gray-100 border border-[#7D7777A3] shadow-sm"
              />
            </div>

            <div className="relative [&_label]:!left-[3rem]">
              <FiHash className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
              <FloatingLabelInput
                id="gstin"
                label="GSTIN Number"
                value={gstin}
                onChange={(e) => {
                  if (e.target.value.length <= 15) setGstin(e.target.value.toUpperCase());
                }}
                required={gstType === "Regular" || gstType === "Composite"}
                disabled={gstType === "NA"}
                className={`pl-12 py-2.5 border border-[#7D7777A3] shadow-sm bg-gray-100 ${
                  gstType === "NA" ? "cursor-not-allowed" : ""
                }`}
              />
            </div>
          </div>

          <div className="relative [&_label]:!left-[3rem]">
            <Building2Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
            <FloatingLabelInput
              id="streetAddress"
              label="Street Address / Area"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              required
              className="pl-12 py-2.5 bg-gray-100 border border-[#7D7777A3] shadow-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="relative [&_label]:!left-[3rem]">
              <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
              <FloatingLabelInput
                id="city"
                label="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                className="pl-12 py-2.5 bg-gray-100 border border-[#7D7777A3] shadow-sm"
              />
            </div>
            <div className="relative [&_label]:!left-[3rem]">
              <PinIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
              <FloatingLabelInput
                id="postalCode"
                label="Pincode"
                type="number"
                value={postalCode}
                onChange={(e) => {
                  if (e.target.value.length <= 6) setPostalCode(e.target.value);
                }}
                required
                className="pl-12 py-2.5 bg-gray-100 border border-[#7D7777A3] shadow-sm"
              />
            </div>
          </div>

          <div className="relative [&_label]:!left-[3rem]">
            <FiMap className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
            <FloatingLabelSelect
              id="state"
              label="State"
              value={state}
              onChange={(e) => setState(e.target.value)}
              options={indianStates}
              required
              className="pl-12 py-2.5 bg-gray-100 border border-[#7D7777A3] shadow-sm"
            />
          </div>

          </div>
          {error && (
            <p className="text-red-500 text-sm text-center bg-red-50 p-2 rounded-sm animate-pulse">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>

    <div className="w-full bg-gray-100 px-4 py-4 shadow-t-lg">
      <div className="max-w-md mx-auto space-y-4">
        <CustomButton
          onClick={handleFinishSetup}
          variant={Variant.Filled}
          disabled={isSubmitting}
          className="h-12 text-lg w-full !bg-[#141212] hover:!bg-[#2a2626] !text-[#FFFBFB]"
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center gap-2">
              <Spinner />
              <span>{statusMessage}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <span>Complete Registration</span>
              <FiCheckCircle />
            </div>
          )}
        </CustomButton>
      </div>
    </div>
  </div>
</div>
  );
};

export default BusinessInfoPage;