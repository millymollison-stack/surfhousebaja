import React, { useEffect } from 'react';
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

function AppContent() {
  const { initialize, user } = useAuth();
  const location = useLocation();
  
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

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
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