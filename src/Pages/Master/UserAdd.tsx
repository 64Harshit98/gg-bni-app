import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ICONS } from '../../constants/icon.constants';
import { CustomIcon } from '../../Components';
// Import Firebase Functions SDK
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../../context/auth-context';
import { ROUTES } from '../../constants/routes.constants';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput'; // Import the component
import { CustomButton } from '../../Components/CustomButton'; // Assuming you have a custom button

const UserAdd: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Salesman');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentUser) {
      setError("You must be logged in to add users.");
      return;
    }

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);

    try {
      const functions = getFunctions();
      const createNewUser = httpsCallable(functions, 'createNewUser');

      const result = await createNewUser({
        fullName: fullName.trim(),
        email: email.trim(),
        password: password,
        role: role,
      });

      console.log(result.data);
      setSuccess(`User "${fullName}" created successfully!`);

      setFullName('');
      setEmail('');
      setPassword('');
      setRole('Salesman');

      setTimeout(() => {
        setSuccess(null);
        navigate(ROUTES.MASTERS);
      }, 2000);

    } catch (err: any) {
      console.error('Error adding user:', err);
      setError(err.message || 'Failed to add user. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white p-6">
      <button
        onClick={() => navigate(ROUTES.HOME)}
        className="self-start mb-8"
      >
        <CustomIcon iconName={ICONS.BACK_CURVE} />
      </button>
      <h1 className="text-4xl font-bold mb-2">User Add</h1>

      <form onSubmit={handleAddUser} className="flex flex-col p-6 space-y-6 overflow-y-auto">
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

        {/* Styled Select for Role */}
        <div className="relative">
          <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full p-3 bg-gray-50 rounded-md border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
            disabled={isSubmitting}
          >
            <option value="Salesman">Salesman</option>
            <option value="Manager">Manager</option>
          </select>
        </div>

        {error && <p className="text-sm text-center text-red-600">{error}</p>}
        {success && <p className="text-sm text-center text-green-600">{success}</p>}

        <CustomButton type="submit" variant="filled" disabled={isSubmitting}>
          {isSubmitting ? 'Adding User...' : 'Add User'}
        </CustomButton>
      </form>
      <div />
    </div>
  );
};

export default UserAdd;
