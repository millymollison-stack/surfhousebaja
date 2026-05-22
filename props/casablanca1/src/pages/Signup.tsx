import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import '../components/OnboardingPopup.css';

export function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { signUp, error } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signUp(email, password, fullName, phoneNumber, isAdmin);
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => navigate('/');

  return (
    <div className="auth-modal-backdrop">
      <div className="auth-modal">
        <button className="popup-close" onClick={handleClose} aria-label="Close">&times;</button>
        <h1>Create your account</h1>
        <p>Already have an account? <Link to="/?auth=login" className="popup-link">Sign in</Link></p>
        <form onSubmit={handleSubmit}>
          {error && <p className="popup-error">{error}</p>}
          <input id="fullName" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
          <input id="phoneNumber" type="tel" required value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="Phone number" />
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
          <input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          <button type="submit" disabled={loading} className="btn">
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
