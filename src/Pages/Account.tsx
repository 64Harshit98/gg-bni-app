import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { logoutUser, generateCompanyReferralCode } from '../lib/AuthOperations';
import useTutorial from '../Catalogue/hooks/useTutorial';
import { completeTutorial } from '../Catalogue/hooks/useCompleteTutorial';
import { db } from '../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ROUTES } from '../constants/routes.constants';
import { Permissions } from '../enums';
import ShowWrapper from '../context/ShowWrapper';
import ShinyText from '../Components/ShinyText';
import NotificationBell from '../Components/NotificationBell';
//import { useMemo } from 'react';
import BusinessCard from '../Catalogue/BusinessCards/BusinessCard';
import { TutorialStep } from '../Components/TutorialStep';
import { Avatar, AvatarImage, AvatarFallback } from '../Components/ui/avatar';
import { Button } from '../Components/ui/button';
import { Spinner } from '../Components/ui/spinner';
import {
  Pencil,
  Copy,
  Check,
  ChevronRight,
  BarChart3,
  Settings,
  CreditCard,
  LifeBuoy,
  Sparkles,
  LogOut,
  User,
  Gift,
  Calendar,
} from 'lucide-react';
import { cn } from '../lib/utils';

interface UserProfile {
  name: string;
  email: string;
  profilePicture?: string;
}

const TOTAL_STEPS = 7;

const FeatureTile: React.FC<{
  to: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  featured?: boolean;
  badgeClass?: string;
  className?: string;
}> = ({ to, icon, label, description, featured = false, badgeClass, className }) => (
  <Link
    to={to}
    className={cn(
      'group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border p-5 transition-all hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      featured
        ? 'glow-primary border-0 bg-gradient-to-br from-primary via-primary to-[oklch(0.5_0.24_320)] text-primary-foreground'
        : 'border-border bg-card hover:border-primary/40 hover:shadow-lg',
      className,
    )}
  >
    {featured && (
      <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-white/15 blur-2xl" />
    )}
    <span
      className={cn(
        'relative flex size-10 items-center justify-center rounded-xl [&>svg]:size-5',
        featured
          ? 'bg-white/20 text-white'
          : badgeClass ?? 'bg-gradient-to-br from-primary/20 to-fuchsia-500/20 text-primary shadow-inner',
      )}
    >
      {icon}
    </span>
    <div className="relative mt-6">
      <div className="flex items-center justify-between gap-2">
        <p className={cn('text-sm font-semibold', featured ? 'text-white' : 'text-foreground')}>{label}</p>
        <ChevronRight
          className={cn(
            'size-4 shrink-0 transition-transform group-hover:translate-x-0.5',
            featured ? 'text-white/80' : 'text-muted-foreground group-hover:text-foreground',
          )}
        />
      </div>
      <p className={cn('mt-0.5 text-xs', featured ? 'text-white/75' : 'text-muted-foreground')}>
        {description}
      </p>
    </div>
  </Link>
);

const Account: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: loadingAuth } = useAuth();

  // Profile & Referral State
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
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
    completeTutorial(currentUser, 'accountTutorialDone', setTutorialStep);
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
        const userDocRef = doc(db, 'companies', currentUser.companyId, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          setProfileData(userDocSnap.data() as UserProfile);

          // Fetch existing referral code from company root doc
          const companyDocRef = doc(db, 'companies', currentUser.companyId);
          const companyDocSnap = await getDoc(companyDocRef);
          if (companyDocSnap.exists()) {
            setCompanyReferralCode(companyDocSnap.data().ownReferralCode || null);
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

  useTutorial(currentUser, setTutorialStep, 'accountTutorialDone');

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

  const handleEditProfile = () => navigate(`${ROUTES.EDIT_PROFILE}`);

  if (loadingAuth || loadingProfile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted text-muted-foreground">
        <Spinner size="lg" />
        <p className="text-sm">Loading your account…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-6 text-center text-destructive">
        <p>{error}</p>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-6 text-center text-muted-foreground">
        <p>No profile data available.</p>
      </div>
    );
  }

  return (
    <div className="aurora flex min-h-screen flex-col bg-muted">
      {showBadge && (
        <div
          className={`w-full py-2 text-center text-sm font-bold shadow-sm transition-colors duration-300 ${isUrgent ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground'}`}
        >
          <ShinyText
            text={`Subscription expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}.`}
            speed={4}
            delay={0}
            color="#030303"
            shineColor="#faf5f5"
            spread={100}
            direction="left"
            yoyo={false}
            pauseOnHover={false}
            disabled={false}
          />
          <Link to="/subscription" className="ml-2 underline underline-offset-2 hover:opacity-80">
            Renew Now
          </Link>
        </div>
      )}

      <header className="glass sticky top-0 z-10 flex items-center justify-between border-b border-border px-4 py-3">
        <div className="w-9" />
        <h1 className="text-lg font-semibold text-foreground">Account</h1>
        <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
          <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-card shadow-xs">
            <NotificationBell />
          </div>
        </ShowWrapper>
      </header>

      <div className="mx-auto w-full max-w-none px-4 pb-16 md:px-8 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
        {/* ── Hero cover card ── */}
        <div ref={profileRef} className="relative mt-3 overflow-hidden rounded-3xl border border-border bg-card shadow-lg ring-1 ring-primary/10">
          <div className="relative h-28 bg-gradient-to-br from-primary via-primary to-[oklch(0.5_0.24_320)]">
            <div className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full bg-white/15 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-12 left-12 size-40 rounded-full bg-white/10 blur-3xl" />
          </div>

          <div className="px-6 pb-6">
            <div className="-mt-14 flex items-end justify-between">
              <TutorialStep
                step={1}
                currentStep={tutorialStep}
                text="This is your profile. Tap the pencil icon to update your photo and name."
                onNext={() => next(2)}
                onSkip={skip}
              >
                <div className="relative">
                  <div className="glow-primary rounded-full bg-gradient-to-br from-primary to-[oklch(0.6_0.22_330)] p-[3px]">
                    <Avatar className="size-24 border-4 border-card">
                      <AvatarImage src={profileData.profilePicture} alt={profileData.name} />
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        <User className="size-12" />
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <button
                    onClick={handleEditProfile}
                    aria-label="Edit profile"
                    className="absolute bottom-1 -right-1 flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Pencil className="size-4" />
                  </button>
                </div>
              </TutorialStep>

              <Button variant="outline" size="sm" onClick={handleEditProfile} className="mb-1">
                <Pencil className="size-3.5" />
                Edit
              </Button>
            </div>

            <div className="mt-3">
              <h2 className="text-gradient text-xl font-bold tracking-tight">{profileData.name}</h2>
              <p className="text-sm text-muted-foreground">{profileData.email}</p>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {companyReferralCode ? (
                <div className="flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5">
                  <Gift className="size-3.5 text-primary" />
                  <span className="text-xs text-muted-foreground">Ref</span>
                  <span className="font-mono text-sm font-semibold tracking-wider text-foreground">
                    {companyReferralCode}
                  </span>
                  <button
                    onClick={handleCopy}
                    className="text-muted-foreground transition hover:text-foreground"
                    title="Copy referral code"
                    aria-label="Copy referral code"
                  >
                    {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGenerateCode}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/5 disabled:text-muted-foreground"
                >
                  <Gift className="size-3.5" />
                  {isGenerating ? 'Generating…' : 'Generate referral code'}
                </button>
              )}
              {daysRemaining !== null && (
                <div
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
                    isUrgent ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
                  )}
                >
                  <Calendar className="size-3.5" />
                  {daysRemaining} day{daysRemaining === 1 ? '' : 's'} left
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Business card ── */}
        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Share your business card
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
        </section>

        {/* ── Manage (bento) ── */}
        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Manage
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <ShowWrapper requiredPermission={Permissions.ViewReports}>
              <div ref={reportsRef} className="col-span-2">
                <TutorialStep
                  step={3}
                  currentStep={tutorialStep}
                  text="View detailed sales and business reports here."
                  onNext={() => next(4)}
                  onSkip={skip}
                  mobileArrowAlign="left"
                >
                  <FeatureTile
                    featured
                    to={ROUTES.REPORTS}
                    icon={<BarChart3 />}
                    label="Reports"
                    description="Dive into sales, tax, P&L and party ledgers"
                  />
                </TutorialStep>
              </div>
              <div ref={settingRef}>
                <TutorialStep
                  step={4}
                  currentStep={tutorialStep}
                  text="Configure your business settings, taxes, units and more."
                  onNext={() => next(5)}
                  onSkip={skip}
                >
                  <FeatureTile to={ROUTES.MASTERS} icon={<Settings />} label="Settings" description="Taxes, units & preferences" badgeClass="bg-gradient-to-br from-sky-500/25 to-cyan-500/25 text-sky-600 shadow-inner dark:text-sky-400" />
                </TutorialStep>
              </div>
            </ShowWrapper>

            <div ref={plansRef}>
              <TutorialStep
                step={5}
                currentStep={tutorialStep}
                text="View and manage your subscription plan here."
                onNext={() => next(6)}
                onSkip={skip}
                mobileArrowAlign="left"
              >
                <FeatureTile to={ROUTES.SUBSCRIPTION_PAGE} icon={<CreditCard />} label="Plans" description="Manage your subscription" badgeClass="bg-gradient-to-br from-violet-500/25 to-fuchsia-500/25 text-violet-600 shadow-inner dark:text-violet-400" />
              </TutorialStep>
            </div>

            <div ref={supportRef}>
              <TutorialStep
                step={6}
                currentStep={tutorialStep}
                text="Need help? Reach out to our support team from here."
                onNext={() => next(7)}
                onSkip={skip}
              >
                <FeatureTile to={ROUTES.SUPPORT_PAGE} icon={<LifeBuoy />} label="Support" description="Get help from our team" badgeClass="bg-gradient-to-br from-emerald-500/25 to-teal-500/25 text-emerald-600 shadow-inner dark:text-emerald-400" />
              </TutorialStep>
            </div>

            <ShowWrapper requiredPermission={Permissions.ViewAddons}>
              <div ref={addOnsRef}>
                <TutorialStep
                  step={7}
                  currentStep={tutorialStep}
                  text="Unlock extra features for your business with Add Ons."
                  onNext={() => completeTutorial(currentUser, 'accountTutorialDone', setTutorialStep)}
                  onSkip={skip}
                  isLast
                >
                  <FeatureTile to={ROUTES.ADDITIONAL_FEATURES} icon={<Sparkles />} label="Add-ons" description="Unlock extra features" badgeClass="bg-gradient-to-br from-amber-500/25 to-orange-500/25 text-amber-600 shadow-inner dark:text-amber-400" />
                </TutorialStep>
              </div>
            </ShowWrapper>
          </div>
        </section>

        {/* ── Logout ── */}
        <div ref={logoutRef} className="mt-8 flex justify-center">
          <Button
            variant="outline"
            onClick={handleLogout}
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="size-4" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Account;