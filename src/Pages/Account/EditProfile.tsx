import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth, storage } from '../../lib/Firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/auth-context';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { FiCamera } from 'react-icons/fi';

// --- Data Types ---
interface ProfileData {
  name: string;
  email: string;
  phone: string;
  whatsappNumber: string;
  panNumber: string;
  accountType: string;
  profilePicture?: string;
  businessName: string;
  businessType: string;
  businessCategory: string;
  registrationNumber: string;
  gstin: string;
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

    const { name, email, phone, profilePicture, whatsappNumber, panNumber, accountType, ...businessData } = data;

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
    if (whatsappNumber !== undefined) userUpdateData.whatsappNumber = whatsappNumber;
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

  useEffect(() => {
    setFormData(profile);
    if (profile.profilePicture) {
      setPreviewUrl(profile.profilePicture);
    }
  }, [profile]);

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

  const handleWhatsappChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d{0,10}$/.test(value)) {
      setFormData(prev => ({ ...prev, whatsappNumber: value }));
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

    if (formData.whatsappNumber && formData.whatsappNumber.length !== 10) {
      setSubmitError('WhatsApp number must be exactly 10 digits.');
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

      await saveData({ ...formData, profilePicture: finalPhotoUrl });

      setSubmitSuccess("Profile updated successfully!");
      setTimeout(() => setSubmitSuccess(null), 3000);
    } catch (err) {
      console.error("Failed to save profile:", err);
      setSubmitError("Failed to save profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || dataLoading) {
    return <div className="flex min-h-screen items-center justify-center">Loading Profile...</div>;
  }

  if (dataError) {
    return <div className="flex min-h-screen items-center justify-center text-red-500">{dataError}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 mb-12 sm:p-6">
      <div className="max-w-3xl mx-auto bg-gray-100 p-2 rounded-xl ">
        <div className="flex items-center justify-between pb-2 border-b border-gray-200 mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Edit Profile</h1>
          <button onClick={() => navigate(-1)} className="rounded-full bg-gray-200 p-2 text-gray-700 transition hover:bg-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <fieldset>
            <legend className="text-xl font-semibold text-gray-700 mb-4">Owner Details</legend>
            <div className="flex justify-center mb-6">
              <div className="relative cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
                <img
                  src={previewUrl || "https://github.com/shadcn.png"}
                  alt="Profile"
                  className="w-42 h-42 rounded-full object-cover border-4 border-white shadow-md group-hover:opacity-75 transition"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <FiCamera className="text-gray-800 w-8 h-8" />
                </div>
                <div className="absolute bottom-0 right-0 bg-sky-500 p-2 rounded-full text-white shadow-sm">
                  <FiCamera className="w-4 h-4" />
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/png, image/jpeg, image/jpg"
                  onChange={handleImageChange}
                />
              </div>
            </div>
            <div className="space-y-4">
              <FloatingLabelInput
                type="text"
                name="name"
                value={formData.name || ''}
                onChange={handleInputChange}
                label="Your Full Name"
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
                <div className="mt-4">
                  <FloatingLabelInput
                    type="text"
                    name="whatsappNumber"
                    value={formData.whatsappNumber || ''}
                    onChange={handleWhatsappChange}
                    label="WhatsApp Number"
                    maxLength={10}
                    inputMode="numeric"
                  />
                </div>
                {phoneError && (
                  <p className="text-red-500 text-xs mt-1 ml-1">{phoneError}</p>
                )}
              </div>
              <FloatingLabelInput
                type="email"
                name="email"
                value={formData.email || ''}
                onChange={handleInputChange}
                label="Email Address"
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xl font-semibold text-gray-700 mb-4">Business Information</legend>
            <div className="grid grid-cols-2 md:grid-cols-2 gap-6 mb-6">
              <div className="md:col-span-2">
                <FloatingLabelInput type="text" name="businessName" value={formData.businessName || ''} onChange={handleInputChange} label="Business Name" />
              </div>
              <FloatingLabelInput type="text" name="businessType" value={formData.businessType || ''} onChange={handleInputChange} label="Business Type" />
              <FloatingLabelInput type="text" name="businessCategory" value={formData.businessCategory || ''} onChange={handleInputChange} label="Business Category" />
              <FloatingLabelInput type="text" name="gstin" value={formData.gstin || ''} onChange={handleInputChange} label="GSTIN" />
              <FloatingLabelInput
                type="text"
                name="panNumber"
                value={formData.panNumber || ''}
                onChange={handleInputChange}
                label="PAN Number"
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xl font-semibold text-gray-700 mb-2">Business Address</legend>
            <div className="grid grid-cols-2 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <FloatingLabelInput name="streetAddress" value={formData.streetAddress || ''} onChange={handleInputChange} label="Street Address" />
              </div>
              <FloatingLabelInput type="text" name="city" value={formData.city || ''} onChange={handleInputChange} label="City" />
              <FloatingLabelInput type="text" name="state" value={formData.state || ''} onChange={handleInputChange} label="State" />
              <div>
                <FloatingLabelInput
                  type="text"
                  name="postalCode"
                  value={formData.postalCode || ''}
                  onChange={handlePostalCodeChange}
                  label="Postal Code"
                  maxLength={6}
                  inputMode="numeric"
                />
                {postalError && (
                  <p className="text-red-500 text-xs mt-1 ml-1">{postalError}</p>
                )}
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xl font-semibold text-gray-700 mb-2">Bank Details</legend>
            <div className="grid grid-cols-2 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <FloatingLabelInput type="text" name="accountHolderName" value={formData.accountHolderName || ''} onChange={handleInputChange} label="Account Name" />
              </div>
              <FloatingLabelInput type="text" name="bankName" value={formData.bankName || ''} onChange={handleInputChange} label="Bank Name" />
              <FloatingLabelInput type="text" name="ifscCode" value={formData.ifscCode || ''} onChange={handleInputChange} label="IFSC Code" />
              <div className="relative md:col-span-2 bg-gray-100">
                <select
                  name="accountType"
                  value={formData.accountType || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, accountType: e.target.value }))}
                  className="w-full border border-gray-700 rounded-md px-3 pt-6 pb-2 text-sm text-gray-800 bg-gray-100 focus:outline-none focus:border-sky-500 appearance-none h-[58px]"
                >
                  <option value="" disabled hidden></option>
                  <option value="Savings">Savings</option>
                  <option value="Current">Current</option>
                </select>
                <label className="absolute left-3 top-2 text-xs text-gray-500 pointer-events-none">
                  Account Type
                </label>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </div>
              </div>
              <div className="md:col-span-2">
                <FloatingLabelInput type="text" name="accountNumber" value={formData.accountNumber || ''} onChange={handleInputChange} label="Account No." />
              </div>
            </div>
          </fieldset>

          {submitError && <p className="text-sm text-center text-red-600">{submitError}</p>}
          {submitSuccess && <p className="text-sm text-center text-green-600">{submitSuccess}</p>}

          <div className="flex justify-left ">
            <button type="submit" disabled={isSubmitting} className="inline-flex items-center= justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-sky-500 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400">
              {isSubmitting ? 'Saving...' : 'Save All Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProfilePage;