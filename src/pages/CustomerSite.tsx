/**
 * CustomerSite — renders a customer's property site by slug
 * Loaded at /props/:slug — reads property data from Supabase
 * Uses the same polished components as Home.tsx (ImageGallery, PropertyDetails, etc.)
 * No onboarding popup — this is the public-facing published site
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Property, PropertyImage, Booking, BlockedDate } from '../types';
import { ImageGallery } from '../components/ImageGallery';
import { PropertyDetails } from '../components/PropertyDetails';
import { PropertyAmenities } from '../components/PropertyAmenities';
import { BookingCalendar } from '../components/BookingCalendar';
import ReviewsList from '../components/ReviewsList';
import ReviewForm from '../components/ReviewForm';

// ── Stripe success modal helpers ──────────────────────────────────

async function verifyStripeSession(sessionId) {
  const res = await fetch('https://jtzagpbdrqfifdisxipr.supabase.co/functions/v1/stripe-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get_session', session_id: sessionId })
  });
  if (!res.ok) throw new Error(`Verification failed: ${res.status}`);
  return res.json();
}

async function pollForSiteUrl(slug, maxAttempts = 20, intervalMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`https://jtzagpbdrqfifdisxipr.supabase.co/rest/v1/properties?slug=eq.${encodeURIComponent(slug)}&select=site_url&limit=1`, {
        headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0emFncGJkcnFmaWZkaXN4aXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ3MzUyODUsImV4cCI6MjA2MDMxMTI4NX0.uWqc82Hb-qnRq4H9kg5IPykUosm9VvU2s6e8mOalkR0' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.[0]?.site_url) return data[0].site_url;
      }
    } catch { /* keep polling */ }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

function showStripeSuccessModal(siteUrl) {
  const existing = document.getElementById('stripe-success-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'stripe-success-modal';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;
    display:flex;align-items:center;justify-content:center;
    font-family:Inter,sans-serif;
  `;
  overlay.innerHTML = `
    <div style="
      background:#fff;border-radius:16px;padding:40px;max-width:480px;width:90%;
      text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);
    ">
      <div style="
        width:64px;height:64px;background:#22c55e;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        margin:0 auto 24px;font-size:32px;color:#fff;
      ">✓</div>
      <h2 style="margin:0 0 12px;font-size:24px;color:#111;">Well done!</h2>
      <p style="margin:0 0 24px;color:#666;font-size:15px;">
        Your subscription is active. You can now publish your site!
      </p>
      ${siteUrl ? `<p style="margin:0 0 8px;color:#999;font-size:13px;">Your live site:</p>
        <a href="${siteUrl}" target="_blank" style="
          display:block;color:#C47756;font-size:15px;word-break:break-all;
          margin-bottom:24px;text-decoration:underline;
        ">${siteUrl}</a>` : '<div style="margin-bottom:24px"></div>'}
      <button id="stripe-modal-close" style="
        background:#111;color:#fff;border:none;padding:12px 32px;
        border-radius:8px;font-size:15px;cursor:pointer;
      ">Close</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('stripe-modal-close').addEventListener('click', () => {
    overlay.remove();
    window.history.replaceState({}, '', window.location.pathname);
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { overlay.remove(); window.history.replaceState({}, '', window.location.pathname); }
  });
}

function handleStripeRedirect() {
  const params = new URLSearchParams(window.location.search);
  const paid = params.get('paid');
  const sessionId = params.get('session_id');
  if (paid !== 'true' || !sessionId) return;

  window.history.replaceState({}, '', window.location.pathname);

  verifyStripeSession(sessionId).then(result => {
    if (result.subscription?.status === 'active' || result.subscription?.status === 'complete') {
      const match = window.location.pathname.match(/\/props\/([^\/]+)/);
      const slug = match?.[1];
      if (slug) {
        pollForSiteUrl(slug, 20, 2000).then(siteUrl => {
          showStripeSuccessModal(siteUrl);
        }).catch(() => {
          showStripeSuccessModal(null);
        });
      } else {
        showStripeSuccessModal(null);
      }
    }
  }).catch(err => {
    console.error('[Stripe verify] Error:', err.message);
  });
}

export function CustomerSite({ onSiteNameChange }: { onSiteNameChange?: (name: string) => void }) {
  const { slug } = useParams<{ slug: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [backgroundImages, setBackgroundImages] = useState<PropertyImage[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  // ── Handle Stripe ?paid=true redirect ──────────────────────
  useEffect(() => {
    handleStripeRedirect();
  }, []);

  // Mark onboarding as closed so the editor doesn't auto-open popup on next visit
  useEffect(() => {
    sessionStorage.setItem('onboarding_popup_closed', '1');
  }, []);

  useEffect(() => {
    async function loadProperty() {
      if (!slug) {
        setError('No property slug provided');
        setLoading(false);
        return;
      }

      try {
        const { data: propData, error: propError } = await supabase
          .from('properties')
          .select('*')
          .eq('slug', slug)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (propError || !propData) {
          setError('Property not found');
          setLoading(false);
          return;
        }

        setProperty(propData);

        // Load property images
        const { data: imgData } = await supabase
          .from('property_images')
          .select('*')
          .eq('property_id', propData.id)
          .order('position');
        setImages(imgData || []);

        // Background images (first 2 with is_background flag)
        let bgImages: PropertyImage[] = [];
        try {
          bgImages = (imgData || []).filter((img: PropertyImage) => (img as any).is_background).slice(0, 2);
        } catch (e) { bgImages = []; }
        setBackgroundImages(bgImages);

        // Load bookings
        const { data: bkgData } = await supabase
          .from('bookings')
          .select('*')
          .eq('property_id', propData.id)
          .in('status', ['approved', 'pending']);
        setBookings(bkgData || []);

        // Load blocked dates
        const { data: blkData } = await supabase
          .from('blocked_dates')
          .select('*')
          .eq('property_id', propData.id);
        setBlockedDates(blkData || []);

        // Apply brand color if saved
        if (propData.brand_color) {
          document.documentElement.style.setProperty('--brand', propData.brand_color);
        }
        // Apply font accent if saved
        if (propData.font_accent) {
          document.documentElement.style.setProperty('--font-accent', `'${propData.font_accent}', serif`);
        }

        // Update parent Layout nav with property name
        const displayName = propData.property_title || propData.title || '@' + slug;
        onSiteNameChange?.(displayName);
        // Also set the browser tab title
        document.title = displayName;

      } catch (err) {
        console.error('CustomerSite load error:', err);
        setError('Failed to load property');
      } finally {
        setLoading(false);
      }
    }

    loadProperty();
  }, [slug]);

  const handleBookingSubmit = async (bookingData: {
    start_date: string;
    end_date: string;
    guest_count: number;
    total_price: number;
    special_requests?: string;
  }) => {
    if (!property) return;
    const { error } = await supabase
      .from('bookings')
      .insert({ property_id: property.id, ...bookingData });
    if (error) throw error;
    const { data: updatedBookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('property_id', property.id)
      .in('status', ['approved', 'pending']);
    setBookings(updatedBookings || []);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="spinner-ring" />
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-center">
          <h1 style={{ color: '#fff', marginBottom: '16px' }}>Site not found</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>{error || 'This site does not exist.'}</p>
          <a href="https://propbook.pro" style={{ marginTop: '24px', color: '#C47756', display: 'inline-block' }}>Go to propbook.pro</a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Hero gallery — same as Home.tsx */}
      <ImageGallery
        images={images}
        property={property}
        isEditing={false}
        isAdmin={false}
        onImageUpload={undefined}
        onImageDelete={undefined}
        onImageUpdate={undefined}
        onPropertyUpdate={undefined}
        registerSaveHandler={() => false}
      />

      {/* Property details + amenities + booking — same sections as Home.tsx */}
      <div className="section-mt-neg bg-black section-padding">
        <PropertyDetails
          property={property}
          isEditing={false}
          onEditingChange={() => {}}
          onSave={undefined}
          onBeforeSave={undefined}
          onHasChanges={undefined}
        />

        <div className="amenities-bg">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: backgroundImages[0] ? `url('${backgroundImages[0].url}')` : undefined,
              opacity: backgroundImages[0] ? 0.6 : 0
            }}
          ></div>
          <div className="relative">
            <PropertyAmenities
              property={property}
              isEditing={false}
              onHasChanges={undefined}
              onUpdate={async () => {}}
            />
            <div id="calendar-section" className="amenities-content pb-5">
              <BookingCalendar
                bookings={bookings}
                blockedDates={blockedDates}
                propertyId={property.id}
                property={property}
                pricePerNight={property.price_per_night || 150}
                maxGuests={property.max_guests || 8}
                isEditing={false}
                onBookingSubmit={handleBookingSubmit}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Reviews section */}
      <div className="reviews-section relative reviews-bg">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: backgroundImages[1] ? `url('${backgroundImages[1].url}')` : undefined,
            opacity: backgroundImages[1] ? 0.6 : 0,
            width: '100vw',
            marginLeft: 'calc(-50vw + 50%)'
          }}
        ></div>
        <div className="content-container relative">
          <div>
            <h1 className="reviews-section-heading">What our guests say</h1>
          </div>
          <ReviewsList showStars={false} isEditing={false} />
          <div className="review-btn-wrap">
            <button
              onClick={() => setShowReviewModal(true)}
              className="review-btn"
            >
              Leave a review
            </button>
          </div>
        </div>
      </div>

      {showReviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 style={{ color: '#000', fontFamily: 'var(--font-accent, "Playfair Display"), serif', fontWeight: 400, textTransform: 'uppercase', fontSize: 'clamp(1.2rem, 2vw, 1.5rem)', margin: 0 }}>Leave a Review</h2>
            </div>
            <div className="p-6">
              <ReviewForm onSuccess={() => setShowReviewModal(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}