// src/Pages/SignUpPage.tsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components/CustomButton';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Stepper } from '../../Components/Stepper';
import { Variant } from '../../enums';
import { FiMail, FiLock, FiEye, FiEyeOff, FiPhone, FiUser } from 'react-icons/fi';

// Shared key to persist data across all onboarding steps
const LOCAL_STORAGE_KEY = 'sellar_onboarding_data';

const SignUpPage: React.FC = () => {
  const navigate = useNavigate();

  // --- State ---
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- 1. Load Data on Mount ---
  useEffect(() => {
    const savedDataString = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedDataString) {
      const savedData = JSON.parse(savedDataString);
      if (savedData.fullName) setFullName(savedData.fullName);
      if (savedData.email) setEmail(savedData.email);
      if (savedData.phoneNumber) setPhoneNumber(savedData.phoneNumber);
      if (savedData.password) setPassword(savedData.password);
      if (savedData.password) setConfirmPassword(savedData.password); 
    }
  }, []);

  // --- 2. Save Data on Change ---
  useEffect(() => {
    const saveData = () => {
      const currentSaved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
      const updatedData = {
        ...currentSaved,
        fullName,
        email,
        phoneNumber,
        password
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedData));
    };
    saveData();
  }, [fullName, email, phoneNumber, password]);

  // --- Validation Helper ---
  const validateForm = (): boolean => {
    // Standard Email Regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !fullName.trim() ||
      !email.trim() ||
      !phoneNumber.trim() ||
      !password.trim() ||
      !confirmPassword.trim()
    ) {
      setError('Please fill out all fields.');
      return false;
    }

    // Email Format Check
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return false;
    }

    // Phone Number Length Check
    if (phoneNumber.length !== 10) {
      setError('Phone number must be exactly 10 digits long.');
      return false;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return false;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return false;
    }
    return true;
  };

  // --- Navigation ---
  const handleNext = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (validateForm()) {
      navigate(ROUTES.BUSINESS_INFO, {
        state: { fullName, email, phoneNumber, password },
      });
    }
  };

  // --- Stepper Handler ---
  const handleStepClick = (targetStep: number) => {
    if (targetStep === 1) return;
    if (targetStep > 1) {
        handleNext(); 
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      
      {/* Sticky Header */}
      <div className="sticky top-0 z-40 bg-gray-100 pt-4 pb-2 px-4 shadow-sm">
        <Stepper 
            totalSteps={4} 
            currentStep={1} 
            onStepClick={handleStepClick}
        />
      </div>

      {/* Scrollable Content */}
      <div className="flex-grow px-4 pb-32 overflow-y-auto">
        <h1 className="text-4xl font-bold mb-6 mt-4">Create Account</h1>

      <div className='bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-2 pt-8 pb-8'>
        <form onSubmit={handleNext} className="flex flex-col space-y-6">
          <div className="relative">
            <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
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

          <div className="relative">
            <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <FloatingLabelInput
              id="phoneNumber"
              type="tel"
              label="Phone Number"
              value={phoneNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                if (val.length <= 10) {
                    setPhoneNumber(val);
                }
              }}
              required
              className="pl-10"
            />
          </div>

          <div className="relative">
            <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
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
            <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
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
            <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
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

          {error && <p className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">{error}</p>}

        </form>
      </div>
      </div>

      {/* Fixed Bottom Section */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-50 shadow-lg">
        <div className="max-w-md mx-auto space-y-3">
            <CustomButton type="submit" variant={Variant.Filled} onClick={handleNext} className="w-full">
                Next
            </CustomButton>

            <p className="text-center text-sm text-gray-600">
                Already have an account?{' '}
                <Link
                    to={ROUTES.LANDING}
                    className="font-medium text-blue-600 hover:underline"
                >
                    Log In
                </Link>
            </p>
        </div>
      </div>

    </div>
  );
};

export default SignUpPage;