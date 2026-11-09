import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { MotionConfig, motion, useReducedMotion } from 'framer-motion';
import { Check, CircleHelp, LoaderCircle } from 'lucide-react';
import sellarLogo from '../../assets/sellar-logo-heading.png';
import { ROUTES } from '../../constants/routes.constants';
import { PLANS } from '../../enums';
import { Spinner } from '../../constants/Spinner';
import { LegalModal } from '../../Components/LegalModal';
import { loginUser } from '../../lib/AuthOperations';
import { useEmailCheck } from '../../lib/useEmailCheck';
import { useAuth } from '../../context/auth-context';
import {
  EmailField,
  ErrorBanner,
  Field,
  NAVY,
  PANEL_MUTED,
  PasswordInput,
  SUPPORT_WHATSAPP,
  authBtn,
  authLink,
} from './AuthUI';

const LOGIN_ERRORS: Record<string, string> = {
  'auth/invalid-credential': "That email and password don't match. Check them and try again, or reset your password.",
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': "That password doesn't match. Try again, or reset your password.",
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/user-disabled': 'This account has been turned off. Please contact support.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
  'auth/network-request-failed': "Can't reach SELLAR. Check your internet and try again.",
};

// ─── Live bill hero ─────────────────────────────────────────────────────────

type BillEnd = 'paid' | 'udhaar';

const SHOPS: { name: string; end: BillEnd; items: [string, number][] }[] = [
  { name: 'Kirana store', end: 'paid', items: [['Atta 5 kg', 260], ['Sunflower oil', 185], ['Tea 250 g', 120]] },
  { name: 'Medical store', end: 'paid', items: [['Paracetamol', 32], ['Cough syrup', 96], ['Bandage', 48]] },
  { name: 'Mobile shop', end: 'udhaar', items: [['Screen guard', 199], ['Type-C cable', 349], ['Phone case', 299]] },
  { name: 'Garment shop', end: 'paid', items: [['Cotton shirt', 799], ['Denim jeans', 1299], ['Leather belt', 349]] },
  { name: 'Hardware store', end: 'udhaar', items: [['Wall paint 1 L', 420], ['Hammer', 180], ['Wall plugs', 90]] },
  { name: 'Sweet shop', end: 'paid', items: [['Kaju katli 500 g', 480], ['Laddoo 1 kg', 360], ['Samosa x4', 80]] },
];

const BEAT_MS = 260;
const LAST_STEP = 6;
const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * One bill per shop type: step 0 empty, 1-3 add a line, 4-5 settled, 6 cleared, then the next shop.
 * Starts on a finished bill, which is also what stays on screen when the device asks for less motion.
 */
const useLiveBill = () => {
  const reduce = useReducedMotion();
  const [bill, setBill] = useState({ shop: 0, prev: SHOPS.length - 1, step: 5, cycle: 0 });
  useEffect(() => {
    if (reduce) return;
    const timer = window.setInterval(() => {
      setBill((b) =>
        b.step >= LAST_STEP
          ? { step: 0, prev: b.shop, shop: (b.shop + 1) % SHOPS.length, cycle: b.cycle + 1 }
          : { ...b, step: b.step + 1 },
      );
    }, BEAT_MS);
    return () => window.clearInterval(timer);
  }, [reduce]);
  return bill;
};

const PILLS: Record<BillEnd | 'pending', string> = {
  pending: 'bg-amber-100 text-amber-800',
  paid: 'bg-[#e5f6eb] text-[#0b7a3b]',
  udhaar: 'bg-[#e6eeff] text-[#1447e6]',
};
const PILL_LABELS: Record<BillEnd | 'pending', string> = { pending: 'Pending', paid: 'Paid', udhaar: 'Udhaar' };

/** Runs its own timer here so the form below doesn't re-render on every beat. */
const LiveBillHero: React.FC = () => {
  const { shop: shopIndex, prev, step, cycle } = useLiveBill();
  const shop = SHOPS[shopIndex];
  const total = shop.items.slice(0, Math.min(step, 3)).reduce((sum, [, amount]) => sum + amount, 0);
  const status = step >= 4 ? shop.end : 'pending';
  const billVisible = step >= 1 && step <= 5;

  return (
    <section
      aria-label="About SELLAR"
      className={`relative flex flex-col overflow-hidden px-4 pb-11 pt-6 text-white short:pb-8 short:pt-3 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:pb-10 lg:pl-12 lg:pr-[68px] lg:pt-12 xl:pb-12 xl:pl-[72px] xl:pr-[92px] xl:pt-14 ${NAVY}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.06)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.06)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:linear-gradient(180deg,black,transparent_90%)] lg:[background-size:36px_36px]"
      />
      <p className="sr-only">SELLAR: billing, stock and udhaar for your shop.</p>

      <div aria-hidden="true" className="relative mx-auto flex w-full max-w-[400px] flex-1 flex-col lg:max-w-[480px]">
        <div className="flex flex-1 flex-col justify-center">
          <p className={`text-sm leading-5 short:text-[13px] short:leading-[18px] lg:text-lg lg:leading-[26px] ${PANEL_MUTED}`}>One app for your</p>
          <div className="relative mt-0.5 h-[46px] overflow-hidden short:mt-0 short:h-9 lg:mt-1 lg:h-[58px] xl:h-[66px]">
            {SHOPS.map(({ name }, i) => (
              <span
                key={name}
                className={`absolute inset-x-0 top-0 whitespace-nowrap text-[34px] font-semibold leading-[46px] tracking-[-0.02em] transition-[translate,opacity] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none short:text-[26px] short:leading-9 lg:text-[44px] lg:leading-[58px] lg:tracking-[-0.025em] xl:text-[52px] xl:leading-[66px] ${
                  i === shopIndex ? 'translate-y-0 opacity-100' : i === prev ? '-translate-y-full opacity-0' : 'translate-y-full opacity-0'
                }`}
              >
                {name}
              </span>
            ))}
          </div>

          <div className="relative mt-4 short:mt-2.5 lg:mt-7">
            <span className="absolute -bottom-4 left-5 right-5 top-2 rounded-[10px] bg-white/10 lg:-bottom-5 lg:left-7 lg:right-7 lg:rounded-[14px]" />
            <span className="absolute -bottom-2 left-2.5 right-2.5 top-2 rounded-[10px] bg-white/20 lg:-bottom-2.5 lg:left-3.5 lg:right-3.5 lg:rounded-[14px]" />
            <div className="relative rounded-[10px] bg-white px-4 py-3.5 text-slate-900 shadow-[0_18px_40px_rgba(2,8,30,0.45),0_2px_6px_rgba(2,8,30,0.3)] short:py-2 lg:rounded-[14px] lg:px-[26px] lg:py-[22px]">
              <div className="flex h-6 items-center justify-between">
                <span className="text-xs font-medium leading-[18px] tracking-[0.02em] text-[#5b6b84] lg:text-[13px]">Bill #{1040 + cycle}</span>
                <motion.span
                  key={status}
                  animate={status === 'pending' ? { scale: 1 } : { scale: [0.85, 1.12, 1] }}
                  transition={{ duration: 0.4, ease: 'easeOut', times: status === 'pending' ? undefined : [0, 0.6, 1] }}
                  className={`inline-flex h-6 items-center gap-[5px] rounded-full px-2.5 text-xs font-medium leading-none ${PILLS[status]}`}
                >
                  {status === 'paid' && <Check size={12} strokeWidth={3} />}
                  {PILL_LABELS[status]}
                </motion.span>
              </div>
              <div className="mb-1 mt-2.5 h-px bg-[#e6ebf7] short:mb-0.5 short:mt-1.5 tiny:hidden lg:mb-2 lg:mt-3.5" />
              {shop.items.map(([item, amount], i) => (
                <div
                  key={item}
                  className={`flex h-7 items-center justify-between text-sm transition-[translate,opacity] duration-[220ms] motion-reduce:transition-none short:h-[22px] short:text-[13px] tiny:hidden lg:h-[38px] lg:text-base ${
                    step >= i + 1 && step <= 5 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                  }`}
                >
                  <span>{item}</span>
                  <span className="font-medium">{money(amount)}</span>
                </div>
              ))}
              <div
                className={`mt-1.5 flex items-center justify-between border-t border-[#e6ebf7] pt-2 transition-opacity duration-200 motion-reduce:transition-none short:mt-1 short:pt-1 lg:mt-2.5 lg:pt-3 ${
                  billVisible ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <span className="text-[13px] leading-7 text-[#5b6b84] short:leading-6 lg:text-sm lg:leading-[34px]">Total</span>
                <motion.span
                  key={total}
                  animate={step >= 1 && step <= 3 ? { scale: [1, 1.14, 1] } : { scale: 1 }}
                  transition={{ duration: 0.3, ease: 'easeOut', times: step >= 1 && step <= 3 ? [0, 0.4, 1] : undefined }}
                  className="inline-block origin-right text-xl font-semibold leading-7 tracking-[-0.01em] short:text-lg short:leading-6 lg:text-[28px] lg:leading-[34px]"
                >
                  {money(total)}
                </motion.span>
              </div>
            </div>
          </div>
        </div>

        <p className={`mt-10 text-[15px] leading-[23px] max-lg:hidden ${PANEL_MUTED}`}>
          Billing, stock and udhaar on your phone at the counter and on your computer at home.
        </p>
      </div>
    </section>
  );
};

// ─── Page bits ──────────────────────────────────────────────────────────────

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
const FOOT_LINK = `inline-flex min-h-11 items-center px-1.5 text-[13px] text-slate-600 hover:text-slate-900 short:min-h-10 tiny:min-h-9 ${FOCUS}`;

const LoginFooter: React.FC = () => {
  const [tab, setTab] = useState<'terms' | 'privacy' | null>(null);
  return (
    <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pb-2 short:pb-0">
      <Link to={ROUTES.AGENT_SIGNUP} className={`inline-flex min-h-11 items-center text-[13px] short:min-h-10 tiny:min-h-9 ${authLink}`}>
        Become a partner
      </Link>
      <span className="-mr-1.5 flex items-center text-slate-500">
        <button type="button" onClick={() => setTab('terms')} className={FOOT_LINK}>
          Terms
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" onClick={() => setTab('privacy')} className={FOOT_LINK}>
          Privacy
        </button>
      </span>
      <LegalModal isOpen={tab !== null} defaultTab={tab ?? 'terms'} onClose={() => setTab(null)} />
    </div>
  );
};

const LoginPage: React.FC = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    // reducedMotion="user": the pill and total animations stop when the device asks for less motion.
    <MotionConfig reducedMotion="user">
      {/*
        Phone: header, hero, then the sheet overlapping the hero from below. The hero takes any spare height,
        and the short: / tiny: sizes keep the whole page on one screen down to about 550px tall.
        Desktop: the hero is on the left and the sheet overlaps it from the right.
      */}
      <div className={`grid min-h-[100dvh] grid-rows-[auto_1fr_auto] text-slate-900 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] ${NAVY}`}>
        {/* The white sheet on desktop, behind the header and form, which sit in separate grid rows. */}
        <div aria-hidden="true" className="relative z-[1] col-start-2 row-span-2 row-start-1 -ml-5 rounded-l-2xl bg-white max-lg:hidden" />

        <header className="relative bg-white px-4 lg:z-[2] lg:col-start-2 lg:row-start-1 lg:bg-transparent lg:px-10 lg:pt-5">
          <div className="mx-auto flex h-14 w-full max-w-[400px] items-center justify-between gap-4 short:h-11">
            <img src={sellarLogo} alt="SELLAR" className="h-5 w-auto" />
            <p className="text-sm text-slate-600">
              <span className="max-lg:hidden">Need help? </span>
              <a
                href={SUPPORT_WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Contact support"
                className={`max-lg:-mr-2.5 max-lg:grid max-lg:size-11 max-lg:place-items-center max-lg:rounded-sm max-lg:text-slate-600 lg:font-medium lg:text-blue-700 lg:hover:underline ${FOCUS}`}
              >
                <CircleHelp size={22} strokeWidth={1.75} aria-hidden="true" className="lg:hidden" />
                <span className="max-lg:hidden">Contact support</span>
              </a>
            </p>
          </div>
        </header>

        <LiveBillHero />

        <main className="relative z-[1] -mt-5 flex flex-col rounded-t-2xl bg-white px-5 pt-7 short:pt-4 lg:z-[2] lg:col-start-2 lg:row-start-2 lg:mt-0 lg:rounded-none lg:bg-transparent lg:px-10 lg:pb-4 lg:pt-0">
          <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col">
            <div className="lg:my-auto lg:py-8">
              <form onSubmit={handleLogin} noValidate className="flex flex-col gap-4 short:gap-3 tiny:gap-2.5">
                <h1 className="mb-1 text-[26px] font-semibold leading-[34px] tracking-[-0.02em] short:mb-0 short:text-[22px] short:leading-[30px] lg:mb-2 lg:text-[30px] lg:leading-[38px]">Log in</h1>

                {error && <ErrorBanner>{error}</ErrorBanner>}

                <EmailField
                  tall
                  label="Email"
                  required={false}
                  value={email}
                  onChange={setEmail}
                  check={emailCheck}
                  disabled={loading}
                  className="gap-1.5!"
                />

                <Field
                  label="Password"
                  htmlFor="password"
                  className="gap-1.5!"
                  aside={
                    <Link to={ROUTES.FORGOT_PASSWORD} className={`inline-flex min-h-8 items-center text-[13px] short:min-h-6 ${authLink}`}>
                      Forgot password?
                    </Link>
                  }
                >
                  <PasswordInput
                    tall
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                </Field>

                {/* Desktop only: a shop computer can be shared. Phones stay logged in. */}
                <label className="-mt-1 flex min-h-8 cursor-pointer items-center gap-2.5 text-sm text-slate-600 max-lg:hidden">
                  <input
                    type="checkbox"
                    checked={keepLoggedIn}
                    onChange={(e) => setKeepLoggedIn(e.target.checked)}
                    className="size-[18px] cursor-pointer accent-blue-600"
                  />
                  Keep me logged in on this computer
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className={`${authBtn.primary} mt-1.5 h-[52px]! w-full text-base! short:mt-0 short:h-[46px]! tiny:h-11! lg:mt-0 lg:h-[50px]! lg:text-[15px]!`}
                >
                  {loading ? (
                    <>
                      <LoaderCircle size={18} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                      Logging in…
                    </>
                  ) : (
                    'Log in'
                  )}
                </button>
              </form>

              <p className="mb-2 mt-5 flex min-h-11 items-center justify-center gap-1.5 text-sm text-slate-600 short:mb-0 short:mt-1 short:min-h-10 tiny:mt-0 tiny:min-h-9 lg:mb-0 lg:mt-4">
                New to SELLAR?
                <Link to={ROUTES.SIGNUP} className={`inline-flex min-h-11 items-center short:min-h-10 tiny:min-h-9 ${authLink}`}>
                  Create an account
                </Link>
              </p>
            </div>

            <LoginFooter />
          </div>
        </main>
      </div>
    </MotionConfig>
  );
};

export default LoginPage;
