import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth, storage } from '../../lib/Firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/auth-context';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { FiCamera, FiCheck, FiX } from 'react-icons/fi';

// --- Data Types ---
interface ProfileData {
  name: string;
  email: string;
  phone: string;
  panNumber: string;
  accountType: string;
  profilePicture?: string;
  companyLogo?: string;
  businessName: string;
  businessType: string;
  businessCategory: string;
  registrationNumber: string;
  gstin: string;
  msmeUdyamNumber: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  ifscCode: string;
}

// --- UTILITY: Aggressive Image Compression ---
const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      // 1. Aggressive Resizing: Profile pics don't need to be huge.
      // 500px is sufficient for almost all avatar use cases.
      const MAX_WIDTH = 500;
      const MAX_HEIGHT = 500;

      let width = img.width;
      let height = img.height;

      // Calculate new dimensions maintaining aspect ratio
      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Canvas context failed"));
        return;
      }

      // Draw image
      ctx.drawImage(img, 0, 0, width, height);

      // 2. Aggressive Compression
      // 'image/jpeg' with 0.5 (50%) quality usually yields files < 50KB
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Image compression failed'));
          }
          URL.revokeObjectURL(img.src); // Cleanup
        },
        'image/jpeg',
        0.5 // <--- Aggressive quality setting (0.1 to 1.0)
      );
    };

    img.onerror = (error) => {
      URL.revokeObjectURL(img.src);
      reject(error);
    };
  });
};

// --- Custom Hook ---
const useProfileData = (userId?: string, companyId?: string) => {
  const [profile, setProfile] = useState<Partial<ProfileData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !companyId) {
      setLoading(false);
      return;
    }

    const fetchProfileData = async () => {
      setLoading(true);
      try {
        const userDocRef = doc(db, 'companies', companyId, 'users', userId);
        const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);

        const [userDocSnap, businessDocSnap] = await Promise.all([
          getDoc(userDocRef),
          getDoc(businessDocRef),
        ]);

        const userData = userDocSnap.exists() ? userDocSnap.data() : {};
        const businessData = businessDocSnap.exists() ? businessDocSnap.data() : {};

        setProfile({ ...userData, ...businessData });
      } catch (err) {
        console.error("Error fetching profile data:", err);
        setError("Failed to load profile information.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [userId, companyId]);

  const saveData = async (data: Partial<ProfileData>) => {
    if (!userId || !companyId || !auth.currentUser) {
      throw new Error("User or company is not authenticated.");
    }

    const { name, email, phone, profilePicture, panNumber, accountType, ...businessData } = data;

    const userDocRef = doc(db, 'companies', companyId, 'users', userId);
    const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);

    const promises = [];

    const authUpdates: { displayName?: string; photoURL?: string } = {};
    if (name && auth.currentUser.displayName !== name) authUpdates.displayName = name;
    if (profilePicture && auth.currentUser.photoURL !== profilePicture) authUpdates.photoURL = profilePicture;

    if (Object.keys(authUpdates).length > 0) {
      promises.push(updateProfile(auth.currentUser, authUpdates));
    }

    // 2. User Doc Update (Sanitize data to ensure no undefined values)
    const userUpdateData: Record<string, any> = {};
    if (name) userUpdateData.name = name;
    if (phone !== undefined) userUpdateData.phone = phone;
    if (email !== undefined) userUpdateData.email = email;
    if (panNumber !== undefined) userUpdateData.panNumber = panNumber;
    if (accountType !== undefined) userUpdateData.accountType = accountType;
    // Only include profilePicture if it is defined (avoid Firestore crash)
    if (profilePicture !== undefined) userUpdateData.profilePicture = profilePicture;

    if (Object.keys(userUpdateData).length > 0) {
      promises.push(setDoc(userDocRef, userUpdateData, { merge: true }));
    }

    // 3. Business Info Update (Filter out undefined)
    const cleanBusinessData = Object.fromEntries(
      Object.entries(businessData).filter(([_, v]) => v !== undefined)
    );

    promises.push(setDoc(businessDocRef, {
      ...cleanBusinessData,
      ownerName: name,
      updatedAt: serverTimestamp()
    }, { merge: true }));

    await Promise.all(promises);
  };

  return { profile, loading, error, saveData };
};

// ─── SectionCard ───────────────────────────────────────────────────────────
const SectionCard: React.FC<{ title: string; icon: string; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => (
  <div className="bg-white rounded-sm border border-slate-100 shadow-sm overflow-hidden flex flex-col">
    <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
      <span className="text-xs">{icon}</span>
      <span className="text-[9px] font-bold tracking-widest uppercase text-slate-500">{title}</span>
    </div>
    <div className="p-4 flex-1">{children}</div>
  </div>
);
// ─── Shared input style (no coloured label highlight) ─────────────────────
const inputClass =
  'w-full border border-slate-200 rounded-sm text-sm bg-slate-50 outline-none ' +
  'transition-all px-[12px] py-[8px] text-slate-800 ' +
  'focus:border-slate-400 focus:bg-white';

// Simple labelled field wrapper (no floating-label colour highlight)
const LabeledField: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="flex flex-col gap-0.5">
    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
      {label}
    </label>
    {children}
  </div>
);

// --- Main Edit Profile Page Component ---
const EditProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const { profile, loading: dataLoading, error: dataError, saveData } = useProfileData(currentUser?.uid, currentUser?.companyId);

  const [formData, setFormData] = useState<Partial<ProfileData>>({});
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

  useEffect(() => {
    setFormData(profile);
    if (profile.profilePicture) {
      setPreviewUrl(profile.profilePicture);
    }
    if (profile.companyLogo) {
      setLogoPreviewUrl(profile.companyLogo);
    }
  }, [profile]);

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
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d{0,6}$/.test(value)) {
      setFormData(prev => ({ ...prev, postalCode: value }));
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
      setFormData(prev => ({ ...prev, phone: value }));
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
    }
  };
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      // We show the raw file in preview instantly for better UX
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (formData.postalCode && formData.postalCode.length !== 6) {
      setSubmitError('Postal code must be exactly 6 digits.');
      return;
    }

    if (formData.phone && formData.phone.length !== 10) {
      setSubmitError('Phone number must be exactly 10 digits.');
      return;
    }
    if (formData.msmeUdyamNumber && formData.msmeUdyamNumber.length !== 12) {
      setSubmitError('MSME/Udyam number must be exactly 12 digits.');
      return;
    }
    if (formData.panNumber && formData.panNumber.length !== 10) {
      setSubmitError('PAN number must be exactly 10 characters.');
      return;
    }

    setIsSubmitting(true);
    setIsSubmitting(true);

    try {
      let finalPhotoUrl = formData.profilePicture;

      if (imageFile && currentUser?.companyId && currentUser?.uid) {
        // Change extension to .jpg since we force JPEG compression
        const storagePath = `companies/${currentUser.companyId}/users/${currentUser.uid}/profile_pic.jpg`;
        const storageRef = ref(storage, storagePath);

        // --- COMPRESSION STEP ---
        const compressedBlob = await compressImage(imageFile);

        // Debugging logs to see savings
        console.log(`Original: ${(imageFile.size / 1024).toFixed(2)} KB`);
        console.log(`Compressed: ${(compressedBlob.size / 1024).toFixed(2)} KB`);

        await uploadBytes(storageRef, compressedBlob);
        finalPhotoUrl = await getDownloadURL(storageRef);
      }
      let finalLogoUrl = formData.companyLogo;
      if (logoFile && currentUser?.companyId) {
        const logoPath = `companies/${currentUser.companyId}/branding/company_logo.jpg`;
        const logoRef = ref(storage, logoPath);
        const compressedLogo = await compressImage(logoFile);
        await uploadBytes(logoRef, compressedLogo);
        finalLogoUrl = await getDownloadURL(logoRef);
      }

      await saveData({ ...formData, profilePicture: finalPhotoUrl, companyLogo: finalLogoUrl });

      setSubmitSuccess("Profile updated successfully!");
      setTimeout(() => setSubmitSuccess(null), 3000);
    } catch (err) {
      console.error("Failed to save profile:", err);
      setSubmitError("Failed to save profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Loading state ──
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

  // Derived submit button colour class (kept out of JSX to avoid long ternary chains)
  const submitBtnClass = submitSuccess
    ? 'bg-gradient-to-br from-green-400 to-green-600 shadow-green-200/60'
    : isSubmitting
      ? 'bg-sky-200'
      : 'bg-gradient-to-br from-sky-400 to-sky-600 shadow-sky-200/60';

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-5 pb-24">

        {/* ── Page Header ── */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-slate-900 m-0">Edit Profile</h1>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-sm bg-white border-0 cursor-pointer flex items-center justify-center shadow text-slate-500 hover:text-slate-700 transition-colors"
          >
            <FiX size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2">

          {/* ── IDENTITY BANNER: Avatar + Company Logo side by side ── */}
          <div className="bg-white rounded-sm border border-slate-100 shadow-sm px-5 py-2 flex items-center gap-6">

            {/* Profile Avatar */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative cursor-pointer"
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Profile"
                    className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md shadow-sky-200 block"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full border-2 border-white shadow-md shadow-sky-200 bg-gray-200 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-9 h-9 text-gray-400">
                      <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-sky-500 border-2 border-white flex items-center justify-center text-white">
                  <FiCamera size={8} />
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/jpg"
                  className="hidden"
                  aria-label="Upload profile photo"
                  onChange={handleImageChange}
                />
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Profile Photo</span>
            </div>

            {/* Divider */}
            <div className="w-px self-stretch bg-slate-100" />

            {/* Company Logo */}
            <div className="flex items-center gap-4 flex-1">
              <div
                onClick={() => logoInputRef.current?.click()}
                className="relative cursor-pointer shrink-0"
              >
                {logoPreviewUrl ? (
                  <img
                    src={logoPreviewUrl}
                    alt="Company Logo"
                    className="w-14 h-14 rounded-sm object-contain border border-slate-200 bg-slate-50 p-1.5 shadow-sm"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-sm border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-300 gap-0.5">
                    <FiCamera size={14} />
                    <span className="text-[8px] font-bold tracking-wider">LOGO</span>
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-sky-500 border-[1.5px] border-white flex items-center justify-center text-white">
                  <FiCamera size={7} />
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/jpg, image/svg+xml"
                  className="hidden"
                  aria-label="Upload company logo" 
                  onChange={handleLogoChange}
                />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-slate-700 m-0">Company Logo</p>
                <p className="text-[11px] text-slate-400 m-0 mt-0.5 leading-relaxed">
                  Appears on invoices, reports & PDFs.<br />
                  PNG or JPG recommended.
                </p>
              </div>
            </div>

          </div>

          {/* ── 2 × 2 CARD GRID ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">

            {/* Card 1 — Personal Information */}
            <SectionCard title="Personal Information" icon="">
              <div className="flex flex-col gap-4">
                <FloatingLabelInput
                  type="text"
                  name="name"
                  value={formData.name || ''}
                  onChange={handleInputChange}
                  label="Full Name"
                />
                <div>
                  <FloatingLabelInput
                    type="text"
                    name="phone"
                    value={formData.phone || ''}
                    onChange={handlePhoneChange}
                    label="Phone Number"
                    maxLength={10}
                    inputMode="numeric"
                  />
                  {phoneError && (
                    <p className="text-red-500 text-[11px] mt-1 mb-0">{phoneError}</p>
                  )}
                </div>
                {/* Email — read-only */}
                <div className="-mt-2">
                  <LabeledField label="Email Address">
                    <input
                      type="email"
                      name="email"
                      value={formData.email || ''}
                      readOnly
                      className={`${inputClass} bg-slate-100 text-slate-400 cursor-not-allowed`}
                      placeholder="Email Address"
                    />
                  </LabeledField>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Business Information" icon="">
              <div className="grid grid-cols-2 gap-4">
                <FloatingLabelInput type="text" name="businessName" value={formData.businessName || ''} onChange={handleInputChange} label="Business Name" />
                <FloatingLabelInput type="text" name="businessType" value={formData.businessType || ''} onChange={handleInputChange} label="Business Type" />
                <FloatingLabelInput type="text" name="businessCategory" value={formData.businessCategory || ''} onChange={handleInputChange} label="Category" />
                <FloatingLabelInput type="text" name="gstin" value={formData.gstin || ''} onChange={handleInputChange} label="GSTIN" />
                <FloatingLabelInput type="text" name="panNumber" value={formData.panNumber || ''} onChange={handleInputChange} label="PAN Number" />
                <FloatingLabelInput type="text" name="msmeUdyamNumber" value={formData.msmeUdyamNumber || ''} onChange={handleInputChange} label="MSME / Udyam No." />
              </div>
            </SectionCard>

            <SectionCard title="Business Address" icon="">
              <div className="grid grid-cols-2 gap-4">
                <FloatingLabelInput name="streetAddress" value={formData.streetAddress || ''} onChange={handleInputChange} label="Street Address" />
                <FloatingLabelInput type="text" name="city" value={formData.city || ''} onChange={handleInputChange} label="City" />
                <FloatingLabelInput type="text" name="state" value={formData.state || ''} onChange={handleInputChange} label="State" />
                <div>
                  <FloatingLabelInput type="text" name="postalCode" value={formData.postalCode || ''} onChange={handlePostalCodeChange} label="Postal Code" maxLength={6} inputMode="numeric" />
                  {postalError && <p className="text-red-500 text-[11px] mt-1 mb-0">{postalError}</p>}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Bank Details" icon="">
              <div className="grid grid-cols-2 gap-4">
                <FloatingLabelInput type="text" name="accountHolderName" value={formData.accountHolderName || ''} onChange={handleInputChange} label="Account Holder Name" />
                <FloatingLabelInput type="text" name="bankName" value={formData.bankName || ''} onChange={handleInputChange} label="Bank Name" />
                <FloatingLabelInput type="text" name="ifscCode" value={formData.ifscCode || ''} onChange={handleInputChange} label="IFSC Code" />
                <FloatingLabelInput type="text" name="accountNumber" value={formData.accountNumber || ''} onChange={handleInputChange} label="Account Number" />
              </div>
            </SectionCard>

          </div>{/* end grid */}

          {/* ── Error banner ── */}
          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-sm px-4 py-2.5 flex items-center gap-2">
              <FiX size={14} className="text-red-500 shrink-0" />
              <p className="text-red-500 text-sm m-0">{submitError}</p>
            </div>
          )}

          {/* ── Submit button ── */}
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

export default EditProfilePage;