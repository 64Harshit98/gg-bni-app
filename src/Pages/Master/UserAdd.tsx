// src/Pages/Master/UserAdd.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './UserAdd.css'; // Import its unique CSS

const UserAdd = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Salesman'); // Default role

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real application, you would send this data to your backend API
    alert(`Adding User:
      Full Name: ${fullName}
      Username: ${username}
      Email: ${email}
      Role: ${role}`);
    // Optionally clear form or navigate after submission
    setFullName('');
    setUsername('');
    setEmail('');
    setPassword('');
    setRole('Salesman');
  };

  return (
    <div className="user-add-page-wrapper">
      {/* Top Bar for User Add */}
      <div className="user-add-top-bar">
        <button onClick={() => navigate(-1)} className="user-add-close-button">
          &times;
        </button>
        <h2 className="user-add-title">Add New User</h2>
        <div style={{ width: '1.5rem' }}></div> {/* Spacer */}
      </div>

      {/* Main Content Area */}
      <div className="user-add-content-area">
        <form onSubmit={handleAddUser} className="user-add-form">
          <div className="user-add-form-group">
            <label htmlFor="fullName" className="user-add-label">Full Name</label>
            <input
              type="text"
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full Name"
              className="user-add-input"
              required
            />
          </div>

          <div className="user-add-form-group">
            <label htmlFor="username" className="user-add-label">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="user-add-input"
              required
            />
          </div>

          <div className="user-add-form-group">
            <label htmlFor="email" className="user-add-label">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="user-add-input"
              required
            />
          </div>

          <div className="user-add-form-group">
            <label htmlFor="password" className="user-add-label">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="user-add-input"
              required
            />
          </div>

          <div className="user-add-form-group">
            <label htmlFor="role" className="user-add-label">Role</label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="user-add-select"
            >
              <option value="Salesman">Salesman</option>
              <option value="Manager">Manager</option>
            </select>
          </div>

          <button type="submit" className="user-add-save-button">
            Add User
          </button>
        </form>
      </div>
    </div>
  );
};

export default UserAdd;