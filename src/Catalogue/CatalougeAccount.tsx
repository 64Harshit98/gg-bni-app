import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { logoutUser, generateCompanyReferralCode } from '../lib/AuthOperations';
import useTutorial from '../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../Catalogue/hooks/useCompleteTutorial';
import { ROUTES } from '../constants/routes.constants';
import BusinessCard from './BusinessCards/BusinessCard';
import ShinyText from '../Components/ShinyText';
import NotificationBell from '../Components/NotificationBell';
import { TutorialStep } from '../Components/TutorialStep';
import { FiCopy, FiCheck } from 'react-icons/fi';
import ShowWrapper from '../context/ShowWrapper';
import { Cata_Permissions } from './enum/cata_permissions.enum';
import { Spinner } from '../Components/ui/spinner';
import {
  fetchCatalogueUserProfile,
  fetchSubscriptionDaysRemaining,
  type CatalogueUserProfile,
} from '../services/catalogue/catalogueAccount.service';
import { QuickLinksGrid } from './components/CatalogueAccount/QuickLinksGrid';

const TOTAL_STEPS = 7;

const Account: React.FC = () => {
    const navigate = useNavigate();

    const { currentUser, loading: loadingAuth } = useAuth();
    const [profileData, setProfileData] = useState<CatalogueUserProfile | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [companyReferralCode, setCompanyReferralCode] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // Tutorial State
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

    const skip = useCallback(() => {
        completeTutorial(currentUser, 'catalogueAccountTutorialDone', setTutorialStep);
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

    const [daysRemaining, setDaysRemaining] = useState<number | null>(null);

    useEffect(() => {
        if (!currentUser?.companyId) return;
        fetchSubscriptionDaysRemaining(currentUser.companyId)
            .then(setDaysRemaining)
            .catch(() => setDaysRemaining(null));
    }, [currentUser?.companyId]);

    const showBadge = daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0;
    const isUrgent = daysRemaining !== null && daysRemaining <= 2;

    useEffect(() => {
        const loadProfile = async () => {
            if (loadingAuth) {
                return; // Wait for auth to be ready
            }
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
                const profile = await fetchCatalogueUserProfile(currentUser.companyId, currentUser.uid);
                if (profile) {
                    setProfileData(profile);
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

        loadProfile();
    }, [currentUser, loadingAuth, navigate]);

    useTutorial(currentUser, setTutorialStep, 'catalogueAccountTutorialDone');

    const handleCopy = () => {
        if (companyReferralCode) {
            navigator.clipboard.writeText(companyReferralCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleGenerateCode = async () => {
        if (!currentUser?.companyId) return;
        setIsGenerating(true);
        try {
            const newCode = await generateCompanyReferralCode(currentUser.companyId);
            setCompanyReferralCode(newCode);
        } catch (err) {
            console.error("Failed to generate code:", err);
        } finally {
            setIsGenerating(false);
        }
    };

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
            <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
                <Spinner size="xl" />
                <p>Loading profile data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-background text-destructive">
                <p>{error}</p>
            </div>
        );
    }

    if (!profileData) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-background text-destructive">
                <p>No profile data available.</p>
            </div>
        );
    }

    return (
        <div className="aurora flex min-h-screen flex-col bg-background">
            {showBadge && (
                <div className={`w-full py-2 text-center text-sm font-bold text-white shadow-sm transition-colors duration-300 ${isUrgent ? 'bg-destructive' : 'bg-warning'}`}>
                    <ShinyText text={`Subscription expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}.`} speed={4} delay={0} color="#030303" shineColor="#faf5f5" spread={100} direction="left" yoyo={false} pauseOnHover={false} disabled={false} />
                    <Link to="/subscription" className="ml-2 text-foreground underline hover:opacity-80">Renew Now</Link>
                </div>
            )}
            <header className="glass sticky top-0 z-20 flex flex-shrink-0 items-center justify-between border-b border-border p-4">
                <div className="w-10" />

                <div className="flex flex-1 flex-col items-center justify-center text-center">
                    <h1 className="text-2xl font-bold text-gradient">Account</h1>
                </div>
                <ShowWrapper requiredPermission={Cata_Permissions.ViewNotification}>
                    <div className="relative rounded-full border border-border bg-card shadow-sm">
                        <NotificationBell />
                    </div>
                </ShowWrapper>
            </header>

            <div ref={profileRef} className="flex flex-col items-center py-3">
                <TutorialStep
                    step={1}
                    currentStep={tutorialStep}
                    text="This is your profile. Tap the pencil icon to update your photo and name."
                    onNext={() => next(2)}
                    onSkip={skip}
                >
                    <div className="relative mb-2">
                        {profileData.profilePicture ? (
                            <img
                                className="size-32 rounded-full border border-card bg-card object-cover shadow-lg"
                                src={profileData.profilePicture}
                                alt="Profile"
                            />
                        ) : (
                            <div className="flex size-32 items-center justify-center rounded-full border border-card bg-muted shadow-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-16 text-muted-foreground">
                                    <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
                                </svg>
                            </div>
                        )}
                        <div className="absolute inset-0 animate-pulse rounded-full border-2 border-success" />

                        <button
                            onClick={handleEditProfile}
                            className="absolute -right-1 -top-1 flex items-center justify-center rounded-full bg-card p-1.5 shadow-lg transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                                className="size-6 text-foreground"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                                />
                            </svg>
                        </button>
                    </div>
                </TutorialStep>

                <h2 className="text-2xl font-semibold text-foreground">
                    {profileData.name}
                </h2>
                <p className="text-base text-muted-foreground">{profileData.email}</p>
                <div className="mt-3 flex h-10 items-center justify-center">
                    {companyReferralCode ? (
                        <div className="flex items-center rounded-xl border border-border bg-card px-3 py-1.5 shadow-sm">
                            <span className="mr-2 text-sm text-muted-foreground">Ref Code:</span>
                            <span className="font-mono font-bold tracking-wider text-foreground">{companyReferralCode}</span>
                            <button
                                onClick={handleCopy}
                                className="ml-3 text-muted-foreground transition hover:text-foreground"
                                title="Copy Referral Code"
                            >
                                {copied ? <FiCheck className="text-success" size={18} /> : <FiCopy size={16} />}
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={handleGenerateCode}
                            disabled={isGenerating}
                            className="text-sm text-primary hover:underline disabled:text-muted-foreground"
                        >
                            {isGenerating ? 'Generating...' : 'Generate Referral Code'}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 bg-background p-2">
                <div className="w-full">
                    <h2 className="mb-4 text-xl font-semibold text-foreground">
                        Share your Business Card
                    </h2>
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

                    <QuickLinksGrid
                        tutorialStep={tutorialStep}
                        onNext={next}
                        onSkip={skip}
                        onComplete={() => completeTutorial(currentUser, 'catalogueAccountTutorialDone', setTutorialStep)}
                        onLogout={handleLogout}
                        reportsRef={reportsRef}
                        settingRef={settingRef}
                        plansRef={plansRef}
                        supportRef={supportRef}
                        addOnsRef={addOnsRef}
                    />
                </div>
            </div>
        </div>
    );
};

export default Account;
