import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { FloatingLabelSelect } from '../../Components/FloatingLabelSelect';
import { FiCheck, FiX } from 'react-icons/fi';

import {
  type ProfileData,
  businessTypeOptions,
  businessCategoryOptions,
  compressImage,
  compressLogo,
  validatePhone,
  validatePostalCode,
  validateForm,
} from './EditProfileComponents/Profiledata';

import useProfileData from './EditProfileComponents/Useprofiledata';
import SectionCard from './EditProfileComponents/Sectioncard';
import LabeledField, { inputClass } from './EditProfileComponents/LabeledField';
import IdentityBanner from './EditProfileComponents/Identitybanner';

import { invalidateLogoCache, logoCache } from '../../Catalogue/hooks/useCompanyLogo';

// ─── EditProfilePage ──────────────────────────────────────────────────────────

const EditProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const { profile, loading: dataLoading, error: dataError, saveData, refetch } =
    useProfileData(currentUser?.uid, currentUser?.companyId);

  const [formData, setFormData]       = useState<Partial<ProfileData>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError]   = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [profileFile, setProfileFile]   = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [logoFile, setLogoFile]         = useState<File | null>(null);
  const [logoPreview, setLogoPreview]   = useState<string | null>(null);

  const [postalError, setPostalError] = useState<string | null>(null);
  const [phoneError, setPhoneError]   = useState<string | null>(null);

  // Track URLs uploaded in this session so refetch() doesn't clobber previews
  const freshUrls = useRef<{ profilePicture?: string; companyLogo?: string }>({});

  // ── Sync profile → form on load ──
  useEffect(() => {
    setFormData(profile);
    if (profile.profilePicture && !profileFile && !freshUrls.current.profilePicture)
      setProfilePreview(profile.profilePicture);
    else if (freshUrls.current.profilePicture)
      setProfilePreview(freshUrls.current.profilePicture);

    if (profile.companyLogo && !logoFile && !freshUrls.current.companyLogo)
      setLogoPreview(profile.companyLogo);
    else if (freshUrls.current.companyLogo)
      setLogoPreview(freshUrls.current.companyLogo);
  }, [profile]);

  // ── Field handlers ──
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d{0,10}$/.test(value)) {
      setFormData(prev => ({ ...prev, phone: value }));
      setPhoneError(validatePhone(value));
    }
  };

  const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d{0,6}$/.test(value)) {
      setFormData(prev => ({ ...prev, postalCode: value }));
      setPostalError(validatePostalCode(value));
    }
  };

  const handleProfileFileChange = (file: File) => {
    setProfileFile(file);
    setProfilePreview(URL.createObjectURL(file));
  };

  const handleLogoFileChange = (file: File) => {
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    const validationError = validateForm(formData);
    if (validationError) { setSubmitError(validationError); return; }

    setIsSubmitting(true);
    try {
      let finalPhotoUrl = formData.profilePicture;
      if (profileFile && currentUser?.companyId && currentUser?.uid) {
        const storagePath = `companies/${currentUser.companyId}/users/${currentUser.uid}/profile_pic.jpg`;
        const storageRef = ref(storage, storagePath);
        const compressed = await compressImage(profileFile);
        await uploadBytes(storageRef, compressed);
        finalPhotoUrl = await getDownloadURL(storageRef);
      }

      let finalLogoUrl = formData.companyLogo;
      if (logoFile && currentUser?.companyId) {
        invalidateLogoCache(currentUser.companyId);
        const logoPath = `companies/${currentUser.companyId}/branding/company_logo.png`;
        const logoRef = ref(storage, logoPath);
        const compressedLogo = await compressLogo(logoFile);
        await uploadBytes(logoRef, compressedLogo);
        finalLogoUrl = await getDownloadURL(logoRef);
        logoCache[currentUser.companyId] = finalLogoUrl;
      }

      await saveData({ ...formData, profilePicture: finalPhotoUrl, companyLogo: finalLogoUrl });

      // Persist fresh URLs so refetch() doesn't reset previews
      if (finalPhotoUrl) freshUrls.current.profilePicture = finalPhotoUrl;
      if (finalLogoUrl)  freshUrls.current.companyLogo    = finalLogoUrl;

      setFormData(prev => ({ ...prev, profilePicture: finalPhotoUrl, companyLogo: finalLogoUrl }));
      if (finalPhotoUrl) setProfilePreview(finalPhotoUrl);
      if (finalLogoUrl)  setLogoPreview(finalLogoUrl);

      setProfileFile(null);
      setLogoFile(null);
      refetch();

      setSubmitSuccess('Profile updated successfully!');
      setTimeout(() => setSubmitSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save profile:', err);
      setSubmitError('Failed to save profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Loading / error states ──
  if (authLoading || dataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-[3px] border-slate-200 border-t-sky-500 animate-spin mx-auto mb-3" />
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

  // ── Render ──
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-5 pb-24">

        {/* Page header */}
        <div className="relative flex items-center mb-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-full p-3 bg-gray-200 border-0 cursor-pointer flex items-center justify-center shadow text-slate-500 hover:text-slate-700 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-xl text-center font-bold text-slate-900 m-0">
            Edit Profile
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2">

          {/* Identity banner */}
          <IdentityBanner
            profilePreviewUrl={profilePreview}
            logoPreviewUrl={logoPreview}
            onProfileChange={handleProfileFileChange}
            onLogoChange={handleLogoFileChange}
          />

          {/* 2-col card grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">

            {/* Personal Information */}
            <SectionCard title="Personal Information">
              <div className="flex flex-col gap-4">
                <FloatingLabelInput
                  type="text" name="name"
                  value={formData.name || ''} onChange={handleChange}
                  label="Full Name"
                />
                <div>
                  <FloatingLabelInput
                    type="text" name="phone"
                    value={formData.phone || ''} onChange={handlePhoneChange}
                    label="Phone Number" maxLength={10} inputMode="numeric"
                  />
                  {phoneError && <p className="text-red-500 text-[11px] mt-1 mb-0">{phoneError}</p>}
                </div>
                <div className="-mt-2">
                  <LabeledField label="Email Address">
                    <input
                      type="email" name="email"
                      value={formData.email || ''} readOnly
                      className={`${inputClass} bg-slate-100 text-slate-400 cursor-not-allowed`}
                      placeholder="Email Address"
                    />
                  </LabeledField>
                </div>
              </div>
            </SectionCard>

            {/* Business Information */}
            <SectionCard title="Business Information">
              <div className="grid grid-cols-2 gap-4">
                <FloatingLabelInput
                  type="text" name="businessName"
                  value={formData.businessName || ''} onChange={handleChange}
                  label="Business Name"
                />
                <FloatingLabelSelect
                  id="businessType" label="Business Type"
                  value={formData.businessType || ''}
                  onChange={e => setFormData(prev => ({ ...prev, businessType: e.target.value }))}
                  options={businessTypeOptions}
                />
                <FloatingLabelSelect
                  id="businessCategory" label="Category"
                  value={formData.businessCategory || ''}
                  onChange={e => setFormData(prev => ({ ...prev, businessCategory: e.target.value }))}
                  options={businessCategoryOptions}
                />
                <FloatingLabelInput
                  type="text" name="gstin"
                  value={formData.gstin || ''}
                  onChange={e => {
                    const val = e.target.value.toUpperCase();
                    if (val.length <= 15) setFormData(prev => ({ ...prev, gstin: val }));
                  }}
                  label="GSTIN"
                />
                <FloatingLabelInput
                  type="text" name="panNumber"
                  value={formData.panNumber || ''} onChange={handleChange}
                  label="PAN Number"
                />
                <FloatingLabelInput
                  type="text" name="msmeUdyamNumber"
                  value={formData.msmeUdyamNumber || ''} onChange={handleChange}
                  label="MSME No."
                />
              </div>
            </SectionCard>

            {/* Business Address */}
            <SectionCard title="Business Address">
              <div className="grid grid-cols-2 gap-4">
                <FloatingLabelInput name="streetAddress" value={formData.streetAddress || ''} onChange={handleChange} label="Street Address" />
                <FloatingLabelInput type="text" name="city"  value={formData.city  || ''} onChange={handleChange} label="City"  />
                <FloatingLabelInput type="text" name="state" value={formData.state || ''} onChange={handleChange} label="State" />
                <div>
                  <FloatingLabelInput
                    type="text" name="postalCode"
                    value={formData.postalCode || ''} onChange={handlePostalCodeChange}
                    label="Postal Code" maxLength={6} inputMode="numeric"
                  />
                  {postalError && <p className="text-red-500 text-[11px] mt-1 mb-0">{postalError}</p>}
                </div>
              </div>
            </SectionCard>

            {/* Bank Details */}
            <SectionCard title="Bank Details">
              <div className="grid grid-cols-2 gap-4">
                <FloatingLabelInput type="text" name="accountHolderName" value={formData.accountHolderName || ''} onChange={handleChange} label="Acc Holder Name" />
                <FloatingLabelInput type="text" name="bankName"          value={formData.bankName          || ''} onChange={handleChange} label="Bank Name"       />
                <FloatingLabelInput type="text" name="ifscCode"          value={formData.ifscCode          || ''} onChange={handleChange} label="IFSC Code"       />
                <FloatingLabelInput type="text" name="accountNumber"     value={formData.accountNumber     || ''} onChange={handleChange} label="Account Number"  />
              </div>
            </SectionCard>

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
            type="submit"
            disabled={isSubmitting}
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
              <><FiCheck size={18} /> {submitSuccess}</>
            ) : (
              'Save All Changes'
            )}
          </button>

        </form>
      </div>
    </div>
  );
};

export default EditProfilePage;