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


  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Creating Account...');

  const [formData, setFormData] = useState({
    businessName: '',
    businessType: '',
    businessCategory: '',
    customBusinessType: '',
    customBusinessCategory: '',
    gstType: '',
    gstin: '',
    streetAddress: '',
    city: '',
    state: '',
    postalCode: '',
  })

  const handleClearData = () => {
    const clearedFormData = {
      businessName: '',
      businessType: '',
      businessCategory: '',
      customBusinessType: '',
      customBusinessCategory: '',
      gstType: '',
      gstin: '',
      streetAddress: '',
      city: '',
      state: '',
      postalCode: '',
    };

    setFormData(clearedFormData);

    const existingData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');

    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        ...existingData,
        ...clearedFormData,
      })
    );

    setError(null);
  };

  const previousData = location.state || JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');

  // Guard: Ensure user came from Step 1
  if (!previousData.email || !previousData.password) {
    return <Navigate to={ROUTES.SIGNUP} replace />;
  }

  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);

    if (saved) {
      const parsed = JSON.parse(saved);

      setFormData({
        businessName: parsed.businessName || '',
        businessType: parsed.businessType || '',
        businessCategory: parsed.businessCategory || '',
        customBusinessType: parsed.customBusinessType || '',
        customBusinessCategory: parsed.customBusinessCategory || '',
        gstType: parsed.gstType || '',
        gstin: parsed.gstin || '',
        streetAddress: parsed.streetAddress || '',
        city: parsed.city || '',
        state: parsed.state || '',
        postalCode: parsed.postalCode || '',
      });
    }

    setIsHydrated(true);
  }, []);

  const validateForm = (): boolean => {
    const finalBusinessType = formData.businessType === 'Other' ? formData.customBusinessType : formData.businessType;
    const finalBusinessCategory = formData.businessCategory === 'Other' ? formData.customBusinessCategory : formData.businessCategory;

    if (
      !formData.businessName.trim() ||
      !finalBusinessType.trim() ||
      !finalBusinessCategory.trim() ||
      !formData.streetAddress.trim() ||
      !formData.city.trim() ||
      !formData.state.trim() ||
      !formData.postalCode.trim()
    ) {
      setError('Please fill out all required fields.');
      return false;
    }

    if (formData.gstType === 'Regular' || formData.gstType === 'Composite') {
      if (!formData.gstin.trim() || formData.gstin.length !== 15) {
        setError('Valid 15-character GSTIN is required.');
        return false;
      }
    }

    if (formData.postalCode.length !== 6) {
      setError('Pincode must be exactly 6 digits.');
      return false;
    }
    return true;
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }


  useEffect(() => {
    if (!isHydrated) return;

    const existingData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');

    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        ...existingData,
        ...formData,
      })
    );
  }, [formData, isHydrated]);


  const handleFinishSetup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    setIsSubmitting(true);
    setStatusMessage('Configuring Dashboard...');

    const finalBusinessType = formData.businessType === 'Other' ? formData.customBusinessType : formData.businessType;
    const finalBusinessCategory = formData.businessCategory === 'Other' ? formData.customBusinessCategory : formData.businessCategory;
    const finalGstin = formData.gstType === 'NA' ? '' : formData.gstin.toUpperCase();

    try {
      // 1. Prepare Business Payload
      const businessInfoPayload = {
        businessName: formData.businessName,
        businessType: finalBusinessType,
        businessCategory: finalBusinessCategory,
        gstType: formData.gstType,
        gstin: finalGstin,
        streetAddress: formData.streetAddress,
        city: formData.city,
        state: formData.state,
        postalCode: formData.postalCode,
        fullAddress: `${formData.streetAddress}, ${formData.city}, ${formData.state} - ${formData.postalCode}`,
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
        gstScheme: formData.gstType,
        taxType: formData.gstType === 'Regular' ? 'exclusive' : 'exclusive',
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
      <div className="flex flex-col h-screen overflow-hidden bg-white w-full lg:w-1/2">
        <div className="flex-shrink-0 bg-white pt-4 pb-2 px-4 shadow-sm z-40 flex justify-center">
          <div className="w-full max-w-xs">
            <Stepper totalSteps={2} currentStep={2} onStepClick={handleStepClick} />
          </div>
        </div>

        <div className={`flex-grow px-4 pb-32 ${(error || formData.businessType === "Other" || formData.businessCategory === "Other") ? 'overflow-y-auto' : 'overflow-hidden'}`}>
          <div className="flex justify-between items-center mb-3 mt-3">
            <h1 className="text-3xl font-bold">Business Details</h1>
            <button
              type="button"
              onClick={handleClearData}
              className="text-sm font-medium text-red-500 hover:text-red-700 transition-colors bg-red-50 px-3 py-1.5 rounded-sm border border-red-100 mb-1"
            >
              Clear Form
            </button>
          </div>
          <div className="bg-white p-3 space-y-2 pt-4 pb-10 w-[100%] mx-auto">
            <form onSubmit={handleFinishSetup} className="flex flex-col space-y-4 min-h-full">
              {error && (
                <div className="sticky top-0 z-50 bg-red-50 border border-red-200 text-red-600 text-sm text-center p-3 rounded-md font-medium shadow-sm">
                  {error}
                </div>
              )}
              <div className="flex flex-col space-y-4">
                <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
                  <FiAtSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                  <FloatingLabelInput
                    id="businessName"
                    label="Business Name"
                    value={formData.businessName}
                    onChange={(e) => handleChange('businessName', e.target.value)
                    }
                    required
                    className="pl-12 py-2.5 bg-white border border-[#7D7777A3] shadow-sm"
                  />
                </div>

                <div className={`gap-4 ${formData.businessType !== "Other" && formData.businessCategory !== "Other" ? "grid grid-cols-1 md:grid-cols-2" : "flex flex-col"}`}>
                  {/* Business Type */}
                  <div className={`${formData.businessType !== "Other" && formData.businessCategory !== "Other" ? "w-full" : ""}`}>
                    {formData.businessType !== "Other" && formData.businessCategory !== "Other" ? (
                      <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
                        <FiHome className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                        <FloatingLabelSelect
                          id="businessType"
                          label="Business Type"
                          value={formData.businessType}
                          onChange={(e) => handleChange('businessType', e.target.value)}
                          options={businessTypeOptions}
                          required
                          className="pl-12 py-2.5 bg-white border border-[#7D7777A3] shadow-sm"
                        />
                      </div>
                    ) : (
                      <div className={`w-full ${formData.businessType === "Other" ? "flex flex-col md:flex-row gap-4" : ""}`}>
                        {formData.businessType === "Other" ? (
                          <>
                            <div className="relative w-full md:w-1/2 [&_label]:!left-[3rem] [&_label]:bg-white">
                              <FiHome className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                              <FloatingLabelSelect
                                id="businessType"
                                label="Business Type"
                                value={formData.businessType}
                                onChange={(e) => handleChange('businessType', e.target.value)}
                                options={businessTypeOptions}
                                required
                                className="pl-12 py-2.5 bg-white border border-[#7D7777A3] shadow-sm"
                              />
                            </div>

                            <div className="relative w-full md:w-1/2 [&_label]:!left-[3rem] [&_label]:bg-white">
                              <FiHome className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                              <FloatingLabelInput
                                id="customBusinessType"
                                label="Specify Business Type"
                                value={formData.customBusinessType}
                                onChange={(e) => handleChange('customBusinessType', e.target.value)}
                                required
                                className="pl-12 py-2.5 bg-white border border-[#7D7777A3] shadow-sm"
                              />
                            </div>
                          </>
                        ) : (
                          <div className="relative w-full [&_label]:!left-[3rem] [&_label]:bg-white">
                            <FiHome className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                            <FloatingLabelSelect
                              id="businessType"
                              label="Business Type"
                              value={formData.businessType}
                              onChange={(e) => handleChange('businessType', e.target.value)}
                              options={businessTypeOptions}
                              required
                              className="pl-12 py-2.5 bg-white border border-[#7D7777A3] shadow-sm"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Category */}
                  <div className={`${formData.businessType !== "Other" && formData.businessCategory !== "Other" ? "w-full" : "flex flex-col md:flex-row gap-4 w-full"}`}>
                    {formData.businessType !== "Other" && formData.businessCategory !== "Other" ? (
                      <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
                        <FiTag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                        <FloatingLabelSelect
                          id="businessCategory"
                          label="Category"
                          value={formData.businessCategory}
                          onChange={(e) => handleChange('businessCategory', e.target.value)}
                          options={businessCategoryOptions}
                          required
                          className="pl-12 py-2.5 bg-white border border-[#7D7777A3] shadow-sm"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col md:flex-row gap-4 w-full">
                        <div className={`relative [&_label]:!left-[3rem] [&_label]:bg-white ${formData.businessCategory === "Other" ? "w-full md:w-1/2" : "flex-1"}`}>
                          <FiTag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                          <FloatingLabelSelect
                            id="businessCategory"
                            label="Category"
                            value={formData.businessCategory}
                            onChange={(e) => handleChange('businessCategory', e.target.value)}
                            options={businessCategoryOptions}
                            required
                            className="pl-12 py-2.5 bg-white border border-[#7D7777A3] shadow-sm"
                          />
                        </div>
                        {formData.businessCategory === "Other" && (
                          <div className="relative w-full md:w-1/2 [&_label]:!left-[3rem] [&_label]:bg-white">
                            <FiTag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                            <FloatingLabelInput
                              id="customBusinessCategory"
                              label="Specify Category"
                              value={formData.customBusinessCategory}
                              onChange={(e) => handleChange('customBusinessCategory', e.target.value)}
                              required
                              className="pl-12 py-2.5 bg-white border border-[#7D7777A3] shadow-sm"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
                    <Scale className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                    <FloatingLabelSelect
                      id="gstType"
                      label="GST Registration Type"
                      value={formData.gstType}
                      onChange={(e) => handleChange('gstType', e.target.value)}
                      options={gstTypeOptions}
                      required
                      className="pl-12 py-2.5 bg-white border border-[#7D7777A3] shadow-sm"
                    />
                  </div>

                  <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
                    <FiHash className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                    <FloatingLabelInput
                      id="gstin"
                      label="GSTIN Number"
                      value={formData.gstin}
                      onChange={(e) => {
                        if (e.target.value.length <= 15) handleChange('gstin', e.target.value.toUpperCase());
                      }}
                      required={formData.gstType === "Regular" || formData.gstType === "Composite"}
                      disabled={formData.gstType === "NA"}
                      className={`pl-12 py-2.5 border border-[#7D7777A3] shadow-sm bg-white ${formData.gstType === "NA" ? "cursor-not-allowed" : ""
                        }`}
                    />
                  </div>
                </div>

                <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
                  <Building2Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                  <FloatingLabelInput
                    id="streetAddress"
                    label="Street Address / Area"
                    value={formData.streetAddress}
                    onChange={(e) => handleChange('streetAddress', e.target.value)}
                    required
                    className="pl-12 py-2.5 bg-white border border-[#7D7777A3] shadow-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
                    <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                    <FloatingLabelInput
                      id="city"
                      label="City"
                      value={formData.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      required
                      className="pl-12 py-2.5 bg-white border border-[#7D7777A3] shadow-sm"
                    />
                  </div>
                  <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
                    <PinIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                    <FloatingLabelInput
                      id="postalCode"
                      label="Pincode"
                      type="text"
                      inputMode='numeric'
                      value={formData.postalCode}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        if (digits.length <= 6) handleChange('postalCode', digits);
                      }}
                      required
                      className="pl-12 py-2.5 bg-white border border-[#7D7777A3] shadow-sm"
                    />
                  </div>
                </div>

                <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
                  <FiMap className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" size={20} />
                  <FloatingLabelSelect
                    id="state"
                    label="State"
                    value={formData.state}
                    onChange={(e) => handleChange('state', e.target.value)}
                    options={indianStates}
                    required
                    className="pl-12 py-2.5 bg-white border border-[#7D7777A3] shadow-sm"
                  />
                </div>

              </div>
            </form>
          </div>
        </div>

        <div className="fixed lg:absolute bottom-0 left-0 lg:left-auto right-0 lg:w-1/2 p-4 h-[110px] bg-gray-100 border-t border-gray-200 z-50 shadow-lg">
          <div className="max-w-md mx-auto space-y-3">
            <CustomButton
              type="submit"
              variant={Variant.Filled}
              onClick={handleFinishSetup}
              disabled={isSubmitting}
              className="w-full !bg-[#141212] hover:!bg-[#2a2626] !text-[#FFFBFB]"
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