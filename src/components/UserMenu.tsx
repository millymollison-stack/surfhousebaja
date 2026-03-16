import React, { useState, useEffect } from 'react';
import { X, User, LogOut, CreditCard as Edit2, Save, AlertCircle, Shield, Building, Info } from 'lucide-react';
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
    if (isOpen && user) {
      loadBookings();
      loadUserProperty();
      setProfileData({
        full_name: user.full_name || '',
        email: user.email || '',
        phone_number: user.phone_number || '',
        stripe_account_id: (user as any).stripe_account_id || '',
        stripe_account_status: (user as any).stripe_account_status || ''
      });
      // Clear any previous messages when opening
      setProfileError(null);
      setProfileSuccess(null);
    }
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

      {/* Slide-out menu with large drop shadow */}
      {isOpen && (
        <div
          data-user-menu-panel
          className="fixed right-0 top-0 h-full min-h-screen w-[calc(100%-72px)] max-w-[380px] bg-white shadow-[-20px_0_40px_rgba(0,0,0,0.4)] z-[99999] overflow-y-auto animate-slide-in cursor-default"
        >
        <div className="px-6">
          <div className="flex items-center justify-between h-16 border-b border-gray-200">
            <h2 className="text-[1.65rem] text-gray-900">Profile</h2>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close menu"
              className="p-2 rounded-full hover:bg-gray-100 z-50 relative"
            >
              <X className="h-6 w-6 text-gray-500" />
            </button>
          </div>

          <div className="py-4 space-y-4">
            {profileError && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <p className="ml-3 text-sm text-red-700">{profileError}</p>
                </div>
              </div>
            )}

            {profileSuccess && (
              <div className="rounded-md bg-green-50 p-4">
                <p className="text-sm text-green-700">{profileSuccess}</p>
              </div>
            )}

            <div className="flex justify-between items-start">
              <div></div>
              {!isEditingProfile ? (
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="flex items-center space-x-1 text-[#C47756] hover:text-[#B5684A] z-10 pointer-events-auto"
                >
                  <Edit2 className="h-4 w-4" />
                  <span>Edit</span>
                </button>
              ) : (
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      setIsEditingProfile(false);
                      setProfileData({
                        full_name: user.full_name || '',
                        email: user.email || '',
                        phone_number: user.phone_number || ''
                      });
                      setProfileError(null);
                      setProfileSuccess(null);
                    }}
                    className="text-gray-600 hover:text-gray-900 z-10 pointer-events-auto"
                    disabled={loading}
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleProfileUpdate}
                    className="text-green-600 hover:text-green-700 z-10 pointer-events-auto"
                    disabled={loading}
                  >
                    <Save className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3 leading-relaxed">
              {/* Page URL - for custom domain or subdomain */}
              <div>
                <label className="block text-sm font-normal text-gray-500 mb-0.5">
                  <span className="flex items-center gap-1">
                    Page URL
                    <Info className="h-3 w-3 text-gray-400" />
                  </span>
                </label>
                {isEditingProfile ? (
                  <input
                    type="text"
                    value={userProperty?.custom_domain || ''}
                    onChange={(e) => setUserProperty((prev: any) => prev ? { ...prev, custom_domain: e.target.value } : null)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#C47756] focus:ring-[#C47756]"
                    disabled={loading}
                    placeholder="your-domain.com"
                  />
                ) : (
                  <p className="text-base font-normal text-gray-900">
                    {userProperty?.custom_domain || 'surfhousebaja.com'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-normal text-gray-500 mb-0.5">
                  Full Name
                </label>
                {isEditingProfile ? (
                  <input
                    type="text"
                    value={profileData.full_name}
                    onChange={(e) => handleProfileInputChange('full_name', e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#C47756] focus:ring-[#C47756]"
                    disabled={loading}
                  />
                ) : (
                  <p className="text-base font-normal text-gray-900">{user.full_name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-normal text-gray-500 mb-0.5">
                  Email Address
                </label>
                {isEditingProfile ? (
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={(e) => handleProfileInputChange('email', e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#C47756] focus:ring-[#C47756]"
                    disabled={loading}
                  />
                ) : (
                  <p className="text-base font-normal text-gray-900">{user.email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-normal text-gray-500 mb-0.5">
                  Phone Number
                </label>
                {isEditingProfile ? (
                  <input
                    type="tel"
                    value={profileData.phone_number}
                    onChange={(e) => handleProfileInputChange('phone_number', e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#C47756] focus:ring-[#C47756]"
                    placeholder="Enter phone number"
                    disabled={loading}
                  />
                ) : (
                  <p className="text-base font-normal text-gray-900">
                    {user.phone_number || 'Not provided'}
                  </p>
                )}
              </div>

              {/* Payout Bank Account - for admin users */}
              {user.role === 'admin' && (
                <div>
                  <label className="block text-sm font-normal text-gray-500 mb-0.5">
                    <span className="flex items-center gap-1">
                      Payout Bank Account
                      <Info className="h-3 w-3 text-gray-400" />
                    </span>
                  </label>
                  {isEditingProfile ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={profileData.stripe_account_id}
                        onChange={(e) => handleProfileInputChange('stripe_account_id', e.target.value)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#C47756] focus:ring-[#C47756]"
                        placeholder="Stripe Account ID"
                        disabled={loading}
                      />
                      <input
                        type="text"
                        value={profileData.stripe_account_status}
                        onChange={(e) => handleProfileInputChange('stripe_account_status', e.target.value)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#C47756] focus:ring-[#C47756]"
                        placeholder="Status (e.g., pending, active)"
                        disabled={loading}
                      />
                    </div>
                  ) : (
                    <button className="text-base font-normal text-blue-600 hover:text-blue-800 flex items-center gap-1">
                      <Building className="h-4 w-4" />
                      {profileData.stripe_account_id ? 'Connected' : 'Set up payouts'}
                    </button>
                  )}
                </div>
              )}

              <div className="pt-1">
                <p className="text-sm font-normal text-gray-500 mb-0.5">Role</p>
                <p className="text-base font-normal text-gray-900 capitalize">{user.role}</p>
              </div>
            </div>

            {user.role === 'admin' && (
              <div className="pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    navigate('/admin');
                  }}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors z-10"
                >
                  <Shield className="h-5 w-5" />
                  <span className="font-medium">Admin Dashboard</span>
                </button>
              </div>
            )}

            <div className="pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/property-admin');
                }}
                className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors z-10"
              >
                <Building className="h-5 w-5" />
                <span className="font-medium">My Property</span>
              </button>
            </div>

            <div className="flex justify-center pt-4">
              <button
                onClick={async () => {
                  await signOut();
                  setIsOpen(false);
                }}
                className="flex items-center space-x-2 text-red-600 hover:text-red-700 z-10"
                disabled={loading}
              >
                <LogOut className="h-5 w-5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          <div className="mt-6 pt-6">
            <h2 className="text-[1.65rem] text-gray-900 pb-4 border-b border-gray-200">
              Bookings
            </h2>
            
            {bookingError && (
              <div className="rounded-md bg-red-50 p-4 mt-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <p className="ml-3 text-sm text-red-700">{bookingError}</p>
                </div>
                <button
                  onClick={loadBookings}
                  className="mt-2 text-sm text-red-600 hover:text-red-500"
                >
                  Try again
                </button>
              </div>
            )}
            
            {bookingsLoading ? (
              <div className="flex justify-center py-12">
                <div className="space-y-2 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#C47756] mx-auto" />
                  <p className="text-sm text-gray-500">Loading bookings...</p>
                </div>
              </div>
            ) : !bookingError && bookings.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No bookings found.</p>
              </div>
            ) : !bookingError ? (
              <UserBookings
                bookings={bookings}
                onUpdateStatus={user.role === 'admin' ? handleUpdateBookingStatus : undefined}
                onRefund={user.role === 'admin' ? handleRefund : undefined}
              />
            ) : null}
          </div>
        </div>
      </div>
      )}
    </>
  );
}