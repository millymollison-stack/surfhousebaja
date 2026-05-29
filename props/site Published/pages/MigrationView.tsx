/**
 * MigrationView — renders the Surf House Baja (Migration) property by fixed ID
 * Loaded at /migration — for reviewing the scraped data merged with reference copy
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Property, PropertyImage, Booking, BlockedDate } from '../types';
import '../components/CustomerSite.css';

const MIGRATION_PROPERTY_ID = "03fccab6-a997-4a38-bb7f-4b3e7a6c09a8";

export function MigrationView() {
  const [property, setProperty] = useState<Property | null>(null);
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProperty() {
      try {
        // Load property by fixed migration ID
        const { data: propData, error: propError } = await supabase
          .from('properties')
          .select('*')
          .eq('id', MIGRATION_PROPERTY_ID)
          .single();

        if (propError || !propData) {
          setError('Migration property not found');
          setLoading(false);
          return;
        }

        setProperty(propData);

        // Load property images
        const { data: imgData } = await supabase
          .from('property_images')
          .select('*')
          .eq('property_id', propData.id)
          .order('position', { ascending: true });

        if (imgData) setImages(imgData);

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
        if (propData.font_accent) {
          document.documentElement.style.setProperty('--font-accent', `'${propData.font_accent}', serif`);
        }

      } catch (err) {
        console.error('MigrationView load error:', err);
        setError('Failed to load migration property');
      } finally {
        setLoading(false);
      }
    }

    loadProperty();
  }, []);

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
        <h1 style={{ marginBottom: '16px' }}>Migration site not found</h1>
        <p style={{ color: '#666' }}>{error || 'The migration property does not exist.'}</p>
        <a href="https://propbook.pro" style={{ marginTop: '24px', color: '#C47756' }}>Go to propbook.pro</a>
      </div>
    );
  }

  const displayTitle = property.title || property.name || 'Migration Property';
  const displayDesc = property.description || property.property_details || 'No description available.';
  const displayLocation = property.address || property.location || '';

  return (
    <div className="customer-site">
      {/* Hero Section */}
      {images.length > 0 && (
        <div className="cs-hero" style={{ backgroundImage: `url(${images[0].url})` }}>
          <div className="cs-hero-overlay">
            <h1 className="cs-title" style={{ fontFamily: 'var(--font-accent, Playfair Display)' }}>
              {displayTitle}
            </h1>
            {displayLocation && (
              <p className="cs-location">{displayLocation}</p>
            )}
          </div>
        </div>
      )}

      {/* Property Info */}
      <div className="cs-body">
        <div className="cs-main">
          <div className="cs-section">
            <h2>About this place</h2>
            <p>{displayDesc}</p>
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

          {property.amenities && property.amenities.length > 0 && (
            <div className="cs-section">
              <h2>Amenities</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {property.amenities.map((a, i) => (
                  <span key={i} style={{ background: 'var(--brand, #C47756)', color: '#fff', padding: '4px 12px', borderRadius: '16px', fontSize: '14px' }}>{a}</span>
                ))}
              </div>
            </div>
          )}

          {property.property_details && (
            <div className="cs-section">
              <h2>Property Details</h2>
              <p>{property.property_details}</p>
            </div>
          )}

          {property.activities && (
            <div className="cs-section">
              <h2>Activities</h2>
              <p>{property.activities}</p>
            </div>
          )}

          {property.local_area && (
            <div className="cs-section">
              <h2>Local Area</h2>
              <p>{property.local_area}</p>
            </div>
          )}

          {property.getting_there && (
            <div className="cs-section">
              <h2>Getting There</h2>
              <p>{property.getting_there}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="cs-sidebar">
          {property.price_per_night && (
            <div className="cs-price">
              <span style={{ fontSize: '28px', fontWeight: 'bold' }}>${property.price_per_night}</span>
              <span style={{ color: '#666' }}> / night</span>
            </div>
          )}
          {(property.bedrooms || property.beds || property.max_guests) && (
            <div className="cs-details">
              {property.bedrooms && <p>🏠 {property.bedrooms} bedroom{property.bedrooms > 1 ? 's' : ''}</p>}
              {property.beds && <p>🛏️ {property.beds} bed{property.beds > 1 ? 's' : ''}</p>}
              {property.max_guests && <p>👥 Up to {property.max_guests} guests</p>}
            </div>
          )}
          <div style={{ marginTop: '20px', padding: '12px', background: '#f5f5f5', borderRadius: '8px', fontSize: '13px', color: '#888' }}>
            <p>🔒 Migration view — read only</p>
            <p>ID: {MIGRATION_PROPERTY_ID}</p>
          </div>
        </div>
      </div>
    </div>
  );
}