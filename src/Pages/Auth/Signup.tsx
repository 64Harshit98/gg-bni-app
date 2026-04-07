import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components/CustomButton';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Stepper } from '../../Components/Stepper';
import { Variant } from '../../enums';
import { FiMail, FiLock, FiEye, FiEyeOff, FiPhone, FiUser } from 'react-icons/fi';
import { saveLeadProgress } from '../../lib/Lead';
import bgMain from '../../assets/bg-main.png';
import sellarHeading from '../../assets/sellar-logo-heading.png';

const LOCAL_STORAGE_KEY = 'sellar_onboarding_data';

const SignUpPage: React.FC = () => {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedDataString = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedDataString) {
      const savedData = JSON.parse(savedDataString);
      if (savedData.fullName) setFullName(savedData.fullName);
      if (savedData.email) setEmail(savedData.email);
      if (savedData.phoneNumber) setPhoneNumber(savedData.phoneNumber);
      if (savedData.password) {
        setPassword(savedData.password);
        setConfirmPassword(savedData.password);
      }
    }
  }, []);

  useEffect(() => {
    const saveData = () => {
      const currentSaved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
      const updatedData = { ...currentSaved, fullName, email, phoneNumber, password };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedData));
    };
    saveData();
  }, [fullName, email, phoneNumber, password]);

  const validateForm = (): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!fullName.trim() || !email.trim() || !phoneNumber.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Please fill out all fields.');
      return false;
    }
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return false;
    }
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

  const handleClearData = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setFullName('');
    setEmail('');
    setPhoneNumber('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const handleNext = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (validateForm()) {
      await saveLeadProgress(email, {
        fullName,
        phoneNumber,
        status: 'Onboarding',
        currentStep: 'Step 2: Business Info',
      });

      navigate(ROUTES.BUSINESS_INFO, {
        state: { fullName, email, phoneNumber, password },
      });
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white">
  {/* Left side like Figma */}
  <div className="hidden lg:block w-1/2 relative">
    <img
      src={bgMain}
      alt="Registration visual"
      className="h-full w-full object-cover"
    />
    <div className="absolute inset-0 flex items-center justify-center">
      <img
        src={sellarHeading}
        alt="Sellar Heading"
        className="w-48 h-auto"
      />
    </div>
  </div>

  {/* Right side keeps your original structure scale */}
  <div className="flex flex-col h-screen overflow-hidden w-full lg:w-1/2 bg-white">
    <div className="flex-shrink-0 bg-white pt-4 pb-2 px-4 shadow-sm z-40 flex justify-center">
      <div className="w-full max-w-xs">
        <Stepper totalSteps={2} currentStep={1} onStepClick={() => {}} />
      </div>
    </div>

    <div className="flex-grow px-4 pb-4 overflow-hidden flex flex-col justify-start">
      <div className="flex justify-between items-end mb-6 mt-4">
        <h1 className="text-3xl font-bold">Create Account</h1>
        <button
          type="button"
          onClick={handleClearData}
          className="text-sm font-medium text-red-500 hover:text-red-700 transition-colors bg-red-50 px-3 py-1.5 rounded-sm border border-red-100 mb-1"
        >
          Clear Form
        </button>
      </div>

      <div className="bg-white p-7 pb-7 pt-7 rounded-sm space-y-2 pt-6 pb-6 pl-5 w-[103%] mx-auto">
        <form onSubmit={handleNext} className="flex flex-col space-y-5">
          <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
            <div style={{ position: 'relative' }}>
              <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={16} />
              <FloatingLabelInput
                id="fullName"
                type="text"
                label="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="pl-12 py-3 bg-white
                 border border-[#7D7777A3] shadow-[0_4px_4px_rgba(0,0,0,0.15)]"
                style={{ '--label-left': '3rem' } as React.CSSProperties}
              />
            </div>
          </div>

          <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
            <div style={{ position: 'relative' }}>
              <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
              <FloatingLabelInput
                id="phoneNumber"
                type="tel"
                label="Phone Number"
                value={phoneNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  if (val.length <= 10) setPhoneNumber(val);
                }}
                required
                className="pl-12 py-3 bg-white border border-[#7D7777A3] shadow-[0_4px_4px_rgba(0,0,0,0.15)]"
                style={{ '--label-left': '3rem' } as React.CSSProperties}
              />
            </div>
          </div>

          <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
            <div style={{ position: 'relative' }}>
              <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
              <FloatingLabelInput
                id="email"
                type="email"
                label="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-12 py-3 bg-white border border-[#7D7777A3] shadow-[0_4px_4px_rgba(0,0,0,0.15)]"
                style={{ '--label-left': '3rem' } as React.CSSProperties}
              />
            </div>
          </div>

          <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
            <div style={{ position: 'relative' }}>
              <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={16} />
              <FloatingLabelInput
                id="password"
                type={showPassword ? "text" : "password"}
                label="Create a Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pl-12 py-3 pr-10 bg-white border border-[#7D7777A3] shadow-[0_4px_4px_rgba(0,0,0,0.15)] w-full"
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
          </div>

          <div className="relative [&_label]:!left-[3rem] [&_label]:bg-white">
            <div style={{ position: 'relative' }}>
              <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={16} />
              <FloatingLabelInput
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                label="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="pl-12 py-3 pr-10 bg-white border border-[#7D7777A3] shadow-[0_4px_4px_rgba(0,0,0,0.15)] w-full"
                style={{ '--label-left': '3rem' } as React.CSSProperties}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <FiEye size={20} /> : <FiEyeOff size={20} />}
              </button>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm text-center bg-red-50 p-2 rounded-sm">{error}</p>}
        </form>
      </div>
    </div>

    <div className="fixed lg:absolute bottom-0 left-0 lg:left-auto right-0 lg:w-1/2 p-4 h-[110px] bg-gray-100 border-t border-gray-200 z-50 shadow-lg">
      <div className="max-w-md mx-auto space-y-3">
        <CustomButton
          type="submit"
          variant={Variant.Filled}
          onClick={handleNext}
          className="w-full !bg-[#141212] hover:!bg-[#2a2626] !text-white"
        >
          Next
        </CustomButton>
        <p className="text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link to={ROUTES.LANDING} className="font-medium text-[#2B10F2] hover:underline">
            Log In
          </Link>
        </p>
      </div>
    </div>
  </div>
</div>
  );
};

export default SignUpPage;