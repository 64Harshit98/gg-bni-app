import React, { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components';
import sellarLogo from '../../assets/sellar-logo-heading.png';
import bgMain from '../../assets/bg-main.png';
import { Variant } from '../../enums';
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
        } catch (err: any) {
            setError(err.message || 'Failed to log in.');
        } finally {
            setLoading(false);
        }
    };
    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            navigate(ROUTES.SIGNUP);
        } catch (error) {
            console.error(error);
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
        <div className="relative h-screen w-screen flex flex-col">
            {/* --- TOP SECTION (IMAGE + LOGO) --- */}
            <div className="relative w-full flex-grow">
                {/* Building Image */}
                <img
                    src={bgMain}
                    alt="Building graphic"
                    className="absolute inset-0 w-full h-full object-cover"
                />
                {/* Sellar Logo (Overlaid) */}
                <div className="absolute top-55 left-1/2 -translate-x-1/2 z-10">
                    <img src={sellarLogo} alt="Sellar Logo" className="w-48" />
                </div>
            </div>
            {/* ---------------------------------- */}

            {/* Login Form Section */}
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
                                className="pl-10 h-14 border border-gray-300 rounded-lg text-lg focus:ring-blue-500 focus:border-blue-500"
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
                                className="pl-10 pr-10 h-14 border border-gray-300 rounded-lg text-lg focus:ring-blue-500 focus:border-blue-500"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <FiEye size={20} /> : <FiEyeOff size={20} />}
                            </button>
                        </div>

                        {/* --- Forgot Password Link --- */}
                        <div className="flex justify-end mt-1">
                            <Link
                                to={ROUTES.FORGOT_PASSWORD || '/forgot-password'}
                                className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                            >
                                Forgot Password?
                            </Link>
                        </div>

                        {error && (
                            <p className="text-red-500 text-sm text-center font-medium">
                                {error}
                            </p>
                        )}

                        <div className="flex flex-col-2 gap-2">
                            <CustomButton
                                variant={Variant.Filled}
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center h-14 text-lg font-semibold rounded-lg"
                            >
                                {loading ? <Spinner /> : 'Log In'}
                            </CustomButton>
                            <CustomButton
                                variant={Variant.Outline}
                                type="submit"
                                onClick={handleSignup}
                                className="w-full flex justify-center h-14 text-lg font-semibold rounded-lg"
                            >
                                Sign Up
                            </CustomButton>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;