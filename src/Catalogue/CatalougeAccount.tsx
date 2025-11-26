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
}

const Account: React.FC = () => {
    const navigate = useNavigate();

    const { currentUser, loading: loadingAuth } = useAuth();
    const [profileData, setProfileData] = useState<UserProfile | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchUserProfile = async () => {
            if (loadingAuth) {
                return; // Wait for auth to be ready
            }
            if (!currentUser) {
                setLoadingProfile(false);
                setError('No user is currently logged in.');
                navigate(ROUTES.LANDING);
                return;
            }

            // Check for companyId from the currentUser object
            if (!currentUser.companyId) {
                setLoadingProfile(false);
                setError('User is not associated with a company.');
                // You might want to navigate away or show a specific error
                return;
            }

            setLoadingProfile(true);
            setError(null);

            try {
                // --- FIX: Build the correct multi-tenant path ---
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
                    <div className="relative mb-4">
                        <img
                            className="w-28 h-28 rounded-full object-cover border-4 border-white shadow-lg"
                            src="https://github.com/shadcn.png" // Placeholder image
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
                                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.438.995s.145.755.438.995l1.003.827c.424.35.534.954.26 1.431l-1.296 2.247a1.125 1.125 0 01-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.941l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.52 6.52 0 01-.22-.127c-.324-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.296-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.437-.995s-.145-.755-.437-.995l-1.004-.827a1.125 1.125 0 01-.26-1.431l1.296-2.247a1.125 1.125 0 011.37-.49l1.217.456c.355.133.75.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.213-1.28z"
                                />
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
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
                        {/* ... Your Business Card UI ... */}
                        <div className="flex-shrink-0 w-40 bg-white rounded-sm shadow p-4 h-32 flex flex-col justify-between">
                            <p className="font-semibold text-gray-800">Business Card 1</p>
                            {/* ... button ... */}
                        </div>
                        <div className="flex-shrink-0 w-40 bg-white rounded-sm shadow p-4 h-32 flex flex-col justify-between">
                            <p className="font-semibold text-gray-800">Business Card 2</p>
                            {/* ... button ... */}
                        </div>
                        <div className="flex-shrink-0 w-40 bg-white rounded-sm shadow p-4 h-32 flex flex-col justify-between">
                            <p className="font-semibold text-gray-800">Business Card 3</p>
                            {/* ... button ... */}
                        </div>
                    </div>
                    <div className="w-full flex grid grid-cols-2 gap-4 justify-center mt-2 space-y-2 flex-col">

                        <ShowWrapper
                            requiredPermission={Permissions.ViewPNLReport}
                        >
                            <Link
                                to={ROUTES.CATALOGUE_REPORTS}
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