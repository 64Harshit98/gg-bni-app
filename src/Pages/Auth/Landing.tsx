import React, { useState } from 'react'; // Added useEffect
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components';
import sellarLogo from '../../assets/sellar-logo-heading.png';
import bgMain from '../../assets/bg-main.png';
import { Variant, PLANS } from '../../enums'; // Added PLANS enum
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Spinner } from '../../constants/Spinner';
import { loginUser } from '../../lib/AuthOperations';
import { useAuth } from '../../context/auth-context';
import { FiMail, FiLock, FiEye, FiEyeOff } from 'react-icons/fi';

const LoginPage: React.FC = () => {
    const { currentUser, loading: authLoading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();

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

            // 🚨 CRITICAL: DO NOT PUT ANY navigate('/') OR navigate(ROUTES.HOME) HERE! 🚨
            // The Firebase login will trigger the AuthProvider, 
            // which will update the currentUser, 
            // which will trigger "The Smart Door" above automatically!

        } catch (err: any) {
            setError(err.message || 'Failed to log in.');
            setLoading(false); // Only turn off the spinner if it FAILS.
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
            currentUser.plan === PLANS.CATALOGUE_BASIC ||
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

          <div className="w-full bg-gray-100 p-6 py-8 shadow-t-lg rounded-t-2xl flex-shrink-0 z-20 mt-[-50px]">
            <div className="w-full max-w-sm mx-auto mb-auto">
              <form onSubmit={handleLogin} className="space-y-4">

                <div className="relative">
                  <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <FloatingLabelInput
                    id="email"
                    type="email"
                    label="Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-10 h-14 border border-gray-300 rounded-lg text-lg"
                  />
                </div>

                <div className="relative">
                  <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <FloatingLabelInput
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    label="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-10 pr-10 h-14 border border-gray-300 rounded-lg text-lg"
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

              </form>
            </div>
          </div>
        </div>

        {/* ================= DESKTOP VIEW ================= */}
        <div className="hidden lg:flex flex-col lg:flex-row h-screen overflow-hidden bg-gray-100">

          <div className="w-full lg:w-1/2 relative h-[40vh] lg:h-auto">
            <img src={bgMain} alt="Login visual" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center">
              <img src={sellarLogo} alt="Sellar Logo" className="w-48" />
            </div>
          </div>

          <div className="flex flex-col h-screen overflow-hidden w-full lg:w-1/2 bg-gray-100 -mt-16 lg:mt-0">
            <div className="flex-grow px-0 overflow-hidden flex flex-col justify-center">
              <div className="w-full max-w-md mx-auto px-6">

                <h1 className="text-4xl font-bold mb-6 text-center">Login</h1>

                <div className="bg-gray-100 px-6 py-4 rounded-sm shadow-sm border border-gray-200 min-h-[340px] flex flex-col justify-center">
                  <form onSubmit={handleLogin} className="space-y-5">
                    {/* KEEP EXISTING FORM CONTENT SAME */}
                    <div className="relative [&_label]:!left-[3rem]">
                      <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
                      <FloatingLabelInput
                        id="email"
                        type="email"
                        label="Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                        className="pl-12 py-3 bg-gray-100 border border-[#7D7777A3] shadow-[0_4px_4px_rgba(0,0,0,0.15)]"
                        style={{ '--label-left': '3rem' } as React.CSSProperties}
                      />
                    </div>

                    <div className="relative [&_label]:!left-[3rem]">
                      <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={16} />
                      <FloatingLabelInput
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        label="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                        className="pl-12 py-3 pr-10 bg-gray-100 border border-[#7D7777A3] shadow-[0_4px_4px_rgba(0,0,0,0.15)]"
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
                  </form>
                </div>

              </div>
            </div>
          </div>

        </div>
      </>
    );
};

export default LoginPage;