/**
 * CustomerSite — renders a customer's property site by slug
 * Loaded at /props/{slug} — reads property data from Supabase
 * No onboarding popup, edit mode for admin, view-only for public
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Property, PropertyImage, Booking, BlockedDate } from '../types';
import '../components/CustomerSite.css';

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
  // Remove existing modal if any
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
    // Clean URL without reload
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

  // Clean URL immediately
  window.history.replaceState({}, '', window.location.pathname);

  verifyStripeSession(sessionId).then(result => {
    if (result.subscription?.status === 'active' || result.subscription?.status === 'complete') {
      // Get slug from URL and poll for site_url
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

export function CustomerSite() {
  const { slug } = useParams<{ slug: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Handle Stripe ?paid=true redirect ──────────────────────
  useEffect(() => {
    handleStripeRedirect();
  }, []);

  useEffect(() => {
    async function loadProperty() {
      if (!slug) {
        setError('No property slug provided');
        setLoading(false);
        return;
      }

      try {
        // Load property by slug
        const { data: propData, error: propError } = await supabase
          .from('properties')
          .select('*')
          .eq('slug', slug)
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

      } catch (err) {
        console.error('CustomerSite load error:', err);
        setError('Failed to load property');
      } finally {
        setLoading(false);
      }
    }

    loadProperty();
  }, [slug]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
        <div className="spinner-ring" />
      </div>
    );
  }

  if (error || !property) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#333' }}>
        <h1 style={{ marginBottom: '16px' }}>Site not found</h1>
        <p style={{ color: '#666' }}>{error || 'This site does not exist.'}</p>
        <a href="https://propbook.pro" style={{ marginTop: '24px', color: '#C47756' }}>Go to propbook.pro</a>
      </div>
    );
  }

  // Render the property site
  return (
    <div className="customer-site">
      {/* Hero Section */}
      {images.length > 0 && (
        <div className="cs-hero" style={{ backgroundImage: `url(${images[0].url})` }}>
          <div className="cs-hero-overlay">
            <h1 className="cs-title" style={{ fontFamily: 'var(--font-accent, Playfair Display)' }}>
              {property.name}
            </h1>
            {property.location && (
              <p className="cs-location">{property.location}</p>
            )}
          </div>
        </div>
      )}

      {/* Property Info */}
      <div className="cs-body">
        <div className="cs-main">
          <div className="cs-section">
            <h2>About this place</h2>
            <p>{property.description || 'No description available.'}</p>
          </div>

          {images.length > 1 && (
            <div className="cs-section">
              <h2>Gallery</h2>
              <div className="cs-gallery">
                {images.slice(1).map((img, i) => (
                  <img key={img.id || i} src={img.url} alt={`Property ${i + 2}`} className="cs-gallery-img" />
                ))}
              </div>
            </div>
          )}

          {typeof property.amenities === 'string' && property.amenities && (
            <div className="cs-section">
              <h2>Amenities</h2>
              <p>{property.amenities}</p>
            </div>
          )}
        </div>

        <div className="cs-sidebar">
          <div className="cs-booking-card">
            <div className="cs-price">
              <span className="cs-price-amount">${property.price_per_night || 150}</span>
              <span className="cs-price-unit"> USD / night</span>
            </div>
            {property.max_guests && (
              <p className="cs-guests">Up to {property.max_guests} guests</p>
            )}
            <a
              href={`https://propbook.pro/pay/${property.id}`}
              className="cs-book-btn"
            >
              Book now
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}