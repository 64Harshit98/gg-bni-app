import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components';
import sellarLogo from '../../assets/sellar-logo-heading.png';
import bgMain from '../../assets/bg-main.png';
import { Variant } from '../../enums';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Spinner } from '../../constants/Spinner';
import { confirmPasswordResetUser } from '../../lib/AuthOperations';
import { FiLock, FiEye, FiEyeOff, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

// Helper to parse query parameters
function useQuery() {
  const { search } = useLocation();
  return React.useMemo(() => new URLSearchParams(search), [search]);
}

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const query = useQuery();
  
  // Get the 'oobCode' (Out of band code) from the URL
  const oobCode = query.get('oobCode');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Validate that the code exists on mount
  useEffect(() => {
    if (!oobCode) {
      setError('Invalid or missing reset code. Please request a new password reset link.');
    }
  }, [oobCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!oobCode) {
      setError('Missing reset code.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordResetUser(oobCode, newPassword);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative h-screen w-screen flex flex-col">
      {/* --- TOP SECTION (IMAGE + LOGO) --- */}
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

      {/* --- FORM SECTION --- */}
      <div className="w-full bg-gray-100 p-6 py-8 shadow-t-lg rounded-t-2xl flex-shrink-0 z-20 mt-[-50px]">
        <div className="w-full max-w-sm mx-auto">
          
          <h2 className="text-xl font-bold text-gray-800 text-center mb-6">Reset Password</h2>

          {success ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center space-y-4">
              <div className="mx-auto bg-green-100 w-12 h-12 rounded-full flex items-center justify-center text-green-600">
                <FiCheckCircle size={24} />
              </div>
              <h3 className="text-green-800 font-bold">Password Reset Successful</h3>
              <p className="text-green-700 text-sm">
                You can now log in with your new password.
              </p>
              <CustomButton
                variant={Variant.Filled}
                onClick={() => navigate(ROUTES.LANDING)}
                className="w-full mt-4"
              >
                Go to Login
              </CustomButton>
            </div>
          ) : !oobCode ? (
             <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                <div className="mx-auto bg-red-100 w-12 h-12 rounded-full flex items-center justify-center text-red-600 mb-2">
                    <FiAlertCircle size={24} />
                </div>
                <p className="text-red-700 font-medium">Invalid Reset Link</p>
                <p className="text-gray-500 text-sm mt-2">The link is missing the required code.</p>
                <Link to={ROUTES.FORGOT_PASSWORD} className="text-blue-600 hover:underline text-sm mt-4 block">
                    Request a new link
                </Link>
             </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* New Password */}
              <div className="relative">
                <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <FloatingLabelInput
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  label="New Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="pl-10 pr-10 h-14 border border-gray-300 rounded-lg text-lg focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <FiEye size={20} /> : <FiEyeOff size={20} />}
                </button>
              </div>

              {/* Confirm Password */}
              <div className="relative">
                <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <FloatingLabelInput
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="pl-10 pr-10 h-14 border border-gray-300 rounded-lg text-lg focus:ring-blue-500 focus:border-blue-500"
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
                  {loading ? <Spinner /> : 'Set New Password'}
                </CustomButton>
              </div>

              <div className="text-center pt-2">
                <Link
                  to={ROUTES.LANDING}
                  className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
                >
                  Cancel
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;