// src/Catalogue/CatalogueEditProfile.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { storage } from '../lib/Firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../context/auth-context';
import { FiCheck, FiX } from 'react-icons/fi';
import { FloatingLabelInput } from '../Components/ui/FloatingLabelInput';
import { FloatingLabelSelect } from '../Components/FloatingLabelSelect';

// ── Shared components from POS EditProfile ───────────────────────────────────
import SectionCard    from '../Pages/Account/EditProfileComponents/Sectioncard';
import LabeledField   from '../Pages/Account/EditProfileComponents/LabeledField';
import IdentityBanner from '../Pages/Account/EditProfileComponents/Identitybanner';

// ── Shared utils from POS EditProfile ────────────────────────────────────────
import {
  compressImage,
  compressLogo,
  validateForm,
  validatePostalCode,
  validatePhone,
  businessTypeOptions,
  businessCategoryOptions,
} from '../Pages/Account/EditProfileComponents/Profiledata';

// ── Catalogue-specific hook + type ───────────────────────────────────────────
import { useCatalogueProfileData, type CatalogueData } from './utils/Usecatalogueprofiledata';

// ─────────────────────────────────────────────────────────────────────────────

const CatalogueEditProfile: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();

  const { catalogue, loading: dataLoading, error: dataError, saveData } =
    useCatalogueProfileData(
      currentUser?.companyId,
      currentUser?.companyId,   // catalogueId === companyId, same as original
      currentUser?.uid,
    );

  // ── Form state ──
  const [formData, setFormData]           = useState<Partial<CatalogueData>>({});
  const [businessType, setBusinessType]   = useState('');
  const [businessCategory, setBusinessCategory] = useState('');

  // ── Image state ──
  const [imageFile, setImageFile]         = useState<File | null>(null);
  const [logoFile, setLogoFile]           = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]       = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  // ── Submission state ──
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [submitError, setSubmitError]     = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // ── Inline validation errors ──
  const [postalError, setPostalError]     = useState<string | null>(null);
  const [phoneError, setPhoneError]       = useState<string | null>(null);

  // ── Populate form when data loads ────────────────────────────────────────────
  useEffect(() => {
    setFormData(catalogue);
    setBusinessType(catalogue.businessType || '');
    setBusinessCategory(catalogue.businessCategory || '');
    if (catalogue.profilePicture) setPreviewUrl(catalogue.profilePicture);
    if (catalogue.companyLogo)    setLogoPreviewUrl(catalogue.companyLogo);
  }, [catalogue]);

  // ── Input handlers ────────────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'gstin') {
      const upper = value.toUpperCase();
      if (upper.length <= 15) setFormData((prev: Partial<CatalogueData>) => ({ ...prev, gstin: upper }));
      return;
    }
    setFormData((prev: Partial<CatalogueData>) => ({ ...prev, [name]: value }));
  };

  const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d{0,6}$/.test(value)) {
      setFormData((prev: Partial<CatalogueData>) => ({ ...prev, postalCode: value }));
      setPostalError(validatePostalCode(value));   // ← shared validator
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d{0,10}$/.test(value)) {
      setFormData((prev: Partial<CatalogueData>) => ({ ...prev, phone: value }));
      setPhoneError(validatePhone(value));         // ← shared validator
    }
  };

  // IdentityBanner calls these with a File directly
  const handleProfileChange = (file: File) => {
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleLogoChange = (file: File) => {
    setLogoFile(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    // Use shared form validator
    const validationError = validateForm(formData);
    if (validationError) { setSubmitError(validationError); return; }

    setIsSubmitting(true);
    try {
      // Profile picture — JPEG via shared compressImage
      let finalPhotoUrl = formData.profilePicture;
      if (imageFile && currentUser?.companyId && currentUser?.uid) {
        const storagePath = `companies/${currentUser.companyId}/users/${currentUser.uid}/profile_pic.jpg`;
        const compressed  = await compressImage(imageFile);     // ← shared util
        await uploadBytes(ref(storage, storagePath), compressed);
        finalPhotoUrl = await getDownloadURL(ref(storage, storagePath));
      }

      // Company logo — PNG via shared compressLogo (preserves transparency)
      let finalLogoUrl = formData.companyLogo;
      if (logoFile && currentUser?.companyId) {
        const logoPath       = `companies/${currentUser.companyId}/branding/company_logo.png`;
        const compressedLogo = await compressLogo(logoFile);    // ← shared util
        await uploadBytes(ref(storage, logoPath), compressedLogo);
        finalLogoUrl = await getDownloadURL(ref(storage, logoPath));
      }

      await saveData({ ...formData, profilePicture: finalPhotoUrl, companyLogo: finalLogoUrl });
      setSubmitSuccess('Profile updated successfully!');
      setTimeout(() => setSubmitSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save profile:', err);
      setSubmitError('Failed to save profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Loading / error screens ───────────────────────────────────────────────────
  if (authLoading || dataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 rounded-sm border-[3px] border-slate-200 border-t-sky-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading profile…</p>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-500">
        {dataError}
      </div>
    );
  }

  const submitBtnClass = submitSuccess
    ? 'bg-gradient-to-br from-green-400 to-green-600 shadow-green-200/60'
    : isSubmitting
      ? 'bg-sky-200'
      : 'bg-gradient-to-br from-sky-400 to-sky-600 shadow-sky-200/60';

  // ── Reusable card blocks (rendered in two breakpoint slots each) ──────────────
  const AddressFields = (
    <SectionCard title="Business Address" icon="">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <FloatingLabelInput
            name="streetAddress" value={formData.streetAddress || ''}
            onChange={handleInputChange} label="Street Address"
          />
        </div>
        <FloatingLabelInput name="city"  value={formData.city  || ''} onChange={handleInputChange} label="City"  />
        <FloatingLabelInput name="state" value={formData.state || ''} onChange={handleInputChange} label="State" />
        <div>
          <FloatingLabelInput
            name="postalCode" value={formData.postalCode || ''}
            onChange={handlePostalCodeChange} label="Postal Code"
            maxLength={6} inputMode="numeric"
          />
          {postalError && <p className="text-red-500 text-[11px] mt-1 mb-0">{postalError}</p>}
        </div>
      </div>
    </SectionCard>
  );

  const BankFields = (
    <SectionCard title="Bank Details" icon="">
      <div className="grid grid-cols-2 gap-4">
        <FloatingLabelInput name="accountHolderName" value={formData.accountHolderName || ''} onChange={handleInputChange} label="Acc Holder Name" />
        <FloatingLabelInput name="bankName"          value={formData.bankName          || ''} onChange={handleInputChange} label="Bank Name"       />
        <FloatingLabelInput name="ifscCode"          value={formData.ifscCode          || ''} onChange={handleInputChange} label="IFSC Code"       />
        <FloatingLabelInput name="accountNumber"     value={formData.accountNumber     || ''} onChange={handleInputChange} label="Account No."     />
      </div>
    </SectionCard>
  );

  const SocialFields = (
    <SectionCard title="Social Media" icon="">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FloatingLabelInput name="instagram" value={formData.instagram || ''} onChange={handleInputChange} label="Instagram"  />
        <FloatingLabelInput name="facebook"  value={formData.facebook  || ''} onChange={handleInputChange} label="Facebook"   />
        <FloatingLabelInput name="twitter"   value={formData.twitter   || ''} onChange={handleInputChange} label="Twitter / X" />
      </div>
    </SectionCard>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-3 pb-24">

        {/* Page Header */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-slate-900 m-0">Edit Profile</h1>
          <button
            type="button" onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-sm bg-white border-0 cursor-pointer flex items-center justify-center shadow text-slate-500 hover:text-slate-700 transition-colors"
          >
            <FiX size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-1">

          {/* Identity Banner — fully shared component */}
          <IdentityBanner
            profilePreviewUrl={previewUrl}
            logoPreviewUrl={logoPreviewUrl}
            onProfileChange={handleProfileChange}
            onLogoChange={handleLogoChange}
          />

          {/* Row 1 — Personal | Business | Address (xl: 3-col) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr] gap-1 items-stretch">

            {/* Personal Information */}
            <SectionCard title="Personal Information" icon="">
              <div className="flex flex-col gap-4">
                <FloatingLabelInput
                  type="text" name="name" value={formData.name || ''}
                  onChange={handleInputChange} label="Your Full Name"
                />
                <div>
                  <FloatingLabelInput
                    type="text" name="phone" value={formData.phone || ''}
                    onChange={handlePhoneChange} label="Phone Number"
                    maxLength={10} inputMode="numeric"
                  />
                  {phoneError && <p className="text-red-500 text-[11px] mt-1 mb-0">{phoneError}</p>}
                </div>
                {/* Email is read-only — use LabeledField (shared) with a plain input */}
                <LabeledField label="Email Address">
                  <input
                    type="email" name="email" value={formData.email || ''} readOnly
                    className="w-full border border-slate-200 rounded-sm text-sm bg-slate-100 outline-none px-[14px] py-[14px] text-slate-400 cursor-not-allowed"
                    placeholder="Email Address"
                  />
                </LabeledField>
              </div>
            </SectionCard>

            {/* Business Information */}
            <SectionCard title="Business Information" icon="">
              <div className="grid grid-cols-2 gap-4">
                <FloatingLabelInput name="businessName" value={formData.businessName || ''} onChange={handleInputChange} label="Business Name" />
                <FloatingLabelSelect
                  id="businessType" label="Business Type" value={businessType}
                  onChange={(e) => { setBusinessType(e.target.value); setFormData(prev => ({ ...prev, businessType: e.target.value })); }}
                  options={businessTypeOptions}    // ← shared constant
                />
                <FloatingLabelSelect
                  id="businessCategory" label="Category" value={businessCategory}
                  onChange={(e) => { setBusinessCategory(e.target.value); setFormData(prev => ({ ...prev, businessCategory: e.target.value })); }}
                  options={businessCategoryOptions} // ← shared constant
                />
                <FloatingLabelInput name="gstin"           value={formData.gstin           || ''} onChange={handleInputChange} label="GSTIN"    />
                <FloatingLabelInput name="panNumber"        value={formData.panNumber        || ''} onChange={handleInputChange} label="PAN Number" />
                <FloatingLabelInput name="msmeUdyamNumber"  value={formData.msmeUdyamNumber  || ''} onChange={handleInputChange} label="MSME No."   />
              </div>
            </SectionCard>

            {/* Address — xl desktop only (tablet gets its own row below) */}
            <div className="hidden xl:block h-full">{AddressFields}</div>
          </div>

          {/* Row 2 — Address | Bank (tablet & mobile) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:hidden gap-1">
            <div>{AddressFields}</div>
            {BankFields}
          </div>

          {/* Row 3 — Social (tablet & mobile) */}
          <div className="xl:hidden">{SocialFields}</div>

          {/* Rows 2+3 — Bank + Social side-by-side (xl desktop) */}
          <div className="hidden xl:grid xl:grid-cols-2 gap-1">
            {BankFields}
            {SocialFields}
          </div>

          {/* Error banner */}
          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-sm px-4 py-2.5 flex items-center gap-2">
              <button type="button" onClick={() => setSubmitError(null)} className="text-red-500 shrink-0 cursor-pointer">
                <FiX size={14} />
              </button>
              <p className="text-red-500 text-sm m-0">{submitError}</p>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit" disabled={isSubmitting}
            className={[
              'w-full py-4 rounded-sm text-white text-[15px] font-semibold border-0',
              'flex items-center justify-center gap-2 shadow-lg transition-all duration-300',
              isSubmitting ? 'cursor-not-allowed' : 'cursor-pointer',
              submitBtnClass,
            ].join(' ')}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 rounded-sm border-2 border-white/40 border-t-white animate-spin" />
                Saving…
              </>
            ) : submitSuccess ? (
              <>
                <FiCheck size={18} />
                {submitSuccess}
              </>
            ) : (
              'Save All Changes'
            )}
          </button>

        </form>
      </div>
    </div>
  );
};

export default CatalogueEditProfile;