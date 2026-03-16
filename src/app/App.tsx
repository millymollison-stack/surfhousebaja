import React, { useEffect, useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { Layout } from '../components/Layout';
import { Home } from '../pages/Home';
import { Login } from '../pages/Login';
import { Signup } from '../pages/Signup';
import { AdminDashboard } from '../pages/AdminDashboard';
import { PropertyAdmin } from '../pages/PropertyAdmin';
import { EmailConfirmation } from '../pages/EmailConfirmation';
import { Onboarding } from '../pages/Onboarding';
import PaymentPage from '../pages/PaymentPage';

function AppContent() {
  const { initialize, user } = useAuth();
  const location = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const saveAllRef = useRef<(() => Promise<void>) | null>(null);
  
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Handle auth redirects from email links
  useEffect(() => {
    const handleAuthRedirect = () => {
      const hashParams = new URLSearchParams(location.hash.substring(1));
      const searchParams = new URLSearchParams(location.search);
      
      // Check for auth parameters in either hash or search
      const hasAuthParams = hashParams.has('access_token') || hashParams.has('error') || hashParams.has('type') || hashParams.has('token');
      const hasSearchAuthParams = searchParams.has('access_token') || searchParams.has('error') || searchParams.has('type') || searchParams.has('token');
      
      // Auth redirect logic can be added here if needed
    };
    
    handleAuthRedirect();
  }, [location]);

  const handleSaveAll = async () => {
    if (saveAllRef.current) {
      await saveAllRef.current();
    }
    setHasChanges(false);
    setIsEditing(false);
  };

  return (
    <Layout isEditing={isEditing} onToggleEdit={() => setIsEditing(!isEditing)} hasChanges={hasChanges} onSaveChanges={handleSaveAll}>
      <Routes>
        <Route path="/" element={<Home isEditing={isEditing} onHasChanges={setHasChanges} registerSaveAll={(fn) => { saveAllRef.current = fn; }} />} />
        <Route path="/auth/confirm" element={<EmailConfirmation />} />
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/signup"
          element={user ? <Navigate to="/" replace /> : <Signup />}
        />
        <Route
          path="/admin"
          element={
            user?.role === 'admin' ? (
              <AdminDashboard />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/property-admin"
          element={
            user ? (
              <PropertyAdmin />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/pay/:bookingId" element={<PaymentPage />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;