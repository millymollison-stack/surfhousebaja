/**
 * Casablanca1 — Test page for current scraped state with booking calendar
 * Route: /props/Casablanca1
 * Mirrors what the user sees after scraping + publishing flow
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { BookingCalendar } from '../components/BookingCalendar';
import type { Property, PropertyImage, Booking, BlockedDate } from '../types';
import './CustomerSite.css';

export function Casablanca1() {
  const [property, setProperty] = useState<Property | null>(null);
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stored scraped data from sessionStorage (set during publish flow)
  const [scrapedTitle] = useState(() => sessionStorage.getItem('popup_website_name') || 'Casablanca1');
  const [scrapedDesc] = useState(() => sessionStorage.getItem('popup_website_desc') || '');
  const [scrapedData] = useState<any>(() => {
    const raw = sessionStorage.getItem('popup_scraped_data');
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    async function loadData() {
      try {
        // Load property by slug 'casablanca1' from Supabase
        const { data: propData, error: propError } = await supabase
          .from('properties')
          .select('*')
          .eq('slug', 'casablanca1')
          .maybeSingle();

        if (propError) console.warn('No DB property found for casablanca1, using scraped data');

        if (propData) {
          setProperty(propData);

          const { data: imgData } = await supabase
            .from('property_images')
            .select('*')
            .eq('property_id', propData.id)
            .order('position');
          setImages(imgData || []);

          const { data: bkgData } = await supabase
            .from('bookings')
            .select('*')
            .eq('property_id', propData.id)
            .in('status', ['approved', 'pending']);
          setBookings(bkgData || []);

          const { data: blkData } = await supabase
            .from('blocked_dates')
            .select('*')
            .eq('property_id', propData.id);
          setBlockedDates(blkData || []);
        } else {
          // Build a synthetic property from scraped session data
          const synthetic: Property = {
            id: 'casablanca1-test',
            slug: 'casablanca1',
            name: scrapedData?.title || scrapedTitle || 'Casablanca1',
            description: scrapedData?.description || scrapedDesc || 'Beautiful property with stunning views.',
            location: scrapedData?.location || 'Ensenada, Mexico',
            price_per_night: parseFloat((scrapedData?.price || '150').replace(/[^0-9.]/g, '')) || 150,
            max_guests: scrapedData?.guests || 8,
            bedrooms: scrapedData?.bedrooms || 3,
            beds: scrapedData?.beds || 4,
            baths: scrapedData?.baths || 2,
            amenities: '',
            user_id: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          setProperty(synthetic);

          // Build images from scraped data
          if (scrapedData?.images?.length) {
            setImages(scrapedData.images.map((url: string, i: number) => ({
              id: `img-${i}`,
              property_id: 'casablanca1-test',
              url,
              position: i,
              is_featured: i === 0,
              is_background: false,
            })));
          } else if (scrapedData?.hero_image) {
            setImages([{
              id: 'hero',
              property_id: 'casablanca1-test',
              url: scrapedData.hero_image,
              position: 0,
              is_featured: true,
              is_background: false,
            }]);
          }
        }

        if (propData?.brand_color) {
          document.documentElement.style.setProperty('--brand', propData.brand_color);
        }
        if (propData?.font_accent) {
          document.documentElement.style.setProperty('--font-accent', `'${propData.font_accent}', serif`);
        }
      } catch (err) {
        console.error('Casablanca1 load error:', err);
        setError('Failed to load property');
      } finally {
        setLoading(false);
      }
    }

    loadData();
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
        <h1 style={{ marginBottom: '16px' }}>Site not found</h1>
        <p style={{ color: '#666' }}>{error || 'This site does not exist.'}</p>
      </div>
    );
  }

  const heroImage = images[0]?.url || scrapedData?.hero_image || '/template/surfhousebaja-main.jpg';
  const galleryImages = images.slice(1);

  return (
    <div className="customer-site">
      {/* Hero */}
      <div className="cs-hero" style={{ backgroundImage: `url(${heroImage})` }}>
        <div className="cs-hero-overlay">
          <h1 className="cs-title" style={{ fontFamily: 'var(--font-accent, Playfair Display)' }}>
            {property.name}
          </h1>
          {property.location && (
            <p className="cs-location">{property.location}</p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="cs-body">
        <div className="cs-main">
          <div className="cs-section">
            <h2>About this place</h2>
            <p>{property.description || scrapedDesc || 'A beautiful property with stunning views.'}</p>
          </div>

          {/* Property Details */}
          <div className="cs-section">
            <h2>Details</h2>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.95rem', color: '#555' }}>
              {property.max_guests && <span>👤 Up to {property.max_guests} guests</span>}
              {property.bedrooms && <span>🛏️ {property.bedrooms} bedrooms</span>}
              {property.beds && <span>🛁 {property.beds} beds</span>}
              {property.beds && <span>🚿 {property.baths} baths</span>}
            </div>
          </div>

          {/* Gallery */}
          {galleryImages.length > 0 && (
            <div className="cs-section">
              <h2>Gallery</h2>
              <div className="cs-gallery">
                {galleryImages.map((img, i) => (
                  <img key={img.id || i} src={img.url} alt={`Property ${i + 2}`} className="cs-gallery-img" />
                ))}
              </div>
            </div>
          )}

          {/* Booking Calendar */}
          <div className="cs-section">
            <h2>Availability</h2>
            <BookingCalendar
              bookings={bookings}
              blockedDates={blockedDates}
              propertyId={property.id}
              property={property}
              pricePerNight={property.price_per_night || 150}
              maxGuests={property.max_guests || 8}
              onBookingSubmit={async (bookingData) => {
                console.log('[Casablanca1] Booking submitted:', bookingData);
                alert('Booking submitted! (Demo mode — not actually saved)');
              }}
            />
          </div>
        </div>

        {/* Booking Sidebar */}
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