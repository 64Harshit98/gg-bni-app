import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, LoaderCircle, Mail, MailCheck } from 'lucide-react';
import { ROUTES } from '../../constants/routes.constants';
import { Spinner } from '../../constants/Spinner';
import { resetPassword } from '../../lib/AuthOperations';
import { useEmailCheck } from '../../lib/useEmailCheck';
import { useAuth } from '../../context/auth-context';
import {
  AccountSafeNote,
  AccountSafePanel,
  AuthLayout,
  CardHeading,
  EmailField,
  ErrorBanner,
  SupportLink,
  authBtn,
} from './AuthUI';

const ForgotPasswordPage: React.FC = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const emailCheck = useEmailCheck(email);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError('Enter the email you log in with.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(address);
      setSentTo(address);
      setEmail('');
    } catch (err) {
      const { code, message } = (err ?? {}) as { code?: string; message?: string };
      setError(
        code === 'auth/network-request-failed'
          ? "Can't reach SELLAR. Check your internet and try again."
          : message || "Couldn't send the email. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (currentUser) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return (
    <AuthLayout panelLabel="Keeping your account safe" panel={<AccountSafePanel />} headerAside={<SupportLink />}>
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-3 lg:justify-center">
        <Link
          to={ROUTES.LANDING}
          className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-sm text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          Back to log in
        </Link>

        <div className="rounded-sm border border-line bg-white shadow-card">
          {sentTo ? (
            <div role="status" className="flex flex-col gap-5 px-5 py-5 lg:px-7 lg:py-6">
              <CardHeading icon={MailCheck} tone="green" title="Check your email" subtitle="The link is on its way." />
              <p className="text-sm leading-[21px] text-slate-600">
                We sent a reset link to <span className="font-medium text-slate-900">{sentTo}</span>. It can take a minute. Look in spam if it
                isn't there.
              </p>
              <div className="flex flex-wrap gap-2.5">
                <Link to={ROUTES.LANDING} className={`${authBtn.primary} flex-1`}>
                  Back to log in
                </Link>
                <button type="button" onClick={() => setSentTo(null)} className={`${authBtn.ghost} h-12 hover:bg-sunken`}>
                  Use another email
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleReset} noValidate className="flex flex-col gap-5 px-5 py-5 lg:px-7 lg:py-6">
              <CardHeading icon={KeyRound} title="Reset your password" subtitle="We'll email you a link to set a new one." />
              {error && <ErrorBanner>{error}</ErrorBanner>}
              <EmailField
                icon={Mail}
                value={email}
                onChange={setEmail}
                check={emailCheck}
                help="Use the email you log in with."
                disabled={loading}
              />
              <button type="submit" disabled={loading} aria-busy={loading} className={`${authBtn.primary} w-full`}>
                {loading && <LoaderCircle size={18} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}
          <AccountSafeNote />
        </div>
      </div>
    </AuthLayout>
  );
};

export default ForgotPasswordPage;
