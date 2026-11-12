import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, Gift, Hash, House, LoaderCircle, MapPin, ReceiptText, RotateCcw, Store } from 'lucide-react';
import { ROUTES } from '../../constants/routes.constants';
import { PLANS, ROLES } from '../../enums';
import { registerUserWithDetails } from '../../lib/AuthOperations';
import { saveLeadProgress } from '../../lib/Lead';
import { auth } from '../../lib/Firebase';
import RegistrationLoading from '../Loading/BusinessInfoPage';
import { useAuth } from '../../context/auth-context';
import { BillSlideshow } from './BillSlideshow';
import {
  AuthCard,
  AuthLayout,
  AuthStepper,
  CardFooter,
  CardHeading,
  ErrorBanner,
  Field,
  FormSection,
  FormSections,
  PANEL_MUTED,
  SelectInput,
  SupportLink,
  TextInput,
  authBtn,
} from './AuthUI';

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

// `gstType` keeps its stored values (Regular-Inclusive / Regular-Exclusive / Composite / NA);
// the page shows them as three choices plus an include / add-on-top choice for Regular.
type GstKind = 'regular' | 'composite' | 'na';
const GST_CHOICES: { kind: GstKind; label: string; note: string }[] = [
  { kind: 'regular', label: 'Regular', note: 'GSTIN needed' },
  { kind: 'composite', label: 'Composition', note: 'GSTIN needed' },
  { kind: 'na', label: 'Not registered', note: 'No GSTIN' },
];
const gstKindOf = (gstType: string): GstKind | '' =>
  gstType.startsWith('Regular') ? 'regular' : gstType === 'Composite' ? 'composite' : gstType === 'NA' ? 'na' : '';
const GST_VALUE: Record<GstKind, string> = { regular: 'Regular-Inclusive', composite: 'Composite', na: 'NA' };

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

const EMPTY_FORM = {
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
type BusinessForm = typeof EMPTY_FORM;
type FieldErrors = Partial<Record<keyof BusinessForm, string>>;

type PinStatus = 'idle' | 'looking' | 'found' | 'missed';
const PIN_NOTES: Record<PinStatus, React.ReactNode> = {
  idle: 'City and state fill in from this.',
  looking: 'Finding your city…',
  found: (
    <span className="flex items-center gap-1 text-green-700">
      <Check size={14} strokeWidth={2.25} aria-hidden="true" />
      City and state filled in
    </span>
  ),
  missed: "Couldn't find it. Type your city and state.",
};

// ─── Bill slideshow panel ──────────────────────────────────────────────────

const BillPanel: React.FC<React.ComponentProps<typeof BillSlideshow>> = (props) => (
  <div className="sticky top-0 flex flex-col gap-5 px-10 pb-10 pt-12">
    <div>
      <h2 className="text-[22px] font-semibold leading-[30px] tracking-[-0.02em]">Your bills will look like this</h2>
      <p className={`mt-1 text-sm leading-[21px] ${PANEL_MUTED}`}>
        A sample bill with your shop's details. It updates as you type.
      </p>
    </div>
    <BillSlideshow {...props} />
  </div>
);

// ─── Page ───────────────────────────────────────────────────────────────────

const BusinessInfoPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, loading: authLoading } = useAuth();

  const [referralCode, setReferralCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [awaitingAuth, setAwaitingAuth] = useState(false);
  const [formData, setFormData] = useState<BusinessForm>(EMPTY_FORM);
  const [isHydrated, setIsHydrated] = useState(false);
  const [pinStatus, setPinStatus] = useState<PinStatus>('idle');
  const [showBills, setShowBills] = useState(false); // phone: bill slideshow opened
  const pinLookup = useRef<AbortController | null>(null);

  const previousData = location.state || JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');

  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setFormData((prev) => {
        const next = { ...prev };
        (Object.keys(EMPTY_FORM) as (keyof BusinessForm)[]).forEach((k) => {
          next[k] = parsed[k] || '';
        });
        return next;
      });
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const existingData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ ...existingData, ...formData }));
  }, [formData, isHydrated]);

  useEffect(() => {
    if (!awaitingAuth || authLoading) return;
    if (currentUser) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      navigate(ROUTES.HOME);
    }
  }, [awaitingAuth, authLoading, currentUser, navigate]);

  useEffect(() => () => pinLookup.current?.abort(), []);

  // Guard: ensure the user came from step 1 (after every hook, so hook order never changes).
  if (!previousData.email || !previousData.password) {
    return <Navigate to={ROUTES.SIGNUP} replace />;
  }

  const handleChange = (field: keyof BusinessForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // City and state from the pincode (India Post data). Silent on failure; both stay editable.
  const lookUpPincode = async (pin: string) => {
    pinLookup.current?.abort();
    const controller = new AbortController();
    pinLookup.current = controller;
    setPinStatus('looking');
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: controller.signal });
      const data = await res.json();
      const office = data?.[0]?.Status === 'Success' ? data[0].PostOffice?.[0] : null;
      if (!office) {
        setPinStatus('missed');
        return;
      }
      const apiState = String(office.State || '').replace(/&/g, 'and').toLowerCase();
      const state = indianStates.find((s) => s.value.toLowerCase() === apiState)?.value;
      setFormData((prev) => ({ ...prev, city: office.District || prev.city, state: state || prev.state }));
      setErrors((prev) => ({ ...prev, city: undefined, state: state ? undefined : prev.state }));
      setPinStatus('found');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setPinStatus('missed');
    }
  };

  const handlePincode = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    handleChange('postalCode', digits);
    if (digits.length === 6) void lookUpPincode(digits);
    else {
      pinLookup.current?.abort();
      setPinStatus('idle');
    }
  };

  const gstKind = gstKindOf(formData.gstType);
  const needsGstin = gstKind === 'regular' || gstKind === 'composite';

  const validateForm = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!formData.businessName.trim()) next.businessName = 'Enter your business name.';
    if (!formData.businessType) next.businessType = 'Choose a business type.';
    else if (formData.businessType === 'Other' && !formData.customBusinessType.trim()) next.customBusinessType = 'Enter your business type.';
    if (!formData.businessCategory) next.businessCategory = 'Choose a category.';
    else if (formData.businessCategory === 'Other' && !formData.customBusinessCategory.trim()) next.customBusinessCategory = 'Enter your category.';
    if (!gstKind) next.gstType = 'Choose your GST registration.';
    else if (needsGstin && formData.gstin.trim().length !== 15) next.gstin = 'GSTIN has 15 characters.';
    if (!formData.streetAddress.trim()) next.streetAddress = 'Enter your shop address.';
    if (formData.postalCode.length !== 6) next.postalCode = 'Pincode has 6 digits.';
    if (!formData.city.trim()) next.city = 'Enter your city.';
    if (!formData.state) next.state = 'Choose your state.';
    return next;
  };

  const handleClearData = () => {
    setFormData(EMPTY_FORM);
    setReferralCode('');
    setErrors({});
    setError(null);
    setPinStatus('idle');
    const existingData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ ...existingData, ...EMPTY_FORM }));
  };

  const handleFinishSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const next = validateForm();
    setErrors(next);
    const firstBad = Object.keys(next)[0];
    if (firstBad) {
      document.getElementById(firstBad === 'gstType' ? 'gst-regular' : firstBad)?.focus();
      return;
    }

    setIsSubmitting(true);
    setShowLoadingScreen(true);

    const finalBusinessType = formData.businessType === 'Other' ? formData.customBusinessType : formData.businessType;
    const finalBusinessCategory = formData.businessCategory === 'Other' ? formData.customBusinessCategory : formData.businessCategory;
    const finalGstin = formData.gstType === 'NA' ? '' : formData.gstin.toUpperCase();
    const finalReferralCode = referralCode.trim().toUpperCase();

    try {
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

      const planExpiryDate = new Date();
      planExpiryDate.setDate(planExpiryDate.getDate() + 28);
      planExpiryDate.setHours(23, 59, 59, 999);

      const planPayload = {
        pack: PLANS.ENTERPRISE,
        validity: 'active',
        expiryDate: planExpiryDate,
        isTrial: true,
      };

      let mappedGstScheme = 'none';
      let mappedTaxType = 'exclusive';

      if (formData.gstType === 'Composite') {
        mappedGstScheme = 'composition';
      } else if (formData.gstType.startsWith('Regular')) {
        mappedGstScheme = 'regular';
        mappedTaxType = formData.gstType === 'Regular-Inclusive' ? 'inclusive' : 'exclusive';
      }

      const salesSettingsPayload = {
        gstScheme: mappedGstScheme,
        gstin: finalGstin,
        taxType: mappedTaxType,
      };

      const catalogueSalesSettingsPayload = {
        gstScheme: mappedGstScheme,
        taxType: mappedTaxType,
      };

      // Just pass the raw string code down the pipeline!
      await registerUserWithDetails(
        previousData.fullName,
        previousData.phoneNumber,
        previousData.email,
        previousData.password,
        ROLES.OWNER,
        businessInfoPayload,
        planPayload,
        salesSettingsPayload,
        catalogueSalesSettingsPayload,
        [],
        finalReferralCode
      );

      const currentUid = auth.currentUser?.uid;
      await saveLeadProgress(previousData.email, {
        status: 'Trial Plan',
        currentStep: 'Completed',
        userId: currentUid,
        convertedAt: new Date(),
        plan: 'Enterprise Trial',
      });

      setAwaitingAuth(true);
    } catch (err) {
      console.error('Registration failed:', err);
      // Shows the Cloud Function's message, e.g. when the referral code is invalid.
      setError((err as Error)?.message || 'Setup failed. Please check your internet and try again.');
      setIsSubmitting(false);
      setShowLoadingScreen(false);
    }
  };

  const goToStepOne = () => navigate(ROUTES.SIGNUP, { state: previousData });

  if (showLoadingScreen) return <RegistrationLoading />;

  const place = [formData.streetAddress, formData.city, formData.state].filter(Boolean).join(', ');
  const billPreview = {
    name: formData.businessName || 'Your shop name',
    address: (place + (formData.postalCode ? ` - ${formData.postalCode}` : '')) || 'Your shop address',
    phone: previousData.phoneNumber || '',
    gstin: needsGstin ? formData.gstin : '',
    // Same rule as the printed bills: only regular GST shops issue a tax invoice.
    title: gstKind === 'regular' ? 'TAX INVOICE' : 'BILL OF SUPPLY',
  };

  return (
    <AuthLayout panelLabel="Bill preview" panel={<BillPanel {...billPreview} />} headerAside={<SupportLink />}>
      <form onSubmit={handleFinishSetup} noValidate className="mx-auto w-full max-w-[680px]">
        <AuthCard
          split
          top={<AuthStepper step={2} onStepOne={goToStepOne} />}
          footer={
            <CardFooter sticky>
              <button type="button" onClick={goToStepOne} className={authBtn.secondary}>
                <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
                <span className="max-sm:sr-only">Back</span>
              </button>
              <button type="button" onClick={handleClearData} className={`${authBtn.ghost} max-sm:hidden`}>
                <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
                Clear form
              </button>
              <span className="flex-1 max-sm:hidden" />
              <span className="text-[13px] text-slate-500 max-sm:hidden">Step 2 of 2</span>
              <button type="submit" disabled={isSubmitting} className={`${authBtn.primary} max-sm:flex-1`}>
                {isSubmitting ? (
                  <LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <Check size={16} strokeWidth={2} aria-hidden="true" />
                )}
                {isSubmitting ? 'Setting up…' : 'Finish setup'}
              </button>
            </CardFooter>
          }
        >
          <CardHeading icon={Store} title="Tell us about your shop" subtitle="This prints on every bill. You can change it later in Edit profile." />

          {error && <ErrorBanner>{error}</ErrorBanner>}

          <div className="rounded-sm border border-line bg-white shadow-card lg:hidden">
            <button
              type="button"
              onClick={() => setShowBills((s) => !s)}
              aria-expanded={showBills}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-sm px-4 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <ReceiptText size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-blue-700" />
              <span className="flex-1">See how your bills will look</span>
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className={`shrink-0 text-slate-500 transition-transform ${showBills ? 'rotate-180' : ''}`} />
            </button>
            {showBills && (
              <div className="border-t border-line p-3">
                <BillSlideshow {...billPreview} tone="light" />
              </div>
            )}
          </div>

          <FormSections>
            <FormSection id="bus-shop" icon={House} title="Your shop" note="Shown at the top of every bill.">
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <Field label="Business name" htmlFor="businessName" required error={errors.businessName} className="sm:col-span-2">
                  <TextInput
                    type="text"
                    autoComplete="organization"
                    placeholder="Name on your bills"
                    value={formData.businessName}
                    onChange={(e) => handleChange('businessName', e.target.value)}
                  />
                </Field>
                <Field label="Business type" htmlFor="businessType" required error={errors.businessType}>
                  <SelectInput
                    placeholder="Select type"
                    options={businessTypeOptions}
                    value={formData.businessType}
                    onChange={(e) => handleChange('businessType', e.target.value)}
                  />
                </Field>
                <Field label="Category" htmlFor="businessCategory" required error={errors.businessCategory}>
                  <SelectInput
                    placeholder="Select category"
                    options={businessCategoryOptions}
                    value={formData.businessCategory}
                    onChange={(e) => handleChange('businessCategory', e.target.value)}
                  />
                </Field>
                {formData.businessType === 'Other' && (
                  <Field label="Your business type" htmlFor="customBusinessType" required error={errors.customBusinessType}>
                    <TextInput
                      type="text"
                      placeholder="For example, Repairs"
                      value={formData.customBusinessType}
                      onChange={(e) => handleChange('customBusinessType', e.target.value)}
                    />
                  </Field>
                )}
                {formData.businessCategory === 'Other' && (
                  <Field
                    label="Your category"
                    htmlFor="customBusinessCategory"
                    required
                    error={errors.customBusinessCategory}
                    className={formData.businessType === 'Other' ? '' : 'sm:col-start-2'}
                  >
                    <TextInput
                      type="text"
                      placeholder="For example, Hardware"
                      value={formData.customBusinessCategory}
                      onChange={(e) => handleChange('customBusinessCategory', e.target.value)}
                    />
                  </Field>
                )}
              </div>
            </FormSection>

            <FormSection id="bus-gst" icon={ReceiptText} tone="green" title="GST" note="Decides how tax shows on your bills.">
              <fieldset className="min-w-0" aria-describedby={errors.gstType ? 'gstType-msg' : undefined}>
                <legend className="mb-2 text-[13px] font-medium leading-[18px]">
                  GST registration <span aria-hidden="true" className="text-red-700">*</span>
                </legend>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {GST_CHOICES.map(({ kind, label, note }) => {
                    const on = gstKind === kind;
                    return (
                      <label
                        key={kind}
                        className={`relative flex min-h-12 cursor-pointer items-center gap-3 rounded-sm border px-3.5 py-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-600 sm:min-h-[54px] sm:flex-col sm:items-start sm:gap-0.5 ${
                          on ? 'border-blue-600 bg-blue-50 shadow-[inset_0_0_0_1px_#155dfc]' : `bg-[#f8faff] hover:border-blue-600 ${errors.gstType ? 'border-red-700' : 'border-slate-400'}`
                        }`}
                      >
                        <input
                          id={`gst-${kind}`}
                          type="radio"
                          name="gstType"
                          checked={on}
                          onChange={() => {
                            // Switching between Regular and the others keeps a chosen include / exclude setting.
                            if (kind !== 'regular' || !formData.gstType.startsWith('Regular')) handleChange('gstType', GST_VALUE[kind]);
                          }}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={`grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] sm:absolute sm:right-2.5 sm:top-2.5 sm:size-[18px] ${
                            on ? 'border-blue-600 bg-blue-600 text-white sm:border-0' : 'border-slate-400 bg-white sm:hidden'
                          }`}
                        >
                          {on && <Check size={12} strokeWidth={3} className="max-sm:hidden" />}
                          {on && <span className="size-2.5 rounded-full bg-white sm:hidden" />}
                        </span>
                        <span className={`text-[15px] font-semibold sm:text-sm ${on ? 'text-blue-800' : ''}`}>{label}</span>
                        <span className="ml-auto text-xs text-slate-500 sm:ml-0">{note}</span>
                      </label>
                    );
                  })}
                </div>
                {errors.gstType && (
                  <p id="gstType-msg" className="mt-1.5 text-xs leading-[17px] text-red-700">
                    {errors.gstType}
                  </p>
                )}
              </fieldset>

              {gstKind === 'regular' && (
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span id="tax-type-label" className="text-[13px] font-medium leading-[18px]">
                    Prices you type in
                  </span>
                  <div role="radiogroup" aria-labelledby="tax-type-label" className="grid grid-cols-2 gap-[3px] rounded-sm border border-line bg-sunken p-[3px] sm:inline-grid">
                    {(
                      [
                        ['Regular-Inclusive', 'Includes GST'],
                        ['Regular-Exclusive', 'Excludes GST'],
                      ] as const
                    ).map(([value, label]) => {
                      const on = formData.gstType === value;
                      return (
                        <label
                          key={value}
                          className={`relative flex h-10 cursor-pointer items-center justify-center rounded-[4px] px-3.5 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-600 sm:h-8 sm:text-[13px] ${
                            on ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(21,48,140,0.12)]' : 'text-slate-600'
                          }`}
                        >
                          <input type="radio" name="taxType" checked={on} onChange={() => handleChange('gstType', value)} className="sr-only" />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {needsGstin && (
                <Field label="GSTIN" htmlFor="gstin" required error={errors.gstin}>
                  <TextInput
                    icon={Hash}
                    type="text"
                    maxLength={15}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="15 characters, like 27ABCDE1234F1Z5"
                    value={formData.gstin}
                    onChange={(e) => handleChange('gstin', e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))}
                    className="uppercase tracking-[0.04em] placeholder:normal-case placeholder:tracking-normal"
                    end={<span className="shrink-0 text-xs tabular-nums text-slate-500">{formData.gstin.length}/15</span>}
                  />
                </Field>
              )}
            </FormSection>

            <FormSection id="bus-address" icon={MapPin} tone="amber" title="Address" note="Printed under your shop name.">
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:gap-x-4">
                <Field label="Shop address" htmlFor="streetAddress" required error={errors.streetAddress} className="col-span-2">
                  <TextInput
                    type="text"
                    autoComplete="street-address"
                    placeholder="Shop number, market, area"
                    value={formData.streetAddress}
                    onChange={(e) => handleChange('streetAddress', e.target.value)}
                  />
                </Field>
                <Field label="Pincode" htmlFor="postalCode" required error={errors.postalCode} help={PIN_NOTES[pinStatus]}>
                  <TextInput
                    type="text"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={6}
                    placeholder="6 digits"
                    value={formData.postalCode}
                    onChange={(e) => handlePincode(e.target.value)}
                    className="tabular-nums tracking-[0.06em]"
                  />
                </Field>
                <Field label="City" htmlFor="city" required error={errors.city}>
                  <TextInput
                    type="text"
                    autoComplete="address-level2"
                    placeholder="City"
                    value={formData.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                  />
                </Field>
                <Field label="State" htmlFor="state" required error={errors.state} className="col-span-2">
                  <SelectInput
                    placeholder="Select state"
                    options={indianStates}
                    value={formData.state}
                    onChange={(e) => handleChange('state', e.target.value)}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection id="bus-referral" icon={Gift} tone="pink" title="Referred by a partner?" note="Optional. Enter their code if you have one.">
              <Field label="Referral code" htmlFor="referralCode" optional className="sm:max-w-[300px]">
                <TextInput
                  type="text"
                  autoComplete="off"
                  placeholder="Partner's code"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  className="uppercase tracking-[0.04em] placeholder:normal-case placeholder:tracking-normal"
                />
              </Field>
            </FormSection>
          </FormSections>

          <button type="button" onClick={handleClearData} className={`${authBtn.ghost} self-center sm:hidden`}>
            <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
            Clear form
          </button>
        </AuthCard>
      </form>
    </AuthLayout>
  );
};

export default BusinessInfoPage;
