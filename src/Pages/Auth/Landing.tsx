import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, LoaderCircle, Lock, LogIn, Mail, Package, ReceiptText, Users, Wallet } from 'lucide-react';
import { ROUTES } from '../../constants/routes.constants';
import { PLANS } from '../../enums';
import { Spinner } from '../../constants/Spinner';
import { loginUser } from '../../lib/AuthOperations';
import { useEmailCheck } from '../../lib/useEmailCheck';
import { useAuth } from '../../context/auth-context';
import {
  AuthLayout,
  CardHeading,
  EmailField,
  ErrorBanner,
  Field,
  IconChip,
  LegalNote,
  Navy,
  PANEL_MUTED,
  PasswordInput,
  SupportLink,
  authBtn,
  authLink,
} from './AuthUI';

const SHOP_TYPES = ['Kirana store', 'Medical store', 'Mobile shop', 'Garment shop', 'Hardware store', 'Sweet shop'];

const LOGIN_ERRORS: Record<string, string> = {
  'auth/invalid-credential': "That email and password don't match. Check them and try again, or reset your password.",
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': "That password doesn't match. Try again, or reset your password.",
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/user-disabled': 'This account has been turned off. Please contact support.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
  'auth/network-request-failed': "Can't reach SELLAR. Check your internet and try again.",
};

/** Index of the highlighted shop type; stays put when the phone asks for less motion. */
const useShopTicker = () => {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % SHOP_TYPES.length), 1900);
    return () => window.clearInterval(timer);
  }, [reduce]);
  return index;
};

const BENEFITS = [
  { icon: ReceiptText, title: 'GST bills', text: 'Print or send on WhatsApp.' },
  { icon: Package, title: 'Stock alerts', text: 'Know what to reorder.' },
  { icon: Wallet, title: 'Udhaar', text: 'See who owes you.' },
];

const LoginPanel: React.FC<{ active: number }> = ({ active }) => (
  <div className="flex flex-1 flex-col justify-between gap-10 px-12 pb-10 pt-12">
    <div className="flex flex-col gap-[18px]">
      <p className={`text-lg leading-[26px] ${PANEL_MUTED}`}>One app for your</p>
      <p className="sr-only">Kirana stores, medical stores, mobile shops, garment shops, hardware stores and sweet shops.</p>
      <ul aria-hidden="true">
        {SHOP_TYPES.map((shop, i) => (
          <li
            key={shop}
            className={`text-[40px] font-semibold leading-[48px] tracking-[-0.025em] transition-colors duration-500 motion-reduce:transition-none ${
              i === active ? 'text-white' : 'text-white/20'
            }`}
          >
            {shop}
          </li>
        ))}
      </ul>
      <p className={`mt-1.5 max-w-[380px] text-base leading-[25px] ${PANEL_MUTED}`}>
        Billing, stock and udhaar on your phone at the counter and on your computer at home.
      </p>
    </div>
    <div className="grid grid-cols-3 gap-5">
      {BENEFITS.map(({ icon: Icon, title, text }) => (
        <div key={title} className="flex flex-col gap-1.5 border-t border-white/15 pt-5">
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="text-sm font-semibold">{title}</span>
          <span className={`text-[13px] leading-[19px] ${PANEL_MUTED}`}>{text}</span>
        </div>
      ))}
    </div>
  </div>
);

const LoginHero: React.FC<{ active: number }> = ({ active }) => (
  <Navy label="About SELLAR" className="px-4 pb-11 pt-4">
    <p className={`text-sm leading-5 ${PANEL_MUTED}`}>One app for your</p>
    <p className="mt-0.5 min-h-[38px] text-[30px] font-semibold leading-[38px] tracking-[-0.02em]">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={SHOP_TYPES[active]}
          className="inline-block"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {SHOP_TYPES[active]}
        </motion.span>
      </AnimatePresence>
    </p>
    <p className={`mt-2 text-[13px] leading-[19px] ${PANEL_MUTED}`}>Billing, stock and udhaar in your pocket.</p>
  </Navy>
);

const LoginPage: React.FC = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeShop = useShopTicker();
  const emailCheck = useEmailCheck(email);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      await loginUser(email.trim(), password, keepLoggedIn);
    } catch (err) {
      // 🚨 CRITICAL: DO NOT PUT ANY navigate('/') OR navigate(ROUTES.HOME) HERE! 🚨
      // The Firebase login will trigger the AuthProvider,
      // which will update the currentUser,
      // which will trigger "The Smart Door" below automatically!
      const code = (err as { code?: string })?.code ?? '';
      setError(LOGIN_ERRORS[code] ?? LOGIN_ERRORS['auth/invalid-credential']);
      setLoading(false);
    }
  };

  // If AuthProvider is figuring out who is logged in, show spinner
  if (authLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // THE SMART DOOR: As soon as we have a user, route them immediately
  if (currentUser) {
    const isCatalogueOnly = currentUser.plan === PLANS.CATALOGUE_PRO;
    return <Navigate to={isCatalogueOnly ? ROUTES.CHOME : ROUTES.HOME} replace />;
  }

  return (
    <AuthLayout
      panelLabel="About SELLAR"
      panel={<LoginPanel active={activeShop} />}
      mobileHero={<LoginHero active={activeShop} />}
      headerAside={<SupportLink />}
    >
      <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-3 max-lg:-mt-10 lg:justify-center">
        <form onSubmit={handleLogin} noValidate className="rounded-sm border border-line bg-white shadow-card">
          <div className="flex flex-col gap-5 px-5 py-5 lg:px-7 lg:py-6">
            <CardHeading icon={LogIn} title="Welcome back" subtitle="Log in to open your shop." />

            {error && <ErrorBanner>{error}</ErrorBanner>}

            <EmailField icon={Mail} value={email} onChange={setEmail} check={emailCheck} disabled={loading} />

            <Field
              label="Password"
              htmlFor="password"
              required
              aside={
                <Link to={ROUTES.FORGOT_PASSWORD} className={`text-[13px] ${authLink}`}>
                  Forgot password?
                </Link>
              }
            >
              <PasswordInput
                icon={Lock}
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </Field>

            <label className="-mt-1.5 flex min-h-8 cursor-pointer items-center gap-2.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={keepLoggedIn}
                onChange={(e) => setKeepLoggedIn(e.target.checked)}
                className="size-[18px] cursor-pointer accent-blue-600"
              />
              Keep me logged in on this device
            </label>

            <button type="submit" disabled={loading} aria-busy={loading} className={`${authBtn.primary} w-full`}>
              {loading ? (
                <>
                  <LoaderCircle size={18} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                  Logging in…
                </>
              ) : (
                'Log in'
              )}
            </button>
          </div>

          <Link
            to={ROUTES.AGENT_SIGNUP}
            className="group flex items-center gap-3 rounded-b-sm border-t border-line bg-sunken px-5 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 lg:px-7"
          >
            <IconChip icon={Users} tone="pink" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Work with shop owners?</span>
              <span className="block text-[13px] text-slate-600">Earn by referring them to SELLAR.</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-blue-700 group-hover:underline">
              <span className="max-sm:hidden">Partner sign-up</span>
              <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
          </Link>
        </form>

        <p className="text-center text-sm text-slate-600">
          New to SELLAR?{' '}
          <Link to={ROUTES.SIGNUP} className={authLink}>
            Create an account
          </Link>
        </p>
        <LegalNote action="logging in" />
      </div>
    </AuthLayout>
  );
};

export default LoginPage;
