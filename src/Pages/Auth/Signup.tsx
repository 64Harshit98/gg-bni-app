import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
// db, serverTimestamp, setDoc, and doc are no longer needed here
import { ROUTES } from '../../constants/routes.constants';
import { registerUserWithDetails } from '../../lib/AuthOperations';

import { CustomIcon } from '../../Components';
import { ICONS } from '../../constants/icon.constants';
import { CustomButton } from '../../Components/CustomButton';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { ROLES, Variant } from '../../enums';

const OwnerInfoPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const combinedData = location.state; // Business info from previous step

  const [ownerName, setOwnerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ownerName.trim() || !email.trim() || !password.trim()) {
      setError("Please fill out all owner details.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Pass all data to the auth operations function
      // The Cloud Function will handle all database writes
      const finalBusinessData = {
        ...combinedData,
        ownerName: ownerName,
        phoneNumber: phoneNumber,
        ownerEmail: email,
      };

      await registerUserWithDetails(
        ownerName,
        phoneNumber,
        email,
        password,
        ROLES.OWNER,
        finalBusinessData
      );

      // Success! The Cloud Function did all the work.
      navigate(ROUTES.HOME);

    } catch (err: any) {
      console.error("Registration failed:", err);
      // The error message will come directly from the Cloud Function
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white p-6">
      <button
        onClick={() => navigate(-1)}
        className="self-start mb-8"
      >
        <CustomIcon iconName={ICONS.BACK_CURVE} />
      </button>
      <h1 className="text-4xl font-bold mb-2">Owner Information</h1>

      <form onSubmit={handleFinish} className="flex flex-col space-y-6 overflow-y-auto">
        <FloatingLabelInput
          id="ownerName"
          type="text"
          label="Your Full Name"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          required
        />
        <FloatingLabelInput
          id="phoneNumber"
          type="number"
          label="Your Phone Number"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          required
        />
        <FloatingLabelInput
          id="email"
          type="email"
          label="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FloatingLabelInput
          id="password"
          type="password"
          label="Create a Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <CustomButton type="submit" variant={Variant.Filled} disabled={isSubmitting}>
          {isSubmitting ? 'Signing Up...' : 'Sign Up'}
        </CustomButton>
      </form>
    </div>
  );
};

export default OwnerInfoPage;