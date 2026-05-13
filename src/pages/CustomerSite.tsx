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

export function CustomerSite() {
  const { slug } = useParams<{ slug: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          .single();

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
              <span className="cs-price-unit"> / night</span>
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