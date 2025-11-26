import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { logoutUser } from '../lib/AuthOperations';
import { db } from '../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ROUTES } from '../constants/routes.constants';
import { Permissions } from '../enums';
import ShowWrapper from '../context/ShowWrapper';

interface UserProfile {
  name: string;
  email: string;
  profilePicture?: string; // Added optional profilePicture
}

const Account: React.FC = () => {
  const navigate = useNavigate();

  const { currentUser, loading: loadingAuth } = useAuth();
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (loadingAuth) return;
      
      if (!currentUser) {
        setLoadingProfile(false);
        setError('No user is currently logged in.');
        navigate(ROUTES.LANDING);
        return;
      }

      if (!currentUser.companyId) {
        setLoadingProfile(false);
        setError('User is not associated with a company.');
        return;
      }

      setLoadingProfile(true);
      setError(null);

      try {
        const userDocRef = doc(
          db,
          'companies',
          currentUser.companyId,
          'users',
          currentUser.uid
        );
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
  }, [currentUser, loadingAuth, navigate]);


  const handleLogout = async () => {
    try {
      await logoutUser();
      navigate(ROUTES.LANDING);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleEditProfile = () => {
    navigate(`${ROUTES.EDIT_PROFILE}`);
  };

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

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      <div className="bg-gray-100 p-6 pb-4 border-b border-gray-300">
        <h1 className="text-4xl text-center font-bold text-slate-800 mb-4">Account</h1>

        <div className="flex flex-col items-center">
          <div className="relative mb-2">
            <img
              className="w-32 h-32 rounded-full object-cover border border-white shadow-lg bg-white"
              // UPDATED: Use profilePicture if available, else placeholder
              src={profileData.profilePicture || "https://github.com/shadcn.png"} 
              alt="Profile"
            />
            <div className="absolute top-0 left-0 right-0 bottom-0 border-2 border-green-500 rounded-full animate-pulse"></div>

            <button
              onClick={handleEditProfile}
              className="absolute -top-1 -right-1 bg-white p-1.5 rounded-full shadow-lg hover:bg-gray-200 transition focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6 text-gray-700"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                />
              </svg>
            </button>
          </div>

          <h2 className="text-2xl font-semibold text-slate-900">
            {profileData.name}
          </h2>
          <p className="text-base text-gray-500">{profileData.email}</p>
        </div>
      </div>

      <div className="flex-1 bg-gray-100 p-2">
        <div className="w-full">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">
            Share your Business Card
          </h2>
          <div className="flex space-x-4 overflow-x-auto pb-4 mb-4">
            <div className="flex-shrink-0 w-40 bg-white rounded-sm shadow p-4 h-32 flex flex-col justify-between">
              <p className="font-semibold text-gray-800">Business Card 1</p>
            </div>
            <div className="flex-shrink-0 w-40 bg-white rounded-sm shadow p-4 h-32 flex flex-col justify-between">
              <p className="font-semibold text-gray-800">Business Card 2</p>
            </div>
            <div className="flex-shrink-0 w-40 bg-white rounded-sm shadow p-4 h-32 flex flex-col justify-between">
              <p className="font-semibold text-gray-800">Business Card 3</p>
            </div>
          </div>
          <div className="w-full flex grid grid-cols-2 gap-4 justify-center mt-2 space-y-2 flex-col">

            <ShowWrapper
              requiredPermission={Permissions.ViewPNLReport}
            >
              <Link
                to={ROUTES.REPORTS}
                className="
                flex justify-between items-center
                bg-white p-4 rounded-sm shadow-md mb-2
                border border-gray-200 text-gray-800
                hover:shadow-lg
              "
              >
                <span className="text-lg font-medium">Reports</span>
                <span className="text-xl text-gray-600">→</span>
              </Link>
              <Link
                to={ROUTES.MASTERS}
                className="
                flex justify-between items-center
                bg-white p-4 rounded-sm shadow-md mb-2
                border border-gray-200 text-gray-800
                hover:shadow-lg
              "
              >
                <span className="text-lg font-medium">Setting</span>
                <span className="text-xl text-gray-600">→</span>
              </Link>
            </ShowWrapper>
          </div>
          <div className="mt-2 flex justify-center">
            <button
              onClick={handleLogout}
              className="rounded-sm bg-red-500 py-3 px-8 font-semibold text-white transition hover:bg-red-600"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div >
  );
};

export default Account;