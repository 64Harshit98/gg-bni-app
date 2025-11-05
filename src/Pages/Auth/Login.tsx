import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser } from '../../lib/AuthOperations';
import { ROUTES } from '../../constants/routes.constants';

import { CustomIcon } from '../../Components';
import { ICONS } from '../../constants/icon.constants';
import { CustomButton } from '../../Components/CustomButton';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Variant } from '../../enums';

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
      navigate(ROUTES.HOME);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white p-6">
      <button
        onClick={() => navigate(ROUTES.LANDING)}
        className="self-start mb-8"
      >
        <CustomIcon iconName={ICONS.BACK_CURVE} />
      </button>
      <h1 className="text-4xl font-bold mb-8">Log in</h1>
      <form onSubmit={handleSubmit} className="flex flex-col space-y-6">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <FloatingLabelInput
          id="email"
          type="email"
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
        <FloatingLabelInput
          id="password"
          type="password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />
        <CustomButton type="submit" variant={Variant.Filled} disabled={loading}>
          {loading ? 'Logging in...' : 'LOG IN'}
        </CustomButton>
      </form>
    </div>
  );
};

export default Login;
