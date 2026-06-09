# PropBook.pro Onboarding Flow — Complete Procedure

_Last updated: 2026-06-09_

## Overview

The PropBook.pro onboarding flow lets a vacation rental owner:
1. Sign up / sign in
2. Import their Airbnb listing via scraping
3. Subscribe via Stripe
4. Publish their property site to `propbook.pro/props/{slug}`

**Critical UX requirement:** Scraped data (photos, title, description) must survive the Stripe redirect and remain visible after payment completes. This required explicit sessionStorage persistence at multiple layers.

---

## Architecture Map

```
Browser (React app)
├── Home.tsx                    # Main page, property display, scrapedProperty state
│   └── OnboardingPopup.tsx     # Full onboarding wizard (signup → scrape → subscribe → publish)
│       ├── handleAirbnbScrape  # Scrapes Airbnb → setScrapedData + sessionStorage
│       ├── openStripeGateway   # Creates Stripe Checkout session
│       ├── ?paid=true handler  # Verifies payment, shows SuccessModal
│       └── handleSaveSiteInPopup → createNewSiteRecords → migrate-property → deploy-site
│
Supabase
├── Edge Function: stripe-subscription
│   ├── create_checkout_session  # Creates Stripe Checkout URL
│   ├── get_session             # Verifies payment (client-side fallback)
│   └── deploy                  # Legacy deploy handler
├── Edge Function: stripe-webhook
│   └── Handles checkout.session.completed, customer.subscription.updated
├── Table: profiles # user stripe_subscription_status
├── Table: onboarding_data      # user form state (plan, design, hosting choices)
├── Table: properties           # property records
└── Table: property_images      # image records

Stripe (test mode)
├── Checkout sessions
├── Subscriptions
└── Webhook → stripe-webhook edge function

Hostinger (propbook.pro live server)
├── React app (static files)
└── Template HTML (rendered property sites)
```

---

## Step-by-Step Flow

### Step 1: User Opens App

**URL:** `https://www.propbook.pro/` (or `http://localhost:5173/` locally)

**What happens:**
1. `Home.tsx` loads, restores `scrapedProperty` + `scrapedImages` from sessionStorage if present
2. If not logged in → shows signup modal (`Signup.tsx`)
3. If logged in → shows property page with optional `OnboardingPopup`

**SessionStorage keys used:**
- `home_scraped_property` — full scrapedProperty object (restored in Home.tsx)
- `home_scraped_images` — full scrapedImages array (restored in Home.tsx)
- `popup_scraped_data` — full scrapedData object (restored in OnboardingPopup.tsx)

---

### Step 2: User Fills Onboarding Form

**In OnboardingPopup.tsx:**

1. **Step 1 — Account:** User enters email (bookings email field)
2. **Step 2 — Design:**
   - "Auto Airbnb profile import" → user pastes Airbnb URL
   - Clicks "Get data" → `handleAirbnbScrape()` fires
3. **Step 3 — Name:** `websiteName` auto-filled from scraped title
4. **Step 4 — Hosting:** Default "Published to our server - $5 p/m"
5. **Step 5 — Subscription:** Select plan (Starter $10/mo default)
6. **Step 6 — Extras:** Optional add-ons

**handleAirbnbScrape() saves data in THREE places:**

```typescript
// 1. React state (for current session display)
setScrapedData(data);

// 2. sessionStorage (for Stripe redirect survival) — IMMEDIATE
sessionStorage.setItem('popup_scraped_data', JSON.stringify(data));

// 3. Supabase onboarding_data table (for persistence)
await saveToSupabase();
```

And via `onImported(data)` → `Home.tsx` → `handleImportedImages()`:
- Uploads images to `onboarding` bucket
- Saves to `onboarding_data` table
- Sets `scrapedProperty` in Home.tsx state → **also persisted by Home.tsx useEffect**

---

### Step 3: User Clicks Subscribe

**`openStripeGateway()` flow:**

1. Calls `saveToSupabase()` to persist form state
2. Calls edge function `stripe-subscription` with `action: create_checkout_session`
3. Edge function creates Stripe Checkout session with:
   - `customer_email` — passed to Stripe for automatic receipts
   - `metadata.user_id`, `metadata.slug`, `metadata.plan`
   - `success_url: https://www.propbook.pro/?paid=true&session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url: https://www.propbook.pro/?step=cancelled`
4. Browser redirected to Stripe hosted checkout
5. `stripe_session_id` saved to sessionStorage (survives Vite HMR)

**Edge function (create_checkout_session):**
```
POST /functions/v1/stripe-subscription
Body: { action: 'create_checkout_session', plan: 'starter', email: '...', user_id: '...', slug: '...' }
Response: { url: 'https://checkout.stripe.com/...' }
```

---

### Step 4: User Pays on Stripe

**Stripe hosted checkout page:**
- User enters card details
- Pays $10 (Starter plan)
- Stripe redirects to: `https://www.propbook.pro/?paid=true&session_id=cs_test_...`

---

### Step 5: Return Handler Fires (?paid=true)

**On page load with `?paid=true&session_id=...`:**

1. `?paid=true` useEffect in OnboardingPopup.tsx fires
2. Reads `session_id` from URL params OR sessionStorage fallback
3. Sets `stripe_payment_returning` guard (prevents double-fire)
4. Calls edge function `get_session` to verify payment:

```typescript
POST /functions/v1/stripe-subscription
Body: { action: 'get_session', session_id: 'cs_test_...', userId: '...', slug: '...' }
Response: { status: 'complete', sub_status: 'active', subscription_id: '...', customer_id: '...', amount_total: 1000 }
```

5. Updates `profiles` table: `stripe_subscription_status: 'active'`
6. Calls `refreshUser()` to update auth state
7. Dispatches `subscription-updated` event to sidebar
8. **Sets `showCongrats(true)` → SuccessModal appears**
9. Polls for `site_url` in `properties` table (for deployed site URL)

**Home.tsx also restores from sessionStorage on mount:**
- `scrapedProperty` + `scrapedImages` restored from sessionStorage
- Popup shows with all photos and data intact

---

### Step 6: User Clicks "Publish Now" (in SuccessModal)

**`handlePublish()` → `handleSaveSiteInPopup()` flow:**

1. Checks subscription is active (if not, redirects to Stripe)
2. Reads `scrapedData` from React state **OR** sessionStorage fallback
3. Calls `createNewSiteRecords()` in `siteDuplicationService.ts`:
   - Creates property record in `properties` table with `owner_id`, `slug`, `site_url`
   - Creates site record in `sites` table
   - Uploads images to `property-images` bucket
4. Calls `migrate-property` edge function:
   - Copies scraped data from source property to new property
   - Maps fields: `property_title`, `property_intro`, `location`, `max_guests`, etc.
5. Calls `deploy-site` edge function:
   - Triggers HTTP deploy to Hostinger
   - Renders template HTML with property data
   - Uploads to `propbook.pro/props/{slug}/`
6. Updates `properties.site_url` with live URL
7. User redirected to live site

---

## sessionStorage Key Reference

| Key | Where Set | Where Read | Purpose |
|-----|-----------|------------|---------|
| `popup_scraped_data` | OnboardingPopup.handleAirbnbScrape | OnboardingPopup.loadSavedData | Scraped property data |
| `home_scraped_property` | Home.tsx (useEffect) | Home.tsx (useEffect) | Property object for Home display |
| `home_scraped_images` | Home.tsx (useEffect) | Home.tsx (useEffect) | Image array for Home display |
| `popup_website_name` | handleSaveSiteInPopup, openStripeGateway | loadSavedData, ?paid handler | Website slug |
| `popup_website_desc` | handleSaveSiteInPopup | loadSavedData | Website description |
| `popup_plan` | openStripeGateway | loadSavedData | Selected plan |
| `popup_hosting` | openStripeGateway | loadSavedData | Hosting choice |
| `popup_design` | openStripeGateway | loadSavedData | Design choice |
| `stripe_session_id` | openStripeGateway | ?paid=true handler | Stripe session ID (URL fallback) |
| `stripe_payment_returning` | ?paid=true handler | ?paid=true handler | Guard against double-fire |
| `stripe_payment_done` | ?paid=true handler (polling done) | loadSavedData | Post-Stripe success flag |

---

## Edge Functions

### stripe-subscription
**File:** `supabase/functions/stripe-subscription/index.ts`

| Action | Purpose |
|--------|---------|
| `create_checkout_session` | Creates Stripe Checkout session, returns URL |
| `get_session` | Verifies Stripe session status (client-side payment confirm) |
| `deploy` | Legacy deploy handler |

**Price IDs (test mode):**
- Starter: `price_1TfPVpK5ECFjIqP3YR6XPpEG` ($10/mo)
- Pro: `price_1TfPfEK5ECFjIqP3XR3pnWBk` ($30/mo)
- Agency: `price_1TfPi0K5ECFjIqP3vq3VucLv` ($150/mo)

### stripe-webhook
**File:** `supabase/functions/stripe-webhook/index.ts`

Handles: `checkout.session.completed`, `customer.subscription.created`, `invoice.payment_succeeded`

---

## Testing the Flow

### Local Test (localhost:5173)

```bash
# 1. Start dev server
cd /Users/davidsassistant/.openclaw/workspace/projects/02-surfhousebaja-template
npm run dev

# 2. Open browser to http://localhost:5173
# 3. Sign up as test user (e.g. a22)
# 4. Complete onboarding: paste Airbnb URL → Get data
# 5. Click Subscribe → pay on Stripe
# 6. Verify: SuccessModal appears + photos restore
# 7. Click Publish Now
# 8. Verify: site appears at propbook.pro/props/{slug}
```

### Live Test (propbook.pro)

```bash
# Deploy latest code first
cd /Users/davidsassistant/.openclaw/workspace/projects/02-surfhousebaja-template
npm run build
# Upload dist/ to Hostinger via SFTP
```

---

## Known Issues & Gotchas

1. **Vite HMR clears URL params** — After Stripe redirect, Vite HMR can fire and wipe `?paid=true` URL params before the handler runs. Solution: `sessionStorage` fallback for `session_id`.

2. **Stripe webhook 401** — Webhook returns 401 even with `--no-verify-jwt`. Payment still works via `?paid=true` client-side handler. Webhook is backup.

3. **Scraped data lost on page remount** — Fixed by triple-layer sessionStorage persistence (OnboardingPopup immediate save + Home.tsx useEffect restore/save).

4. **`nohup` required for dev server** — `npm run dev &` gets killed on first browser navigation. Use `nohup npm run dev > /tmp/vite-dev.log 2>&1 &`.

5. **Stripe success_url uses `{CHECKOUT_SESSION_ID}`** — Stripe replaces this placeholder with the actual session ID in the redirect URL.

6. **`customer_email` to Stripe** — Added to ensure Stripe sends payment receipts automatically. Requires `customer_email` param in Stripe Checkout session creation.

---

## Git History (key commits)

- `bd2ca99` — HTTP-based Hostinger deploy + data bridge migration
- `2b5760f` — scrapedData null on Stripe return + owner_id on property insert
- `19d61b3` — sidebar remounting fix, Edit nav, Publish button, Website section redesign
- `ad2e116` — ?paid=true handler re-fires on URL change + guard against double-trigger
- `0669aad` — max update depth loop + migration location column + Property type
- `5c6e1fe` — clear stale sessionStorage in openStripeGateway to prevent Chrome interference
- `29a6ace` — reorder sections - dropdowns before booking calendar
- `7c52a31` — reviews section full-width breakout
