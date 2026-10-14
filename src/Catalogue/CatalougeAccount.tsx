import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { logoutUser, generateCompanyReferralCode } from '../lib/AuthOperations';
import useTutorial from '../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../Catalogue/hooks/useCompleteTutorial';
import { db } from '../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ROUTES } from '../constants/routes.constants';
import BusinessCard from './BusinessCards/BusinessCard';
import ShinyText from '../Components/ShinyText';
//import NotificationBell from '../Components/NotificationBell';
import { TutorialStep } from '../Components/TutorialStep';
import { FiCopy, FiCheck } from 'react-icons/fi';
import ShowWrapper from '../context/ShowWrapper';
import { Cata_Permissions } from './enum/cata_permissions.enum';

interface UserProfile {
    name: string;
    email: string;
    profilePicture?: string;
    role?: string;
    phone?: string;
    phoneNumber?: string;
    address?: string;
}
const TOTAL_STEPS = 7;

/* ---------- UI-only helpers (no logic) — Catalogue = orange theme ---------- */

const Ico: React.FC<{ className?: string; children: React.ReactNode }> = ({
    className = 'w-5 h-5',
    children,
}) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
    >
        {children}
    </svg>
);

// 'primary' = catalogue orange (was 'blue' in POS), 'amber' = catalogue warning (a16207)
type Tint = 'green' | 'primary' | 'amber' | 'magenta';
const TINTS: Record<Tint, string> = {
    green: 'bg-[#e9faef] text-[#008236]',
    primary: 'bg-[#ffedd5] text-[#c2410c]',
    amber: 'bg-[#fef6d7] text-[#a16207]',
    magenta: 'bg-[#ffe8f8] text-[#c4009a]',
};

// warm-tinted shadow (POS uses blue-tinted rgba(21,48,140))
const SHADOW_CARD = 'shadow-[0_1px_2px_rgba(124,45,18,0.05),0_2px_6px_rgba(124,45,18,0.06)]';

// Row content (icon chip + title + description + chevron) — same as SettingsRow in the design
const RowLink: React.FC<{
    to: string;
    tint: Tint;
    title: string;
    desc: string;
    children: React.ReactNode;
}> = ({ to, tint, title, desc, children }) => (
    <Link to={to} className="flex items-center gap-3 px-4 py-3 text-[#0f172b] no-underline">
        <span className={`inline-grid h-10 w-10 shrink-0 place-items-center rounded-sm ${TINTS[tint]}`}>
            <Ico className="h-5 w-5">{children}</Ico>
        </span>
        <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium leading-[22px]">{title}</span>
            <span className="block text-xs leading-[18px] text-[#5b6b86]">{desc}</span>
        </span>
        <Ico className="h-4 w-4 shrink-0 text-[#5b6b86]">
            <path d="m9 6 6 6-6 6" />
        </Ico>
    </Link>
);

// Grid cell (one row of the grouped settings card). Hover lives on the cell so corners stay rounded.
const CELL =
    'bg-white transition-colors hover:bg-[#fff8f2] empty:hidden ' +
    // 1-col (mobile): first row rounded top, last row rounded bottom
    '[&:first-child]:rounded-t-sm [&:last-child]:rounded-b-sm ' +
    // 2-col (md+): corners
    'lg:[&:first-child]:rounded-tr-none lg:[&:nth-child(2)]:rounded-tr-sm ' +
    'lg:[&:last-child]:rounded-bl-none lg:[&:last-child]:rounded-br-sm ' +
    'lg:[&:last-child:nth-child(odd)]:col-span-2 lg:[&:last-child:nth-child(odd)]:rounded-bl-sm ' +
    'lg:[&:nth-last-child(2):nth-child(odd)]:rounded-bl-sm';

const Account: React.FC = () => {
    const navigate = useNavigate();

    const { currentUser, loading: loadingAuth } = useAuth();
    const [profileData, setProfileData] = useState<UserProfile | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [companyReferralCode, setCompanyReferralCode] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [businessAddress, setBusinessAddress] = useState<string | null>(null);

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

                    // Address is stored in business_info (same source the business card uses)
                    const businessInfoSnap = await getDoc(
                        doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId)
                    );
                    if (businessInfoSnap.exists()) {
                        setBusinessAddress(businessInfoSnap.data().streetAddress || null);
                    }
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
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#fff5ec] text-[#45556c]">
                <p>Loading profile data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#fff5ec] text-[#d5000c]">
                <p>{error}</p>
            </div>
        );
    }

    if (!profileData) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#fff5ec] text-[#d5000c]">
                <p>No profile data available.</p>
            </div>
        );
    }

    const initials =
        profileData.name
            ?.split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join('')
            .toUpperCase() || '?';

    const phoneToShow = profileData.phone || profileData.phoneNumber;
    const addressToShow = profileData.address || businessAddress;

    const copyButton = (
        <button
            onClick={handleCopy}
            className="grid h-8 w-8 place-items-center rounded-sm text-[#45556c] transition-colors hover:bg-[#fff8f2] hover:text-[#0f172b]"
            title="Copy Referral Code"
            aria-label="Copy referral code"
        >
            {copied ? <FiCheck className="text-[#008236]" size={16} /> : <FiCopy size={16} />}
        </button>
    );

    return (
        <div className="flex min-h-screen w-full max-w-full flex-col overflow-x-clip bg-[#fff5ec] text-sm text-[#0f172b]">
            {showBadge && (
                <div
                    className={`w-full border-b border-[#f6e1d0] py-2 text-center text-sm font-semibold transition-colors duration-300 ${
                        isUrgent ? 'bg-[#ffeef0]' : 'bg-[#fef6d7]'
                    }`}
                >
                    <ShinyText
                        text={`Subscription expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}.`}
                        speed={4} delay={0} color="#030303" shineColor="#faf5f5" spread={100} direction="left" yoyo={false} pauseOnHover={false} disabled={false}
                    />
                    <Link to="/subscription" className="ml-2 font-semibold text-[#c2410c] underline hover:text-[#9a3412]">Renew Now</Link>
                </div>
            )}

            {/* Page head */}
            <header className="hidden items-center gap-4 px-4 pb-4 pt-4 md:flex md:px-6 md:pt-5">
                <div className="hidden min-w-0 md:block">
                    <h1 className="m-0 text-2xl font-semibold leading-8 tracking-[-0.01em]">Account</h1>
                    <p className="m-0 text-[13px] text-[#45556c]">Your profile, business card and store settings</p>
                </div>

                {/* Notification Bell */}
                {/* <ShowWrapper requiredPermission={Cata_Permissions.ViewNotification}>
                    <div className="hidden sm:flex relative border border-slate-300 rounded-sm bg-gray-100 shadow-sm justify-self-end">
                        <NotificationBell />
                    </div>
                </ShowWrapper> */}

                <div ref={logoutRef} className="ml-auto">
                    <button
                        onClick={handleLogout}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium text-[#d5000c] transition-colors hover:bg-[#ffeef0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ea580c]"
                    >
                        <Ico className="h-4 w-4">
                            <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9" />
                        </Ico>
                        Log out
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 items-start gap-4 px-4 pb-6 pt-4 md:gap-5 md:px-6 md:pt-0 xl:grid-cols-[320px_minmax(0,1fr)]">
                {/* ================= LEFT: PROFILE ================= */}
                {/* Step 1 — Profile photo + edit */}
                <div ref={profileRef} className="min-w-0">
                    <TutorialStep
                        step={1}
                        currentStep={tutorialStep}
                        text="This is your profile. Tap the pencil icon to update your photo and name."
                        onNext={() => next(2)}
                        onSkip={skip}
                    >
                        <div className={`min-w-0 md:grid md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-x-6 md:gap-y-4 md:rounded-sm md:border md:border-[#f6e1d0] md:bg-white md:p-5 xl:block xl:pt-7 ${SHADOW_CARD.replace('shadow', 'md:shadow')}`}>
                            {/* Identity */}
                            <div className="flex items-center gap-3.5 xl:flex-col xl:gap-1 xl:text-center">
                                {profileData.profilePicture ? (
                                    <img
                                        className="h-[60px] w-[60px] shrink-0 rounded-full object-cover md:h-[72px] md:w-[72px] xl:h-[88px] xl:w-[88px]"
                                        src={profileData.profilePicture}
                                        alt="Profile"
                                    />
                                ) : (
                                    <span className="grid h-[60px] w-[60px] shrink-0 place-items-center rounded-full bg-[#ffedd5] text-xl font-semibold text-[#c2410c] md:h-[72px] md:w-[72px] md:text-2xl xl:h-[88px] xl:w-[88px] xl:text-[30px]">
                                        {initials}
                                    </span>
                                )}

                                <div className="min-w-0 flex-1 xl:mt-3 xl:flex-none">
                                    <h2 className="m-0 truncate text-lg font-semibold leading-[26px] md:text-xl md:leading-7">{profileData.name}</h2>
                                    {profileData.role && (
                                        <div className="mt-0.5 text-xs leading-[18px] text-[#45556c] md:mt-1">
                                            <span className="hidden h-[22px] items-center rounded-sm bg-[#0f172b] px-2 align-middle text-[11px] font-semibold uppercase leading-[22px] tracking-[0.03em] text-white md:inline-flex">
                                                {profileData.role}
                                            </span>
                                            <span className="capitalize md:hidden">{profileData.role}</span>
                                        </div>
                                    )}
                                    {/* Mobile email */}
                                    <div className="truncate text-xs leading-[18px] text-[#5b6b86] md:hidden">{profileData.email}</div>
                                    {phoneToShow && (
                                        <div className="truncate text-xs leading-[18px] text-[#5b6b86] md:hidden">{phoneToShow}</div>
                                    )}
                                    {addressToShow && (
                                        <div className="line-clamp-2 text-xs leading-[18px] text-[#5b6b86] md:hidden">{addressToShow}</div>
                                    )}
                                </div>

                                {/* Mobile: outlined icon edit button */}
                                <button
                                    onClick={handleEditProfile}
                                    aria-label="Edit profile"
                                    className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-sm border border-[#7a8aa3] bg-white text-[#45556c] transition-colors hover:bg-[#fff8f2] hover:text-[#0f172b] md:hidden"
                                >
                                    <Ico>
                                        <path d="M17 3l4 4L8 20H4v-4z" />
                                    </Ico>
                                </button>
                            </div>

                            {/* Desktop facts */}
                            <div className="hidden w-full gap-2.5 text-left text-[13px] text-[#45556c] md:grid md:content-center md:border-l md:border-[#f6e1d0] md:pl-6 xl:my-4 xl:border-y xl:border-l-0 xl:border-[#f6e1d0] xl:py-4 xl:pl-0">
                                <span className="flex items-center gap-2.5">
                                    <Ico className="h-4 w-4 shrink-0">
                                        <rect x="3" y="5" width="18" height="14" rx="2" />
                                        <path d="m3 7 9 6 9-6" />
                                    </Ico>
                                    <span className="min-w-0 break-all">{profileData.email}</span>
                                </span>
                                {phoneToShow && (
                                    <span className="flex items-center gap-2.5">
                                        <Ico className="h-4 w-4 shrink-0">
                                            <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2" />
                                        </Ico>
                                        {phoneToShow}
                                    </span>
                                )}
                                {addressToShow && (
                                    <span className="flex items-center gap-2.5">
                                        <Ico className="h-4 w-4 shrink-0">
                                            <path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" />
                                            <circle cx="12" cy="9" r="2.5" />
                                        </Ico>
                                        <span className="min-w-0">{addressToShow}</span>
                                    </span>
                                )}
                            </div>

                            {/* Actions: referral + edit */}
                            <div className="md:col-span-2 md:flex md:items-center md:gap-3 md:border-t md:border-[#f6e1d0] md:pt-4 xl:block xl:border-t-0 xl:pt-0">
                                {/* Referral code */}
                                <div className="mt-4 flex min-h-10 items-center md:mt-0 md:flex-1 xl:flex-none xl:justify-center">
                                    {companyReferralCode ? (
                                        <div className="inline-flex h-10 w-full items-center justify-between gap-2.5 rounded-sm border border-dashed border-[#7a8aa3] pl-3.5 pr-1.5 text-[13px] text-[#45556c] md:w-auto md:justify-start">
                                            Referral code
                                            <span className="font-mono text-sm font-semibold leading-none tracking-[0.06em] text-[#0f172b]">{companyReferralCode}</span>
                                            {copyButton}
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleGenerateCode}
                                            disabled={isGenerating}
                                            className="inline-flex h-10 w-full items-center justify-center rounded-sm border border-dashed border-[#7a8aa3] px-4 text-[13px] font-medium text-[#c2410c] transition-colors hover:bg-[#fff8f2] disabled:cursor-not-allowed disabled:opacity-45 md:w-auto"
                                        >
                                            {isGenerating ? 'Generating...' : 'Generate Referral Code'}
                                        </button>
                                    )}
                                </div>

                                {/* Desktop: Edit profile (secondary, block) */}
                                <button
                                    onClick={handleEditProfile}
                                    className="mt-4 hidden h-10 w-full items-center justify-center gap-2 rounded-sm border border-[#7a8aa3] bg-white text-sm font-medium text-[#0f172b] transition-colors hover:bg-[#fff8f2] md:mt-0 md:inline-flex md:w-auto md:px-5 xl:mt-4 xl:w-full xl:px-0"
                                >
                                    <Ico className="h-4 w-4">
                                        <path d="M17 3l4 4L8 20H4v-4z" />
                                    </Ico>
                                    Edit profile
                                </button>
                            </div>
                        </div>
                    </TutorialStep>
                </div>

                {/* ================= RIGHT ================= */}
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
                    {/* Step 2 — Business Card */}
                    <div ref={businessCardRef} className="min-w-0">
                        <div className={`min-w-0 md:rounded-sm md:border md:border-[#f6e1d0] md:bg-white md:p-5 ${SHADOW_CARD.replace('shadow', 'md:shadow')}`}>
                            {/* Mobile label */}
                            <div className="mb-2 px-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-[#5b6b86] md:hidden">
                                Business card
                            </div>
                            {/* Desktop head */}
                            <div className="mb-4 hidden md:block">
                                <h2 className="m-0 text-base font-semibold leading-6">Business card</h2>
                                <p className="m-0 text-xs leading-[18px] text-[#5b6b86]">Pick a design, then download or share it on WhatsApp</p>
                            </div>
                            <TutorialStep
                                step={2}
                                currentStep={tutorialStep}
                                text="Share your digital business card with customers directly from here."
                                onNext={() => next(3)}
                                onSkip={skip}
                            >
                                <BusinessCard theme="catalogue" />
                            </TutorialStep>
                        </div>
                    </div>

                    {/* Settings group */}
                    <div className="min-w-0">
                        <div className="mb-2 px-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-[#5b6b86] md:hidden">
                            Store
                        </div>
                        <div className={`rounded-sm border border-[#f6e1d0] bg-[#f6e1d0] ${SHADOW_CARD}`}>
                            <div className="grid grid-cols-1 gap-px lg:grid-cols-2">
                                <ShowWrapper requiredPermission={Cata_Permissions.ViewReports}>
                                    {/* Step 3 — Reports */}
                                    <div ref={reportsRef} className={CELL}>
                                        <TutorialStep
                                            step={3}
                                            currentStep={tutorialStep}
                                            text="View detailed sales and business reports here."
                                            onNext={() => next(4)}
                                            onSkip={skip}
                                            mobileArrowAlign="left"
                                        >
                                            <RowLink
                                                to={`${ROUTES.CHOME}/${ROUTES.CATALOGUE_REPORTS}`}
                                                tint="green"
                                                title="Reports"
                                                desc="Sales and business reports"
                                            >
                                                <path d="M3 3v18h18" />
                                                <path d="M8 16v-4M13 16V8M18 16v-6" />
                                            </RowLink>
                                        </TutorialStep>
                                    </div>

                                    {/* Step 4 — Settings */}
                                    <div ref={settingRef} className={CELL}>
                                        <TutorialStep
                                            step={4}
                                            currentStep={tutorialStep}
                                            text="Configure your business settings, taxes, units and more."
                                            onNext={() => next(5)}
                                            onSkip={skip}
                                        >
                                            <RowLink
                                                to={`${ROUTES.CHOME}/${ROUTES.CATA_MASTERS}`}
                                                tint="primary"
                                                title="Setting"
                                                desc="Business, tax, units and more"
                                            >
                                                <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
                                                <circle cx="16" cy="6" r="2" />
                                                <circle cx="10" cy="12" r="2" />
                                                <circle cx="18" cy="18" r="2" />
                                            </RowLink>
                                        </TutorialStep>
                                    </div>
                                </ShowWrapper>

                                {/* Step 5 — Plans */}
                                <div ref={plansRef} className={CELL}>
                                    <TutorialStep
                                        step={5}
                                        currentStep={tutorialStep}
                                        text="View and manage your subscription plan here."
                                        onNext={() => next(6)}
                                        onSkip={skip}
                                        mobileArrowAlign="left"
                                    >
                                        <RowLink to={ROUTES.SUBSCRIPTION_PAGE} tint="amber" title="Plans" desc="Your plan and billing">
                                            <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />
                                        </RowLink>
                                    </TutorialStep>
                                </div>

                                {/* Step 6 — Support */}
                                <div ref={supportRef} className={CELL}>
                                    <TutorialStep
                                        step={6}
                                        currentStep={tutorialStep}
                                        text="Need help? Reach out to our support team from here."
                                        onNext={() => next(7)}
                                        onSkip={skip}
                                    >
                                        <RowLink
                                            to={`${ROUTES.CHOME}/${ROUTES.CATA_SUPPORT}`}
                                            tint="green"
                                            title="Support"
                                            desc="Get help from our team"
                                        >
                                            <circle cx="12" cy="12" r="9" />
                                            <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" />
                                        </RowLink>
                                    </TutorialStep>
                                </div>

                                {/* Step 7 — Add Ons */}
                                <div ref={addOnsRef} className={CELL}>
                                    <TutorialStep
                                        step={7}
                                        currentStep={tutorialStep}
                                        text="Unlock extra features for your business with Add Ons."
                                        onNext={() => completeTutorial(currentUser, 'catalogueAccountTutorialDone', setTutorialStep)}
                                        onSkip={skip}
                                        isLast
                                    >
                                        <RowLink
                                            to={`${ROUTES.CHOME}/${ROUTES.CATA_ADDITIONAL_SERVICES}`}
                                            tint="magenta"
                                            title="Add Ons"
                                            desc="Unlock extra features for your business"
                                        >
                                            <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
                                            <path d="M3 8l9 5 9-5M12 13v8" />
                                        </RowLink>
                                    </TutorialStep>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile: Log out at the very bottom */}
            <div className="px-4 pb-6 md:hidden">
                <button
                    onClick={handleLogout}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm border border-[#f6e1d0] bg-white text-sm font-medium text-[#d5000c] transition-colors hover:bg-[#ffeef0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ea580c]"
                >
                    <Ico className="h-4 w-4">
                        <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9" />
                    </Ico>
                    Log out
                </button>
            </div>
        </div>
    );
};

export default Account;