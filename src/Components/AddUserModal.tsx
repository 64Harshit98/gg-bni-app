import React, { useState } from 'react';
import { ROLES, Variant } from '../enums';
import { inviteUser } from '../lib/AuthOperations';
import { FloatingLabelInput } from './ui/FloatingLabelInput';
import { CustomButton } from './CustomButton';
import { ReusableDropdown, type Option } from './Dropdown';
import { IconClose } from '../constants/Icons';

const roleOptions: Option<ROLES>[] = [
  { value: ROLES.SALESMAN, label: 'Salesman' },
  { value: ROLES.MANAGER, label: 'Manager' },
  { value: ROLES.OWNER, label: 'Owner' },
];

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserAdded?: () => void;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({ isOpen, onClose, onUserAdded }) => {
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ROLES>(ROLES.SALESMAN);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setFullName('');
    setPhoneNumber('');
    setEmail('');
    setPassword('');
    setRole(ROLES.SALESMAN);
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!fullName.trim() || !email.trim() || !password.trim() || !phoneNumber.trim()) {
      setError('Please fill out all user details.');
      return;
    }

    setIsSubmitting(true);
    try {
      await inviteUser(fullName.trim(), phoneNumber.trim(), email.trim(), password, role);

      setSuccess(`User "${fullName.trim()}" created successfully!`);
      onUserAdded?.();

      setTimeout(() => {
        resetForm();
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('User creation failed:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white w-full max-w-lg rounded-sm shadow-xl p-6 sm:p-8 relative">
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 disabled:opacity-50"
          disabled={isSubmitting}
          aria-label="Close"
        >
          <IconClose />
        </button>

        <h2 className="text-xl font-bold text-slate-800">Add Team Member</h2>
        <p className="text-sm text-slate-500 mt-1 mb-6">They'll log in with this exact email and password.</p>

        <form onSubmit={handleAddUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FloatingLabelInput
              id="modalFullName"
              type="text"
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={isSubmitting}
            />
            <FloatingLabelInput
              id="modalPhoneNumber"
              type="tel"
              label="Phone Number"
              maxLength={10}
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>

          <FloatingLabelInput
            id="modalEmail"
            type="email"
            label="Gmail / Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isSubmitting}
          />

          <FloatingLabelInput
            id="modalPassword"
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

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-100">
              <p className="text-sm text-red-600 font-medium">{error}</p>
            </div>
          )}
          {success && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <p className="text-sm text-emerald-600 font-medium">{success}</p>
            </div>
          )}

          <CustomButton
            type="submit"
            variant={Variant.Filled}
            disabled={isSubmitting}
            className="w-full py-3 h-auto text-base"
          >
            {isSubmitting ? 'Adding User...' : 'Add User'}
          </CustomButton>
        </form>
      </div>
    </div>
  );
};

export default AddUserModal;
