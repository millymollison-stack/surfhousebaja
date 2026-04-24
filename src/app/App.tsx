import React, { useEffect, useState, useRef, Component, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { Layout } from '../components/Layout';
import { Home } from '../pages/Home';
import { Login } from '../pages/Login';
import { Signup } from '../pages/Signup';
import { AdminDashboard } from '../pages/AdminDashboard';
import { PropertyAdmin } from '../pages/PropertyAdmin';
import { EmailConfirmation } from '../pages/EmailConfirmation';
import { loadFontAccent } from '../lib/fontAccent';
import { loadBrandColor } from '../lib/brandColor';
import { Onboarding } from '../pages/Onboarding';
import PaymentPage from '../pages/PaymentPage';

interface ErrorBoundaryProps { children: ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error: string; }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(e: Error): ErrorBoundaryState {
    return { hasError: true, error: e.message };
  }
  componentDidCatch(e: Error, info: React.ErrorInfo) {
    console.error('🔴 App ErrorBoundary caught:', e.message, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif', color: '#333' }}>
          <h1>Something went wrong</h1>
          <p style={{ color: '#666' }}>{this.state.error}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', marginTop: '16px', cursor: 'pointer' }}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { initialize, user } = useAuth();
  const location = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [siteName, setSiteName] = useState('@surfhousebaja');
  const saveAllRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    initialize();
    loadBrandColor();
    loadFontAccent();
  }, [initialize]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('auth') === 'login' || params.get('auth') === 'signup') {
      // auth modal will be shown below
    }
  }, [location.search]);

  const handleSaveAll = async () => {
    if (saveAllRef.current) {
      await saveAllRef.current();
    }
    setHasChanges(false);
    setIsEditing(false);
  };

  // Check if auth modal should show (from ?auth= query param)
  const authParam = new URLSearchParams(location.search).get('auth');
  const showLogin = authParam === 'login' && !user;
  const showSignup = authParam === 'signup' && !user;

  return (
    <>
      <Layout
        isEditing={isEditing}
        onToggleEdit={() => setIsEditing(!isEditing)}
        hasChanges={hasChanges}
        onSaveChanges={handleSaveAll}
        siteName={siteName}
        onSiteNameChange={setSiteName}
      >
        <Routes>
          <Route path="/" element={<Home isEditing={isEditing} onHasChanges={setHasChanges} registerSaveAll={(fn) => { saveAllRef.current = fn; }} onSiteNameChange={setSiteName} />} />
          <Route path="/auth/confirm" element={<EmailConfirmation />} />
          <Route path="/admin" element={user?.role === 'admin' ? <AdminDashboard /> : <Navigate to="/" replace />} />
          <Route path="/property-admin" element={user ? <PropertyAdmin /> : <Navigate to="/login" replace />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/pay/:bookingId" element={<PaymentPage />} />
        </Routes>
      </Layout>
      {/* Auth modals — shown via ?auth= query param, no route change needed */}
      {showLogin && <Login />}
      {showSignup && <Signup />}
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
