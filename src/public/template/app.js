'use strict';

const {
  useState,
  useEffect
} = React;

// ── Config (injected at deploy time) ──
const SUPABASE_URL = window.__SUPABASE_URL__ || '';
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || '';
const PROPERTY_SLUG = window.__PROPERTY_SLUG__ || '';

// ── Supabase REST fetch ──
async function fetchProperty(slug) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/properties?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Failed to load property: ${res.status}`);
  const data = await res.json();
  return data?.[0] || null;
}

// ── Star rating component ──
function StarRating({
  rating
}) {
  const fullStars = Math.floor(rating || 0);
  return /*#__PURE__*/React.createElement("div", {
    className: "p-banner-stars"
  }, [...Array(5)].map((_, i) => /*#__PURE__*/React.createElement("svg", {
    key: i,
    viewBox: "0 0 24 24"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
  }))));
}

// ── Detail pill ──
function DetailPill({
  icon,
  label
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "p-detail"
  }, icon, /*#__PURE__*/React.createElement("span", null, label));
}

// ── Icons (inline SVG) ──
const IconGuests = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2"
}, /*#__PURE__*/React.createElement("path", {
  d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "9",
  cy: "7",
  r: "4"
}), /*#__PURE__*/React.createElement("path", {
  d: "M23 21v-2a4 4 0 0 0-3-3.87"
}), /*#__PURE__*/React.createElement("path", {
  d: "M16 3.13a4 4 0 0 1 0 7.75"
}));
const IconBedroom = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2"
}, /*#__PURE__*/React.createElement("path", {
  d: "M2 4v16"
}), /*#__PURE__*/React.createElement("path", {
  d: "M2 8h18a2 2 0 0 1 2 2v10"
}), /*#__PURE__*/React.createElement("path", {
  d: "M2 17h20"
}), /*#__PURE__*/React.createElement("path", {
  d: "M6 8v9"
}));
const IconBed = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2"
}, /*#__PURE__*/React.createElement("path", {
  d: "M2 4v16"
}), /*#__PURE__*/React.createElement("path", {
  d: "M22 4v16"
}), /*#__PURE__*/React.createElement("path", {
  d: "M2 8h20"
}), /*#__PURE__*/React.createElement("path", {
  d: "M2 16h20"
}), /*#__PURE__*/React.createElement("path", {
  d: "M6 4v4"
}), /*#__PURE__*/React.createElement("path", {
  d: "M6 12v4"
}));
const IconBath = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2"
}, /*#__PURE__*/React.createElement("path", {
  d: "M9 6l3-3 3 3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12 3v3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M3 12h18"
}), /*#__PURE__*/React.createElement("path", {
  d: "M5 12v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
}));

// ── Main Property Page ──
function PropertyPage({
  property
}) {
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
    name: brandName = 'PropBook'
  } = property;
  const allImages = [heroImage, ...images].filter(Boolean);
  const reviewPlural = reviews === 1 ? '' : 's';
  const price = typeof pricePerNight === 'number' ? pricePerNight.toFixed(0) : pricePerNight;

  // Set CSS variable so .p-bg background updates from the hero image
  if (heroImage) {
    document.documentElement.style.setProperty('--hero-image', `url('${heroImage}')`);
  }
  const handleBookNow = () => {
    window.location.href = `https://www.propbook.pro/book/${property.slug}`;
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%',
      height: '100vh',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-bg"
  }), /*#__PURE__*/React.createElement("img", {
    className: "p-bg-img",
    src: heroImage,
    alt: title
  }), /*#__PURE__*/React.createElement("nav", {
    className: "p-nav"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-nav-logo"
  }, /*#__PURE__*/React.createElement("span", {
    className: "p-nav-icon"
  }, "\u25C8"), /*#__PURE__*/React.createElement("span", {
    className: "p-nav-brand"
  }, brandName)), /*#__PURE__*/React.createElement("div", {
    className: "p-nav-links"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    className: "p-nav-link p-nav-cta"
  }, "Sign up"))), /*#__PURE__*/React.createElement("div", {
    className: "p-bottom"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "p-title"
  }, title), /*#__PURE__*/React.createElement("p", {
    className: "p-location"
  }, address), /*#__PURE__*/React.createElement("div", {
    className: "p-price"
  }, "$", price, " ", /*#__PURE__*/React.createElement("span", null, "/ night")), /*#__PURE__*/React.createElement("p", {
    className: "p-description"
  }, description), /*#__PURE__*/React.createElement("div", {
    className: "p-details"
  }, /*#__PURE__*/React.createElement(DetailPill, {
    icon: /*#__PURE__*/React.createElement(IconGuests, null),
    label: `${maxGuests} guests`
  }), /*#__PURE__*/React.createElement(DetailPill, {
    icon: /*#__PURE__*/React.createElement(IconBedroom, null),
    label: `${bedrooms} bedroom${bedrooms !== 1 ? 's' : ''}`
  }), /*#__PURE__*/React.createElement(DetailPill, {
    icon: /*#__PURE__*/React.createElement(IconBed, null),
    label: `${beds} bed${beds !== 1 ? 's' : ''}`
  }), /*#__PURE__*/React.createElement(DetailPill, {
    icon: /*#__PURE__*/React.createElement(IconBath, null),
    label: `${baths} bath${baths !== 1 ? 's' : ''}`
  }))), /*#__PURE__*/React.createElement("div", {
    className: "p-banner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-banner-left"
  }, /*#__PURE__*/React.createElement(StarRating, {
    rating: rating
  }), /*#__PURE__*/React.createElement("span", {
    className: "p-banner-text"
  }, reviews, " review", reviewPlural)), /*#__PURE__*/React.createElement("button", {
    className: "p-book-btn",
    onClick: handleBookNow
  }, "Book Now")));
}

// ── Loading screen ──
function LoadingScreen() {
  return /*#__PURE__*/React.createElement("div", {
    className: "p-loading"
  }, /*#__PURE__*/React.createElement("p", {
    className: "p-loading-text"
  }, "Loading property..."));
}

// ── Error screen ──
function ErrorScreen({
  message
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "p-error"
  }, /*#__PURE__*/React.createElement("p", {
    className: "p-error-title"
  }, "Property not found"), /*#__PURE__*/React.createElement("p", {
    className: "p-error-msg"
  }, message));
}

// ── App root ──
function App() {
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    // Extract slug from URL path: /props/slug-here → slug-here
    const match = window.location.pathname.match(/\/props\/([^\/]+)/);
    const slug = match ? match[1] : PROPERTY_SLUG || '';
    if (!slug) {
      setError('No property slug found in URL.');
      setLoading(false);
      return;
    }
    document.title = `${slug} — PropBook`;
    fetchProperty(slug).then(prop => {
      if (!prop) {
        setError(`No property found for "${slug}".`);
      } else {
        setProperty(prop);
        document.title = `${prop.title || slug} — PropBook`;
      }
    }).catch(err => {
      setError(err.message);
    }).finally(() => {
      setLoading(false);
    });
  }, []);
  if (loading) return /*#__PURE__*/React.createElement(LoadingScreen, null);
  if (error) return /*#__PURE__*/React.createElement(ErrorScreen, {
    message: error
  });
  return /*#__PURE__*/React.createElement(PropertyPage, {
    property: property
  });
}

// ── Mount ──
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/React.createElement(App, null));