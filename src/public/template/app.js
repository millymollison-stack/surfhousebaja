'use strict';

const { useState, useEffect } = React;

// ── Config (injected at deploy time) ──
const SUPABASE_URL = window.__SUPABASE_URL__ || '';
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || '';
const PROPERTY_SLUG = window.__PROPERTY_SLUG__ || '';

// ── Supabase REST fetch ──
async function fetchProperty(slug) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/properties?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to load property: ${res.status}`);
  const data = await res.json();
  return data?.[0] || null;
}

// ── Star rating component ──
function StarRating({ rating }) {
  const fullStars = Math.floor(rating || 0);
  return (
    <div className="p-banner-stars">
      {[...Array(5)].map((_, i) => (
        <svg key={i} viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

// ── Detail pill ──
function DetailPill({ icon, label }) {
  return (
    <div className="p-detail">
      {icon}
      <span>{label}</span>
    </div>
  );
}

// ── Icons (inline SVG) ──
const IconGuests = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconBedroom = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 4v16" />
    <path d="M2 8h18a2 2 0 0 1 2 2v10" />
    <path d="M2 17h20" />
    <path d="M6 8v9" />
  </svg>
);

const IconBed = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 4v16" />
    <path d="M22 4v16" />
    <path d="M2 8h20" />
    <path d="M2 16h20" />
    <path d="M6 4v4" />
    <path d="M6 12v4" />
  </svg>
);

const IconBath = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 6l3-3 3 3" />
    <path d="M12 3v3" />
    <path d="M3 12h18" />
    <path d="M5 12v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
  </svg>
);

// ── Main Property Page ──
function PropertyPage({ property }) {
  if (!property) return null;

  const {
    title = '',
    address = '',
    price_per_night: pricePerNight = 0,
    hero_image: heroImage = '',
    images = [],
    description = '',
    max_guests: maxGuests = 0,
    bedrooms = 0,
    beds = 0,
    baths = 0,
    rating = 0,
    reviews = 0,
    brand_color: brandColor = '#C47756',
    name: brandName = 'PropBook',
  } = property;

  const allImages = [heroImage, ...images].filter(Boolean);
  const reviewPlural = reviews === 1 ? '' : 's';
  const price = typeof pricePerNight === 'number' ? pricePerNight.toFixed(0) : pricePerNight;

  const handleBookNow = () => {
    // TODO: wire up to booking flow
    window.location.href = `https://www.propbook.pro/book/${property.slug}`;
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
      {/* Hero image */}
      <div className="p-bg" />
      <img className="p-bg-img" src={heroImage} alt={title} />

      {/* Navigation */}
      <nav className="p-nav">
        <div className="p-nav-logo">
          <span className="p-nav-icon">◈</span>
          <span className="p-nav-brand">{brandName}</span>
        </div>
        <div className="p-nav-links">
          <a href="#" className="p-nav-link p-nav-cta">Sign up</a>
        </div>
      </nav>

      {/* Info card */}
      <div className="p-bottom">
        <h1 className="p-title">{title}</h1>
        <p className="p-location">{address}</p>
        <div className="p-price">
          ${price} <span>/ night</span>
        </div>
        <p className="p-description">{description}</p>
        <div className="p-details">
          <DetailPill icon={<IconGuests />} label={`${maxGuests} guests`} />
          <DetailPill icon={<IconBedroom />} label={`${bedrooms} bedroom${bedrooms !== 1 ? 's' : ''}`} />
          <DetailPill icon={<IconBed />} label={`${beds} bed${beds !== 1 ? 's' : ''}`} />
          <DetailPill icon={<IconBath />} label={`${baths} bath${baths !== 1 ? 's' : ''}`} />
        </div>
      </div>

      {/* Bottom banner */}
      <div className="p-banner">
        <div className="p-banner-left">
          <StarRating rating={rating} />
          <span className="p-banner-text">{reviews} review{reviewPlural}</span>
        </div>
        <button className="p-book-btn" onClick={handleBookNow}>
          Book Now
        </button>
      </div>
    </div>
  );
}

// ── Loading screen ──
function LoadingScreen() {
  return (
    <div className="p-loading">
      <p className="p-loading-text">Loading property...</p>
    </div>
  );
}

// ── Error screen ──
function ErrorScreen({ message }) {
  return (
    <div className="p-error">
      <p className="p-error-title">Property not found</p>
      <p className="p-error-msg">{message}</p>
    </div>
  );
}

// ── App root ──
function App() {
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Extract slug from URL path: /props/slug-here → slug-here
    const match = window.location.pathname.match(/\/props\/([^\/]+)/);
    const slug = match ? match[1] : (PROPERTY_SLUG || '');

    if (!slug) {
      setError('No property slug found in URL.');
      setLoading(false);
      return;
    }

    document.title = `${slug} — PropBook`;

    fetchProperty(slug)
      .then((prop) => {
        if (!prop) {
          setError(`No property found for "${slug}".`);
        } else {
          setProperty(prop);
          document.title = `${prop.title || slug} — PropBook`;
        }
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;

  return <PropertyPage property={property} />;
}

// ── Mount ──
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
