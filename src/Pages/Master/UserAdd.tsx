import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// --- No 'db', 'doc', 'setDoc' imports needed! The Cloud Function does it. ---
import { ICONS } from '../../constants/icon.constants';
import { ROUTES } from '../../constants/routes.constants';
import { ROLES, Variant } from '../../enums';
import { useAuth } from '../../context/auth-context';
// --- FIX: Import the correct function ---
import { inviteUser } from '../../lib/AuthOperations';

import { CustomIcon } from '../../Components';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { CustomButton } from '../../Components/CustomButton';
import { ReusableDropdown, type Option } from '../../Components/Dropdown';

const roleOptions: Option<ROLES>[] = [
  { value: ROLES.SALESMAN, label: 'Salesman' },
  { value: ROLES.MANAGER, label: 'Manager' },
];
const UserAdd: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ROLES>(ROLES.SALESMAN);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!currentUser?.companyId) {
      setError("Your company information could not be found. Please try logging in again.");
      return;
    }

    if (!fullName.trim() || !email.trim() || !password.trim() || !phoneNumber.trim()) {
      setError("Please fill out all user details.");
      return;
    }

    setIsSubmitting(true);

    try {
      // --- FIX: Call 'inviteUser' ---
      // This is the correct function for this page.
      await inviteUser(
        fullName.trim(),
        phoneNumber.trim(),
        email.trim(),
        password,
        role
      );

      // --- All client-side Firestore code is removed (it's insecure) ---

      setSuccess(`User "${fullName.trim()}" created successfully!`);

      // Reset form
      setFullName('');
      setPhoneNumber('');
      setEmail('');
      setPassword('');

      setTimeout(() => {
        setSuccess(null);
        navigate(ROUTES.MASTERS);
      }, 2000);

    } catch (err: any) {
      console.error("User creation failed:", err);
      // The error message (e.g., "This email is already registered")
      // will come directly from your Cloud Function.
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading user data...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 p-6">
      <button
        onClick={() => navigate(ROUTES.HOME)}
        className="self-start mb-8 transition-opacity hover:opacity-75"
        aria-label="Go back"
      >
        <CustomIcon iconName={ICONS.BACK_CURVE} />
      </button>

      <div className="w-full max-w-lg mx-auto">
        <h1 className="text-4xl font-bold mb-6">Add New User</h1>

        <form onSubmit={handleAddUser} className="flex flex-col space-y-6">
          <FloatingLabelInput
            id="fullName"
            type="text"
            label="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            disabled={isSubmitting}
          />
          <FloatingLabelInput
            id="phoneNumber"
            type="tel"
            label="Phone Number"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            required
            disabled={isSubmitting}
          />
          <FloatingLabelInput
            id="email"
            type="email"
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isSubmitting}
          />
          <FloatingLabelInput
            id="password"
            type="password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isSubmitting}
          />

          <ReusableDropdown
            options={roleOptions}
            value={role}
            onChange={setRole}
            placeholder="Select a role..."
            disabled={isSubmitting}
            className="w-full"
          />


          {error && <p className="text-sm text-center text-red-600 font-medium">{error}</p>}
          {success && <p className="text-sm text-center text-green-600 font-medium">{success}</p>}

          <div className="pt-4">
            <CustomButton type="submit" variant={Variant.Filled} disabled={isSubmitting}>
              {isSubmitting ? 'Adding User...' : 'Add User'}
            </CustomButton>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserAdd;