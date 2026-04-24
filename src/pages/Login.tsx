import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import '../components/OnboardingPopup.css';

// Renders the login form as a modal overlay (no dark page behind it)
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, error } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modal-backdrop">
      <div className="auth-modal">
        <button className="popup-close" onClick={() => navigate('/')} aria-label="Close">&times;</button>
        <h1>Sign in to your account</h1>
        <p className="popup-note">Or <Link to="/signup" className="popup-link">create a new account</Link></p>
        <form onSubmit={handleSubmit}>
          {error && <p className="popup-error">{error}</p>}
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          <button type="submit" disabled={loading} className="btn">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
