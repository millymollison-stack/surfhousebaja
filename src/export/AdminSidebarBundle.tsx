/**
 * AdminSidebar — Integrated into New Site Template
 * Uses app's store/auth.ts, lib/supabase.ts, store/property.ts, types/index.ts
 */

import './components/sidebar.css';

import React, { useState, useEffect, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, fromUnixTime, addDays } from 'date-fns';
import {
  ChevronRight, ChevronDown, X, LogOut, ExternalLink, Check,
  Clock, CreditCard, AlertCircle, XCircle, CheckCircle, MapPin, Eye, EyeOff,
  Mail, Phone, User, MessageSquare, Home,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './store/auth';
import { useProperty } from './store/property';
import type { Profile, Booking, Property } from './types';

// ─────────────────────────────────────────────
// SECTION 1 — Extended Profile (app type + services fields)
// ─────────────────────────────────────────────

type ServiceKey = 'aiSeo' | 'marketing' | 'advertising' | 'analytics' | 'influencers' | 'social';

export type BookingStatus = 'pending' | 'approved' | 'denied' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded' | 'failed';

// Extend the app's Profile type to include services fields used by this sidebar
export interface SidebarServicesProfile extends Profile {
  services_ai_seo?: boolean;
  services_marketing?: boolean;
  services_advertising?: boolean;
  services_analytics?: boolean;
  services_influencers?: boolean;
  services_social?: boolean;
}

// ─────────────────────────────────────────────
// SECTION 2 — AuthProvider (no-op — app's auth already initialises)
// ─────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // App's store/auth.ts AuthProvider handles initialisation — do nothing here
  return <>{children}</>;
}

// ─────────────────────────────────────────────
// SECTION 3 — Shared UI primitives
// ─────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${checked ? 'bg-green-500' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-[17px] w-[17px] transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center py-6">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

function InlineLoader() {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map(i => (
        <div key={i} className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

function EditField({ label, value, isEditing, onChange, type = 'text' }: {
  label: string; value: string; isEditing: boolean; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      {isEditing
        ? <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full text-base font-bold text-gray-900 bg-white border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:border-gray-500" />
        : <p className="text-base font-bold text-gray-900">{value || '—'}</p>
      }
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
    : <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
}

// ─────────────────────────────────────────────
// SECTION 4 — UserBookings sub-component
// ─────────────────────────────────────────────

interface UserBookingsProps {
  bookings: (Booking & { property: Property; user: Profile })[];
  onUpdateStatus?: (bookingId: string, status: 'approved' | 'denied', reason?: string) => Promise<void>;
  onRefund?: (bookingId: string) => Promise<void>;
}

const UserBookings = memo(function UserBookings({ bookings, onUpdateStatus, onRefund }: UserBookingsProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [denialReason, setDenialReason] = useState('');
  const [showDenialModal, setShowDenialModal] = useState<string | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRefunding, setIsRefunding] = useState<string | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => { if (!isAdmin) loadAdminProfile(); }, [isAdmin]);

  const loadAdminProfile = async () => {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('role', 'admin').limit(1).single();
      if (data) setAdminProfile(data);
    } catch { /* silent */ }
  };

  const handleStatusUpdate = async (bookingId: string, status: 'approved' | 'denied', reason?: string) => {
    if (!onUpdateStatus) return;
    setIsUpdating(true);
    try { await onUpdateStatus(bookingId, status, reason); }
    catch (e) { console.error(e); }
    finally { setIsUpdating(false); }
  };

  const handleRefund = async (bookingId: string) => {
    if (!onRefund) return;
    if (!confirm('Are you sure you want to refund this booking? This action cannot be undone.')) return;
    setIsRefunding(bookingId);
    try { await onRefund(bookingId); alert('Refund processed successfully'); }
    catch { alert('Failed to process refund. Please try again.'); }
    finally { setIsRefunding(null); }
  };

  const filteredBookings = useMemo(() => {
    if (statusFilter === 'all') return bookings;
    return bookings.filter(b => b.status === statusFilter);
  }, [bookings, statusFilter]);

  const statusBadge = (status: string) => {
    const cfg: Record<string, { icon: any; bg: string; text: string }> = {
      approved: { icon: Check, bg: 'bg-green-100', text: 'text-green-800' },
      denied: { icon: X, bg: 'bg-red-100', text: 'text-red-800' },
      cancelled: { icon: X, bg: 'bg-gray-100', text: 'text-gray-800' },
      pending: { icon: Clock, bg: 'bg-yellow-100', text: 'text-yellow-800' },
    };
    const { icon: Icon, bg, text } = cfg[status] || cfg.pending;
    return <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${bg} ${text}`}><Icon className="w-4 h-4 mr-1.5" />{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
  };

  const paymentBadge = (ps: PaymentStatus) => {
    const cfg: Record<string, { icon: any; bg: string; text: string; label: string }> = {
      paid: { icon: Check, bg: 'bg-green-100', text: 'text-green-800', label: 'Paid' },
      pending: { icon: Clock, bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Payment Pending' },
      unpaid: { icon: AlertCircle, bg: 'bg-gray-100', text: 'text-gray-800', label: 'Unpaid' },
      refunded: { icon: CreditCard, bg: 'bg-blue-100', text: 'text-blue-800', label: 'Refunded' },
      failed: { icon: X, bg: 'bg-red-100', text: 'text-red-800', label: 'Payment Failed' },
    };
    const { icon: Icon, bg, text, label } = cfg[ps] || cfg.unpaid;
    return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${bg} ${text}`}><Icon className="w-3.5 h-3.5 mr-1" />{label}</span>;
  };

  if (!bookings.length) return <div className="text-center py-12"><p className="text-gray-500">No bookings found.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-center pt-6">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-48 text-base border-gray-300 rounded-md shadow-sm">
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div className="divide-y divide-gray-200">
        {filteredBookings.map(booking => (
          <div key={booking.id} className="py-4">
            <div className="flex justify-center items-center gap-2 mb-4 flex-wrap">
              {statusBadge(booking.status)}
              {paymentBadge(booking.payment_status)}
            </div>
            {isAdmin ? (
              <div className="space-y-2">
                <div className="flex items-center"><User className="h-5 w-5 text-gray-400 mr-2" /><span className="font-medium">{booking.user?.full_name || 'Unknown User'}</span></div>
                <div className="flex items-center text-sm text-gray-600"><Mail className="h-4 w-4 text-gray-400 mr-2" />{booking.user?.email || 'No email'}</div>
                <div className="flex items-center text-sm text-gray-600"><Phone className="h-4 w-4 text-gray-400 mr-2" />{booking.user?.phone_number || 'No phone'}</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center"><Home className="h-5 w-5 text-gray-400 mr-2" /><span className="font-medium">{booking.property?.title || 'Property'}</span></div>
                <div className="text-sm text-gray-600">
                  <div className="flex items-center"><User className="h-4 w-4 text-gray-400 mr-2" />{adminProfile?.full_name || 'Property Manager'}</div>
                  <div className="flex items-center mt-1"><Mail className="h-4 w-4 text-gray-400 mr-2" />{adminProfile?.email || 'contact@property.com'}</div>
                  <div className="flex items-center mt-1"><Phone className="h-4 w-4 text-gray-400 mr-2" />{adminProfile?.phone_number || ''}</div>
                </div>
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><dt className="font-medium text-gray-500">Check-in</dt><dd className="mt-1 text-gray-900">{format(new Date(booking.start_date), 'MMM d, yyyy')}<div className="text-xs text-gray-500">3:00 PM</div></dd></div>
              <div><dt className="font-medium text-gray-500">Check-out</dt><dd className="mt-1 text-gray-900">{format(addDays(new Date(booking.end_date), 1), 'MMM d, yyyy')}<div className="text-xs text-gray-500">11:00 AM</div></dd></div>
              <div><dt className="font-medium text-gray-500">Total</dt><dd className="mt-1 text-gray-900">${booking.total_price}<span className="text-gray-500 text-xs ml-1">({booking.guest_count} {booking.guest_count === 1 ? 'guest' : 'guests'})</span></dd></div>
              <div><dt className="font-medium text-gray-500">Amount Paid</dt><dd className="mt-1 text-gray-900">{booking.amount_paid ? `$${(booking.amount_paid / 100).toFixed(2)}` : '—'}</dd></div>
            </div>
            {booking.special_requests && (
              <div className="mt-4"><dt className="text-sm font-medium text-gray-500 flex items-center"><MessageSquare className="h-4 w-4 mr-1" />Special Requests</dt><dd className="mt-1 text-sm text-gray-900">{booking.special_requests}</dd></div>
            )}
            {isAdmin && booking.status === 'pending' && (
              <div className="mt-4 flex justify-center space-x-3">
                <button onClick={() => handleStatusUpdate(booking.id, 'approved')} disabled={isUpdating} className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"><Check className="h-4 w-4 mr-1" />{isUpdating ? 'Updating...' : 'Approve'}</button>
                <button onClick={() => setShowDenialModal(booking.id)} disabled={isUpdating} className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"><X className="h-4 w-4 mr-1" />Deny</button>
              </div>
            )}
            {isAdmin && booking.status === 'denied' && booking.payment_status === 'paid' && (
              <div className="mt-4 flex justify-center">
                <button onClick={() => handleRefund(booking.id)} disabled={isRefunding === booking.id} className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"><CreditCard className="h-4 w-4 mr-1" />{isRefunding === booking.id ? 'Processing...' : 'Process Refund'}</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {showDenialModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowDenialModal(null)} />
            <div className="relative inline-block bg-white rounded-lg px-4 pt-5 pb-4 text-left shadow-xl sm:my-8 sm:max-w-lg sm:w-full sm:p-6">
              <h3 className="text-lg font-medium text-gray-900 text-center">Provide Reason for Denial</h3>
              <textarea rows={4} className="mt-4 block w-full rounded-md border-gray-300 shadow-sm text-sm" placeholder="Enter reason for denying the booking..." value={denialReason} onChange={e => setDenialReason(e.target.value)} />
              <div className="mt-5 sm:grid sm:grid-cols-2 sm:gap-3">
                <button disabled={isUpdating} className="w-full inline-flex justify-center rounded-md px-4 py-2 bg-red-600 text-white text-sm font-medium hover:bg-red-700 sm:col-start-2" onClick={() => { if (showDenialModal) { handleStatusUpdate(showDenialModal, 'denied', denialReason); setShowDenialModal(null); setDenialReason(''); } }}>{isUpdating ? 'Updating...' : 'Confirm Denial'}</button>
                <button disabled={isUpdating} className="mt-3 sm:mt-0 w-full inline-flex justify-center rounded-md border border-gray-300 px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50" onClick={() => { setShowDenialModal(null); setDenialReason(''); }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────
// SECTION 5 — Section sub-components
// ─────────────────────────────────────────────

interface StripeConnectData {
  account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  business_name: string;
  email: string;
  available_balance: number;
  pending_balance: number;
  currency: string;
}

interface SubscriptionData {
  id: string;
  status: string;
  plan: string;
  amount: number;
  interval: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
}

function googleMapsUrl(address: string, lat: string, lng: string): string {
  if (lat && lng) return `https://www.google.com/maps?q=${lat},${lng}`;
  if (address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return '';
}

function PropertySection({ property, imageCount, isEditing, fields, onChange }: {
  property: Property | null;
  imageCount: number;
  isEditing: boolean;
  fields: { title: string; address: string; latitude: string; longitude: string };
  onChange: React.Dispatch<React.SetStateAction<{ title: string; address: string; latitude: string; longitude: string }>>;
}) {
  const mapsUrl = googleMapsUrl(fields.address, fields.latitude, fields.longitude);
  return (
    <div>
      <div className="sb-field-row">
        <h4 className="sb-field-label">Property name</p>
        {isEditing
          ? <input type="text" value={fields.title} onChange={e => onChange(p => ({ ...p, title: e.target.value }))} className="sb-input" />
          : <p className="sb-field-value">{fields.title || '—'}</p>}
      </div>
      <div className="sb-field-row">
        <h4 className="sb-field-label">Address</p>
        {isEditing
          ? <input type="text" value={fields.address} onChange={e => onChange(p => ({ ...p, address: e.target.value }))} className="sb-input" />
          : <p className="sb-field-value">{fields.address || '—'}</p>}
      </div>
      {isEditing ? (
        <>
          <div className="sb-field-row">
            <h4 className="sb-field-label">Latitude</p>
            <input type="text" value={fields.latitude} onChange={e => onChange(p => ({ ...p, latitude: e.target.value }))} className="sb-input" />
          </div>
          <div className="sb-field-row">
            <h4 className="sb-field-label">Longitude</p>
            <input type="text" value={fields.longitude} onChange={e => onChange(p => ({ ...p, longitude: e.target.value }))} className="sb-input" />
          </div>
        </>
      ) : (fields.latitude || fields.longitude) ? (
        <div className="sb-field-row">
          <h4 className="sb-field-label">Coordinates</p>
          <div className="flex items-center justify-between">
            <p className="sb-mono">{fields.latitude ? parseFloat(fields.latitude).toFixed(5) : '—'}, {fields.longitude ? parseFloat(fields.longitude).toFixed(5) : '—'}</p>
            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="sb-change-pw-btn" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin className="h-3.5 w-3.5" />Maps</a>}
          </div>
        </div>
      ) : null}
      {!isEditing && !fields.latitude && fields.address && mapsUrl && (
        <div className="sb-field-row" style={{ borderBottom: 'none' }}>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="sb-change-pw-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MapPin className="h-4 w-4" />Open in Google Maps<ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
      <div className="sb-field-row" style={{ borderBottom: 'none' }}>
        <h4 className="sb-field-label">Uploaded photos</p>
        <p className="sb-field-value">{imageCount}</p>
      </div>
    </div>
  );
}

function WebsiteSection({ hostOnHostinger, setHostOnHostinger, devUpdates, setDevUpdates }: {
  hostOnHostinger: boolean; setHostOnHostinger: (v: boolean) => void;
  devUpdates: boolean; setDevUpdates: (v: boolean) => void;
}) {
  const siteUrl = 'www.propbook.pro/surfhousebaja';
  return (
    <div>
      <div className="sb-toggle-row">
        <p className="sb-toggle-label">Host website on Hostinger</p>
        <Toggle checked={hostOnHostinger} onChange={setHostOnHostinger} />
      </div>
      <div className="sb-toggle-row">
        <p className="sb-toggle-label">{siteUrl}</p>
        <a href={`https://${siteUrl}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" style={{ color: '#16a34a' }} /></a>
      </div>
      <div className="sb-field-row">
        <p className="sb-dns-hint">Point your custom domain DNS here</p>
        <p className="sb-dns-label">Set an A record or CNAME to this address</p>
        <p className="sb-mono" style={{ marginTop: 4 }}>76.76.21.21</p>
        <p className="sb-dns-label">CNAME: cname.propbook.pro</p>
      </div>
      <div className="sb-toggle-row">
        <p className="sb-toggle-label">Search for a domain</p>
        <a href="https://www.namecheap.com" target="_blank" rel="noopener noreferrer" className="sb-change-pw-btn" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Namecheap <ExternalLink className="h-3 w-3" /></a>
      </div>
      <div className="sb-toggle-row">
        <p className="sb-toggle-label">Enable website dev updates</p>
        <Toggle checked={devUpdates} onChange={setDevUpdates} />
      </div>
      <div className="sb-field-row" style={{ borderBottom: 'none' }}>
        <h4 className="sb-field-label">Dev notifications</p>
        <p className="sb-field-value">0</p>
      </div>
    </div>
  );
}

function ContactSection({ user, isEditing, fields, onChange }: {
  user: Profile; isEditing: boolean;
  fields: { full_name: string; email: string; phone_number: string };
  onChange: React.Dispatch<React.SetStateAction<{ full_name: string; email: string; phone_number: string }>>;
}) {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    if (!isEditing) { setShowPasswordForm(false); setOldPassword(''); setNewPassword(''); setPwError(null); setPwSuccess(false); }
  }, [isEditing]);

  const handlePasswordChange = async () => {
    if (!oldPassword || !newPassword) { setPwError('Both fields are required.'); return; }
    if (newPassword.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    setPwSaving(true); setPwError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPassword });
      if (signInError) throw new Error('Current password is incorrect.');
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setPwSuccess(true); setOldPassword(''); setNewPassword('');
      setTimeout(() => { setShowPasswordForm(false); setPwSuccess(false); }, 2500);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally { setPwSaving(false); }
  };

  return (
    <div>
      <div className="py-3 border-b border-gray-100">
        <p className="text-xs text-gray-500 mb-0.5">Role</p>
        <p className="text-base text-gray-900"><span className="font-bold">Super Host</span><span className="font-normal text-gray-500"> (New Site Admin)</span></p>
      </div>
      <div className="sb-field-row">
        <p className="text-xs text-gray-500 mb-0.5">Role</p>
        <p className="text-base text-gray-900"><span className="font-bold">Super Host</span><span className="font-normal text-gray-500"> (New Site Admin)</span></p>
      </div>
      <div className="sb-field-row">
        <h4 className="sb-field-label">Name</p>
        {isEditing
          ? <input type="text" value={fields.full_name} onChange={e => onChange(p => ({ ...p, full_name: e.target.value }))} className="sb-input" />
          : <p className="sb-field-value">{fields.full_name || '—'}</p>}
      </div>
      <div className="sb-field-row">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="sb-field-label" style={{ marginBottom: 0 }}>Email</p>
          <span className="sb-verified-badge">Verified</span>
        </div>
        <p className="sb-field-value">{user.email}</p>
      </div>
      <div className="sb-field-row">
        <h4 className="sb-field-label">Tel</p>
        {isEditing
          ? <input type="tel" value={fields.phone_number} onChange={e => onChange(p => ({ ...p, phone_number: e.target.value }))} className="sb-input" />
          : <p className="sb-field-value">{fields.phone_number || '—'}</p>}
      </div>
      <div className="py-3 last:border-0">
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-xs text-gray-500">Password</p>
          {isEditing && !showPasswordForm && <button onClick={() => setShowPasswordForm(true)} className="text-xs text-green-600 hover:text-green-700 font-semibold">Change</button>}
        </div>
        {!isEditing || !showPasswordForm ? (
          <p className="text-base font-bold text-gray-900">••••••••</p>
        ) : (
          <div className="mt-2 space-y-2">
            {pwSuccess ? (
              <div className="flex items-center gap-2 bg-green-50 rounded-lg px-3 py-2"><CheckCircle className="h-4 w-4 text-green-600" /><p className="text-sm font-semibold text-green-700">Password updated!</p></div>
            ) : (
              <>
                <div className="relative">
                  <input type={showOld ? 'text' : 'password'} value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder="Current password" className="w-full text-sm text-gray-900 bg-white border border-gray-300 rounded-md px-3 py-2 pr-9 focus:outline-none focus:border-gray-500" />
                  <button type="button" onClick={() => setShowOld(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </div>
                <div className="relative">
                  <input type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (min 8 characters)" className="w-full text-sm text-gray-900 bg-white border border-gray-300 rounded-md px-3 py-2 pr-9 focus:outline-none focus:border-gray-500" />
                  <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </div>
                {pwError && <p className="text-xs text-red-600">{pwError}</p>}
                <div className="flex gap-2">
                  <button onClick={handlePasswordChange} disabled={pwSaving} className="flex-1 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg py-2 disabled:opacity-50">{pwSaving ? 'Updating...' : 'Update Password'}</button>
                  <button onClick={() => { setShowPasswordForm(false); setPwError(null); setOldPassword(''); setNewPassword(''); }} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">Cancel</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BankingSection({ balance, connectData, connectLoading, connectOnboarding, payoutLoading, payoutSuccess, onOnboard, onRequestPayout }: {
  balance: number; connectData: StripeConnectData | null; connectLoading: boolean;
  connectOnboarding: boolean; payoutLoading: boolean; payoutSuccess: boolean;
  onOnboard: () => void; onRequestPayout: () => void;
}) {
  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const platformFee = connectData ? Math.round(connectData.available_balance * 0.02) : 0;
  const payoutAmount = connectData ? connectData.available_balance - platformFee : 0;
  return (
    <div>
      <div className="py-3 border-b border-gray-100">
        <p className="text-xs text-gray-500 mb-0.5">Total Booking Revenue to Date</p>
        <p className="text-base font-bold text-gray-900">${balance.toLocaleString()}</p>
      </div>
      <div className="py-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-500">Stripe Payout Account</p>
          {connectLoading && <InlineLoader />}
        </div>
        {connectData ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">{connectData.business_name || connectData.email}</p>
                <p className="text-xs text-gray-400 mt-0.5">{connectData.account_id}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${connectData.charges_enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{connectData.charges_enabled ? 'Charges On' : 'Setup Required'}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${connectData.payouts_enabled ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{connectData.payouts_enabled ? 'Payouts On' : 'Payouts Pending'}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-lg p-2.5"><p className="text-xs text-gray-500 mb-0.5">Available</p><p className="text-base font-bold text-gray-900">{fmt(connectData.available_balance)}</p></div>
              <div className="bg-gray-50 rounded-lg p-2.5"><p className="text-xs text-gray-500 mb-0.5">Pending</p><p className="text-base font-bold text-gray-900">{fmt(connectData.pending_balance)}</p></div>
            </div>
            {connectData.available_balance > 0 && connectData.payouts_enabled && (
              <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-600">Available balance</span><span className="font-semibold text-gray-900">{fmt(connectData.available_balance)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Platform fee (2%)</span><span className="text-gray-500">− {fmt(platformFee)}</span></div>
                <div className="border-t border-gray-100 pt-2 flex justify-between text-sm"><span className="font-bold text-gray-900">You receive</span><span className="font-bold text-green-700">{fmt(payoutAmount)}</span></div>
                {payoutSuccess
                  ? <div className="flex items-center justify-center gap-2 bg-green-50 rounded-lg py-2"><CheckCircle className="h-4 w-4 text-green-600" /><span className="text-sm font-semibold text-green-700">Payout initiated!</span></div>
                  : <button onClick={onRequestPayout} disabled={payoutLoading} className="w-full bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg py-2 disabled:opacity-50">{payoutLoading ? 'Processing...' : 'Request Payout'}</button>
                }
              </div>
            )}
            {!connectData.details_submitted && (
              <button onClick={onOnboard} disabled={connectOnboarding} className="w-full border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg py-2 disabled:opacity-50">{connectOnboarding ? 'Redirecting...' : 'Complete Account Setup'}</button>
            )}
          </div>
        ) : connectLoading ? <Loader /> : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Connect a Stripe account to receive payouts when guests book your property. We take a 2% platform fee on each payout.</p>
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-700 mb-1">Test mode</p>
              <p className="text-xs text-gray-500">Use test card <span className="font-mono font-bold">4242 4242 4242 4242</span> during onboarding.</p>
            </div>
            <button onClick={onOnboard} disabled={connectOnboarding} className="w-full bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg py-2.5 disabled:opacity-50 flex items-center justify-center gap-2">
              <CreditCard className="h-4 w-4" />{connectOnboarding ? 'Redirecting to Stripe...' : 'Set Up Payout Account'}
            </button>
          </div>
        )}
      </div>
      <div className="py-3">
        <p className="text-xs text-gray-500 mb-1">Publishable Key</p>
        <p className="text-xs font-mono text-gray-700 break-all bg-gray-50 rounded px-2 py-1">{import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.slice(0, 24)}…</p>
      </div>
    </div>
  );
}

const SERVICE_LIST: { key: ServiceKey; label: string; price: string }[] = [
  { key: 'aiSeo', label: 'AI SEO', price: '$10 p/m' },
  { key: 'marketing', label: 'Marketing', price: '$10 p/m' },
  { key: 'advertising', label: 'Advertising', price: '$20 p/m' },
  { key: 'analytics', label: 'Analytics', price: '$10 p/m' },
  { key: 'influencers', label: 'Influencers', price: '$50 p/m' },
  { key: 'social', label: 'Social', price: '$50 p/m' },
];

function ServicesSection({ services, onToggle }: { services: Record<ServiceKey, boolean>; onToggle: (key: ServiceKey, val: boolean) => void }) {
  return (
    <div>
      <p className="sb-services-desc">Limited availability. Our team of experts work directly on your property marketing and services.</p>
      {SERVICE_LIST.map(({ key, label, price }) => (
        <div key={key} className="sb-service-row">
          <div className="sb-service-info"><p className="sb-service-name">{label}</p><p className="sb-service-price">{price}</p></div>
          <Toggle checked={services[key]} onChange={val => onToggle(key, val)} />
        </div>
      ))}
    </div>
  );
}

const PLANS = [
  { key: 'starter' as const, name: 'Starter', price: 29, features: ['1 property listing', 'Direct booking calendar', 'Guest messaging', 'Basic analytics'] },
  { key: 'growth' as const, name: 'Growth', price: 79, features: ['Up to 3 properties', 'Everything in Starter', 'AI SEO tools', 'Marketing toolkit'], popular: true },
  { key: 'pro' as const, name: 'Pro', price: 149, features: ['Unlimited properties', 'Everything in Growth', 'Influencer network', 'Priority support'] },
];

function SubscriptionSection({ subscription, loading, checkoutLoading, onSubscribe }: {
  subscription: SubscriptionData | null; loading: boolean;
  checkoutLoading: string | null; onSubscribe: (plan: 'starter' | 'growth' | 'pro') => void;
}) {
  if (loading && !subscription) return <Loader />;
  if (subscription?.status === 'active') {
    return (
      <div>
        <div className="py-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-0.5"><p className="text-xs text-gray-500">Plan</p><span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span></div>
          <p className="text-base font-bold text-gray-900">{subscription.plan}</p>
        </div>
        <div className="py-3 grid grid-cols-2 gap-4 border-b border-gray-100">
          <div><p className="text-xs text-gray-500 mb-0.5">Amount</p><p className="text-base font-bold text-gray-900">${(subscription.amount / 100).toFixed(2)}<span className="text-sm font-normal text-gray-500">/{subscription.interval}</span></p></div>
          <div><p className="text-xs text-gray-500 mb-0.5">Next Payment</p><p className="text-base font-bold text-gray-900">{format(fromUnixTime(subscription.current_period_end), 'MMM d, yyyy')}</p></div>
        </div>
        {subscription.cancel_at_period_end && <div className="py-3"><div className="flex items-center gap-2 text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2"><AlertCircle className="h-4 w-4" /><p className="text-xs font-medium">Cancels at end of billing period</p></div></div>}
        <div className="py-3"><p className="text-xs text-gray-500 mb-0.5">Subscription ID</p><p className="text-xs font-mono text-gray-600 break-all">{subscription.id}</p></div>
      </div>
    );
  }
  return (
    <div>
      <p className="sb-sub-desc">Choose a plan to go live with your property and unlock all platform features.</p>
      <div className="bg-blue-50 rounded-lg p-3 mb-4">
        <p className="text-xs font-semibold text-gray-700 mb-1">Test mode</p>
        <p className="text-xs text-gray-500">Use card <span className="font-mono font-bold">4242 4242 4242 4242</span>, any future expiry, any 3-digit CVC. Checkout opens in a new tab in dev.</p>
      </div>
      <div className="space-y-3">
        {PLANS.map(plan => (
          <div key={plan.key} className={`sb-plan-card${plan.popular ? ' is-popular' : ''}`}>
            {plan.popular && <span className="sb-plan-badge">Most Popular</span>}
            <div className="sb-plan-header">
              <div><p className="sb-plan-name">{plan.name}</p><p className="sb-plan-price">${plan.price}<span className="text-xs">/month</span></p></div>
              <button onClick={() => onSubscribe(plan.key)} disabled={checkoutLoading === plan.key} className={`text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${plan.popular ? 'bg-gray-900 hover:bg-gray-800 text-white' : 'border border-gray-300 hover:bg-gray-50 text-gray-700'}`}>{checkoutLoading === plan.key ? 'Loading...' : 'Subscribe'}</button>
            </div>
            <ul className="sb-plan-features">{plan.features.map(f => <li key={f}><Check className="h-3 w-3" />{f}</li>)}</ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SECTION 6 — AdminSidebar (main export)
// ─────────────────────────────────────────────

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  mockMode?: boolean;
}

type Section = 'bookings' | 'property' | 'website' | 'contact' | 'banking' | 'services' | 'subscription';

interface NextBooking {
  guestName: string; location: string; guestCount: number; nights: number;
  startDay: number; endDay: number; month: string; status: string;
}

export function AdminSidebar({ isOpen, onClose, mockMode = false }: AdminSidebarProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const setPropertyTitle = useProperty(s => s.setTitle);

  const [openSection, setOpenSection] = useState<Section | null>(null);
  const [bookingCardOpen, setBookingCardOpen] = useState(false);
  const [showCredentials, setShowCredentials] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [bookings, setBookings] = useState<(Booking & { property: Property; user: Profile })[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [nextBooking, setNextBooking] = useState<NextBooking | null>(null);
  const [balance, setBalance] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [property, setProperty] = useState<Property | null>(null);

  const [connectData, setConnectData] = useState<StripeConnectData | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectOnboarding, setConnectOnboarding] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutSuccess, setPayoutSuccess] = useState(false);

  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const [propFields, setPropFields] = useState({ title: '', address: '', latitude: '', longitude: '' });
  const [contactFields, setContactFields] = useState({ full_name: '', email: '', phone_number: '' });
  const [hostOnHostinger, setHostOnHostinger] = useState(true);
  const [devUpdates, setDevUpdates] = useState(true);
  const [services, setServicesState] = useState<Record<ServiceKey, boolean>>({ aiSeo: true, marketing: true, advertising: true, analytics: true, influencers: true, social: true });
  const [servicesLoaded] = useState(false);

  useEffect(() => { if (isOpen && user) loadData(); }, [isOpen, user]);

  const loadData = async () => {
    if (!user) return;
    setBookingsLoading(true);
    try {
      const [bookingsRes, imagesRes, propRes, profileRes] = await Promise.all([
        supabase.from('bookings').select('*, property:properties(*), user:profiles(*)').order('created_at', { ascending: false }),
        supabase.from('property_images').select('id'),
        supabase.from('properties').select('*').limit(1).maybeSingle(),
        supabase.from('profiles').select('services_ai_seo, services_marketing, services_advertising, services_analytics, services_influencers, services_social').eq('id', user.id).maybeSingle(),
      ]);

      if (bookingsRes.data) {
        const valid = bookingsRes.data.filter(b => b && b.property);
        setBookings(valid);
        const totalRevenue = valid.filter(b => b.status === 'approved' || b.payment_status === 'paid').reduce((sum, b) => sum + (b.total_price || 0), 0);
        setBalance(totalRevenue);
        const now = new Date();
        const pending = valid.filter(b => b.status === 'pending').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        const upcoming = valid.filter(b => b.status === 'approved' && new Date(b.start_date) >= now).sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())[0];
        const featured = pending || upcoming;
        if (featured) {
          const [sy, sm, sd] = featured.start_date.slice(0, 10).split('-').map(Number);
          const [, , ed] = featured.end_date.slice(0, 10).split('-').map(Number);
          const start = new Date(sy, sm - 1, sd);
          const endDate = new Date(featured.end_date.slice(0, 10).split('-').map(Number) as [number, number, number]);
          const nights = Math.ceil(Math.abs(endDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          setNextBooking({ guestName: featured.user?.full_name || 'Guest', location: featured.property?.address || featured.property?.title || '', guestCount: featured.guest_count, nights, startDay: sd, endDay: ed, month: format(start, 'MMM').toUpperCase(), status: featured.status });
        } else setNextBooking(null);
      }
      if (imagesRes.data) setImageCount(imagesRes.data.length);
      if (propRes.data) {
        setProperty(propRes.data);
        setPropFields({ title: propRes.data.title || '', address: propRes.data.address || '', latitude: propRes.data.latitude?.toString() || '', longitude: propRes.data.longitude?.toString() || '' });
      }
      if (profileRes.data) {
        setServicesState({ aiSeo: profileRes.data.services_ai_seo ?? true, marketing: profileRes.data.services_marketing ?? true, advertising: profileRes.data.services_advertising ?? true, analytics: profileRes.data.services_analytics ?? true, influencers: profileRes.data.services_influencers ?? true, social: profileRes.data.services_social ?? true });
      }
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Failed to load data');
    } finally { setBookingsLoading(false); }
  };

  useEffect(() => {
    if (user) setContactFields({ full_name: user.full_name || '', email: user.email || '', phone_number: user.phone_number || '' });
  }, [user]);

  const saveServices = async (updated: Record<ServiceKey, boolean>) => {
    if (!user) return;
    await supabase.from('profiles').update({ services_ai_seo: updated.aiSeo, services_marketing: updated.marketing, services_advertising: updated.advertising, services_analytics: updated.analytics, services_influencers: updated.influencers, services_social: updated.social }).eq('id', user.id);
  };

  const handleServiceToggle = (key: ServiceKey, val: boolean) => {
    const updated = { ...services, [key]: val };
    setServicesState(updated);
    saveServices(updated);
  };

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No session');
    return session;
  };

  const loadConnectData = async () => {
    if (connectData || connectLoading) return;
    setConnectLoading(true);
    try {
      const session = await getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-connect`, { headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConnectData(data);
    } catch (err) { console.error(err); } finally { setConnectLoading(false); }
  };

  const loadSubscriptionData = async () => {
    if (subscriptionData || subLoading) return;
    setSubLoading(true);
    try {
      const session = await getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-subscription?action=get`, { headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } });
      const data = await res.json();
      if (res.ok && data.subscription) setSubscriptionData(data.subscription);
    } catch (err) { console.error(err); } finally { setSubLoading(false); }
  };

  const handleConnectOnboard = async () => {
    setConnectOnboarding(true);
    try {
      const session = await getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-connect`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ action: 'create_account_link', return_url: window.location.href }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch { alert('Failed to start Stripe onboarding. Please try again.'); } finally { setConnectOnboarding(false); }
  };

  const handleRequestPayout = async () => {
    if (!connectData || connectData.available_balance <= 0) return;
    setPayoutLoading(true);
    try {
      const session = await getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-connect`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ action: 'payout' }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPayoutSuccess(true); setConnectData(null);
      setTimeout(() => { setPayoutSuccess(false); loadConnectData(); }, 3000);
    } catch { alert('Payout failed. Please try again.'); } finally { setPayoutLoading(false); }
  };

  const handleSubscribeCheckout = async (plan: 'starter' | 'growth' | 'pro') => {
    setCheckoutLoading(plan);
    try {
      const session = await getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-subscription`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ action: 'create_checkout', plan, return_url: window.location.href }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch { alert('Failed to start checkout. Please try again.'); } finally { setCheckoutLoading(null); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saves: Promise<unknown>[] = [];
      if (property) saves.push(supabase.from('properties').update({ title: propFields.title, address: propFields.address || null, latitude: propFields.latitude ? parseFloat(propFields.latitude) : null, longitude: propFields.longitude ? parseFloat(propFields.longitude) : null }).eq('id', property.id));
      if (user) saves.push(supabase.from('profiles').update({ full_name: contactFields.full_name || null, phone_number: contactFields.phone_number || null }).eq('id', user.id));
      await Promise.all(saves);
      if (propFields.title) setPropertyTitle(propFields.title);
      await loadData();
      setIsEditing(false);
    } catch (err) { console.error('Save failed', err); } finally { setSaving(false); }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: 'approved' | 'denied', reason?: string) => {
    if (!user || user.role !== 'admin') return;
    setBookingsLoading(true);
    try {
      const { error } = await supabase.from('bookings').update({ status, updated_at: new Date().toISOString(), ...(reason ? { denial_reason: reason } : {}) }).eq('id', bookingId);
      if (error) throw error;
      await loadData();
    } catch (err) { setBookingError(err instanceof Error ? err.message : 'Failed to update booking'); } finally { setBookingsLoading(false); }
  };

  const handleRefund = async (bookingId: string) => {
    if (!user || user.role !== 'admin') return;
    setBookingsLoading(true);
    try {
      const session = await getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-refund`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ bookingId }) });
      if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Refund failed'); }
      await loadData();
    } catch (err) { setBookingError(err instanceof Error ? err.message : 'Refund failed'); throw err; } finally { setBookingsLoading(false); }
  };

  const toggleSection = (section: Section) => {
    if (section === 'bookings') { onClose(); navigate('/admin'); return; }
    const next = openSection === section ? null : section;
    setOpenSection(next);
    if (next === 'banking') loadConnectData();
    if (next === 'subscription') loadSubscriptionData();
  };

  const navItems: { key: Section; label: string }[] = [
    { key: 'property', label: 'Property' },
    { key: 'website', label: 'Website' },
    { key: 'contact', label: 'Contact' },
    { key: 'banking', label: 'Banking' },
    { key: 'services', label: 'Services' },
    { key: 'subscription', label: 'Subscription' },
  ];

  const mockBooking: NextBooking = { guestName: 'Sarah Johnson', location: 'Surf House Baja, Ensenada', guestCount: 4, nights: 5, startDay: 14, endDay: 19, month: 'JUN', status: 'approved' };
  const displayBooking = mockMode ? mockBooking : nextBooking;
  const displayUser = user ?? (mockMode ? { email: 'david@example.com', full_name: 'David', role: 'admin' } as Profile : null);

  if (!displayUser) return null;

  const isPending = displayBooking?.status === 'pending';
  const hasStripeAccount = !!(connectData?.charges_enabled && connectData?.payouts_enabled);
  const hasWebsite = hostOnHostinger;
  const hasEmail = !!displayUser.email;
  const hasSubscription = !!(subscriptionData?.status === 'active');

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <div className={`sidebar-panel ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="sidebar-header">
          <h1 className="hero-title hero-title-edit">Profile</h1>
          <div className="sidebar-header-actions">
            <button onClick={() => isEditing ? handleSave() : setIsEditing(true)} disabled={saving} className="sidebar-btn-edit">{saving ? 'Saving...' : isEditing ? 'Done' : 'Edit'}</button>
            {isEditing && <button onClick={() => setIsEditing(false)} className="sidebar-btn-cancel">Cancel</button>}
            <button onClick={onClose} className="sidebar-btn-close"><X className="h-6 w-6" /></button>
          </div>
        </div>

        <div className="sidebar-content">
          {/* Next Booking Card */}
          <div className="sb-next-booking">
            <button onClick={() => setBookingCardOpen(prev => !prev)} className="w-full text-left p-4" style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
              {bookingsLoading && !displayBooking ? (
                <div className="flex justify-center py-3"><InlineLoader /></div>
              ) : displayBooking ? (
                <div className="flex items-center justify-between">
                  <div className="flex-1 flex flex-col justify-center space-y-1 text-center pr-3">
                    <p className="sb-booking-guest">{displayBooking.guestName}</p>
                    {displayBooking.location && <p className="sb-booking-location">{displayBooking.location}</p>}
                    <p className="sb-booking-meta-row">{displayBooking.guestCount} {displayBooking.guestCount === 1 ? 'Guest' : 'Guests'} · {displayBooking.nights} Night{displayBooking.nights !== 1 ? 's' : ''}</p>
                    <div className="flex justify-center">
                      <span className={`sb-booking-status ${isPending ? 'is-pending' : 'is-approved'}`}>
                        {isPending ? <Clock className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        {displayBooking.status.charAt(0).toUpperCase() + displayBooking.status.slice(1)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="booking-callout flex-shrink-0">
                      <div className="callout-top"><p className="callout-start-num">{displayBooking.startDay}</p></div>
                      <div className="callout-mid"><p className="callout-end-num">{displayBooking.endDay}</p></div>
                      <div className={`callout-month ${isPending ? 'is-pending' : 'is-approved'}`}><span>{displayBooking.month}</span></div>
                    </div>
                    {bookingCardOpen ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between py-2">
                  <p className="text-sm text-gray-500">No upcoming bookings</p>
                  {bookingCardOpen ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
                </div>
              )}
            </button>
            {bookingCardOpen && (
              <div className="border-t border-gray-200">
                {bookingError ? <p className="text-sm text-red-600 p-4">{bookingError}</p> : <UserBookings bookings={bookings} onUpdateStatus={handleUpdateBookingStatus} onRefund={handleRefund} />}
              </div>
            )}
          </div>

          {/* Credentials Card */}
          {showCredentials && (
            <div className="sb-credentials">
              <button onClick={() => setShowCredentials(false)} className="sb-btn-close" style={{ position: 'absolute', top: 12, right: 12 }}><X className="h-4 w-4" /></button>
              <p className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Credentials</p>
              <div className="sb-credential-row">
                <div className="sb-credential-label"><StatusDot ok={hasStripeAccount} /><p className="sb-credential-name">Stripe Payout Account</p></div>
                {hasStripeAccount && <p className="sb-credential-balance">${balance.toLocaleString()}</p>}
              </div>
              <div className="sb-credential-row">
                <div className="sb-credential-label"><StatusDot ok={hasWebsite} /><p className="sb-credential-name">www.propbook.pro/surfhousebaja</p></div>
              </div>
              <div className="sb-credential-row">
                <div className="sb-credential-label"><StatusDot ok={hasEmail} /><p className="sb-credential-name">{displayUser.email}</p></div>
              </div>
              <div className="sb-credential-row">
                <div className="sb-credential-label"><StatusDot ok={hasSubscription} /><p className="sb-credential-name">Live Subscription</p></div>
                {hasSubscription && subscriptionData && <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full ml-2 whitespace-nowrap">{subscriptionData.plan}</span>}
              </div>
            </div>
          )}

          {/* Nav sections */}
          <div>
            {navItems.map(({ key, label }) => (
              <div key={key} className="sb-nav-section">
                <button onClick={() => toggleSection(key)} className="sb-nav-btn">
                  <span className="sb-nav-btn-label">{label}</span>
                  {openSection === key ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
                </button>
                {openSection === key && (
                  <div className="sb-section-body">
                    {key === 'property' && <PropertySection property={property} imageCount={imageCount} isEditing={isEditing} fields={propFields} onChange={setPropFields} />}
                    {key === 'website' && <WebsiteSection hostOnHostinger={hostOnHostinger} setHostOnHostinger={setHostOnHostinger} devUpdates={devUpdates} setDevUpdates={setDevUpdates} />}
                    {key === 'contact' && <ContactSection user={displayUser} isEditing={isEditing} fields={contactFields} onChange={setContactFields} />}
                    {key === 'banking' && <BankingSection balance={balance} connectData={connectData} connectLoading={connectLoading} connectOnboarding={connectOnboarding} payoutLoading={payoutLoading} payoutSuccess={payoutSuccess} onOnboard={handleConnectOnboard} onRequestPayout={handleRequestPayout} />}
                    {key === 'services' && <ServicesSection services={services} onToggle={handleServiceToggle} />}
                    {key === 'subscription' && <SubscriptionSection subscription={subscriptionData} loading={subLoading} checkoutLoading={checkoutLoading} onSubscribe={handleSubscribeCheckout} />}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Sign out */}
          <div className="pt-6 flex justify-center">
            <button onClick={async () => { await signOut(); onClose(); }} className="sidebar-signout">
              <LogOut className="h-4 w-4" /><span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}