'use strict';

// ── Config (replaced at render time) ───────────────────────────────
const SUPABASE_URL = '{{SUPABASE_URL}}';
const SUPABASE_ANON_KEY = '{{SUPABASE_ANON_KEY}}';

// ── Helpers ───────────────────────────────────────────────────────

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

function parseImages(imagesJson) {
  if (!imagesJson) return [];
  if (Array.isArray(imagesJson)) return imagesJson;
  try {
    const parsed = JSON.parse(imagesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Supabase REST fetch ────────────────────────────────────────────

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

// ── Stripe session verification ────────────────────────────────────

async function verifyStripeSession(sessionId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({
      action: 'get_session',
      session_id: sessionId
    })
  });
  if (!res.ok) {
    let errMsg = `Verification failed: ${res.status}`;
    try {
      const errData = await res.json();
      if (errData && errData.error) errMsg = errData.error;
    } catch {}
    throw new Error(errMsg);
  }
  return res.json();
}

// ── Site URL polling ───────────────────────────────────────────────

async function pollForSiteUrl(maxAttempts = 20, intervalMs = 2000) {
  const slug = getSlugFromUrl();
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const prop = await fetchProperty(slug);
      if (prop?.site_url) {
        return prop.site_url;
      }
    } catch {
      // keep polling
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

// ── URL helpers ───────────────────────────────────────────────────

function getSlugFromUrl() {
  const match = window.location.pathname.match(/\/props\/([^\/]+)/);
  return match ? match[1] : '';
}

// ── Success Modal ───────────────────────────────────────────────────

function showSuccessModal(siteUrl) {
  // Remove existing modal if any
  const existing = document.getElementById('p-stripe-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'p-stripe-modal';
  overlay.style.cssText = [
    'position:fixed;top:0;left:0;width:100%;height:100%;',
    'background:rgba(0,0,0,0.7);z-index:99999;',
    'display:flex;align-items:center;justify-content:center;',
    'font-family:Inter,sans-serif'
  ].join('');

  const modal = document.createElement('div');
  modal.style.cssText = [
    'background:#fff;border-radius:16px;padding:40px;max-width:480px;width:90%;',
    'text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);'
  ].join('');

  modal.innerHTML = [
    '<div style="font-size:48px;margin-bottom:16px;">✓</div>',
    '<h2 style="font-family:Playfair Display,serif;font-size:28px;margin:0 0 12px;color:#111;">Well done!</h2>',
    '<p style="color:#555;font-size:16px;margin:0 0 24px;line-height:1.5;">',
 'Your subscription is active. You can now publish your site!</p>',
    siteUrl ? [
      '<p style="color:#888;font-size:13px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Your live site:</p>',
      '<a href="' + escapeHtml(siteUrl) + '" target="_blank" rel="noopener noreferrer"',
      ' style="color:#C47756;font-size:15px;font-weight:500;word-break:break-all;">' + escapeHtml(siteUrl) + '</a>'
    ].join('') : '',
    '<button id="p-modal-close-btn"',
    ' style="margin-top:24px;padding:12px 32px;background:#C47756;color:#fff;',
    ' border:none;border-radius:8px;font-size:15px;font-weight:500;cursor:pointer;',
    ' transition:background 0.2s;">Close</button>'
  ].join('');

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document.getElementById('p-modal-close-btn').addEventListener('click', function() {
    overlay.remove();
  });
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });
}

function hideSuccessModal() {
  const overlay = document.getElementById('p-stripe-modal');
  if (overlay) overlay.remove();
}

// ── Handle ?paid=true Stripe redirect ───────────────────────────

function handleStripeRedirect() {
  const params = new URLSearchParams(window.location.search);
  const paid = params.get('paid') === 'true';
  const sessionId = params.get('session_id');

  if (!paid || !sessionId) {
    console.log('[Stripe] No redirect params detected');
    return;
  }

  console.log('[Stripe] Processing redirect, session:', sessionId);

  // Store session ID so it survives page refresh
  try { sessionStorage.setItem('stripe_session_id', sessionId); } catch {}

  // Clean URL without triggering page reload
  window.history.replaceState({}, '', window.location.pathname);

  // Verify session with backend
  verifyStripeSession(sessionId).then(result => {
    console.log('[Stripe] Session verified:', result);

    const subStatus = result.subscription?.status;
    if (subStatus === 'active' || subStatus === 'complete' || subStatus === 'paid') {
      // Poll for site URL to appear in properties table
      pollForSiteUrl(20, 2000).then(siteUrl => {
        console.log('[Stripe] site_url found:', siteUrl);
        showSuccessModal(siteUrl);
      }).catch(() => {
        showSuccessModal(null);
      });
    } else {
      console.warn('[Stripe] Subscription status:', subStatus);
      showSuccessModal(null);
    }
  }).catch(err => {
    console.error('[Stripe] Verification error:', err.message);
    // Show modal anyway — user DID pay, just couldn't verify
    showSuccessModal(null);
  });
}

// ── Gallery (for static template) ────────────────────────────────

function initGallery() {
  const slides = document.querySelectorAll('.hero-slide');
  const thumbs = document.querySelectorAll('.thumb-item');
  if (slides.length === 0) return;

  let current = 0;

  function showSlide(index) {
    slides.forEach((s, i) => {
      s.classList.toggle('active', i === index);
    });
    thumbs.forEach((t, i) => {
      t.classList.toggle('active', i === index);
    });
    const counter = document.getElementById('imageCounter');
    if (counter) counter.textContent = (index + 1) + ' / ' + slides.length;
    current = index;
  }

  document.getElementById('prevBtn')?.addEventListener('click', function() {
    showSlide((current - 1 + slides.length) % slides.length);
  });
  document.getElementById('nextBtn')?.addEventListener('click', function() {
    showSlide((current + 1) % slides.length);
  });
  thumbs.forEach((thumb, i) => {
    thumb.addEventListener('click', function() { showSlide(i); });
  });
}

// ── Location modal (Leaflet) ─────────────────────────────────────

var locationMap = null;
function openLocationModal() {
  var modal = document.getElementById('location-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  if (!locationMap) {
    var latEl = document.getElementById('map-latitude');
    var lngEl = document.getElementById('map-longitude');
    var lat = latEl ? parseFloat(latEl.textContent) : 30.861383;
    var lng = lngEl ? parseFloat(lngEl.textContent) : -116.167874;
    if (typeof L === 'undefined') return;
    locationMap = L.map('location-map').setView([lat, lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(locationMap);
    L.marker([lat, lng]).addTo(locationMap);
  }
  setTimeout(function() { if (locationMap) locationMap.invalidateSize(); }, 10);
}
function closeLocationModal() {
  var modal = document.getElementById('location-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

// ── Sidebar (for static template) ─────────────────────────────────

function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebarOverlay')?.classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
}

// ── Smooth scroll ─────────────────────────────────────────────────

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
    anchor.addEventListener('click', function(e) {
      var href = this.getAttribute('href');
      if (href && href !== '#') {
        e.preventDefault();
        var target = document.querySelector(href);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ── Boot ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  // Handle Stripe redirect FIRST
  handleStripeRedirect();

  // Init gallery
  initGallery();

  // Init smooth scroll
  initSmoothScroll();

  // Sidebar overlay close
  document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

  // Location modal close on overlay click
  document.getElementById('location-modal')?.addEventListener('click', function(e) {
    if (e.target === this) closeLocationModal();
  });
});
