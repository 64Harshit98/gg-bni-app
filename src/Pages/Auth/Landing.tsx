import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components';
import sellarLogo from '../../assets/sellar-logo-heading.png';
import bgMain from '../../assets/bg-main.png';
import { Variant, PLANS } from '../../enums';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Spinner } from '../../constants/Spinner';
import { loginUser } from '../../lib/AuthOperations';
import { useAuth } from '../../context/auth-context';
import { FiMail, FiLock, FiEye, FiEyeOff } from 'react-icons/fi';
import { LegalModal } from '../../Components/LegalModal';

const LoginPage: React.FC = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [legalTab, setLegalTab] = useState<'terms' | 'privacy' | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);

    try {
      await loginUser(email, password);
    } catch (err: any) {

      // 🚨 CRITICAL: DO NOT PUT ANY navigate('/') OR navigate(ROUTES.HOME) HERE! 🚨
      // The Firebase login will trigger the AuthProvider, 
      // which will update the currentUser, 
      // which will trigger "The Smart Door" above automatically!

      const errorCode = err?.code || '';

      const firebaseErrorMessages: Record<string, string> = {
        'auth/invalid-credential': 'Incorrect email or password. Please try again.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password. Please try again.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/user-disabled': 'This account has been disabled. Please contact support.',
        'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Please check your connection.',
      };

      setError(firebaseErrorMessages[errorCode] || 'Incorrect email or password. Please try again.');
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

  // 2. THE SMART DOOR: As soon as we have a user, route them immediately
  if (currentUser) {
    const isCatalogueOnly =
      currentUser.plan === PLANS.CATALOGUE_PRO;

    if (isCatalogueOnly) {
      return <Navigate to={ROUTES.CHOME} replace />;
    } else {
      return <Navigate to={ROUTES.HOME} replace />;
    }
  }


  return (
    <>
      {/* ================= MOBILE VIEW ================= */}
      <div className="relative h-screen w-screen flex flex-col lg:hidden">
        <div className="relative w-full flex-grow">
          <img
            src={bgMain}
            alt="Building graphic"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute top-55 left-1/2 -translate-x-1/2 z-10">
            <img src={sellarLogo} alt="Sellar Logo" className="w-48" />
          </div>
        </div>

        <div className="w-full bg-white p-6 py-8 shadow-t-lg rounded-sm flex-shrink-0 z-20 mt-[-50px]">
          <div className="w-full max-w-sm mx-auto mb-auto">
            <form onSubmit={handleLogin} className="space-y-4">

              <div className="relative [&_label]:bg-white">
                <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <FloatingLabelInput
                  id="email"
                  type="email"
                  label="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="pl-10 h-14 border border-gray-300 rounded-sm text-lg bg-white"
                />
              </div>

              <div className="relative [&_label]:bg-white">
                <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <FloatingLabelInput
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="pl-10 pr-10 h-14 border border-gray-300 rounded-sm text-lg bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <FiEye size={20} /> : <FiEyeOff size={20} />}
                </button>
              </div>

              <div className="flex justify-end mt-1">
                <Link
                  to={ROUTES.FORGOT_PASSWORD || '/forgot-password'}
                  className="text-sm font-medium text-blue-600"
                >
                  Forgot Password?
                </Link>
              </div>

              {error && (
                <p className="text-red-500 text-sm text-center font-medium">
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <CustomButton
                  variant={Variant.Filled}
                  type="submit"
                  disabled={loading}
                  className="flex-1 h-14 text-lg font-semibold"
                >
                  {loading ? <Spinner /> : 'Log In'}
                </CustomButton>

                <Link to={ROUTES.SIGNUP} className="flex-1">
                  <CustomButton
                    variant={Variant.Outline}
                    type="button"
                    className="w-full h-14 text-lg font-semibold"
                  >
                    Sign Up
                  </CustomButton>
                </Link>
              </div>

              {/* --- NEW: Referral Signup Link (Mobile) --- */}
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-600">
                  Want to become a Partner ?{''}
                  <Link
                    to={ROUTES.AGENT_SIGNUP || '/agent-signup'}
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    Signup Now
                  </Link>
                </p>
              </div>

              <p className="mt-3 text-center text-xs text-gray-500">
                By continuing, you agree to our{' '}
                <button type="button" onClick={() => setLegalTab('terms')} className="font-semibold text-blue-600 hover:underline">
                  Terms & Conditions
                </button>{' '}
                and{' '}
                <button type="button" onClick={() => setLegalTab('privacy')} className="font-semibold text-blue-600 hover:underline">
                  Privacy Policy
                </button>
              </p>

            </form>
          </div>
        </div>
      </div>

      {/* ================= DESKTOP VIEW ================= */}
      <div className="hidden lg:flex h-screen w-screen items-center justify-center bg-white\">
        <div className="flex w-full  h-full rounded-sm overflow-hidden shadow-lg bg-white">

          <div className="w-1/2 relative">
            <img src={bgMain} alt="Login visual" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center">
              <img src={sellarLogo} alt="Sellar Logo" className="w-48" />
            </div>
          </div>

          <div className="w-1/2 flex items-center justify-center bg-white">
            <div className="flex-grow px-0 overflow-hidden flex flex-col justify-center">
              <div className="w-full max-w-md mx-auto px-4">

                <h1 className="text-4xl font-bold mb-6 text-left">Login</h1>

                <div className="px-2 py-2 bg-white flex flex-col justify-center">
                  <form onSubmit={handleLogin} className="space-y-6">
                    {/* KEEP EXISTING FORM CONTENT SAME */}
                    <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
                      <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
                      <FloatingLabelInput
                        id="email"
                        type="email"
                        label="Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                        className="pl-12 py-3 bg-white border border-[#7D7777A3] shadow-[0_4px_4px_rgba(0,0,0,0.15)]"
                        style={{ '--label-left': '3rem' } as React.CSSProperties}
                      />
                    </div>

                    <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
                      <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={16} />
                      <FloatingLabelInput
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        label="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                        className="pl-12 py-3 pr-10 bg-white border border-[#7D7777A3] shadow-[0_4px_4px_rgba(0,0,0,0.15)]"
                        style={{ '--label-left': '3rem' } as React.CSSProperties}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <FiEye size={20} /> : <FiEyeOff size={20} />}
                      </button>
                    </div>

                    <div className="flex justify-end">
                      <Link
                        to={ROUTES.FORGOT_PASSWORD || '/forgot-password'}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        Forgot Password?
                      </Link>
                    </div>

                    {error && (
                      <p className="text-red-500 text-sm text-center">
                        {error}
                      </p>
                    )}

                    <div className="flex gap-3 mt-2">
                      <CustomButton
                        variant={Variant.Filled}
                        type="submit"
                        disabled={loading}
                        className="flex-1 h-12 text-lg font-semibold bg-black text-white"
                      >
                        {loading ? <Spinner /> : 'Log In'}
                      </CustomButton>

                      <Link to={ROUTES.SIGNUP} className="flex-1">
                        <CustomButton
                          variant={Variant.Outline}
                          type="button"
                          className="w-full h-12 text-lg font-semibold bg-white text-black border border-gray-300"
                        >
                          Sign Up
                        </CustomButton>
                      </Link>
                    </div>

                    {/* --- NEW: Referral Signup Link (Desktop) --- */}
                    <div className="mt-4 text-center">
                      <p className="text-sm text-gray-600">
                        Want to become an Partner ?{''}
                        <Link
                          to={ROUTES.AGENT_SIGNUP || '/agent-signup'}
                          className="font-semibold text-blue-600 hover:underline"
                        >
                          Signup Now
                        </Link>
                      </p>
                    </div>

                    <p className="mt-2 text-center text-xs text-gray-500">
                      By continuing, you agree to our{' '}
                      <button type="button" onClick={() => setLegalTab('terms')} className="font-semibold text-blue-600 hover:underline">
                        Terms & Conditions
                      </button>{' '}
                      and{' '}
                      <button type="button" onClick={() => setLegalTab('privacy')} className="font-semibold text-blue-600 hover:underline">
                        Privacy Policy
                      </button>
                    </p>

                  </form>
                </div>

              </div>
            </div>
          </div>

        </div>
      </div>

      <LegalModal
        isOpen={legalTab !== null}
        defaultTab={legalTab ?? 'terms'}
        onClose={() => setLegalTab(null)}
      />
    </>
  );
};

export default LoginPage;