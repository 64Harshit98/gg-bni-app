// src/app/Pages/Auth/Login.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser } from '../../lib/auth_operations'; // Adjust path as needed
import { ROUTES } from '../../constants/routes.constants'; // Import routes for navigation
import './Login.css'; // Assuming you have a CSS file for Login

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await loginUser(email, password);
      navigate(ROUTES.HOME); // Redirect to home page after successful login
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <form onSubmit={handleSubmit} className="login-form">
        <h2>Login</h2>
        {error && <p className="login-error-message">{error}</p>}
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
        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
        <p className="login-switch-link">
          Don't have an account?{' '}
          <span onClick={() => navigate(`${ROUTES.SIGNUP}`)} style={{ cursor: 'pointer', color: '#007bff' }}>
            Sign Up
          </span>
        </p>
        {/* Optional: Password Reset Link */}
        <p className="login-reset-password" onClick={() => navigate(`${ROUTES.FORGOT_PASSWORD}`)} style={{ cursor: 'pointer', color: '#007bff' }}>
          Forgot Password?
        </p>
      </form>
    </div>
  );
};

export default Login;