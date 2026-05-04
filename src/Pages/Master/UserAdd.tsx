import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { ROLES, Variant } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { inviteUser } from '../../lib/AuthOperations';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { CustomButton } from '../../Components/CustomButton';
import { ReusableDropdown, type Option } from '../../Components/Dropdown';
import BackButton from '../../Components/BackButton';

const roleOptions: Option<ROLES>[] = [
  { value: ROLES.SALESMAN, label: 'Salesman' },
  { value: ROLES.MANAGER, label: 'Manager' },
  { value: ROLES.OWNER, label: 'Owner' }
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
    <div className="flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="bg-white rounded-xs shadow-xl border border-slate-100 p-6 sm:p-10 w-full max-w-2xl transition-all">

        {/* Header Section */}
        <div className="flex items-start gap-4 border-b border-slate-200 pb-6 mb-8">
          <BackButton/>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">Add New User</h1>
            <p className="text-sm text-slate-500 mt-1">Fill in the details below to invite a new team member.</p>
          </div>
        </div>

        {/* Form Section */}
        <form onSubmit={handleAddUser} className="space-y-6">

          {/* Two-column grid for Name and Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
          </div>

          <FloatingLabelInput
            id="email"
            type="email"
            label="Email Address"
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

          <div className="w-full relative z-10">
            <ReusableDropdown
              options={roleOptions}
              value={role}
              onChange={setRole}
              placeholder="Select a role..."
              disabled={isSubmitting}
              className="w-full"
            />
          </div>

          {/* Styled Feedback Messages */}
          {error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-100">
              <p className="text-sm text-red-600 font-medium">{error}</p>
            </div>
          )}
          {success && (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100">
              <p className="text-sm text-emerald-600 font-medium">{success}</p>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-4 border-t border-slate-100 mt-8">
            <CustomButton
              type="submit"
              variant={Variant.Filled}
              disabled={isSubmitting}
              className="w-full sm:w-auto sm:px-12 py-3 h-auto text-base"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  Adding User...
                </span>
              ) : (
                'Add User'
              )}
            </CustomButton>
          </div>

        </form>
      </div>
    </div>
  );
};

export default UserAdd;