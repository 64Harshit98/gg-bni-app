import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/Authcontext';
import { db } from '../../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ROUTES } from '../../constants/routes.constants';

// Define the type for the user profile data
interface UserProfile {
  name: string;
  email: string; // The email is not editable, but we show it for context
  mobileNumber?: string;
  bio?: string;
  // Add other fields you want to be editable
}

const EditProfile: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: loadingAuth } = useAuth();
  
  // State for form fields
  const [name, setName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [bio, setBio] = useState('');

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Effect to fetch the current user's profile data
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (loadingAuth || !currentUser) {
        if (!loadingAuth && !currentUser) {
          navigate(ROUTES.LOGIN);
        }
        return;
      }

      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data() as UserProfile;
          setName(userData.name || '');
          setMobileNumber(userData.mobileNumber || '');
          setBio(userData.bio || '');
        } else {
          setError('User profile not found. Cannot edit.');
        }
      } catch (err) {
        console.error('Failed to fetch user profile:', err);
        setError('Failed to load profile. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, [currentUser, loadingAuth, navigate]);

  // Handle form submission to update the profile
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setError('You must be logged in to save your profile.');
      return;
    }
    if (!name.trim()) {
      setError('Name cannot be empty.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const updates = {
        name: name.trim(),
        mobileNumber: mobileNumber.trim(),
        bio: bio.trim(),
        // Add other fields to update here
      };
      
      await updateDoc(userDocRef, updates);
      setSuccess('Profile updated successfully!');
      console.log('Profile updated successfully!');
      // Optionally, navigate back to the account page after a delay
      setTimeout(() => {
        navigate(ROUTES.ACCOUNT);
      }, 1500);

    } catch (err) {
      console.error('Failed to update user profile:', err);
      setError('Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loadingAuth || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        <p>Loading profile...</p>
      </div>
    );
  }

  if (error && !isSaving) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-red-500">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-50 py-8 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-800">Edit Profile</h2>
          <button
            onClick={() => navigate(-1)}
            className="rounded-full bg-slate-200 p-2 text-slate-900 transition hover:bg-slate-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <form onSubmit={handleSave}>
          {error && <p className="mb-4 text-red-500">{error}</p>}
          {success && <p className="mb-4 text-green-600">{success}</p>}
          
          <div className="mb-4">
            <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700">Name</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-slate-100 p-3 text-slate-800 focus:border-blue-500 focus:outline-none"
              disabled={isSaving}
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email Address</label>
            <input
              type="email"
              id="email"
              value={currentUser?.email || ''}
              className="w-full rounded-md border border-slate-300 bg-slate-200 p-3 text-slate-500"
              disabled // Email is not editable
            />
          </div>

          <div className="mb-4">
            <label htmlFor="mobileNumber" className="mb-2 block text-sm font-medium text-slate-700">Mobile Number</label>
            <input
              type="tel"
              id="mobileNumber"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-slate-100 p-3 text-slate-800 focus:border-blue-500 focus:outline-none"
              disabled={isSaving}
            />
          </div>

          <div className="mb-6">
            <label htmlFor="bio" className="mb-2 block text-sm font-medium text-slate-700">Bio</label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-300 bg-slate-100 p-3 text-slate-800 focus:border-blue-500 focus:outline-none"
              disabled={isSaving}
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-full bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700"
            disabled={isSaving || !name.trim()}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EditProfile;
