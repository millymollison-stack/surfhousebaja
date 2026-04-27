import React, { useState, useEffect } from 'react';
import './OnboardingPopup.css';
import './Editmode.css';
import './sidebar.css';
import { X, User, LogOut, CreditCard as Edit2, Save, AlertCircle, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { supabase } from '../lib/supabase';
import { EmailNotificationService } from '../services/emailService';
import UserBookings from './UserBookings';
import type { Booking, Property, Profile } from '../types';

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [bookings, setBookings] = useState<(Booking & { property: Property; user: Profile })[]>([]);
  const [loading, setLoading] = useState(false);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    stripe_account_id: '',
    stripe_account_status: ''
  });
  const [userProperty, setUserProperty] = useState<Property | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // Close menu on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is outside the menu panel
      const menuPanel = document.querySelector('[data-user-menu-panel]');
      const menuButton = document.querySelector('[data-user-menu-button]');
      if (menuPanel && !menuPanel.contains(target) && menuButton && !menuButton.contains(target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setBookings([]);
      setBookingsLoading(false);
      return;
    }
    if (!user) return;

    // Clear and reload bookings on every open
    setBookings([]);
    setBookingsLoading(true);
    setBookingError(null);

    const load = async () => {
      try {
        let query = supabase
          .from('bookings')
          .select(`*, property:properties!inner(*), user:profiles!inner(*)`);
        if (user.role === 'admin') {
          query = query.order('status', { ascending: true, nullsLast: true }).order('created_at', { ascending: false });
        } else {
          query = query.eq('user_id', user.id).order('created_at', { ascending: false });
        }
        const { data, error } = await query;
        if (error) throw error;
        const valid = (data || []).filter((b: any) => b && b.property && b.user);
        setBookings(valid);
      } catch (err: any) {
        setBookingError(err.message || 'Failed to load bookings');
      } finally {
        setBookingsLoading(false);
      }
    };

    const loadProperty = async () => {
      if (!user) return;
      const { data: property } = await supabase.from('properties').select('*').eq('owner_id', user.id).maybeSingle();
      if (property) setUserProperty(property);
    };

    load();
    loadProperty();

    setProfileData({
      full_name: user.full_name || '',
      email: user.email || '',
      phone_number: user.phone_number || '',
      stripe_account_id: (user as any).stripe_account_id || '',
      stripe_account_status: (user as any).stripe_account_status || ''
    });
    setProfileError(null);
    setProfileSuccess(null);
  }, [isOpen, user]);

  // Load user's property for custom domain
  const loadUserProperty = async () => {
    if (!user) return;
    
    const { data: property, error } = await supabase
      .from('properties')
      .select('*')
      .eq('owner_id', user.id)
      .maybeSingle();
    
    if (property) {
      setUserProperty(property);
    }
  };

  const loadBookings = async () => {
    if (!user) return;
    
    setBookingsLoading(true);
    setBookingError(null);
    console.log('=== LOADING BOOKINGS ===');
    console.log('User:', user);
    console.log('User role:', user.role);
    
    try {
      let query = supabase
        .from('bookings')
        .select(`
          *,
          property:properties!inner(*),
          user:profiles!inner(*)
        `);

      // For admin, show all bookings ordered by status and date
      if (user.role === 'admin') {
        console.log('Loading admin bookings...');
        query = query
          .order('status', { ascending: true, nullsLast: true })
          .order('created_at', { ascending: false });
      } else {
        console.log('Loading user bookings for user ID:', user.id);
        // For regular users, only show their bookings
        query = query
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
      }

      const { data, error } = await query;
      
      console.log('Booking query result:', { data, error });
      
      if (error) {
        console.error('Error fetching bookings:', error);
        throw error;
      }

      // Ensure we have valid data with proper relationships
      const validBookings = (data || []).filter(booking => 
        booking && booking.property && booking.user
      );
      
      console.log('Setting bookings state with:', validBookings.length, 'valid bookings');
      setBookings(validBookings);
      console.log('Bookings loaded successfully:', validBookings.length, 'bookings');
    } catch (err) {
      console.error('Failed to load bookings:', err);
      setBookingError(err instanceof Error ? err.message : 'Failed to load bookings');
    } finally {
      setBookingsLoading(false);
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: 'approved' | 'denied', reason?: string) => {
    console.log('=== USER MENU: handleUpdateBookingStatus called ===');
    console.log('Booking ID:', bookingId);
    console.log('Status:', status);
    console.log('Reason:', reason);

    if (!user || user.role !== 'admin') return;

    setBookingError(null);
    setBookingsLoading(true);

    try {
      console.log('Updating booking status in database...');
      const { error } = await supabase
        .from('bookings')
        .update({
          status,
          updated_at: new Date().toISOString(),
          ...(reason ? { denial_reason: reason } : {})
        })
        .eq('id', bookingId);

      if (error) throw error;

      // Send email notifications
      console.log('Starting email notification process...');
      const booking = bookings.find(b => b.id === bookingId);
      console.log('Found booking for email:', booking);

      if (booking) {
        try {
          console.log('=== EMAIL SENDING DEBUG ===');
          console.log('Booking ID:', bookingId);
          console.log('Status:', status);
          console.log('Booking data:', JSON.stringify(booking, null, 2));

          if (status === 'approved') {
            console.log('Calling sendBookingConfirmationEmail...');
            await EmailNotificationService.sendBookingConfirmationEmail({
              booking: {
                start_date: booking.start_date,
                end_date: booking.end_date,
                guest_count: booking.guest_count,
                total_price: booking.total_price,
                special_requests: booking.special_requests
              },
              user: booking.user,
              property: booking.property
            });
            console.log('✅ Approval email sent successfully');
          } else if (status === 'denied') {
            console.log('Calling sendBookingDenialEmail with reason:', reason);
            await EmailNotificationService.sendBookingDenialEmail({
              booking: {
                start_date: booking.start_date,
                end_date: booking.end_date,
                guest_count: booking.guest_count,
                total_price: booking.total_price,
                special_requests: booking.special_requests
              },
              user: booking.user,
              property: booking.property,
              denialReason: reason
            });
            console.log('✅ Denial email sent successfully');
          }
        } catch (emailError) {
          console.error('❌ Failed to send status update email:', emailError);
          console.error('Email error details:', emailError);
          // Don't fail the status update if email fails
        }
      } else {
        console.error('❌ Booking not found for ID:', bookingId);
      }

      console.log('Database update successful, reloading bookings...');
      await loadBookings();
      console.log('=== USER MENU: handleUpdateBookingStatus completed ===');
    } catch (err) {
      console.error('❌ USER MENU: Failed to update booking status:', err);
      setBookingError(err instanceof Error ? err.message : 'Failed to update booking status');
    } finally {
      setBookingsLoading(false);
    }
  };

  const handleRefund = async (bookingId: string) => {
    if (!user || user.role !== 'admin') return;

    setBookingError(null);
    setBookingsLoading(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No authentication session found');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/process-refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ bookingId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to process refund');
      }

      await loadBookings();
    } catch (err) {
      console.error('Failed to process refund:', err);
      setBookingError(err instanceof Error ? err.message : 'Failed to process refund');
      throw err;
    } finally {
      setBookingsLoading(false);
    }
  };

  const handleProfileUpdate = async () => {
    if (!user) return;
    
    setLoading(true);
    setProfileError(null);
    setProfileSuccess(null);
    
    try {
      // Validate input data
      if (!profileData.full_name?.trim()) {
        throw new Error('Full name is required');
      }
      
      if (!profileData.email?.trim()) {
        throw new Error('Email is required');
      }

      const updates: any = {
        full_name: profileData.full_name.trim(),
        phone_number: profileData.phone_number?.trim() || null,
        stripe_account_id: profileData.stripe_account_id?.trim() || null,
        stripe_account_status: profileData.stripe_account_status?.trim() || null
      };
      
      // Add email to updates if it changed
      if (profileData.email.trim() !== user.email) {
        updates.email = profileData.email.trim();
      }

      // Get the current auth state to ensure we have the latest user data
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      
      if (!currentUser) {
        throw new Error('User session expired. Please sign in again.');
      }

      // Update profile in database first
      const profileUpdates = { ...updates };
      delete profileUpdates.email; // Handle email separately
      
      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            ...profileUpdates,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentUser.id);
        
        if (profileError) throw profileError;
      }
      
      // Handle email change if needed
      let emailChangeRequested = false;
      if (updates.email && updates.email !== currentUser.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: updates.email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm`
          }
        });
        
        if (emailError) throw emailError;
        emailChangeRequested = true;
      }
      
      if (emailChangeRequested) {
        setProfileSuccess('Profile updated! Please check your new email address for a confirmation link.');
      } else {
        setProfileSuccess('Profile updated successfully!');
        
        // Save custom domain to property if changed
        if (userProperty && userProperty.custom_domain !== undefined) {
          await supabase
            .from('properties')
            .update({ custom_domain: userProperty.custom_domain })
            .eq('id', userProperty.id);
        }
        
        // Refresh user data from auth store
        setTimeout(() => {
          useAuth.getState().initialize();
        }, 500);
      }
      
      setIsEditingProfile(false);
    } catch (error: any) {
      console.error('Failed to update profile:', error);
      
      // Handle specific error cases
      if (error.message?.includes('session')) {
        setProfileError('Your session has expired. Please sign out and sign in again.');
      } else if (error.message?.includes('email')) {
        setProfileError('Email update failed. Please check the email format and try again.');
      } else {
        setProfileError(error.message || 'Failed to update profile. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProfileInputChange = (field: keyof typeof profileData, value: string) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear messages when user starts typing
    setProfileError(null);
    setProfileSuccess(null);
  };

  if (!user) return null;

  // Animation state
  const [isAnimating, setIsAnimating] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
    setIsAnimating(true);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  const handleAnimationEnd = () => {
    setIsAnimating(false);
  };

  return (
    <>
      <button
        onClick={toggleMenu}
        data-user-menu-button
        className="flex items-center space-x-1 px-3 py-1.5 bg-white/20 backdrop-blur-sm border border-white/15 rounded text-white font-bold text-sm hover:bg-white/30"
      >
        <User className="h-4 w-4" />
        <span>{user.full_name?.split(' ')[0] || 'Profile'}</span>
      </button>

      {/* Slide-out menu */}
      {isOpen && (
        <div data-user-menu-panel className="sidebar-panel">
          {/* Header */}
          <div className="sidebar-header">
            <h1 className="sidebar-header-label">Profile</h1>
            <div className="sidebar-header-actions">
              {!isEditingProfile ? (
                <button onClick={() => setIsEditingProfile(true)} className="sidebar-btn-edit">
                  <Edit2 /><span>Edit</span>
                </button>
              ) : (
                <>

                  <button type="button" onClick={async () => { try { await handleProfileUpdate(); } catch(e) { console.error(e); } }} className="sidebar-btn-save" disabled={loading}>Save</button>
                </>
              )}
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Close menu" className="sidebar-btn-close">
                <X />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="sidebar-content">
            {profileError && (
              <div className="sidebar-alert sidebar-alert-error">
                <AlertCircle /><p>{profileError}</p>
              </div>
            )}
            {profileSuccess && (
              <div className="sidebar-alert sidebar-alert-success">
                <p>{profileSuccess}</p>
              </div>
            )}

            {/* Field list */}
            <div className="sidebar-fields">
              {user.role === 'admin' && (
                <div className="sidebar-field">
                  <h3 className="sidebar-label">Page URL</h3>
                  <div className="sidebar-input-wrap">
                    {isEditingProfile ? (
                      <input type="text" className="sidebar-input" value={userProperty?.custom_domain || ''} onChange={(e) => setUserProperty((prev: any) => prev ? { ...prev, custom_domain: e.target.value } : null)} placeholder="your-domain.com" disabled={loading} />
                    ) : (
                      <p className="sidebar-value">{userProperty?.custom_domain || 'surfhousebaja.com'}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="sidebar-field">
                <h3 className="sidebar-label">Full Name</h3>
                <div className="sidebar-input-wrap">
                  {isEditingProfile ? (
                    <input type="text" className="sidebar-input" value={profileData.full_name} onChange={(e) => handleProfileInputChange('full_name', e.target.value)} disabled={loading} />
                  ) : (
                    <p className="sidebar-value">{user.full_name}</p>
                  )}
                </div>
              </div>

              <div className="sidebar-field">
                <h3 className="sidebar-label">Email</h3>
                <div className="sidebar-input-wrap">
                  {isEditingProfile ? (
                    <input type="email" className="sidebar-input" value={profileData.email} onChange={(e) => handleProfileInputChange('email', e.target.value)} disabled={loading} />
                  ) : (
                    <p className="sidebar-value">{user.email}</p>
                  )}
                </div>
              </div>

              <div className="sidebar-field">
                <h3 className="sidebar-label">Phone</h3>
                <div className="sidebar-input-wrap">
                  {isEditingProfile ? (
                    <input type="tel" className="sidebar-input" value={profileData.phone_number} onChange={(e) => handleProfileInputChange('phone_number', e.target.value)} placeholder="Enter phone number" disabled={loading} />
                  ) : (
                    <p className="sidebar-value">{user.phone_number || 'Not provided'}</p>
                  )}
                </div>
              </div>

              {user.role === 'admin' && (
                <div className="sidebar-field">
                  <h3 className="sidebar-label">Payouts</h3>
                  <div className="sidebar-input-wrap">
                    {isEditingProfile ? (
                      <>
                        <input type="text" className="sidebar-input" value={profileData.stripe_account_id} onChange={(e) => handleProfileInputChange('stripe_account_id', e.target.value)} placeholder="Stripe Account ID" disabled={loading} />
                        <input type="text" className="sidebar-input" value={profileData.stripe_account_status} onChange={(e) => handleProfileInputChange('stripe_account_status', e.target.value)} placeholder="Status" disabled={loading} />
                      </>
                    ) : (
                      <button className="sidebar-value-link">
                        <Building /><span>{profileData.stripe_account_id ? 'Connected' : 'Set up payouts'}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {user.role === 'admin' && (
                <div className="sidebar-field">
                  <h3 className="sidebar-label">Role</h3>
                  <div className="sidebar-input-wrap">
                    <p className="sidebar-value capitalize">{user.role}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Sign out */}
            <button onClick={async () => { await signOut(); setIsOpen(false); }} className="sidebar-signout" disabled={loading}>
              <LogOut /><span>Sign Out</span>
            </button>
          </div>

          {/* Bookings */}
          <div className="sidebar-bookings">
            <div className="sidebar-bookings-inner">
              <h1 className="sidebar-section-header">Bookings</h1>

              {bookingError && (
                <div className="sidebar-alert sidebar-alert-error">
                  <AlertCircle /><p>{bookingError}</p>
                  <button onClick={loadBookings} style={{ marginTop: '6px', fontSize: '12px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>Try again</button>
                </div>
              )}

              {bookingsLoading ? (
                <div className="sidebar-spinner-wrap">
                  <div className="spinner-ring" />
                  <span className="sidebar-spinner-label">Loading bookings...</span>
                </div>
              ) : !bookingError && bookings.length === 0 ? (
                <div className="sidebar-empty">No bookings found.</div>
              ) : !bookingError ? (
                <UserBookings bookings={bookings} onUpdateStatus={user.role === 'admin' ? handleUpdateBookingStatus : undefined} onRefund={user.role === 'admin' ? handleRefund : undefined} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}