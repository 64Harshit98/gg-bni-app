// src/app/Pages/Auth/Signup.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerUserWithDetails } from '../../lib/auth_operations'; // Import the new unified function
import { ROUTES } from '../../constants/routes.constants';
import './Signup.css';

const Signup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }
    
    if (!name.trim()) {
        setError('Name cannot be empty.');
        setLoading(false);
        return;
    }

    try {
      // --- Call the new unified function for a single, clean operation ---
      await registerUserWithDetails(name.trim(), email, password);
      // ---------------------------------------------------------------------
      
      alert('Account created successfully! Please log in.');
      navigate(ROUTES.LOGIN);
    } catch (err: any) {
      setError(err.message || 'Signup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <form onSubmit={handleSubmit} className="signup-form">
        <h2>Sign Up</h2>
        {error && <p className="signup-error-message">{error}</p>}
        <div className="form-group">
          <label htmlFor="name">Name</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>
        <p className="signup-switch-link">
          Already have an account?{' '}
          <span onClick={() => navigate(ROUTES.LOGIN)} style={{ cursor: 'pointer', color: '#007bff' }}>
            Login
          </span>
        </p>
      </form>
    </div>
  );
};

export default Signup;