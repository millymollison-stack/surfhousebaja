# Post-Subscription Website Deploy Script

## Overview

When a user subscribes via Stripe, automatically deploy their property website to Hostinger.

---

## Flow

### 1. Trigger
Stripe webhook fires → `subscription.active` → invoke deploy script

### 2. Create Folder on Hostinger
```
/props/{slug}/  (slug = URL-safe property name from onboarding)
```
- SSH to Hostinger
- Create directory if not exists

### 3. Render HTML Template

**Input data:**
- `<title>` = property name from onboarding popup
- Base data from original property ID (`efa8d280-...`)
- Merge scraped Airbnb data where it exists (overwrites base)

**Process:**
```
node scripts/render-template.mjs --slug=original_property_slug --output=/tmp/{slug}.html
```

**Output:**
- Static `index.html` file with merged data
- All images downloaded/cached locally
- Fully self-contained (no external API calls at runtime)

### 4. Create New Property ID in Supabase

```
POST /properties
{
  slug: "{slug}",
  owner_id: "{user_id}",
  source_property_id: "efa8d280-...",  // reference to original
  status: "active",
  // ... other fields
}
```

- Original property (`efa8d280-...`) stays untouched
- New property ID receives merged data (base + scraped overrides)

### 5. Upload to Hostinger

```
scp /tmp/{slug}.html u805830916@host:/home/u805830916/domains/propbook.pro/public_html/props/{slug}/index.html
```

---

## URL Architecture

| URL | Purpose |
|-----|---------|
| `propbook.pro/props/{slug}/` | Public static HTML site (visitors) |
| `propbook.pro/props/{slug}/edit` | React app for property owner (editing) |
| `propbook.pro/?property={slug}&auth={token}` | Direct link with auth + property context |

---

## React App Requirements

### Property Context
- React app must load correct property by slug OR by `?property=slug` param
- User must only see/edit their own property data
- All mutations write to the NEW Property ID (not original)

### Auth Flow
- `propbook.pro/?auth={stripe_session_id}` → validate session → log in user → redirect to property
- OR: `propbook.pro/props/{slug}/edit` → if not logged in → redirect to login → return to edit page

### Booking Flow
- `/props/{slug}/` (HTML template) has "Book Now" button
- Links to `propbook.pro/pay/{new_property_id}` (React app)
- Booking saves to new Property ID in Supabase

---

## Data Merge Strategy

| Field | Source Priority |
|-------|----------------|
| title | scraped > original |
| description | scraped > original |
| images | scraped > original |
| amenities | scraped > original |
| price | original (keep base) |
| location | original (keep base) |
| bedrooms/bathrooms | scraped > original |

Scraped data is more relevant (Airbnb listing) so it takes priority where it exists.

---

## Success Criteria

- [ ] Static HTML deployed to `/props/{slug}/index.html`
- [ ] Property data merged correctly (scraped overrides original)
- [ ] New Property ID created in Supabase
- [ ] Original property untouched
- [ ] HTML site links to React app for bookings/editing
- [ ] React app loads correct property + user context
- [ ] Auth flow works end-to-end

---

## File Structure

```
scripts/
  render-template.mjs      # Already exists - renders HTML from property data
  deploy-property.mjs      # NEW - main deploy script
  merge-property-data.mjs  # NEW - merges original + scraped data

supabase/
  functions/
    stripe-webhook/
      index.ts             # Existing - add deploy trigger here
    create-property-id/
      index.ts             # NEW - creates new Property ID in Supabase
```

---

## Implementation Order

1. **`merge-property-data.mjs`** — combine original + scraped data
2. **`create-property-id`** — Supabase function for new Property ID
3. **`deploy-property.mjs`** — main script: render + upload
4. **Stripe webhook** — trigger deploy after `subscription.active`
5. **React app** — update to read `?property=slug` param for context
6. **Auth fix** — make `?auth=` work properly