# Surf House Baja Template - Detailed Prompt

## Mission

Transform the existing surfhousebaja.com into a sellable, customizable template that can be used by any property owner to create their own direct booking website.

## Current State

The current site at surfhousebaja.com is a fully functional vacation rental booking page with:
- Property photos and description
- Amenities list
- Booking calendar
- Stripe payment integration
- Guest reviews
- Host contact info

## What We Need

### Phase 1: Preserve Current Version
- Download/save current surfhousebaja.com code
- Document the tech stack (Bolt.new, Supabase, Stripe, Hostinger)
- Create backup in projects folder

### Phase 2: Template Architecture
- Make the site data-driven (configurable via JSON or database)
- Remove hardcoded property details
- Create admin panel for property owners to:
  - Upload photos
  - Set property details (beds, baths, amenities, description)
  - Configure pricing
  - Set availability
  - View bookings

### Phase 3: Marketplace Website
- Create a landing page to sell the template
- Highlight benefits: no Airbnb fees, link from Instagram, works abroad
- Pricing tiers
- Sign-up flow

### Phase 4: Multi-tenant Infrastructure
- Supabase setup for multiple customers
- Stripe Connect for split payments (template fee + host payout)
- Email automation via Hostinger API

## Technical Considerations

- Keep using Supabase for database
- Stripe Connect for marketplace payments
- Hostinger for email sending
- Deploy via GitHub Pages or Hostinger

## Success Metrics

- Number of template customers acquired
- Revenue from template sales
- Bookings processed through template
