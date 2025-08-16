import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { useAuth } from '../../context/auth-context';

// --- Data Types ---
interface ProfileData {
  // From 'users' collection
  name: string;
  email: string;
  // From 'business_info' collection
  businessName: string;
  businessType: string;
  businessCategory: string;
  registrationNumber: string;
  gstin: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
}

// --- Custom Hook to manage all profile data ---
const useProfileData = (userId?: string) => {
  const [profile, setProfile] = useState<Partial<ProfileData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchProfileData = async () => {
      setLoading(true);
      try {
        const userDocRef = doc(db, 'users', userId);
        const businessDocRef = doc(db, 'business_info', userId);

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
  }, [userId]);

  const saveData = async (data: Partial<ProfileData>) => {
    if (!userId || !auth.currentUser) {
      throw new Error("User is not authenticated.");
    }

    const { name, email, ...businessData } = data;

    // Prepare update promises
    const userDocRef = doc(db, 'users', userId);
    const businessDocRef = doc(db, 'business_info', userId);

    const promises = [];

    // 1. Update Firebase Auth profile
    if (name && auth.currentUser.displayName !== name) {
      promises.push(updateProfile(auth.currentUser, { displayName: name }));
    }

    // 2. Update 'users' collection
    promises.push(setDoc(userDocRef, { name: name }, { merge: true }));

    // 3. Update 'business_info' collection, now including the owner's name
    promises.push(setDoc(businessDocRef, { ...businessData, ownerName: name, updatedAt: serverTimestamp() }, { merge: true }));

    await Promise.all(promises);
  };

  return { profile, loading, error, saveData };
};


// --- Main Edit Profile Page Component ---
const EditProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const { profile, loading: dataLoading, error: dataError, saveData } = useProfileData(currentUser?.uid);

  const [formData, setFormData] = useState<Partial<ProfileData>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  useEffect(() => {
    setFormData(profile);
  }, [profile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    setIsSubmitting(true);

    try {
      await saveData(formData);
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
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto bg-white p-6 rounded-xl shadow-md">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Edit Profile</h1>
          <button onClick={() => navigate(-1)} className="rounded-full bg-gray-200 p-2 text-gray-700 transition hover:bg-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Owner Info Section */}
          <fieldset>
            <legend className="text-xl font-semibold text-gray-700 mb-4">Owner Details</legend>
            <div className="space-y-4">
              <input name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Your Full Name" className="w-full p-3 border rounded-md" />
            </div>
          </fieldset>

          {/* Business Info Section */}
          <fieldset>
            <legend className="text-xl font-semibold text-gray-700 mb-4">Business Information</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input name="businessName" value={formData.businessName || ''} onChange={handleInputChange} placeholder="Business Name" className="w-full p-3 border rounded-md md:col-span-2" />
              <input name="businessType" value={formData.businessType || ''} onChange={handleInputChange} placeholder="Business Type" className="w-full p-3 border rounded-md" />
              <input name="businessCategory" value={formData.businessCategory || ''} onChange={handleInputChange} placeholder="Business Category" className="w-full p-3 border rounded-md" />
              <input name="registrationNumber" value={formData.registrationNumber || ''} onChange={handleInputChange} placeholder="Registration Number" className="w-full p-3 border rounded-md" />
              <input name="gstin" value={formData.gstin || ''} onChange={handleInputChange} placeholder="GSTIN (Optional)" className="w-full p-3 border rounded-md" />
            </div>
          </fieldset>

          {/* Business Address Section */}
          <fieldset>
            <legend className="text-xl font-semibold text-gray-700 mb-4">Business Address</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <textarea name="streetAddress" value={formData.streetAddress || ''} onChange={handleInputChange} placeholder="Street Address" rows={3} className="w-full p-3 border rounded-md md:col-span-2"></textarea>
              <input name="city" value={formData.city || ''} onChange={handleInputChange} placeholder="City" className="w-full p-3 border rounded-md" />
              <input name="state" value={formData.state || ''} onChange={handleInputChange} placeholder="State" className="w-full p-3 border rounded-md" />
              <input name="postalCode" value={formData.postalCode || ''} onChange={handleInputChange} placeholder="Postal Code" className="w-full p-3 border rounded-md" />
            </div>
          </fieldset>

          {submitError && <p className="text-sm text-center text-red-600">{submitError}</p>}
          {submitSuccess && <p className="text-sm text-center text-green-600">{submitSuccess}</p>}

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400">
              {isSubmitting ? 'Saving...' : 'Save All Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProfilePage;
