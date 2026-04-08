import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { logoutUser } from '../lib/AuthOperations';
import { db } from '../lib/Firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ROUTES } from '../constants/routes.constants';
import { Permissions } from '../enums';
import ShowWrapper from '../context/ShowWrapper';
import ShinyText from '../Components/ShinyText';
import NotificationBell from '../Components/NotificationBell';
import { useMemo } from 'react';
import BusinessCard from '../Catalogue/BusinessCards/BusinessCard';
import { TutorialStep } from '../Components/TutorialStep';

interface UserProfile {
  name: string;
  email: string;
  profilePicture?: string;
}

const TOTAL_STEPS = 8;

const Account: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: loadingAuth } = useAuth();
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tutorialStep, setTutorialStep] = useState(0);

  // Refs for auto-scroll targets
  const profileRef = useRef<HTMLDivElement | null>(null);
  const businessCardRef = useRef<HTMLDivElement | null>(null);
  const reportsRef = useRef<HTMLDivElement | null>(null);
  const settingRef = useRef<HTMLDivElement | null>(null);
  const plansRef = useRef<HTMLDivElement | null>(null);
  const supportRef = useRef<HTMLDivElement | null>(null);
  const addOnsRef = useRef<HTMLDivElement | null>(null);
  const logoutRef = useRef<HTMLDivElement | null>(null);

  const stepRefMap: Record<number, React.RefObject<HTMLDivElement | null>> = {
    1: profileRef,
    2: businessCardRef,
    3: reportsRef,
    4: settingRef,
    5: plansRef,
    6: supportRef,
    7: addOnsRef,
    8: logoutRef,
  };

  const next = useCallback((n: number) => {
    const nextStep = n <= TOTAL_STEPS ? n : 0;
    setTutorialStep(nextStep);
  }, []);

  const skip = useCallback(async () => {
    if (!currentUser?.companyId) return;

    try {
      await setDoc(
        doc(db, 'companies', currentUser.companyId, 'settings', 'tutorial'),
        { accountTutorialDone: true },
        { merge: true }
      );
    } catch (e) {
      console.error('Error saving account tutorial:', e);
    }

    setTutorialStep(0);
    window.dispatchEvent(new Event("account_tutorial_done"));
  }, [currentUser]);

  // Auto-scroll when step changes
  useEffect(() => {
    if (tutorialStep === 0) return;
    const ref = stepRefMap[tutorialStep];
    if (!ref?.current) return;

    setTimeout(() => {
      ref.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 80);
  }, [tutorialStep]);

  const daysRemaining = useMemo(() => {
    const subData = (currentUser as any)?.subscription || (currentUser as any)?.Subscription;
    const rawDate = subData?.expiryDate;
    if (!rawDate) return null;
    const expiryDate = new Date((rawDate as any).toDate ? (rawDate as any).toDate() : rawDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }, [currentUser]);

  const showBadge = daysRemaining !== null && daysRemaining <= 5 && daysRemaining >= 0;
  const isUrgent = daysRemaining !== null && daysRemaining <= 2;

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (loadingAuth) return;
      if (!currentUser) { setLoadingProfile(false); setError('No user is currently logged in.'); navigate(ROUTES.LANDING); return; }
      if (!currentUser.companyId) { setLoadingProfile(false); setError('User is not associated with a company.'); return; }
      setLoadingProfile(true);
      setError(null);
      try {
        const userDocRef = doc(db, 'companies', currentUser.companyId, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) setProfileData(userDocSnap.data() as UserProfile);
        else setError('User profile not found in Firestore.');
      } catch (err) {
        console.error('Failed to fetch user profile:', err);
        setError('Failed to fetch user data. Please try again.');
      } finally {
        setLoadingProfile(false);
      }
    };
    fetchUserProfile();
  }, [currentUser, loadingAuth, navigate]);

  useEffect(() => {
    const checkTutorial = async () => {
      if (!currentUser?.companyId) return;

      try {
        const ref = doc(db, 'companies', currentUser.companyId, 'settings', 'tutorial');
        const snap = await getDoc(ref);
        const done = snap.exists() && snap.data()?.accountTutorialDone;

        if (!done) {
          setTutorialStep(1);
        }
      } catch (e) {
        console.error('Error fetching account tutorial:', e);
        setTutorialStep(1);
      }
    };

    checkTutorial();
  }, [currentUser]);

  const handleLogout = async () => {
    try { await logoutUser(); navigate(ROUTES.LANDING); }
    catch (err) { console.error('Logout failed:', err); }
  };

  const handleEditProfile = () => navigate(`${ROUTES.EDIT_PROFILE}`);

  if (loadingAuth || loadingProfile) {
    return <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-slate-500"><p>Loading profile data...</p></div>;
  }
  if (error) {
    return <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-red-500"><p>{error}</p></div>;
  }
  if (!profileData) {
    return <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-red-500"><p>No profile data available.</p></div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      {showBadge && (
        <div className={`w-full text-center py-2 text-sm font-bold text-white shadow-sm transition-colors duration-300 ${isUrgent ? 'bg-red-300' : 'bg-amber-200'}`}>
          <ShinyText text={`Subscription expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}.`} speed={4} delay={0} color="#030303" shineColor="#faf5f5" spread={100} direction="left" yoyo={false} pauseOnHover={false} disabled={false} />
          <Link to="/subscription" className="text-black ml-2 underline hover:text-gray-100">Renew Now</Link>
        </div>
      )}

      <div className="bg-gray-100 p-2 border-b border-gray-300 mb-4 flex items-center justify-between">
        <div className="w-10" />

        <h1 className="text-3xl font-bold text-center text-slate-800">Account</h1>

        {/* Notification Bell */}
        <div className="relative border border-slate-300 rounded-sm p-2 bg-gray-100 shadow-sm">
          <NotificationBell />
        </div>
      </div>

      {/* Step 1 — Profile photo + edit */}
      <div ref={profileRef} className="flex flex-col items-center pb-4">
        <TutorialStep
          step={1}
          currentStep={tutorialStep}
          text="This is your profile. Tap the pencil icon to update your photo and name."
          onNext={() => next(2)}
          onSkip={skip}
        >
          <div className="relative mb-2">
            <img
              className="w-32 h-32 rounded-full object-cover border border-white shadow-lg bg-white"
              src={profileData.profilePicture || "https://github.com/shadcn.png"}
              alt="Profile"
            />
            <div className="absolute top-0 left-0 right-0 bottom-0 border-2 border-green-500 rounded-full animate-pulse"></div>
            <button
              onClick={handleEditProfile}
              className="absolute -top-1 -right-1 bg-white p-1.5 rounded-full shadow-lg hover:bg-gray-200 transition focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-700">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </button>
          </div>
        </TutorialStep>
        <h2 className="text-2xl font-semibold text-slate-900">{profileData.name}</h2>
        <p className="text-base text-gray-500">{profileData.email}</p>
      </div>

      <div className="flex-1 bg-gray-100 p-2">
        <div className="w-full">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Share your Business Card</h2>

          {/* Step 2 — Business Card */}
          <div ref={businessCardRef}>
            <TutorialStep
              step={2}
              currentStep={tutorialStep}
              text="Share your digital business card with customers directly from here."
              onNext={() => next(3)}
              onSkip={skip}
            >
              <BusinessCard />
            </TutorialStep>
          </div>

          <div className="w-full grid grid-cols-2 gap-4 justify-center mt-2 space-y-2 flex-col">
            <ShowWrapper requiredPermission={Permissions.ViewReports}>

              {/* Step 3 — Reports */}
              <div ref={reportsRef}>
                <TutorialStep
                  step={3}
                  currentStep={tutorialStep}
                  text="View detailed sales and business reports here."
                  onNext={() => next(4)}
                  onSkip={skip}
                  arrowAlign="left" 
                >
                  <Link to={ROUTES.REPORTS} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-md mb-2 border border-gray-200 text-gray-800 hover:shadow-lg">
                    <span className="text-lg font-medium">Reports</span>
                    <span className="text-xl text-gray-600">→</span>
                  </Link>
                </TutorialStep>
              </div>

              {/* Step 4 — Settings */}
              <div ref={settingRef}>
                <TutorialStep
                  step={4}
                  currentStep={tutorialStep}
                  text="Configure your business settings, taxes, units and more."
                  onNext={() => next(5)}
                  onSkip={skip}
                >
                  <Link to={ROUTES.MASTERS} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-md mb-2 border border-gray-200 text-gray-800 hover:shadow-lg">
                    <span className="text-lg font-medium">Setting</span>
                    <span className="text-xl text-gray-600">→</span>
                  </Link>
                </TutorialStep>
              </div>

            </ShowWrapper>

            {/* Step 5 — Plans */}
            <div ref={plansRef}>
              <TutorialStep
                step={5}
                currentStep={tutorialStep}
                text="View and manage your subscription plan here."
                onNext={() => next(6)}
                onSkip={skip}
                arrowAlign='left'
              >
                <Link to={ROUTES.SUBSCRIPTION_PAGE} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-md mb-2 border border-gray-200 text-gray-800 hover:shadow-lg">
                  <span className="text-lg font-medium">Plans</span>
                  <span className="text-xl text-gray-600">→</span>
                </Link>
              </TutorialStep>
            </div>

            {/* Step 6 — Support */}
            <div ref={supportRef}>
              <TutorialStep
                step={6}
                currentStep={tutorialStep}
                text="Need help? Reach out to our support team from here."
                onNext={() => next(7)}
                onSkip={skip}
              >
                <Link to={ROUTES.SUPPORT_PAGE} className="flex justify-between items-center bg-white p-4 rounded-sm shadow-md mb-2 border border-gray-200 text-gray-800 hover:shadow-lg">
                  <span className="text-lg font-medium">Support</span>
                  <span className="text-xl text-gray-600">→</span>
                </Link>
              </TutorialStep>
            </div>

          </div>

          {/* Step 7 — Add Ons */}
          <div ref={addOnsRef} className="mt-4 mb-6 flex justify-center">
            <ShowWrapper requiredPermission={Permissions.ViewReports}>
              <TutorialStep
                step={7}
                currentStep={tutorialStep}
                text="Unlock extra features for your business with Add Ons."
                onNext={async () => {
                  if (currentUser?.companyId) {
                    try {
                      await setDoc(
                        doc(db, 'companies', currentUser.companyId, 'settings', 'tutorial'),
                        { accountTutorialDone: true },
                        { merge: true }
                      );
                    } catch (e) {
                      console.error('Error saving account tutorial:', e);
                    }
                  }
                  next(8);
                }}
                onSkip={skip}
                isLast
              >
                <Link to={ROUTES.ADDITIONAL_FEATURES} className="rounded-sm bg-white py-3 px-8 font-semibold shadow-md mb-2 border border-gray-200 text-gray-800 hover:shadow-lg">
                  <span className="text-lg font-medium">Add Ons</span>
                  <span className="text-xl text-gray-600">→</span>
                </Link>
              </TutorialStep>
            </ShowWrapper>
          </div>


          <div ref={logoutRef} className="mt-2 flex justify-center">
              <button onClick={handleLogout} className="rounded-sm bg-red-500 py-3 px-8 font-semibold text-white transition hover:bg-red-600">
                Logout
              </button>
            
          </div>

        </div>
      </div>
    </div>
  );
};

export default Account;
