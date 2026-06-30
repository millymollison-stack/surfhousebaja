import React, { useEffect, useState, useRef, Component, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './store/auth';
import { AdminSidebar } from './export/AdminSidebarBundle';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { AdminDashboard } from './pages/AdminDashboard';
import { PropertyAdmin } from './pages/PropertyAdmin';
import { EmailConfirmation } from './pages/EmailConfirmation';
import { loadFontAccent } from './lib/fontAccent';
import { loadBrandColor } from './lib/brandColor';
import { Onboarding } from './pages/Onboarding';
import { CustomerSite } from './pages/CustomerSite';
import PaymentPage from './pages/PaymentPage';
import { SaasAdminDashboard } from './pages/SaasAdminDashboard';
import { supabase } from './lib/supabase';

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
    console.error('App ErrorBoundary caught:', e.message, info.componentStack);
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
  const [siteName, setSiteName] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const saveAllRef = useRef<(() => Promise<void>) | null>(null);
  // Track whether we've already validated/stashed sessionStorage — run exactly once
  const sessionStorageCleanedRef = useRef(false);

  // ── Init (runs once on mount) ────────────────────────────────────────────────
  useEffect(() => {
    initialize();
    loadBrandColor();
    loadFontAccent();
  }, [initialize]);

  // ── Clear stale onboarding sessionStorage when user is first established ───────
  // We can't do this in the init effect because user isn't loaded yet.
  // This fires when user transitions null → loaded (first app load or after sign-in).
  useEffect(() => {
    if (sessionStorageCleanedRef.current || !user) return;
    sessionStorageCleanedRef.current = true;

    (async () => {
      const slug = sessionStorage.getItem('popup_website_name');
      if (!slug) return;
      // Validate: does this user own a property whose slug matches popup_website_name?
      // popup_website_name stores a display name (e.g. "OBO Casa"), not a slug,
      // so we compare lowercase-stripped versions. If it doesn't match any of the
      // user's properties, it's stale from a deleted property — clear it.
      try {
        const { data } = await supabase
          .from('properties')
          .select('id, title, slug')
          .eq('owner_id', user.id);
        const allSlugs = (data || []).map(p =>
          (p.slug || p.title || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        );
        const storedSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const isValid = allSlugs.some(s => s === storedSlug || storedSlug.includes(s) || s.includes(storedSlug));
        if (!isValid) {
          sessionStorage.removeItem('popup_website_name');
          sessionStorage.removeItem('popup_website_desc');
          sessionStorage.removeItem('popup_scraped_data');
        }
      } catch { /* non-blocking */ }
    })();
  }, [user]);

  // ── Listen for property-loaded event (hybrid static page boots React) ──────────
  useEffect(() => {
    const handlePropertyLoaded = (e: Event) => {
      const { property, user, isStale } = (e as CustomEvent).detail;
      if (user && property && property.owner_id === user.id) {
        setSidebarOpen(true);
        setIsEditing(true);
        setCanEdit(true);
        if (isStale) {
          sessionStorage.setItem('__STALE__', '1');
        }
      }
    };
    window.addEventListener('property-loaded', handlePropertyLoaded);
    return () => window.removeEventListener('property-loaded', handlePropertyLoaded);
  }, []);

  const handleSaveAll = async () => {
    if (saveAllRef.current) await saveAllRef.current();
    setHasChanges(false);
    setIsEditing(false);
  };

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
        onOpenSidebar={() => setSidebarOpen(true)}
        canEdit={canEdit}
      >
        <Routes>
          <Route path="/" element={<Home isEditing={isEditing} onHasChanges={setHasChanges} registerSaveAll={(fn) => { saveAllRef.current = fn; return true; }} onSiteNameChange={setSiteName} onOpenSidebar={() => setSidebarOpen(true)} onCanEditChange={setCanEdit} />} />
          <Route path="/auth/confirm" element={<EmailConfirmation />} />
          <Route path="/admin" element={user?.role === 'admin' ? <AdminDashboard /> : <Navigate to="/" replace />} />
          <Route path="/property-admin" element={user ? <PropertyAdmin /> : <Navigate to="/login" replace />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/pay/:bookingId" element={<PaymentPage />} />
          <Route path="/props/Casablanca1" element={<CustomerSite onSiteNameChange={setSiteName} />} />
          <Route path="/props/:slug" element={<CustomerSite onSiteNameChange={setSiteName} />} />
          <Route path="/saas-admin" element={user?.role === 'saas_admin' ? <SaasAdminDashboard /> : <Navigate to="/" replace />} />
        </Routes>
      </Layout>
      {showLogin && <Login />}
      {showSignup && <Signup />}
      <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
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
