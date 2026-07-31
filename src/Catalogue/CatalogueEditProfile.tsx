import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { FiCheck, FiX } from 'react-icons/fi';
import BackButton from '../Components/BackButton';
import {
  fetchCatalogueProfile,
  saveCatalogueProfile,
  uploadCompanyLogo,
  uploadProfilePicture,
  type CatalogueProfileData,
} from '../services/catalogue/catalogueEditProfile.service';
import { businessTypeOptions, businessCategoryOptions } from './components/CatalogueEditProfile/constants';
import { IdentityBanner } from './components/CatalogueEditProfile/IdentityBanner';
import { ImageOptionsModal } from './components/CatalogueEditProfile/ImageOptionsModal';
import { PersonalInfoCard } from './components/CatalogueEditProfile/PersonalInfoCard';
import { BusinessInfoCard } from './components/CatalogueEditProfile/BusinessInfoCard';
import { AddressCard } from './components/CatalogueEditProfile/AddressCard';
import { BankDetailsCard } from './components/CatalogueEditProfile/BankDetailsCard';
import { SocialMediaCard } from './components/CatalogueEditProfile/SocialMediaCard';

// --- Custom Hook: wraps the service module with page-local state ---
const useCatalogueData = (companyId?: string, catalogueId?: string, userId?: string) => {
  const [catalogue, setCatalogue] = useState<Partial<CatalogueProfileData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !catalogueId || !userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchCatalogueProfile(companyId, catalogueId, userId);
        if (!cancelled) setCatalogue(data);
      } catch (err) {
        console.error('Error fetching data:', err);
        if (!cancelled) setError('Failed to load profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, catalogueId, userId]);

  const saveData = async (data: Partial<CatalogueProfileData>) => {
    if (!companyId || !catalogueId || !userId) {
      throw new Error('Missing required IDs.');
    }
    await saveCatalogueProfile(companyId, catalogueId, userId, data);
  };

  return { catalogue, loading, error, saveData };
};

// --- Main Edit Profile Page Component ---
const EditProfilePage: React.FC = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { catalogue, loading: dataLoading, error: dataError, saveData } = useCatalogueData(
    currentUser?.companyId,
    currentUser?.companyId,
    currentUser?.uid,
  );
  const [formData, setFormData] = useState<Partial<CatalogueProfileData>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [postalError, setPostalError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [removeProfilePicture, setRemoveProfilePicture] = useState(false);
  const [removeCompanyLogo, setRemoveCompanyLogo] = useState(false);
  const [activeImageMenu, setActiveImageMenu] = useState<null | 'profile' | 'logo'>(null);
  const [customBusinessType, setCustomBusinessType] = useState('');
  const [customBusinessCategory, setCustomBusinessCategory] = useState('');

  useEffect(() => {
    const isCustomType = catalogue.businessType && !businessTypeOptions.some((o) => o.value === catalogue.businessType);
    const isCustomCategory =
      catalogue.businessCategory && !businessCategoryOptions.some((o) => o.value === catalogue.businessCategory);

    if (isCustomType) setCustomBusinessType(catalogue.businessType!);
    if (isCustomCategory) setCustomBusinessCategory(catalogue.businessCategory!);

    setFormData({
      ...catalogue,
      businessType: isCustomType ? 'Other' : catalogue.businessType || '',
      businessCategory: isCustomCategory ? 'Other' : catalogue.businessCategory || '',
    });

    if (catalogue.profilePicture) {
      setPreviewUrl(catalogue.profilePicture);
    }
    if (catalogue.companyLogo) {
      setLogoPreviewUrl(catalogue.companyLogo);
    }
  }, [catalogue]);

  useEffect(() => {
    if (!logoPreviewUrl && formData.companyLogo) {
      setLogoPreviewUrl(formData.companyLogo);
    }
    if (!previewUrl && formData.profilePicture) {
      setPreviewUrl(formData.profilePicture);
    }
  }, [formData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name === 'gstin') {
      const upper = value.toUpperCase();
      if (upper.length <= 15) {
        setFormData((prev) => ({ ...prev, gstin: upper }));
      }
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFieldChange = (field: 'businessType' | 'businessCategory', value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleStateChange = (value: string) => {
    setFormData((prev) => ({ ...prev, state: value }));
  };

  const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d{0,6}$/.test(value)) {
      setFormData((prev) => ({ ...prev, postalCode: value }));
      if (value.length > 0 && value.length < 6) {
        setPostalError('Postal code must be exactly 6 digits.');
      } else {
        setPostalError(null);
      }
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d{0,10}$/.test(value)) {
      setFormData((prev) => ({ ...prev, phone: value }));
      if (value.length > 0 && value.length < 10) {
        setPhoneError('Phone number must be exactly 10 digits.');
      } else {
        setPhoneError(null);
      }
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      setLogoPreviewUrl(URL.createObjectURL(file));
      setRemoveCompanyLogo(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setRemoveProfilePicture(false);
    }
  };

  const handleRemoveProfilePicture = () => {
    setPreviewUrl(null);
    setImageFile(null);
    setRemoveProfilePicture(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveCompanyLogo = () => {
    setLogoPreviewUrl(null);
    setLogoFile(null);
    setRemoveCompanyLogo(true);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };
  const openImageMenu = (type: 'profile' | 'logo') => setActiveImageMenu(type);
  const closeImageMenu = () => setActiveImageMenu(null);

  const handleMenuUpload = () => {
    if (activeImageMenu === 'profile') fileInputRef.current?.click();
    if (activeImageMenu === 'logo') logoInputRef.current?.click();
    closeImageMenu();
  };

  const handleMenuRemove = () => {
    if (activeImageMenu === 'profile') handleRemoveProfilePicture();
    if (activeImageMenu === 'logo') handleRemoveCompanyLogo();
    closeImageMenu();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    // GSTIN can be edited but never fully removed once it has been saved
    if (catalogue.gstin && catalogue.gstin.trim() !== '' && (!formData.gstin || formData.gstin.trim() === '')) {
      setSubmitError('GSTIN cannot be removed once added. You can only edit/update it.');
      return;
    }
    if (formData.postalCode && formData.postalCode.length !== 6) {
      setSubmitError('Postal code must be exactly 6 digits.');
      return;
    }

    if (formData.phone && formData.phone.length !== 10) {
      setSubmitError('Phone number must be exactly 10 digits.');
      return;
    }
    if (formData.msmeUdyamNumber && formData.msmeUdyamNumber.length !== 19) {
      setSubmitError('MSME/Udyam number must be exactly 19 digits.');
      return;
    }
    if (formData.panNumber && formData.panNumber.length !== 10) {
      setSubmitError('PAN number must be exactly 10 digits.');
      return;
    }
    if (formData.gstin && formData.gstin.length !== 15) {
      setSubmitError('GSTIN must be exactly 15 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalPhotoUrl = removeProfilePicture ? '' : formData.profilePicture;

      if (imageFile && currentUser?.companyId && currentUser?.uid) {
        finalPhotoUrl = await uploadProfilePicture(currentUser.companyId, currentUser.uid, imageFile);
      }
      let finalLogoUrl = removeCompanyLogo ? '' : formData.companyLogo;
      if (logoFile && currentUser?.companyId) {
        finalLogoUrl = await uploadCompanyLogo(currentUser.companyId, logoFile);
      }
      const finalBusinessType = formData.businessType === 'Other' ? customBusinessType : formData.businessType;
      const finalBusinessCategory =
        formData.businessCategory === 'Other' ? customBusinessCategory : formData.businessCategory;
      await saveData({
        ...formData,
        profilePicture: finalPhotoUrl,
        companyLogo: finalLogoUrl,
        businessType: finalBusinessType,
        businessCategory: finalBusinessCategory,
      });
      setRemoveProfilePicture(false);
      setRemoveCompanyLogo(false);

      setSubmitSuccess('Profile updated successfully!');
      setTimeout(() => setSubmitSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save profile:', err);
      setSubmitError('Failed to save profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Loading state ──
  if (authLoading || dataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto mb-3 size-10 animate-spin rounded-full border-[3px] border-border border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading profile…</p>
        </div>
      </div>
    );
  }

  if (dataError) {
    return <div className="flex min-h-screen items-center justify-center text-destructive">{dataError}</div>;
  }

  const submitBtnClass = submitSuccess
    ? 'bg-gradient-to-br from-emerald-500 to-green-600'
    : isSubmitting
      ? 'bg-primary/60'
      : 'glow-primary bg-gradient-to-br from-primary via-primary to-[oklch(0.5_0.24_320)]';

  return (
    <div className="aurora min-h-screen bg-background">
      <header className="glass sticky top-0 z-20 border-b border-border">
        <div className="mx-auto flex max-w-none items-center gap-3 px-4 py-3 md:px-8">
          <BackButton />
          <div>
            <h1 className="text-lg font-bold tracking-tight text-gradient">Edit Profile</h1>
            <p className="text-xs text-muted-foreground">Keep your storefront details current</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-none px-4 py-4 pb-28 md:px-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 duration-500 animate-in fade-in-0 slide-in-from-bottom-2">
          <IdentityBanner
            previewUrl={previewUrl}
            logoPreviewUrl={logoPreviewUrl}
            onOpenProfileMenu={() => openImageMenu('profile')}
            onOpenLogoMenu={() => openImageMenu('logo')}
            fileInputRef={fileInputRef}
            logoInputRef={logoInputRef}
            onImageChange={handleImageChange}
            onLogoChange={handleLogoChange}
          />

          {/* ── Row 1: Personal | Business | Address (desktop 3-col) ── */}
          <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr]">
            <PersonalInfoCard formData={formData} phoneError={phoneError} onInputChange={handleInputChange} onPhoneChange={handlePhoneChange} />
            <BusinessInfoCard
              formData={formData}
              customBusinessType={customBusinessType}
              customBusinessCategory={customBusinessCategory}
              onInputChange={handleInputChange}
              onFieldChange={handleFieldChange}
              onCustomBusinessTypeChange={setCustomBusinessType}
              onCustomBusinessCategoryChange={setCustomBusinessCategory}
            />
            <div className="hidden h-full xl:block">
              <AddressCard formData={formData} postalError={postalError} onInputChange={handleInputChange} onPostalCodeChange={handlePostalCodeChange} onStateChange={handleStateChange} />
            </div>
          </div>

          {/* ── Row 2 (tablet/mobile): Address | Bank ── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
            <AddressCard formData={formData} postalError={postalError} onInputChange={handleInputChange} onPostalCodeChange={handlePostalCodeChange} onStateChange={handleStateChange} />
            <BankDetailsCard formData={formData} onInputChange={handleInputChange} />
          </div>

          {/* ── Row 3 (tablet/mobile): Social Media ── */}
          <div className="grid grid-cols-1 gap-3 xl:hidden">
            <SocialMediaCard formData={formData} onInputChange={handleInputChange} />
          </div>

          {/* ── Desktop xl: Bank + Social side by side ── */}
          <div className="hidden gap-3 xl:grid xl:grid-cols-2">
            <BankDetailsCard formData={formData} onInputChange={handleInputChange} />
            <SocialMediaCard formData={formData} onInputChange={handleInputChange} />
          </div>

          {/* ── Error banner ── */}
          {submitError && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 duration-200 animate-in fade-in-0 slide-in-from-top-1">
              <p className="m-0 flex-1 text-sm font-medium text-destructive">{submitError}</p>
              <button
                type="button"
                onClick={() => setSubmitError(null)}
                className="shrink-0 text-destructive/70 hover:text-destructive"
              >
                <FiX size={16} />
              </button>
            </div>
          )}

          {/* ── Submit button ── */}
          <div className="sticky bottom-0 left-0 right-0 z-10 -mx-4 border-t border-border bg-card/90 px-4 pb-2 pt-2 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0">
            <button
              type="submit"
              disabled={isSubmitting}
              className={[
                'w-full rounded-xl border-0 py-3.5 text-sm font-semibold text-white',
                'flex items-center justify-center gap-2 shadow-lg transition-all duration-300',
                isSubmitting ? 'cursor-not-allowed' : 'cursor-pointer',
                submitBtnClass,
              ].join(' ')}
            >
              {isSubmitting ? (
                <>
                  <div className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
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
          </div>
        </form>

        {activeImageMenu === 'profile' && (
          <ImageOptionsModal
            title="Profile Photo"
            hasImage={!!previewUrl}
            onUpload={handleMenuUpload}
            onRemove={handleMenuRemove}
            onClose={closeImageMenu}
          />
        )}
        {activeImageMenu === 'logo' && (
          <ImageOptionsModal
            title="Company Logo"
            hasImage={!!logoPreviewUrl}
            onUpload={handleMenuUpload}
            onRemove={handleMenuRemove}
            onClose={closeImageMenu}
          />
        )}
      </div>
    </div>
  );
};

export default EditProfilePage;
