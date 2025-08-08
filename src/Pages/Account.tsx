import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/Authcontext'; // Import useAuth hook
import { logoutUser } from '../lib/auth_operations'; // Import logout function
import { db } from '../lib/firebase'; // Import Firestore database instance
import { doc, getDoc } from 'firebase/firestore';
import { ROUTES } from '../constants/routes.constants'; // Import routes for navigation

// Define a type for the user profile data
interface UserProfile {
  name: string;
  email: string;
  // Add other fields from your Firestore user document here
}

const Account: React.FC = () => {
  const navigate = useNavigate();

  const { currentUser, loading: loadingAuth } = useAuth(); // Get user and auth loading state
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  
  // useEffect to fetch user data from Firestore
  useEffect(() => {
    const fetchUserProfile = async () => {
      // First, check if auth state is still loading or no user is logged in
      if (loadingAuth) {
        return;
      }
      if (!currentUser) {
        setLoadingProfile(false);
        setError('No user is currently logged in.');
        navigate(ROUTES.LOGIN); // Redirect to login if currentUser is null
        return;
      }

      setLoadingProfile(true);
      setError(null);

      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          setProfileData(userDocSnap.data() as UserProfile);
        } else {
          setError('User profile not found in Firestore.');
        }
      } catch (err) {
        console.error('Failed to fetch user profile:', err);
        setError('Failed to fetch user data. Please try again.');
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchUserProfile();
  }, [currentUser, loadingAuth, navigate]); // Rerun effect when auth state changes


  // Function to handle logout logic
  const handleLogout = async () => {
    try {
      await logoutUser(); // Call the imported logout function
      navigate(ROUTES.LOGIN); // Redirect to the login page
    } catch (err) {
      console.error('Logout failed:', err);
      // You can add a user-facing alert here
    }
  };

  // Function to handle edit profile
  // In Account.tsx
const handleEditProfile = () => {
  navigate(`${ROUTES.ACCOUNT}/${ROUTES.EDIT_PROFILE}`);
};

  // Conditional rendering for different states
  if (loadingAuth || loadingProfile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-slate-500">
        <p>Loading profile data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-red-500">
        <p>{error}</p>
      </div>
    );
  }

  if (!profileData) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-red-500">
          <p>No profile data available.</p>
        </div>
      );
  }

  // Render the actual content once data is loaded
  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-50 py-8 px-4 text-center">
      <img
        className="mb-4 h-32 w-32 rounded-full object-cover"
        src="https://i.pravatar.cc/150?img=1" // You can replace this with a dynamic profile image URL
        alt="Profile"
      />

      <h2 className="mb-1 text-2xl font-semibold text-slate-900">
        {/* Display the user's name */}
        {profileData.name}
      </h2>
      <p className="mb-8 text-base text-slate-500">
        {/* Display the user's email */}
        {profileData.email}
      </p>

      {/* Buttons: Edit Profile, Logout, and Sign Up */}
      <div className="mb-12 flex flex-wrap justify-center gap-4">
        <button
          onClick={handleEditProfile}
          className="rounded-full bg-slate-200 py-3 px-8 font-semibold text-slate-900 transition hover:bg-slate-300"
        >
          Edit Profile
        </button>
        <button
          onClick={handleLogout}
          className="rounded-full bg-red-500 py-3 px-8 font-semibold text-white transition hover:bg-red-600"
        >
          Logout
        </button>
      </div>

      {/* NEW SECTION: Share your business card */}
      <div className="w-full border-t border-slate-200 pt-8">
        <h2 className="mb-6 text-left text-2xl font-semibold text-slate-800">
          Share your business card
        </h2>
        <div className="mb-8 flex gap-5 overflow-x-auto pb-4">
          {/* Template 1 */}
          <div className="flex-shrink-0 w-56 rounded-lg bg-slate-100 p-4 text-center shadow-sm transition hover:-translate-y-1">
            <img
              src="/images/template1.png"
              alt="Business Card Template 1"
              className="mb-3 block h-auto w-full rounded"
            />
            <p className="font-semibold text-slate-600">Template 1</p>
          </div>
          {/* Template 2 */}
          <div className="flex-shrink-0 w-56 rounded-lg bg-slate-100 p-4 text-center shadow-sm transition hover:-translate-y-1">
            <img
              src="/images/template2.png"
              alt="Business Card Template 2"
              className="mb-3 block h-auto w-full rounded"
            />
            <p className="font-semibold text-slate-600">Template 2</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-center items-center gap-4"> {/* Added flex-wrap */}
  <button className="bg-gray-200 text-gray-800 px-6 py-3 rounded-full shadow-sm">Share</button>
  <button className="bg-blue-600 text-white px-6 py-3 rounded-full shadow-md">View</button>

  {/* Option A: Wrap in a full-width div */}
  <div className="w-full flex justify-center mt-4"> {/* Added mt-4 for spacing */}
    <Link
      to={ROUTES.REPORTS}
      className="
         flex justify-between items-center
    bg-white p-4 px-5 rounded-xl shadow-md mb-4
    border border-gray-200 text-gray-800
    transition-all duration-200 ease-in-out
    hover:-translate-y-0.5 hover:shadow-lg
    w-full"
    >
      <span className="text-lg font-medium">Reports</span>
      <span className="text-xl text-gray-600">→</span>
    </Link>
  </div>
        </div>
      </div>
    </div>
  );
};

export default Account;