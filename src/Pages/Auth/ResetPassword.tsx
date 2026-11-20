import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { CircleAlert, CircleCheck, KeyRound, LoaderCircle } from 'lucide-react';
import { ROUTES } from '../../constants/routes.constants';
import { confirmPasswordResetUser } from '../../lib/AuthOperations';
import {
  AccountSafeNote,
  AccountSafePanel,
  AuthLayout,
  CardHeading,
  ErrorBanner,
  Field,
  PasswordInput,
  SupportLink,
  authBtn,
} from './AuthUI';

function useQuery() {
  const { search } = useLocation();
  return React.useMemo(() => new URLSearchParams(search), [search]);
}

const ResetPasswordPage: React.FC = () => {
  const query = useQuery();
  const oobCode = query.get('oobCode');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!oobCode) return;
    if (newPassword.length < 6) {
      setError('Use at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordResetUser(oobCode, newPassword);
      setSuccess(true);
    } catch (err) {
      setError((err as Error)?.message || "Couldn't change your password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const body = success ? (
    <div role="status" className="flex flex-col gap-5 px-5 py-5 lg:px-7 lg:py-6">
      <CardHeading icon={CircleCheck} tone="green" title="Password changed" subtitle="Log in with your new password." />
      <Link to={ROUTES.LANDING} className={`${authBtn.primary} w-full`}>
        Go to log in
      </Link>
    </div>
  ) : !oobCode ? (
    <div className="flex flex-col gap-5 px-5 py-5 lg:px-7 lg:py-6">
      <div className="flex items-center gap-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-red-50 text-red-700" aria-hidden="true">
          <CircleAlert size={20} strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-xl font-semibold leading-7 tracking-[-0.02em]">This link doesn't work</h1>
          <p className="text-[13px] leading-[19px] text-slate-600">It may be incomplete or already used. Ask for a new one.</p>
        </div>
      </div>
      <Link to={ROUTES.FORGOT_PASSWORD} className={`${authBtn.primary} w-full`}>
        Send me a new link
      </Link>
    </div>
  ) : (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 px-5 py-5 lg:px-7 lg:py-6">
      <CardHeading icon={KeyRound} title="Set a new password" subtitle="At least 6 characters." />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Field label="New password" htmlFor="new-password" required>
        <PasswordInput
          autoComplete="new-password"
          placeholder="Choose a password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={loading}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm-password" required>
        <PasswordInput
          autoComplete="new-password"
          placeholder="Type it again"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading}
        />
      </Field>
      <button type="submit" disabled={loading} aria-busy={loading} className={`${authBtn.primary} w-full`}>
        {loading && <LoaderCircle size={18} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
        {loading ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  );

  return (
    <AuthLayout panelLabel="Keeping your account safe" panel={<AccountSafePanel />} headerAside={<SupportLink />}>
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-3 lg:justify-center">
        <div className="rounded-sm border border-line bg-white shadow-card">
          {body}
          <AccountSafeNote />
        </div>
        {!success && (
          <Link to={ROUTES.LANDING} className="self-center rounded-sm py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            Cancel
          </Link>
        )}
      </div>
    </AuthLayout>
  );
};

export default ResetPasswordPage;
