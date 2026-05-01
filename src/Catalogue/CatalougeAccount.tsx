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
import ShinyText from '../Components/ShinyText';

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

    const [daysRemaining, setDaysRemaining] = useState<number | null>(null);

    useEffect(() => {
        const fetchExpiry = async () => {
            if (!currentUser?.companyId) return;
            const ref = doc(db, 'companies', currentUser.companyId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                const expiry = snap.data().expiryDate;
                if (!expiry) return;
                const d = expiry.toDate ? expiry.toDate() : new Date(expiry);
                const diff = d.getTime() - new Date().getTime();
                setDaysRemaining(Math.ceil(diff / (1000 * 60 * 60 * 24)));
            }
        };
        fetchExpiry();
    }, [currentUser?.companyId]);

    const showBadge = daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0;
    const isUrgent = daysRemaining !== null && daysRemaining <= 2;

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
            {showBadge && (
                <div className={`w-full text-center py-2 text-sm font-bold text-white shadow-sm transition-colors duration-300 ${isUrgent ? 'bg-red-300' : 'bg-amber-200'}`}>
                    <ShinyText text={`Subscription expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}.`} speed={4} delay={0} color="#030303" shineColor="#faf5f5" spread={100} direction="left" yoyo={false} pauseOnHover={false} disabled={false} />
                    <Link to="/subscription" className="text-black ml-2 underline hover:text-gray-100">Renew Now</Link>
                </div>
            )}
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