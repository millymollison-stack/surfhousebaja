# Supabase Database Schema

## Tables

### properties
- id (uuid)
- title (text)
- description (text)
- price_per_night (int)
- bedrooms (int)
- bathrooms (int)
- max_guests (int)
- amenities (jsonb)
- latitude/longitude (float)
- property_details (text)
- activities (text)
- local_area (text)
- getting_there (text)
- property_title (text)
- property_intro (text)

### bookings
- id (uuid)
- property_id (uuid)
- guest_name (text)
- guest_email (text)
- check_in/check_out (date)
- total_price (int)
- status (text)

### property_images
- id (uuid)
- property_id (uuid)
- url (text)
- position (int)
- is_featured (bool)
- is_main (bool)

### reviews
### blocked_dates
### profiles

## Storage Buckets
- property-images (public)

## API Details
- URL: https://jtzagpbdrqfifdisxipr.supabase.co
- Anon Key: (in .env file)
