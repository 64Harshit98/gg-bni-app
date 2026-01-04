import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components'; 
import sellarLogo from '../../assets/sellar-logo-heading.png';
import bgMain from '../../assets/bg-main.png';
import { Variant } from '../../enums';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Spinner } from '../../constants/Spinner';
import { resetPassword } from '../../lib/AuthOperations'; // Make sure this is exported in AuthOperations
import { useAuth } from '../../context/auth-context';
import { FiMail, FiArrowLeft, FiCheckCircle } from 'react-icons/fi';

const ForgotPasswordPage: React.FC = () => {
    const { currentUser, loading: authLoading } = useAuth();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!email) {
            setError('Please enter your registered email address.');
            return;
        }

        setLoading(true);
        try {
            await resetPassword(email);
            setSuccessMessage(`Password reset link sent to ${email}. Check your inbox.`);
            setEmail(''); // Clear input on success
        } catch (err: any) {
            setError(err.message || 'Failed to send reset email. Please try again.');
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

            {/* Reset Form Section */}
            <div className="w-full bg-gray-100 p-6 py-8 shadow-t-lg rounded-t-2xl flex-shrink-0 z-20 mt-[-50px]">
                <div className="w-full max-w-sm mx-auto">
                    
                    <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Forgot Password?</h2>
                    <p className="text-sm text-gray-500 text-center mb-6">
                        Enter your email and we'll send you a link to reset your password.
                    </p>

                    {successMessage ? (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center space-y-4">
                            <div className="mx-auto bg-green-100 w-12 h-12 rounded-full flex items-center justify-center text-green-600">
                                <FiCheckCircle size={24} />
                            </div>
                            <p className="text-green-800 font-medium text-sm">
                                {successMessage}
                            </p>
                            <Link 
                                to={ROUTES.LANDING}
                                className="block w-full bg-green-600 text-white font-semibold py-3 rounded-lg hover:bg-green-700 transition text-sm"
                            >
                                Back to Login
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleReset} className="space-y-4">
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

                            {error && (
                                <div className="bg-red-50 p-3 rounded border border-red-100">
                                    <p className="text-red-600 text-sm text-center font-medium">
                                        {error}
                                    </p>
                                </div>
                            )}

                            <div className="pt-2">
                                <CustomButton
                                    variant={Variant.Filled}
                                    type="submit"
                                    disabled={loading}
                                    className="w-full flex justify-center h-14 text-lg font-semibold rounded-lg"
                                >
                                    {loading ? <Spinner /> : 'Send Reset Link'}
                                </CustomButton>
                            </div>

                            <div className="text-center pt-2">
                                <Link
                                    to={ROUTES.LANDING}
                                    className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
                                >
                                    <FiArrowLeft className="mr-2" />
                                    Back to Login
                                </Link>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;