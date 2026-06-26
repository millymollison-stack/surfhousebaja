# Hybrid Site Architecture — SPEC

## Overview

Each property site (`/props/{slug}/`) has two layers:

1. **Static `index.html`** — baked at deploy time with property data. No JS needed to render. Fast, SEO-friendly.
2. **React app** — loaded on demand only when: Book Now is clicked, or admin logs in to edit.

When edits are made in React and saved, a "Publish Website" button appears in the sidebar. Clicking it starts a 30-second countdown, then regenerates the static `index.html` from fresh Supabase data.

---

## Static HTML Template

**Source file:** `src/public/template/template.html`
**Tokens:** All dynamic data replaced at deploy time.

### Token List

| Token | Source |
|-------|--------|
| `{{TITLE}}` | `property.title` |
| `{{ADDRESS}}` | `property.address` |
| `{{PRICE_PER_NIGHT}}` | `property.price_per_night` |
| `{{PROPERTY_TITLE}}` | `property.property_title` |
| `{{DESCRIPTION}}` | `property.description` |
| `{{PROPERTY_INTRO}}` | `property.property_intro` |
| `{{LATITUDE}}` | `property.latitude` |
| `{{LONGITUDE}}` | `property.longitude` |
| `{{IMAGE_1}}` … `{{IMAGE_6}}` | `property_images` table (sorted by position) |
| `{{IMAGE_SIDE_A}}` | First non-featured image |
| `{{IMAGE_SIDE_B}}` | Second non-featured image |
| `{{BEDROOMS}}` | `property.bedrooms` |
| `{{BATHS}}` | `property.baths` or `property.bathrooms` |
| `{{MAX_GUESTS}}` | `property.max_guests` |
| `{{RATING}}` | `property.rating` |
| `{{REVIEW_COUNT}}` | `property.reviews` |
| `{{BRAND_HANDLE}}` | `property.slug` (for @handle display) |
| `{{CONTACT_EMAIL}}` | `property.contact_email` or owner email |
| `{{GETTING_THERE}}` | `property.getting_there` |
| `{{LOCAL_AREA}}` | `property.local_area` |
| `{{AMENITIES_BG_IMAGE}}` | Static background image URL |
| `{{REVIEWS_BG_IMAGE}}` | Static background image URL |
| `{{DROPDOWNS_BG_IMAGE}}` | Static background image URL |

### Static HTML Sections

1. **Hero gallery** — 6 images. First image shown statically. Clicking slider arrows OR dots → loads React app (`/props/{slug}/assets/app.js`) in gallery mode
2. **Two side-by-side images** — `{{IMAGE_SIDE_A}}` and `{{IMAGE_SIDE_B}}`
3. **Black panel** — `{{PROPERTY_INTRO}}`
4. **Amenities** — static content, background image
5. **Property details dropdowns** — `{{GETTING_THERE}}`, `{{LOCAL_AREA}}`
6. **Booking section** — "Book Now" button → loads React app in booking mode
7. **Reviews** — **NOT in static HTML**. React loads reviews at runtime from Supabase.
8. **Contact** — `{{CONTACT_EMAIL}}`
9. **Footer** — auto-generated
10. **Book Now banner (fixed bottom)** — links to React booking

### Book Now Button

Static HTML "Book Now" button: `<a href="/props/{slug}/?book=true" class="book-now-btn">Book Now</a>`

When clicked, loads React app with the booking flow.

### Gallery Slider Click → React

- The gallery has radio-button CSS slider with 6 images
- Clicking any arrow or dot: `onclick="window.__LOAD_REACT__('gallery')"`
- `window.__LOAD_REACT__` sets `sessionStorage.setItem('__REACT_MODE__', mode)` then loads React app
- React app checks `__REACT_MODE__` on load and renders the appropriate view (gallery viewer or booking flow)

---

## deploy.php — Static HTML Generator

**Location:** `/public_html/scripts/deploy.php` on Hostinger

### Flow

```
1. Receive POST: token, slug, propertyId
2. Validate token via Supabase /auth/v1/user
3. Fetch property record: GET /rest/v1/properties?id=eq.{propertyId}
4. Fetch property_images: GET /rest/v1/property_images?property_id=eq.{propertyId}&order=position
5. Fetch reviews: GET /rest/v1/reviews?property_id=eq.{propertyId}
6. Read /public_html/scripts/template.html
7. Replace all {{TOKEN}}s with real data
8. Write → /public_html/props/{slug}/index.html
9. Copy /public_html/scripts/react-assets/ → /public_html/props/{slug}/assets/ (if not exists or force=true)
10. chmod 644 /public_html/props/{slug}/index.html
11. Update Supabase: PATCH /rest/v1/properties?id=eq.{propertyId} { site_version: NOW() }
12. Return { success: true, siteUrl }
```

### Property Images Mapping

- `{{IMAGE_1}}` → first image (position 0)
- `{{IMAGE_2}}` … `{{IMAGE_6}}` → subsequent images
- `{{IMAGE_SIDE_A}}` → image at position 1 (second image)
- `{{IMAGE_SIDE_B}}` → image at position 2 (third image)
- If fewer than 6 images exist, repeat last image or hide the slot

---

## React App — On-Demand Loading

**Location:** `/props/{slug}/assets/app.js` (pre-built, loaded on demand)

**Triggered by:**
- `?book=true` URL param → booking flow
- `?edit=true` URL param → admin edit mode
- `?gallery=true` URL param → gallery viewer (from slider click)
- Admin sidebar: always loads React for edit capability

**sessionStorage keys:**
- `__REACT_MODE__` — 'gallery' | 'booking' | 'edit'
- `__PROPERTY_SLUG__` — current slug
- `__STALE_CHECK__` — property updated_at at time of load

---

## Admin Sidebar — Publish Flow

### Stale Detection

On load, React compares:
- `property.updated_at` (from Supabase)
- `property.site_version` (from Supabase)

If `updated_at > site_version` → static HTML is stale → show "Publish Website" button in sidebar.

### Publish Button States

1. **Hidden** — static HTML is current
2. **"Publish Website" (disabled, countdown mode)** — stale detected
   - Click "Publish Website" → 30-second countdown starts
   - UI shows: "Updating website in 30... 29... 28..." (countdown bar)
   - Admin can keep editing during countdown
   - Multiple clicks reset countdown to 30
3. **"Publish Now" (enabled)** — countdown reached 0
   - Click → calls `deploy-site` edge function
   - Edge function calls `deploy.php` → regenerates static HTML
   - On success: update `site_version` locally, hide button

### deploy-site Edge Function

**Already exists.** Updated to call `deploy.php` with `token`, `slug`, `propertyId`.

New: `deploy-site` should also accept a `force=true` param to skip staleness check.

---

## Supabase Schema

### properties table additions

```sql
ALTER TABLE properties ADD COLUMN site_version timestamptz DEFAULT NOW();
ALTER TABLE properties ADD COLUMN contact_email text;
ALTER TABLE properties ADD COLUMN latitude text;
ALTER TABLE properties ADD COLUMN longitude text;
ALTER TABLE properties ADD COLUMN getting_there text;
ALTER TABLE properties ADD COLUMN local_area text;
ALTER TABLE properties ADD COLUMN rating text;
ALTER TABLE properties ADD COLUMN reviews integer DEFAULT 0;
```

### property_images table

Already exists. Populated during onboarding scrape.

### reviews table

Already exists. Managed in React app.

---

## File Structure on Hostinger

```
/public_html/
  scripts/
    deploy.php              ← static HTML generator
    template.html           ← master template
    react-assets/          ← pre-built React app
      app.js
      styles.css
      index-*.js
      index-*.css
      assets/
  props/
    {slug}/
      index.html            ← generated static HTML
      .htaccess            ← rewrite rules for React routes
      assets/              ← React assets (copy of react-assets/)
        app.js
        styles.css
        index-*.js
        index-*.css
        assets/
```

---

## Build Checklist

- [ ] Fix template.html: replace hardcoded images with `{{IMAGE_1}}`–`{{IMAGE_6}}`, add missing tokens
- [ ] Fix template.html: gallery shows 6 images, clicking arrows loads React
- [ ] Fix template.html: Book Now button links to `?book=true`
- [ ] Update deploy.php: fetch from Supabase, replace all tokens, generate static HTML
- [ ] Pre-build React assets → upload to `/scripts/react-assets/`
- [ ] Update deploy.php: copy react-assets to `/props/{slug}/assets/`
- [ ] React app: detect `__REACT_MODE__`, render correct view
- [ ] React app: stale detection using `updated_at > site_version`
- [ ] React sidebar: "Publish Website" button with 30s countdown
- [ ] React sidebar: call `deploy-site` on Publish click
- [ ] Test: new site creation → static HTML generated with correct data
- [ ] Test: edit in React → Publish button appears → countdown → static HTML regenerates
- [ ] Test: Book Now loads React booking flow
- [ ] Test: gallery click loads React gallery viewer
