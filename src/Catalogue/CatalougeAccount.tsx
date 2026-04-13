import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { logoutUser } from '../lib/AuthOperations';
import { db } from '../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ROUTES } from '../constants/routes.constants';
import BusinessCard from './BusinessCards/BusinessCard';
import { Permissions } from '../enums/permissions.enum';
import ShowWrapper from '../context/ShowWrapper';

interface UserProfile {
    name: string;
    email: string;
    profilePicture: string;
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
        navigate(`${ROUTES.CHOME}/${ROUTES.CATA_EDIT}`);
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
            <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-4">

                {/* Centre — identical to Dashboard */}
                <div className="flex-1 text-center flex flex-col items-center justify-center">
                    <h1 className="text-3xl font-bold text-slate-800">Account</h1>
                </div>


            </header>
            <div className="flex flex-col py-3 items-center">
                <div className="relative mb-2">
                    {profileData.profilePicture ? (
                        <img
                            className="w-32 h-32 rounded-full object-cover border border-white shadow-lg bg-white"
                            src={profileData.profilePicture}
                            alt="Profile"
                        />
                    ) : (
                        <div className="w-32 h-32 rounded-full border border-white shadow-lg bg-gray-200 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16 text-gray-400">
                                <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
                            </svg>
                        </div>
                    )}
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

            <div className="flex-1 bg-gray-100 p-2">
                <div className="w-full">
                    <h2 className="text-xl font-semibold text-slate-800 mb-4">
                        Share your Business Card
                    </h2>
                    <BusinessCard />
                    <div className="w-full grid grid-cols-2 gap-4 justify-center mt-2 space-y-2 flex-col">

                        <ShowWrapper
                            requiredPermission={Permissions.ViewPNLReport}
                        >
                            <Link
                                to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_REPORTS}`}
                                className="flex justify-between items-center bg-white p-4 rounded-sm shadow-md mb-border border-gray-200 text-gray-800 hover:shadow-lg">
                                <span className="text-lg font-medium">Reports</span>
                                <span className="text-xl text-gray-600">→</span>
                            </Link>
                            <Link
                                to={`${ROUTES.CHOME}/${ROUTES.CATA_MASTERS}`}
                                className="flex justify-between items-center bg-white p-4 rounded-sm shadow-md mb-border border-gray-200 text-gray-800 hover:shadow-lg">
                                <span className="text-lg font-medium">Settings</span>
                                <span className="text-xl text-gray-600">→</span>
                            </Link>
                        </ShowWrapper>
                        <Link
                            to={ROUTES.SUBSCRIPTION_PAGE}
                            className="flex justify-between items-center bg-white p-4 rounded-sm shadow-md mb-border border-gray-200 text-gray-800 hover:shadow-lg">
                            <span className="text-lg font-medium">Plans</span>
                            <span className="text-xl text-gray-600">→</span>
                        </Link>
                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATA_SUPPORT}`}
                            className="flex justify-between items-center bg-white p-4 rounded-sm shadow-md mb-border border-gray-200 text-gray-800 hover:shadow-lg">
                            <span className="text-lg font-medium">Supports</span>
                            <span className="text-xl text-gray-600">→</span>
                        </Link>
                    </div>
                    <div className="mt-4 flex flex-col items-center gap-2">
                        <Link
                            to={`${ROUTES.CHOME}/${ROUTES.CATA_ADDITIONAL_SERVICES}`}
                            className="rounded-sm bg-white py-3 px-8 font-semibold shadow-md border border-gray-200 text-gray-800 hover:shadow-lg"
                        >
                            Add Ons →
                        </Link>
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