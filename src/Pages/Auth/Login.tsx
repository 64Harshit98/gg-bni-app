// src/Pages/Auth/Login.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css'; // Dedicated CSS for Login Page

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevent default form submission

    setError(''); // Clear previous errors

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    // In a real application, you would send these credentials to your backend
    // and handle the authentication response.
    console.log('Attempting to log in with:', { email, password });

    try {
      // Simulate an API call
      const response = await new Promise((resolve, reject) => {
        setTimeout(() => {
          if (email === 'user@example.com' && password === 'password123') {
            resolve({ success: true, message: 'Login successful!' });
          } else {
            reject({ success: false, message: 'Invalid email or password.' });
          }
        }, 1000); // Simulate network delay
      });

      // If login is successful
      if ((response as any).success) {
        console.log((response as any).message);
        // Store auth token (e.g., in localStorage)
        localStorage.setItem('authToken', 'your-jwt-token-here');
        // Redirect to a dashboard or home page
        navigate('/home'); // Assuming '/home' is your main authenticated route
      }
    } catch (err: any) {
      console.error('Login error:', err.message);
      setError(err.message || 'An unexpected error occurred during login.');
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-card">
        <h2 className="login-title">Welcome Back!</h2>
        <p className="login-subtitle">Sign in to continue to your account.</p>

        <form onSubmit={handleLogin} className="login-form">
          <div className="login-field-group">
            <label htmlFor="email" className="login-label">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="login-input"
              required
            />
          </div>

          <div className="login-field-group">
            <label htmlFor="password" className="login-label">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="login-input"
              required
            />
          </div>

          {error && <p className="login-error-message">{error}</p>}

          <button type="submit" className="login-button">
            Login
          </button>
        </form>

        <div className="login-links">
          <button
            onClick={() => navigate('/forgot-password')} // Assuming a forgot password route
            className="login-link-button"
          >
            Forgot Password?
          </button>
          <p className="login-signup-text">
            Don't have an account?{' '}
            <button
              onClick={() => navigate('/signup')} /* Assuming a signup route */
              className="login-link-button signup"
            >
              Sign Up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
