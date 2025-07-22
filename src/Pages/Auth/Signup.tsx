// src/Pages/Auth/SignUp.tsx
import { useNavigate } from 'react-router-dom';
// import './SignUp.css'; // Create this CSS file

const SignUp = () => {
  const navigate = useNavigate();
  return (
    <div className="signup-page-container">
      <h1>Sign Up</h1>
      <p>Create your new account.</p>
      {/* Add form fields and logic here */}
      <button onClick={() => navigate('/login')}>Already have an account? Login</button>
    </div>
  );
};
export default SignUp;