// src/Pages/SignUpPage.tsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components/CustomButton';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Stepper } from '../../Components/Stepper'; // Import the new stepper
import { Variant } from '../../enums';
import { FiMail, FiLock, FiEye, FiEyeOff, FiPhone, FiUser } from 'react-icons/fi'; // 1. Import FiUser

const SignUpPage: React.FC = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(''); // 2. Add full name state
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 4. Add fullName to validation
    if (
      !fullName.trim() ||
      !email.trim() ||
      !phoneNumber.trim() ||
      !password.trim() ||
      !confirmPassword.trim()
    ) {
      setError('Please fill out all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    // 4. Pass fullName to the next step
    navigate(ROUTES.BUSINESS_INFO, {
      state: { fullName, email, phoneNumber, password },
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 p-4">
      <div className="mb-8">
        {/* Step 1 of 4 */}
        <Stepper totalSteps={4} currentStep={1} />
      </div>

      <h1 className="text-4xl font-bold mb-6">Create Account</h1>

      <form onSubmit={handleNext} className="flex flex-col space-y-6 flex-grow">
        {/* --- 3. ADDED FULL NAME FIELD --- */}
        <div className="relative">
          <FiUser
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={20}
          />
          <FloatingLabelInput
            id="fullName"
            type="text"
            label="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="pl-10"
          />
        </div>
        {/* --------------------------------- */}
        <div className="relative">
          <FiPhone
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={20}
          />
          <FloatingLabelInput
            id="phoneNumber"
            type="tel"
            label="Phone Number"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            required
            className="pl-10"
          />
        </div>

        <div className="relative">
          <FiMail
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={20}
          />
          <FloatingLabelInput
            id="email"
            type="email"
            label="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="pl-10"
          />
        </div>


        <div className="relative">
          <FiLock
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={20}
          />
          <FloatingLabelInput
            id="password"
            type={showPassword ? 'text' : 'password'}
            label="Create a Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="pl-10 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <FiEye size={20} /> : <FiEyeOff size={20} />}
          </button>
        </div>

        <div className="relative">
          <FiLock
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={20}
          />
          <FloatingLabelInput
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            label="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="pl-10 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showConfirmPassword ? <FiEye size={20} /> : <FiEyeOff size={20} />}
          </button>
        </div>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        <div className="mt-4 space-y-4">
          <CustomButton type="submit" variant={Variant.Filled}>
            Next
          </CustomButton>

          <p className="text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link
              to={ROUTES.LANDING} // Make sure this route is correct
              className="font-medium text-blue-600 hover:underline"
            >
              Log In
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
};

export default SignUpPage;