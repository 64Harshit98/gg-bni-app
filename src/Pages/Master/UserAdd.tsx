import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { ROUTES } from '../../constants/routes.constants';

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
      setError("You must be logged in as an admin to add users.");
      return;
    }

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);

    try {
      // This is a simplified example. In production, use Firebase Admin SDK on a server.
      const newUserId = `user_${Date.now()}`;

      const userDocRef = doc(db, 'users', newUserId);
      await setDoc(userDocRef, {
        name: fullName.trim(),
        email: email.trim(),
        role: role,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });

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
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="text-2xl font-bold text-gray-600"
        >
          &times;
        </button>
        <h2 className="text-xl font-bold text-gray-800">Add New User</h2>
        <div className="w-6"></div> {/* Spacer */}
      </div>

      {/* The form itself is now the main content container */}
      <form onSubmit={handleAddUser} className="flex-grow p-4 space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input type="text" id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Enter full name" required className="w-full p-3 bg-white rounded-md focus:ring-2 focus:ring-blue-500 outline-none border border-gray-300" />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter email address" required className="w-full p-3 bg-white rounded-md focus:ring-2 focus:ring-blue-500 outline-none border border-gray-300" />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" required className="w-full p-3 bg-white rounded-md focus:ring-2 focus:ring-blue-500 outline-none border border-gray-300" />
        </div>
        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value)} className="w-full p-3 bg-white rounded-md focus:ring-2 focus:ring-blue-500 outline-none appearance-none border border-gray-300">
            <option value="Salesman">Salesman</option>
            <option value="Manager">Manager</option>
          </select>
        </div>

        {error && <p className="text-sm text-center text-red-600">{error}</p>}
        {success && <p className="text-sm text-center text-green-600">{success}</p>}

        <div className="pt-2">
          <button type="submit" disabled={isSubmitting} className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400">
            {isSubmitting ? 'Adding User...' : 'Add User'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default UserAdd;
