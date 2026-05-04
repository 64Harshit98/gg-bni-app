import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../lib/Firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../context/auth-context';
import { FloatingLabelInput } from '../Components/ui/FloatingLabelInput';
import { FloatingLabelSelect } from '../Components/FloatingLabelSelect';
import { FiCamera, FiCheck, FiX } from 'react-icons/fi';
import BackButton from '../Components/BackButton';

// --- Data Types ---
interface CatalogueData {
  name: string;
  email: string;
  phone: string;
  panNumber: string;
  accountType: string;
  businessName: string;
  businessType: string;
  businessCategory: string;
  gstin: string;
  msmeUdyamNumber: string;

  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;

  accountHolderName: string;
  bankName: string;
  ifscCode: string;
  accountNumber: string;

  instagram?: string;
  facebook?: string;
  twitter?: string;
  gmail?: string;

  profilePicture?: string;
  companyLogo?: string;
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

// --- Custom Hook ---
const useCatalogueData = (companyId?: string, catalogueId?: string, userId?: string) => {
  const [catalogue, setCatalogue] = useState<Partial<CatalogueData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !catalogueId) {
      setLoading(false);
      return;
    }

    const fetchCatalogueData = async () => {
      setLoading(true);

      try {
        const businessDocRef = doc(
          db,
          "companies",
          companyId,
          "business_info",
          catalogueId
        );

        const userDocRef = doc(
          db,
          "companies",
          companyId,
          "users",
          userId!
        );

        const [businessSnap, userSnap] = await Promise.all([
          getDoc(businessDocRef),
          getDoc(userDocRef),
        ]);

        const businessData = businessSnap.exists()
          ? businessSnap.data()
          : {};

        const userData = userSnap.exists()
          ? userSnap.data()
          : {};

        // 🔥 MERGE DATA (IMPORTANT)
        setCatalogue({
          ...businessData,
          name: userData.name || "",
          profilePicture: userData.profilePicture || businessData.profilePicture || "",
          companyLogo: businessData.companyLogo || "",
          msmeUdyamNumber: userData.msmeUdyamNumber || businessData.msmeUdyamNumber || "",
          email: userData.email || "",
          phone: userData.phoneNumber || userData.phone || "",
        });

      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load profile.");
      } finally {
        setLoading(false);
      }
    };


    fetchCatalogueData();
  }, [companyId, catalogueId]);

  const saveData = async (data: Partial<CatalogueData>) => {
    if (!companyId || !catalogueId || !userId) {
      throw new Error("Missing required IDs.");
    }

    // 🔹 Separate owner fields
    const { name, profilePicture, email, phone, msmeUdyamNumber, ...businessData } = data;

    // 🔹 BUSINESS INFO REF
    const businessDocRef = doc(
      db,
      "companies",
      companyId,
      "business_info",
      catalogueId
    );

    // 🔹 USER REF
    const userDocRef = doc(
      db,
      "companies",
      companyId,
      "users",
      userId
    );

    // Remove undefined values
    const cleanBusinessData = Object.fromEntries(
      Object.entries(businessData).filter(([_, v]) => v !== undefined)
    );

    const promises = [];

    promises.push(
      setDoc(
        businessDocRef,
        {
          ...cleanBusinessData,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );

    promises.push(
      setDoc(
        userDocRef,
        {
          name,
          profilePicture,
          ...(data.email !== undefined && { email: data.email }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.msmeUdyamNumber !== undefined && { msmeUdyamNumber }),
        },
        { merge: true }
      )
    );

    await Promise.all(promises);
  };

  return { catalogue, loading, error, saveData };
};

// ─── SectionCard ───────────────────────────────────────────────────────────
const SectionCard: React.FC<{ title: string; icon: string; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => (
  <div className="bg-white rounded-sm border border-slate-100 shadow-sm overflow-hidden flex flex-col h-full">
    <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
      <span className="text-xs">{icon}</span>
      <span className="text-[9px] font-bold tracking-widest uppercase text-slate-500">{title}</span>
    </div>
    <div className="p-4 flex-1">{children}</div>
  </div>
);

const inputClass =
  'w-full border border-slate-200 rounded-sm text-sm bg-slate-50 outline-none ' +
  'transition-all px-[14px] py-[14px] text-slate-800 ' +
  'focus:border-slate-400 focus:bg-white';

const LabeledField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
      {label}
    </label>
    {children}
  </div>
);


// --- Main Edit Profile Page Component ---
const EditProfilePage: React.FC = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { catalogue, loading: dataLoading, error: dataError, saveData } = useCatalogueData(currentUser?.companyId, currentUser?.companyId, currentUser?.uid);
  const [formData, setFormData] = useState<Partial<CatalogueData>>({});
  const [businessType, setBusinessType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [businessCategory, setBusinessCategory] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [postalError, setPostalError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFormData(catalogue);

    //  dropdown pre-select fix
    setBusinessType(catalogue.businessType || "");
    setBusinessCategory(catalogue.businessCategory || "");

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
        setFormData(prev => ({ ...prev, gstin: upper }));
      }
      return;
    }

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
          <div className="w-10 h-10 rounded-sm border-[3px] border-slate-200 border-t-sky-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading profile…</p>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-500">{dataError}</div>
    );
  }

  const submitBtnClass = submitSuccess
    ? 'bg-gradient-to-br from-green-400 to-green-600 shadow-green-200/60'
    : isSubmitting
      ? 'bg-orange-200'
      : 'bg-gradient-to-br from-orange-400 to-orange-600 shadow-orange-200/60';

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-3 pb-24">

        {/* ── Page Header ── */}
        <div className="flex items-center justify-between mb-1">
          <BackButton />
          <h1 className="text-xl font-bold text-slate-900 m-0">Edit Profile</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-1">

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

          {/* ── TOP ROW: Personal | Business | Address (desktop 3-col) ── */}
          {/* ── TABLET: Personal | Business (row1), Address | Bank (row2), Social (row3) ── */}

          {/* Row 1 on tablet: Personal + Business | Row 1 on desktop: Personal + Business + Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr] gap-1 items-stretch">

            {/* Card 1 — Personal Information */}
            <SectionCard title="Personal Information" icon=''>
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
                <LabeledField label="Email Address">
                  <input
                    type="email" name="email" value={formData.email || ''} readOnly
                    className={`${inputClass} bg-slate-100 text-slate-400 cursor-not-allowed`}
                    placeholder="Email Address"
                  />
                </LabeledField>
              </div>
            </SectionCard>

            {/* Card 2 — Business Information */}
            <SectionCard title="Business Information" icon=''>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <FloatingLabelInput type="text" name="businessName" value={formData.businessName || ''} onChange={handleInputChange} label="Business Name" />
                </div>
                <FloatingLabelSelect
                  id="businessType" label="Business Type" value={businessType}
                  onChange={(e) => { setBusinessType(e.target.value); setFormData(prev => ({ ...prev, businessType: e.target.value })); }}
                  options={businessTypeOptions}
                />
                <FloatingLabelSelect
                  id="businessCategory" label="Category" value={businessCategory}
                  onChange={(e) => { setBusinessCategory(e.target.value); setFormData(prev => ({ ...prev, businessCategory: e.target.value })); }}
                  options={businessCategoryOptions}
                />
                <FloatingLabelInput type="text" name="gstin" value={formData.gstin || ''} onChange={handleInputChange} label="GSTIN" />
                <FloatingLabelInput type="text" name="panNumber" value={formData.panNumber || ''} onChange={handleInputChange} label="PAN No." />
                <FloatingLabelInput type="text" name="msmeUdyamNumber" value={formData.msmeUdyamNumber || ''} onChange={handleInputChange} label="MSME No." />
              </div>
            </SectionCard>

            {/* Card 3 — Business Address (on tablet: hidden here, shown below) */}
            {/* On desktop xl: shows in this 3-col row. On tablet: col-span-2 in next grid */}
            <div className="hidden xl:block h-full">
              <SectionCard title="Business Address" icon="">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <FloatingLabelInput name="streetAddress" value={formData.streetAddress || ''} onChange={handleInputChange} label="Street Address" />
                  </div>
                  <FloatingLabelInput type="text" name="city" value={formData.city || ''} onChange={handleInputChange} label="City" />
                  <FloatingLabelInput type="text" name="state" value={formData.state || ''} onChange={handleInputChange} label="State" />
                  <div>
                    <FloatingLabelInput type="text" name="postalCode" value={formData.postalCode || ''} onChange={handlePostalCodeChange} label="Postal Code" maxLength={6} inputMode="numeric" />
                    {postalError && <p className="text-red-500 text-[11px] mt-1 mb-0">{postalError}</p>}
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>

          {/* Row 2 on tablet: Address | Bank Details — hidden on desktop (Address already in row above) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:hidden gap-1">

            {/* Card 3 — Business Address (tablet & mobile only) */}
            <div className="xl:hidden">
              <SectionCard title="Business Address" icon="">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <FloatingLabelInput name="streetAddress" value={formData.streetAddress || ''} onChange={handleInputChange} label="Street Address" />
                  </div>
                  <FloatingLabelInput type="text" name="city" value={formData.city || ''} onChange={handleInputChange} label="City" />
                  <FloatingLabelInput type="text" name="state" value={formData.state || ''} onChange={handleInputChange} label="State" />
                  <div className='col-span-2'>
                    <FloatingLabelInput type="text" name="postalCode" value={formData.postalCode || ''} onChange={handlePostalCodeChange} label="Postal Code" maxLength={6} inputMode="numeric" />
                    {postalError && <p className="text-red-500 text-[11px] mt-1 mb-0">{postalError}</p>}
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* Card 4 — Bank Details */}
            <SectionCard title="Bank Details" icon="">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <FloatingLabelInput type="text" name="accountHolderName" value={formData.accountHolderName || ''} onChange={handleInputChange} label="Acc Holder Name" />
                </div>
                <FloatingLabelInput type="text" name="bankName" value={formData.bankName || ''} onChange={handleInputChange} label="Bank" />
                <FloatingLabelInput type="text" name="ifscCode" value={formData.ifscCode || ''} onChange={handleInputChange} label="IFSC Code" />
                <div className="col-span-2">
                  <FloatingLabelInput type="text" name="accountNumber" value={formData.accountNumber || ''} onChange={handleInputChange} label="Account No." />
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Row 3: Social Media — always full width on tablet, right half on desktop */}
          {/* On xl desktop: merge Bank+Social as 2-col. On tablet: Social is full width row */}
          <div className="grid grid-cols-1 xl:hidden gap-2">
            {/* Card 5 — Social Media (tablet: full width row) */}
            <SectionCard title="Social Media" icon="">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FloatingLabelInput type="text" name="instagram" value={formData.instagram || ''} onChange={handleInputChange} label="Instagram" />
                <FloatingLabelInput type="text" name="facebook" value={formData.facebook || ''} onChange={handleInputChange} label="Facebook" />
                <FloatingLabelInput type="text" name="twitter" value={formData.twitter || ''} onChange={handleInputChange} label="Twitter / X" />
              </div>
            </SectionCard>
          </div>

          {/* Desktop xl: Bank + Social side by side (original desktop layout) */}
          <div className="hidden xl:grid xl:grid-cols-2 gap-2">
            <SectionCard title="Bank Details" icon="">
              <div className="grid grid-cols-2 gap-4">
                <FloatingLabelInput type="text" name="accountHolderName" value={formData.accountHolderName || ''} onChange={handleInputChange} label="Account Name" />
                <FloatingLabelInput type="text" name="bankName" value={formData.bankName || ''} onChange={handleInputChange} label="Bank Name" />
                <FloatingLabelInput type="text" name="ifscCode" value={formData.ifscCode || ''} onChange={handleInputChange} label="IFSC Code" />
                <FloatingLabelInput type="text" name="accountNumber" value={formData.accountNumber || ''} onChange={handleInputChange} label="Account No." />
              </div>
            </SectionCard>
            <SectionCard title="Social Media" icon="">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FloatingLabelInput type="text" name="instagram" value={formData.instagram || ''} onChange={handleInputChange} label="Instagram" />
                <FloatingLabelInput type="text" name="facebook" value={formData.facebook || ''} onChange={handleInputChange} label="Facebook" />
                <FloatingLabelInput type="text" name="twitter" value={formData.twitter || ''} onChange={handleInputChange} label="Twitter / X" />
              </div>
            </SectionCard>
          </div>

          {/* ── Error banner ── */}
          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-sm px-4 py-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubmitError(null)}
                className="text-red-500 shrink-0 cursor-pointer"
              >
                <FiX size={14} />
              </button>
              <p className="text-red-500 text-sm m-0">{submitError}</p>
            </div>
          )}

          {/* ── Submit button ── */}
          <div className="sticky bottom-0 left-0 right-0 sm:static bg-slate-100 sm:bg-transparent pt-2 sm:pt-0 -mx-4 sm:mx-0 px-4 sm:px-0 pb-2 sm:pb-0 z-10">
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
          </div>
        </form>
      </div >
    </div >
  );
};

export default EditProfilePage;